# Bảng xếp hạng mở rộng, phần thưởng xếp hạng & Thư viện khung

Nhánh `feat/leaderboards-frames`, xếp chồng trên `feat/custom-uid-accounts` (PR #26 → #25 → #24).
Không triển khai VPS, không chạy migration trên Production — cần Owner duyệt.

## 1. Nguồn dữ liệu (chỉ dữ liệu server)

| Bảng xếp hạng | Nguồn |
|---|---|
| Từng game (thắng, chuỗi dài nhất, chuỗi hiện tại, tỷ lệ thắng, trận tham gia, theo mùa) | `player_game_stats` / `player_game_daily`, do trigger trên `game_rounds` cập nhật khi một ván chuyển sang `settled` |
| VIP | `vip_progress` + `keyo_vip_level()` (cấp, rồi EXP) — không sửa VIP |
| Hấp Dẫn | `charm_points.total` (hiện tại) và `charm_ledger` (gift − gift_reversal trong kỳ; điều chỉnh của nhân viên không tính) |
| Hồ sơ | `profile_likes` / `player_follows` (mỗi cặp một dòng, không tự thích/tự theo dõi — ràng buộc DB có sẵn; bỏ thích/bỏ theo dõi là mất) |
| Tournament | `tournament_results` của giải `finished` + `confirmed_at` |
| Guild | `guilds.points`, `guild_win_events`, thành viên có ván trong tuần |
| Thành tích | `quest_claims`, `achievement_claims`, vật phẩm duy nhất còn hiệu lực |
| Tổng quan | hoạt động (số ván), Level, Tài sản (bảng cũ giữ nguyên) |

Mọi game đều ghi đúng **một** dòng `game_rounds` cho mỗi người chơi và ván đã kết toán (khóa duy nhất `(user_id, idempotency_key)`), nên retry/reconnect không bao giờ cộng hai lần. Ván bị hủy/hoàn tiền không bao giờ thành `settled`.

**Quy tắc chuỗi thắng** (mỗi game một chuỗi, không cộng giữa các game; Sic Bo và Tài Xỉu Live là cùng một game Tài Xỉu; Slots không xếp hạng):
- Thắng: tổng trả về > tổng cược → chuỗi +1. Hòa/push: trả về = cược (Blackjack push, chia pot, Tài Xỉu/Roulette hoàn đúng tổng cược) → giữ nguyên. Thua: còn lại → chuỗi về 0.
- Tài Xỉu/Roulette: một vòng là một đơn vị, gộp mọi cửa cược của người chơi trong vòng đó.
- Ván không có tiền cược (ghế bài không bỏ chip) không tính.
- Tỷ lệ thắng chỉ xếp khi có ≥ 20 ván trong kỳ.

**Kỳ** (UTC, bắt đầu 07:00 giờ Việt Nam): hôm nay, tuần (thứ Hai), tháng, mùa (khi có mùa Rank đang chạy), toàn thời gian. Mỗi bảng chỉ có các kỳ mà dữ liệu hỗ trợ. **Đồng hạng**: ba khóa sắp xếp cố định theo từng bảng (vd. thắng nhiều hơn, rồi ít ván hơn); bằng nhau hoàn toàn thì cùng hạng (1, 1, 3).

**Dữ liệu cũ**: trigger thu thập từ lúc deploy. Lệnh `pnpm --filter @casino/server stats:rebuild --operator TÊN [--execute]` tính lại từ toàn bộ `game_rounds` đã kết toán (chỉ đọc lịch sử, không đụng ví). Không có dữ liệu giả.

## 2. Phần thưởng (chốt tháng)

Mỗi phút server kiểm tra tháng vừa kết thúc; với 12 nhóm có thưởng (6 game · VIP · Hấp Dẫn · Hồ sơ nổi bật · Tournament · Guild · Sự kiện):
1. Xếp hạng lại từ dữ liệu server, lưu **snapshot bất biến** (`leaderboard_snapshots`, trigger cấm sửa/xóa).
2. Top 3 (đồng hạng chia hạng) nhận **khung đương kim** `lb_<nhóm>_<champion|elite|master>`, hết hạn cuối tháng kế tiếp (tự tháo khỏi hồ sơ), và **khung Đại Sảnh Danh Vọng** `hof_*` vĩnh viễn.
3. Ghi `leaderboard_awards` (append-only). Mọi thứ trong một transaction + advisory lock + khóa duy nhất → không trao trùng do retry, restart hay nhiều server.

Không chốt kỳ đang chạy; **không chốt tháng bắt đầu trước khi tính năng thu thập dữ liệu** (`leaderboard_state.tracking_since`), nên tháng đầu tiên được thưởng là tháng trọn vẹn đầu tiên sau deploy. Guild Top 3: mọi thành viên lúc chốt nhận khung Guild. VIP: chụp cấp VIP tại thời điểm chốt.

Tournament: hiện **repo chưa có hệ thống giải đấu**. Đã có bảng `tournaments` / `tournament_results`, hàm `finalizeTournament` (chỉ nhận giải đã kết thúc, một lần) và bảng khung Participant / Top 10 / Top 3 / Á quân / Vô địch / Đặc biệt. Bảng Tournament hiển thị trạng thái trống cho tới khi có giải đầu tiên được xác nhận.

## 3. Thư viện khung (74 khung, migration 0034)

| Nhóm | Số lượng | Trạng thái |
|---|---|---|
| Top 1/2/3 theo 12 nhóm bảng | 36 | phát hành (chỉ trao qua chốt tháng) |
| Đại Sảnh Danh Vọng Top 1/2/3 | 3 | phát hành (vĩnh viễn) |
| Theo mùa 2026: Halloween, Giáng Sinh, Năm Mới, Tết, Valentine, Mùa Hè, Trung Thu, Kỷ Niệm Keyo — mỗi chủ đề 3 khung (hiếm, sử thi, huyền thoại) | 24 | **draft** — Owner mở bán/định giá ở Quản trị → Vật phẩm |
| Tournament | 6 | phát hành (trao khi giải xác nhận) |
| Đặc quyền: Owner (Keyo Captain), Owner (Keyo_GM), Super Admin, Admin, Moderator | 5 | không bao giờ sở hữu |

Khung là **tác phẩm vector thật** (`apps/web/src/ui/FrameArt.tsx`): vành kim loại vát cạnh (dày và chi tiết hơn theo cấp), vương miện/tiara/nguyệt quế/cánh/khiên/đá quý, huy hiệu riêng từng nhóm (bích, xúc xắc, vòng quay, bài, chip, Át, VIP, tim, hồ sơ, cúp, cờ, sao…), họa tiết theo chủ đề (bí ngô, dơi, bông tuyết, pháo hoa, đèn lồng, hoa mai, rồng, hoa hồng, mặt trời, ngọc trai, thỏ ngọc, cung trăng, bánh kỷ niệm…). Tâm trong suốt, không che mặt, **không xoay**; hiệu ứng ánh kim lướt và lấp lánh nhẹ chỉ khi avatar ≥ 48 px, tắt khi giảm chuyển động. Dưới 36 px dùng bản rút gọn. Năm sau thêm khung mới bằng id mới (vd. `ss2027_*`), không ghi đè khung cũ.

**Khung đặc quyền**: chỉ trang bị khi đang giữ vai trò thật (Owner + đúng UID cho hai biến thể Owner). Backend kiểm tra bằng `keyo_role_frame_allowed()`; trigger trên `user_roles` tự tháo khung khi mất vai trò; trigger trên `inventory_items` cấm sở hữu; admin không thể đặt giá/cho giao dịch/đổi nguồn; không mua, tặng, chuyển nhượng. Khung không ảnh hưởng RBAC.

## 4. API

- `GET /api/leaderboards` — danh sách bảng + kỳ khả dụng.
- `GET /api/leaderboards/:board?period&game&offset&limit` — xếp hạng (thẻ công khai: avatar, khung, tên, UID, VIP, Rank), `me` = hạng của tôi.
- `GET /api/players/:uid` thêm `gameStats` (theo quyền riêng tư "Hiện thống kê") và `awards`.
- `GET /api/me/inventory` thêm `roleFrames`.

## 5. Hiệu năng (đo trên DB tạm)

- Trigger: ~0,12 ms mỗi ván đã kết toán (100k ván: 13,5 s so với 1,6 s không trigger, chèn hàng loạt).
- Bảng tháng của một game với 2.000 người chơi / 100k ván: ~7 ms; bảng toàn thời gian ~2 ms. Kết quả cache 30 giây theo bảng + kỳ.
- Chỉ mục: `(game, day)`, `(game, wins|best_streak|current_streak)`, `created_at` của likes/follows/charm_ledger/quest_claims.

## 6. Migration & rollback

- `0033_leaderboards`: thống kê + trigger, `leaderboard_state`, snapshots, awards, tournaments, chỉ mục. Additive.
- `0034_frame_library`: 74 khung (`ON CONFLICT DO NOTHING`, không ghi đè), hàm/trigger khung đặc quyền.
- Rollback (sau khi backup): `drizzle/rollback/0034_frame_library.down.sql` rồi `0033_leaderboards.down.sql`, xóa hai dòng tương ứng trong `drizzle.__drizzle_migrations`. Đã chạy thử bằng `psql` trên DB tách biệt: ví và `game_rounds` nguyên vẹn; khung đã có người sở hữu được giữ.
- Frontend/backend: deploy lại image cũ. Code cũ không đọc bảng mới; khung thư viện đang trang bị sẽ hiển thị như vòng mặc định.

## 7. Chưa nằm trong PR này

Yêu cầu "Seasonal Collections, Table Skins, Victory Effects, Card Backs, Chat Bubbles, Titles, Multiplayer Cosmetic Visibility" được nhắc tới nhưng nội dung chi tiết chưa được gửi trong phiên làm việc. PR này đã có 24 khung theo mùa (phần khung của Seasonal Collections); các phần còn lại cần đặc tả để làm tiếp.
