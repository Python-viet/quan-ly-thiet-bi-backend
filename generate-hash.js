// File: generate-hash.js
// Chạy file này bằng lệnh: node generate-hash.js

const bcrypt = require('bcryptjs');

// Mật khẩu bạn muốn mã hóa
const plainPassword = 'adminpass';

// Số vòng lặp mã hóa (salt rounds), 10 là giá trị phổ biến và an toàn
const saltRounds = 10;

bcrypt.hash(plainPassword, saltRounds, function(err, hash) {
    if (err) {
        console.error("Lỗi khi mã hóa mật khẩu:", err);
        return;
    }

    console.log("Mật khẩu gốc:", plainPassword);
    console.log("Chuỗi hash đã mã hóa (sao chép chuỗi này):");
    console.log(hash);
});
