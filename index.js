const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import các module route
const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/forms');
const adminRoutes = require('./routes/admin');
const statsRoutes = require('./routes/statistics');
const exportRoutes = require('./routes/export');
const dashboardRoutes = require('./routes/dashboard');
const filtersRoutes = require('./routes/filters');

// Import các middleware
const authenticateToken = require('./middleware/authenticateToken');
const authorizeRoles = require('./middleware/authorizeRoles');

const app = express();
const PORT = process.env.PORT || 3001;

// Cấu hình CORS để chỉ chấp nhận yêu cầu từ frontend của bạn
const corsOptions = {
    origin: process.env.FRONTEND_URL,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// --- CÁC ROUTE CỦA ỨNG DỤNG ---
app.get('/', (req, res) => {
  res.send('Chào mừng đến với Backend API Quản lý Thiết bị!');
});

app.use('/api/auth', authRoutes);
app.use('/api/forms', authenticateToken, formRoutes);
app.use('/api/stats', authenticateToken, authorizeRoles('admin', 'manager', 'leader'), statsRoutes);
app.use('/api/admin', authenticateToken, authorizeRoles('admin', 'manager'), adminRoutes);
app.use('/api/export', authenticateToken, authorizeRoles('admin', 'manager', 'leader'), exportRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/filters', authenticateToken, authorizeRoles('admin', 'manager', 'leader'), filtersRoutes);

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
