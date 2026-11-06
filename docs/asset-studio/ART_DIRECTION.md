# KEYO Premium Stylized 2.5D HD — Art Direction Guide

Áp dụng cho mọi asset do Keyo Asset Studio tạo ra. Các đoạn prompt dùng chung nằm ở
`tools/asset-studio/src/style.mjs`; mỗi asset có thêm prompt riêng trong `src/catalog.mjs`.

## 1. Bản sắc hình ảnh
- Premium casino game center: sang trọng nhưng trẻ trung, giàu tính giải trí, dễ nhìn.
- **Stylized, không photorealistic.** Hình khối rõ, hơi "chunky", cạnh vát (bevel), có chiều sâu 2.5D. Không mô phỏng ảnh chụp vật thật.
- Không nặng nề như casino ngoài đời. Không biến giao diện thành ảnh 3D chân thật.
- Đồng bộ với bộ asset 2.5D đang chạy trong game (`apps/web/src/game/art.ts`): viền vàng vát, kính tím, nỉ xanh.

## 2. Bảng màu (dùng có kiểm soát)
| Vai trò | Mã |
|---|---|
| Royal purple / plum (nền, panel) | `#3a2468`, `#1b1036`, `#0b0620` |
| Vàng (viền, điểm nhấn) | `#fff1b8` → `#f2c14e` → `#8a5a12` |
| Emerald (nỉ, thành công) | `#1f8a5a` |
| Ruby (cảnh báo, Tài, mạnh) | `#d42a44` |
| Sapphire (Xỉu, thông tin) | `#2f5ee8` |
| Ice / rose (hiệu ứng) | `#9fd8ff`, `#ff4fd8` |

Vàng và tím là điểm nhấn, không bắt buộc ở mọi asset. Ưu tiên tương phản trên cả nền tối (plum) lẫn nền sáng.

## 3. Ánh sáng
- Đèn chính mềm từ trên-trái, rim light ấm, ambient occlusion nhẹ, highlight có kiểm soát.
- Không neon tràn lan, không lens flare, không bloom mờ.
- Bóng tiếp xúc chỉ nằm trong silhouette vật thể. Không có "tấm bóng" tách rời phía sau asset trong suốt.

## 4. Chất liệu
Vàng bóng, bạc chải, pha lê cắt, sơn mài, nhung, da, gỗ, tùy asset. Thể hiện tinh tế, không nhiễu chi tiết.

## 5. Bố cục, tỷ lệ, kích thước
| Loại | Kích thước tạo | Bố cục |
|---|---|---|
| Icon, badge, chip, item, chest, frame | 1024×1024 | Vật thể giữa khung, chừa lề khoảng 8%, không chạm mép |
| Card back | 1024×1536 | Một lá, tỷ lệ 5:7, đối xứng hai trục, chính diện |
| Chat bubble, title plate, slot frame, banner | 1536×1024 | Trang trí ở 4 góc; cạnh thẳng trơn để co giãn 9-slice |
| Mặt bàn (felt) | 1536×1024, opaque | Texture toàn khung, không chữ; layout và hitbox vẫn vẽ bằng code |

- File giao hàng (WebP) tối đa 1024 px, ≤ 1 MB, giữ alpha. Đây là giới hạn upload cosmetic của game.
- Phải nhận diện được ở **44–128 px** trên điện thoại cầm ngang. Contact sheet luôn có các bản thu nhỏ 128/64/44 px.

## 6. Trong suốt
- Asset cần trong suốt dùng **alpha thật** (`background: transparent`, PNG). Cấm nền caro giả và cấm backdrop.
- Khung avatar: tâm khoảng 72% đường kính phải trong suốt hoàn toàn; không có gì lấn vào trong.

## 7. Chữ và bản địa hóa
- Không vẽ chữ vào hình. Mọi chữ (cấp VIP, tên danh hiệu, số tiền, số roulette) do UI render bằng **Be Vietnam Pro** (fallback Arial, sans-serif), hỗ trợ VI/EN.
- Ngoại lệ có kiểm soát: chữ số "7" của biểu tượng slot.

## 8. Icon
Silhouette đậm, một ý tưởng mỗi icon, nhìn rõ ở 44 px. Cùng góc nhìn ba phần tư (trừ đồ vật chính diện như card back, khung, bánh xe nhìn từ trên).

## 9. Animation
- Asset là một lớp tĩnh; chuyển động làm bằng Phaser hoặc CSS (scale, fade, shimmer, sparkle).
- Không xoay khung avatar. Không nhấp nháy mạnh. Có `prefers-reduced-motion`: hiện khung tĩnh.
- Hiệu ứng thắng/thua không che gameplay quá lâu.

## 10. Không được
Photoreal; logo hoặc thương hiệu thật; nhân vật hay thiết kế của game khác; người thật; watermark; chữ AI sai; vật thể bị cắt, méo, lệch; nhiều asset gần giống nhau để tăng số lượng; placeholder giao như hàng hoàn chỉnh.

## 11. Đặt tên
`<category>.<subcategory>.<name>` (kebab-case), ví dụ `vip.badge.vip-15`, `frame.seasonal.lunar-new-year`.
File: `assets/studio/generated/<id>/v<n>/source.png` (gốc) và `optimized.webp` (giao hàng). Mỗi lần làm lại tăng `v<n>`; bản cũ được giữ lại.
