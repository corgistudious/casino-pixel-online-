# Keyo Game: tương tác người chơi, hồ sơ công khai, phòng riêng và Thần Thoại

Bản nâng cấp này dùng lại các hệ thống sẵn có: đăng nhập, realtime, engine bài, ví/ledger, bạn bè và Rank. Không viết lại game, không đổi dữ liệu người chơi (ngoài việc chuyển RP ở bậc Rank mới, mô tả bên dưới).

## 1. Menu tương tác người chơi

- Một component dùng chung (`apps/web/src/players/PlayerActions.tsx`):
  - `PlayerTrigger` bọc tên hoặc avatar.
  - `PlayerActionHost` hiển thị popover và chỉ gắn một lần trong `App`, nên không bao giờ có nhiều menu chồng nhau.
- **Áp dụng tại:** chat Server / Guild / Riêng, danh sách bạn bè, lời mời đến và đi, tìm người chơi, thành viên bang hội, Bảng Xếp Hạng, bảng Rank và bảng Level, ghế bàn Blackjack, danh sách người chơi trong phòng (bàn bài và Blackjack), danh sách người theo dõi và đang theo dõi, chủ phòng trong danh sách phòng.
- **Hành động thay đổi theo quan hệ:**
  - Chưa kết bạn: Thêm bạn bè.
  - Đã gửi lời mời: Đang chờ xác nhận / Hủy lời mời.
  - Nhận được lời mời: Chấp nhận / Từ chối.
  - Đã là bạn: Nhắn tin / Hủy kết bạn.
  - Luôn có: Theo dõi hoặc Bỏ theo dõi, Tố cáo, Chặn hoặc Bỏ chặn.
  - Bấm vào chính mình: Hồ sơ của tôi và Quyền riêng tư.
- **Thao tác:**
  - Dùng được bằng chuột, cảm ứng và bàn phím: mũi tên lên/xuống, Esc để đóng, focus trở về nút đã bấm.
  - Tự đổi vị trí khi gần mép màn hình (đã kiểm tra ở 844×390 ngang).
  - Hủy kết bạn và Chặn cần xác nhận.
  - Không làm gián đoạn kết nối realtime.
- Tin nhắn chat Server và Guild của người mình đã chặn bị ẩn ở phía client. Tin nhắn riêng vốn đã yêu cầu là bạn bè, mà chặn thì hủy kết bạn.

## 2. Hồ sơ công khai `/player/:uid`

- **Thông tin hiển thị:**
  - Avatar và khung, tên, UID, huy hiệu Verified/Partner, cấp, VIP (huy hiệu), Rank mùa này kèm danh hiệu Top, danh hiệu đang dùng, ngày tham gia, bang hội.
  - Trạng thái online (nếu người chơi cho phép).
  - Số người theo dõi, số đang theo dõi, lượt thích, số bạn bè.
- **Thống kê thật**, lấy từ `game_rounds` đã quyết toán:
  - Tổng trận, thắng (thưởng > cược), thua (thưởng < cược), hòa, tỷ lệ thắng, thắng lớn nhất.
  - Bảng thống kê theo từng trò chơi.
- **Thành tích và bộ sưu tập:** thành tích đã nhận, danh hiệu đã mở, bộ sưu tập (vật phẩm còn hiệu lực) và tối đa 6 vật phẩm trưng bày do người chơi chọn.
- **Số dư:**
  - Chỉ trả về Cxu Bạc và Cxu Vàng trong `wallets`, tức là ngoài Ngân hàng.
  - API hồ sơ không bao giờ đọc `bank_accounts`.
  - Có test kiểm tra: sau khi gửi 30.000 vào Bank, hồ sơ giảm đúng 30.000 và không chứa khóa nào liên quan đến email, mật khẩu, token, IP, bank, id nội bộ.
- **Quyền riêng tư** (`profile_settings`): ẩn hoặc hiện trạng thái online, số bạn bè, bộ sưu tập, thống kê. Số dư ví ngoài Bank luôn công khai theo yêu cầu.
- **Theo dõi và Thích:**
  - Khóa chính `(người làm, người nhận)` cộng `ON CONFLICT DO NOTHING`, nên gửi nhiều request đồng thời không tạo bản ghi trùng và không tăng số đếm sai.
  - Không thể tự theo dõi hoặc tự thích (CHECK constraint và kiểm tra ở server).
  - Số đếm luôn do server tính; con số client gửi lên bị bỏ qua.
- **Chặn:** xóa quan hệ bạn bè, lời mời và theo dõi cả hai chiều; từ chối kết bạn, theo dõi, thích và mời vào phòng cho đến khi bỏ chặn.
- **Keyo Support (UID 1000)** không thể bị xem hồ sơ, theo dõi, thích, kết bạn hay tố cáo (trả về 404). Không đổi gì ở UID 1002 hay RBAC.

## 3. Tố cáo người chơi

- Gửi từ menu tương tác hoặc trang hồ sơ: lý do (Gian lận, Quấy rối, Spam, Nội dung không phù hợp, Lạm dụng lỗi game, Giả mạo, Khác), mô tả 10–1000 ký tự, nơi xảy ra (ví dụ `chat:server`, `room:card:r-…`).
- **Trạng thái:** Đang chờ → Đang xem xét → Đã xử lý / Bị từ chối. Trạng thái cuối không mở lại được.
- **Chống spam:**
  - Mỗi người tố cáo chỉ có một tố cáo đang mở với cùng một người (unique index một phần).
  - Tối đa 10 tố cáo mỗi ngày (kiểm tra khi giữ khóa dòng của người tố cáo).
  - Giới hạn 10 request mỗi phút trên mỗi IP.
- **Quyền riêng tư:** người bị tố cáo không bao giờ biết ai đã tố cáo; người tố cáo chỉ xem được tố cáo của mình.
- **Quản trị:**
  - Trang **Admin → Tố cáo**, cần quyền `reports.manage` (Moderator, Admin trở lên).
  - Mỗi lần đổi trạng thái ghi audit `reports.update`.
  - Nhân viên không thể xử lý tố cáo do chính mình gửi hoặc nhắm vào chính mình.
- **Không bao giờ tự động khóa tài khoản** dù có bao nhiêu tố cáo.

## 4. Phòng riêng: Poker, Xì Tố, Liêng, Blackjack

- Một phòng là một dòng `card_tables` hoặc `bj_tables` có `kind = 'room'`, kèm thông tin trong `game_rooms`.
- Phòng chạy bằng chính engine của bàn chính thức: chia bài, vòng cược, pot và side pot, showdown, Insurance, Split; ledger, quyết toán idempotent, server quyết định mọi thứ. Không có engine rút gọn nào.
- Bàn chính thức không đổi; sảnh chính thức chỉ liệt kê bàn `official`.
- **Tạo phòng** (`/custom-rooms`):
  - Chọn trò chơi, tên (3–24 ký tự), Công khai hoặc Riêng tư (mật khẩu 4–32 ký tự), mức cược trong danh sách cho phép, số ghế không vượt luật từng trò.
  - Cấu hình bàn bài lấy theo bàn chính thức, nhân theo mù lớn. Blackjack: mức cược tối thiểu đến gấp 100 lần.
  - Mỗi người chỉ mở một phòng cùng lúc.
- **Mật khẩu:**
  - Lưu bằng Argon2id, không bao giờ gửi ra client.
  - Sai 5 lần trong một phòng hoặc 20 lần trên mọi phòng trong 15 phút thì mọi lần thử bị từ chối (kể cả đúng mật khẩu) cho đến hết khoảng thời gian đó.
- **Không thể vượt qua cổng truy cập:**
  - `assertRoomAccess` chạy bên trong transaction `sit` của cả hai engine và khi `card.join` / `bjt.join` qua WebSocket.
  - API xem bàn ẩn danh (`/api/cards/tables/:id`, `/api/bjt/tables/:id`) từ chối bàn của phòng.
- **Chủ phòng:**
  - Mời bạn bè: được vào thẳng không cần mật khẩu; từ chối nếu không phải bạn bè, đã chặn nhau, hoặc phòng đã đủ người.
  - Đổi tên, chế độ, mật khẩu, mức cược, số ghế, chỉ khi đang giữa hai ván (`room_busy`). Đổi mật khẩu hoặc chuyển sang Riêng tư thì thu hồi quyền vào của người chỉ biết mật khẩu cũ mà chưa ngồi.
  - Mời một người ra khỏi phòng: dùng đúng luồng rời ghế. Đang trong ván thì người đó tự bỏ bài hoặc Stand khi đến lượt và được thanh toán đầy đủ khi ván kết thúc. Sau đó họ không vào lại được trong 30 phút.
  - Đóng phòng khi không còn ai ngồi.
- **Tự động:**
  - Chủ phòng mất kết nối nhưng vẫn ngồi thì vẫn là chủ.
  - Rời ghế quá 60 giây trong khi người khác đang chơi thì quyền chủ chuyển cho người ngồi lâu nhất (người đó không đang làm chủ phòng khác).
  - Phòng trống 10 phút thì tự đóng.
  - Vào lại sau khi mất kết nối: đúng ghế, đúng trạng thái.
  - Hai người cùng chọn một ghế: một người ngồi được, người kia nhận `seat_taken` và không mất Cxu.

## 5. Rank: Thần Thoại và danh hiệu Top

- **Lộ trình:** Đồng III … Chiến Thần I → **Thần Thoại** (bậc thứ 41, 200 RP) → danh hiệu Top.
  - Chiến Thần I giờ thăng hạng như mọi bậc khác.
  - Ở Thần Thoại, RP tiếp tục tăng sau mốc 200 (MAX) và trở thành điểm xếp hạng Top 50.
- **Danh hiệu Top chỉ dành cho người đã MAX Thần Thoại:**

| Điều kiện | Danh hiệu |
|---|---|
| Thần Thoại chưa MAX, hoặc MAX nhưng ngoài Top 50 | Thần Thoại |
| MAX, Top 11–50 | Thần Vương |
| MAX, Top 4–10 | Thần Tướng |
| MAX, Top 1–3 | Vương Giả Chí Tôn |

- **Danh hiệu được tính từ bảng xếp hạng hiện tại mỗi lần đọc**, nên lên hoặc xuống hạng là đổi ngay, không bao giờ trừ RP, và mỗi người chỉ có một danh hiệu Top.
- **Xếp hạng:** theo RP, bằng điểm thì ai đạt trước xếp trên, sau đó UID nhỏ hơn. Loại trừ tài khoản hệ thống, đang bị ban, bị loại vì gian lận. Nếu chưa đủ 50 người MAX thì chỉ có ít danh hiệu hơn.
- Mùa giải, reset mềm và thưởng mùa giữ nguyên như trước; không tự reset Rank.
- **Huy hiệu mới:**
  - Thần Thoại: mặt trời trên trăng lưỡi liềm, vòng hào quang, không số La Mã.
  - Thần Vương: một vương miện.
  - Thần Tướng: thêm hai lưỡi kiếm chéo.
  - Vương Giả Chí Tôn: thêm tia sáng và hiệu ứng phát sáng nhẹ (tắt khi người dùng bật giảm chuyển động của hệ thống).
  - Hiển thị ở hồ sơ, menu tương tác, Bảng Rank, danh sách bạn bè và thanh tiến độ.

## 6. API và sự kiện realtime mới

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/players/:uid` | Hồ sơ công khai (allowlist) |
| GET | `/api/players/:uid/followers`, `/following` | 50 người mỗi trang, phân trang bằng `?before=` |
| POST | `/api/players/follow`, `/unfollow`, `/like`, `/unlike`, `/block`, `/unblock` | `{ uid }` |
| GET | `/api/me/blocks` | Người tôi đã chặn |
| PUT | `/api/me/privacy` | Quyền riêng tư và vật phẩm trưng bày |
| POST | `/api/reports` | Gửi tố cáo |
| GET | `/api/reports/mine` | Tố cáo của tôi |
| GET / POST | `/api/admin/reports`, `/api/admin/reports/:id` | Cần `reports.manage`, có audit |
| GET / POST | `/api/rooms` | Danh sách (lọc theo trò chơi, công khai, riêng tư, còn chỗ) và tạo phòng |
| GET | `/api/rooms/:id`, `/api/rooms/by-table/:engine/:tableId` | Thông tin phòng |
| POST | `/api/rooms/:id/join` | `{ password? }` |
| PATCH | `/api/rooms/:id` | Đổi cài đặt (chỉ chủ phòng, giữa hai ván) |
| POST | `/api/rooms/:id/invite`, `/kick`, `/close` | Chỉ chủ phòng |

- **Sự kiện WebSocket:**
  - `room`: phòng đổi cài đặt, đổi chủ hoặc đóng; gửi cho người đang xem bàn.
  - `roomInvite`: lời mời của bạn bè.
  - `roomKicked`: bị mời ra khỏi phòng.
  - `social` có thêm kiểu `followed` và `liked`.
- **Mã lỗi mới** (có bản dịch vi/en): `blocked`, `self_social`, `follow_limit`, `report_duplicate`, `report_limit`, `room_password`, `room_locked`, `room_kicked`, `room_full`, `room_busy`, `room_limit`, `room_closed`, `not_room_owner`.

## 7. Database

| Migration | Nội dung | Rollback |
|---|---|---|
| `0025_rank_mythic` | Nới CHECK `player_ranks.division` lên 0–40. Chuyển Chiến Thần I có RP ≥ 200 thành Thần Thoại với phần dư (bậc 39 + R RP → bậc 40 + (R − 200) RP), **tổng RP của mỗi người giữ nguyên** | `drizzle/rollback/0025_rank_mythic.down.sql` (khôi phục tổng RP, cần triển khai lại code bản trước) |
| `0026_social_profile` | `player_follows`, `profile_likes`, `player_blocks`, `profile_settings`, `player_reports` | `drizzle/rollback/0026_social_profile.down.sql` |
| `0027_private_rooms` | `card_tables.kind`, `bj_tables.kind` (mặc định `official`), `game_rooms`, `room_access`, `room_join_attempts` | `drizzle/rollback/0027_private_rooms.down.sql` (đóng phòng, chờ hết người ngồi rồi mới xóa) |

- Mọi bảng mới có khóa ngoại, index, unique hoặc CHECK cần thiết.
- Không có `DROP` hoặc `TRUNCATE` trong migration lên. Không đổi UID, ví hay Bank.
- `TEST_DATA_TABLES` đã đăng ký mọi khóa ngoại mới. Phòng của tài khoản TEST được chuyển cho Keyo Support khi reset (người thật có thể đang ngồi trong phòng đó).
- **Lưu ý về danh hiệu Top sau migration 0025:** người chơi đang ở Chiến Thần I với 200–399 RP sẽ thành Thần Thoại chưa MAX, nên tạm mất danh hiệu Top cho đến khi đủ 200 RP ở Thần Thoại. Không ai mất điểm.

## 8. Triển khai Production an toàn

1. Owner duyệt và merge PR vào `Corgi-Casino`. Không tự triển khai.
2. Sao lưu: `pg_dump -Fc` database Production và kiểm tra file sao lưu (giống quy trình trong `docs/DEPLOY.md`).
3. Thông báo bảo trì ngắn. Dừng game server để không có ván Rank nào đang quyết toán khi migration 0025 chạy.
4. Triển khai bản build mới. Server tự chạy migration 0025 → 0027 khi khởi động, theo thứ tự trong journal.
5. Kiểm tra:
   - `SELECT division, count(*) FROM player_ranks GROUP BY 1` (có bậc 40 nếu trước đó có người Chiến Thần I ≥ 200 RP).
   - `SELECT count(*) FROM card_tables WHERE kind <> 'official'` phải bằng 0 trước khi người chơi tạo phòng.
   - Mở `/api/health`, đăng nhập, xem một hồ sơ, tạo thử một phòng công khai rồi đóng.
6. Mở lại cho người chơi.

## 9. Rollback không mất dữ liệu

- **Chỉ code:** triển khai lại bản trước. Lưu ý bản trước chỉ biết 40 bậc Rank: nếu đã có người ở Thần Thoại, phải chạy rollback 0025 trước.
- **Database** (Owner duyệt và đã sao lưu), theo thứ tự ngược 0027 → 0026 → 0025, dùng các file trong `apps/server/drizzle/rollback/`:
  - 0027: đóng mọi phòng và chờ hết người ngồi. Chip ở bàn phòng được engine trả về ví khi người chơi rời ghế. Bảng ván, ledger và `game_rounds` giữ nguyên.
  - 0026: nên xuất `player_reports` ra CSV trước nếu cần giữ lịch sử kiểm duyệt.
  - 0025: chuyển Thần Thoại về Chiến Thần I với cùng tổng RP.
  - Sau mỗi bước, xóa dòng migration tương ứng trong `drizzle.__drizzle_migrations`.

## 10. Kiểm thử

- `apps/server/test/socialProfile.test.ts` (8 test):
  - Ví ngoài Bank, không lộ Bank, email, token.
  - Thống kê thật; quyền riêng tư.
  - Không tự làm với chính mình; theo dõi và thích đồng thời; UID 1000.
  - Chặn.
  - Tố cáo: trùng, giới hạn ngày, đồng thời, người bị tố cáo không thấy gì; hàng chờ quản trị, audit, không tự khóa.
- `apps/server/test/rooms.test.ts` (7 test):
  - Mật khẩu không lộ, mỗi người một phòng, sảnh chính thức không đổi.
  - Cổng truy cập qua WS và API; giới hạn đoán mật khẩu.
  - Tranh ghế đồng thời.
  - Đổi cài đặt giữa ván bị chặn; mời ra khỏi phòng giữa ván vẫn thanh toán một lần, tổng Cxu không đổi.
  - Lời mời chỉ cho bạn bè, phòng đầy thì từ chối.
  - Blackjack trong phòng trả thưởng một lần.
  - Chuyển chủ phòng, đóng phòng trống, vào lại sau mất kết nối.
- `apps/server/test/progression.test.ts`: danh hiệu Top cần MAX Thần Thoại; đổi danh hiệu theo thứ hạng; rơi khỏi Top 50; một danh hiệu mỗi người; không mất RP.
- `packages/shared/test/progression.test.ts`: 41 bậc; Chiến Thần I thăng Thần Thoại; điều kiện MAX.
- `apps/server/test/migrations.test.ts`: nâng cấp 0025 giữ tổng RP; nâng cấp 0026/0027 giữ nguyên ghế, chip, bạn bè; ràng buộc mới hoạt động.
