// Cung cấp dữ liệu cho các bộ lọc ở frontend

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

router.get('/data', async (req, res) => {
    try {
        const [usersRes, deptsRes] = await Promise.all([
            pool.query(`SELECT id, full_name, role_id FROM users WHERE role_id IN (3, 4)`), // Chỉ lấy leader và teacher
            pool.query('SELECT id, name FROM departments ORDER BY name')
        ]);
        res.json({
            users: usersRes.rows,
            departments: deptsRes.rows
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Lỗi server khi lấy dữ liệu bộ lọc');
    }
});
// --- API MỚI: LẤY DANH SÁCH GIÁO VIÊN TRONG TỔ CỦA LEADER ---
router.get('/users-in-department', async (req, res) => {
    // Lấy departmentId từ token của leader đã được giải mã
    const { departmentId } = req.user;

    if (!departmentId) {
        return res.status(400).json({ error: 'Tài khoản của bạn không thuộc tổ chuyên môn nào.' });
    }

    try {
        const users = await pool.query(
            `SELECT id, full_name FROM users WHERE department_id = $1`,
            [departmentId]
        );
        res.json(users.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Lỗi server khi lấy danh sách giáo viên.');
    }
});
// --- API MỚI: LẤY DANH SÁCH NGƯỜI DÙNG THEO MỘT TỔ CHUYÊN MÔN CỤ THỂ ---
// GET /api/filters/users-by-department/:id
router.get('/users-by-department/:id', async (req, res) => {
    // Lấy departmentId từ URL
    const { id: departmentId } = req.params;

    try {
        // Truy vấn tất cả người dùng thuộc tổ chuyên môn được chỉ định
        const users = await pool.query(
            `SELECT id, full_name FROM users WHERE department_id = $1`,
            [departmentId]
        );
        res.json(users.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Lỗi server khi lấy danh sách giáo viên.');
    }
});

module.exports = router;