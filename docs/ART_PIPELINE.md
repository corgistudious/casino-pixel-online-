# Pipeline đồ hoạ (Premium Modern 2D HD)

Định hướng: luxury modern casino, HD 2D, ánh vàng, bàn nỉ xanh ngọc, nền tối cao cấp, kính/kim loại/bóng, neon nhẹ. **Không dùng pixel art.**

## Hiện trạng — asset đã có (nguyên bản, do code vẽ, dùng thương mại được)

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
