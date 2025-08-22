# 🔒 Backend Security Checklist

## Secrets
- [ ] Tất cả API keys, DB password để trong `.env`, không commit.

## API
- [ ] Validation đầu vào với `joi` / `express-validator`.
- [ ] Bật `helmet` để set HTTP headers bảo mật.
- [ ] Dùng JWT/Cookie với `httpOnly`, `secure`, `sameSite=strict`.
- [ ] Bật rate-limit cho login/API quan trọng.

## Server
- [ ] Dùng HTTPS.
- [ ] Cấu hình CORS chỉ cho phép domain frontend.
- [ ] Log lỗi nhưng không log dữ liệu nhạy cảm.
