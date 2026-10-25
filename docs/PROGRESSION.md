# Cấp độ 999, Đấu Rank, mùa giải và phần thưởng thống nhất

Mọi thay đổi EXP, Level và RP đều do server thực hiện; client chỉ hiển thị. Không có API nào cho người chơi tự sửa EXP hoặc RP.

- Luật thuần nằm ở `packages/shared/src/progression.ts`, có test.
- Service phía server: `apps/server/src/services/progression.ts`, `rank.ts`, `rewards.ts`.

## Cấp độ (1–999)

**Đường cong EXP:**
- Lên cấp L → L+1 cần `100 + 10·(L−1)` EXP (100, 110, 120 …).
- Tổng EXP để đạt cấp 999 là `totalExpForLevel(999)` ≈ 5,07 triệu.
- EXP không bao giờ vượt cấp 999 và không bao giờ âm.

**EXP từ gameplay:**
- Mỗi ván được chốt trên server cho 10 EXP, cộng thêm 5 nếu cược từ 1.000.
- Tối đa 3.000 EXP gameplay mỗi ngày (theo UTC).
- Số dư Cxu không ảnh hưởng tới cấp độ.
- EXP được cộng trong cùng transaction với tiền trả của ván, ở mọi đường chốt ván:
  - slots, roulette, sic bo;
  - blackjack (khi chia xong và sau mỗi lượt hành động);
  - bàn chung Tài Xỉu và Roulette.

**Chống nhận trùng:**
- `exp_events` có khóa duy nhất `(user_id, source_key)`, ví dụ `round:<id>`.
- Gửi lại cùng một tin nhắn, hoặc chốt ván lần thứ hai, không cho thêm EXP.

**Thưởng mốc cấp** (`level_rewards`):
- Owner hoặc Super Admin cấu hình trong Admin → Level & Rank.
- Khi đạt mốc, phần thưởng được gửi qua hộp thư với khóa `level:<n>`. Mỗi người chỉ nhận một lần, kể cả khi bị trừ EXP rồi lên lại cấp đó.

**Hiển thị:**
- Cấp độ hiện ở sảnh, thanh tiêu đề, hồ sơ, trang Đấu Rank và bảng xếp hạng cấp độ.
- Sau mỗi ván server gửi sự kiện `progress`. Khi lên cấp, client hiện thông báo "Lên cấp!".

## Đấu Rank

**Bậc rank:**
- 40 bậc thường: Đồng III → Chiến Thần I.
- 3 danh hiệu Top: Thần Vương (Top 11–50), Thần Tướng (Top 4–10), Vương Giả (Top 1–3).

| Quy tắc | Cách làm |
|---|---|
| Điểm mỗi bậc | Mỗi bậc cần 200 RP; phần RP dư được chuyển sang bậc mới khi thăng bậc thường |
| Thắng / thua | Mặc định thắng +25, thua −20; cấu hình theo từng mùa |
| Vùng bảo vệ | Đồng III → Vàng I: thua không mất RP, không hạ bậc, RP không âm |
| Vùng không bảo vệ | Từ Bạch Kim V: thua mất RP và có thể hạ bậc. Bạch Kim V có thể rớt về Vàng I với 200 − thiếu hụt RP; tại Vàng I lại được bảo vệ |
| Cảnh báo | `demotionRisk` bật khi trận thua kế tiếp sẽ làm hạ bậc |
| Chuỗi thăng hạng | Áp dụng ở Bạch Kim I, Kim Cương I, Ngôi Sao I, Bậc Thầy I, Huyền Thoại I (xem chi tiết bên dưới) |
| Chiến Thần I | RP tiếp tục tăng quá 200 và trở thành điểm xếp hạng Top |
| Top 50 | Xem chi tiết bên dưới |
| Ghi lịch sử | Mỗi thay đổi ghi vào `rank_events`; khóa `(season, user, match_key)` duy nhất nên mỗi trận chỉ tính một lần. Lịch sử không sửa được (trigger) |

**Chuỗi thăng hạng:**
- RP dừng ở 200. Từ đó mỗi trận thắng tính 1/3.
- Thắng 3 trận liên tiếp thì thăng lên bậc V của rank kế tiếp, RP về 0.
- Thua đặt chuỗi về 0/3 và trừ RP như thường; phải tích lũy lại đủ 200 RP mới mở lại chuỗi.
- Trận thắng làm RP chạm 200 không tính vào chuỗi.

**Top 50:**
- Chỉ người có Chiến Thần I với ít nhất 200 RP mới được xét.
- Xếp theo RP giảm dần. Đồng điểm thì ai đạt mức RP đó sớm hơn xếp trên; vẫn bằng nhau thì UID nhỏ hơn xếp trên.
- Mỗi người chỉ có tối đa một danh hiệu, theo vị trí hiện tại.
- Vị trí Top tốt nhất trong mùa được lưu ở `peak_top_position`.

**Ghi nhận kết quả trận:** game gọi `recordRankedMatch(db, matchKey, results[])`.
- Tất cả người chơi trong trận được xử lý trong một transaction.
- Các dòng được khóa theo thứ tự cố định để tránh deadlock.
- Không có mùa đang chạy thì trả `season_inactive`.

**Điều chỉnh của nhân sự:**
- Chỉ người có quyền `progression.manage` (Owner, Super Admin), kèm xác thực lại mật khẩu, lý do, khóa idempotency và audit log.
- Admin chỉ có quyền xem (`progression.read`). Moderator và Support không xem được.

## Mùa giải

**Vòng đời:** `scheduled` → `active` → `ended`.
- Chỉ một mùa được ở trạng thái active (unique index).
- Mùa tự bắt đầu và tự kết thúc theo ngày giờ (kiểm tra mỗi 60 giây khi `TABLE_SCHEDULER=on`). Owner cũng có thể bắt đầu hoặc kết thúc sớm.

**Kết thúc mùa** (`endSeason`):
- Thực hiện đúng một lần nhờ cập nhật có điều kiện trạng thái.
- Chốt hạng cuối mùa của mọi người vào `rank_season_results`, kèm vị trí và danh hiệu Top.
- Gửi thưởng theo rank chính và thưởng danh hiệu Top qua hộp thư (`season:<id>:tier`, `season:<id>:top`), không gửi trùng.
- Cấp độ tài khoản không bị đụng tới.

**Reset mềm:** bậc của người chơi ở mùa mới = bậc cuối mùa trước trừ `softResetDivisions` (mặc định 5, thấp nhất là Đồng III), RP về 0. Quy tắc này được hiển thị cho người chơi trên trang Đấu Rank.

## Phần thưởng thống nhất

`deliverReward(tx, { userId, key, kind, text, attachments })` là đường cấp thưởng tự động duy nhất.
- Mỗi phần thưởng là một thư có đính kèm.
- `mail_messages.reward_key` duy nhất theo người chơi, nên mỗi phần thưởng chỉ giao một lần, kể cả khi nhiều request hoặc nhiều instance chạy đồng thời.
- Cxu đi qua ledger và vật phẩm đi qua kho đồ, chỉ khi người chơi bấm nhận thư. Việc nhận thư cũng đúng một lần (khóa dòng thư).

Đang dùng cho thưởng mốc cấp và thưởng mùa. Giftcode, thành tích, VIP và sự kiện sẽ dùng cùng hàm này.

## API

**Người chơi:**
- `GET /api/me/progress`
- `GET /api/me/rank/history`
- `GET /api/me/rank/seasons`
- `GET /api/leaderboard/level`
- `GET /api/rank/ladder[?seasonId]`
- `GET /api/rank/seasons`

**Admin** (xem cần `progression.read`; sửa cần `progression.manage` + xác thực lại):
- `GET`, `PUT`, `DELETE` `/api/admin/progression/level-rewards[/:level]`
- `GET`, `POST` `/api/admin/rank/seasons`
- `PATCH /api/admin/rank/seasons/:id`
- `POST /api/admin/rank/seasons/:id/start`
- `POST /api/admin/rank/seasons/:id/end`
- `GET`, `POST` `/api/admin/users/:uid/progression`

**WebSocket:** sự kiện `progress { expGained, level, levelsGained }`.

## Migration `0007_progression_rank`

**Nội dung:**
- Bảng mới: `player_progress`, `exp_events`, `level_rewards`, `rank_seasons`, `player_ranks`, `rank_events`, `rank_season_results`.
- Thêm cột `mail_messages.reward_key` (cho phép null) cùng unique index một phần.
- Trigger chặn sửa `exp_events` và `rank_events`.

**An toàn dữ liệu:**
- Không sửa dữ liệu cũ. Người chơi chưa có dòng `player_progress` được tính là cấp 1.
- Có test nâng cấp trong `test/migrations.test.ts`.
- Rollback: `drizzle/rollback/0007_progression_rank.down.sql` (cần chủ dự án đồng ý và đã sao lưu). Thư thưởng đã gửi vẫn ở lại hộp thư.
- `reset:test-data` đã đăng ký đủ các bảng mới (xóa theo `user_id` của tài khoản test).

## Kiểm thử

**Shared** (`test/progression.test.ts`, 11 test):
- đường cong cấp độ và giới hạn cấp 999;
- 40 bậc; 200 RP mỗi bậc;
- vùng bảo vệ; rớt từ Bạch Kim V xuống Vàng I;
- chuỗi 3 trận và thua thì đặt lại chuỗi;
- điểm ở Chiến Thần I; danh hiệu Top; reset mềm.

**Server** (`test/progression.test.ts`, 12 test, chạy với PostgreSQL thật):
- EXP mỗi ván chỉ cộng một lần, kể cả khi gửi lại cùng tin nhắn;
- giới hạn EXP mỗi ngày;
- thưởng mốc cấp chỉ gửi một lần; không vượt cấp 999;
- phân quyền: Admin chỉ xem; Moderator bị chặn; Super Admin sửa được; người chơi không có API tự sửa;
- không có mùa thì không ghi nhận trận; chỉ một mùa chạy cùng lúc;
- trận gửi lại hoặc gửi đồng thời chỉ tính một lần; vùng bảo vệ đúng;
- rớt từ Bạch Kim V xuống Vàng I rồi được bảo vệ; chuỗi Bạch Kim I;
- Top 3/10/50 và cách phá hòa;
- RP chỉ Owner chỉnh được, có audit log;
- kết thúc mùa đúng một lần, thưởng không trùng, reset mềm ở mùa mới, cấp độ giữ nguyên.

**Migration:** test nâng cấp 0007.

**E2E trình duyệt:**
- Super Admin tạo mùa, bắt đầu mùa và đặt thưởng cấp 2 qua giao diện (có xác thực lại mật khẩu).
- Người chơi chơi 1 ván Sic Bo: lên cấp 2, thấy thông báo "Lên cấp!", nhận đúng 1 thư thưởng.
- Trang Đấu Rank hiển thị chuỗi 1/3 và danh hiệu Vương Giả.
- Admin xem được tab "Cấp độ & Rank" của người chơi.
- Bố cục điện thoại 844×390.

## Chưa có trong giai đoạn này

**Tìm trận và ghép trận Rank:** cần game đối kháng (Poker, Liêng, Xì Tố, Giai đoạn 4b–4c). Engine Rank đã sẵn sàng qua `recordRankedMatch`. Khi thêm game đối kháng phải xử lý:
- AFK, rời trận và mất kết nối;
- chống thông đồng.

Hiện trang Đấu Rank ghi rõ điều này và không có nút "Tìm trận" giả.

**Nhiệm vụ:** là nguồn EXP đã có sẵn trong code (`source: 'quest'`) nhưng chưa có hệ thống nhiệm vụ.

**Kết thúc mùa với rất nhiều người chơi:** hiện xử lý trong một transaction. Khi lượng người chơi lớn nên chia lô.
