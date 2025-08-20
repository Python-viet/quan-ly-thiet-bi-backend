// File: middleware/authorizeRoles.js
// Middleware này kiểm tra xem vai trò của người dùng có nằm trong danh sách được phép hay không.
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
    }
    next();
  };
};

module.exports = authorizeRoles;