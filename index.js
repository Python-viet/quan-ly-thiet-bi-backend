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
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    require: true,
    rejectUnauthorized: false,  // cần cho Neon/Render
  },
});
app.use(cors({
  origin: "https://quan-ly-thiet-bi-frontend.vercel.app",
  credentials: true
}));
app.use(express.json());
// --- GỠ LỖI CORS ---
// In ra giá trị biến môi trường để kiểm tra khi server khởi động
console.log(`[CORS DEBUG] FRONTEND_URL from environment: ${process.env.FRONTEND_URL}`);

// Cấu hình CORS một cách tường minh và an toàn
const corsOptions = {
    origin: process.env.FRONTEND_URL, // Chỉ chấp nhận yêu cầu từ địa chỉ này
    optionsSuccessStatus: 200 // For legacy browser support
};
app.use(cors(corsOptions));
app.use(express.json());


// --- API CÔNG KHAI TẠM THỜI ĐỂ TẠO HASH ---
app.get('/api/generate-hash/:password', async (req, res) => {
    try {
        const { password } = req.params;
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        res.send(`<h1>Hash:</h1><p>${password_hash}</p>`);
    } catch (err) {
        res.status(500).send('Lỗi khi tạo hash.');
    }
});
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
