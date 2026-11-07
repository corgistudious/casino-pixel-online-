# Thư viện asset, đợt 1: báo cáo (dừng ở ngưỡng ngân sách)

- **Runs:** GitHub Actions #4 [42318233085](https://github.com/corgistudious/casino-pixel-online-/actions/runs/42318233085) (batch 1) và #5 [42318800190](https://github.com/corgistudious/casino-pixel-online-/actions/runs/42318800190) (batch 2–20).
- **Artifact:** `keyo-asset-studio-42318800190` (lưu 30 ngày). Mọi ảnh, manifest và sổ ngân sách cũng đã được commit vào nhánh qua checkpoint mỗi 5 ảnh và sau mỗi batch.
- **Model:** `gpt-image-2.5-sunburst`, quality `high`. Mỗi asset gọi một lần, không retry, **0 lỗi API**.
- **Tạo mới:** **164 / 252 asset**. Đã xong batch 1–13; batch 14–20 chưa chạy vì đã hết ngân sách.
- **Chi phí thật** (token usage × bảng giá chính thức): đợt này $8.80. Tổng từ đầu **$9.9192 / $10**, còn **$0.0808**, không đủ cho thêm một ảnh. Pipeline đã tự dừng.

## Theo batch
| Batch | Số asset | Đã tạo | Đạt kiểm tra kỹ thuật | Cần xem lại / làm lại | Còn thiếu | Chi phí |
|---|---|---|---|---|---|---|
| 01 Games 1 (mặt sau bài, Blackjack) | 13 | 13 | 13 | 0 | 0 | $0.62 |
| 02 Games 2 (Blackjack, bài, Poker, Roulette) | 13 | 13 | 12 | 1 | 0 | $0.69 |
| 03 Games 3 (Roulette, Sic Bo, Slots) | 13 | 13 | 13 | 0 | 0 | $0.68 |
| 04 Games 4 (Slots, Xì Tố) | 10 | 10 | 10 | 0 | 0 | $0.55 |
| 05 VIP (huy hiệu VIP 2–14, khung VIP 5/7/10) | 15 | 15 | 15 | 0 | 0 | $0.83 |
| 06 Khung và profile 1 (avatar, khung mùa) | 14 | 14 | 14 (sau hậu xử lý) | 0 | 0 | $0.77 |
| 07 Khung và profile 2 (mùa, đặc biệt, giải đấu) | 14 | 14 | 13 | 1 | 0 | $0.77 |
| 08 Khung và profile 3 (giải đấu, profile) | 14 | 14 | 12 | 2 | 0 | $0.75 |
| 09 Collectibles 1 (xe, điện thoại, nhà) | 12 | 12 | 12 | 2 (trùng lặp, phát hiện bằng mắt) | 0 | $0.66 |
| 10 Collectibles 2 (nhà, đồng hồ, du thuyền) | 12 | 12 | 12 | 0 | 0 | $0.66 |
| 11 Ngân hàng và rương | 8 | 8 | 8 | 0 | 0 | $0.44 |
| 12 Sự kiện 1 (thành tựu, Anniversary, Christmas) | 13 | 13 | 13 | 0 | 0 | $0.69 |
| 13 Sự kiện 2 (Christmas, Halloween, Lunar New Year) | 13 | 13 | 13 | 0 | 0 | $0.69 |
| 14–20 (sự kiện còn lại, giải đấu, bubble, danh hiệu, hiệu ứng, phần thưởng, spin, UI) | 88 | 0 | — | — | **88** | $0 |

## Kiểm tra chất lượng
- **Hậu xử lý miễn phí:** 10 avatar mascot được vẽ trong vòng tròn trên nền trắng vuông. Đã cắt tròn, phần ngoài vòng tròn thành trong suốt thật (bản v2, artwork giữ nguyên).
- **Cảnh báo nhầm đã sửa:** 3 khung avatar bị báo "trùng lặp" vì cùng dáng vòng tròn. Luật trùng lặp nay so cả màu sắc.
- **Lỗi thật, đề xuất làm lại (6):**
  - `game.blackjack.table-felt`: nền caro giả vẽ thẳng vào ảnh. Đã thêm luật phát hiện và siết prompt.
  - `profile.header`: nền trắng.
  - `frame.tournament.seasonal-champion`, `frame.tournament.grand-champion`: chạm mép ảnh.
  - `collectible.car.hypercar`: gần như giống hệt supercar.
  - `collectible.phone.premium`: rất giống bản standard.
- **Đánh giá chung bằng mắt:**
  - 8 game, đủ 15 cấp VIP (mỗi cấp một hình dáng riêng, cấp cao nổi bật hơn), khung avatar (tâm trong suốt, đã thử trên ảnh đại diện mẫu), collectibles, ngân hàng, rương, sự kiện và profile đều đồng bộ phong cách Premium 2.5D.
  - Không thấy chữ sai hay logo thương hiệu thật.
  - Lưu ý nhỏ: một vài icon có chữ "A" ở góc lá bài (Blackjack split, result emblem). Đó là ký hiệu quân bài, không phải chữ in.
- Contact sheet nằm trong `assets/studio/previews/`: `game`, `cardback`, `vip`, `frame`, `avatar`, `profile`, `collectible`, `bank`, `chest`, `event`, `tournament`, `achievement`.

## Cần nạp thêm để hoàn thiện
| Hạng mục | Số ảnh | Chi phí (chi phí thật đo theo kích thước: vuông $0.0550, ngang/dọc $0.0434) |
|---|---|---|
| 88 asset còn thiếu (batch 14–20) | 88 | $4.45 |
| 6 asset đề xuất làm lại | 6 | $0.31 |
| Dự phòng 30% cho lần sửa tiếp theo | — | $1.43 |
| **Tổng** | 94 | **≈ $6.19** (trừ $0.08 còn lại: **≈ $6.10**) |

Đề xuất nạp **$7**. Sau khi nạp, anh/chị xác nhận hạn mức mới (ví dụ tổng $17); tôi sẽ nâng `APPROVED_TOTAL_USD` rồi chạy tiếp. Batch 14–20 đang chờ và tự chạy từ chỗ dở; asset đã xong không bị tạo lại.
