# iPhone PWA: thiếu ~62px khi mở app ở chế độ ngang

## Hiện tượng (số đo trên máy thật)

- Màn hình chính đang dọc, xoay ngang máy, rồi mở app từ icon: có dải đen khoảng 62px ở đáy.
- Lúc lỗi: `screen` 440×956; `inner`, `client`, `visual` và `#root` đều 956×378.
  - Hướng màn hình `landscape-primary`, `standalone` true.
- Mẫu lúc khởi động: 0ms có `inner` 894; từ 12ms đến 2264ms đều 378.
- Lúc bình thường: 956×440.
- Đóng app trong App Switcher rồi mở lại khi đang ngang thì hết lỗi.
  - Về Home rồi quay lại không hết. `location.reload()` cũng không hết.

## Phân tích

1. `innerHeight`, `clientHeight` và `visualViewport.height` đều cùng một giá trị 378.
   - Vậy chính **cửa sổ** WebKit mà iOS cấp cho trang đã ngắn.
   - Đây không phải lỗi layout của game: CSS và JS không vẽ được ra ngoài cửa sổ của trang.
2. 62 = 956 − 894 = 440 − 378: đúng bằng phần iOS chừa cho thanh trạng thái ở chế độ dọc.
   - Ở mẫu 0ms, iOS đã chừa 62px phía trên (cửa sổ dọc 894).
   - Sau khi chuyển sang ngang, phần chừa đó vẫn bị giữ.
3. Reload giữ nguyên cửa sổ native, còn khởi động lại từ App Switcher thì dựng cửa sổ mới ở chế độ ngang. Điều này khớp với việc reload không hết lỗi mà App Switcher thì hết.
4. Nguồn có `apple-mobile-web-app-status-bar-style=black-translucent`.
   - Với translucent, app ở chế độ dọc phải có `inner` 956, không phải 894.
   - Số 894 cho thấy app đã cài có thể đang chạy với kiểu thanh trạng thái không translucent.
   - iOS lưu cấu hình meta/manifest **lúc "Thêm vào MH chính"**, nên icon cài trước khi đổi meta vẫn giữ cấu hình cũ.

**Độ tin cậy**

- Cao: lỗi nằm ở cửa sổ iOS cấp chứ không phải layout, vì ba số đo độc lập cùng ra 378.
- Trung bình: nguyên nhân là kiểu thanh trạng thái lưu lúc cài. Cần thử bằng cách xóa icon rồi cài lại.

## Bản vá (chỉ phía web, có thể hoàn tác)

- Gỡ phần ép `#root` theo `screen` (`--app-w`/`--app-h`). Với cửa sổ 378, ép 440 sẽ đẩy 62px đáy UI (dock, nút) ra ngoài tầm nhìn.
  - Giờ UI luôn nằm gọn trong cửa sổ thật.
- `lib/viewportProbe.ts` phát hiện trạng thái lỗi. Chỉ tính khi đủ cả các điều kiện:
  - iPhone, standalone, đang ngang;
  - chiều ngắn của màn hình trừ chiều cao nhìn thấy ≥ 40px.
  - Không bao giờ tính cho iPad, Android, PC hay tab Safari.
- `ui/StandaloneInsetHint.tsx` hiện gợi ý khi trạng thái lỗi kéo dài 1,5 giây. Gợi ý có thể tắt, chỉ hiện 1 lần mỗi phiên, tự ẩn khi cửa sổ đủ lại, không reload và không đổi kích thước gì.
- `ui/ViewportDiagnostics.tsx` là overlay đo đạc. Chỉ bật khi build với `VITE_VIEWPORT_DIAG=1` hoặc khi có `localStorage keyo.vpdiag=1`.
  - Lấy mẫu ở 0/12/50/100/250/500/1000/2000/4000ms và ở mọi sự kiện viewport.
  - Có nút sao chép JSON và nút "probe" (thanh sọc cao bằng chiều ngắn của màn hình).

## Kiểm thử trên iPhone (Test)

Build Test có overlay:

```bash
VITE_VIEWPORT_DIAG=1 VITE_DEMO=1 VITE_API_URL="" pnpm --dir apps/web build
```

1. **Xóa icon Keyo cũ** trên màn hình chính.
2. Mở `https://test.play.keyogame.com` bằng Safari, chọn Chia sẻ, rồi "Thêm vào MH chính".
3. Mở app khi đang **dọc** và đọc ô `VP` ở góc phải dưới.
   - `inner` 440×956 nghĩa là translucent đã có hiệu lực.
   - 440×894 nghĩa là chưa có hiệu lực.
4. Đóng app trong App Switcher. Về màn hình chính, giữ máy dọc.
5. Xoay ngang rồi mở app lần đầu.
   - Ghi lại `VP`: 956×440 là đúng, 956×378 là lỗi.
   - Bấm `VP`, chọn "copy JSON" và gửi lại kết quả.
6. Nếu vẫn 378, bật "probe".
   - Thanh sọc bị cắt ở đáy cửa sổ, dải đen vẫn đen: xác nhận phần đó nằm ngoài cửa sổ trang (giới hạn của iOS).
7. Kiểm tra thêm:
   - gợi ý tiếng Việt hiện ra, dock đáy không bị che;
   - "Đã hiểu" tắt được gợi ý;
   - đăng nhập và xác minh email ở chế độ dọc vẫn bình thường.

## Nếu cài lại vẫn lỗi

Khi đó đây là giới hạn của iOS/WebKit, không sửa được bằng Web API. Các phương án:

- Đóng app trong App Switcher rồi mở lại khi đang ngang; gợi ý trong app đã hướng dẫn việc này.
- Gửi báo lỗi cho Apple qua Feedback Assistant (WebKit/PWA), kèm JSON từ overlay.
- Bọc app native (WKWebView, ví dụ Capacitor) để toàn quyền điều khiển cửa sổ và hướng màn hình.

## Hoàn tác

```bash
git revert <commit>
# hoặc
git apply -R ios-pwa-landscape-startup.patch
```
