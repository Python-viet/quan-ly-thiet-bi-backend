const express = require('express');
const router = express.Router();
const pool = require('../db'); // <-- Sử dụng kết nối tập trung
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// API Endpoint: POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.query;

    if (!username || !password) {
        return res.status(400).send('Vui lòng cung cấp tên đăng nhập và mật khẩu.');
    }

    try {
        const result = await pool.query('SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng." });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng." });
        }

        const accessToken = jwt.sign(
            { 
                userId: user.id,
                username: user.username,
                role: user.role_name,
                departmentId: user.department_id,
                fullName: user.full_name // <-- SỬA LỖI: Thêm fullName vào token
            },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token: accessToken });
    } catch (err) {
        console.error("Lỗi đăng nhập:", err.message);
        res.status(500).send("Lỗi server");
    }
});

module.exports = router;
