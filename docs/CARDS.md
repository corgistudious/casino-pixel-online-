# Game bài có ghế: Poker Hold'em, Liêng, Xì Tố và Đấu Rank

Mỗi bàn có ghế. Mỗi người chơi giữ một chồng chip, các ván nối tiếp nhau.

- Server quyết định chia bài, lượt, hợp lệ của hành động, chia pot và tiền trả.
- Client chỉ hiển thị và gửi hành động.
- Bàn chơi chung theo vòng (Tài Xỉu, Roulette) xem `docs/MULTIPLAYER.md`.

## Luật

Luật nằm trong engine thuần, không I/O, ở `packages/shared/src/games/seated.ts` (cách đánh) và `handEval.ts` (xếp hạng bài). Server và test dùng chung engine này.

| Game | Bắt đầu ván | Bài | Vòng cược |
|---|---|---|---|
| Poker Texas Hold'em | mù nhỏ / mù lớn (heads-up: nút là mù nhỏ) | 2 lá úp + 5 lá chung | preflop → flop → turn → river |
| Liêng | cược sàn (ante) | 3 lá úp | 1 vòng |
| Xì Tố | cược sàn | 1 úp + 1 ngửa, sau đó thêm 1 ngửa mỗi vòng (tối đa 5 lá) | 4 vòng; người có bài ngửa mạnh nhất nói trước |

**Cược (no-limit):**
- Tố thêm tối thiểu bằng mức tố trước, hoặc bằng mù lớn / cược sàn.
- Tất tay chưa đủ một lần tố tối thiểu không mở lại quyền tố cho người đã hành động.
- Pot phụ chia theo mức góp. Cược không ai theo được trả lại.
- Chip lẻ khi chia đều pot đi về người thắng gần bên trái nút nhất.
- Hết giờ (mặc định 20 s): Xem nếu được, không thì Bỏ bài.

**Xếp hạng:**
- Poker và Xì Tố: 5 lá tốt nhất (sảnh A-2-3-4-5 hợp lệ).
- Liêng, từ cao xuống thấp:
  - Sáp: ba lá cùng số;
  - Liêng: ba lá liên tiếp, từ A23 đến QKA, không tính K-A-2;
  - Ảnh: ba lá J/Q/K;
  - Điểm: tổng điểm mod 10, với A = 1 và 10/J/Q/K = 0.

## Công bằng có thể kiểm chứng

1. Trước ván, server công bố `seedHash = SHA-256(serverSeed)`.
2. Bộ bài được trộn bằng `shuffle(fairRng(serverSeed, handId, 0), createShoe(1))`.
3. Hết ván, server công bố `serverSeed`. Ai cũng có thể dựng lại đúng bộ bài.

Bài úp của người khác không bao giờ được gửi xuống client cho tới lúc lật bài. Mỗi người chỉ nhận góc nhìn riêng (`viewHand`). VIP và Rank không ảnh hưởng RNG.

## Bàn thường (Cxu Bạc)

- Bàn mặc định do migration 0009 tạo: `poker-1` (50/100), `poker-2` (500/1K), `lieng-1` (cược sàn 100), `xito-1` (cược sàn 50).
- Mua chip từ 2.000 đến 20.000 Cxu Bạc. Chip được trừ ví qua ledger với lý do `table_buyin`.
- Chip đang nằm trong một ván thuộc trạng thái ván cho tới khi ván kết thúc.
- Rời bàn: chip được trả lại ví với lý do `table_cashout`, sau khi ván đang chơi kết thúc.
  - Người đã được chia bài mà đứng dậy sẽ bị đánh dấu "đang rời", tự Bỏ bài tới lượt, và nhận đúng số chip cuối cùng.
- Mỗi người chỉ ngồi một bàn thường tại một thời điểm.
- Hết giờ 2 lượt liên tiếp (tính cả qua nhiều ván) → "tạm vắng", không được chia bài cho tới khi bấm "Tôi đã quay lại". Bộ đếm lưu ở `card_seats.timeouts`; bất kỳ hành động thật nào cũng đưa về 0.
- Mỗi ván ghi một dòng `game_rounds` (khoá `card:<handId>`) và cộng EXP như các game khác.

## Đấu Rank

- Đối đầu 1-1, mỗi người 10.000 chip trận đấu. **Không dùng Cxu.**
- Kết thúc khi:
  - một người hết chip;
  - hoặc sau 30 ván, người nhiều chip hơn thắng.
  Nếu sau 30 ván hai bên bằng chip thì đánh tiếp. Tới ván 40 mà vẫn bằng thì trận bị huỷ (`void`), không ai được hay mất RP.
- Rời trận, hoặc hết giờ 3 lượt liên tiếp (tính qua nhiều ván), là xử thua (`forfeit`). Người bị xử thua mang cờ `afk` nên không nhận thưởng tham gia.
- Kết quả được ghi bằng `recordRankedMatch` với khoá `card:<matchId>`, nên RP chỉ được cộng/trừ một lần, kể cả khi server khởi động lại giữa chừng. Trạng thái: `active` → `finished` → `done`. Bước ghi được thử lại mỗi nhịp.
- **Tìm trận:**
  - chỉ ghép cùng game;
  - lệch tối đa ±5 bậc, nới thêm 1 bậc sau mỗi 10 s chờ;
  - bỏ qua cặp đã gặp nhau 3 lần trong 24 giờ;
  - người chờ quá 10 phút bị xoá khỏi hàng đợi;
  - cần có mùa giải đang mở (lỗi `season_inactive`).

## Server

- `CardTableEngine` (`apps/server/src/services/cardTables.ts`):
  - Mọi thay đổi một ván đều chạy trong giao dịch có `SELECT … FOR UPDATE` trên dòng `card_hands`, và có `version`. Hai hành động đến cùng lúc không thể chồng nhau.
  - Hết giờ, chia ván mới, trả chip người rời, ghi kết quả Rank và ghép trận do một instance "leader" làm. Instance này giữ advisory lock của Postgres. Trong test tắt bằng `TABLE_SCHEDULER=off`.
  - Trạng thái ván lưu đầy đủ trong DB. Server khởi động lại thì tiếp tục đúng ván đó.
- Realtime (WebSocket): `card.join`, `card.leave`, `card.sit {seat, buyIn}`, `card.stand`, `card.back`, `card.act {handId, action, amount}`, `card.queue {game}`, `card.unqueue`. Server đẩy về sự kiện `card` (góc nhìn bàn) và `cardMatch` (đã ghép trận).
- HTTP:
  - `GET /api/cards/tables`: sảnh;
  - `GET /api/cards/tables/:id`: góc nhìn công khai;
  - `PATCH /api/admin/cards/tables/:id {status: open|paused|closed}`: cần quyền `rooms.manage`, có audit log.

## Migration

| File | Nội dung | Rollback |
|---|---|---|
| `0009_card_tables.sql` | Tạo `card_tables`, `card_seats`, `card_hands`, `ranked_queue`, `ranked_matches` và 4 bàn mặc định | `drizzle/rollback/0009_card_tables.down.sql`. Phải trả hết chip và không còn ván đang chơi trước khi chạy. |
| `0010_card_seat_timeouts.sql` | Thêm cột `card_seats.timeouts` (mặc định 0) | `drizzle/rollback/0010_card_seat_timeouts.down.sql` |

Cả hai chỉ thêm bảng/cột, không sửa hay xoá dữ liệu cũ.

## Kiểm thử

- `packages/shared/test/cardgames.test.ts` (15 test), gồm:
  - xếp hạng bài, luật Liêng;
  - mù và quyền của mù lớn, heads-up, tố tối thiểu;
  - pot phụ, trả cược thừa, tất tay chưa đủ tố;
  - hết giờ;
  - 200 ván ngẫu nhiên bảo toàn tổng chip.
- `apps/server/test/cards.test.ts` (9 test, Postgres thật), gồm:
  - mua chip/trả chip qua ledger;
  - bài riêng tư, tái dựng bộ bài từ seed;
  - hết giờ, tạm vắng, người rời bàn;
  - khởi động lại giữa ván;
  - hai hành động trùng nhau;
  - RP chỉ ghi một lần và Cxu không đổi;
  - xử thua khi rời trận hoặc AFK, kể cả Liêng (bộ đếm qua nhiều ván);
  - hàng đợi khi không có mùa giải.

## Cách thử tay

1. Mở `/rooms` và chọn tab game.
2. Bấm "Vào bàn", chọn ghế trống, kéo thanh mua chip, rồi "Ngồi".
3. Cần ít nhất 2 người, dùng hai trình duyệt hoặc hai tài khoản. Ván bắt đầu sau khoảng 4 s.
4. Thử Bỏ bài, Xem/Theo, Tố (½ pot, pot, 2×) và Tất tay. Mục "Công bằng có thể kiểm chứng" cho xem seed sau ván.
5. Đấu Rank: ở sảnh bấm "Tìm trận" bằng hai tài khoản cùng game. Cả hai được chuyển vào bàn `rk-…`. Sau trận, xem RP ở `/rank`.
