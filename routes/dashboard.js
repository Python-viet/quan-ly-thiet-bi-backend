// File: routes/dashboard.js (Cập nhật hoàn chỉnh)
// Sửa lỗi 500 và cải thiện logic thống kê

const express = require('express');
const router = express.Router();
const pool = require('../db');
require('dotenv').config();

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
    const { id: userId, role, departmentId } = req.user;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    try {
        let stats = {};

        if (role === 'admin' || role === 'manager') {
            const [totalUsers, totalFormsMonth, totalDepts] = await Promise.all([
                pool.query('SELECT COUNT(id)::int FROM users'),
                pool.query('SELECT COUNT(id)::int FROM borrowing_forms WHERE EXTRACT(MONTH FROM borrow_date) = $1 AND EXTRACT(YEAR FROM borrow_date) = $2', [currentMonth, currentYear]),
                pool.query('SELECT COUNT(id)::int FROM departments')
            ]);
            stats = {
                stat1: { title: 'Tổng số người dùng', value: totalUsers.rows[0].count },
                stat2: { title: 'Phiếu mượn trong tháng', value: totalFormsMonth.rows[0].count },
                stat3: { title: 'Tổng số Tổ CM', value: totalDepts.rows[0].count },
            };
        } else { // Dành cho teacher và leader
            const [myFormsMonth, myOverdueForms] = await Promise.all([
                pool.query('SELECT COUNT(id)::int FROM borrowing_forms WHERE user_id = $1 AND EXTRACT(MONTH FROM borrow_date) = $2 AND EXTRACT(YEAR FROM borrow_date) = $3', [userId, currentMonth, currentYear]),
                // SỬA LỖI: Logic mới cho thiết bị quá hạn trả
                // (Mượn quá 7 ngày và chưa trả)
                pool.query(`SELECT COUNT(id)::int FROM borrowing_forms WHERE user_id = $1 AND return_date IS NULL AND borrow_date <= CURRENT_DATE - INTERVAL '7 days'`, [userId])
            ]);
             stats = {
                stat1: { title: 'Phiếu mượn của bạn (tháng này)', value: myFormsMonth.rows[0].count },
                stat2: { title: 'Thiết bị quá hạn trả', value: myOverdueForms.rows[0].count },
            };
            
            if (role === 'leader') {
                const totalFormsInDept = await pool.query('SELECT COUNT(bf.id)::int FROM borrowing_forms bf JOIN users u ON bf.user_id = u.id WHERE u.department_id = $1 AND EXTRACT(MONTH FROM bf.borrow_date) = $2 AND EXTRACT(YEAR FROM bf.borrow_date) = $3', [departmentId, currentMonth, currentYear]);
                stats.stat3 = { title: 'Phiếu mượn của tổ (tháng này)', value: totalFormsInDept.rows[0].count };
            }
        }
        res.json(stats);
    } catch (err) {
        console.error("Lỗi khi lấy dữ liệu dashboard:", err.message);
        res.status(500).send('Lỗi server khi lấy dữ liệu dashboard.');
    }
});

module.exports = router;
