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

## 4. Phần ứng dụng đảm bảo (bản Final Risk Remediation)
- **`#root` luôn bằng cửa sổ iOS cấp**: không có chiều cao pixel cố định, không cộng safe-area hai lần. Nền chạy tới tận mép; chỉ các nút điều khiển lùi vào bằng `--sa-*`.
- **Mới — `layout-short` được lấp**: khi web view vẫn phủ cả màn (`100lvh` đủ) mà layout viewport (`innerHeight`) ngắn, `lib/viewport.ts` gắn class `vp-fill-lvh`, đặt `#root { height: 100lvh }` (đơn vị CSS, không khóa px). Dải này nằm trong trang nên app vẽ được, thay vì để lộ nền `#05040b` trông như dải đen. Điều kiện: chỉ áp cho iPhone PWA ở chế độ ngang khi bàn phím đóng; tự gỡ ngay khi cửa sổ đủ.
- **Mới — `window-short` được nhờ WebKit đọc lại viewport, có giới hạn**: tối đa 2 lần cho mỗi lần mở, mỗi lần xoay và mỗi lần resume. Mỗi lần chỉ bật/tắt cờ vô hại `shrink-to-fit=no` trong meta viewport; hai lần bật/tắt thì meta trở về y như cũ. Không reload, không polling, không vòng lặp. Không bao giờ đặt chiều cao vượt cửa sổ, vì phần đó nằm ngoài web view và sẽ che nút điều khiển phía dưới. Chưa có bằng chứng trên máy thật rằng cách này hết dải; chỉ là giả thuyết có căn cứ, và số lần thử được ghi trong chẩn đoán.
- **Canvas Phaser**: `useStableSize` (ResizeObserver) đọc lại kích thước khung cha (`getParentBounds()`) rồi gọi `refresh()` mỗi khi khung đổi. Không tạo lại game, không reset scene hay WebSocket.
- **Mới — rò rỉ khi rời phòng**: Phaser 3.90 không gỡ listener `visibilitychange` khi hủy game, nên mỗi lần rời phòng là giữ lại nguyên game đã hủy trong bộ nhớ. `PhaserView` nay gỡ listener đó; suite `pwa` (mục F) kiểm tra việc này.
- **Không vòng lặp resize**: cập nhật được gom vào rAF và chỉ ghi khi giá trị khác cũ. Suite `pwa` (mục A) đo: 0 lần ghi style/class trong 2,5 giây lúc nghỉ.
- **`StandaloneInsetHint`**: chỉ hiện với `window-short` kéo dài quá 1,5 giây (không hiện khi đã lấp lvh), mỗi phiên một lần.

## 4b. Phân lớp nguồn gốc dải (`diagnoseLayers`, ghi vào từng mẫu)
| `layer` | Ý nghĩa | Ai sửa |
|---|---|---|
| `webkit` | Web view ngắn (`window-short`); vùng thiếu do iOS/WebKit quản lý | Không sửa được từ trang. Mở lại từ App Switcher |
| `dom` | `#root` hoặc `.game-shell` thấp hơn vùng trang vẽ được (kể cả `layout-short` chưa được lấp) | App. Hãy gửi JSON |
| `canvas` | Canvas Phaser không khớp lại khung của nó (không cạnh nào chạm khung) | App. Hãy gửi JSON |
| `safe-area` | Không thiếu gì; đó là phần lề thanh Home mà các nút lùi vào | Bình thường |
| `none` | Mọi lớp chạm đáy | — |

## 4c. Service worker / cache / chặn PWA
- Không có service worker, cả trong source lẫn ZIP Production, nên không thể có bản cũ bị cache. Shell `index.html` được phục vụ no-cache và có `<meta name="keyo-build">` để kiểm tra bản đang chạy.
- **Lưu ý khi thử trên máy thật:** bản build mặc định **chặn** app cài trên màn hình chính (`lib/pwaBlock.ts`, `VITE_PWA_BLOCK=all`). App chỉ mở được khi server có `/pwa-policy.json` với nội dung `{"ios": false, "android": false}`, hoặc khi build với `VITE_PWA_BLOCK=off`. Nếu không, PWA hiện màn hình "dùng trình duyệt" chứ không vào game.

## 5. Thử trên iPhone thật
1. Cài bản V7.1, vào **Cài đặt**, chạm **5 lần** vào dòng phiên bản để bật chẩn đoán ("Đã bật chẩn đoán màn hình"), rồi đóng hẳn app.
2. **Test A:** cầm dọc → xoay ngang → mở PWA ngay.
3. **Test B:** cầm dọc → xoay ngang → chờ vài giây → mở PWA.
4. **Test C:** đóng hẳn PWA → dùng app khác một lúc → mở lại bình thường. Thêm một biến thể: chỉ vuốt về màn hình chính (không đóng hẳn) rồi mở lại. Trường hợp này được ghi là **resume**.
5. Mỗi lần thấy dải đen: chạm ô `VP` ở góc. Dòng đầu cho biết `band` và `layer`. Bật **paint**:
   - Dải chuyển **hồng sen**: dải nằm trong trang (`dom`/`layout-short`). Hãy gửi báo cáo.
   - Dải vẫn **đen**: dải nằm ngoài trang, `layer` = `webkit`.
6. Chạm **copy launches**: lấy 5 lần mở gần nhất (8 giây đầu, tối đa 60 mẫu) và 5 lần resume gần nhất (3 giây đầu, tối đa 30 mẫu), kèm quyết định của bộ quản lý viewport (`fill-lvh`, `nudge`). Mỗi mẫu có cửa sổ, `visualViewport`, `screen`, đơn vị vh/svh/lvh/dvh, safe-area, khung game, canvas, mốc boot và loại khởi chạy. Không có token hay dữ liệu tài khoản. Gửi lại để so sánh lần có dải với lần không có.
7. Tắt chẩn đoán: chạm 5 lần vào dòng phiên bản một lần nữa.

## 6. Chưa xác minh
- Chưa thử bản này trên iPhone thật. Không thể khẳng định dải đen đã hết hoàn toàn.
- Chưa biết trên máy thật dải thuộc `layout-short` (bản này đã lấp) hay `window-short` (giới hạn của iOS). Lần đo trước chỉ có `innerHeight`/`clientHeight`/`visualViewport` = 378, chưa có `lvh`.
- Chưa biết việc nhờ WebKit đọc lại meta viewport có hết `window-short` hay không.
