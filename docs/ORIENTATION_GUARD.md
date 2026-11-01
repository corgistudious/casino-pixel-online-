# OrientationGuard — nhắc xoay màn hình

Chỉ frontend (`apps/web`). Không đổi backend, database hay gameplay.

## Phạm vi

| Khu vực | Màn hình dọc | Màn hình ngang |
|---|---|---|
| Đăng nhập, Đăng ký, Khôi phục mật khẩu (kể cả trang link `/reset-password`, `/activate`, `/verify-email`, `/captain-setup` và màn chờ xác minh email) | Bình thường | Nhắc xoay dọc |
| Sảnh game, phòng chơi, mọi trang sau đăng nhập (kể cả Admin) | Nhắc xoay ngang | Bình thường |
| PC / Desktop / Laptop | Không nhắc | Không nhắc |

Áp dụng cho iPhone, Android phone, iPad, Android tablet, thiết bị gập và thiết bị di động cảm ứng khác, trên Safari, Chrome, trình duyệt tương thích và PWA.

## Nhận diện thiết bị (`apps/web/src/lib/device.ts`)

Không dùng `max-width`. Không coi màn hình lớn là PC, và không coi mọi thiết bị cảm ứng là điện thoại. Thứ tự tín hiệu:

1. **UA Client Hints** (Chromium): `mobile`, và `platform` là hệ điều hành thật, kể cả khi Android bật "Trang web cho máy tính".
2. **User-Agent**: iPhone/iPod; Android + `Mobile`; iPad.
3. **iPadOS báo UA giống Mac**: "Mac" có `maxTouchPoints > 1` là iPad, vì Mac không có màn hình cảm ứng.
4. **Hệ điều hành desktop** (Windows, macOS, Linux, ChromeOS) là PC, **kể cả khi có màn hình cảm ứng**.
5. **Nền tảng không rõ**: chỉ coi là mobile khi thiết bị chỉ có cảm ứng (`pointer: coarse`, `hover: none`, không có con trỏ fine nào).

Thiết bị lai:

- Laptop cảm ứng / 2-in-1 Windows, Chromebook: là PC, không chặn. Khi không chắc chắn thì ưu tiên không chặn người dùng PC.
- Android dùng chuột làm thiết bị chính (Samsung DeX, dock desktop): là PC.
- iPad có Magic Keyboard/trackpad: vẫn là iPad, vẫn được nhắc.

## Hướng màn hình (`apps/web/src/lib/orientation.ts`)

- Ưu tiên `screen.orientation.type` (Chrome, Android, Safari 16.4+), rồi `window.orientation` (iOS cũ), cuối cùng mới đến media query `(orientation: portrait)`.
- API màn hình được ưu tiên vì bàn phím ảo làm viewport thấp lại. Nếu dùng media query, việc gõ phím khi cầm dọc sẽ bị hiểu nhầm là "ngang".
- Theo dõi các sự kiện `screen.orientation` change, `orientationchange`, `resize` và thay đổi của media query, để tự hiện/ẩn ngay khi xoay.

## Hành vi

- Lớp phủ (`ui/OrientationGuard.tsx`) nằm **trên** trang, không thay thế trang. Trang bên dưới vẫn mounted nên form đang nhập, phiên đăng nhập, WebSocket và trạng thái phòng chơi giữ nguyên. Không tải lại trang.
- Không dùng `screen.orientation.lock()` hay API ép xoay nào.
- Không đổi meta viewport và các bản vá iOS hiện có (`viewport-fit=cover`, `auth-*`, `dvh`). Lớp phủ có padding safe-area.
- Giao diện Keyo (tím/đen/viền vàng, logo). Biểu tượng điện thoại xoay theo hướng cần; có chế độ giảm chuyển động (cả cài đặt hệ thống lẫn cài đặt trong game). VI/EN.
- Thay `RotateOverlay` cũ, vốn dùng `portrait:max-md` (không nhắc trên iPad và nhắc nhầm trên cửa sổ PC hẹp).

## Kiểm thử

- `apps/web/test/orientation.test.ts`: phân loại thiết bị bằng UA thật (iPhone Safari/Chrome, Android phone, Firefox Android, Samsung Fold, iPad desktop-mode/legacy/Chrome, Android tablet, Android desktop-site, Windows, Mac, Linux, ChromeOS, laptop cảm ứng, DeX, nền tảng lạ); đọc hướng (có trường hợp bàn phím); hướng cần theo khu vực.
- E2E Playwright với giả lập thiết bị: iPhone (Safari, Chrome), Android phone, iPad Pro 13" (UA Mac + cảm ứng), iPad Chrome, Android tablet, Fold (màn ngoài/trong), PC Windows, PC cửa sổ hẹp, Mac cửa sổ hẹp, PC màn hình cảm ứng. Ảnh trong `docs/previews/orientation-guard/`.
- Giới hạn: giả lập trong Chromium, chưa thử trên máy thật. Safari thật dùng cùng API (`screen.orientation`, hoặc `window.orientation` trên iOS < 16.4).
