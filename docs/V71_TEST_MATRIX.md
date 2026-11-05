# V7.1 — ma trận kiểm thử đa nền tảng

**Tự động** = Playwright Chromium giả lập (UA, kích thước, cảm ứng, DPR), trên bản build demo. **Thiết bị thật** = chưa có trong môi trường phát triển; cột "Chưa xác minh" liệt kê những gì phải thử tay.

## Bộ test tự động
| Bộ | Phạm vi | Kiểm tra |
|---|---|---|
| `v71fit` | 15 kích thước × 13 màn hình: điện thoại ngang (iPhone SE/15/Pro Max, Android 360/412), điện thoại dọc (iPhone, Android), iPad dọc/ngang, laptop 16:9, 16:10, Full HD, 21:9, cửa sổ nhỏ, cửa sổ hẹp | Thông báo xoay ngang (app bị khóa phía dưới) khi điện thoại cầm dọc; không tràn ngang; bàn không méo (tỉ lệ canvas khớp); bàn ngang trên điện thoại và PC; bàn nằm trong khung; thanh điều khiển dưới bàn và trong màn hình; HUD không che bàn; mọi nút trong màn hình và ≥ 44px trên màn cảm ứng (≥ 32px trên PC); panel mở/đóng; không còn sidebar phải |
| `pages-sweep` | 21 trang chức năng × 7 kích thước | Không tràn ngang; cả trang không cuộn (trang dài cuộn bên trong khung); không nút nào bị cắt mép |
| `flows` | iPhone ngang 844×390, 8 game | Đặt cược, quay/lắc/chia, Blackjack đến hết ván, bàn bài hành động hợp lệ, rời ghế/ngồi lại, Blackjack nhiều người ngồi/cược/chơi |
| `icons-check` | Android/iPhone ngang thấp (360–375px) | Nút HUD và thanh điều khiển ≥ 44px, trong màn hình |
| Unit (Vitest) | Phân loại thiết bị, hướng màn hình, dải portrait, cược, bàn chơi, i18n, fullscreen | — |

## Chưa xác minh (cần thiết bị thật)
| Nền tảng | Việc cần thử |
|---|---|
| iPhone PWA (có tai thỏ, Dynamic Island, màn nhỏ) | Test A/B/C dải đen (`docs/IOS_PWA_BLACK_BAND_V71.md`), mở nguội, mở lại, khóa/mở khóa, bàn phím chat |
| iOS Safari, Chrome iOS | Thanh địa chỉ ẩn/hiện, xoay màn hình |
| Android Chrome, Firefox, Samsung Internet, Android PWA | Thanh điều hướng hệ thống, bàn phím, PWA standalone |
| iPad, máy tính bảng Android | Xoay giữa ván (bàn giữ hướng lúc mở cho tới khi vào lại bàn) |
| Desktop Edge, Firefox, Safari | Hover/focus, toàn màn hình |
| Hiệu năng | FPS thật (Chromium headless vẽ bằng phần mềm chỉ đạt khoảng 5 FPS ở màn chơi; bản V7.0 cũng vậy hoặc chậm hơn) |
