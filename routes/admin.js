const express = require('express');
const router = express.Router();
const pool = require('../db'); // <-- QUAN TRỌNG: Sử dụng kết nối từ db.js
const bcrypt = require('bcryptjs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
require('dotenv').config();

const upload = multer({ dest: 'uploads/' });

// --- API 1: LẤY DANH SÁCH TẤT CẢ NGƯỜI DÙNG ---
router.get('/users', async (req, res) => {
  try {
    const users = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.department_id, r.name AS role, d.name AS department
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY u.id`
    );
    res.json(users.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Lỗi server');
  }
});

// --- API 2: TẠO NGƯỜI DÙNG MỚI ---
router.post('/users', async (req, res) => {
  const { username, password, full_name, role_id, department_id } = req.body;
  if (!username || !password || !full_name || !role_id) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bắt buộc.' });
  }
  try {
    const userExists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại.' });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const newUser = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role_id, department_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name`,
      [username, password_hash, full_name, role_id, department_id]
    );
    res.status(201).json(newUser.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Lỗi server');
  }
});

// --- API 3: RESET MẬT KHẨU CHO NGƯỜI DÙNG ---
router.put('/users/:id/reset-password', async (req, res) => {
    const { id: userId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) {
        return res.status(400).json({ error: 'Vui lòng cung cấp mật khẩu mới.' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(newPassword, salt);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, userId]);
        res.json({ message: 'Reset mật khẩu thành công.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server');
    }
});

// --- API 4: LẤY DANH SÁCH TỔ CHUYÊN MÔN ---
router.get('/departments', async (req, res) => {
  try {
    const departments = await pool.query('SELECT * FROM departments ORDER BY name');
    res.json(departments.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Lỗi server');
  }
});

// --- API 5: CẬP NHẬT TỔ CHUYÊN MÔN ---
router.put('/departments/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Vui lòng nhập tên tổ chuyên môn.' });
    }
    try {
        const updatedDept = await pool.query(
            'UPDATE departments SET name = $1 WHERE id = $2 RETURNING *',
            [name, id]
        );
        if (updatedDept.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy tổ chuyên môn.' });
        }
        res.json(updatedDept.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server');
    }
});

// --- API 6: XÓA TỔ CHUYÊN MÔN ---
router.delete('/departments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM departments WHERE id = $1', [id]);
        res.json({ message: 'Đã xóa tổ chuyên môn thành công.' });
    } catch (err) {
        if (err.code === '23503') {
            return res.status(400).json({ error: 'Không thể xóa tổ chuyên môn này vì đang có giáo viên thuộc về nó.' });
        }
        console.error(err.message);
        res.status(500).send('Lỗi server');
    }
});

// --- API 7: XÓA NGƯỜI DÙNG ---
router.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ message: 'Đã xóa người dùng thành công.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server');
    }
});

// --- API 8: THÊM MỚI TỔ CHUYÊN MÔN ---
router.post('/departments', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Vui lòng nhập tên tổ chuyên môn.' });
    }
    try {
        const existingDept = await pool.query('SELECT id FROM departments WHERE name = $1', [name]);
        if (existingDept.rows.length > 0) {
            return res.status(400).json({ error: 'Tên tổ chuyên môn này đã tồn tại.' });
        }
        const newDept = await pool.query(
            'INSERT INTO departments (name) VALUES ($1) RETURNING *',
            [name]
        );
        res.status(201).json(newDept.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server');
    }
});
// --- API 9: SAO LƯU DỮ LIỆU (LOGICAL BACKUP) ---
// POST /api/admin/backup
router.post('/backup', async (req, res) => {
    try {
        const [users, departments, forms] = await Promise.all([
            pool.query('SELECT * FROM users'),
            pool.query('SELECT * FROM departments'),
            pool.query('SELECT * FROM borrowing_forms')
        ]);

        const backupData = {
            users: users.rows,
            departments: departments.rows,
            borrowing_forms: forms.rows,
            backup_date: new Date().toISOString()
        };

        const fileName = `backup-${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.send(JSON.stringify(backupData, null, 2));

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server khi sao lưu dữ liệu.');
    }
});


// --- API 10: KHỞI TẠO NĂM HỌC MỚI ---
// POST /api/admin/new-year
router.post('/new-year', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Bắt đầu một transaction

        // 1. Sao chép tất cả dữ liệu từ borrowing_forms sang archived_borrowing_forms
        await client.query(`
            INSERT INTO archived_borrowing_forms 
            SELECT * FROM borrowing_forms
        `);

        // 2. Xóa tất cả dữ liệu khỏi borrowing_forms
        await client.query('TRUNCATE TABLE borrowing_forms');

        await client.query('COMMIT'); // Hoàn tất transaction
        res.json({ message: 'Đã khởi tạo năm học mới thành công! Dữ liệu cũ đã được lưu trữ.' });

    } catch (err) {
        await client.query('ROLLBACK'); // Hoàn tác nếu có lỗi
        console.error(err.message);
        res.status(500).send('Lỗi server khi khởi tạo năm học mới.');
    } finally {
        client.release();
    }
});

// --- API 11: THÊM NGƯỜI DÙNG HÀNG LOẠT TỪ FILE EXCEL ---
// POST /api/admin/users/bulk-upload
router.post('/users/bulk-upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const filePath = req.file.path;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Lấy danh sách roles và departments để map tên sang ID
        const rolesRes = await client.query('SELECT id, name FROM roles');
        const deptsRes = await client.query('SELECT id, name FROM departments');
        const rolesMap = new Map(rolesRes.rows.map(r => [r.name.toLowerCase(), r.id]));
        const deptsMap = new Map(deptsRes.rows.map(d => [d.name.toLowerCase(), d.id]));

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // Lặp qua từng dòng trong file excel, bắt đầu từ dòng 2 (bỏ qua header)
        for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const username = row.getCell(1).value;
            const password = row.getCell(2).value?.toString(); // Đảm bảo mật khẩu là chuỗi
            const fullName = row.getCell(3).value;
            const roleName = row.getCell(4).value?.toLowerCase();
            const departmentName = row.getCell(5).value?.toLowerCase();

            if (!username || !password || !fullName || !roleName) {
                errorCount++;
                errors.push(`Dòng ${rowNumber}: Thiếu thông tin bắt buộc.`);
                continue;
            }
            
            const role_id = rolesMap.get(roleName);
            if (!role_id) {
                errorCount++;
                errors.push(`Dòng ${rowNumber}: Vai trò '${row.getCell(4).value}' không hợp lệ.`);
                continue;
            }

            let department_id = null;
            if (departmentName) {
                department_id = deptsMap.get(departmentName);
                if (!department_id) {
                    errorCount++;
                    errors.push(`Dòng ${rowNumber}: Tổ chuyên môn '${row.getCell(5).value}' không tồn tại.`);
                    continue;
                }
            }

            // Mã hóa mật khẩu
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            // Chèn vào database
            await client.query(
                `INSERT INTO users (username, password_hash, full_name, role_id, department_id) VALUES ($1, $2, $3, $4, $5)`,
                [username, password_hash, fullName, role_id, department_id]
            );
            successCount++;
        }

        await client.query('COMMIT');
        res.json({
            message: `Hoàn tất! Thêm thành công ${successCount} người dùng. Thất bại: ${errorCount}.`,
            errors: errors,
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        // Bắt lỗi trùng username
        if (err.code === '23505') {
            return res.status(400).json({ message: 'Lỗi: Tên đăng nhập đã tồn tại trong file hoặc trong hệ thống.', errors: [] });
        }
        res.status(500).json({ message: 'Lỗi server nghiêm trọng đã xảy ra.', errors: [] });
    } finally {
        client.release();
        // Xóa file tạm sau khi xử lý xong
        fs.unlinkSync(filePath);
    }
});
module.exports = router;
