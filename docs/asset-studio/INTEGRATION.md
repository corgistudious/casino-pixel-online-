# Integration Mapping Report — Keyo Asset Studio → Keyo Game

Generated: 2026-11-07T06:59:08.192Z · Branch feat/hd-game-ui · Source: `apps/web/src/assets/keyo/integration.json`
Browser check: 2026-11-07T06:58:57.816Z (http://localhost:5180, Chromium emulation — not a real device)

## Totals

| | Library (252) | Earlier samples (18) | All (270) |
|---|---|---|---|
| VERIFIED | 57 | 7 | 64 |
| INTEGRATED | 111 | 6 | 117 |
| READY_FOR_FUTURE_USE | 84 | 5 | 89 |
| MISSING | 0 | 0 | 0 |
| FAILED | 0 | 0 | 0 |
| **Total** | **252** | **18** | **270** |

- **VERIFIED**: integrated, and the browser check saw the file load on a real screen of the app.
- **INTEGRATED**: wired into an existing feature (code path, typecheck and unit tests), but the preview build has no data that shows it (e.g. a frame nobody in the demo owns).
- **READY_FOR_FUTURE_USE**: in the registry and deployed, but no existing feature uses it; the reason is given. Not counted as shown in the game.

## Per asset

### achievement (6)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `achievement.badge` | library | INTEGRATED | Thành tích: Trận đấu đầu tiên (cả hồ sơ công khai) | 3 sizes |
| `achievement.champion` | library | VERIFIED | Thành tích: biểu tượng đầu trang — seen on: achievements | 3 sizes |
| `achievement.collector` | library | VERIFIED | Bộ sưu tập / Cửa hàng: biểu tượng đầu trang (PageHeader "collection") — seen on: collection | 3 sizes |
| `achievement.epic` | library | INTEGRATED | Thành tích: 100 trận (cả hồ sơ công khai) | 3 sizes |
| `achievement.legendary` | library | INTEGRATED | Thành tích: 1000 trận (cả hồ sơ công khai) | 3 sizes |
| `achievement.rare` | library | INTEGRATED | Thành tích: 10 trận (cả hồ sơ công khai) | 3 sizes |

### avatar (10)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `avatar.collector` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.default` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.fantasy-dealer` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.kol` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.limited` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.premium` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.royal` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.seasonal` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.tournament` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |
| `avatar.vip` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm avatar tương ứng trong catalog (avatar mặc định 0–15 do server cố định; vật phẩm avatar thì tạo được qua Admin, cần Owner duyệt) | 3 sizes |

### bank (4)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `bank.money-bag` | library | VERIFIED | Ngân hàng: thẻ Cxu Bạc (trang trí) — seen on: bank | 3 sizes |
| `bank.money-bag-vip` | library | VERIFIED | Ngân hàng: thẻ Cxu Vàng (trang trí) — seen on: bank | 3 sizes |
| `bank.vault-open` | library | VERIFIED | Ngân hàng: trang trí quầy gửi/rút — seen on: bank | 3 sizes |
| `bank.vault-premium` | sample | VERIFIED | Ngân hàng: biểu tượng đầu trang — seen on: bank | 3 sizes |

### bubble (15)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `bubble.anniversary` | library | INTEGRATED | Khung chat (9-slice) — ss2026_anniversary_bubble: chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.champion` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung chat tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `bubble.christmas` | library | INTEGRATED | Khung chat (9-slice) — ss2026_christmas_bubble: chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.classic` | library | INTEGRATED | Khung chat (9-slice) — bubble_classic: chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.creator` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung chat tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `bubble.default` | library | INTEGRATED | Khung chat (9-slice) — khung chat mặc định (chưa trang bị): chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.diamond` | library | INTEGRATED | Khung chat (9-slice) — bubble_diamond_blue: chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.gold` | sample | INTEGRATED | Khung chat (9-slice) — bubble_classic_gold: chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.halloween` | library | INTEGRATED | Khung chat (9-slice) — ss2026_halloween_bubble: chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.kol` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung chat tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `bubble.limited` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung chat tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `bubble.lunar-new-year` | library | INTEGRATED | Khung chat (9-slice) — ss2026_lunar_new_year_bubble: chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.royal` | library | INTEGRATED | Khung chat (9-slice) — bubble_royal_purple: chat, cửa hàng, kho, xem trước | 2 sizes |
| `bubble.tournament` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung chat tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `bubble.vip` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung chat tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |

### cardback (10)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `cardback.christmas` | library | INTEGRATED | Mặt sau lá bài của vật phẩm ss2026_christmas_cards: bàn Poker/Liêng/Xì Tố, Cửa hàng, Kho, xem trước | 2 sizes |
| `cardback.classic` | library | INTEGRATED | Mặt sau lá bài của vật phẩm card_back_classic: bàn Poker/Liêng/Xì Tố, Cửa hàng, Kho, xem trước | 2 sizes |
| `cardback.diamond` | library | INTEGRATED | Mặt sau lá bài của vật phẩm card_back_sapphire: bàn Poker/Liêng/Xì Tố, Cửa hàng, Kho, xem trước | 2 sizes |
| `cardback.halloween` | library | INTEGRATED | Mặt sau lá bài của vật phẩm ss2026_halloween_cards: bàn Poker/Liêng/Xì Tố, Cửa hàng, Kho, xem trước | 2 sizes |
| `cardback.limited` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm mặt sau lá bài tương ứng trong catalog (tạo vật phẩm = sửa database, cần Owner duyệt) | 2 sizes |
| `cardback.lunar-new-year` | library | INTEGRATED | Mặt sau lá bài của vật phẩm ss2026_lunar_new_year_cards: bàn Poker/Liêng/Xì Tố, Cửa hàng, Kho, xem trước | 2 sizes |
| `cardback.royal-gold` | sample | READY_FOR_FUTURE_USE | Chưa có vật phẩm mặt sau lá bài tương ứng trong catalog (tạo vật phẩm = sửa database, cần Owner duyệt) | 2 sizes |
| `cardback.royal-purple` | sample | READY_FOR_FUTURE_USE | Chưa có vật phẩm mặt sau lá bài tương ứng trong catalog (tạo vật phẩm = sửa database, cần Owner duyệt) | 2 sizes |
| `cardback.tournament` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm mặt sau lá bài tương ứng trong catalog (tạo vật phẩm = sửa database, cần Owner duyệt) | 2 sizes |
| `cardback.vip` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm mặt sau lá bài tương ứng trong catalog (tạo vật phẩm = sửa database, cần Owner duyệt) | 2 sizes |

### chest (6)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `chest.common` | library | INTEGRATED | Hộp thư: rương theo phần quà (common) ở danh sách thư và đính kèm | 3 sizes |
| `chest.epic` | library | INTEGRATED | Hộp thư: rương theo phần quà (epic) ở danh sách thư và đính kèm | 3 sizes |
| `chest.event` | library | INTEGRATED | Hộp thư: rương theo phần quà (event) ở danh sách thư và đính kèm | 3 sizes |
| `chest.legendary` | sample | INTEGRATED | Hộp thư: rương theo phần quà (legendary) ở danh sách thư và đính kèm | 3 sizes |
| `chest.limited` | library | INTEGRATED | Hộp thư: rương theo phần quà (limited) ở danh sách thư và đính kèm | 3 sizes |
| `chest.rare` | library | INTEGRATED | Hộp thư: rương theo phần quà (rare) ở danh sách thư và đính kèm | 3 sizes |

### collectible (25)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `collectible.car.hypercar` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.car.limited` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.car.luxury` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.car.sports` | library | INTEGRATED | Quà tặng mặc định "sports_car" (Shop quà, Tủ quà trên hồ sơ) khi chưa có icon tải lên | 3 sizes |
| `collectible.car.supercar` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.phone.gold` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.phone.limited` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.phone.luxury` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.phone.premium` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.phone.standard` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.property.beach-villa` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.property.limited-estate` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.property.mansion` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.property.royal-estate` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.property.villa` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.watch.classic` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.watch.diamond` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.watch.gold` | library | INTEGRATED | Quà tặng mặc định "gold_watch" (Shop quà, Tủ quà trên hồ sơ) khi chưa có icon tải lên | 3 sizes |
| `collectible.watch.limited` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.watch.luxury` | sample | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.yacht.limited` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.yacht.luxury` | library | INTEGRATED | Quà tặng mặc định "yacht" (Shop quà, Tủ quà trên hồ sơ) khi chưa có icon tải lên | 3 sizes |
| `collectible.yacht.royal` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.yacht.small` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |
| `collectible.yacht.super` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm sưu tầm tương ứng trong database (tạo vật phẩm/giá cần Owner duyệt) | 3 sizes |

### event (40)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `event.anniversary.badge` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa anniversary: huy hiệu khi đang mở bán | 3 sizes |
| `event.anniversary.banner` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa anniversary: ảnh đầu thẻ bộ sưu tập | 2 sizes |
| `event.anniversary.chest` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa anniversary: rương cạnh tiến độ sở hữu | 3 sizes |
| `event.anniversary.decoration` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa anniversary: trang trí góc | 3 sizes |
| `event.anniversary.icon` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa anniversary: biểu tượng cạnh tên | 3 sizes |
| `event.christmas.badge` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa christmas: huy hiệu khi đang mở bán | 3 sizes |
| `event.christmas.banner` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa christmas: ảnh đầu thẻ bộ sưu tập | 2 sizes |
| `event.christmas.chest` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa christmas: rương cạnh tiến độ sở hữu | 3 sizes |
| `event.christmas.decoration` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa christmas: trang trí góc | 3 sizes |
| `event.christmas.icon` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa christmas: biểu tượng cạnh tên | 3 sizes |
| `event.halloween.badge` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa halloween: huy hiệu khi đang mở bán | 3 sizes |
| `event.halloween.banner` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa halloween: ảnh đầu thẻ bộ sưu tập | 2 sizes |
| `event.halloween.chest` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa halloween: rương cạnh tiến độ sở hữu | 3 sizes |
| `event.halloween.decoration` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa halloween: trang trí góc | 3 sizes |
| `event.halloween.icon` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa halloween: biểu tượng cạnh tên | 3 sizes |
| `event.lunar-new-year.badge` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa lunar-new-year: huy hiệu khi đang mở bán | 3 sizes |
| `event.lunar-new-year.banner` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa lunar-new-year: ảnh đầu thẻ bộ sưu tập | 2 sizes |
| `event.lunar-new-year.chest` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa lunar-new-year: rương cạnh tiến độ sở hữu | 3 sizes |
| `event.lunar-new-year.decoration` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa lunar-new-year: trang trí góc | 3 sizes |
| `event.lunar-new-year.icon` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa lunar-new-year: biểu tượng cạnh tên | 3 sizes |
| `event.new-year.badge` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa new-year: huy hiệu khi đang mở bán | 3 sizes |
| `event.new-year.banner` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa new-year: ảnh đầu thẻ bộ sưu tập | 2 sizes |
| `event.new-year.chest` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa new-year: rương cạnh tiến độ sở hữu | 3 sizes |
| `event.new-year.decoration` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa new-year: trang trí góc | 3 sizes |
| `event.new-year.icon` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa new-year: biểu tượng cạnh tên | 3 sizes |
| `event.summer.badge` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa summer: huy hiệu khi đang mở bán | 3 sizes |
| `event.summer.banner` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa summer: ảnh đầu thẻ bộ sưu tập | 2 sizes |
| `event.summer.chest` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa summer: rương cạnh tiến độ sở hữu | 3 sizes |
| `event.summer.decoration` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa summer: trang trí góc | 3 sizes |
| `event.summer.icon` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa summer: biểu tượng cạnh tên | 3 sizes |
| `event.thanksgiving.badge` | library | READY_FOR_FUTURE_USE | Game chưa có mùa Lễ Tạ Ơn (SEASON_THEMES) | 3 sizes |
| `event.thanksgiving.banner` | library | READY_FOR_FUTURE_USE | Game chưa có mùa Lễ Tạ Ơn (SEASON_THEMES) | 2 sizes |
| `event.thanksgiving.chest` | library | READY_FOR_FUTURE_USE | Game chưa có mùa Lễ Tạ Ơn (SEASON_THEMES) | 3 sizes |
| `event.thanksgiving.decoration` | library | READY_FOR_FUTURE_USE | Game chưa có mùa Lễ Tạ Ơn (SEASON_THEMES) | 3 sizes |
| `event.thanksgiving.icon` | library | READY_FOR_FUTURE_USE | Game chưa có mùa Lễ Tạ Ơn (SEASON_THEMES) | 3 sizes |
| `event.valentine.badge` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa valentine: huy hiệu khi đang mở bán | 3 sizes |
| `event.valentine.banner` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa valentine: ảnh đầu thẻ bộ sưu tập | 2 sizes |
| `event.valentine.chest` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa valentine: rương cạnh tiến độ sở hữu | 3 sizes |
| `event.valentine.decoration` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa valentine: trang trí góc | 3 sizes |
| `event.valentine.icon` | library | INTEGRATED | Cửa hàng › Bộ sưu tập mùa valentine: biểu tượng cạnh tên | 3 sizes |

### frame (30)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `frame.seasonal.anniversary` | library | INTEGRATED | Khung avatar của vật phẩm ss2026_keyo_royal_legacy (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.seasonal.christmas` | library | INTEGRATED | Khung avatar của vật phẩm ss2026_winter_royalty (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.seasonal.easter` | library | READY_FOR_FUTURE_USE | Game chưa có mùa sự kiện này (SEASON_THEMES) | 3 sizes |
| `frame.seasonal.halloween` | library | INTEGRATED | Khung avatar của vật phẩm ss2026_phantom_crown (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.seasonal.lunar-new-year` | sample | INTEGRATED | Khung avatar của vật phẩm ss2026_lunar_emperor (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.seasonal.new-year` | library | INTEGRATED | Khung avatar của vật phẩm ss2026_new_year_royal (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.seasonal.summer` | library | INTEGRATED | Khung avatar của vật phẩm ss2026_summer_crown (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.seasonal.thanksgiving` | library | READY_FOR_FUTURE_USE | Game chưa có mùa sự kiện này (SEASON_THEMES) | 3 sizes |
| `frame.seasonal.valentine` | library | INTEGRATED | Khung avatar của vật phẩm ss2026_eternal_love (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.special.anniversary-exclusive` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.special.collector` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.special.creator` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.special.early-supporter` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.special.event-exclusive` | library | INTEGRATED | Khung avatar của vật phẩm tour_special (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.special.founder` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.special.kol` | sample | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.special.limited-edition` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.special.reviewer` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.tournament.champion` | library | INTEGRATED | Khung avatar của vật phẩm tour_champion (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.tournament.grand-champion` | library | INTEGRATED | Khung avatar của vật phẩm hof_champion (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.tournament.participant` | library | INTEGRATED | Khung avatar của vật phẩm tour_participant (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.tournament.runner-up` | library | INTEGRATED | Khung avatar của vật phẩm tour_runner_up (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.tournament.seasonal-champion` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.tournament.top-10` | library | INTEGRATED | Khung avatar của vật phẩm tour_top10 (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.tournament.top-100` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm khung tương ứng trong catalog (tạo vật phẩm/điều kiện trao = sửa database, cần Owner duyệt) | 3 sizes |
| `frame.tournament.top-3` | library | INTEGRATED | Khung avatar của vật phẩm tour_top3 (mọi nơi hiện avatar: hồ sơ, bảng xếp hạng, chat, thư viện khung, cửa hàng) | 3 sizes |
| `frame.vip.vip-05` | library | VERIFIED | Khung mốc VIP 5: VipCrest (VIP Hub, hồ sơ công khai) theo cấp VIP thật — chỉ trang trí, không phải vật phẩm, không cấp quyền — seen on: vip | 3 sizes |
| `frame.vip.vip-07` | library | INTEGRATED | Khung mốc VIP 7: VipCrest (VIP Hub, hồ sơ công khai) theo cấp VIP thật — chỉ trang trí, không phải vật phẩm, không cấp quyền | 3 sizes |
| `frame.vip.vip-10` | library | INTEGRATED | Khung mốc VIP 10: VipCrest (VIP Hub, hồ sơ công khai) theo cấp VIP thật — chỉ trang trí, không phải vật phẩm, không cấp quyền | 3 sizes |
| `frame.vip.vip-15` | sample | INTEGRATED | Khung mốc VIP 15: VipCrest (VIP Hub, hồ sơ công khai) theo cấp VIP thật — chỉ trang trí, không phải vật phẩm, không cấp quyền | 3 sizes |

### fx (15)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `fx.all-in` | library | INTEGRATED | Bàn bài: lúc một người all-in | 3 sizes |
| `fx.big-win` | library | VERIFIED | Thắng lớn: mọi bàn — seen on: roulette, sicbo, taixiu, roulette-table, slots, blackjack, poker, lieng, xito | 3 sizes |
| `fx.bust` | library | INTEGRATED | Blackjack: Quắc | 3 sizes |
| `fx.champion-victory` | library | INTEGRATED | Hiệu ứng thắng "Vương Miện Hoàng Gia" (fx_royal_crown): hình trung tâm | 3 sizes |
| `fx.chest-opening` | library | INTEGRATED | Hộp thư: rương mở khi nhận quà | 3 sizes |
| `fx.fold` | library | INTEGRATED | Bàn bài: lúc một người bỏ bài | 3 sizes |
| `fx.jackpot` | library | INTEGRATED | Slots: thắng ≥ 500× | 3 sizes |
| `fx.mega-win` | library | INTEGRATED | Slots: thắng ≥ 100× tổng hệ số | 3 sizes |
| `fx.normal-lose` | library | VERIFIED | Thua: Roulette, Sic Bo/Tài Xỉu, Blackjack — seen on: roulette, sicbo, taixiu, roulette-table, slots, blackjack, poker, lieng, xito | 3 sizes |
| `fx.normal-win` | library | VERIFIED | Thắng thường: mọi bàn (Phaser) — seen on: roulette, sicbo, taixiu, roulette-table, slots, blackjack, poker, lieng, xito | 3 sizes |
| `fx.perfect-win` | library | INTEGRATED | Blackjack: thắng Blackjack | 3 sizes |
| `fx.push` | library | INTEGRATED | Blackjack: Hoà | 3 sizes |
| `fx.reward-reveal` | library | INTEGRATED | Hộp thư: hiệu ứng khi nhận quà | 3 sizes |
| `fx.tournament-victory` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm hiệu ứng chiến thắng tương ứng (cần Owner duyệt) | 3 sizes |
| `fx.vip-victory` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm hiệu ứng chiến thắng tương ứng (cần Owner duyệt) | 3 sizes |

### game (46)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `game.blackjack.action-double` | library | INTEGRATED | Blackjack (solo + nhiều người): nút Gấp đôi | 3 sizes |
| `game.blackjack.action-hit` | library | INTEGRATED | Blackjack (solo + nhiều người): nút Rút | 3 sizes |
| `game.blackjack.action-insurance` | library | INTEGRATED | Blackjack: hộp thoại Bảo hiểm | 3 sizes |
| `game.blackjack.action-split` | library | INTEGRATED | Blackjack (solo + nhiều người): nút Tách | 3 sizes |
| `game.blackjack.action-stand` | library | INTEGRATED | Blackjack (solo + nhiều người): nút Dừng | 3 sizes |
| `game.blackjack.card-shoe` | sample | VERIFIED | Blackjack solo: hộp bài (texture card-shoe) — seen on: blackjack | 3 sizes |
| `game.blackjack.result-emblem` | library | VERIFIED | Blackjack solo: huy hiệu cạnh dòng kết quả — seen on: blackjack | 3 sizes |
| `game.blackjack.table-felt` | library | VERIFIED | Mặt bàn Blackjack (solo Phaser + bàn nhiều người) cho skin Xanh Cổ Điển (mặc định) — seen on: blackjack | 2 sizes |
| `game.cards.action-allin` | library | INTEGRATED | Nút All-in (icon) | 3 sizes |
| `game.cards.action-call` | library | INTEGRATED | Nút Theo (icon) | 3 sizes |
| `game.cards.action-fold` | library | VERIFIED | Nút Bỏ bài (icon) — seen on: lieng | 3 sizes |
| `game.cards.action-raise` | library | VERIFIED | Nút Tố (icon) — seen on: lieng | 3 sizes |
| `game.cards.chip-stack` | library | VERIFIED | Poker/Liêng/Xì Tố: chồng chip cược trước ghế — seen on: poker, lieng, xito | 3 sizes |
| `game.lieng.reveal-fan` | library | VERIFIED | Liêng: biểu tượng lật bài khi so bài — seen on: poker, lieng, xito | 3 sizes |
| `game.poker.blind-big` | library | VERIFIED | Poker: dấu Big Blind cạnh ghế — seen on: poker, lieng, xito | 3 sizes |
| `game.poker.blind-small` | library | VERIFIED | Poker: dấu Small Blind cạnh ghế — seen on: poker, lieng, xito | 3 sizes |
| `game.poker.dealer-button` | sample | VERIFIED | Poker/Liêng: nút dealer (texture dealer-btn) — seen on: poker, lieng, xito | 3 sizes |
| `game.poker.pot-pile` | library | VERIFIED | Poker/Liêng/Xì Tố: đống chip ở ô POT — seen on: poker, lieng, xito | 3 sizes |
| `game.poker.table-felt-royal` | library | INTEGRATED | Mặt bàn studio cho skin Tím Nửa Đêm (bàn oval Poker/Liêng/Xì Tố, ngang) | 2 sizes |
| `game.roulette.ball` | library | VERIFIED | Roulette: bi — seen on: roulette, roulette-table | 3 sizes |
| `game.roulette.marker` | library | VERIFIED | Roulette: con dolly trên ô số trúng — seen on: roulette, roulette-table | 3 sizes |
| `game.roulette.pointer` | library | VERIFIED | Roulette: kim chỉ cố định phía trên bánh xe — seen on: roulette, roulette-table | 3 sizes |
| `game.roulette.result-emblem` | library | VERIFIED | Roulette: huy hiệu phía sau dòng kết quả — seen on: roulette, roulette-table | 3 sizes |
| `game.roulette.wheel-head` | sample | VERIFIED | Roulette: bánh xe 37 ô (vòng số do code vẽ, đúng thứ tự châu Âu và màu) — seen on: roulette, roulette-table | 3 sizes |
| `game.roulette.wheel-rim` | library | VERIFIED | Roulette: vành bát quanh bánh xe (đường bi chạy) — seen on: roulette, roulette-table | 3 sizes |
| `game.sicbo.crystal-dome` | library | VERIFIED | Sic Bo: chụp pha lê khi lắc (texture sicbo-dome) — seen on: sicbo, taixiu | 3 sizes |
| `game.sicbo.dice-plate` | library | VERIFIED | Sic Bo / Tài Xỉu: đĩa xúc xắc (texture sicbo-plate) — seen on: sicbo, taixiu | 3 sizes |
| `game.sicbo.dice-set` | library | READY_FOR_FUTURE_USE | Bảng 6 mặt xúc xắc (1–6) trong một ảnh; game dùng 6 texture riêng die-1…6 nên cần cắt ảnh thành 6 mặt trước khi thay (chưa làm) | 2 sizes |
| `game.sicbo.icon-big` | library | VERIFIED | Sic Bo: biểu tượng cửa Tài (bên nhãn, chỉ khi đủ chỗ) — seen on: sicbo, taixiu | 3 sizes |
| `game.sicbo.icon-small` | library | VERIFIED | Sic Bo: biểu tượng cửa Xỉu (bên nhãn, chỉ khi đủ chỗ) — seen on: sicbo, taixiu | 3 sizes |
| `game.sicbo.icon-triple` | library | VERIFIED | Sic Bo: biểu tượng Bộ ba bất kỳ (bên nhãn, chỉ khi đủ chỗ) — seen on: sicbo, taixiu | 3 sizes |
| `game.sicbo.table-vip` | library | INTEGRATED | Mặt bàn studio cho skin Cung Điện Lục Bảo (bố cục bàn cược: Sic Bo, Tài Xỉu, Roulette) | 2 sizes |
| `game.slots.cabinet-frame` | library | READY_FOR_FUTURE_USE | Ô cửa của khung (≈1.93:1) không khớp vùng 5×3 cuộn (1.67:1) trong thế giới 640×360; ghép vào sẽ phải đổi bố cục/hitbox — giữ khung vẽ bằng code | 2 sizes |
| `game.slots.spin-button` | library | VERIFIED | Slots / Roulette / Sic Bo: icon nút Quay — seen on: roulette, slots | 3 sizes |
| `game.slots.symbol-bell` | library | VERIFIED | Slots: chuông — seen on: slots | 3 sizes |
| `game.slots.symbol-cherry` | library | VERIFIED | Slots: anh đào — seen on: slots | 3 sizes |
| `game.slots.symbol-clover` | library | VERIFIED | Slots: cỏ bốn lá — seen on: slots | 3 sizes |
| `game.slots.symbol-crown` | sample | READY_FOR_FUTURE_USE | Slots hiện có 7 biểu tượng (SLOT_SYMBOLS); thêm biểu tượng = đổi tỉ lệ/bảng trả thưởng (gameplay) — không làm | 3 sizes |
| `game.slots.symbol-diamond` | library | VERIFIED | Slots: kim cương — seen on: slots | 3 sizes |
| `game.slots.symbol-gold-bar` | library | READY_FOR_FUTURE_USE | Slots hiện có 7 biểu tượng (SLOT_SYMBOLS); thêm biểu tượng = đổi tỉ lệ/bảng trả thưởng (gameplay) — không làm | 3 sizes |
| `game.slots.symbol-lemon` | library | VERIFIED | Slots: chanh — seen on: slots | 3 sizes |
| `game.slots.symbol-scatter` | library | READY_FOR_FUTURE_USE | Slots hiện có 7 biểu tượng (SLOT_SYMBOLS); thêm biểu tượng = đổi tỉ lệ/bảng trả thưởng (gameplay) — không làm | 3 sizes |
| `game.slots.symbol-seven` | library | VERIFIED | Slots: biểu tượng 7 — seen on: slots | 3 sizes |
| `game.slots.symbol-wild` | library | VERIFIED | Slots: WILD — seen on: slots | 3 sizes |
| `game.taixiu.bowl-cover` | sample | VERIFIED | Tài Xỉu: bát (texture taixiu-bowl, scene sicbo/taixiu) — seen on: sicbo, taixiu | 3 sizes |
| `game.xito.dealer-marker` | library | VERIFIED | Xì Tố: dấu dealer — seen on: poker, lieng, xito | 3 sizes |

### profile (8)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `profile.accent-kol` | library | VERIFIED | Dấu nhấn KOL cạnh tên cho tài khoản Partner (Hồ sơ) — seen on: profile | 3 sizes |
| `profile.accent-limited` | library | READY_FOR_FUTURE_USE | Chưa có dữ liệu "người chơi giới hạn" để quyết định hiển thị | 3 sizes |
| `profile.accent-vip` | library | INTEGRATED | Dấu nhấn VIP cạnh tên từ VIP 10 (Hồ sơ) | 3 sizes |
| `profile.achievement-showcase` | library | INTEGRATED | Biểu tượng mục Thành tích trên Hồ sơ công khai | 3 sizes |
| `profile.background` | library | VERIFIED | Nền mờ phía sau trang Hồ sơ của tôi — seen on: profile | 2 sizes |
| `profile.header` | library | VERIFIED | Ảnh sân khấu ở đầu Hồ sơ của tôi và Hồ sơ công khai — seen on: profile | 2 sizes |
| `profile.nameplate` | library | INTEGRATED | Bảng tên (9-slice) sau tên trên Hồ sơ công khai | 3 sizes |
| `profile.prestige-effect` | library | INTEGRATED | Hào quang sau avatar từ VIP 13 (Hồ sơ, Hồ sơ công khai) | 3 sizes |

### reward (8)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `reward.daily-gift` | library | INTEGRATED | Nhiệm vụ: nhóm Hằng ngày | 3 sizes |
| `reward.login-chest` | library | INTEGRATED | Điểm danh: ngày 7 | 3 sizes |
| `reward.milestone` | library | INTEGRATED | Nhiệm vụ: nhóm Rank | 3 sizes |
| `reward.mystery-gift` | library | VERIFIED | Giftcode: biểu tượng đầu trang — seen on: gifts | 3 sizes |
| `reward.premium-gift` | library | READY_FOR_FUTURE_USE | Chưa có màn hình quà cao cấp riêng | 3 sizes |
| `reward.streak` | library | INTEGRATED | Điểm danh: dòng chuỗi ngày | 3 sizes |
| `reward.vip-daily` | library | VERIFIED | VIP Hub: nút nhận quà VIP hằng ngày — seen on: vip | 3 sizes |
| `reward.weekly-gift` | library | INTEGRATED | Nhiệm vụ: nhóm Hằng tuần | 3 sizes |

### spin (4)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `spin.button` | library | READY_FOR_FUTURE_USE | Game chưa có tính năng Vòng quay may mắn (không tự tạo gameplay) | 3 sizes |
| `spin.pointer` | library | READY_FOR_FUTURE_USE | Game chưa có tính năng Vòng quay may mắn (không tự tạo gameplay) | 3 sizes |
| `spin.ticket` | library | READY_FOR_FUTURE_USE | Game chưa có tính năng Vòng quay may mắn (không tự tạo gameplay) | 3 sizes |
| `spin.wheel` | library | READY_FOR_FUTURE_USE | Game chưa có tính năng Vòng quay may mắn (không tự tạo gameplay) | 3 sizes |

### title (14)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `title.champion` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.collector` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.creator` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.event-winner` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.founder` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.grand-champion` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.high-roller` | library | INTEGRATED | Danh hiệu (9-slice) — vật phẩm title_high_roller: dưới tên người chơi, hồ sơ, cửa hàng | 2 sizes |
| `title.jackpot-winner` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.kol` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.limited` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.lucky-player` | library | INTEGRATED | Danh hiệu (9-slice) — vật phẩm title_lucky_star: dưới tên người chơi, hồ sơ, cửa hàng | 2 sizes |
| `title.seasonal` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.tournament-winner` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |
| `title.vip-elite` | library | READY_FOR_FUTURE_USE | Chưa có vật phẩm danh hiệu tương ứng trong catalog (cần Owner duyệt tạo vật phẩm) | 2 sizes |

### tournament (6)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `tournament.badge` | library | VERIFIED | Rank: huy hiệu mùa xếp hạng — seen on: rank | 3 sizes |
| `tournament.banner` | library | VERIFIED | Rank: biểu tượng đầu trang — seen on: rank | 3 sizes |
| `tournament.medal` | library | VERIFIED | Rank: tiêu đề bảng bậc — seen on: rank | 3 sizes |
| `tournament.ticket` | library | VERIFIED | Rank: trang trí thẻ mùa xếp hạng — seen on: rank | 3 sizes |
| `tournament.trophy` | library | INTEGRATED | Bảng xếp hạng: dòng "có thưởng" | 3 sizes |
| `tournament.trophy-champion` | sample | INTEGRATED | Bảng xếp hạng: bục Top 1 | 3 sizes |

### ui (8)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `ui.announcement` | library | READY_FOR_FUTURE_USE | Game chưa có trung tâm thông báo / bảng tin | 3 sizes |
| `ui.calendar` | library | INTEGRATED | Điểm danh 7 ngày: tiêu đề | 3 sizes |
| `ui.claim-panel` | library | READY_FOR_FUTURE_USE | Khung panel lớn cho popup nhận thưởng/tiến độ sự kiện chưa tồn tại | 2 sizes |
| `ui.leaderboard` | library | VERIFIED | Bảng xếp hạng: biểu tượng đầu trang — seen on: leaderboard | 3 sizes |
| `ui.mailbox` | library | VERIFIED | Hộp thư: biểu tượng đầu trang — seen on: mail | 3 sizes |
| `ui.notification` | library | READY_FOR_FUTURE_USE | Game chưa có trung tâm thông báo / bảng tin | 3 sizes |
| `ui.progress-panel` | library | READY_FOR_FUTURE_USE | Khung panel lớn cho popup nhận thưởng/tiến độ sự kiện chưa tồn tại | 2 sizes |
| `ui.quest` | library | VERIFIED | Nhiệm vụ: biểu tượng đầu trang — seen on: missions | 3 sizes |

### vip (15)

| Asset | Wave | Status | Where / why | Files |
|---|---|---|---|---|
| `vip.badge.vip-01` | sample | INTEGRATED | Huy hiệu VIP 1: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser | 3 sizes |
| `vip.badge.vip-02` | library | VERIFIED | Huy hiệu VIP 2: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: poker, lieng, xito | 3 sizes |
| `vip.badge.vip-03` | library | VERIFIED | Huy hiệu VIP 3: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: poker, lieng, bjt | 3 sizes |
| `vip.badge.vip-04` | library | INTEGRATED | Huy hiệu VIP 4: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser | 3 sizes |
| `vip.badge.vip-05` | library | VERIFIED | Huy hiệu VIP 5: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: poker, lieng, xito, bjt | 3 sizes |
| `vip.badge.vip-06` | library | VERIFIED | Huy hiệu VIP 6: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: hub, poker, lieng, xito, vip | 3 sizes |
| `vip.badge.vip-07` | library | VERIFIED | Huy hiệu VIP 7: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: poker, lieng, xito, vip | 3 sizes |
| `vip.badge.vip-08` | sample | VERIFIED | Huy hiệu VIP 8: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: bjt | 3 sizes |
| `vip.badge.vip-09` | library | VERIFIED | Huy hiệu VIP 9: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: bjt | 3 sizes |
| `vip.badge.vip-10` | library | VERIFIED | Huy hiệu VIP 10: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: hub | 3 sizes |
| `vip.badge.vip-11` | library | INTEGRATED | Huy hiệu VIP 11: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser | 3 sizes |
| `vip.badge.vip-12` | library | INTEGRATED | Huy hiệu VIP 12: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser | 3 sizes |
| `vip.badge.vip-13` | library | VERIFIED | Huy hiệu VIP 13: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: hub | 3 sizes |
| `vip.badge.vip-14` | library | INTEGRATED | Huy hiệu VIP 14: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser | 3 sizes |
| `vip.badge.vip-15` | sample | VERIFIED | Huy hiệu VIP 15: VipEmblem (Hồ sơ, thẻ người chơi, Bảng xếp hạng, VIP Hub, thanh trên, Nhiệm vụ, Admin) + bàn bài Phaser — seen on: hub | 3 sizes |

## File paths

All files: `apps/web/public/assets/keyo/<group>/<id>.<size>.<hash>.webp` (served as `assets/keyo/…`). Full list per asset: `apps/web/src/assets/keyo/registry.generated.ts`.
