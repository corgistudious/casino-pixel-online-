# V7.1 — ma trận kiểm thử đa nền tảng

**Tự động** = Playwright Chromium giả lập (UA, kích thước, cảm ứng, DPR, cờ standalone của iOS), chạy trên bản build demo. **Thiết bị thật** = chưa có trong môi trường phát triển; mục "Chưa xác minh" liệt kê những việc phải thử tay.

## Chạy bộ test trình duyệt (nằm trong repo: `apps/web/e2e/`)
```bash
cd apps/web
VITE_DEMO=1 npx vite build --outDir dist-demo
npx vite preview --outDir dist-demo --port 5180 &
pnpm e2e                      # tất cả; hoặc: node e2e/run.mjs pwa orientation
```
Playwright được lấy từ môi trường (không phải dependency của app). `E2E_URL` đổi địa chỉ, `CHROMIUM_PATH` chọn trình duyệt, `E2E_VERBOSE=1` in cả các mục đạt.

| Suite | Phạm vi | Kiểm tra |
|---|---|---|
| `pwa` | iPhone PWA giả lập (màn 440×956) | Mở bình thường: không lấp lvh, không gợi ý, không ghi style/class trong 2,5 giây (không vòng lặp resize). `window-short` (956×378): `#root` không vượt cửa sổ, meta viewport trở về như cũ sau tối đa 2 lần đọc lại, có gợi ý mở lại; khi iOS trả đủ cửa sổ thì root, stage và canvas tự lớn lại, không reload. `layout-short`: `#root` lấp `100lvh`, không gợi ý. Resume (visibility + `pageshow persisted`): cùng scene (canvas), không reload, bản ghi resume có giới hạn, có `layer`, không chứa token. Bàn phím: app vừa phía trên bàn phím, đóng là hoàn tác. Listener: vào/ra 3 phòng game × 3 vòng không tăng số listener |
| `orientation` | iPhone, iPad, tablet Android, PC | Điện thoại có cược trên bàn xoay dọc↔ngang 3 lần: thông báo xoay phủ lên scene đang chạy; quay lại ngang vẫn cùng canvas, cùng cược, cùng kích thước. Tablet giữa ván poker: dọc hiện thông báo dành cho tablet, scene không remount và giữ thiết kế ngang; quay lại ngang bàn khớp lại khung (cùng khung → cùng kích thước), đồng hồ lượt không reset. Sảnh trên tablet dọc: không thông báo. Cửa sổ PC cao: không thông báo, bàn dọc |
| `controls` | 6 kích thước | Màn ngang thấp: hàng cược hiện − · slider · + · ⚡; một chạm ⚡ ra ½ · Pot · 2× · Tất tay (≥ 44px, trong màn hình, không đè lên bàn); Pot đặt mức cược; chạm lại về slider. Màn rộng: ½ · Pot · 2× hiện sẵn. Mọi nút ≥ 44px (cảm ứng) / ≥ 32px (chuột). Sic Bo lắc với chụp pha lê 2.5D tới khi có kết quả |
| `layout` | 16 kích thước × 13 màn hình (thay `v71fit`, `orient`, `land`, `resp` cũ) | Thông báo xoay ở đúng chỗ (điện thoại dọc: mọi trang; tablet dọc: chỉ phòng game); không tràn ngang; bàn không méo; bàn ngang trên điện thoại/tablet/PC ngang; bàn nằm trong khung; thanh điều khiển dưới bàn và trong màn hình; HUD không che bàn; mọi nút ≥ 44/32px; panel mở/đóng |
| `pages` | 21 trang × 8 kích thước (thay `pages-sweep`) | Không tràn ngang; cả trang không cuộn (trang dài cuộn bên trong); không nút nào bị cắt mép |
| Unit (Vitest, `apps/web/test`) | `viewport.test.ts` (bàn phím, `classifyBand`, `startupInset`, quyết định lấp lvh, chẩn đoán lớp, nudge, `installViewport` trên iPhone giả: lấp/bỏ lấp, tối đa 2 nudge mỗi lần mở/resume, không làm gì trong tab Safari, gỡ hết listener); `orientation.test.ts` (ai phải xoay, route game, bàn dọc chỉ cho PC); thiết bị, cược, bàn, i18n | — |

Các bộ cũ viết cho thiết kế điện thoại dọc (`orient`, `land`, `ios`, `kb`, `kbstage`, `launch`, `resp`, `v71fit`, `pages-sweep`; chỉ có trong máy phát triển, không nằm trong repo) đã được gộp và viết lại theo kiến trúc ngang ở các suite trên. Không xóa kiểm tra nào chỉ để qua build. Phần bàn phím của `kb`/`kbstage` (chat, modal) vẫn được giữ trong `pwa` (E) và unit test.

## Chưa xác minh (cần thiết bị thật)
| Nền tảng | Việc cần thử |
|---|---|
| iPhone PWA (tai thỏ, Dynamic Island, màn nhỏ) | Test A/B/C dải đen (`docs/IOS_PWA_BLACK_BAND_V71.md`); xem dòng `layer` và `fill` trong chẩn đoán; mở nguội, mở lại, khóa/mở khóa, bàn phím chat |
| iOS Safari, Chrome iOS | Thanh địa chỉ ẩn/hiện, xoay màn hình |
| Android Chrome, Firefox, Samsung Internet, Android PWA | Thanh điều hướng hệ thống, bàn phím, PWA standalone |
| iPad, máy tính bảng Android | Xoay giữa ván trên máy thật (giả lập đã đạt) |
| Desktop Edge, Firefox, Safari | Hover/focus, toàn màn hình |
| Hiệu năng | FPS thật. Chromium headless vẽ bằng phần mềm chỉ đạt khoảng 5 FPS ở màn chơi; V7.0 cũng vậy hoặc chậm hơn. Asset 2.5D vẽ một lần lúc vào phòng nên không tốn chi phí mỗi khung hình |
