// File: routes/forms.js
// Phiên bản hoàn chỉnh, đã sửa lỗi và tích hợp tìm kiếm.

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// --- API 1: TẠO MỘT PHIẾU MƯỢN MỚI (CREATE) ---
router.post('/', async (req, res) => {
  const { id: userId } = req.user;
  const {
    school_year, week, borrow_date, return_date, device_name, quantity,
    teaching_period, lesson_name, class_name, device_status, usage_count, uses_it
  } = req.body;

  if (!school_year || !week || !borrow_date || !device_name) {
    return res.status(400).json({ error: 'Vui lòng điền các trường thông tin bắt buộc.' });
  }

  try {
    const newForm = await pool.query(
      `INSERT INTO borrowing_forms (user_id, school_year, week, borrow_date, return_date, device_name, quantity, teaching_period, lesson_name, class_name, device_status, usage_count, uses_it)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [userId, school_year, week, borrow_date, return_date, device_name, quantity, teaching_period, lesson_name, class_name, device_status, usage_count, uses_it]
    );
    return res.status(201).json(newForm.rows[0]);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('Lỗi server');
  }
});

// --- API 2: LẤY DANH SÁCH PHIẾU MƯỢN (READ & SEARCH) ---
router.get('/', async (req, res) => {
  const { id: userId, role, departmentId } = req.user;
  const { search } = req.query;

  try {
    let query = `
        SELECT bf.*, u.full_name
        FROM borrowing_forms bf
        JOIN users u ON bf.user_id = u.id
    `;
    const params = [];
    const whereClauses = [];

    if (role === 'teacher') {
      params.push(userId);
      whereClauses.push(`bf.user_id = $${params.length}`);
    } else if (role === 'leader') {
      params.push(departmentId);
      whereClauses.push(`u.department_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(bf.device_name ILIKE $${params.length} OR bf.lesson_name ILIKE $${params.length})`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ' ORDER BY bf.created_at DESC';

    const queryResult = await pool.query(query, params);
    return res.json(queryResult.rows);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('Lỗi server');
  }
});

// --- API 3: CẬP NHẬT MỘT PHIẾU MƯỢN (UPDATE) ---
router.put('/:id', async (req, res) => {
  const { id: formId } = req.params;
  const { id: userId, role } = req.user;
  const {
    school_year, week, borrow_date, return_date, device_name, quantity,
    teaching_period, lesson_name, class_name, device_status, usage_count, uses_it
  } = req.body;

  try {
    const formQuery = await pool.query('SELECT user_id FROM borrowing_forms WHERE id = $1', [formId]);
    if (formQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy phiếu mượn.' });
    }

    if (formQuery.rows[0].user_id !== userId && role !== 'admin') {
      return res.status(403).json({ error: 'Bạn không có quyền sửa phiếu này.' });
    }

    const updatedForm = await pool.query(
      `UPDATE borrowing_forms
       SET school_year = $1, week = $2, borrow_date = $3, return_date = $4, device_name = $5, quantity = $6,
           teaching_period = $7, lesson_name = $8, class_name = $9, device_status = $10, usage_count = $11, uses_it = $12, updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [school_year, week, borrow_date, return_date, device_name, quantity, teaching_period, lesson_name, class_name, device_status, usage_count, uses_it, formId]
    );

    return res.json(updatedForm.rows[0]);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('Lỗi server');
  }
});

// --- API 4: XÓA MỘT PHIẾU MƯỢN (DELETE) ---
router.delete('/:id', async (req, res) => {
    const { id: formId } = req.params;
    const { id: userId, role } = req.user;

    try {
        const formQuery = await pool.query('SELECT user_id FROM borrowing_forms WHERE id = $1', [formId]);
        if (formQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy phiếu mượn.' });
        }

        if (formQuery.rows[0].user_id !== userId && role !== 'admin') {
            return res.status(403).json({ error: 'Bạn không có quyền xóa phiếu này.' });
        }

        await pool.query('DELETE FROM borrowing_forms WHERE id = $1', [formId]);
        return res.json({ message: 'Đã xóa phiếu mượn thành công.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Lỗi server');
    }
});

module.exports = router;
