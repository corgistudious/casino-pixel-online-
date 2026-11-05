# Keyo Game V7.1 — bộ asset Game Center 2.5D

Mọi asset dưới đây là thiết kế gốc, vẽ bằng code: Canvas cho Phaser, SVG và CSS cho React. Không có ảnh tải từ nguồn ngoài, không có watermark, không dùng emoji làm asset. Texture Phaser được vẽ ở độ phân giải RES× (2–3×), nên nét trên màn hình Retina.

## Phaser (bàn chơi)

| Asset | Định dạng | Đường dẫn | Dùng ở |
|---|---|---|---|
| Mặt bài 52 lá (2.5D: chỉ số lớn, viền vát, ánh sáng trên) | Canvas texture `card-<rank><suit>` | `apps/web/src/game/art.ts` · `ensureCardTexture` | Poker, Liêng, Xì Tố, Blackjack |
| Mặt sau bài mặc định (tím hoàng gia, lưới vàng, huy hiệu bích) | Canvas texture `card-back` | `apps/web/src/game/art.ts` | Mọi bàn bài (mặt sau theo cosmetic của người chơi vẫn ưu tiên) |
| Vòng avatar kim loại: vàng / đến lượt (phát sáng xanh) / thắng / VIP | Canvas texture `ring-gold`, `ring-turn`, `ring-win`, `ring-vip` | `apps/web/src/game/hudArt.ts` | Ghế bàn bài |
| Bảng tên kính tối viền vàng, có bản riêng cho chính mình | Canvas texture `plate`, `plate-me` | `apps/web/src/game/hudArt.ts` | Ghế bàn bài |
| Bảng POT | Canvas texture `pot-plate` | `apps/web/src/game/hudArt.ts` | Bàn bài |
| Nút Dealer | Canvas texture `dealer-btn` | `apps/web/src/game/hudArt.ts` | Bàn bài |
| Chip, xúc xắc, bát, vòng quay, Slots, hiệu ứng thắng | Canvas texture (có từ V7.0, giữ nguyên) | `apps/web/src/game/art.ts` | Các game tương ứng |
| Mặt bàn theo skin | Canvas (`paintTable`), có biến thể dọc 360×588 | `apps/web/src/cosmetics/tableArt.ts` | Mọi bàn |

## React (HUD, nút, sảnh)

| Asset | Định dạng | Đường dẫn |
|---|---|---|
| Nền sảnh (vòm cung viền vàng, chùm sáng, sàn phản chiếu) | SVG | `apps/web/src/assets/v71/hall.svg` (đặt qua biến CSS `--v71-hall`) |
| Icon hành động: bỏ bài, xem, theo, tố, tất tay, rút, dừng, gấp đôi, tách, chia, quay, lắc, xóa, cược lại, xác nhận | SVG component | `apps/web/src/ui/game/ActionIcons.tsx` |
| Icon HUD: quay lại, chat, người chơi, thống kê, thông tin, phòng, toàn màn hình | SVG component | `apps/web/src/ui/game/GameIcons.tsx` |
| Nút Premium 9 tông (vàng, tím, băng lam, ruby hồng, ngọc, đỏ, VIP, sapphire, trung tính); nút lớn 2 dòng | CSS (`.pbtn`, `.pbtn-xl`, `.pt-*`) | `apps/web/src/premium.css` |
| Bộ chỉnh mức tố (−/+, thanh trượt núm vàng) | CSS (`.praise*`) + `CardTablePage.tsx` | `apps/web/src/premium.css` |
| Tab, thẻ, huy hiệu, ô nhập, khung xương | CSS (`.ptab`, `.pcard`, `.pbadge`, `.pinput`, `.pskeleton`) | `apps/web/src/premium.css` |
| Ghế bàn HTML (vòng vàng, bảng kính) | CSS (`.v71-ring`, `.v71-plate`) | `apps/web/src/premium.css` |
| Thanh tab dưới, bảng "Thêm", panel nổi | CSS (`.ptabbar`, `.psheet`, `.gpanel`) | `apps/web/src/premium.css` |
| Thông báo xoay dọc | React + SVG + CSS | `apps/web/src/ui/MobilePortraitGuard.tsx`, `apps/web/src/index.css` |

## Giới hạn
- Môi trường phát triển không có công cụ tạo ảnh raster. Không có ảnh chân dung người thật như trong ảnh mẫu: avatar vẫn là ảnh người chơi tự tải lên, hoặc chữ cái đầu tên trên nền màu.
- Chip, xúc xắc, bát Tài Xỉu, vòng quay Roulette và máy Slots giữ bản Canvas của V7.0, chưa vẽ lại theo phong cách 2.5D.
