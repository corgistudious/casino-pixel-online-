# V6.4: giao diện bị thu nhỏ khi mở bàn phím iPhone (chế độ ngang)

## Nguyên nhân gốc (theo code trong repo)

1. `lib/viewport.ts` là bộ điều khiển bàn phím duy nhất. Khi có ô nhập đang focus **và** `visualViewport.height` thấp hơn layout viewport hơn 120px (iOS không thu nhỏ layout viewport khi bàn phím mở), nó:
   - gắn class `keyboard-open`;
   - đặt `--vvh` = chiều cao vùng nhìn thấy.
2. `#root { height: var(--vvh, 100%) }`: **toàn bộ app** co lại thành vùng phía trên bàn phím. Việc này đúng cho các bề mặt DOM: Chat, form, dialog cần ô nhập nằm trên bàn phím.
3. Nhưng các thành phần vẽ theo tỷ lệ lại tự đo kích thước khung chứa:
   - `hub/Stage.tsx` (sảnh): dùng `ResizeObserver` → `scale = min(h/720, w/1320)`, và đổi luôn chế độ `compact` (h < 600). Khi `h` giảm từ 440 xuống 230, **toàn bộ sảnh thu nhỏ còn một nửa**.
   - `game/PhaserView.tsx` (mọi bàn chơi): `Phaser.Scale.FIT` theo phần tử cha → bàn chơi co lại.
4. Vì vậy, chỉ cần mở một ô nhập phía trên sảnh hoặc bàn chơi (chat trong bàn, dialog tạo phòng, cửa hàng quà…) là game phía sau co lại. Đóng bàn phím thì game bật lại kích thước cũ, gây giật.
5. E2E tái hiện được trên build trước bản sửa. Hai bài kiểm tra triệu chứng **thất bại**:
   - "Stage scale identical": scale 0,611 đổi theo bàn phím;
   - "Phaser table identical".

Không phải lỗi do thẻ viewport. Đổi `interactive-widget` hay `viewport-fit` không tác động tới cơ chế này.

## Bản sửa: một cơ chế, hai quy tắc

- **Bề mặt DOM** (trang trong `AppShell`, form đăng nhập/đăng ký, dialog `.overlay`, Chat): giữ nguyên, vẫn vừa vùng phía trên bàn phím để ô nhập không bị che.
- **Bộ vẽ theo tỷ lệ** (Stage, Phaser): dùng `useStableSize()` trong `lib/viewport.ts`, viết một lần và dùng chung, không phải cơ chế viewport thứ hai.
  - Khi `keyboard-open` đang bật, hàm thuần `stableBox(prev, next, keyboardOpen)` **bỏ qua thay đổi chỉ làm giảm chiều cao**: giữ nguyên kích thước và tỷ lệ, phần đáy bị che sau bàn phím.
  - **Mọi thay đổi chiều rộng** (xoay màn hình thật, đổi kích thước cửa sổ) được áp dụng ngay.
  - Đóng bàn phím thì kích thước thật bằng kích thước cũ, nên không re-render, không giật.
  - Class `keyboard-open` và `--vvh` được đặt trong cùng một frame, nên `ResizeObserver` luôn đọc đúng trạng thái.
  - Không ghi lại kích thước nếu giá trị không đổi, nên không có vòng lặp resize.
- `PhaserView`: khung ngoài được đo; khung trong mang kích thước ổn định và là parent của Phaser, nên Phaser không fit lại khi bàn phím mở.
- **Android** (`interactive-widget=resizes-content`): chính trình duyệt thu nhỏ cửa sổ, controller không bật `keyboard-open`, nên hành vi **giữ như cũ**.
- **PC**: không có bàn phím ảo, không thay đổi gì.

### File thay đổi
| File | Lý do |
|---|---|
| `apps/web/src/lib/viewport.ts` | thêm `stableBox`, `keyboardOpenNow`, `useStableSize`; cập nhật tài liệu cơ chế |
| `apps/web/src/hub/Stage.tsx` | đo bằng `useStableSize` thay cho `ResizeObserver` riêng |
| `apps/web/src/game/PhaserView.tsx` | parent của Phaser giữ kích thước ổn định |
| `apps/web/test/orientation.test.ts` | unit test cho `stableBox` |
| `Dockerfile` | build arg `VITE_PWA_BLOCK` (tùy chọn) |

## Kiểm thử tự động (Chromium giả lập bàn phím iOS; không thay được iPhone thật)

`kbstage.mjs`: 15/15 trên bản sửa, 13/15 trên bản cũ (hai bài kiểm tra triệu chứng thất bại).
- **Sảnh:** có ô nhập trong dialog, mở/đóng bàn phím 5 lần, Stage giữ nguyên scale và kích thước; ô nhập nằm trên bàn phím; trạng thái được dọn sạch khi đóng.
- **Xoay ngang → dọc → ngang:** Stage tính lại theo hướng mới rồi trở về đúng layout. Đổi chiều rộng khi bàn phím đang mở vẫn được áp dụng.
- **Bàn chơi (Phaser):** chat trong bàn, mở/đóng 3 lần, bàn chơi giữ kích thước; ô nhập nằm trên bàn phím; nội dung đang gõ được giữ.
- **Trang Chat:** ô nhập và nút Gửi nằm trên bàn phím; khôi phục đúng sau khi đóng.
- **Đăng nhập, đăng ký (dọc):** mọi ô nhập nằm trên bàn phím.
- **PC và Android:** không thay đổi.

Các bộ kiểm thử cũ (bàn phím, viewport bị dời, khởi động, PWA, chặn PWA, landscape, xoay): xem báo cáo kèm commit.

**Chưa xác minh trên iPhone thật:** Safari, Chrome iOS, PWA. Chromium không có bàn phím iOS thật; bàn phím được giả lập bằng `visualViewport`.

## Triển khai Production V6.4

> Owner tự chạy hoặc phê duyệt từng bước. Không đụng database, Redis, tài khoản hay backend. Không xóa image V6.3.

### 0. Bắt buộc kiểm tra trước: V6.3 có thay đổi chưa commit?

V6.3 đang chạy (`keyo-game-web-v63-test`) nhưng các tên `installViewportSync` và `--app-height` **không có** trong repo GitHub. Vậy V6.3 được build từ thay đổi cục bộ trong `/opt/keyo-game`.

V6.4 build từ repo và **thay thế** cơ chế đó: không giữ hai cơ chế viewport song song. Nếu V6.3 còn thay đổi khác ngoài viewport, chúng sẽ mất.

```bash
git -C /opt/keyo-game status --short
git -C /opt/keyo-game diff --stat
git -C /opt/keyo-game log --oneline -3
docker inspect keyo-game-web-v63-test --format '{{.Config.Image}} | {{json .Mounts}} | {{json .HostConfig.PortBindings}} | {{json .NetworkSettings.Networks}}' | tee /root/v63-web-inspect.txt
```

**Dừng lại** và gửi kết quả nếu `diff --stat` có file ngoài phần viewport/bàn phím. Không ghi đè thay đổi chưa commit.

### 1. Build image V6.4 riêng, không đổi checkout đang chạy

```bash
SHA=<commit V6.4>
git -C /opt/keyo-game fetch origin fix/ios-pwa-landscape-startup
git -C /opt/keyo-game worktree add /opt/keyo-game-build-v64 "$SHA"
cd /opt/keyo-game-build-v64
docker build --target web-vps --build-arg KEYO_COMMIT="$SHA" \
  --build-arg VITE_PWA_BLOCK=off \
  -t keyo-game/web:v64-${SHA:0:12} .
```

`VITE_PWA_BLOCK`:
- `off`: Production chưa chặn PWA.
- Bỏ dòng này (mặc định `all`): chặn PWA trên iOS/Android, như đã kiểm thử trên Test. Chỉ dùng khi Owner đã duyệt màn hình chặn.

### 2. Chạy ứng viên V6.4 song song, không đụng V6.3

Nếu `/root/v63-web-inspect.txt` cho thấy V6.3 mount Caddyfile riêng, thêm đúng mount đó vào lệnh dưới.

```bash
docker run -d --name keyo-game-web-v64 --network keyo-game_default \
  -p 127.0.0.1:18490:8080 --restart unless-stopped keyo-game/web:v64-${SHA:0:12}
```

### 3. Kiểm tra kỹ thuật trên cổng 18490, trước khi chuyển

```bash
curl -fsS http://127.0.0.1:18490/healthz                                  # ok
curl -fsS http://127.0.0.1:18490/ | grep -o '<meta name="keyo-build"[^>]*>' # đúng SHA
curl -fsS http://127.0.0.1:18490/api/health                               # API qua web → server
curl -s -o /dev/null -w '%{http_code}\n' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  http://127.0.0.1:18490/ws                                               # 101 (WebSocket bắt tay được)
docker inspect keyo-game-server-1 --format '{{.State.StartedAt}}'          # backend không bị khởi động lại
```

Bất kỳ bước nào không đạt thì **không chuyển**: `docker rm -f keyo-game-web-v64`. V6.3 vẫn chạy bình thường.

### 4. Chuyển Nginx sang V6.4 (reload, không restart)

```bash
CONF=$(grep -rl '127.0.0.1:18489' /etc/nginx/ | head -1); echo "$CONF"
cp -a "$CONF" "$CONF.bak-v63-$(date +%Y%m%d-%H%M%S)"
sed -i 's/127\.0\.0\.1:18489/127.0.0.1:18490/g' "$CONF"
nginx -t && systemctl reload nginx
curl -fsS https://play.keyogame.com/ | grep -o '<meta name="keyo-build"[^>]*>'
curl -fsS https://play.keyogame.com/api/health
```

### 5. Rollback về V6.3 (vài giây)

Container V6.3 vẫn chạy trên 18489 trong suốt quá trình.

```bash
cp -a "$CONF.bak-v63-<thời điểm>" "$CONF" && nginx -t && systemctl reload nginx
```

Khi V6.4 đã ổn định, chỉ dọn container ứng viên nếu muốn (`docker rm -f keyo-game-web-v64`). Không xóa image V6.3. Dọn worktree: `git -C /opt/keyo-game worktree remove /opt/keyo-game-build-v64`.

## Kiểm tra trên iPhone thật sau khi chuyển

Thử ở cả ba môi trường: Safari, Chrome iOS, và PWA nếu không bị chặn.

1. Sảnh ở chế độ ngang:
   - mở một dialog có ô nhập (tạo phòng, tìm bạn…) → gõ: sảnh phía sau **không** thu nhỏ;
   - đóng bàn phím: không giật.
2. Vào bàn chơi:
   - mở Chat trong bàn → gõ, gửi: bàn chơi không thu nhỏ, ô nhập nằm trên bàn phím;
   - mở/đóng bàn phím liên tục.
3. Trang Chat: ô nhập và nút Gửi nằm trên bàn phím.
4. Đăng nhập, đăng ký (dọc): các ô nhập không bị che.
5. Xoay ngang → dọc → ngang: bố cục đúng theo hướng mới.
6. Android và PC: như trước.
