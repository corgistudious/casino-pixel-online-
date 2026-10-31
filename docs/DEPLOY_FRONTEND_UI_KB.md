# Deploy chỉ frontend — bản sửa bàn phím iOS / viewport / OrientationGuard

> **Chưa triển khai.** Owner duyệt và tự chạy từng bước. Không dùng `deploy.sh` cho lần này, vì script đó build và khởi động lại cả `server` và `maintenance`.

- Nhánh: `feat/mobile-ui-keyboard`, commit `6cfd911` (tách từ Corgi-Casino `3dee1fb`).
- Tag image đề xuất: `keyo-game/web:ui-kb-20261031-6cfd911`.
- Chỉ thay container `web` (Caddy phục vụ file tĩnh và chuyển tiếp `/api`, `/ws`). Không động tới `server`, `postgres`, `redis`, `maintenance`, volume hay dữ liệu.

## 0. Điều kiện bắt buộc: backend phải đủ mới

Frontend này đã gồm mọi thứ đã merge trong PR #24–#28 (Keyo Captain, UID đặc biệt, bảng xếp hạng/khung, mỹ phẩm theo mùa). Nó gọi các API như `/api/collections` và `/api/leaderboards`.

Nếu backend đang chạy **cũ hơn** Corgi-Casino `3dee1fb`, các màn đó sẽ lỗi. **Dừng lại** nếu kiểm tra dưới đây không đạt. Kiểm tra (chỉ đọc):

```bash
cd /opt/keyo-game/deploy/vps
source scripts/common.sh
# Image backend đang chạy (deploy.sh gắn tag = 12 ký tự commit)
SERVER_IMG=$(docker inspect "$(compose ps -q server)" --format '{{.Config.Image}}'); echo "$SERVER_IMG"
SERVER_COMMIT=${SERVER_IMG##*:}
git -C /opt/keyo-game fetch origin Corgi-Casino
git -C /opt/keyo-game merge-base --is-ancestor 3dee1fb "$SERVER_COMMIT" && echo "BACKEND OK (>= 3dee1fb)" || echo "BACKEND CŨ — DỪNG"
# Số migration đã chạy: phải >= 36 (0000 … 0035)
compose exec -T postgres psql -U keyo -d "$(env_value POSTGRES_DB || echo keyo_game)" -Atc 'select count(*) from drizzle.__drizzle_migrations'
```

Nếu backend cũ:

- **Cách A:** deploy đầy đủ bằng `deploy.sh` (có backup, migration 0032–0035, khởi động lại server). Việc này cần Owner duyệt riêng.
- **Cách B:** build frontend từ đúng commit của backend, cộng thêm các commit UI của nhánh này (cherry-pick). Tôi có thể chuẩn bị nhánh đó nếu cần.

## 1. Build image mới trên VPS (không đổi checkout đang chạy)

```bash
cd /opt/keyo-game
git fetch origin feat/mobile-ui-keyboard
git worktree add /opt/keyo-game-build-ui-kb 6cfd911
cd /opt/keyo-game-build-ui-kb
docker build --target web-vps \
  --label org.opencontainers.image.revision="$(git rev-parse HEAD)" \
  -t keyo-game/web:ui-kb-20261031-6cfd911 .
docker image inspect keyo-game/web:ui-kb-20261031-6cfd911 --format '{{.Id}} {{.Size}}'
# Đối chiếu với bản đã kiểm thử: bundle chính phải là index-De-WC5t6.js, Caddy 2.10.x, config hợp lệ
docker run --rm keyo-game/web:ui-kb-20261031-6cfd911 sh -c 'ls /srv/assets | grep "^index-.*\.js$"; caddy version; caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile 2>&1 | tail -1'
```

Build đã được chạy thử trong môi trường kiểm thử (Dockerfile y hệt; chỉ thêm CA của proxy sandbox qua BuildKit secret, không nằm trong image):

- Image `b9094356ee2d`, 101 MB, Caddy v2.10.2, `caddy validate` → **Valid configuration**, bundle `index-De-WC5t6.js`.
- Chạy container: `/healthz`, `/`, manifest, ảnh và bundle trả đúng header; `/api` và `/ws` qua proxy hoạt động.
- Smoke test bằng trình duyệt (iPhone và PC): đăng nhập, sảnh, phòng Tài Xỉu, Chat **8/8 PASS**.

Tag là tag mới, không trùng tag nào đang có, nên không ghi đè image cũ.

## 2. Ghi lại image web hiện tại để rollback

```bash
cd /opt/keyo-game/deploy/vps && source scripts/common.sh
OLD_WEB=$(docker inspect "$(compose ps -q web)" --format '{{.Config.Image}}'); echo "$OLD_WEB" | tee /opt/keyo-game/logs/web-before-ui-kb.txt
docker tag "$OLD_WEB" keyo-game/web:rollback-before-ui-kb     # thêm một tên mới, không xoá/ghi đè gì
docker inspect "$(compose ps -q server)" --format '{{.State.StartedAt}}' | tee /opt/keyo-game/logs/server-started-before-ui-kb.txt
```

## 3. Thay riêng container web

```bash
cd /opt/keyo-game/deploy/vps && source scripts/common.sh
KEYO_IMAGE_TAG=ui-kb-20261031-6cfd911 compose up -d --no-deps --no-build web
```

- `--no-deps`: không đụng `server`/`postgres`/`redis`.
- `--no-build`: dùng đúng image vừa build.
- Thời gian gián đoạn chỉ là vài giây Caddy khởi động lại. WebSocket đang mở sẽ tự kết nối lại; trạng thái phòng nằm ở server nên không mất.

## 4. Kiểm tra sau khi thay

```bash
cd /opt/keyo-game/deploy/vps && source scripts/common.sh
scripts/healthcheck.sh                                   # /api/health ok + bảng trạng thái
PORT=$(env_value KEYO_HTTP_PORT); PORT=${PORT:-18480}
curl -sI http://127.0.0.1:$PORT/ | grep -iE '^HTTP|cache-control'                      # 200, no-cache
curl -sI http://127.0.0.1:$PORT/manifest.webmanifest | grep -i cache-control            # no-cache
JS=$(curl -s http://127.0.0.1:$PORT/ | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -sI http://127.0.0.1:$PORT/$JS | grep -iE '^HTTP|cache-control'                   # 200, immutable
curl -sI http://127.0.0.1:$PORT/assets/official/keyo-game-logo.png | grep -i cache-control   # max-age=86400
# Backend KHÔNG bị khởi động lại: StartedAt phải trùng với file đã lưu ở bước 2
docker inspect "$(compose ps -q server)" --format '{{.State.StartedAt}}'; cat /opt/keyo-game/logs/server-started-before-ui-kb.txt
```

Sau đó kiểm tra tay trên trình duyệt:

- **iPhone dọc:** đăng nhập.
- **iPhone ngang:** sảnh, Chat (mở bàn phím, gửi tin), phòng Tài Xỉu/Poker, modal Tạo phòng.
- **iPad:** nhắc xoay.
- **PC:** không có nhắc xoay.

## 5. Rollback (vài giây, không đụng backend)

```bash
cd /opt/keyo-game/deploy/vps && source scripts/common.sh
KEYO_IMAGE_TAG=rollback-before-ui-kb compose up -d --no-deps --no-build web
scripts/healthcheck.sh
```

(Hoặc dùng đúng tag cũ ghi trong `logs/web-before-ui-kb.txt`.) Không có dữ liệu nào thay đổi nên rollback không cần khôi phục gì.

## 6. Lưu ý sau deploy

- `web` sẽ chạy tag khác `server`. Lần chạy `deploy.sh` đầy đủ tiếp theo sẽ build lại cả hai từ một commit. Commit đó nên chứa nhánh này (merge vào Corgi-Casino trước), nếu không web sẽ quay về giao diện cũ.
- Nếu ai đó chạy `compose up -d` với `KEYO_IMAGE_TAG` cũ, web cũng quay về bản cũ.
- Dọn worktree sau khi xong: `git -C /opt/keyo-game worktree remove /opt/keyo-game-build-ui-kb`.
- Không bao giờ dùng `docker compose down -v`, `volume prune` hay `image prune -a` trên VPS dùng chung.
