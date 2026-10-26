# Keyo Game: nâng cấp Admin, Xã hội, Giao diện và Blackjack

Nhánh: `claude/keyo-full-upgrade`, tách từ `Corgi-Casino` tại commit `dde331a` (sau khi merge PR #15).

- Mọi thay đổi database chỉ **thêm**, không sửa hay xoá dữ liệu cũ.
- Server luôn là nguồn xác thực cuối cùng; giao diện chỉ hiển thị.

## 1. Admin Dashboard

| Chức năng | API | Ai được dùng | Bảo vệ |
|---|---|---|---|
| Đặt mật khẩu mới cho tài khoản khác | `POST /api/admin/users/:uid/password {password, reason}` | Owner, Super Admin | (xem bên dưới) |
| Gỡ email | `POST /api/admin/users/:uid/email/unlink {reason}` | Owner, Super Admin | (xem bên dưới) |
| Ban / gỡ ban / đổi thời hạn | `POST /api/admin/users/:uid/bans`, `POST /api/admin/bans/:id/revoke`, `PATCH /api/admin/bans/:id` | theo `users.ban` và cấp bậc | không ban được UID 1000/1002; người bị ban bị ngắt kết nối ngay |

**Bảo vệ chung cho đặt mật khẩu và gỡ email.** Server kiểm tra:
- Người thao tác phải có vai trò Owner hoặc Super Admin dựng sẵn. Custom Role không bao giờ được, kể cả khi bị gán nhầm quyền (`HIGH_TRUST_ROLES`).
- Phải nhập lại mật khẩu quản trị.
- Phải có cấp bậc cao hơn tài khoản mục tiêu. Super Admin không thao tác được Owner hay Super Admin khác.
- Không được thao tác UID 1000.
- Không được tự thao tác chính mình qua công cụ Admin.

**Đặt mật khẩu mới:**
- Thu hồi toàn bộ phiên đăng nhập của tài khoản (tăng `token_version`) và ngắt WebSocket.
- Vô hiệu mọi link khôi phục hoặc xác minh đang mở.
- Audit log chỉ ghi người thao tác, UID mục tiêu, thời gian và lý do. Không ghi mật khẩu.

**Gỡ email:**
- Giữ nguyên ví, vật phẩm và tiến trình.
- Huỷ token xác minh và khôi phục.
- Audit log lưu email đã che bớt.
- Người chơi liên kết email mới vẫn phải xác minh.

Trang Người chơi có thêm:
- khối **Khôi phục tài khoản**, chỉ hiện cho Owner và Super Admin;
- khối **Trạng thái tài khoản**: kéo dài, rút ngắn hoặc chuyển ban sang vĩnh viễn;
- email hiển thị đã che bớt.

Chủ bang bị ban trên 30 ngày (hoặc vĩnh viễn) sẽ tự chuyển quyền chủ bang (xem mục 4).

## 2. Blackjack

**Luật** (`packages/shared/src/games/blackjack.ts`):
- 6 bộ bài, nhà cái dừng ở mọi điểm 17, nhà cái kiểm tra Blackjack trước khi người chơi hành động.
- Natural Blackjack trả 3:2.
- Hit, Stand, Double.
- **Split:** tối đa 4 tay. Tách Át thì mỗi tay nhận đúng 1 lá. Được Double sau khi Split. 21 sau khi Split trả 1:1.
- Insurance khi nhà cái ngửa A (xem `docs/BLACKJACK_LIVE.md`). Chưa có Surrender.

**Server:**
- Tiền cược Double/Split bị trừ qua ledger trước khi hành động; không đủ tiền thì huỷ cả hành động.
- Trả thưởng đúng một lần lúc kết thúc ván.
- Ván đang chơi lưu trong `game_rounds`, nên mất kết nối hoặc server khởi động lại vẫn chơi tiếp được.
- Gửi lại cùng request id thì server phát lại kết quả, không thực hiện lần nữa.
- Ván cũ lưu theo định dạng một tay vẫn chơi tiếp được.

**Bàn nhiều người** (tối đa 5 người): xem `docs/BLACKJACK_LIVE.md`.

## 3. Bank

**Giao diện mới:**
- Tổng tài sản; thẻ Cxu Bạc và Cxu Vàng, mỗi thẻ hiện số trong ví và trong két.
- Gửi và rút với nút 25/50/75%/Tất cả, xem trước số dư sau giao dịch.
- Lịch sử có lọc và phân trang.

**Server (đã atomic và idempotent từ trước):**
- Thử lại khác nội dung, hoặc dùng khoá của người khác, trả `idempotency_conflict`.
- Có giới hạn tần suất.
- Mỗi giao dịch ở client dùng một khoá idempotency, nên lỗi mạng rồi thử lại không trừ tiền hai lần.

## 4. Guild

- **Vai trò:**
  - Bang chủ: mọi quyền.
  - Phó bang (tối đa 5): mời người, mời thành viên thường ra khỏi bang, sửa giới thiệu và giao diện.
  - Thành viên: chat, rời bang.
- **Chuyển quyền bang chủ:** cần mật khẩu. Bang chủ cũ trở thành phó bang.
- **Giải tán:** cần mật khẩu và gõ đúng tên bang.
  - Thành viên được rời bang; lịch sử và chat vẫn giữ.
  - Tên bang được giải phóng; phí lập bang không hoàn.
- **Bang chủ bị xoá tài khoản hoặc ban trên 30 ngày:** quyền chủ bang chuyển cho phó bang lâu năm nhất, nếu không có thì thành viên lâu năm nhất, nếu không còn ai thì bang tự giải tán.
- Bang có huy hiệu, màu cờ, giới thiệu, chế độ gia nhập (mở tự do hoặc chỉ nhận lời mời), bảng xếp hạng, nhật ký.
- **Phí lập bang:** 300 Cxu Vàng, như cũ.

## 5. Bạn bè và tặng quà

- **Kết bạn:**
  - Tìm theo UID hoặc phần đầu tên.
  - Gửi, nhận, từ chối, huỷ lời mời; huỷ kết bạn.
  - Hai người cùng mời nhau thì thành bạn ngay.
- Hiển thị online/offline, kể cả khi chạy nhiều server (qua Redis). Xem hồ sơ công khai.
- **Keyo Support (UID 1000):** không còn tự động thành bạn của người chơi mới. Quan hệ cũ vẫn giữ trong database nhưng API không bao giờ liệt kê.
- **Tặng quà:**
  - Tặng được Cxu Bạc hoặc vật phẩm sưu tầm cho phép chuyển nhượng (không đang rao bán, chưa hết hạn).
  - **Cxu Vàng không tặng được.**
  - Phải là bạn bè đủ 24 giờ.
  - Mỗi lần 100–5.000 Cxu Bạc; mỗi người gửi tối đa 5.000 Cxu Bạc mỗi ngày (cập nhật trong `docs/BLACKJACK_LIVE.md`).
  - Trừ người gửi và cộng người nhận trong cùng một giao dịch.
  - Mỗi lần tặng có id do client tạo, nên không bao giờ gửi hai lần.
  - Có lịch sử tặng và nhận.
- Các giới hạn nằm trong `SOCIAL_RULES` (`packages/shared/src/social.ts`).

## 6. Support Center

- Mục **Hỗ Trợ** riêng trên menu.
- **Ticket:**
  - Chọn chủ đề, ghi nội dung.
  - Theo dõi trạng thái (Đang chờ, Đang xử lý, Đã đóng) và xem lịch sử.
  - Người chơi tự đóng ticket, mở lại trong vòng 14 ngày.
- **Quyền riêng tư:**
  - Chỉ chủ ticket và nhân viên có quyền `support.read` (Support, Admin trở lên) xem được. Người khác nhận 404.
  - Người chơi thấy phản hồi nhân viên dưới tên "Keyo Support"; tên nhân viên chỉ hiện cho nhân viên.
- **Thông báo:** WebSocket báo ngay khi có phản hồi; menu có chấm đỏ cho phản hồi chưa đọc.
- Admin có trang **Hỗ trợ** (hàng chờ): lọc, tìm, nhận xử lý, trả lời, đóng ticket. Có audit log.

## 7. Nhiệm vụ

| Nhóm | Làm mới | Ví dụ |
|---|---|---|
| Ngày | 00:00 UTC | chơi 3 ván, thắng 1 ván, cược 20.000, chơi 3 ván bài |
| Tuần | thứ Hai 00:00 UTC | chơi 20 ván, thắng 10 ván, cược 300.000, chơi 25 ván bài |
| Rank | theo tuần hoặc theo mùa | 5 trận Rank trong tuần, thắng 3 trận, đạt Bạc / Vàng / Bạch Kim |

- **Tiến độ:** chỉ tính từ ván đã kết thúc (`game_rounds`) và kết quả Rank thật (`rank_events`). Trận bỏ ngang (rời trận hoặc AFK) không được tính.
- **Nhận thưởng:** mỗi kỳ chỉ nhận một lần (khoá chính trên `quest_claims`); trả qua ledger.
- **EXP VIP từ nhiệm vụ Rank:** mặc định tối đa **100 mỗi tuần**; Owner chỉnh trong khoảng 0–300.
- Ba mã nhiệm vụ cũ vẫn giữ, nên lượt nhận trước bản nâng cấp vẫn được tính.
- Mức thưởng do Owner (UID 1002) cấu hình trong **Admin → Nhiệm vụ** (xem `docs/BLACKJACK_LIVE.md`).

## 8. Chat

- Biểu tượng 💬 trên thanh trên cùng mở **một** giao diện, gồm đúng ba mục: Chat Server, Chat Guild, Chat Riêng. Bong bóng chat nổi kéo thả cũ đã bỏ.
- Tin nhắn đẩy qua WebSocket; khi kết nối lại thì tải lại.
- Hiển thị bong bóng chat, danh hiệu và huy hiệu đang trang bị.
- **Chat Guild:** chỉ thành viên bang xem và gửi được. Rời bang là mất quyền.
- **Chat Riêng:**
  - Phải là bạn bè mới gửi được. Sau khi huỷ kết bạn vẫn xem lại được tin cũ.
  - Có đếm tin chưa đọc; tin đang mở được đánh dấu đã đọc.
- **Kiểm duyệt:**
  - Lệnh cấm chat (mute) áp dụng cho cả ba kênh.
  - Mỗi người gửi tối đa một tin mỗi 2 giây trên mỗi kênh.
  - Moderator xoá tin, mute và gỡ mute (`POST /api/admin/chat/unmute`). Có audit log.

## 9. Database

Mỗi migration có file rollback thủ công trong `apps/server/drizzle/rollback/`.

| Migration | Nội dung |
|---|---|
| `0020_social_upgrade` | Thông tin bang mới (giới thiệu, huy hiệu, màu, chế độ gia nhập, giải tán); tên bang chỉ phải duy nhất trong các bang đang hoạt động; bảng `guild_invites`, `guild_log`, `gift_transfers`; bỏ trigger tự kết bạn với UID 1000; index tin nhắn chưa đọc |
| `0021_mission_rewards` | `quest_claims.reward`, `quest_claims.vip_exp` |
| `0022_support_center` | `support_ticket_messages.from_staff` (điền sẵn cho dữ liệu cũ) và các cột theo dõi đã đọc của ticket |
| `0023_mission_settings`, `0024_blackjack_tables` | Xem `docs/BLACKJACK_LIVE.md` |

`TEST_DATA_TABLES` đã đăng ký các bảng mới có tham chiếu người dùng.

## 10. Kiểm thử

- Test mới:
  - `adminRecovery.test.ts` (8)
  - `blackjack.test.ts` (8)
  - `social.test.ts` (12)
  - `missions.test.ts` (4)
  - `support.test.ts` (3)
  - `bank.test.ts` (4)
  - migration nâng cấp 0020–0022
  - 7 test engine Blackjack trong shared
- **Chạy test server cục bộ** cần PostgreSQL riêng biệt, giống CI: `TEST_DATABASE_URL=postgres://keyo_test:keyo_test@127.0.0.1:25432/keyo_auth_test`.
