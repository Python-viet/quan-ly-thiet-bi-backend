// File: routes/auth.js
// File này sẽ chứa tất cả các route liên quan đến xác thực.

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Cấu hình kết nối DB (tương tự index.js)
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// API Endpoint: POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Kiểm tra xem username và password có được cung cấp không
  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
  }

  try {
    // 1. Tìm người dùng trong database
    const userQuery = await pool.query('SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = $1', [username]);

    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    const user = userQuery.rows[0];

    // 2. So sánh mật khẩu đã nhập với mật khẩu đã mã hóa trong DB
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    // 3. Nếu mật khẩu khớp, tạo JWT
    const payload = {
      user: {
        id: user.id,
        username: user.username,
        role: user.role_name,
        departmentId: user.department_id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET, // Chuỗi bí mật để ký token
      { expiresIn: '8h' }, // Token sẽ hết hạn sau 8 giờ
      (err, token) => {
        if (err) throw err;
        res.json({ token }); // Trả token về cho client
      }
    );

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Lỗi server');
  }
});

module.exports = router;