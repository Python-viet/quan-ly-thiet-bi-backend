const express = require('express');
const multer = require('multer');
const pool = require('../db');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const isJson = file.mimetype === 'application/json' || file.originalname.toLowerCase().endsWith('.json');
    callback(isJson ? null : new Error('Chỉ chấp nhận tệp sao lưu định dạng JSON.'), isJson);
  },
});

const ALLOWED_COLUMNS = {
  departments: ['id', 'name'],
  users: ['id', 'username', 'password_hash', 'full_name', 'role_id', 'department_id', 'created_at', 'updated_at'],
  borrowing_forms: [
    'id', 'user_id', 'school_year', 'week', 'borrow_date', 'return_date', 'device_name',
    'quantity', 'teaching_period', 'lesson_name', 'class_name', 'device_status',
    'usage_count', 'uses_it', 'created_at', 'updated_at',
  ],
};

function parseBackup(fileBuffer) {
  let data;
  try {
    const text = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
    data = JSON.parse(text);
  } catch (error) {
    throw new Error('Tệp JSON không hợp lệ hoặc đã bị hỏng.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Cấu trúc tệp sao lưu không hợp lệ.');
  }

  for (const key of ['users', 'departments', 'borrowing_forms']) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Tệp sao lưu thiếu danh sách "${key}".`);
    }
  }

  if (data.users.length > 10000 || data.departments.length > 1000 || data.borrowing_forms.length > 200000) {
    throw new Error('Tệp sao lưu có số lượng bản ghi vượt quá giới hạn an toàn.');
  }

  const requiredChecks = [
    ['departments', ['id', 'name']],
    ['users', ['id', 'username', 'password_hash', 'full_name', 'role_id']],
    ['borrowing_forms', ['id', 'user_id', 'school_year', 'week', 'borrow_date', 'device_name']],
  ];

  for (const [collection, fields] of requiredChecks) {
    data[collection].forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`${collection}, bản ghi ${index + 1} không hợp lệ.`);
      }
      for (const field of fields) {
        if (row[field] === undefined || row[field] === null || row[field] === '') {
          throw new Error(`${collection}, bản ghi ${index + 1} thiếu trường "${field}".`);
        }
      }
    });
  }

  return data;
}

async function getExistingColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function upsertRows(client, tableName, rows) {
  if (rows.length === 0) return;

  const existingColumns = await getExistingColumns(client, tableName);
  const allowed = ALLOWED_COLUMNS[tableName].filter((column) => existingColumns.has(column));

  for (const row of rows) {
    const columns = allowed.filter((column) => row[column] !== undefined);
    if (!columns.includes('id')) {
      throw new Error(`Bản ghi trong bảng ${tableName} thiếu id.`);
    }

    const values = columns.map((column) => row[column]);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
    const updateColumns = columns.filter((column) => column !== 'id');
    const updateClause = updateColumns.length
      ? `DO UPDATE SET ${updateColumns.map((column) => `"${column}" = EXCLUDED."${column}"`).join(', ')}`
      : 'DO NOTHING';

    await client.query(
      `INSERT INTO "${tableName}" (${quotedColumns})
       VALUES (${placeholders})
       ON CONFLICT (id) ${updateClause}`,
      values
    );
  }
}

async function resetSequence(client, tableName) {
  const sequenceResult = await client.query('SELECT pg_get_serial_sequence($1, $2) AS sequence_name', [tableName, 'id']);
  const sequenceName = sequenceResult.rows[0]?.sequence_name;
  if (!sequenceName) return;

  await client.query(
    `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM "${tableName}"), 1), (SELECT COUNT(*) > 0 FROM "${tableName}"))`,
    [sequenceName]
  );
}

router.post('/validate', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Vui lòng chọn tệp sao lưu JSON.' });
  }

  try {
    const backup = parseBackup(req.file.buffer);
    return res.json({
      valid: true,
      backupDate: backup.backup_date || null,
      summary: {
        users: backup.users.length,
        departments: backup.departments.length,
        borrowingForms: backup.borrowing_forms.length,
      },
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Vui lòng chọn tệp sao lưu JSON.' });
  }

  const client = await pool.connect();
  try {
    const backup = parseBackup(req.file.buffer);

    await client.query('BEGIN');

    const roleIds = [...new Set(backup.users.map((user) => Number(user.role_id)))];
    if (roleIds.some((id) => !Number.isInteger(id))) {
      throw new Error('Tệp sao lưu có role_id không hợp lệ.');
    }
    const rolesResult = await client.query('SELECT id FROM roles WHERE id = ANY($1::int[])', [roleIds]);
    if (rolesResult.rows.length !== roleIds.length) {
      throw new Error('Tệp sao lưu chứa vai trò không tồn tại trong hệ thống hiện tại.');
    }

    await upsertRows(client, 'departments', backup.departments);
    await upsertRows(client, 'users', backup.users);

    // Chỉ thay thế dữ liệu phiếu mượn. Không xóa tài khoản/tổ hiện có ngoài bản sao lưu
    // để tránh làm mất dữ liệu quản trị phát sinh sau thời điểm sao lưu.
    await client.query('DELETE FROM borrowing_forms');
    await upsertRows(client, 'borrowing_forms', backup.borrowing_forms);

    await resetSequence(client, 'departments');
    await resetSequence(client, 'users');
    await resetSequence(client, 'borrowing_forms');

    await client.query('COMMIT');

    return res.json({
      message: 'Khôi phục dữ liệu thành công.',
      summary: {
        users: backup.users.length,
        departments: backup.departments.length,
        borrowingForms: backup.borrowing_forms.length,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Restore error:', error);
    return res.status(400).json({ error: error.message || 'Không thể khôi phục dữ liệu.' });
  } finally {
    client.release();
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Tệp sao lưu vượt quá 10 MB.' : error.message });
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  return next();
});

module.exports = router;
