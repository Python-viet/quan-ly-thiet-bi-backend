// Cung cấp dữ liệu thống kê cho trang chủ

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

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
    const { id: userId, role, departmentId } = req.user;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    try {
        let stats = {};

        if (role === 'admin' || role === 'manager') {
            const [totalUsers, totalFormsMonth, totalDepts] = await Promise.all([
                pool.query('SELECT COUNT(id) FROM users'),
                pool.query('SELECT COUNT(id) FROM borrowing_forms WHERE EXTRACT(MONTH FROM borrow_date) = $1 AND EXTRACT(YEAR FROM borrow_date) = $2', [currentMonth, currentYear]),
                pool.query('SELECT COUNT(id) FROM departments')
            ]);
            stats = {
                stat1: { title: 'Tổng số người dùng', value: totalUsers.rows[0].count },
                stat2: { title: 'Phiếu mượn trong tháng', value: totalFormsMonth.rows[0].count },
                stat3: { title: 'Tổng số Tổ CM', value: totalDepts.rows[0].count },
            };
        } else { // Dành cho teacher và leader
            const [myFormsMonth, myOverdueForms] = await Promise.all([
                pool.query('SELECT COUNT(id) FROM borrowing_forms WHERE user_id = $1 AND EXTRACT(MONTH FROM borrow_date) = $2 AND EXTRACT(YEAR FROM borrow_date) = $3', [userId, currentMonth, currentYear]),
                pool.query('SELECT COUNT(id) FROM borrowing_forms WHERE user_id = $1 AND return_date < CURRENT_DATE AND return_date IS NOT NULL', [userId])
            ]);
             stats = {
                stat1: { title: 'Phiếu mượn của bạn (tháng này)', value: myFormsMonth.rows[0].count },
                stat2: { title: 'Thiết bị quá hạn trả', value: myOverdueForms.rows[0].count },
            };
            // Thêm thống kê cho leader
            if (role === 'leader') {
                const totalFormsInDept = await pool.query('SELECT COUNT(bf.id) FROM borrowing_forms bf JOIN users u ON bf.user_id = u.id WHERE u.department_id = $1 AND EXTRACT(MONTH FROM bf.borrow_date) = $2 AND EXTRACT(YEAR FROM bf.borrow_date) = $3', [departmentId, currentMonth, currentYear]);
                stats.stat3 = { title: 'Phiếu mượn của tổ (tháng này)', value: totalFormsInDept.rows[0].count };
            }
        }
        res.json(stats);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server khi lấy dữ liệu dashboard.');
    }
});

module.exports = router;