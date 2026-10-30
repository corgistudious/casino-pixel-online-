# Keyo Captain — Owner kép & Hệ thống hỗ trợ

Nhánh `feat/keyo-captain-dual-owner-support`, tách từ `fix/keyo-mobile-chat-dice-ui` (PR #24, chưa merge) để giữ các thay đổi giao diện của PR #24.
Không triển khai VPS, không chạy migration trên Production — cần Owner duyệt.

## 1. Tài khoản & quyền

| UID | Tên | Vai trò | Ghi chú |
|---|---|---|---|
| 1000 | Keyo Captain (`keyo_support`) | Owner + Hỗ trợ chính thức | `account_type = system_support` giữ nguyên, không xóa/tạo lại |
| 1002 | Keyo_GM | Owner | không đổi |
| 1005 | Voxtan | Super Admin | không đổi |

- Hai Owner ngang quyền. Không ai (Owner khác, Super Admin, chính mình) có thể: cấm, khóa, xóa, hạ quyền, thu hồi Owner, đặt lại mật khẩu, gỡ email, đổi UID, vô hiệu hóa, cộng Cxu, chỉnh EXP/RP, chỉnh VIP/Charm/huy hiệu của một Owner.
  Owner chỉ tự đổi mật khẩu của mình qua `POST /api/me/password` (cần mật khẩu hiện tại).
- Kiểm tra đều ở backend theo phiên đăng nhập + RBAC phía máy chủ (`assertOutranks`, `isProtected`, `isOwnerUid`, `assertStaffTarget`); không dùng UID/role do client gửi.
- Lớp DB: trigger `keyo_owner_role_guard` chỉ cho UID 1000 và 1002 giữ role `owner`, cấm UPDATE/DELETE dòng Owner → không có đường API nào tạo Owner thứ ba hay gỡ Owner.
  Các trigger cũ (`keyo_users_guard`, `keyo_protected_target_guard`) vẫn chặn xóa/cấm/đổi loại tài khoản 1000/1002.
- Owner không có lợi thế chơi: cùng ví, cùng luật, cùng tỉ lệ, cùng giới hạn; admin không thể cộng Cxu/EXP/RP cho Owner.

## 2. Đăng nhập UID 1000

- Không có mật khẩu mặc định / hardcode; hash `!disabled` không bao giờ khớp nên đăng nhập luôn thất bại cho tới khi thiết lập.
- Owner (khác UID 1000) vào **Quản trị → Hệ thống → Keyo Captain**, bấm "Tạo liên kết thiết lập", xác nhận lại mật khẩu → nhận liên kết dùng **một lần, hết hạn 30 phút**.
  Chỉ SHA-256 của token được lưu (`account_setup_tokens`); token không ghi log/audit; liên kết mới vô hiệu liên kết cũ; khi đã có mật khẩu thì không tạo được nữa.
- Người giữ tài khoản mở `/#/captain-setup?token=…`, chọn mật khẩu → đăng nhập bằng **UID 1000** + mật khẩu. Áp dụng khóa 15 phút sau 5 lần sai, phiên JWT, "Đăng xuất mọi thiết bị", đổi mật khẩu (đăng xuất thiết bị khác).
- Email chính thức `keyogamevietnam@gmail.com` chỉ để liên hệ, **không** là email đăng nhập của UID 1000.
- Audit: `captain.setup_link_issued`, `captain.password_set`, `account.password_changed`.

## 3. Bạn bè, hồ sơ, tin nhắn

- Keyo Captain là **bạn ảo**: `GET /api/friends` chèn thẻ `official: true` lên đầu cho mọi người chơi; không ghi dòng `friendships`, không chiếm chỗ (200), không tính vào số bạn/đang online trên giao diện.
  Lời mời → trả `friends`; chấp nhận/xóa/chặn/báo cáo → `official_account`. Dòng cũ từ migration 0019 vẫn giữ trong DB nhưng không hiển thị trùng.
- Hồ sơ UID 1000 là dữ liệu thật; hiển thị Online (trạng thái hỗ trợ chính thức) trừ khi đang ngồi bàn. Thích/Theo dõi/Tặng quà Gift Shop như người chơi khác (trừ tiền một lần, idempotent theo `id`, cộng Charm theo luật cũ). Chuyển Cxu Bạc/vật phẩm cho UID 1000 bị chặn.
- DM tới/từ UID 1000 bị chặn ở API (`support_only`); DM giữa người chơi khác không đổi. DM chỉ đi qua HTTP (WebSocket chỉ đẩy sự kiện), nên không có đường gửi DM nào khác.
- Mọi nút "Nhắn tin" cho UID 1000 (Bạn bè, hồ sơ, menu người chơi, `#/chat?dm=1000`) mở **menu Hỗ trợ**.

## 4. Menu Hỗ trợ & Trung tâm hỗ trợ

- Menu Hỗ trợ (tím/đen, viền vàng, cuộn được, vừa iPhone ngang): **Hướng dẫn tân thủ** 12 mục; **Liên hệ** 8 mục.
  "Liên hệ chính thức" hiện email, Sao chép, Gửi email (`mailto:`), Mở Trung tâm hỗ trợ (máy chủ không gửi email). Các mục khác mở form tạo yêu cầu của Trung tâm hỗ trợ hiện có (điền sẵn chủ đề) — không có hệ thống ticket thứ hai.
- Nội dung hướng dẫn lấy từ luật thật trong code (50.000 quà tân thủ khi xác minh email, điểm danh 30.000, trợ cấp 2.000 dưới 1.000 mỗi 12 giờ, 15 cấp VIP, Level 999, mùa Rank 2 tháng, 200 bạn, tặng Cxu 100–5.000 / 5.000 mỗi ngày sau 24 giờ, Gift Shop cần email xác minh + 72 giờ, báo cáo 10/ngày).
- Trung tâm hỗ trợ: tab **Tổng quan / Tạo yêu cầu / Yêu cầu của tôi / Hướng dẫn**.
  Sửa lỗi cắt banner khi xoay ngang tận gốc: trang không còn bị ép `h-full` + `overflow-hidden` + lưới `min-h-[480px]`; trang cao tự nhiên trong `<main>` cuộn, banner `shrink-0` (gọn hơn với `short:`), chỉ khung hội thoại có vùng cuộn riêng theo `dvh` (bàn phím ảo không che ô trả lời), safe-area ở đáy.
- Ticket: người chơi chỉ thấy ticket của mình (kiểm tra cũ giữ nguyên); `requestId` (UUID) chống tạo trùng khi bấm đúp/thử lại (khóa dòng user + chỉ mục duy nhất `(user_id, client_key)`); chữ ký nhân viên hiển thị "Keyo Captain".

## 5. Migration `0032_keyo_captain_dual_owner` (additive, idempotent)

- Bỏ chỉ mục "một Owner"; trigger Owner cho phép UID 1000 và 1002.
- `display_name` UID 1000: 'Keyo Support' → 'Keyo Captain' (chỉ khi chưa bị đổi tay).
- Bảng `account_setup_tokens`; cột `support_tickets.client_key` + chỉ mục duy nhất một phần.
- Khi server khởi động, `bootstrapOwner` thêm role Owner cho UID 1000 (có audit). Không đụng số dư, lịch sử, UID, role của 1002/1005.
- Rollback: `apps/server/drizzle/rollback/0032_keyo_captain_dual_owner.down.sql` (gỡ Owner của 1000, khôi phục trigger/chỉ mục một Owner, xóa bảng/cột mới, trả tên cũ), sau đó xóa dòng 0032 trong `drizzle.__drizzle_migrations`.
- Đã kiểm thử trên DB cô lập: nâng cấp từ 0031 với dữ liệu mẫu (số dư, role, ticket giữ nguyên), chạy lại không đổi gì, rollback bằng `psql -f` rồi migrate lại thành công.

## 6. Triển khai (khi Owner duyệt)

1. Backup: `pg_dump -Fc` và thử khôi phục vào DB tạm.
2. Ghi lại: tổng ví, số dòng ledger, role của 1002/1005.
3. Deploy image mới (server tự chạy 0032 + `bootstrapOwner`).
4. Kiểm tra: `SELECT u.uid FROM user_roles r JOIN users u ON u.id=r.user_id WHERE role_id='owner'` → 1000, 1002; tổng ví/ledger không đổi; 1005 vẫn `super_admin`.
5. Owner 1002 vào Quản trị → Hệ thống → tạo liên kết thiết lập cho Keyo Captain, gửi riêng cho người giữ tài khoản.

## 7. Rollback

- Frontend: deploy lại image web cũ (không phụ thuộc DB).
- Backend: deploy lại image server cũ. Code cũ vẫn chạy được với schema 0032 (bảng/cột mới không được dùng; UID 1000 cũ không đăng nhập được vì code cũ yêu cầu `account_type = player`). Role Owner thừa của 1000 không cấp quyền gì khi không đăng nhập được.
- DB (chỉ khi cần gỡ hẳn): chạy file rollback 0032 bằng `psql -v ON_ERROR_STOP=1 -f …` rồi xóa dòng 0032 trong `drizzle.__drizzle_migrations`. Không chạm số dư/lịch sử.
