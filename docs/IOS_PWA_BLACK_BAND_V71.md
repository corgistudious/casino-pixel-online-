# Dải đen phía dưới iPhone PWA — điều tra V7.1

## 1. Đối chiếu với Production (`Keyo-Production-UI-Reference.zip`, frontend đã build)

| Điểm | Production (ZIP) | `feat/hd-game-ui` (V7.1) |
|---|---|---|
| Viewport meta | `viewport-fit=cover, interactive-widget=resizes-visual` | `viewport-fit=cover, interactive-widget=resizes-content` |
| Chiều cao app | `html, body, #root { height: var(--app-height, 100dvh) }`; JS gán `--app-height` bằng `visualViewport.height` hoặc `innerHeight` (đo lúc khởi động, sau khi xoay thì đo lại sau 350ms, và "khôi phục" bằng cách thử tối đa 25×100ms) | `#root { position: fixed; top: 0; left: 0; right: 0; height: 100% }`: trình duyệt tự cấp chiều cao theo cửa sổ. JS chỉ ghi đè `--vvh`/`--vvt` khi bàn phím đang mở (`lib/viewport.ts`) |
| Listener | `resize`, `visualViewport.resize`, `orientationchange` (+350ms), `pageshow`, `visibilitychange` | Một bộ quản lý duy nhất `installViewport()`: gom cập nhật vào một khung hình (rAF), chỉ ghi khi giá trị thay đổi, có cleanup |
| Manifest | ZIP không kèm `manifest.webmanifest` (chỉ có `<link rel="manifest">`) | `display: fullscreen`, `orientation: any`, `background_color` và `theme_color` `#05040b`, `start_url: ./` |
| Service Worker | Không có | Không có (không có cache bản cũ) |
| Script chỉ cho Safari | Inline `keyo-safari-only` trong `index.html` | Không có trong source; có lẽ được thêm lúc deploy |

**Hệ quả:** trên Production, `--app-height` là một con số pixel cố định. Nếu iOS đang báo chiều cao tạm thời ngắn đúng lúc đo (khi vừa mở PWA, khi animation khởi chạy chưa xong, hoặc ngay sau khi xoay), `#root` bị khóa ngắn hơn cửa sổ. Phần dưới khi đó là một dải trống **thuộc DOM**, tức app gây ra. V7.1 không còn biến chiều cao cố định, nên dải đen kiểu này không thể xảy ra trên nhánh này.

## 2. Phân loại dải đen
`lib/viewportProbe.ts` → `classifyBand()`:
- `full`: trang có đủ cạnh màn hình.
- `layout-short`: `100lvh` vẫn đủ nhưng `innerHeight` ngắn. Web view có trải ra vùng đó, nên app có thể vẽ vào. Bài test tô màu sẽ hiện màu hồng sen ở vùng này.
- `window-short`: chính web view ngắn hơn màn hình. Vùng thiếu nằm ngoài trang (do iOS quản lý); không CSS hay JS nào vẽ vào được.

Đã đo trên iPhone (màn 440×956) ở giai đoạn trước, tình huống "xoay ngang rồi mở PWA": iOS cấp cửa sổ 956×378. `innerHeight`, `clientHeight` và `visualViewport.height` đều bằng 378, tức thiếu 62px; 62px chính là vùng thanh trạng thái của tư thế dọc bị mang sang tư thế ngang. Kết luận: `window-short`, giới hạn của iOS/WebKit. Reload không hết; mở lại từ trình chuyển ứng dụng thì hết (iOS dựng lại cửa sổ).

## 3. Giả thuyết cho hai tình huống
- **Tình huống 1 (xoay ngang rồi mở nhanh):** khả năng cao nhất là `window-short` (mục 2). Trên Production có thể cộng thêm dải DOM do `--app-height` bị kẹt. V7.1 loại bỏ được phần DOM; phần `window-short` thì ứng dụng web không sửa được.
- **Tình huống 2 (đóng hẳn, dùng app khác rồi mở lại):** chưa xác minh trên máy thật. Cần biết iOS khởi chạy mới hay khôi phục web view cũ. Bộ chẩn đoán giờ ghi lại `navigation` (`navigate`/`reload`/`back_forward`), `wasDiscarded`, `pageshow.persisted` và các mốc boot (khởi động, domReady, React mount, Phaser init). Nếu đó là web view được khôi phục với kích thước cũ, `resize` và `pageshow` vẫn đến; `#root` theo cửa sổ (CSS) và canvas Phaser tự khớp lại (ResizeObserver đọc kích thước thật của khung cha), không cần reload.

## 4. Phần ứng dụng đảm bảo
- `#root` luôn bằng cửa sổ mà iOS cấp. Không có chiều cao pixel cố định, không cộng safe-area hai lần, nền chạy tới tận mép, chỉ các nút điều khiển được lùi vào bằng `--sa-*`.
- Canvas Phaser: `useStableSize` (ResizeObserver) đọc lại kích thước khung cha (`getParentBounds()`) rồi gọi `refresh()` mỗi khi khung thay đổi. Không tạo lại game, không reset scene hay WebSocket.
- Không có vòng lặp resize: cập nhật được gom vào rAF và chỉ ghi khi khác giá trị cũ. Không reload, không polling vô hạn.
- `StandaloneInsetHint`: khi iOS cấp cửa sổ thiếu kéo dài quá 1,5 giây, app giải thích cho người chơi cách duy nhất có hiệu quả (mở lại từ trình chuyển ứng dụng). Mỗi phiên chỉ hiện một lần.

## 5. Thử trên iPhone thật
1. Cài bản V7.1, vào **Cài đặt**, chạm **5 lần** vào dòng phiên bản để bật chẩn đoán ("Đã bật chẩn đoán màn hình"), rồi đóng hẳn app.
2. **Test A:** cầm dọc → xoay ngang → mở PWA ngay.
3. **Test B:** cầm dọc → xoay ngang → chờ vài giây → mở PWA.
4. **Test C:** đóng hẳn PWA → dùng app khác một lúc → mở lại bình thường.
5. Mỗi lần thấy dải đen: chạm ô `VP` ở góc → bật **paint**:
   - Dải chuyển **hồng sen**: dải nằm trong trang (lỗi layout). Hãy gửi báo cáo.
   - Dải vẫn **đen**: dải nằm ngoài trang (do iOS). Dòng `band` sẽ ghi `window-short`.
6. Chạm **copy** để sao chép 5 lần mở gần nhất (dạng JSON: cửa sổ, `visualViewport`, `screen`, safe-area, khung game, canvas, mốc boot, loại khởi chạy; không chứa token hay dữ liệu tài khoản) rồi gửi lại. So sánh lần có dải đen với lần không có.
7. Tắt chẩn đoán: chạm 5 lần vào dòng phiên bản một lần nữa.

## 6. Chưa xác minh
- Chưa thử trên iPhone thật với bản V7.1 này. Không thể khẳng định dải đen đã hết hoàn toàn.
- Phần `window-short` là giới hạn của iOS: ứng dụng web không vẽ được vào đó.
