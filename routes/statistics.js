// File: routes/statistics.js
// Chứa API để lấy dữ liệu thống kê.

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

// --- API: LẤY DỮ LIỆU THỐNG KÊ ---
// GET /api/stats?year=2025&month=8&departmentId=1&userId=1
router.get('/', async (req, res) => {
  const { year, month, departmentId, userId } = req.query;
  const { role, departmentId: userDepartmentId } = req.user;

  try {
    let query = `
        SELECT
            COUNT(bf.id) AS total_forms,
            SUM(bf.usage_count) AS total_usage,
            SUM(CASE WHEN bf.uses_it = TRUE THEN 1 ELSE 0 END) AS total_it_usage
        FROM borrowing_forms bf
        JOIN users u ON bf.user_id = u.id
        WHERE 1=1
    `;
    const params = [];

    // Áp dụng bộ lọc dựa trên query params
    if (year) {
      params.push(year);
      query += ` AND EXTRACT(YEAR FROM bf.borrow_date) = $${params.length}`;
    }
    if (month) {
      params.push(month);
      query += ` AND EXTRACT(MONTH FROM bf.borrow_date) = $${params.length}`;
    }

    // Phân quyền dữ liệu
    if (role === 'leader') {
      // Leader chỉ xem được thống kê của tổ mình
      params.push(userDepartmentId);
      query += ` AND u.department_id = $${params.length}`;
    } else if (role === 'manager' || role === 'admin') {
      // Manager/Admin có thể lọc theo tổ hoặc giáo viên bất kỳ
      if (departmentId) {
        params.push(departmentId);
        query += ` AND u.department_id = $${params.length}`;
      }
      if (userId) {
        params.push(userId);
        query += ` AND bf.user_id = $${params.length}`;
      }
    }

    const result = await pool.query(query, params);
    // Trả về kết quả, nếu không có dữ liệu thì trả về giá trị 0
    const stats = result.rows[0];
    res.json({
        total_forms: parseInt(stats.total_forms) || 0,
        total_usage: parseInt(stats.total_usage) || 0,
        total_it_usage: parseInt(stats.total_it_usage) || 0,
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Lỗi server');
  }
});

module.exports = router;