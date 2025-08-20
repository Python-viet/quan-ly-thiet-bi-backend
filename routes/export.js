// File: routes/export.js
// Chứa các API để xuất dữ liệu ra file báo cáo chuyên nghiệp.
// *** PHIÊN BẢN SỬA LỖI HIỂN THỊ PDF ***

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs'); // Import module 'fs' để kiểm tra file
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// --- HELPER FUNCTION: Lấy dữ liệu và nhóm theo tháng ---
async function getGroupedData(year, departmentId, userId) {
    let query = `
        SELECT 
            bf.*,
            u.full_name
        FROM borrowing_forms bf
        JOIN users u ON bf.user_id = u.id
        WHERE EXTRACT(YEAR FROM bf.return_date) = $1
    `;
    const params = [year];

    if (departmentId) {
        params.push(departmentId);
        query += ` AND u.department_id = $${params.length}`;
    }
    if (userId) {
        params.push(userId);
        query += ` AND bf.user_id = $${params.length}`;
    }
    query += ' ORDER BY bf.return_date, bf.week';

    const { rows } = await pool.query(query, params);
    
    const groupedByMonth = rows.reduce((acc, row) => {
        if (row.return_date) {
            const month = new Date(row.return_date).getMonth() + 1;
            if (!acc[month]) {
                acc[month] = [];
            }
            acc[month].push(row);
        }
        return acc;
    }, {});

    return groupedByMonth;
}


// --- API 1: XUẤT FILE EXCEL ---
router.get('/excel', async (req, res) => {
    const { year, departmentId, userId } = req.query;
    if (!year || !departmentId) {
        return res.status(400).json({ error: 'Vui lòng cung cấp năm và tổ chuyên môn.' });
    }

    try {
        const groupedData = await getGroupedData(year, departmentId, userId);
        const departmentQuery = await pool.query('SELECT name FROM departments WHERE id = $1', [departmentId]);
        const departmentName = departmentQuery.rows[0]?.name || '';
        let teacherName = '';
        if (userId) {
            const userQuery = await pool.query('SELECT full_name FROM users WHERE id = $1', [userId]);
            teacherName = userQuery.rows[0]?.full_name || '';
        }

        if (Object.keys(groupedData).length === 0) {
            return res.status(404).send('Không tìm thấy dữ liệu phù hợp để xuất Excel.');
        }

        const workbook = new ExcelJS.Workbook();

        for (const month in groupedData) {
            const monthData = groupedData[month];
            const worksheet = workbook.addWorksheet(`Tháng ${month}`);
            worksheet.pageSetup = { orientation: 'landscape', paperSize: 9 };
            worksheet.mergeCells('A1:L1');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = `BÁO CÁO SỬ DỤNG ĐỒ DÙNG DẠY HỌC: ${departmentName.toUpperCase()}`;
            titleCell.font = { size: 16, bold: true };
            titleCell.alignment = { horizontal: 'center' };
            if (teacherName) {
                worksheet.mergeCells('A2:L2');
                const teacherCell = worksheet.getCell('A2');
                teacherCell.value = `Giáo viên: ${teacherName}`;
                teacherCell.font = { size: 12, italic: true };
                teacherCell.alignment = { horizontal: 'center' };
            }
            worksheet.addRow([]);
            const headers = ['Tháng', 'Tuần', 'Ngày mượn', 'Ngày trả', 'Thiết bị mượn sử dụng', 'Số lượng', 'Dạy tiết', 'Tên bài dạy', 'Dạy lớp', 'Tình trạng thiết bị', 'Số lượt sử dụng', 'Có UDCNTT'];
            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell((cell) => {
                cell.font = { bold: true };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            monthData.forEach(row => {
                const rowData = [ month, row.week, new Date(row.borrow_date).toLocaleDateString('vi-VN'), new Date(row.return_date).toLocaleDateString('vi-VN'), row.device_name, row.quantity, row.teaching_period, row.lesson_name, row.class_name, row.device_status, row.usage_count, row.uses_it ? 'Có' : 'Không' ];
                const addedRow = worksheet.addRow(rowData);
                addedRow.eachCell({ includeEmpty: true }, (cell) => {
                    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                });
            });
            worksheet.columns.forEach((column, i) => {
                const lengths = column.values.map(v => v.toString().length);
                const maxLength = Math.max(...lengths.filter(v => typeof v === 'number'));
                column.width = [5, 5, 12, 12, 25, 8, 8, 30, 10, 15, 8, 8][i] || 10;
            });
            worksheet.addRow([]);
            const totalUsage = monthData.reduce((sum, row) => sum + (row.usage_count || 0), 0);
            const totalIT = monthData.filter(row => row.uses_it).length;
            worksheet.mergeCells('A' + (worksheet.rowCount + 1) + ':L' + (worksheet.rowCount + 1));
            worksheet.getCell('A' + worksheet.rowCount).value = `Tổng số lượt sử dụng đồ dùng: ${totalUsage}`;
            worksheet.mergeCells('A' + (worksheet.rowCount + 1) + ':L' + (worksheet.rowCount + 1));
            worksheet.getCell('A' + worksheet.rowCount).value = `Tổng số lượt ứng dụng CNTT: ${totalIT}`;
            worksheet.addRow([]);
            worksheet.mergeCells('I' + (worksheet.rowCount + 1) + ':L' + (worksheet.rowCount + 1));
            const signCell = worksheet.getCell('I' + worksheet.rowCount);
            signCell.value = 'Giáo viên ký tên';
            signCell.alignment = { horizontal: 'center' };
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="BaoCao_${year}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server khi tạo file Excel');
    }
});


// --- API 2: XUẤT FILE PDF ---
router.get('/pdf', async (req, res) => {
    const { year, departmentId, userId } = req.query;
    if (!year || !departmentId) {
        return res.status(400).json({ error: 'Vui lòng cung cấp năm và tổ chuyên môn.' });
    }

    try {
        const groupedData = await getGroupedData(year, departmentId, userId);
        const departmentQuery = await pool.query('SELECT name FROM departments WHERE id = $1', [departmentId]);
        const departmentName = departmentQuery.rows[0]?.name || '';
        let teacherName = '';
        if (userId) {
            const userQuery = await pool.query('SELECT full_name FROM users WHERE id = $1', [userId]);
            teacherName = userQuery.rows[0]?.full_name || '';
        }

        if (Object.keys(groupedData).length === 0) {
            return res.status(404).send('Không tìm thấy dữ liệu phù hợp để xuất PDF.');
        }

        const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="BaoCaoPDF_${year}.pdf"`);
        doc.pipe(res);

        const fontPath = path.join(__dirname, '../fonts/Roboto-Regular.ttf');
        if (fs.existsSync(fontPath)) {
            doc.registerFont('Roboto', fontPath);
            doc.font('Roboto');
        } else {
            console.error('!!! FONT NOT FOUND !!! at path:', fontPath);
            doc.font('Helvetica'); 
        }

        let isFirstPage = true;
        for (const month in groupedData) {
            if (!isFirstPage) {
                doc.addPage({ layout: 'landscape', size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
            }
            isFirstPage = false;
            const monthData = groupedData[month];
            doc.fontSize(16).text(`BÁO CÁO SỬ DỤNG ĐỒ DÙNG DẠY HỌC: ${departmentName.toUpperCase()}`, { align: 'center' });
            if (teacherName) {
                doc.fontSize(12).text(`Giáo viên: ${teacherName}`, { align: 'center' });
            }
            doc.moveDown(2);
            const table = {
                headers: ['Tháng', 'Tuần', 'Ngày mượn', 'Ngày trả', 'Thiết bị', 'SL', 'Tiết', 'Tên bài dạy', 'Lớp', 'Tình trạng', 'Lượt SD', 'UDCNTT'],
                rows: monthData.map(row => [ month, row.week, new Date(row.borrow_date).toLocaleDateString('vi-VN'), new Date(row.return_date).toLocaleDateString('vi-VN'), row.device_name, row.quantity, row.teaching_period, row.lesson_name, row.class_name, row.device_status, row.usage_count, row.uses_it ? 'Có' : 'Không' ]),
            };
            await drawTable(doc, table);
            const totalUsage = monthData.reduce((sum, row) => sum + (row.usage_count || 0), 0);
            const totalIT = monthData.filter(row => row.uses_it).length;
            const pageHeight = doc.page.height;
            const bottomMargin = 70;
            doc.fontSize(10);
            doc.text(`Tổng số lượt sử dụng đồ dùng: ${totalUsage}`, doc.page.margins.left, pageHeight - bottomMargin - 40);
            doc.text(`Tổng số lượt ứng dụng CNTT: ${totalIT}`, doc.page.margins.left, pageHeight - bottomMargin - 25);
            doc.text('Giáo viên ký tên', doc.page.width - doc.page.margins.right - 150, pageHeight - bottomMargin - 40, { width: 150, align: 'center' });
        }
        doc.end();
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server khi tạo file PDF');
    }
});

// --- HELPER FUNCTION: Vẽ bảng trong PDF (ĐÃ SỬA LỖI) ---
async function drawTable(doc, table) {
    let startY = doc.y;
    const startX = doc.page.margins.left;
    const rowHeight = 30;
    const columnWidths = [30, 30, 55, 55, 100, 25, 40, 130, 50, 80, 40, 45];
    doc.font('Roboto').fontSize(8);

    // Draw headers
    let currentX = startX;
    table.headers.forEach((header, i) => {
        doc.rect(currentX, startY, columnWidths[i], rowHeight).stroke();
        doc.text(header, currentX + 2, startY + 5, { width: columnWidths[i] - 4, align: 'center' });
        currentX += columnWidths[i];
    });
    doc.y = startY + rowHeight; // Cập nhật vị trí Y sau khi vẽ xong header

    // Draw rows
    table.rows.forEach(row => {
        const initialY = doc.y;
        let maxRowHeight = 0;

        row.forEach((cell, i) => {
            const cellHeight = doc.heightOfString(cell.toString(), { width: columnWidths[i] - 4 });
            if (cellHeight > maxRowHeight) {
                maxRowHeight = cellHeight;
            }
        });
        const calculatedRowHeight = Math.max(rowHeight, maxRowHeight + 10);

        if (doc.y + calculatedRowHeight > doc.page.height - doc.page.margins.bottom - 50) {
            doc.addPage({ layout: 'landscape', size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
            doc.y = doc.page.margins.top;
        }
        
        // SỬA LỖI: Lưu lại vị trí Y của dòng hiện tại
        const rowY = doc.y;
        currentX = startX;

        // Vẽ các ô và text trên cùng một hàng Y
        row.forEach((cell, i) => {
            doc.rect(currentX, rowY, columnWidths[i], calculatedRowHeight).stroke();
            doc.text(cell.toString(), currentX + 2, rowY + 5, { width: columnWidths[i] - 4, align: 'left' });
            currentX += columnWidths[i];
        });

        // Cập nhật vị trí Y cho dòng tiếp theo
        doc.y = rowY + calculatedRowHeight;
    });
}

module.exports = router;
