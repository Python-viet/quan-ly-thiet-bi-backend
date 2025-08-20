// File: middleware/authenticateToken.js
// File này chứa middleware để xác thực token

const jwt = require('jsonwebtoken');
require('dotenv').config();

function authenticateToken(req, res, next) {
  // Lấy token từ header 'Authorization'
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) {
    return res.sendStatus(401); // Unauthorized - Không có token
  }

  // Xác thực token
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      return res.sendStatus(403); // Forbidden - Token không hợp lệ
    }
    // Lưu thông tin người dùng từ payload vào request để các route sau có thể sử dụng
    req.user = payload.user;
    next(); // Chuyển sang xử lý tiếp theo
  });
}

module.exports = authenticateToken;