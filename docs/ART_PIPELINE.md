# Pipeline đồ hoạ (Premium Modern 2D HD)

Định hướng: luxury modern casino, HD 2D, ánh vàng, bàn nỉ xanh ngọc, nền tối cao cấp, kính/kim loại/bóng, neon nhẹ. **Không dùng pixel art.**

## Asset chính thức (do chủ dự án cung cấp)

| Asset | File gốc (không bao giờ sửa) | Bản web (chỉ resize) | Dùng ở |
| --- | --- | --- | --- |
| Cxu Bạc | `assets/official/cxu-bac.png` (1263×1245) | `apps/web/public/assets/official/cxu-bac.png` (256²) | Số dư, quà tân thủ, điểm danh, xếp hạng, big win, hồ sơ |
| Cxu Vàng | `assets/official/cxu-vang.png` (128×128) | `…/cxu-vang.png` (128², không phóng to) | Số dư, quà tân thủ, điểm danh ngày 4 & 7, giá cửa hàng, hồ sơ |
| Partner | `assets/official/badge-partner.png` (1283×1226) | `…/badge-partner.png` (256²) | Cạnh tên người chơi, hồ sơ, xếp hạng, big win, admin |
| Verified | `assets/official/badge-verified.png` (1254×1254) | `…/badge-verified.png` (256²) | Như Partner |

- File được upload với tên `IMG_2194/2195/2217/2220.png` và đã được đổi tên theo quy ước trên (`git mv`, nội dung giữ nguyên).
- Tạo lại bản web khi file gốc thay đổi: `python3 scripts/build-official-assets.py` (resize Lanczos, đệm vuông nền trong suốt, không phóng to).
- Code dùng asset qua `apps/web/src/ui/OfficialAssets.tsx` (`CurrencyIcon`, `BadgeIcon`, `PlayerName`, `Amount`).
- ⚠️ Cxu Vàng gốc chỉ có 128×128 px: hiển thị tốt ở icon nhỏ nhưng hơi mờ khi lớn (ví dụ 72px trong hộp quà tân thủ trên màn hình Retina). Nên bổ sung bản ≥512px.

## Asset procedural (do code vẽ, nguyên bản, dùng thương mại được)

Tất cả được vẽ bằng canvas/SVG vector (gradient, bóng đổ, highlight), render ở độ phân giải ×2–3:

| Asset | Nơi định nghĩa | Ghi chú |
| --- | --- | --- |
| Bàn nỉ xanh ngọc, nền lounge bokeh | `apps/web/src/game/art.ts` (`ensureFelt`, `ensureLounge`) | |
| Lá bài 52 + mặt sau | `ensureCardTexture` | J/Q/K là khung chữ cách điệu, **chưa có tranh hình người** |
| Chip 6 mệnh giá | `ensureChipTextures`, `ui/Chip.tsx` | |
| Xúc xắc (chấm đỏ 1 & 4) | `ensureDiceTextures` | |
| Vòng roulette có số, bi, lớp kính | `ensureWheelTextures` | |
| Biểu tượng slot (7 loại), khung máy | `SYMBOL_PAINTERS`, `ensureSlotCabinet` | |
| Hiệu ứng: glow, sparkle, coin | `ensureFxTextures` | |
| Key art sảnh cho 4 game | `ui/Icons.tsx` (`GameArt`) | |
| Avatar 16 emblem + khung vàng động | `ui/Avatar.tsx` | emblem hình học, **không phải chân dung** |
| Huy chương xếp hạng 1–3 | `ui/Avatar.tsx` (`Medal`) | |
| Nút, panel kính, typography | Tailwind (`index.css`, `tailwind.config.js`) | Be Vietnam Pro + Playfair Display (OFL) |

## Chưa có — cần công cụ tạo ảnh / hoạ sĩ bên ngoài

Claude Code không tạo được tranh minh hoạ raster chất lượng chuyên nghiệp. Các mục sau **chưa hoàn thành**:

1. Tranh court card (J/Q/K) chân dung.
2. Avatar chân dung người chơi.
3. Nền hồ sơ (profile backgrounds).
4. Huy hiệu thành tựu (hệ thống thành tựu cũng chưa làm).
5. Bàn Poker, Liêng, Xì Tố (các game này chưa được phát triển).
6. Key art / banner sảnh dạng tranh vẽ 3D-look.

## Cách thay asset raster

1. Xuất PNG/WebP có alpha ở **3× kích thước world** (bảng dưới), đặt vào `apps/web/public/assets/`.
2. Khai báo trong `ASSET_OVERRIDES` (`apps/web/src/game/art.ts`), ví dụ `'card-KH': 'assets/cards/KH.webp'`.
3. Texture override được tải trước khi scene dựng và tự thay bản vẽ procedural cùng key.

| Key | Kích thước world | File 3× |
| --- | --- | --- |
| `card-<Rank><Suit>`, `card-back` | 48×68 | 144×204 |
| `chip-<10\|50\|100\|500\|1000\|5000>` | 32×35 | 96×105 |
| `die-<1..6>` | 38×38 | 114×114 |
| `roulette-wheel` (số 0 ở đỉnh, theo thứ tự bánh châu Âu) | 150×150 | 450×450 |
| `roulette-ball` | 7×7 | 21×21 |
| `slot-<cherry\|lemon\|bell\|clover\|diamond\|seven\|wild>` | 46×46 | 138×138 |
| `bg-felt`, `bg-lounge` | 640×360 | 1920×1080 |
| `slots-cabinet` | 346×278 | 1038×834 |

Yêu cầu bản quyền: chỉ dùng asset tự vẽ/đặt hàng hoặc giấy phép cho phép thương mại; lưu giấy phép trong `apps/web/public/assets/LICENSES.md`.
