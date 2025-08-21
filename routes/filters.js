const express = require('express');
const router = express.Router();
const pool = require('../db'); // <-- QUAN TRỌNG: Sử dụng kết nối từ db.js
require('dotenv').config();

// API lấy dữ liệu bộ lọc cho admin/manager
router.get('/data', async (req, res) => {
    try {
        const [usersRes, deptsRes] = await Promise.all([
            pool.query(`SELECT id, full_name, role_id, department_id FROM users WHERE role_id IN (3, 4)`),
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

// API lấy danh sách giáo viên trong tổ của leader
router.get('/users-in-department', async (req, res) => {
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

// API lấy danh sách người dùng theo một tổ chuyên môn cụ thể
router.get('/users-by-department/:id', async (req, res) => {
    const { id: departmentId } = req.params;
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

module.exports = router;
