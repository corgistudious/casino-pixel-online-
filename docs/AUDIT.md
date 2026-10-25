# Phase 0 — Audit (Keyo Game master prompt)

_Ngày: 2026-10-23 · Nhánh gốc: `claude/hub-modern-c` (PR #3, nối tiếp PR #2 và #1; chưa PR nào được merge vào `Corgi-Casino`)._

## Stack hiện có (giữ nguyên)

| Lớp | Công nghệ |
| --- | --- |
| Monorepo | pnpm workspaces: `packages/shared`, `apps/server`, `apps/web`, `apps/desktop` |
| Server | Node 22, TypeScript strict, Fastify 5, `@fastify/websocket`, Drizzle ORM + PostgreSQL 16, ioredis (tùy chọn), Zod |
| Client | React 19, Phaser 3.90, Vite 7, Tailwind 3, Zustand, i18next (vi/en) |
| Native | Capacitor 7 (Android, sinh trong CI), Electron 44 (Windows NSIS/portable) |
| Hạ tầng | Docker multi-stage + Compose (Postgres, Redis, Caddy HTTPS), GitHub Actions (CI, APK, EXE) |

## Đối chiếu tính năng

| Hạng mục spec | Hiện trạng | Đánh giá |
| --- | --- | --- |
| Branding Keyo Game | Tên cũ "Casino Pixel Online" ở UI, manifest, Electron, Capacitor | Cần đổi (Phase 1) |
| Đăng ký | username + password (+display name); kích hoạt ngay | Thiếu email, xác nhận mật khẩu, điều khoản, trạng thái chờ xác minh |
| Hash mật khẩu | scrypt N=16384 | Chuyển Argon2id, giữ xác minh scrypt cũ + rehash khi đăng nhập |
| UID | Chỉ UUID nội bộ | Thiếu UID công khai (≥100000), UID đặc biệt 1–99999, UID 1000 |
| Xác minh email / reset mật khẩu | Không có | Thiếu hoàn toàn; cần mailer (SMTP) + outbox |
| Gỡ email, xóa tài khoản | Không có | Thiếu |
| Ban | Cờ `banned` boolean + thu hồi token | Thiếu thời hạn, lý do, bằng chứng, hết hạn tự động, khiếu nại |
| RBAC | `role` = player/admin + `ADMIN_USERNAMES` | Thiếu roles/permissions chi tiết |
| Audit log | Chỉ log ứng dụng | Thiếu bảng audit bền vững |
| Keyo Support UID 1000 | Không có | Thiếu |
| 6 game multiplayer | Roulette, Sic Bo, Blackjack chơi **một người vs nhà cái**; Slots (ẩn) | Thiếu Poker, Liêng, Xì Tố; 3 game hiện có chưa phải bàn chung nhiều người; Blackjack chưa có Split |
| Phòng chơi | Không có | Thiếu |
| Tiền tệ | Cxu Bạc + Cxu Vàng, ledger một dòng/biến động | Cần double-entry; chính sách mới khác (xem dưới) |
| Quà tân thủ | 10.000 Bạc + 10 Vàng | Spec mới: 50.000 Bạc |
| Điểm danh | 7 ngày 1K→5K Bạc, Vàng ngày 4/7, theo giờ VN | Spec mới: 5K/5K/6K/6K/8K/10K/20K Bạc, reset UTC, không Vàng |
| Hỗ trợ hết tiền | 1.000 Bạc / 1 giờ / số dư < 100 | Spec mới: 2.000 / 12 giờ / (khả dụng + đang giữ) < 1.000 |
| Ngân hàng | Không có | Thiếu |
| Cửa hàng | Khung avatar mua bằng **Cxu Vàng** | Spec mới: Frame Marketplace dùng **Cxu Bạc**; cần đổi |
| VIP / Nhiệm vụ / Thành tựu | Chỉ bảng VIP (dữ liệu hiển thị), UI demo | Thiếu backend |
| Chợ Xa Hoa, Điểm Hấp Dẫn | Không có (chỉ tab khung) | Thiếu |
| Frame Library, Nghệ nhân, Reviewer | Không có | Thiếu |
| Mailbox, Support, Report, Giftcode, Tournament | Không có | Thiếu |
| Bạn bè, theo dõi, thích | Không có | Thiếu |
| Admin | 3 endpoint (tổng quan, cộng/trừ, ban) + trang đơn giản | Thiếu gần như toàn bộ 45 module |
| Provably fair, idempotency, rate limit, tests | Có (71 test) | Giữ và mở rộng |

## Mâu thuẫn chính sách cần ghi nhận

1. **Thưởng VIP bằng Cxu Vàng**: giữ trong tài liệu, **không kích hoạt** (theo spec).
2. **Cxu Vàng ở cửa hàng khung**: spec mới cấm dùng Vàng cho Frame Marketplace thông thường → giá khung chuyển sang Cxu Bạc. Người chơi đã mua khung bằng Vàng vẫn giữ khung (không hoàn/thu hồi tự động).
3. **Quà tân thủ 10 Vàng** ở bản cũ: không còn phát cho tài khoản mới; số dư Vàng đã phát không bị thu hồi.
4. **Luật Liêng và Xì Tố**: spec yêu cầu xác nhận biến thể trước khi hoàn thiện → cần chủ dự án chốt.

## Thứ tự triển khai (theo phụ thuộc)

0. Audit (tài liệu này).
1. Branding + design system (Keyo Game).
2. Tài khoản: UID, đăng ký có email, Argon2id, xác minh email, reset mật khẩu, RBAC, audit log, ban có thời hạn, xóa tài khoản, Keyo Support UID 1000.
3. Ledger double-entry + ví + ngân hàng + chính sách kinh tế mới.
4. Mailbox (nền tảng nhận thưởng) → Support/Ticket → Báo cáo → Giftcode.
5. Xã hội: bạn bè (Keyo Support mặc định), theo dõi, thích, hồ sơ công khai.
6. Multiplayer: phòng, bàn chung; 6 game.
7. VIP / nhiệm vụ / thành tựu → Tournament → Chợ Xa Hoa → Frame Library → Reviewer.
8. Admin Dashboard hoàn chỉnh, đóng gói, kiểm thử tổng thể.
