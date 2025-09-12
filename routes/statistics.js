const express = require('express');
const router = express.Router();
const pool = require('../db'); // <-- QUAN TRỌNG: Sử dụng kết nối từ db.js
require('dotenv').config();

// API lấy dữ liệu thống kê
router.get('/', async (req, res) => {
  // Lấy thêm userId từ token
  const { year, month, departmentId, userId: queryUserId } = req.query; // Đổi tên userId từ query để tránh trùng lặp
  const { role, departmentId: userDepartmentId, id: currentUserId } = req.user; // Lấy id của user đang đăng nhập

  try {
    let query = `
        SELECT
            COUNT(bf.id)::int AS total_forms,
            SUM(bf.usage_count)::int AS total_usage,
            SUM(CASE WHEN bf.uses_it = TRUE THEN 1 ELSE 0 END)::int AS total_it_usage
        FROM borrowing_forms bf
        JOIN users u ON bf.user_id = u.id
        WHERE 1=1
    `;
    const params = [];

    if (year) {
      params.push(year);
      query += ` AND EXTRACT(YEAR FROM bf.borrow_date) = $${params.length}`;
    }
    if (month) {
      params.push(month);
      query += ` AND EXTRACT(MONTH FROM bf.borrow_date) = $${params.length}`;
    }

    // --- BỔ SUNG LOGIC CHO GIÁO VIÊN ---
    if (role === 'teacher') {
      // Bắt buộc lọc theo ID của giáo viên đang đăng nhập
      params.push(currentUserId);
      query += ` AND bf.user_id = $${params.length}`;
    }
    // --- KẾT THÚC BỔ SUNG ---
    else if (role === 'leader') {
      params.push(userDepartmentId);
      query += ` AND u.department_id = $${params.length}`;
      if (queryUserId) { // Leader có thể lọc theo giáo viên trong tổ
        params.push(queryUserId);
        query += ` AND bf.user_id = $${params.length}`;
      }
    } else if (role === 'manager' || role === 'admin') {
      if (departmentId) {
        params.push(departmentId);
        query += ` AND u.department_id = $${params.length}`;
      }
      if (queryUserId) {
        params.push(queryUserId);
        query += ` AND bf.user_id = $${params.length}`;
      }
    }

    const result = await pool.query(query, params);
    const stats = result.rows[0];
    res.json({
        total_forms: stats.total_forms || 0,
        total_usage: stats.total_usage || 0,
        total_it_usage: stats.total_it_usage || 0,
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Lỗi server');
  }
});

module.exports = router;
