# Bàn chơi chung (Giai đoạn 4a): Tài Xỉu & Roulette

Mọi người chơi ở cùng một bàn cùng cược vào **một ván duy nhất**, theo **đồng hồ của server**.

- Server quyết định thời gian, kết quả và tiền trả.
- Client chỉ hiển thị và gửi cược.
- Bản chơi một mình (`/play/sicbo`, `/play/roulette`) vẫn giữ nguyên.

## Chu kỳ ván

| Bàn | Lắc bát | Đặt cược | Mở kết quả | Nghỉ |
|---|---|---|---|---|
| Tài Xỉu (`taixiu-1`) | 3 s | 30 s (5 s cuối cảnh báo) | 4 s: bát nâng lên từ từ | 5 s |
| Roulette (`roulette-1`) | — | 25 s (5 s cuối cảnh báo) | 15 s: bánh xe và bi quay | 5 s |

**Cấu hình:**
- Thời gian lấy theo `DEFAULT_TIMINGS` trong `packages/shared/src/games/tables.ts`.
- Có thể chỉnh từng bàn trong `game_tables.config.timings`, ví dụ `{"revealMs": 18000}`.
- Mức cược theo `minBet` / `maxBet`. Mức tối đa tính trên tổng cược của một người trong một ván.
- Cấu hình mới áp dụng từ ván mở sau đó.

**Mốc thời gian của mỗi ván** (lưu trong `table_rounds`):

```
opensAt ──lắc── betsOpenAt ──cược── locksAt ──mở── revealAt ──nghỉ── nextAt
```

**Kết quả** được sinh ngay khi mở ván, nhưng chỉ lộ ra khi đã khóa cược:
- Lúc mở ván chỉ công bố `seedHash`.
- `outcome` chỉ có từ `locksAt`.
- `serverSeed` được công bố sau khi trả thưởng.

## Luật trả thưởng

**Tài Xỉu** dùng 3 xúc xắc, luật Sic Bo chuẩn:

| Cửa | Điều kiện thắng | Tỉ lệ |
|---|---|---|
| Tài | tổng 11–17 | 1:1 |
| Xỉu | tổng 4–10 | 1:1 |
| Chẵn / Lẻ | theo tổng | 1:1 |
| Tổng 4–17 | đúng tổng | theo bảng `SICBO_TOTAL_ODDS` |
| Số đơn | mặt đó xuất hiện | 1:1 / 2:1 / 3:1 theo số lần |
| Bộ ba bất kỳ | ba mặt giống nhau | 30:1 |

**Luật bộ ba:** khi ra bộ ba, cửa Tài, Xỉu, Chẵn và Lẻ đều thua.

**Roulette** dùng bánh xe châu Âu (một số 0), cùng 9 loại cược và tỉ lệ như bản chơi một mình.

**Công thức** dùng chung với server: `tableBetReturn` trong `packages/shared/src/games/tables.ts`. Có test kiểm tra từng trường hợp.

## Server (`apps/server/src/services/roundTables.ts`)

**Chỉ một instance điều khiển đồng hồ.**
- Instance đó giữ advisory lock PostgreSQL `keyo:round-tables`.
- Instance nào cũng nhận cược được.
- Instance dự phòng thử chiếm lock mỗi 15 s.
- Tắt bằng `TABLE_SCHEDULER=off`.

**Chuyển trạng thái được bảo vệ** (`betting → locked → settled`, hoặc `void`). Mỗi bước là một câu `UPDATE … WHERE status = …`. Nhờ vậy:
- tick lặp lại không gây trả trùng;
- hai instance chạy song song không gây trả trùng;
- server khởi động lại giữa ván không gây trả trùng.

**Đặt cược** (`placeBets`):
- Chỉ nhận khi đồng hồ DB nằm trong `[betsOpenAt, locksAt)`. Đây cũng là đồng hồ mà scheduler dùng để khóa ván.
- Trừ tiền qua ledger trong cùng giao dịch.
- Khóa theo người chơi và ván để giới hạn tối đa đúng cả khi gửi đồng thời.
- Idempotency theo id tin nhắn: gửi lại cùng tin không bị cược hai lần.

**Trả thưởng** (`settleRound`):
- Một giao dịch duy nhất, ghi ledger `payout`.
- Ghi một dòng `game_rounds` cho mỗi người chơi trong ván (khóa `table:<roundId>`), để lịch sử, thống kê và dashboard có cả game bàn chung.
- Sau đó gửi sự kiện `wallet` cho từng người chơi.

**Sự cố:**
- Staff có quyền `rooms.manage` hủy ván chưa trả bằng `POST /api/admin/tables/rounds/:id/void`, kèm xác thực lại mật khẩu và lý do.
- Mọi khoản cược được hoàn qua ledger `refund`, có ghi audit log.

**Realtime:**
- Mỗi bàn là một room của hub, fan-out qua Redis với `kind: 'room'`.
- Server phát lại toàn bộ trạng thái ở mỗi lần đổi pha.
- Tổng cược phát tối đa 1 lần/giây và chỉ khi có thay đổi.
- Cược của người khác chỉ hiện dưới dạng tổng.

## API

**WebSocket:**

| Tin nhắn | Trả về |
|---|---|
| `table.join { tableId }` | `TableRoundView`, gồm cả cược của mình |
| `table.leave { tableId }` | — |
| `table.bet { tableId, roundId, bets[] }` | `{ myBets, balance }` |

Sự kiện `table` mang trạng thái mới (không gồm cược cá nhân).

**HTTP:**

| Endpoint | Quyền |
|---|---|
| `GET /api/tables` | công khai |
| `GET /api/tables/:id` | công khai |
| `PATCH /api/admin/tables/:id { status: open \| paused }` | `rooms.manage` |
| `POST /api/admin/tables/rounds/:roundId/void { reason }` | `rooms.manage` + xác thực lại |

## Client (`apps/web`)

Route `/tables/:tableId`. Thẻ Tài Xỉu, thẻ Roulette và banner trong sảnh đều mở bàn chung.

**`game/controls/SharedTableGame.tsx`:**
- Vào bàn, và vào lại sau khi mất kết nối.
- Bù lệch đồng hồ bằng mẫu `serverNow − Date.now()` có độ trễ thấp nhất.
- Đếm ngược; 5 s cuối chuyển đỏ, có tiếng tick.
- Đặt chip chờ rồi bấm **Đặt cược**. Ngừng gửi trong 300 ms cuối.
- Cược lại, tổng cược Tài/Xỉu theo thời gian thực, lịch sử kết quả, mục provably fair.
- Sau khi trả thưởng, lấy cược đã chốt từ server để hiện số thắng thật.

**`game/scenes/TaiXiuScene.ts`:**
- Bát úp lắc → úp yên khi cược → nâng bát từ từ → kết quả.
- Hình ảnh suy ra từ mốc thời gian, nên người vào giữa ván thấy đúng thời điểm hiện tại.

**`game/scenes/RouletteTableScene.ts`:**
- Bánh xe quay thuận, bi quay ngược, cả hai giảm tốc trong suốt thời gian mở kết quả.
- Bi rơi đúng ô server đã chọn: `ballRelative` trả về đúng ô từ 86% thời gian trở đi, có test.
- Vào giữa lượt quay thì tua tới đúng tiến độ.

## Kiểm thử

**Server** (`apps/server/test/roundTables.test.ts`, 9 test, chạy với PostgreSQL thật):
- mở ván;
- không nhận cược khi đang lắc bát;
- ván đầy đủ với tiền trả chính xác và provably fair;
- không trả trùng, kể cả đồng thời;
- min/max (kể cả đồng thời) và cửa cược hợp lệ;
- roulette trả đúng;
- khởi động lại server giữa ván vẫn trả đúng một lần;
- ván tiếp theo và lịch sử;
- hủy ván và hoàn tiền.

**Shared** (`packages/shared/test/tables.test.ts`): luật và tỉ lệ, gồm luật bộ ba.

**Web** (`apps/web/test/tables.test.ts`): pha theo đồng hồ, cộng cược, quỹ đạo bi kết thúc đúng ô, bù lệch đồng hồ.

**E2E trình duyệt** (Playwright, 2 người chơi, server thật, DB riêng):
- Alice cược Tài, Bob cược Xỉu. Bob thấy tổng cược của Alice gần như ngay lập tức.
- Nút đặt cược bị khóa sau `locksAt`.
- Tiền trả khớp ledger.
- Bob rời bàn và vào lại giữa lượt quay roulette: thấy cùng thời điểm, và bi dừng ở ô 20 đúng như kết quả server.
- Bố cục điện thoại ngang 844×390.

## Migration & rollback

**Migration `0006_shared_round_tables`:**
- Chỉ thêm bảng `game_tables`, `table_rounds`, `table_bets` và 2 bàn mặc định (`ON CONFLICT DO NOTHING`).
- Không sửa dữ liệu cũ. Có test nâng cấp trong `test/migrations.test.ts`.

**Rollback thủ công** (`drizzle/rollback/0006_shared_round_tables.down.sql`). Chỉ làm khi chủ dự án đồng ý và đã sao lưu:
1. Tạm dừng bàn: `PATCH /api/admin/tables/:id {"status":"paused"}`. Ván đang chạy vẫn chạy hết và trả thưởng.
2. Kiểm tra không còn cược chưa chốt: `SELECT count(*) FROM table_bets WHERE status = 'placed'` phải bằng 0. Nếu còn, hủy ván qua API `void` để hoàn tiền.
3. Chạy file rollback. Ledger và `game_rounds` của các ván đã chơi vẫn được giữ.

## Giới hạn hiện tại

- Mỗi game có một bàn mặc định. Staff thêm bàn bằng cách chèn dòng vào `game_tables`; chưa có giao diện tạo bàn.
- Chưa có giao diện Admin để tạm dừng bàn hoặc hủy ván. API đã có và đã có test.
- Hiệu ứng âm thanh dùng bộ tổng hợp sẵn có (`sfx`), chưa có âm thanh thu âm.
