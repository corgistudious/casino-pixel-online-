# Keyo — Danh tính người chơi, Ảnh đại diện, VIP, Gift Shop & Điểm Hấp Dẫn

Nhánh `claude/keyo-identity-vip-gifts`, gốc `Corgi-Casino` @ `3975019` (đã gồm PR #18, #19, #21).
Không triển khai VPS, không chạy migration trên Production — cần Owner duyệt.

## 1. Audit: đã có / còn thiếu (trước nhánh này)

| Hạng mục | Trước | Sau nhánh này |
|---|---|---|
| Avatar | Chỉ avatar mặc định (16 emblem) + avatar vật phẩm, khung | + Ảnh tải lên (cắt 1:1, 512×512, xóa EXIF), gỡ ảnh, kiểm duyệt; khung giữ nguyên |
| Hiển thị danh tính | Mỗi màn tự vẽ (Avatar + PlayerName), không VIP, rank chỉ ở vài nơi | Bộ component dùng chung `players/identity.tsx`; ảnh, VIP góc dưới, rank sau tên, huy hiệu, trạng thái; cập nhật realtime |
| Trạng thái | online/offline | online / đang trong ván (đang ngồi bàn bài/Blackjack) / offline |
| VIP | 15 cấp hardcode trong code, không có quản trị | Bảng `vip_levels` (seed đúng 15 cấp cũ), admin sửa/thêm/xóa có kiểm tra, trao/thu hồi/cộng trừ EXP theo người chơi có lý do + lịch sử + audit |
| Badge VIP | 6 dải màu tự chọn | 5 hạng theo yêu cầu: 1–3 Bạc, 4–6 Vàng, 7–9 Bạch Kim, 10–12 Kim Cương, 13+ Hoàng Gia, thống nhất mọi nơi |
| Quà | Chỉ chuyển Cxu Bạc/vật phẩm cho bạn bè (`gift_transfers`) — không phải cửa hàng | Giữ nguyên chức năng cũ; thêm **Gift Shop** (quà tiêu hao, tăng Điểm Hấp Dẫn), mở từ hồ sơ nhanh / hồ sơ / hộp thoại quà bạn bè |
| Điểm Hấp Dẫn | Chỉ là ô "CHƯA HOẠT ĐỘNG" | Chỉ số thật: `charm_points` + `charm_ledger`; chỉ tăng từ quà hợp lệ; BXH riêng |
| Hồ sơ nhanh | Theo dõi, kết bạn, nhắn tin, tố cáo, chặn | + Thích/Bỏ thích, Tặng quà, Charm, VIP, trạng thái, bottom sheet trên điện thoại |
| Hồ sơ | Followers/Following/Likes | + Charm, showcase quà (nhóm theo quà, gần đây, sắp xếp, lọc danh mục), lịch sử quà của tôi, quyền riêng tư "Hiện quà đã nhận", đổi ảnh |
| Admin | — | Trang VIP, Quà tặng, Điểm Hấp Dẫn; gỡ ảnh vi phạm ở trang người chơi |

## 2. Kiểm toán kinh tế & bảng giá

Thu nhập tham chiếu (lấy từ code): đăng nhập hằng ngày 30.000 Cxu Bạc; thưởng VIP ngày 5.000 (VIP 1) → 80.000 (VIP 15);
nhiệm vụ ngày ≈ 2.600; tuần ≈ 21.500 + 5 Cxu Vàng; quà chào mừng 50.000. → Người chơi miễn phí ≈ **37.000 Cxu Bạc/ngày**,
VIP 15 ≈ **113.000/ngày**. Khung avatar: 5.000–60.000. Cxu Vàng rất hiếm (VIP ngày 10–800, nhiệm vụ tuần 5).

Rủi ro farm: tạo tài khoản phụ nhận 50.000 + 30.000/ngày rồi dồn quà cho tài khoản chính để leo BXH Charm.
Biện pháp (server cưỡng chế): người tặng phải **đã xác minh email** và **tài khoản ≥ 72 giờ**; mỗi ngày tối đa
**1.000.000 Cxu Bạc**, **1.000 Cxu Vàng**, **50 món**; một người tặng → một người nhận tối đa **10.000 Charm/ngày**;
giới hạn riêng từng món; không tự tặng; chặn hai chiều; bộ lọc "giao dịch bất thường" cho admin; đảo giao dịch có/không hoàn tiền.

Quà là **điểm hút tiền (sink)**: Cxu bị trừ hẳn, người nhận không nhận Cxu → giảm lạm phát. Charm tuyến tính
**1 Charm / 100 Cxu Bạc** cho mọi quà bạc (không có "quà lời nhất" để farm).

**Bảng giá yêu cầu (Hoa nhỏ 500 … Du thuyền 2.000.000) không được dùng.** Bảng đề xuất (`GIFT_PRICE_PROPOSAL`,
chưa duyệt) chỉ được nạp từ admin ở trạng thái **TẮT BÁN**: Hoa hồng 500/+5, Kẹo 1.000/+10, Cà phê 2.000/+20,
Cỏ bốn lá 5.000/+50, Gấu bông 10.000/+100, Socola 8.000/+80, Bó hoa 20.000/+200, Nhẫn bạc 50.000/+500 (5/ngày),
Đồng hồ vàng 100.000/+1.000 (5/ngày), Siêu xe 300.000/+3.000 (3/ngày), Du thuyền 1.000.000/+10.000 (1/ngày),
Pháo hoa (sự kiện) 15.000/+150, Vương miện 100 Cxu Vàng/+1.500, Kim cương 300 Cxu Vàng/+5.000.
Migration **không tạo quà nào**; Production chỉ có quà khi Owner nạp & mở bán.

## 3. Dữ liệu & migration (additive, có rollback)

| Migration | Nội dung | Rollback |
|---|---|---|
| `0029_vip_config` | `vip_levels` (seed 15 cấp y hệt), `vip_progress.override_*`, `vip_events`, hàm `keyo_vip_level()` | `drizzle/rollback/0029_vip_config.down.sql` |
| `0030_avatar_uploads` | `avatar_uploads` (bytes ở bảng `assets` PostgreSQL); bảng `users` **không đổi** | `drizzle/rollback/0030_avatar_uploads.down.sql` |
| `0031_gift_shop_charm` | `gift_catalog` (rỗng), `gift_transactions`, `charm_points`, `charm_ledger`, `profile_settings.show_gifts` | `drizzle/rollback/0031_gift_shop_charm.down.sql` (**xóa lịch sử quà & Charm — export trước**) |

Bảo toàn: không đổi `vip_progress.exp`, ví, ledger, UID, avatar/khung đang trang bị. Ảnh lưu trong PostgreSQL
(không ở filesystem container) nên sống qua restart/rebuild/deploy. `reset:test-data` đã bao phủ mọi bảng mới
(cột nhân viên chuyển cho Keyo Support, không bao giờ xóa VIP của người thật vì nhân viên TEST đã chỉnh).

## 4. API mới / thay đổi

Người chơi: `GET /api/vip/levels`, `GET /api/vip` (thêm `expLevel`, `override`), `POST /api/vip/daily` (thưởng theo bảng),
`POST /api/me/avatar` (body = ảnh), `DELETE /api/me/avatar`, `GET /api/gifts/shop`, `POST /api/gifts/send`
(`{id, uid, giftId, quantity, anonymous, message, expectedPrice}`), `GET /api/gifts/history?direction=`,
`GET /api/players/:uid/gifts?sort&category`, `GET /api/charm/leaderboard`.
Thay đổi: `PlayerCard`/ghế bài/ghế Blackjack/roster Tài Xỉu–Roulette/BXH thêm `customAvatar`, `vipLevel`, `rank`;
`PublicUser` thêm `customAvatar`, `vipLevel`, `charm`; `PlayerProfileView` thêm `presence`, `counts.charm`, `gifts`.
Realtime: `identity` (ảnh/khung/tên/VIP/huy hiệu), `counts` (follow/like/charm), `social.gift_received`.

Admin (RBAC server-side): `GET /api/admin/vip/levels` (vip.read), `PUT|DELETE /api/admin/vip/levels/:level` (vip.levels + mật khẩu),
`GET|POST /api/admin/vip/players/:uid` (vip.read / vip.manage + mật khẩu), `GET /api/admin/gifts` (gifts.read),
`PUT /api/admin/gifts/:id`, `POST /api/admin/gifts/import-proposal` (gifts.manage), `GET /api/admin/gifts/transactions`,
`POST /api/admin/gifts/transactions/:id/reverse` (gifts.manage + mật khẩu), `GET|POST /api/admin/charm/:uid`
(charm.read / charm.manage + mật khẩu), `POST /api/admin/users/:uid/avatar/reject` (avatars.moderate).
Quyền: Owner tất cả; Super Admin tất cả trừ system.settings; Admin & Moderator chỉ `avatars.moderate`.
UID 1002 chỉ Owner chỉnh được; UID 1000 không là đối tượng; không tự cộng cho mình; không chỉnh người cùng/cao hạng.

## 5. Triển khai an toàn (khi Owner duyệt)

1. Backup: `pg_dump` (định dạng custom) và kiểm tra khôi phục được.
2. Deploy image mới; server tự chạy migration 0029–0031 khi khởi động (additive, idempotent).
3. Kiểm tra: `SELECT count(*) FROM vip_levels` = 15; so sánh `sum(exp)` của `vip_progress`, tổng ví, số dòng ledger trước/sau (phải bằng).
4. Owner vào Admin → Quà tặng → "Nạp bảng giá đề xuất", duyệt từng món, rồi "Mở bán" món đã duyệt.

Rollback: deploy lại image cũ (bảng mới không ảnh hưởng code cũ). Chỉ khi cần xóa hẳn: chạy các file rollback theo thứ tự
0031 → 0030 → 0029 sau khi export dữ liệu, rồi xóa 3 dòng tương ứng trong `drizzle.__drizzle_migrations`.

## 6. Kiểm thử trên điện thoại

1. Đăng nhập → Hồ sơ → "Đổi ảnh" → chọn ảnh trong máy → kéo/zoom (2 ngón) → Lưu. Ảnh hiện ở thanh trên, bạn bè, chat, bàn chơi.
2. Danh sách bạn → chạm tên bạn → bottom sheet: Thích, Theo dõi, **Tặng quà** → chọn quà → Xem lại → Gửi.
3. Hồ sơ người nhận: Điểm Hấp Dẫn tăng, quà hiện trong "Quà đã nhận"; xoay ngang/dọc để kiểm tra bố cục.
4. Admin (Owner/Super Admin): VIP → tìm UID → Trao cấp có thời hạn; badge VIP đổi ngay trên màn người chơi.

## 7. Hạn chế đã biết

- Server kiểm tra ảnh theo cấu trúc file (magic bytes, kích thước 512×512, không động, cấu trúc chunk/segment hợp lệ) và bóc metadata;
  không giải mã toàn bộ điểm ảnh (không thêm thư viện native để tránh rủi ro build Alpine). Trình duyệt luôn vẽ lại ảnh trước khi gửi.
- Danh hiệu Top 50 (Vương Giả…) hiện ở hồ sơ, bạn bè, phòng; ở chat/ghế bài chỉ hiện bậc rank.
- Thông báo quà là realtime best-effort; lịch sử quà luôn được lưu và tải lại khi mở lại/kết nối lại.
- Bộ lọc "bất thường" chỉ đánh dấu, không tự xử lý.
- Biểu tượng VIP/quà tùy chỉnh dùng mã ảnh đã tải lên ở trang Vật phẩm (chưa có nút tải trực tiếp trong form).
