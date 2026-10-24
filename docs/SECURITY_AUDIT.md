# Security audit — Giai đoạn 1 (baseline `main` @ `6932b19`)

Audit toàn bộ source server (Fastify + PostgreSQL), API quản trị, phân quyền và commit live từ VPS. Mỗi lỗ hổng có mức độ, cách khai thác, cách sửa và test chứng minh.

## Lỗ hổng đã sửa

| # | Mức độ | Lỗ hổng | Khai thác | Sửa | Test |
|---|---|---|---|---|---|
| V1 | **Nghiêm trọng** | `ADMIN_USERNAMES` cấp `super_admin` cho bất kỳ tài khoản nào đăng nhập bằng username trong danh sách | Người lạ đăng ký đúng username đó trước chủ dự án → toàn quyền | Bỏ hẳn việc cấp quyền theo username. Biến môi trường vẫn đọc được (không làm hỏng `.env` cũ) nhưng bị bỏ qua, kèm cảnh báo trong log. Owner = UID 1002, gắn ở server. | `legacy ADMIN_USERNAMES › no longer grants anything` |
| V2 | **Nghiêm trọng** (dữ liệu live) | Server live chạy chế độ `test`, nên tài khoản tạo trên live (kể cả Owner 1002) bị gắn `is_test` | Chạy `reset:test-data` sẽ xoá Owner | Migration 0004 bỏ cờ test của UID 1000/1002; trigger luôn giữ chúng `is_test = false`; reset loại trừ UID 1000/1002 | `Owner › is never test data…`, `migrations.test.ts` |
| V3 | Cao | Không có phân cấp quyền: ai có `roles.manage` cũng cấp được mọi vai trò (kể cả `super_admin`) cho bất kỳ ai, kể cả chính mình | Một tài khoản admin bị lộ → tự nâng quyền | Rank: Owner 100 > Super Admin 80 > Admin 60 > Moderator 40 > Support 20. Chỉ cấp hoặc thu hồi vai trò **thấp hơn hẳn** rank của mình, trên người **thấp hơn** mình, không bao giờ cho chính mình, không bao giờ vai trò Owner | `privilege escalation › …` (4 test) |
| V4 | Cao | Admin/Moderator ban được Super Admin, Owner và nhân sự khác; gỡ hoặc sửa ban không kiểm tra người bị ban | Moderator khoá Owner; admin gỡ ban do Super Admin đặt | Ban, gỡ ban, sửa ban, duyệt xoá tài khoản đều yêu cầu actor **cao rank hơn** đối tượng. Gỡ hoặc sửa ban còn cần rank ≥ người đã ban | `staff cannot ban…`, `a lower-ranked admin cannot lift…` |
| V5 | Cao | Vai trò Admin có `economy.grant`, `badges.manage`, `uid.assign`, trái spec; `bootstrapRoles` không bao giờ gỡ quyền cũ trong DB | Admin tự cộng Cxu | Vai trò dựng sẵn do code định nghĩa và được **đồng bộ chính xác** mỗi lần khởi động (gỡ quyền thừa). Admin không còn quyền tài nguyên. `finance` cũ chỉ còn quyền đọc. | `role permissions › …`, `migrations.test.ts` |
| V6 | Trung bình | Quyền Owner 1002 chỉ là điều kiện frontend (`user.uid !== 1002`) | Không có quyền thật ở server; client có thể giả UID | Bỏ toàn bộ điều kiện UID ở frontend. Quyền lấy từ `user.permissions` do server tính; server kiểm tra lại mọi request. | `a client cannot claim to be the Owner` |
| V7 | Trung bình | Cộng/trừ Cxu không có lý do, không chống gửi lặp | Bấm 2 lần hoặc replay request → cộng gấp đôi | Bắt buộc `reason` + `idempotencyKey` (UUID). Bảng `admin_operations` ghi khoá trong **cùng transaction** với ledger; gửi lại trả kết quả cũ; dùng lại khoá cho yêu cầu khác → `idempotency_conflict` | `idempotent grants › …` (3 test, có test đồng thời) |
| V8 | Trung bình | Thao tác nhạy cảm không yêu cầu xác thực lại | Token bị lộ → cộng tiền, cấp quyền ngay | `POST /api/auth/reauth` (nhập lại mật khẩu) trả token step-up 10 phút, gửi qua header `x-keyo-reauth`. Bắt buộc cho: cộng/trừ Cxu, cấp/thu hồi vai trò, tạo UID đặc biệt, duyệt xoá tài khoản. Token gắn với đúng tài khoản và `token_version`; không dùng làm session được. | `re-authentication…` (3 test) |
| V9 | Trung bình | `audit_logs` sửa hoặc xoá được | Xoá dấu vết | Trigger: UPDATE/DELETE/TRUNCATE trên `audit_logs` đều bị từ chối | `audit integrity` |
| V10 | Trung bình | UID sửa được ở mức DB; UID 1000/1002 xoá hoặc đổi loại được bằng SQL | Đổi UID, xoá Owner | Trigger: UID bất biến với mọi tài khoản; UID 1000/1002 không xoá, không khoá, không đổi loại tài khoản; vai trò Owner chỉ thuộc UID 1002, không gỡ, không chuyển; không thể ban hoặc gửi yêu cầu xoá cho tài khoản được bảo vệ | `is protected by the database even against direct SQL`, `Keyo Support…` |
| V11 | Trung bình (live) | `deploy/Caddyfile` không tin `X-Forwarded-For`, nên mọi người chơi bị tính là **một IP** (IP của reverse proxy host) | 10 lần đăng nhập/phút áp cho **toàn server**; một người spam là khoá đăng nhập của mọi người | `trusted_proxies static private_ranges`; reverse proxy host phải ghi đè XFF bằng IP thật (xem `DEPLOYMENT_VPS.md`) | Đã kiểm chứng bằng stack thật ở PR #5 với cấu hình tương tự |
| V12 | Thấp | Không có giới hạn tần suất chung cho API | Spam endpoint không xác thực | Giới hạn toàn cục 300 request/phút/IP (`HTTP_RATE_PER_MIN`); route đăng nhập vẫn có giới hạn riêng chặt hơn | `HTTP rate limit` |
| V13 | Thấp | Email người chơi hiện cho mọi nhân sự (kể cả Support/Moderator), tìm theo email được | Lộ dữ liệu cá nhân | Email chỉ hiện hoặc tìm được khi có `users.pii` (Owner, Super Admin, Admin). Ký tự `%`/`_` trong ô tìm kiếm được escape. | `Moderator cannot touch…` |
| V14 | Thấp | Thu hồi quyền không ngắt phiên WebSocket đang mở | Quyền cũ còn dùng được trên socket | Quyền đọc lại từ DB mỗi request; thu hồi vai trò còn ngắt socket ngay | `revoking a role takes effect immediately…` |

## Ma trận quyền (sau sửa)

| Quyền | Owner | Super Admin | Admin | Moderator | Support |
|---|:-:|:-:|:-:|:-:|:-:|
| Mở Admin Panel, dashboard | ✓ | ✓ | ✓ | ✓ | ✓ (chỉ panel) |
| Xem người chơi | ✓ | ✓ | ✓ | ✓ | ✓ |
| Email/dữ liệu cá nhân (`users.pii`) | ✓ | ✓ | ✓ | – | – |
| Ban/unban (chỉ người thấp rank hơn) | ✓ | ✓ | ✓ | – | – |
| Cấp/thu hồi vai trò (thấp hơn mình) | ✓ | ✓ | – | – | – |
| Cộng/trừ Cxu, phát vật phẩm, huy hiệu | ✓ | ✓ | – | – | – |
| UID đặc biệt 1–99999 | ✓ | ✓ | – | – | – |
| Audit log | ✓ | ✓ | – | – | – |
| Duyệt xoá tài khoản | ✓ | ✓ | ✓ | – | – |
| Ticket hỗ trợ (xem/trả lời) | ✓ | ✓ | ✓ | – | ✓ |
| Kiểm duyệt chat/báo cáo | ✓ | ✓ | ✓ | ✓ | – |
| Cấu hình hệ thống (`system.settings`) | ✓ | – | – | – | – |

Danh mục đầy đủ: `packages/shared/src/rbac.ts`. Các quyền của phân hệ chưa xây (chợ, ngân hàng, sự kiện…) đã có tên quyền, nhưng **chưa có API** dùng tới.

## Tài khoản được bảo vệ

- **UID 1000 — Keyo Support:**
  - tài khoản hệ thống, không đăng nhập bằng mật khẩu;
  - không ban, xoá, khoá được; không đổi loại tài khoản hay UID;
  - không nhận vai trò nhân sự.
- **UID 1002 — Owner:**
  - vai trò `owner` được server tự gắn lúc khởi động cho tài khoản giữ UID 1002;
  - DB đảm bảo chỉ một Owner, chỉ UID 1002, không gỡ hay chuyển được;
  - không ban, xoá, khoá, hạ quyền được; không tự gửi yêu cầu xoá được;
  - không tạo được UID 1002 thứ hai.
  - Nếu DB chưa có UID 1002: chạy `maintenance create-owner --operator <tên> --username <tên> --email <email>` trên server. Owner nhận email kích hoạt và tự đặt mật khẩu.

## Rollback

- `apps/server/drizzle/rollback/0004_security_foundation.down.sql` gỡ trigger, chỉ mục và bảng mới, và tạo lại `support_agent` cho code cũ.
- Phải backup trước, và chỉ chạy khi chủ dự án quyết định.

## Còn lại / ngoài phạm vi giai đoạn này

- Chưa có 2FA cho nhân sự.
- Chưa có phê duyệt kép cho các khoản cộng tiền lớn.
- Chưa có lịch sử đăng nhập chi tiết; hiện mới có audit `auth.*` và `account.*`.
- Content-Security-Policy đang tắt (`helmet({ contentSecurityPolicy: false })`). Cần bật sau khi rà soát asset inline của Phaser và Vite.
- Upload file chưa tồn tại; kiểm tra an toàn upload sẽ làm cùng phân hệ khung/avatar (Giai đoạn 3).
