const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

// Import các module mới
const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/forms');
const adminRoutes = require('./routes/admin'); // <-- Import
const statsRoutes = require('./routes/statistics'); // <-- Import
const exportRoutes = require('./routes/export'); // <-- Import
const dashboardRoutes = require('./routes/dashboard');
const filtersRoutes = require('./routes/filters');
const authenticateToken = require('./middleware/authenticateToken');
const authorizeRoles = require('./middleware/authorizeRoles'); // <-- Import

const app = express();
const PORT = process.env.PORT || 3001;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});
app.use(cors({
  origin: "https://quan-ly-thiet-bi-frontend.vercel.app",
  credentials: true
}));
app.use(express.json());

// Sử dụng auth routes cho các đường dẫn bắt đầu bằng /api/auth
// --- CÁC ROUTE ---
app.get('/', (req, res) => {
  res.send('Chào mừng đến với Backend API Quản lý Thiết bị!');
});
app.use('/api/auth', authRoutes);
// Route quản lý phiếu mượn (YÊU CẦU TOKEN)
// Tất cả các request đến /api/forms sẽ phải đi qua middleware authenticateToken trước
app.use('/api/forms', authenticateToken, formRoutes); // <-- Sử dụng route mới
// Route thống kê (dành cho admin, manager, leader)
app.use('/api/stats', authenticateToken, authorizeRoles('admin', 'manager', 'leader'), statsRoutes);
app.use('/api/filters', authenticateToken, authorizeRoles('admin', 'manager', 'leader'), filtersRoutes);
// Route admin (chỉ dành cho admin)
app.use('/api/admin', authenticateToken, authorizeRoles('admin', 'manager'), adminRoutes);
app.use('/api/export', authenticateToken, authorizeRoles('admin', 'manager', 'leader'), exportRoutes);
// Thêm route mới cho dashboard, tất cả vai trò đều có thể truy cập
app.use('/api/dashboard', authenticateToken, dashboardRoutes);

// Route được bảo vệ để kiểm tra
// Route export (dành cho admin, manager)
app.use('/api/export', authenticateToken, authorizeRoles('admin', 'manager'), exportRoutes); // <-- Sử dụng
// Chỉ những ai có token hợp lệ mới truy cập được route này
app.get('/api/profile', authenticateToken, (req, res) => {
  // Nhờ middleware, chúng ta có thể truy cập req.user ở đây
  res.json({
    message: `Chào mừng ${req.user.username}!`,
    userInfo: req.user
  });
});


app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
