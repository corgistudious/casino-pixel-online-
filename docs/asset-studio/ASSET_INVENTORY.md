# Asset Inventory Report (Phase 1: source audit)

Dữ liệu máy đọc: `assets/studio/reports/inventory.json` (chạy lại bằng `node tools/asset-studio/src/cli.mjs audit`).

## 1. Danh sách game trong source
Source có **10 chế độ chơi** (route), gom lại thành 8 game như brief, với 6 thẻ ở sảnh:

| Game theo brief | Chế độ trong source | Route |
|---|---|---|
| Sic Bo / Tài Xỉu | Tài Xỉu (bàn chung, theo vòng) và Sic Bo (chơi một mình) | `/tables/taixiu-*`, `/play/sicbo` |
| Roulette | Roulette bàn chung và chơi một mình | `/tables/roulette-*`, `/play/roulette` |
| Texas Hold'em Poker | Poker | `/cards/poker-*` |
| Liêng | Liêng | `/cards/lieng-*` |
| Xì Tố | Xì Tố | `/cards/xito-*` |
| Blackjack Multiplayer | Bàn 5 ghế | `/bjt/:id` |
| Blackjack Solo | Chơi một mình | `/play/blackjack` |
| Slots | Royal Slots (5×3) | `/play/slots` |

Khác với brief:
- Slots **không có thẻ trên sảnh**, chỉ vào được qua `/play/slots`.
- Biểu tượng slot trong source là `cherry, lemon, bell, clover, diamond, seven, wild`. Crown, scatter, gold bar chưa có trong gameplay. Catalog ghi đó là symbol tương lai: chỉ tạo hình, không thêm cơ chế.

## 2. Asset ảnh có sẵn (không tạo lại, không ghi đè)
| File | Kích thước | Được dùng | Phân loại |
|---|---|---|---|
| `apps/web/public/assets/official/cxu-bac.png` | 256² | Có | EXISTING_APPROVED (không tạo lại) |
| `apps/web/public/assets/official/cxu-vang.png` | 128² | Có | EXISTING_APPROVED (không tạo lại) |
| `apps/web/public/assets/official/badge-verified.png` | 256² | Có | EXISTING_APPROVED |
| `apps/web/public/assets/official/badge-partner.png` | 256² | Có | EXISTING_APPROVED |
| `apps/web/public/assets/official/rename-card.png` | 1536×1024, 2,0 MB | Có | EXISTING_APPROVED. Nặng; sau này nên có thêm bản WebP, giữ nguyên file gốc |
| `apps/web/public/assets/official/keyo-game-logo.png` | 1431×1099, 2,2 MB | Có | EXISTING_APPROVED. Nặng, cùng gợi ý như trên |
| `apps/web/public/assets/official/Logo Keyo Game.png` | 1254², 2,0 MB | Không thấy được tham chiếu | EXISTING_APPROVED (giữ nguyên) |
| `assets/official/*` (bản gốc độ phân giải cao) | ~1250² | Nguồn | EXISTING_APPROVED |
| `apps/web/src/assets/v71/hall.svg` | SVG | Có (nền sảnh) | EXISTING_APPROVED |

## 3. Đồ họa vẽ bằng code (đang dùng)
| Hệ thống | Hiện trạng | Đánh giá |
|---|---|---|
| Game (Phaser, `apps/web/src/game/art.ts`) | Lá bài, mặt sau, chip 2.5D, xúc xắc, đĩa và chụp Sic Bo, bát Tài Xỉu, bánh xe và bát roulette, biểu tượng và tủ slots, nhẫn ghế, bảng tên, dealer button | Đạt, đang chạy. AI art đã duyệt thay qua `apps/web/src/game/assetTextures.ts` (bản vẽ code là dự phòng) |
| Cosmetic seed trong DB (`apps/server/drizzle/*`) | 81 khung, 16 chat bubble, 11 danh hiệu, 12 mặt sau bài, 13 skin bàn, 7 avatar, 14 hiệu ứng thắng (vẽ SVG/CSS) | Đạt về kỹ thuật. Đây là ứng viên nâng cấp lên artwork 2.5D |
| Thư viện khung (`packages/shared/src/frameLibrary.ts`) | Khung podium, hall of fame, mùa, giải đấu, vai trò | Như trên |

## 4. VIP
- **15 cấp** (`packages/shared/src/vip.ts`), chia thành 5 bậc: silver (1–3), gold (4–6), platinum (7–9), diamond (10–12), royal (13–15).
- Cấp không có tên riêng ngoài "VIP n". Catalog giữ đúng 15 cấp và không đổi tên hay đặc quyền.

## 5. Ngân hàng, quà, sự kiện
- Ngân hàng: dùng icon Cxu sẵn có. Kho tiền, túi tiền và rương là asset mới, chỉ để trang trí.
- Quà tặng (`gifts.ts`): rose, candy, coffee, clover, teddy, chocolate, bouquet, silver_ring, gold_watch, sports_car, yacht, fireworks, crown, diamond. Bộ collectible trong catalog (đồng hồ, xe, du thuyền, bất động sản, điện thoại) chỉ là hình; không đổi giá, số lượng hay quyền sở hữu.
- Mùa sự kiện trong source: halloween, christmas, new_year, lunar_new_year, valentine, summer, **mid_autumn**, anniversary.
  - Brief có thêm **Easter, Thanksgiving**: chưa có trong hệ thống mùa, nên chỉ lập kế hoạch hình (P3).
  - **Mid-Autumn** có trong source nhưng không có trong brief: chưa đưa vào catalog, chờ anh/chị quyết định.
- Vòng quay (spin wheel), ticket giải đấu: chưa có gameplay. Chỉ lập kế hoạch art (P3), không thêm hệ thống mới.

## 6. Tổng hợp
- Catalog: **279 mục**, gồm 9 asset có sẵn (EXISTING_APPROVED) và **270 asset cần tạo (PLANNED)**.
- Chi tiết theo nhóm: `MANIFEST.md`. Chi phí dự kiến: `BUDGET.md`.
