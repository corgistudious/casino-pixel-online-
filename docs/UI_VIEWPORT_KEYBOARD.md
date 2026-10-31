# Bàn phím ảo, viewport, safe area và hiệu năng (frontend)

Chỉ đổi `apps/web`, `packages/shared/src/i18n` và cấu hình phục vụ file tĩnh của web container (`deploy/*/Caddyfile`). Không đổi backend, API, database, ví, gameplay hay WebSocket.

## 1. Nguyên nhân gốc

- **`installViewportSync()` không có trong source** (không có trong repo lẫn lịch sử git). Nếu đã từng có thì nó chỉ được vá trực tiếp trên VPS. Bản sửa này viết lại từ đầu, chỉ dùng **một** cơ chế.
- **Bàn phím iPhone làm mất phần dưới và giật khi vuốt:**
  - `html`/`body`/`#root` cao `100%` và document có thể bị cuộn.
  - iOS không thu nhỏ layout viewport khi bàn phím mở, mà **cuộn (pan) cả trang** để lộ ô nhập. Phần dưới app bị đẩy ra khỏi màn hình.
  - Khi vuốt, cử chỉ bị chia giữa việc pan trang và các vùng cuộn bên trong, gây giật.
  - Khi đóng bàn phím, iOS có lúc giữ lại `scrollY > 0`, nên layout không phục hồi.
- **iOS tự zoom khi focus ô nhập:** nhiều ô nhập dùng chữ 14px (`text-sm`). iOS zoom vào mọi ô < 16px, và với `user-scalable=no` có lúc không zoom ra lại.
- **Modal bị cắt:** dùng `max-h-[90vh]`/`92dvh`. `vh`/`dvh` không trừ phần bàn phím nên nút Xác nhận nằm dưới bàn phím.
- **Chat lúc bàn phím mở trên iPhone ngang** (chỉ còn khoảng 190px nhìn thấy): thanh người chơi, tiêu đề và tab chiếm hết chỗ, danh sách tin và ô nhập bị ép về 0.
- **Textarea nằm trong vùng `user-select: none`:** lỗi caret đã biết trên iOS.
- **Dải đen khi mở PWA ngang:**
  - Không có `apple-mobile-web-app-status-bar-style`, nên iOS giữ một vùng thanh trạng thái tô đen. Vùng này chỉ được tính lại sau khi xoay.
  - App chưa áp dụng safe area: thanh điều hướng trái nằm dưới notch/Dynamic Island khi cầm ngang.
- **Manifest khóa `"orientation": "landscape"`:** PWA Android không xoay dọc được, nên không vào được màn đăng nhập dọc.
- **Phaser (≈330 KB gzip) tải ngay khi mở app**, kể cả ở màn đăng nhập. Nguyên nhân là `manualChunks` dạng object kéo helper CommonJS dùng chung vào chunk Phaser.
- **Cache:** `/assets/*` (gồm cả ảnh công khai có tên cố định) được cache `immutable` 1 năm. `index.html` không có `no-cache`, nên người chơi (đặc biệt PWA) có thể kẹt ở bản cũ.

## 2. Giải pháp

- **`src/lib/viewport.ts` (cơ chế duy nhất)**:
  - `#root` là `position: fixed; inset: 0`; trình duyệt tự tính chiều cao.
  - Chỉ khi **đang focus ô nhập** và vùng nhìn thấy ngắn hơn layout viewport > 120px (tức là bàn phím đang mở), mới đặt `--vvh` = chiều cao nhìn thấy, thêm class `keyboard-open` và `--kb`.
  - Huỷ pan của trình duyệt (`scrollTo(0,0)`). Nếu ô nhập vẫn bị che thì `scrollIntoView({block:'nearest'})` **đúng một lần**.
  - Cập nhật gộp theo `requestAnimationFrame`, chỉ ghi khi giá trị đổi. Không vòng lặp, không timeout.
  - Có cleanup đầy đủ (kể cả HMR).
  - Android: `interactive-widget=resizes-content` để hệ thống tự thu nhỏ layout, nên controller không làm gì.
- **Safe area** áp **một lần** ở `#root`. Bỏ các chỗ cộng thêm bên trong (auth, Support). Overlay `fixed` tự thêm safe area riêng. Khi bàn phím mở thì bỏ inset dưới (bàn phím che thanh home).
- `apple-mobile-web-app-status-bar-style=black-translucent`, `mobile-web-app-capable`. Manifest `orientation: any`.
- Ô nhập trên màn cảm ứng luôn 16px (hết tự zoom). `user-select: text` cho textarea. `overscroll-behavior: contain` cho mọi vùng cuộn (không kéo cả app).
- **Overlay/Modal:**
  - Class `.overlay` cao bằng **vùng nhìn thấy**.
  - `Modal` dùng chung: tiêu đề cố định, chỉ thân modal cuộn, nút đóng 40px, Escape, giữ focus trong modal và trả focus về chỗ cũ (`ui/dialog.ts`). Không autofocus nên bàn phím không tự bật.
  - Áp dụng cho các bottom sheet và modal riêng (Chợ, Support, Reauth, điểm danh, chào mừng, chat trong phòng).
- **Chat:**
  - Chỉ tự cuộn khi người đọc đang ở cuối danh sách; có nút "↓ Tin nhắn mới".
  - Tải tin cũ giữ nguyên vị trí đang đọc.
  - Ô nhập tự cao theo nội dung.
  - Bản nháp giữ theo từng cuộc trò chuyện.
  - Chặn gửi trùng bằng ref.
  - Nút Gửi không làm mất focus (bàn phím không đóng giữa lúc chạm).
  - Khi bàn phím mở: ẩn thanh người chơi, tiêu đề và dòng quy tắc; tab thu gọn.
- **Hồ sơ:** khu vực đổi tên chuyển sang i18n VI/EN (trước đây chữ trộn cứng "VI / EN"), bố cục gọn, checkbox dễ chạm.
- **Hiệu năng:**
  - Phòng chơi (Phaser) và trang Admin tải theo nhu cầu (`React.lazy`).
  - Phaser được tải trước khi app rảnh, sau khi đã đăng nhập.
  - Bundle chính 1254 → 1029 KB; màn đăng nhập không còn tải Phaser.
  - Blur nhẹ hơn trên màn cảm ứng.
  - Viền focus rõ cho bàn phím trên PC.
- **Cache (Caddyfile):** file có hash cache 1 năm; ảnh công khai theo tên cache 1 ngày; `index.html` và manifest `no-cache` để người chơi nhận bản mới.
- **OrientationGuard:** đọc hướng màn hình vật lý (`screen.orientation`), nên bàn phím mở không bị hiểu là xoay (xem `docs/ORIENTATION_GUARD.md`).

## 3. Kiểm thử đã chạy

**Lần kiểm tra trước deploy (commit `6cfd911`)**

- Đã sửa thêm sau khi review:
  - **Tải lại một lần** khi chunk của bản build cũ không còn (sau deploy), có màn "Tải lại" nếu vẫn lỗi và không lặp vô hạn.
  - Nút Gửi hoạt động khi chạm thật (trước đó `pointerdown` bị chặn làm mất click).
  - Không reset pan khi bàn phím iOS đang trượt lên.
  - Escape luôn gọi `onClose` mới nhất.
  - Không báo "tin nhắn mới" sai khi một tin bị xoá.
- Typecheck và build production qua. Server vitest **326/326** (có PostgreSQL và Redis). Web 16/16. Shared 97/97.
- E2E:
  - bàn phím **29/29** (thêm: chạm thật vào Gửi, chunk cũ sau deploy);
  - OrientationGuard **105/105**;
  - responsive **320/320**;
  - mỹ phẩm/multiplayer hai tài khoản **37/37**;
  - không có lỗi console.
- Caddyfile, kiểm tra bằng `caddy` 2.6.2 thật:
  - `deploy/Caddyfile`: **Valid configuration**.
  - `deploy/vps/Caddyfile`: 2.6.2 không biết global option `trusted_proxies` (có từ Caddy 2.7, image dùng 2.10). Bản cũ trên Corgi-Casino báo **đúng lỗi đó**, nên đây không phải thay đổi mới. Bỏ dòng đó ra thì config mới **Valid**.
  - Chạy thật Caddy với config mới phục vụ `dist`:
    - `/`, `/index.html`, `/manifest.webmanifest` → `no-cache`;
    - bundle có hash → `immutable` 1 năm;
    - `/assets/official/*` → 1 ngày;
    - `/api/health` qua reverse proxy → 200;
    - gzip bật.

**Lần đầu**

- Typecheck và production build qua. Web vitest 16/16; shared 97/97.
- E2E bàn phím (giả lập iOS: chỉ `visualViewport` co lại, layout giữ nguyên):
  - **iPhone ngang:** Chat máy chủ, ô đổi tên, modal có mật khẩu (Tạo phòng), chat trong phòng Tài Xỉu.
  - **iPhone dọc:** màn đăng nhập.
  - **PC 1366.**
  - **25/25 PASS:** ô nhập, nút Gửi và nút Xác nhận nằm trên bàn phím; app co đúng chiều cao nhìn thấy; trang không bị pan; đóng bàn phím thì layout phục hồi; bản nháp còn; chạm đúp Gửi chỉ gửi 1 tin; Escape đóng modal; phòng chơi không reload; bàn phím không bị hiểu là xoay; PC có viền focus.
- Responsive:
  - Thiết bị: iPhone SE/Pro Max ngang, Android dài, iPad 4:3, tablet 16:10, máy gập, desktop 1366 và 1920.
  - Trang: sảnh, chat, ngân hàng, hồ sơ, bạn bè, bang hội, nhiệm vụ, Tài Xỉu, Poker, Blackjack.
  - **320/320 PASS:** đầy màn hình, không tràn ngang, trang không tự cuộn, không có nhắc xoay sai.
- Hồi quy: OrientationGuard 105/105, E2E mỹ phẩm/multiplayer hai tài khoản 37/37.

## 4. Chưa xác minh được

- **Chưa thử trên iPhone/iPad/Android thật.** Mọi kết quả trên là giả lập Chromium; bàn phím iOS thật, thanh gợi ý, bàn phím tiếng Việt bên thứ ba và emoji chưa được kiểm trên máy.
- `env(safe-area-inset-*)` luôn bằng 0 trong Chromium. Notch/Dynamic Island và dải đen PWA chỉ kiểm được trên máy thật.
- Repo chưa có service worker. Bản mới đến người chơi qua HTTP cache (`index.html` `no-cache`).

## 5. Deploy và rollback (chưa deploy)

- **Chỉ web image.** Backend và database không đổi, không có migration.
  1. Trên VPS: `cd /opt/keyo-game`, ghi lại tag image web đang chạy (để rollback).
  2. Build image web với tag mới (`KEYO_IMAGE_TAG=<tag-mới>`), không ghi đè tag cũ.
  3. Chỉ recreate service `web` (`docker compose up -d --no-deps web`).
  4. Kiểm tra: `/healthz`, trang chủ 200, header `Cache-Control` của `/` là `no-cache`, asset có hash là `immutable`, đăng nhập/sảnh/phòng chơi tải được.
  - Không restart `server`/database. Không `down -v`.
- **Rollback:** đặt lại `KEYO_IMAGE_TAG` cũ, rồi `docker compose up -d --no-deps web`.
- **Lưu ý cho PWA đã cài trên Android:** manifest đổi `orientation` sang `any`, nên có thể phải mở lại app (hoặc cài lại) để áp dụng.
