# Bảo mật — Keyo Game

## Nguyên tắc

- **Server-authoritative**: kết quả game, số dư, phần thưởng đều do server tính; client chỉ hiển thị.
- **Chỉ tiền ảo**: không nạp tiền thật, không rút, không crypto, không pay-to-win. RNG không phụ thuộc VIP hay bất kỳ thuộc tính tài khoản nào.
- **Không nhân viên nào được yêu cầu người chơi gửi mật khẩu hoặc mã OTP** — nhắc trong mọi email và màn hình xác minh.
- Không ghi secret vào source; cấu hình qua biến môi trường (`.env.example` chỉ có giá trị mẫu).

## Mật khẩu & phiên

- Argon2id (`@node-rs/argon2`, m = 19 MiB, t = 2, p = 1 — mức tối thiểu OWASP). Hash scrypt cũ được nâng cấp khi đăng nhập.
- Khoá 15 phút sau 5 lần sai; hash giả cho tài khoản không tồn tại để không lộ qua thời gian phản hồi.
- JWT có `token_version`; đổi/đặt lại mật khẩu, "đăng xuất mọi thiết bị", xoá tài khoản đều tăng version và ngắt WebSocket (`hub.kick`, lan qua Redis nếu có).
- Mỗi request xác thực lại tài khoản trong DB: trạng thái, ban đang hiệu lực, loại tài khoản.

## Token email

- Token liên kết 32 byte ngẫu nhiên; chỉ lưu SHA-256. Mã 6 số băm kèm `user:purpose`.
- 30 phút, tối đa 5 lần thử, gửi lại ≥ 60 s, 5 lần/ngày. Token dùng một lần.
- Quên mật khẩu trả phản hồi giống nhau dù email có tồn tại hay không.

## Giới hạn tần suất

- HTTP: 10 request/phút/IP cho các endpoint `/api/auth/*` và `POST /api/me/deletion` (không có giới hạn toàn cục cho mọi route — cân nhắc thêm ở reverse proxy).
- WebSocket: token bucket theo kết nối (`WS_RATE_PER_SEC`, `WS_BURST`).

## Phân quyền & kiểm toán

- RBAC theo bảng `roles` / `role_permissions` / `user_roles`; danh mục quyền cố định trong code.
- Mọi API admin yêu cầu `admin.access` + quyền cụ thể; client ẩn mục không có quyền nhưng server luôn kiểm tra lại.
- `audit_logs` ghi mọi thao tác nhạy cảm: đăng ký, xác minh, đổi mật khẩu, khoá/gỡ khoá, cấp UID, cấp/thu hồi vai trò, cộng/trừ tiền, huy hiệu, xoá tài khoản.
- Tài khoản hệ thống (Keyo Support UID 1000) không đăng nhập bằng mật khẩu, không bị khoá/xoá qua API thường.

## Ví & sổ cái

- Cập nhật số dư nguyên tử với điều kiện `balance + delta >= 0`; mọi thay đổi có dòng sổ cái theo loại tiền.
- Idempotency: id tin nhắn WebSocket là khoá idempotency cho ván chơi.
- Test kiểm tra `sum(ledger) == ví` cho Bạc và Vàng. (Sổ cái kép và ngân hàng: giai đoạn tiếp theo.)

## Việc còn lại trước Production

- Cấu hình `SMTP_URL` với tên miền có SPF/DKIM/DMARC.
- HTTPS bắt buộc; đặt `CORS_ORIGINS` đúng tên miền thật.
- `JWT_SECRET` ≥ 32 ký tự ngẫu nhiên, lưu trong secret manager.
- Phê duyệt kép (dual approval) cho cộng tiền lớn và cấp vai trò cao — chưa làm, thuộc giai đoạn Admin Dashboard.
- 2FA cho tài khoản nhân viên — chưa làm.
- Sao lưu DB tự động và kiểm thử khôi phục.
