# Hệ thống tài khoản Keyo Game

_Giai đoạn 2 — nhánh `claude/keyo-foundation`._

## Đăng ký & xác minh email

1. Người chơi điền: tên đăng nhập (3–20 ký tự `A-Z a-z 0-9 _`), tên hiển thị, email, mật khẩu (8–128 ký tự, có chữ và số), nhập lại mật khẩu, đồng ý điều khoản.
2. Server tạo tài khoản ở trạng thái `pending_verification`, cấp UID tự động, tạo ví, gửi email gồm **mã 6 số** và **liên kết** `APP_URL/#/verify-email?token=…`.
3. Khi chưa xác minh: được đăng nhập, xem sảnh/hồ sơ, nhưng **không** vào bàn chơi, điểm danh, cửa hàng hay nhận Cxu hỗ trợ (server trả `email_not_verified`; client hiện màn hình xác minh).
4. Xác minh bằng mã (cần phiên đăng nhập) hoặc liên kết (mở ở trình duyệt nào cũng được) → tài khoản `active`, **quà tân thủ 50.000 Cxu Bạc** được ghi vào sổ cái **đúng một lần** (`users.starter_granted_at`), gửi email xác nhận.

Tên đăng nhập dành riêng (không đăng ký được): `keyo`, `keyo_support`, `keyosupport`, `support`, `admin`, `administrator`, `system`, `moderator`, `official`.

### Giới hạn mã/liên kết

| Quy tắc | Giá trị |
|---|---|
| Thời hạn | 30 phút |
| Số lần nhập sai tối đa | 5 (sau đó mã bị huỷ) |
| Gửi lại | cách nhau ≥ 60 giây, tối đa 5 lần/ngày/mục đích |
| Lưu trữ | chỉ lưu SHA-256 của token/mã; mã 6 số gắn với `user:purpose` |
| Mã mới | vô hiệu hoá mã cũ cùng mục đích |

## UID

| Dải | Cách cấp |
|---|---|
| ≥ 100000 | Tự động từ sequence `player_uid_seq` khi đăng ký (an toàn khi đăng ký đồng thời) |
| 1–99999 | UID đặc biệt, chỉ admin có quyền `uid.assign` tạo (`POST /api/admin/accounts`) |
| 1000 | Giữ riêng cho **Keyo Support** (tài khoản hệ thống, tạo tự động khi khởi động, idempotent) |

Tài khoản UID đặc biệt (Admin → UID đặc biệt) chỉ có 4 trường: **UID, Tên hiển thị, Mật khẩu, Nhập lại mật khẩu**. Tài khoản được tạo **active** ngay trong một transaction (user + ví + seed + audit `uid.custom_create`), đăng nhập ngay bằng UID + mật khẩu, username kỹ thuật tự sinh `uid_<UID>`, không email, không TEST, không role quản trị, không quà tân thủ (chính sách cũ cho UID đặc biệt). Từ chối UID trùng/ngoài 1–99.999/được bảo vệ (1000, 1002); chỉ mục duy nhất `uid` xử lý hai yêu cầu đồng thời; `idempotencyKey` cho phép thử lại an toàn. Mật khẩu chỉ được hash, không log/audit/trả về. Người chơi tự liên kết email ở Cài đặt → Tài khoản → Bảo mật (mã 6 số, giới hạn gửi/thử); email chỉ dùng đăng nhập sau khi xác minh. Tài khoản chưa có email chỉ khôi phục qua Trung tâm hỗ trợ sau khi xác minh quyền sở hữu, Owner/Super Admin đặt lại mật khẩu (xác nhận lại + audit). Tài khoản `pending_activation` cũ (nếu có) vẫn kích hoạt được qua `#/activate`.

Tài khoản cũ (trước migration `0002`) được cấp UID ≥ 100000 theo thứ tự, giữ trạng thái `active`, không bị buộc thêm email; có thể liên kết email một lần trong Cài đặt. Họ đã nhận gói chào mừng cũ nên không nhận quà tân thủ mới lần nữa.

## Đăng nhập

- Bằng tên đăng nhập **hoặc** email.
- Sai 5 lần → khoá 15 phút (ghi audit `account.locked`). Thông báo lỗi không tiết lộ tài khoản có tồn tại hay không; thời gian phản hồi được cân bằng bằng hash giả.
- Tài khoản hệ thống, đã xoá, hoặc chờ kích hoạt không đăng nhập được bằng mật khẩu.
- Hash cũ (scrypt) tự nâng lên Argon2id khi đăng nhập thành công.
- `POST /api/auth/logout-all` vô hiệu mọi token (tăng `token_version`) và ngắt WebSocket.

## Quên mật khẩu

`POST /api/auth/forgot-password` luôn trả cùng một phản hồi. Email chứa liên kết `#/reset-password?token=…` và mã 6 số. Đặt lại thành công → mọi phiên bị đăng xuất, gửi email cảnh báo "mật khẩu đã thay đổi", ghi audit.

## Khoá tài khoản (ban)

- Thời hạn: N ngày / tháng / năm hoặc vĩnh viễn; bắt buộc lý do; có thể kèm bằng chứng.
- Hết hạn tự động (so sánh `ends_at` với thời gian hiện tại, không cần job).
- Người bị khoá thấy ngày kết thúc và lý do khi đăng nhập; phiên đang mở bị ngắt ngay.
- Gỡ khoá (bắt buộc lý do) và sửa ngày kết thúc đều ghi audit. Không khoá được tài khoản hệ thống hoặc chính mình.

## Xoá tài khoản

Người chơi gửi yêu cầu (nhập lại mật khẩu + xác nhận); có thể huỷ khi đang chờ. Nhân viên có quyền `deletion.manage` duyệt/từ chối kèm ghi chú. Khi duyệt: hồ sơ được ẩn danh (`deleted_<uid>`, "Deleted player"), xoá email, vô hiệu mật khẩu, trạng thái `deleted`; **sổ cái và lịch sử ván chơi được giữ** để kiểm toán.

Gỡ/đổi email đã xác minh: thực hiện qua Keyo Support (ticket) — sẽ làm ở giai đoạn Support Center.

## RBAC & audit

Danh mục quyền nằm trong `packages/shared/src/rbac.ts`; vai trò mặc định `super_admin`, `admin`, `moderator`, `support_agent`, `finance` được tạo khi khởi động. Mọi API admin kiểm tra `admin.access` + quyền cụ thể. `ADMIN_USERNAMES` cấp `super_admin` khi đăng nhập (để khởi tạo hệ thống). Mọi thao tác nhạy cảm ghi vào `audit_logs` (người làm, hành động, đối tượng, chi tiết, IP).

## Email

Mọi email đi qua bảng `email_outbox` (ghi cùng transaction với nghiệp vụ). Worker gửi qua SMTP (`SMTP_URL`), thử lại tối đa 5 lần. **Không có `SMTP_URL` thì email chỉ nằm trong hàng đợi, không được gửi** — cần cấu hình trước khi mở đăng ký thật. Mẫu email song ngữ vi/en, luôn nhắc "Keyo Support không bao giờ hỏi mật khẩu hoặc mã OTP".

## API

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| POST | `/api/auth/register` | trả token + user (`pending_verification`) |
| POST | `/api/auth/login` | `{ login, password }` |
| POST | `/api/auth/verify-email` | `{ token }` không cần phiên, hoặc `{ code }` cần phiên |
| POST | `/api/auth/resend-verification` | cần phiên |
| POST | `/api/auth/link-email` | tài khoản cũ chưa có email đã xác minh |
| POST | `/api/auth/forgot-password` | |
| POST | `/api/auth/reset-password` | `{ token }` hoặc `{ email, code }` + mật khẩu mới |
| POST | `/api/auth/activate` | tài khoản UID đặc biệt cũ (`pending_activation`) |
| POST | `/api/auth/logout-all` | |
| GET/POST/DELETE | `/api/me/deletion` | xem / gửi / huỷ yêu cầu xoá |
| GET | `/api/admin/users`, `/api/admin/users/:uid` | `users.read` |
| POST | `/api/admin/users/:uid/bans`, `/api/admin/bans/:id/revoke`; PATCH `/api/admin/bans/:id` | `users.ban` |
| GET | `/api/admin/uids/special`; POST `/api/admin/accounts` | `uid.assign` |
| GET | `/api/admin/roles`; POST/DELETE `/api/admin/users/:uid/roles` | `roles.manage` |
| GET | `/api/admin/deletion-requests`; POST `…/:id/decide` | `deletion.manage` |
| POST | `/api/admin/users/:uid/badges` · `/grant` | `badges.manage` · `economy.grant` |
| GET | `/api/admin/audit` · `/api/admin/outbox` | `audit.read` · `mail.read` |
