// File: routes/export.js (Cập nhật hoàn chỉnh)

const express = require('express');
const router = express.Router();
const pool = require('../db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

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

        const workbook = new ExcelJS.Workbook();

        for (const month in groupedData) {
            const monthData = groupedData[month];
            const worksheet = workbook.addWorksheet(`Tháng ${month}`);
            
            // SỬA LỖI: Căn lề trang in
            worksheet.pageSetup = { 
                orientation: 'landscape', 
                paperSize: 9, // A4
                margins: {
                    left: 0.47, right: 0.33,
                    top: 0.31, bottom: 0.27,
                    header: 0.3, footer: 0.3
                }
            };

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
            
            // SỬA LỖI: Điều chỉnh độ rộng cột
            worksheet.columns = [
                { key: 'Tháng', width: 5.7 },
                { key: 'Tuần', width: 5.7 },
                { key: 'Ngày mượn', width: 11 },
                { key: 'Ngày trả', width: 11 },
                { key: 'Thiết bị mượn sử dụng', width: 25 },
                { key: 'Số lượng', width: 6 },
                { key: 'Dạy tiết', width: 8.5 },
                { key: 'Tên bài dạy', width: 25 },
                { key: 'Dạy lớp', width: 8.86 },
                { key: 'Tình trạng thiết bị', width: 13 },
                { key: 'Số lượt sử dụng', width: 7.86 },
                { key: 'Có UDCNTT', width: 8 }
            ];

            worksheet.addRow([]);
            const totalUsage = monthData.reduce((sum, row) => sum + (row.usage_count || 0), 0);
            const totalIT = monthData.filter(row => row.uses_it).length;
            worksheet.mergeCells('A' + (worksheet.rowCount + 1) + ':L' + (worksheet.rowCount + 1));
            worksheet.getCell('A' + worksheet.rowCount).value = `Tổng số lượt sử dụng đồ dùng: ${totalUsage}`;
            worksheet.mergeCells('A' + (worksheet.rowCount + 1) + ':L' + (worksheet.rowCount + 1));
            worksheet.getCell('A' + worksheet.rowCount).value = `Tổng số lượt ứng dụng CNTT: ${totalIT}`;
            worksheet.addRow([]);

            // SỬA LỖI: Tăng khoảng trống cho phần ký tên
            worksheet.addRow([]);
            const signRow = worksheet.rowCount + 1;
            worksheet.mergeCells(`B${signRow}:D${signRow}`);
            const staffSignCell = worksheet.getCell(`B${signRow}`);
            staffSignCell.value = 'Nhân viên Thiết bị';
            staffSignCell.font = { bold: true };
            staffSignCell.alignment = { horizontal: 'center' };
            worksheet.mergeCells(`B${signRow+3}:D${signRow+3}`); // Tăng khoảng cách
            worksheet.getCell(`B${signRow+5}`).value = 'Lê Thị Loan';
            worksheet.getCell(`B${signRow+5}`).alignment = { horizontal: 'center' };

            worksheet.mergeCells(`I${signRow}:L${signRow}`);
            const teacherSignCell = worksheet.getCell(`I${signRow}`);
            teacherSignCell.value = 'Giáo viên ký tên';
            teacherSignCell.font = { bold: true };
            teacherSignCell.alignment = { horizontal: 'center' };
            if (teacherName) {
                worksheet.mergeCells(`I${signRow+3}:L${signRow+3}`); // Tăng khoảng cách
                worksheet.getCell(`I${signRow+5}`).value = teacherName;
                worksheet.getCell(`I${signRow+5}`).alignment = { horizontal: 'center' };
            }
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
        const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="BaoCaoPDF_${year}.pdf"`);
        doc.pipe(res);
        const fontPath = path.join(__dirname, '../fonts/Roboto-Regular.ttf');
        doc.registerFont('Roboto', fontPath);
        doc.font('Roboto');
        let isFirstPage = true;
        for (const month in groupedData) {
            if (!isFirstPage) {
                doc.addPage({ layout: 'landscape', size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
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
            
            // SỬA LỖI: Nâng footer và phần ký tên lên cao hơn
            const footerY = doc.y + 20; // Vị trí bắt đầu của footer
            doc.fontSize(11);
            doc.text(`Tổng số lượt sử dụng đồ dùng: ${totalUsage}`, doc.page.margins.left, footerY);
            doc.text(`Tổng số lượt ứng dụng CNTT: ${totalIT}`, doc.page.margins.left, footerY + 15);
            
            const signY = footerY + 40;
            doc.font('Roboto').fontSize(11).text('Nhân viên Thiết bị', doc.page.margins.left + 50, signY, { width: 150, align: 'center' });
            doc.fontSize(10).text('(Ký, ghi rõ họ tên)', doc.page.margins.left + 50, signY + 15, { width: 150, align: 'center' });
            doc.fontSize(11).text('Lê Thị Loan', doc.page.margins.left + 50, signY + 70, { width: 150, align: 'center' });

            doc.font('Roboto').fontSize(11).text('Giáo viên ký tên', doc.page.width - doc.page.margins.right - 200, signY, { width: 150, align: 'center' });
            doc.fontSize(10).text('(Ký, ghi rõ họ tên)', doc.page.width - doc.page.margins.right - 200, signY + 15, { width: 150, align: 'center' });
            if (teacherName) {
                doc.fontSize(11).text(teacherName, doc.page.width - doc.page.margins.right - 200, signY + 70, { width: 150, align: 'center' });
            }
        }
        doc.end();
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Lỗi server khi tạo file PDF');
    }
});

// --- HELPER FUNCTION: Vẽ bảng trong PDF ---
async function drawTable(doc, table) {
    let startY = doc.y;
    const startX = doc.page.margins.left;
    const rowHeight = 30;
    const columnWidths = [30, 30, 50, 50, 120, 25, 40, 180, 55, 80, 40, 40];
    doc.font('Roboto').fontSize(8);
    let currentX = startX;
    table.headers.forEach((header, i) => {
        doc.rect(currentX, startY, columnWidths[i], rowHeight).stroke();
        doc.text(header, currentX + 2, startY + 5, { width: columnWidths[i] - 4, align: 'center' });
        currentX += columnWidths[i];
    });
    doc.y = startY + rowHeight;
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
        // SỬA LỖI: Tăng khoảng trống dự trữ cho footer
        if (doc.y + calculatedRowHeight > doc.page.height - doc.page.margins.bottom - 150) { 
            doc.addPage({ layout: 'landscape', size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
            doc.y = doc.page.margins.top;
        }
        const rowY = doc.y;
        currentX = startX;
        row.forEach((cell, i) => {
            doc.rect(currentX, rowY, columnWidths[i], calculatedRowHeight).stroke();
            doc.text(cell.toString(), currentX + 2, rowY + 5, { width: columnWidths[i] - 4, align: 'left' });
            currentX += columnWidths[i];
        });
        doc.y = rowY + calculatedRowHeight;
    });
}

module.exports = router;
