# Khung, avatar, kho đồ và hộp thư (Giai đoạn 3)

## Catalog vật phẩm (`catalog_items`)

- Ba loại vật phẩm:
  - `frame` — khung hồ sơ;
  - `avatar` — avatar đặc biệt;
  - `collectible` — vật phẩm sưu tầm.
- Độ hiếm: `common`, `rare`, `epic`, `legendary`, `mythic`.
- Nguồn nhận: shop, event, mail, vip, achievement, tournament, admin, legacy.
- Trạng thái:
  - `draft` — chỉ nhân sự thấy;
  - `released` — đang phát hành;
  - `hidden` — ngừng phát hành, nhưng **người đã sở hữu vẫn giữ và vẫn hiển thị**.
- Vật phẩm không bao giờ bị xoá. Vật phẩm đã có người sở hữu không thể quay về `draft`.
- 6 khung dựng sẵn được seed vào catalog (giữ nguyên id và giá). Quyền sở hữu khung cũ được chép sang kho đồ; bảng `user_items` giữ nguyên làm lịch sử.

## Ảnh tải lên (`assets`)

- Chỉ nhận PNG/APNG, WebP, GIF. Loại ảnh được xác định bằng **magic bytes**, không dựa vào tên tệp hay header. SVG bị từ chối.
- Kích thước đọc từ header; ảnh phải gần vuông (tỷ lệ 0,9–1,1), mỗi cạnh 64–1024 px, tối đa 1 MB.
- Ảnh được lưu trong PostgreSQL, định danh bằng SHA-256, nên backup `pg_dump` đã bao gồm ảnh và mọi instance server đều phục vụ được.
- Phục vụ tại `/api/assets/<sha256>.<ext>` với `nosniff`, CSP `default-src 'none'; sandbox`, cache 1 năm (immutable).

## Hiển thị khung

- Khung ảnh được vẽ **ngoài** vòng tròn avatar, căn giữa theo thông số `render`:
  - `scale` 1–1,8: kích thước ảnh khung so với avatar;
  - `offsetX` / `offsetY` ±0,25: độ lệch.
- Cùng một công thức dùng cho Hub, hồ sơ, bảng xếp hạng và cửa hàng, nên khung không lệch tâm, không méo, không che mặt.
- Admin chỉnh bằng thanh trượt, xem trước trên avatar mẫu ở 3 cỡ.

## Kho đồ (`inventory_items`)

- Mỗi vật phẩm sở hữu là một bản ghi, kèm nguồn nhận, tham chiếu (id thư hoặc thao tác admin) và thời gian.
- Khung và avatar: chỉ sở hữu **một lần**. Chỉ mục unique ở DB nên kể cả gửi đồng thời cũng không nhân đôi.
- Vật phẩm sưu tầm có thể có nhiều bản.
- Trang bị/tháo: `POST /api/me/equip { slot: 'frame' | 'avatar', itemId | null }`. Chỉ trang bị được thứ mình sở hữu; khung mặc định `classic` miễn phí cho mọi người.
- Admin thu hồi một bản (khi tặng nhầm) thì vật phẩm tự được tháo nếu đang dùng.

## Hộp thư (`mail_messages`, `mail_batches`)

- Loại thư: system, reward, event, compensation, admin.
- Đính kèm: Cxu Bạc, Cxu Vàng, vật phẩm (tối đa 10).
- **Nhận thưởng:**
  - Khoá dòng thư (`FOR UPDATE`) rồi ghi ledger (`reason = 'mail'`, `ref = 'mail:<id>'`), cấp vật phẩm và đặt `claimed_at`, tất cả trong **một transaction**. Bấm nhiều lần hay rớt mạng giữa chừng không bao giờ trả trùng hoặc mất thưởng.
  - Vật phẩm unique đã sở hữu thì được ghi `already_owned`, không nhân đôi.
  - Cần tài khoản đã xác minh email.
- **Hết hạn:** mặc định 30 ngày (admin chọn 1–365 hoặc không hết hạn). Thư hết hạn không nhận được nữa, vẫn hiện 30 ngày rồi ẩn.
- **Xoá:** không xoá được thư còn quà chưa nhận và chưa hết hạn.
- **Gửi** (`POST /api/admin/mail`):
  - Tới danh sách UID (≤ 500) hoặc **tất cả người chơi** (một câu `INSERT … SELECT`, không gửi cho Keyo Support).
  - Cần `mail.send`; thêm `economy.grant` nếu kèm tiền, `items.grant` nếu kèm vật phẩm.
  - Luôn phải xác thực lại; idempotency theo khoá; ghi audit `mail.send`.
- Người nhận được báo realtime qua sự kiện WebSocket `mail`.

## API

| Method | Đường dẫn | Quyền |
|---|---|---|
| GET | `/api/catalog` | công khai |
| GET | `/api/assets/:id` | công khai |
| GET | `/api/me/inventory` · POST `/api/me/equip` | người chơi |
| GET | `/api/mail` · POST `/api/mail/:id/read` · `/claim` · `/api/mail/claim-all` · DELETE `/api/mail/:id` | người chơi |
| PUT | `/api/admin/assets` (body là ảnh) | `items.manage` |
| GET/POST/PATCH | `/api/admin/items[/:id]` · GET `/api/admin/items/:id/owners` | `items.read` / `items.manage` |
| POST | `/api/admin/items/:id/grant` · `/api/admin/inventory/:id/revoke` | `items.grant` + xác thực lại |
| POST | `/api/admin/mail` · GET `/api/admin/mail/batches` | `mail.send` (+ quyền tài nguyên) / `mail.read` |
