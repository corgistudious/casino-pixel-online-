# Chặn chế độ ứng dụng (PWA standalone) trên iOS và Android

Owner quyết định ngừng hỗ trợ PWA standalone trên iPhone, iPad và Android. Người chơi tiếp tục chơi bằng Safari, Chrome hoặc trình duyệt thông thường.

## Phạm vi

| Môi trường | Kết quả (mặc định) |
|---|---|
| iPhone / iPad: app mở từ màn hình chính | **Chặn**, hiện màn hình thông báo |
| Android: app đã cài (display-mode `standalone` hoặc `fullscreen`) | **Chặn**, hiện màn hình thông báo |
| Safari iPhone/iPad, Chrome Android, trình duyệt thường khác | Chơi bình thường, không gửi request kiểm tra |
| PC, kể cả PWA cài trên desktop | Chơi bình thường |

## Cách nhận diện (`apps/web/src/lib/pwaBlock.ts`)

- **App đã cài** khi có một trong các dấu hiệu:
  - `navigator.standalone === true` (iOS);
  - `matchMedia('(display-mode: standalone)')`;
  - `matchMedia('(display-mode: fullscreen)')`, nhưng chỉ khi không có `document.fullscreenElement`. Manifest khai báo `fullscreen`, và một tab thường không thể khởi động sẵn ở Fullscreen API.
- **Hệ điều hành:**
  - UA Client Hints (`platform`);
  - UA chứa `iPhone`, `iPad` hoặc `Android`;
  - iPadOS báo UA "Macintosh", nên Mac có cảm ứng (`maxTouchPoints > 1`) được tính là iPad.
  - Không quyết định chỉ dựa vào user-agent: phải đồng thời là app đã cài.
- **Thời điểm quyết định:** một lần, trong `main.tsx`, **trước khi mount** game. Nếu bị chặn, chỉ render `PwaBlockedScreen`. App và game không được mount, không mở WebSocket.
- **Không** redirect, không reload. Không xóa phiên đăng nhập, localStorage, IndexedDB hay cache. Không đụng service worker (dự án không có service worker).

## Cấu hình (khôi phục PWA sau này không cần sửa code)

1. **Lúc build:** `VITE_PWA_BLOCK=all` (mặc định khi không đặt) `| ios | android | off`.
   - Giá trị lạ được coi là `all`.
   - `VITE_PWA_BLOCK_URL` đổi liên kết hiển thị (chỉ nhận https). Mặc định `https://play.keyogame.com`.
2. **Lúc chạy (ưu tiên hơn khi hợp lệ):** file tùy chọn `pwa-policy.json` đặt cạnh `index.html`:

   ```json
   { "ios": false, "android": false }
   ```

   - Ví dụ trên mở lại PWA cho cả hai. Có thể chỉ ghi một trường, ví dụ `{"android": false}`, hoặc `{"url": "https://…"}`.
   - Chỉ app đã cài trên điện thoại mới tải file này, với `cache: no-store` và tối đa 1,5 giây.
   - Thiếu file, sai định dạng (máy chủ trả về `index.html`) hoặc quá chậm: dùng giá trị lúc build. Trạng thái đã cấu hình được giữ nguyên, không tự mở hoặc tự chặn.
   - Repo **không** kèm file này, nên mặc định là chặn.
   - Trên Test (container `keyo-keyboard-test`): `docker cp pwa-policy.json keyo-keyboard-test:/srv/`. Xóa file thì quay về mặc định.

## Màn hình thông báo (`apps/web/src/ui/PwaBlockedScreen.tsx`)

- **Bố cục:**
  - logo chính thức (`/assets/official/keyo-game-logo.png`, giữ tỷ lệ, glow vàng nhẹ);
  - tiêu đề, nội dung;
  - ô địa chỉ (chọn và sao chép được) kèm hướng dẫn mở bằng trình duyệt;
  - nút **Sao chép liên kết**, thông báo kết quả, dòng cảm ơn;
  - nút chuyển VI/EN.
- **Sao chép:**
  - dùng Clipboard API; nếu không có thì dùng `execCommand('copy')` trên ô địa chỉ;
  - nếu vẫn không được thì bôi đen liên kết và hướng dẫn nhấn giữ để sao chép.
  - Không tự mở Safari hoặc Chrome.
- **Bố cục riêng, không phụ thuộc layout game:**
  - lớp `fixed` có thể cuộn;
  - padding theo safe-area (notch, Dynamic Island);
  - landscape chia 2 cột; màn hình thấp (≤ 740px) thu nhỏ logo và chữ.
- **Hiệu ứng:** xuất hiện 0,45 giây, tắt khi người dùng bật `prefers-reduced-motion`.

## Deploy lên Test

Script dừng nếu đích thuộc Production. Backup cũ được giữ nguyên.

```bash
cd /opt/keyo-game-pr29-1-work
curl -fsSLO https://raw.githubusercontent.com/corgistudious/casino-pixel-online-/fix/ios-pwa-landscape-startup/deploy/vps/test/deploy-test-web.sh
TEST_DEMO=1 TEST_WEB_CONTAINER=keyo-keyboard-test bash deploy-test-web.sh
curl -s https://test.play.keyogame.com/ | grep -o '<meta name="keyo-build"[^>]*>'   # phải là commit mới
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://test.play.keyogame.com/pwa-policy.json  # mong đợi: text/html (không có file → chặn)
```

- Script chỉ dùng `docker cp` vào `/srv` và backup `/srv` trước. Không restart, không đụng Docker network, PostgreSQL hay Redis.
- Rollback: lệnh in ra ở cuối script, hoặc dùng backup có sẵn: `docker cp /opt/keyo-game-pr29-1-work/web-srv-backup-20261101-193247/. keyo-keyboard-test:/srv/`.

## Kiểm tra trên thiết bị thật

- **iPhone:**
  - app ở màn hình chính: màn hình thông báo hiện ngay, cả dọc lẫn ngang;
  - nút sao chép hoạt động, VI/EN chuyển đúng;
  - đóng hẳn app rồi mở lại: vẫn bị chặn.
- **iPhone Safari** (tab thường) với `https://test.play.keyogame.com`: vào game bình thường, đăng nhập còn nguyên.
- **Android:** app đã cài bị chặn; Chrome tab thường vào game bình thường.
- **PC:** vào game bình thường.
- **Mở lại PWA trên Test:** chép `pwa-policy.json` `{"ios":false,"android":false}` vào `/srv`, đóng hẳn app rồi mở lại → vào game. Xóa file → chặn lại.

Lưu ý: website không thể ngăn người dùng thêm icon vào màn hình chính. Cơ chế này chỉ chặn gameplay khi chạy ở chế độ app.
