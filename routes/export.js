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
    const { year, departmentId, userId: queryUserId } = req.query;
    const { role, id: currentUserId } = req.user;

    // Nếu là giáo viên, bỏ qua userId từ query và dùng ID từ token
    const finalUserId = (role === 'teacher') ? currentUserId : queryUserId;
    
    // Yêu cầu departmentId chỉ khi không phải là giáo viên
    if (!year || (!departmentId && role !== 'teacher')) {
        return res.status(400).json({ error: 'Vui lòng cung cấp đủ thông tin.' });
    }

    try {
        const groupedData = await getGroupedData(year, departmentId, finalUserId);
        const departmentQuery = await pool.query('SELECT name FROM departments WHERE id = $1', [departmentId]);
        const departmentName = departmentQuery.rows[0]?.name || '';
        let teacherName = '';
        if (finalUserId) {
            const userQuery = await pool.query('SELECT full_name FROM users WHERE id = $1', [finalUserId]);
            teacherName = userQuery.rows[0]?.full_name || '';
        }

        const workbook = new ExcelJS.Workbook();

        for (const month in groupedData) {
            const monthData = groupedData[month];
            const worksheet = workbook.addWorksheet(`Tháng ${month}`);
            
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
            worksheet.addRow([]);
            const signRow = worksheet.rowCount + 1;
            worksheet.mergeCells(`B${signRow}:D${signRow}`);
            const staffSignCell = worksheet.getCell(`B${signRow}`);
            staffSignCell.value = 'Nhân viên Thiết bị';
            staffSignCell.font = { bold: true };
            staffSignCell.alignment = { horizontal: 'center' };
            worksheet.mergeCells(`B${signRow+5}:D${signRow+5}`);
            worksheet.getCell(`B${signRow+5}`).value = 'Lê Thị Loan';
            worksheet.getCell(`B${signRow+5}`).alignment = { horizontal: 'center' };
            worksheet.mergeCells(`I${signRow}:L${signRow}`);
            const teacherSignCell = worksheet.getCell(`I${signRow}`);
            teacherSignCell.value = 'Giáo viên ký tên';
            teacherSignCell.font = { bold: true };
            teacherSignCell.alignment = { horizontal: 'center' };
            if (teacherName) {
                worksheet.mergeCells(`I${signRow+5}:L${signRow+5}`);
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
    const { year, month, departmentId, userId: queryUserId } = req.query;
    const { role, id: currentUserId } = req.user;

    const finalUserId = (role === 'teacher') ? currentUserId : queryUserId;

    if (!year || !month || (!departmentId && role !== 'teacher')) {
        return res.status(400).json({ error: 'Vui lòng cung cấp đủ thông tin.' });
    }

    try {
        const groupedData = await getGroupedData(year, departmentId, finalUserId);
        const departmentQuery = await pool.query('SELECT name FROM departments WHERE id = $1', [departmentId]);
        const departmentName = departmentQuery.rows[0]?.name || '';
        let teacherName = '';

        if (finalUserId) {
            const userQuery = await pool.query('SELECT full_name FROM users WHERE id = $1', [finalUserId]);
            teacherName = userQuery.rows[0]?.full_name || '';
        }

        const selectedMonth = parseInt(month, 10);
        const monthData = groupedData[selectedMonth];

        if (!monthData || monthData.length === 0) {
            return res.status(404).send('Không có dữ liệu cho tháng đã chọn để xuất file PDF.');
        }

        const pageOptions = {
            layout: 'landscape',
            size: 'A4',
            margins: { top: 30, bottom: 28, left: 30, right: 30 }
        };
        const doc = new PDFDocument(pageOptions);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="BaoCaoPDF_${month}-${year}.pdf"`);
        doc.pipe(res);

        const fontPath = path.join(__dirname, '../fonts/Roboto-Regular.ttf');
        doc.registerFont('Roboto', fontPath);
        doc.font('Roboto');

        doc.fontSize(15).text(
            `BÁO CÁO SỬ DỤNG ĐỒ DÙNG DẠY HỌC: ${departmentName.toUpperCase()}`,
            { align: 'center' }
        );
        if (teacherName) {
            doc.moveDown(0.25);
            doc.fontSize(11).text(`Giáo viên: ${teacherName}`, { align: 'center' });
        }
        doc.moveDown(0.8);

        const table = {
            headers: ['Tháng', 'Tuần', 'Ngày mượn', 'Ngày trả', 'Thiết bị', 'SL', 'Tiết', 'Tên bài dạy', 'Lớp', 'Tình trạng', 'Lượt SD', 'UDCNTT'],
            rows: monthData.map(row => [
                selectedMonth,
                row.week,
                new Date(row.borrow_date).toLocaleDateString('vi-VN'),
                new Date(row.return_date).toLocaleDateString('vi-VN'),
                row.device_name,
                row.quantity,
                row.teaching_period,
                row.lesson_name,
                row.class_name,
                row.device_status,
                row.usage_count,
                row.uses_it ? 'Có' : 'Không'
            ])
        };

        const tableEndY = drawTable(doc, table, pageOptions);

        const totalUsage = monthData.reduce((sum, row) => sum + (Number(row.usage_count) || 0), 0);
        const totalIT = monthData.filter(row => row.uses_it).length;
        drawReportFooter(doc, {
            startY: tableEndY + 8,
            totalUsage,
            totalIT,
            teacherName,
            pageOptions
        });

        doc.end();
    } catch (err) {
        console.error(err.message);
        if (!res.headersSent) {
            res.status(500).send('Lỗi server khi tạo file PDF');
        } else {
            res.end();
        }
    }
});

// --- HELPER FUNCTION: Vẽ bảng trong PDF ---
function drawTable(doc, table, pageOptions) {
    const startX = doc.page.margins.left;
    const minimumRowHeight = 26;
    const headerHeight = 28;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Khóa các cột ngắn ở mức vừa đủ và dành toàn bộ chiều rộng còn lại
    // cho cột "Tên bài dạy". Tổng chiều rộng luôn đúng bằng vùng in A4 ngang.
    const columnWidths = [30, 30, 52, 52, 123, 25, 40, 0, 52, 74, 42, 34];
    const fixedColumnsWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    columnWidths[7] = contentWidth - fixedColumnsWidth;

    const drawTextInCell = ({ text, x, y, width, height, align = 'left', fontSize = 7.5, paddingX = 3, lineGap = 1 }) => {
        const safeText = String(text ?? '');
        const textWidth = width - (paddingX * 2);

        doc.font('Roboto').fontSize(fontSize);
        const textHeight = doc.heightOfString(safeText, {
            width: textWidth,
            align,
            lineGap
        });

        // Căn giữa theo chiều dọc; với nội dung quá dài thì giữ khoảng đệm tối thiểu phía trên.
        const textY = y + Math.max(3, (height - textHeight) / 2);
        doc.text(safeText, x + paddingX, textY, {
            width: textWidth,
            height: Math.max(1, height - 6),
            align,
            lineGap,
            ellipsis: false
        });
    };

    const drawHeader = () => {
        const headerY = doc.y;
        let currentX = startX;

        table.headers.forEach((header, index) => {
            const width = columnWidths[index];
            doc.lineWidth(0.6).rect(currentX, headerY, width, headerHeight).stroke();
            drawTextInCell({
                text: header,
                x: currentX,
                y: headerY,
                width,
                height: headerHeight,
                align: 'center',
                fontSize: 7.5,
                paddingX: 2
            });
            currentX += width;
        });

        doc.y = headerY + headerHeight;
    };

    drawHeader();

    table.rows.forEach(row => {
        doc.font('Roboto').fontSize(7.5);
        const cellHeights = row.map((cell, index) => {
            const align = [0, 1, 5, 6, 8, 10, 11].includes(index) ? 'center' : 'left';
            return doc.heightOfString(String(cell ?? ''), {
                width: columnWidths[index] - 6,
                align,
                lineGap: 1
            });
        });
        const calculatedRowHeight = Math.max(minimumRowHeight, Math.max(...cellHeights) + 8);
        // Không giữ sẵn vùng ký tên trên các trang giữa. Bảng được sử dụng hết
        // vùng in; phần cuối báo cáo sẽ tự sang trang nếu thực sự không đủ chỗ.
        const pageLimit = doc.page.height - doc.page.margins.bottom;

        if (doc.y + calculatedRowHeight > pageLimit) {
            doc.addPage(pageOptions);
            doc.y = doc.page.margins.top;
            drawHeader();
        }

        const rowY = doc.y;
        let currentX = startX;

        row.forEach((cell, index) => {
            const width = columnWidths[index];
            const align = [0, 1, 5, 6, 8, 10, 11].includes(index) ? 'center' : 'left';
            doc.lineWidth(0.45).rect(currentX, rowY, width, calculatedRowHeight).stroke();
            drawTextInCell({
                text: cell,
                x: currentX,
                y: rowY,
                width,
                height: calculatedRowHeight,
                align,
                fontSize: 7.5,
                paddingX: 3
            });
            currentX += width;
        });

        doc.y = rowY + calculatedRowHeight;
    });

    return doc.y;
}

// --- HELPER FUNCTION: Vẽ phần tổng hợp và ký tên ngoài bảng ---
function drawReportFooter(doc, { startY, totalUsage, totalIT, teacherName, pageOptions }) {
    const footerHeight = teacherName ? 94 : 80;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    // Nếu trang hiện tại không đủ chỗ, chuyển toàn bộ phần cuối báo cáo sang trang mới;
    // tuyệt đối không để chữ ký chen vào hàng cuối của bảng.
    if (startY + footerHeight > bottomLimit) {
        doc.addPage(pageOptions);
        startY = doc.page.margins.top;
    }

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const signatureWidth = 180;
    const leftSignatureX = left + 28;
    const rightSignatureX = right - signatureWidth - 28;

    doc.font('Roboto').fontSize(9.5);
    doc.text(`Tổng số lượt sử dụng đồ dùng: ${totalUsage}`, left, startY, { lineBreak: false });
    doc.text(`Tổng số lượt ứng dụng CNTT: ${totalIT}`, left + 250, startY, { lineBreak: false });

    const signatureY = startY + 18;
    doc.fontSize(10.5).text('Nhân viên Thiết bị', leftSignatureX, signatureY, {
        width: signatureWidth,
        align: 'center'
    });
    doc.fontSize(8.5).text('(Ký, ghi rõ họ tên)', leftSignatureX, signatureY + 14, {
        width: signatureWidth,
        align: 'center'
    });
    doc.fontSize(10).text('Lê Thị Loan', leftSignatureX, signatureY + 52, {
        width: signatureWidth,
        align: 'center'
    });

    doc.fontSize(10.5).text('Giáo viên ký tên', rightSignatureX, signatureY, {
        width: signatureWidth,
        align: 'center'
    });
    doc.fontSize(8.5).text('(Ký, ghi rõ họ tên)', rightSignatureX, signatureY + 14, {
        width: signatureWidth,
        align: 'center'
    });
    if (teacherName) {
        doc.fontSize(10).text(teacherName, rightSignatureX, signatureY + 52, {
            width: signatureWidth,
            align: 'center'
        });
    }

    doc.y = startY + footerHeight;
}

module.exports = router;
