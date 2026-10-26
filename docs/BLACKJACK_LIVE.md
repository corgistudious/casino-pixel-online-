# Keyo Game: Blackjack nhiều người, Insurance, quà tặng, Daily, cấu hình nhiệm vụ

Bản cập nhật tiếp nối `docs/FULL_UPGRADE.md`. Mọi tính năng cũ giữ nguyên; chỉ thêm hoặc điều chỉnh các phần dưới đây.

## 1. Insurance (Bảo hiểm)

Áp dụng cho cả Blackjack chơi đơn (`packages/shared/src/games/blackjack.ts`) và bàn nhiều người (`blackjackTable.ts`).

- Chỉ hỏi khi lá ngửa của nhà cái là **A**. Ván chuyển sang giai đoạn `insurance` trước khi nhà cái kiểm tra Blackjack.
- Người chơi chọn **Mua bảo hiểm** (1 đến 50% tiền cược gốc, làm tròn xuống) hoặc **Không mua**.
- Nhà cái có Blackjack: bảo hiểm trả **2:1** (nhận lại 3 lần tiền bảo hiểm), tay chính thua (hoặc hoà nếu người chơi cũng có Blackjack).
- Nhà cái không có Blackjack: mất tiền bảo hiểm, ván chơi tiếp bình thường.
- Mỗi người chơi quyết định riêng. Có đồng hồ đếm ngược: chơi đơn 15 giây (hết giờ tự chọn Không mua), bàn nhiều người 10 giây (server tự đóng, ai chưa chọn tính là Không mua).
- **Server quản lý tiền:** tiền bảo hiểm trừ qua ledger trước khi ghi nhận; không đủ tiền thì từ chối. Mỗi yêu cầu có request id, gửi lại thì server phát lại kết quả cũ, không trừ hai lần. Tiền thưởng trả một lần cùng kết quả ván.
- **Chưa có Surrender.**
- Giao diện: `apps/web/src/game/controls/InsurancePrompt.tsx` (vòng đếm ngược, thanh kéo, nút ½ / Tối đa).

## 2. Blackjack nhiều người

**Bàn:**
- Tối đa **5 người** một bàn. Mỗi người có ghế, tiền cược và lượt riêng; tất cả cùng đấu với nhà cái.
- Hai bàn mặc định do migration tạo: `bj-1` (100–10.000 Cxu Bạc) và `bj-2` (1.000–100.000). Admin có quyền `rooms.manage` chỉnh mức cược hoặc mở/đóng bàn (`PATCH /api/admin/bjt/tables/:id`, có audit log).
- Sảnh: `/bjt` (danh sách bàn, cập nhật mỗi 5 giây; vẫn có lối vào chế độ chơi đơn). Bàn: `/bjt/:tableId`.

**Vòng chơi** (thời gian trong `BJT_TIMING`):
1. **Đặt cược** 15 giây. Khi mọi người đang ngồi đều đã cược thì chia bài ngay. Không ai cược thì chờ thêm; bàn trống thì huỷ vòng.
2. **Bảo hiểm** 10 giây, chỉ khi nhà cái ngửa A.
3. **Lượt chơi:** lần lượt từng ghế, mỗi lượt 15 giây (Hit, Stand, Double, Split tối đa 4 tay). Hết giờ thì tự Stand.
4. Nhà cái rút bài, trả thưởng, nghỉ 4 giây rồi mở vòng mới.

**Đồng bộ realtime:** WebSocket, phòng `bjt:<tableId>`, sự kiện `bjt`. Lá úp của nhà cái chỉ gửi xuống khi ván kết thúc. Lệnh client: `bjt.join`, `bjt.leave`, `bjt.sit`, `bjt.stand`, `bjt.bet`, `bjt.act`.

**Mất kết nối và vào lại:**
- Đến lượt người đang offline: chỉ chờ 5 giây rồi tự Stand, để bàn không bị treo.
- Kết nối lại trong vòng đang chơi: tiếp tục đúng ghế, đúng tay bài (client tự `bjt.join` lại).
- Offline liên tục 3 vòng: ghế được giải phóng.
- Rời bàn giữa ván: các tay đã cược vẫn được tính đến hết ván (tự Stand khi đến lượt), sau đó mới trả ghế.

**An toàn:**
- Trạng thái vòng lưu trong `bj_rounds` (có version, khoá `FOR UPDATE`), nên server khởi động lại vẫn chơi tiếp.
- Chỉ một server điều khiển đồng hồ (advisory lock `keyo:bj-tables`).
- Mọi tiền cược và thưởng đi qua ledger; mỗi ghế mỗi vòng có một dòng `game_rounds` (`bjt:<round>:<seat>`) nên nhiệm vụ, EXP và lịch sử vẫn tính như các game khác. Tiền thưởng chỉ trả một lần.

**Reset dữ liệu TEST (`reset:test-data`):**
- `bj_seats` có khoá ngoại nên được xoá như các bảng khác. `bj_rounds.state.players[].userId` là JSON, không có khoá ngoại, nên reset tự tìm người chơi TEST trong đó.
- Ván **đang chơi** có cả người chơi TEST và người chơi thật: **chặn reset ngay từ preflight**, kèm lý do. Phải chờ ván kết thúc rồi chạy lại dry-run; có thể tạm dừng bàn trong Admin để không mở ván mới. Lý do: huỷ ván sẽ hoàn tiền cược thật, còn trả thưởng sớm thì trả cho tay bài chưa xong.
- Ván chỉ có người chơi TEST (đang chơi hoặc đã xong): xoá. Không hoàn tiền cho ai, vì ví, ledger và `game_rounds` của tài khoản TEST cũng bị xoá.
- Ván đã xong có cả người chơi thật: giữ nguyên ván và phần của người chơi thật. Phần của người chơi TEST được xoá danh tính (`userId: null`, `removed: true`), bỏ luôn danh sách request id.
- Reset khoá các ván đang chơi trước khi khoá bảng `users`, cùng thứ tự với engine, nên không có lượt cược, hành động hay thanh toán nào chen vào giữa.
- Sau khi xoá, reset kiểm tra lại: không ván nào còn trỏ tới tài khoản TEST; phần của người chơi thật trong mọi ván, trạng thái ván, số dư và ledger không đổi. Sai bất kỳ điều gì thì rollback toàn bộ.

## 3. Tặng quà Cxu Bạc

- Tổng **5.000 Cxu Bạc mỗi ngày** cho mỗi người gửi (ngày UTC); mỗi lần 100–5.000.
- Cxu Vàng vẫn không tặng được. Vẫn phải là bạn bè đủ 24 giờ.
- Kiểm tra tổng trong ngày được thực hiện khi đang giữ khoá dòng của người gửi, nên nhiều yêu cầu đồng thời không vượt quá giới hạn (test: 8 yêu cầu 1.000 cùng lúc thì đúng 5 yêu cầu thành công).
- Cấu hình: `SOCIAL_RULES.gift` trong `packages/shared/src/social.ts`.

## 4. Daily (điểm danh)

- **30.000 Cxu Bạc mỗi ngày**, mỗi tài khoản một lần mỗi ngày (ngày UTC), qua `POST /api/me/checkin` hiện có. Hằng số `DAILY_LOGIN_SILVER`.
- Đây là phần thưởng đăng nhập hằng ngày **duy nhất**; không cộng dồn với phần thưởng đăng nhập nào khác. Quà VIP hằng ngày là quyền lợi VIP riêng, không đổi.
- Nhiều yêu cầu đồng thời chỉ được trả một lần (khoá dòng người dùng + `last_checkin_date`).
- Dữ liệu chuỗi điểm danh cũ giữ nguyên.

## 5. Admin → Cấu hình nhiệm vụ

- Trang **Admin → Nhiệm vụ** (`/admin/missions`). Nhân viên có quyền `progression.read` xem được; **chỉ Owner (UID 1002)** sửa được.
- Kiểm tra quyền ở server: `PUT /api/admin/missions/config` yêu cầu vai trò Owner và xác thực lại (step-up). Mỗi lần lưu ghi audit log `missions.config` với giá trị trước/sau.
- Sửa được Cxu Bạc / Cxu Vàng của từng nhiệm vụ ngày, tuần, Rank, và EXP VIP của nhiệm vụ Rank.
- Giới hạn (`MISSION_LIMITS`): tối đa 1.000.000 Bạc, 1.000 Vàng, **50 EXP VIP mỗi nhiệm vụ**, trần EXP VIP từ nhiệm vụ Rank **0–300 mỗi tuần** (mặc định 100). Chỉ nhiệm vụ Rank được có EXP VIP.
- Không cần Owner duyệt từng lượt nhận: người chơi nhận thưởng theo cấu hình đang có hiệu lực lúc nhận.
- Chưa cấu hình thì dùng giá trị mặc định trong code.

## 6. Database

| Migration | Nội dung | Rollback |
|---|---|---|
| `0023_mission_settings` | Bảng một dòng `mission_settings` (phần thưởng jsonb, trần EXP VIP tuần, người sửa cuối) | `drizzle/rollback/0023_mission_settings.down.sql`: nhiệm vụ quay về mặc định, lượt nhận cũ giữ nguyên |
| `0024_blackjack_tables` | `bj_tables` (2 bàn mặc định), `bj_seats`, `bj_rounds` | `drizzle/rollback/0024_blackjack_tables.down.sql`: chỉ chạy khi không còn vòng đang chơi; ledger và `game_rounds` giữ nguyên |

- Cả hai migration chỉ **thêm** bảng, không sửa hay xoá dữ liệu cũ.
- Đã kiểm tra: migrate trên database trống; rollback 0024 + 0023, xoá 2 dòng tương ứng trong `drizzle.__drizzle_migrations`, migrate lại thành công.
- `TEST_DATA_TABLES` đã đăng ký `bj_seats.user_id` và `mission_settings.updated_by`.

## 7. Kiểm thử

| File | Nội dung |
|---|---|
| `packages/shared/test/blackjack.test.ts` | 22 test, gồm 6 test Insurance (trả 2:1, mất bảo hiểm, giới hạn 50%, natural) |
| `packages/shared/test/blackjackTable.test.ts` | 6 test engine bàn nhiều người |
| `apps/server/test/blackjack.test.ts` | Insurance chơi đơn: trả 2:1 và gửi lại cùng request id, mất rồi thắng, không mua, không đủ tiền |
| `apps/server/test/blackjackTables.test.ts` | 5 test: chơi thật nhiều người và trả thưởng một lần, Insurance + hết giờ, mất kết nối + vào lại, gửi lại / thiếu tiền / giới hạn cược, rời giữa ván + khởi động lại server |
| `apps/server/test/social.test.ts` | Giới hạn 5.000/ngày, kể cả 8 yêu cầu đồng thời |
| `apps/server/test/daily.test.ts` | 5 yêu cầu đồng thời chỉ trả một lần; 8 ngày mỗi ngày 30.000 |
| `apps/server/test/resetBlackjack.test.ts` | Reset TEST: chặn khi ván đang chơi có cả TEST và người thật (gọi nhiều lần vẫn không đổi gì); người TEST mất kết nối tự Stand sau khi khởi động lại server; xoá ván chỉ có TEST, ẩn danh người TEST trong ván đã xong; số dư, ledger, `game_rounds`, khoá ngoại và idempotency của người thật không đổi; bàn vẫn chạy sau reset và sau khởi động lại; reset lần hai không có gì để làm |
| `apps/server/test/missions.test.ts` | Chỉ Owner cấu hình, giới hạn, audit log, nhận thưởng theo cấu hình mới |
