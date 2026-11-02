# Keyo Game HD Visual Preview

Một file HTML độc lập (Canvas 2D), dùng để **đánh giá phong cách đồ họa** trước khi làm đồ họa thật cho Unity. **Đây không phải bản Unity** và không chứa gameplay thật.

- **Màn hình:** Sảnh Game Center, Poker, Blackjack, Roulette, Tài Xỉu, Liêng, Xì Tố, Slots.
- **Animation:** chia bài, lật bài, chip vào pot, vòng roulette và bóng, lắc và mở bát Tài Xỉu, quay Slots.
  - Nút "▶ Animation" để xem lại.
  - Khi trình duyệt bật giảm chuyển động (`prefers-reduced-motion`), animation được tắt.
- **Chất lượng Low / Medium / High:** giới hạn DPR 1 / 1,5 / 2 và mức hiệu ứng.
  - Chỉ vẽ lại khi có chuyển động.
  - Riêng sảnh ở mức High có hiệu ứng nền chạy liên tục.
- **Dữ liệu:** toàn bộ là **dữ liệu giả lập**.
  - Không có request mạng nào ngoài Google Fonts.
  - Không tài khoản, không giao dịch.
- **Tài nguyên:**
  - Logo và hai đồng Cxu Bạc/Vàng chính thức từ `apps/web/public/assets/official`, thu nhỏ và nhúng base64.
  - Mọi thứ khác (bàn, lá bài, chip, bánh xe, xúc xắc, biểu tượng slot) được vẽ bằng code: không dùng asset của bên thứ ba.

## Mở

- Mở `index.html` trực tiếp trong trình duyệt, hoặc chạy `python3 -m http.server` trong thư mục này rồi mở `http://<máy>:8000/` trên iPhone cùng mạng Wi-Fi.
- Mở thẳng một màn hình bằng `#poker`, `#blackjack`, `#roulette`, `#taixiu`, `#lieng`, `#xito` hoặc `#slots`.
