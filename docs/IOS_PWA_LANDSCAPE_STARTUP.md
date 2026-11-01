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

# Dải đen khi mở bàn phím (trường hợp B)

- Trường hợp A (mở app khi đang dọc rồi xoay ngang): bàn phím bình thường.
- Trường hợp B (mở app khi đã ngang): mở bàn phím trong Chat thì có dải đen ở đáy.

## Cơ chế

- Khi bàn phím mở, iOS không thu nhỏ layout viewport. Nó chỉ thu nhỏ visual viewport, và có thể **dời visual viewport xuống** (`visualViewport.offsetTop > 0`) để lộ ô nhập.
  - `window.scrollTo(0,0)` không hoàn tác được phần dời này.
- `#root` là `position: fixed`, nên được đặt trong **layout viewport**.
  - Trước bản vá, khi bàn phím mở, root được đặt ở `top: 0` với chiều cao bằng `visualViewport.height`.
  - Nếu iOS dời `offsetTop` = N px, người chơi nhìn thấy vùng [N, N + height]. Root khi đó bị lệch lên N px, và dưới root, ngay trên bàn phím, là N px trống: chính là dải đen.
  - Ở trường hợp A, `offsetTop` = 0 nên không có dải.
- Ở trường hợp B, iOS cấp cửa sổ lệch (xem phần trên), nên cách iOS tính phần dời cho bàn phím khác trường hợp A.
- **Chưa đo trên máy thật:** giá trị `offsetTop` cụ thể ở trường hợp B. Overlay chẩn đoán ghi `vv WxH @offsetTop` ở mỗi lần focus và mỗi lần visual viewport thay đổi, để xác nhận.

## Bản vá

- `lib/viewport.ts` có thêm hàm `keyboardFrame()`. Khi bàn phím mở, root đặt `top = offsetTop`, `height = visualViewport.height` (biến `--vvt` và `--vvh`), nên phủ đúng vùng nhìn thấy phía trên bàn phím.
  - `--kb` = layout − top − height, dùng cho bottom sheet.
  - Khi bàn phím đóng, các biến bị xóa, layout trở lại như cũ.
  - Khi `offsetTop` = 0 (trường hợp A), kết quả giống hệt trước đây.
- `.overlay` (dialog) cũng dùng `top: var(--vvt)`.
- Phần kiểm tra ô nhập có đang hiện hay không (`reveal`) giờ tính theo vùng [offsetTop, offsetTop + height].
- Không reload, không giả lập xoay, không ép kích thước theo `screen`, không che bằng CSS.

## Kiểm thử bàn phím trên iPhone

1. Thử trường hợp B với build có overlay:
   - Giữ máy dọc ở màn hình chính, xoay ngang rồi mở app.
   - Vào Chat, chạm ô nhập.
   - Không còn dải đen; ô nhập và nút Gửi nằm ngay trên bàn phím.
2. Đóng/mở bàn phím nhiều lần, chuyển giữa các ô nhập, gửi tin, chuyển sang app khác rồi quay lại. Nội dung đang gõ phải được giữ.
3. Lặp lại với trường hợp A (mở khi dọc rồi xoay ngang). Kết quả phải giống trước.
4. Nếu vẫn còn dải: bấm `VP`, chọn "copy JSON" và gửi lại. Cần các dòng `focusin+400ms` với `vv` (có `@offsetTop`), `sc` (scrollY) và `kb` (`--vvt --vvh --kb`).
   - Nếu `offsetTop` = 0 mà vẫn có dải, dải đó nằm ngoài cửa sổ trang (giới hạn của iOS), không phải do layout.

# Lần 3: dải đen ngay khi khởi động (commit `266935a`, đã thử trên iPhone thật)

Cách tái hiện đã xác nhận: màn hình chính đang dọc → xoay ngang → mở PWA. Dải đen có ngay từ lúc khởi động, chưa cần mở Chat. Phần sửa bàn phím (`--vvt`) không liên quan tới lỗi này.

## Đã kiểm tra trong mã nguồn

- `index.html`:
  - `viewport-fit=cover`;
  - `apple-mobile-web-app-capable`;
  - `apple-mobile-web-app-status-bar-style=black-translucent`;
  - splash `position:fixed; inset:0`.
- Manifest: `display: fullscreen`, `orientation: any`. Không có service worker.
- CSS toàn cục:
  - `html, body { height: 100% }`, `#root { position: fixed; top: var(--vvt, 0); height: var(--vvh, 100%) }`;
  - app không tính chiều cao theo `100vh`/`dvh` ở root;
  - `body` có nền `bg-ink-950` + gradient lounge.
- `main.tsx`: chỉ gắn `installViewport()`. Khi bàn phím đóng, controller này không ghi gì vào root.
- `Stage` (sảnh): tính theo `innerWidth`/`innerHeight`.

Kết luận từ mã nguồn:

- Root và mọi lớp phủ đều lấy **đúng cửa sổ** mà WebKit báo (`innerHeight`).
- Các số đo trên máy thật (`inner`, `client`, `visual`, root đều 378 trên màn 440) cho thấy layout đã phủ kín cửa sổ đó. E2E xác nhận root = cửa sổ và không có phần tử nào nằm dưới cửa sổ.

## Câu hỏi còn lại (cần dữ liệu từ máy thật)

Dải 62px nằm **trong** web view hay **ngoài** web view?

| Giả thuyết | Dấu hiệu | Ý nghĩa |
|---|---|---|
| **Ngoài web view** (frame native của WKWebView ngắn, vùng hệ thống iOS) | `100lvh` = 378; bật "paint" thì dải **vẫn đen** | Trang không vẽ được vào đó; không CSS/JS nào sửa được. Đây là lỗi iOS: frame dựng theo hướng dọc kèm phần chừa thanh trạng thái 62px. |
| **Trong web view** (layout viewport ngắn hơn web view) | `100lvh` ≈ 440 > `innerHeight`; bật "paint" thì dải **thành màu hồng** | Sửa được bằng cách cho root dùng `100lvh`. Thử ngay trên máy bằng nút "root: lvh". |

Bằng chứng hiện có nghiêng về **ngoài web view**:

- Ba số đo độc lập đều là 378.
- Đổi chiều cao root (người dùng đã thử) không có tác dụng.
- Dải màu đen tuyền, trong khi nền trang là gradient tím-đen.
- Đóng app trong App Switcher rồi mở lại thì hết. Reload không hết.

Tuy vậy, **chưa đo trực tiếp**, nên chưa kết luận.

## Overlay chẩn đoán (Test) có thêm

- **Kết luận ngay trên màn hình:** `gap N full | layout-short | window-short`, kèm số đo `vh/svh/lvh/dvh`, hộp `html`/`body`/root và phần tử nằm ở hàng điểm ảnh cuối cửa sổ.
- **"paint on":** nền `html`/`body` đổi sang hồng, root có viền xanh. Chỉ để chẩn đoán, tắt là gỡ.
- **"root: lvh / screen / auto":** thử trực tiếp kích thước root, không reload. Chuyển về "auto" là gỡ.
- **"viewport-fit ↻":** bật/tắt `viewport-fit` để WebKit tính lại viewport, và ghi mẫu trước/sau.
- **"copy launches":** dữ liệu 4 giây đầu của 5 lần mở gần nhất. Lần mở bị lỗi vẫn sao chép được sau đó.

## Thu dữ liệu trên iPhone thật

Đóng hẳn app trong App Switcher trước mỗi lần thử.

1. Giữ máy dọc ở màn hình chính, xoay ngang, mở app. Dải đen xuất hiện.
2. Chạm ô `VP` và ghi lại dòng tiêu đề, ví dụ `gap 62 window-short`.
3. Bật **paint on**: dải đổi sang hồng hay vẫn đen? Chụp màn hình.
4. Bấm **root:** lần lượt `lvh`, `screen`, `auto`. Mỗi chế độ: dải còn không, dock đáy có bị cắt không? Chụp màn hình.
5. Bấm **viewport-fit ↻**: dải còn không?
6. Xoay về dọc rồi xoay lại ngang (không đóng app): dải còn không?
7. Bấm **copy launches** và **copy JSON**, gửi cả hai.
8. Mở app khi đang dọc, chạm ô `VP`: `inner` là 956 (thanh trạng thái translucent) hay 894 (iOS chừa thanh trạng thái)? `safe` top là bao nhiêu?

## Safari Web Inspector (nếu có máy Mac)

1. iPhone: Cài đặt → Safari → Nâng cao → bật **Web Inspector**. Nối cáp với Mac.
2. Mac: Safari → Cài đặt → Nâng cao → bật menu Develop. Mở app Keyo trên iPhone bằng cách tái hiện lỗi, rồi chọn Develop → [iPhone] → Keyo Game.
3. Dán vào Console và gửi lại kết quả:

```js
(() => { const u = {}; for (const k of ['vh','svh','lvh','dvh']) { const d = document.createElement('div'); d.style.cssText = `position:fixed;top:0;width:1px;height:100${k}`; document.body.append(d); u[k] = d.getBoundingClientRect().height; d.remove(); }
  const s = document.createElement('div'); s.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.append(s); const c = getComputedStyle(s); const safe = [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft]; s.remove();
  return JSON.stringify({ build: document.querySelector('meta[name=keyo-build]')?.content, screen: [screen.width, screen.height], inner: [innerWidth, innerHeight], client: [document.documentElement.clientWidth, document.documentElement.clientHeight], vv: visualViewport && [visualViewport.width, visualViewport.height, visualViewport.offsetTop, visualViewport.scale], units: u, safe, orient: screen.orientation?.type, standalone: navigator.standalone, bar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content }); })()
```

4. Kiểm tra trực tiếp:
   - Gõ `document.documentElement.style.background = '#f0f'`: dải có đổi màu không?
   - Tab Elements: chọn `<html>`. Vùng tô sáng trên iPhone có phủ xuống dải đen không?
   - Nút chụp màn hình (Capture Screenshot) của viewport: ảnh chụp là 956×378 hay 956×440?

## Phương án theo từng kết quả

- **Paint vẫn đen và `lvh` = 378:**
  - Đây là giới hạn của iOS, mã web không sửa được.
  - Có thể chọn: gợi ý trong app (đang có: mở lại từ App Switcher, hoặc xoay dọc rồi xoay lại nếu bước 6 cho thấy hết lỗi); báo lỗi cho Apple (Feedback Assistant); bọc app native; hoặc **phương án dự phòng chặn PWA** mà Owner đang cân nhắc (cần đặc tả đầy đủ).
- **Paint thành hồng, hoặc nút "root: lvh" làm hết dải mà dock không bị cắt:**
  - Lỗi sửa được bằng mã. Root sẽ dùng `100lvh` khi WebKit báo `lvh` > `innerHeight` ở iPhone standalone ngang.
  - Mình sẽ làm bản sửa thật theo đúng số đo đó.
