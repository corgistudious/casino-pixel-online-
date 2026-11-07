# Batch mẫu sample-1: báo cáo duyệt

- **Run:** GitHub Actions [#42314025701](https://github.com/corgistudious/casino-pixel-online-/actions/runs/42314025701), request `2026-11-06-02-sample-1-generate`.
- **Model:** `gpt-image-2.5-sunburst`, quality `high`.
  - API key có quyền dùng model này (probe `models.list`).
  - Đây là bản thay thế chính thức cho `gpt-image-1`, đã ngừng ngày 23/10/2026. Hỗ trợ nền trong suốt.
- **Kết quả:** 18/18 ảnh, không lỗi API. Mỗi asset gọi một lần, không retry.
- **Chi phí thật** (token usage × bảng giá chính thức: $5 cho 1M token text đầu vào, $30 cho 1M token ảnh đầu ra): **$0.9568**.
  - Trung bình $0.055 mỗi ảnh vuông, $0.044 mỗi ảnh dọc hoặc ngang.
  - Ước tính trần trước khi chạy là $5.85.
- **Ngân sách còn lại** theo sổ: **$9.04** trên $10.

## Contact sheet
- Toàn batch: `assets/studio/previews/batch-sample-1.png`.
- Theo nhóm: `assets/studio/previews/{game,cardback,vip,frame,bubble,bank,chest,collectible,tournament}.png`.
- Mỗi ô có nền tối, nền sáng và bản thu nhỏ 128/64/44 px. Khung avatar được đặt lên một ảnh đại diện mẫu.

## Kết quả và đề xuất (Claude QA, chưa phải phê duyệt)
| Asset | Game / hệ thống | Kiểm tra kỹ thuật | Đề xuất | Ghi chú |
|---|---|---|---|---|
| `game.taixiu.bowl-cover` | Sic Bo / Tài Xỉu | Đạt | Duyệt | Tròn, sơn mài và viền vàng; nhìn rõ ở 44 px |
| `game.roulette.wheel-head` | Roulette | Đạt | **Làm lại** | Có **hai vòng ô màu** (roulette thật chỉ có một vòng 37 ô), lại vẽ kèm cả bát gỗ |
| `game.poker.dealer-button` | Poker | Đạt | Duyệt | Không có chữ, thấy được độ dày |
| `cardback.royal-purple` | Liêng (dùng chung) | Đạt | Anh/chị quyết | Đối xứng trái/phải; không đối xứng khi xoay 180° |
| `cardback.royal-gold` | Xì Tố (dùng chung) | Đạt | Anh/chị quyết | Như trên |
| `game.blackjack.card-shoe` | Blackjack (2 chế độ) | Đạt | Duyệt | |
| `game.slots.symbol-crown` | Slots | Đạt | Duyệt | Symbol tương lai, không đổi gameplay |
| `vip.badge.vip-01` | VIP | Đạt | **Làm lại** | Quá cầu kỳ cho cấp đầu; cần đơn giản để thấy rõ tiến trình từ 1 đến 15 |
| `vip.badge.vip-08` | VIP | Đạt | Duyệt | |
| `vip.badge.vip-15` | VIP | Đạt | Duyệt | |
| `frame.vip.vip-15` | Khung VIP | Đạt, tâm trong suốt | Duyệt | |
| `frame.seasonal.lunar-new-year` | Khung mùa | **Không đạt**: chạm mép | **Làm lại** | Đầu rồng và đèn lồng tràn khỏi khung hình; thiết kế đẹp |
| `frame.special.kol` | Khung KOL | Đạt | Duyệt | |
| `bubble.gold` | Chat | Đạt | Duyệt | Trang trí chỉ ở góc, cạnh trơn, hợp với co giãn 9-slice |
| `bank.vault-premium` | Ngân hàng | Đạt | Duyệt | Không có ký hiệu tiền tệ |
| `chest.legendary` | Phần thưởng | Đạt | Duyệt | |
| `collectible.watch.luxury` | Collectible | Đạt | Duyệt | Thiết kế hư cấu, không logo |
| `tournament.trophy-champion` | Giải đấu | Đạt | Duyệt | |

Ảnh chưa được tích hợp vào game. Asset đang chạy trên Production không bị thay đổi.

## Dự toán hoàn thiện thư viện
- Còn **252 asset PLANNED**: 199 ảnh vuông, 45 ngang, 8 dọc.
  - Nhiều nhất là game (41), sự kiện (40), khung (27) và collectible (24).
- Theo chi phí thật đo được: khoảng **$13.3**; cộng khoảng 30% dự phòng làm lại thì khoảng **$17.3**.
- Ngân sách còn **$9.04**, đủ khoảng 60–65% thư viện ở chất lượng `high`. Cần nạp thêm khoảng **$8–9** để hoàn thiện toàn bộ catalog hiện tại, có tính phần làm lại.
- Pipeline tự dừng khi chạm giới hạn ngân sách và chờ anh/chị duyệt hạn mức mới.
