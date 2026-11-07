# KEYO Asset Studio — Báo cáo thư viện đợt 2 (hoàn tất 252/252)

Ngày: 2026-11-07 · Nhánh: `feat/hd-game-ui` · Model: gpt-image-2.5-sunburst, chất lượng `high`

## Tổng kết

| Chỉ số | Giá trị |
|---|---|
| Asset PLANNED ban đầu | 252 |
| Đã tạo | **252 / 252** (còn thiếu: 0) |
| Đạt kiểm tra kỹ thuật | 252 / 252 (sau hậu xử lý miễn phí) |
| Chờ chủ dự án duyệt (NEEDS_REVIEW) | 252 |
| NEEDS_REVISION / REJECTED | 0 / 0 |
| Lỗi API | 0 |
| Ngân sách đã duyệt | $20.00 |
| Đã chi (thực tế, theo `usage`) | **$14.67** |
| Còn lại | **$5.33** |
| Chi phí đợt 2 (lib-00 + lib-14…20) | $4.76 |

Claude **không** tự đặt `USER_APPROVED` cho asset nào. 18 asset USER_APPROVED hiện có đều do chủ dự án duyệt trước đó.

## Theo batch (đợt 2, run #6)

| Batch | Ảnh | Đạt | Cần duyệt | Chi phí |
|---|---|---|---|---|
| lib-00 — 6 asset làm lại theo yêu cầu | 6 | 6 | 6 | $0.31 |
| lib-14 — events/tournament/achievements 3 | 13 | 13 | 13 | $0.68 |
| lib-15 — events/tournament/achievements 4 | 12 | 12 | 12 | $0.65 |
| lib-16 — bubbles/titles/fx 1 | 15 | 15* | 15 | $0.67 |
| lib-17 — bubbles/titles/fx 2 | 15 | 15* | 15 | $0.81 |
| lib-18 — bubbles/titles/fx 3 | 13 | 13 | 13 | $0.57 |
| lib-19 — other 1 | 10 | 10 | 10 | $0.55 |
| lib-20 — other 2 | 10 | 10 | 10 | $0.53 |

\* 6 asset (bubble.default, bubble.royal, bubble.tournament, title.collector, title.kol, title.seasonal) có lề quá sát mép
(không bị cắt). Đã sửa bằng hậu xử lý `pad` (thu nhỏ đều, thêm lề trong suốt 5%, không gọi API) → v2. File v1 được giữ nguyên.

## 6 asset làm lại (v2, file v1 vẫn giữ)

- `game.blackjack.table-felt`: vẽ tràn mép trên nền plum đậm, không còn caro giả.
- `profile.header`: sân khấu full-bleed.
- `frame.tournament.seasonal-champion`, `frame.tournament.grand-champion`: hoạ tiết nằm trong 84% vùng giữa.
- `collectible.car.hypercar`: trắng ngọc trai + teal, khác hẳn supercar.
- `collectible.phone.premium`: titan + mặt lưng sapphire, khác hẳn bản standard.

Preview: `assets/studio/previews/revisions-2026-11-07-library.png`

## Preview theo nhóm

`assets/studio/previews/`: game, vip, frame, profile, avatar, collectible, bank, chest, event, tournament, achievement,
bubble, title, fx, reward, spin, ui, cardback (nền plum + nền sáng, kích thước thật 128/64/44 px).

## GitHub Actions

- Run #6: https://github.com/corgistudious/casino-pixel-online-/actions/runs/42331440147
  (artifact `keyo-asset-studio-42331440147`, hết hạn 2026-12-07)
- Run #5: https://github.com/corgistudious/casino-pixel-online-/actions/runs/42318800190

## Bước tiếp theo (cần chủ dự án)

1. Duyệt theo nhóm: `node tools/asset-studio/src/cli.mjs review <id> approve|revise|reject`, hoặc trả lời trong chat.
2. Tích hợp vào game chỉ làm sau khi có duyệt và yêu cầu riêng.
