const { Pool } = require('pg');
require('dotenv').config();

// Sử dụng một chuỗi kết nối duy nhất từ biến môi trường
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Bắt buộc cho kết nối đến Neon/Render
    }
});

module.exports = pool;
