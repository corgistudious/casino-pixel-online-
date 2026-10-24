# Triển khai Keyo Game trên VPS dùng chung (Contabo, Ubuntu 24.04)

> **Chưa triển khai.** Tài liệu và script này chỉ chuẩn bị sẵn. Chủ dự án duyệt và tự chạy (hoặc cho phép chạy) từng bước. Không có CI, cron hay webhook nào tự deploy.

## Nguyên tắc cô lập với các bot Discord đang chạy

| Yêu cầu | Cách đáp ứng |
|---|---|
| Không ảnh hưởng ứng dụng khác | Compose project riêng `keyo-game`: container, network, volume đều có tiền tố `keyo-game-`. Mọi script đều gọi `docker compose --project-name keyo-game`. Không dùng `docker system prune`, không đụng container khác. |
| Thư mục riêng | `/opt/keyo-game` (repo), `/opt/keyo-game/backups`, `/opt/keyo-game/logs` |
| PostgreSQL riêng | Container `postgres:16` riêng, database `keyo_game`, user `keyo`, volume `keyo-game_pgdata`. Không mở cổng ra host. |
| Redis namespace riêng | Container Redis riêng (không lưu đĩa, tối đa 64 MB), và mọi key/channel có tiền tố `REDIS_PREFIX` (mặc định `keyo:`). Nếu muốn dùng Redis có sẵn trên máy, đổi `REDIS_URL` và giữ tiền tố. |
| Giới hạn CPU/RAM | postgres 1 CPU / 768 MB · server 1,5 CPU / 640 MB · web 0,5 CPU / 128 MB · redis 0,25 CPU / 96 MB · maintenance 1 CPU / 512 MB (chỉ chạy khi gọi). Tổng tối đa ~2,2 GB RAM. |
| Không chiếm cổng hiện có | Chỉ container web được publish, và chỉ ở `127.0.0.1:${KEYO_HTTP_PORT}` (mặc định 18480). `preflight.sh` báo nếu cổng đã bị dùng. Docker publish cổng thì vượt qua UFW, nên bind loopback là bắt buộc. |
| HTTPS + WebSocket qua reverse proxy | nginx của host (mẫu `deploy/vps/nginx/keyo-game.conf`) giữ chứng chỉ Let's Encrypt và chuyển tiếp `/ws` với Upgrade. Đã kiểm tra `nginx -t` với nginx 1.24 của Ubuntu 24.04. |
| Tự khởi động sau reboot | `restart: unless-stopped` + Docker bật lúc boot (`systemctl enable docker`). |
| Backup | `keyo-game-backup.timer` chạy `backup.sh` lúc 03:17 UTC mỗi ngày: `pg_dump` dạng custom, kiểm tra bằng `pg_restore --list`, giữ `BACKUP_RETENTION_DAYS` ngày (mặc định 14), chỉ xoá file do script tạo. |
| Health check | Healthcheck trong từng container + `keyo-game-healthcheck.timer` mỗi 5 phút gọi `/api/health` qua cổng loopback. |
| Log rotation | Log container: Docker json-file 10 MB × 5 mỗi container. Log host `/opt/keyo-game/logs/*.log`: `logrotate` hằng tuần. Log nginx `keyo-game.*.log`: logrotate mặc định của Ubuntu. |
| Không tự deploy | `deploy.sh <tag-hoặc-commit>` chỉ chạy tay, bắt gõ `DEPLOY <commit>` để xác nhận. |

## Cấu trúc

```
/opt/keyo-game/                 # git checkout (chủ sở hữu: user riêng, ví dụ "keyo")
├── deploy/vps/
│   ├── docker-compose.yml
│   ├── .env                    # cấu hình thật, chmod 600, KHÔNG commit
│   ├── Caddyfile               # web container nội bộ (HTTP :8080)
│   ├── nginx/keyo-game.conf    # site mẫu cho nginx của host
│   ├── systemd/                # timer backup + health check
│   ├── logrotate/keyo-game
│   └── scripts/                # preflight, deploy, backup, healthcheck, maintenance
├── backups/                    # dump PostgreSQL + báo cáo reset (chmod 700)
└── logs/
```

## Cài đặt lần đầu (chủ dự án thực hiện)

```bash
# 0. Kiểm tra trước, không thay đổi gì
sudo adduser --system --group --home /opt/keyo-game keyo
sudo usermod -aG docker keyo
sudo -u keyo git clone https://github.com/corgistudious/casino-pixel-online-.git /opt/keyo-game
sudo -u keyo /opt/keyo-game/deploy/vps/scripts/preflight.sh

# 1. Thư mục backup/log thuộc user keyo (systemd và script bảo trì đều chạy bằng user này)
sudo -u keyo install -d -m 700 /opt/keyo-game/backups
sudo -u keyo install -d -m 755 /opt/keyo-game/logs
sudo -u keyo touch /opt/keyo-game/logs/backup.log /opt/keyo-game/logs/healthcheck.log

# 2. Cấu hình
cd /opt/keyo-game/deploy/vps
sudo -u keyo cp .env.example .env && sudo chmod 600 .env
sudo -u keyo nano .env        # APP_URL, CORS_ORIGINS, KEYO_HTTP_PORT, POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32), KEYO_DATA_MODE=test

# 3. Reverse proxy (nginx có sẵn trên host)
sudo cp nginx/keyo-game.conf /etc/nginx/sites-available/keyo-game.conf
sudo nano /etc/nginx/sites-available/keyo-game.conf   # thay play.example.com và cổng 18480
sudo certbot certonly --nginx -d play.example.com
sudo ln -s /etc/nginx/sites-available/keyo-game.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx          # reload không làm gián đoạn site khác

# 4. Deploy một phiên bản đã được duyệt
sudo -u keyo /opt/keyo-game/deploy/vps/scripts/deploy.sh <tag-hoặc-commit>

# 5. Backup, health check, logrotate
sudo cp systemd/keyo-game-*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now keyo-game-backup.timer keyo-game-healthcheck.timer
sudo cp logrotate/keyo-game /etc/logrotate.d/keyo-game
```

Nếu host dùng **Caddy** thay vì nginx, chỉ cần thêm vào Caddyfile của host:

```
play.example.com {
	reverse_proxy 127.0.0.1:18480 {
		header_up X-Forwarded-For {remote_host}
	}
}
```

## Cập nhật phiên bản

```bash
sudo -u keyo /opt/keyo-game/deploy/vps/scripts/deploy.sh v0.3.0
```

Script sẽ chạy preflight, yêu cầu xác nhận, backup DB, checkout đúng commit, build image gắn tag theo commit, khởi động lại stack (server tự chạy migration), rồi chờ health check.

**Rollback:** chạy lại `deploy.sh <tag cũ>`. Migration chỉ thêm (không xoá cột), nên code cũ vẫn chạy được trên schema mới. Nếu cần khôi phục dữ liệu, xem mục dưới.

## Khôi phục từ backup (thao tác phá huỷ — chỉ khi chủ dự án quyết định)

```bash
cd /opt/keyo-game/deploy/vps
docker compose -p keyo-game stop server web
docker compose -p keyo-game exec -T postgres pg_restore --username keyo --dbname keyo_game --clean --if-exists --no-owner < ../../backups/daily/<file>.dump
docker compose -p keyo-game up -d server web
```

## Vận hành

| Việc | Lệnh |
|---|---|
| Trạng thái | `docker compose -p keyo-game ps` |
| Log server | `docker compose -p keyo-game logs -f --tail 200 server` |
| Health | `deploy/vps/scripts/healthcheck.sh` |
| Backup ngay | `sudo -u keyo deploy/vps/scripts/backup.sh` |
| Lệnh bảo trì dữ liệu | `sudo -u keyo deploy/vps/scripts/maintenance.sh status` (xem `docs/TEST_ENVIRONMENT.md`) |
| Dừng Keyo (không ảnh hưởng app khác) | `docker compose -p keyo-game stop` |

## Đã kiểm chứng trong môi trường phát triển (chưa phải VPS thật)

Dựng toàn bộ stack bằng chính `docker-compose.yml`, các script và file nginx này trên Ubuntu 24.04 + Docker 29 + nginx 1.24:

- `docker compose config` hợp lệ; giới hạn CPU/RAM được áp dụng; chỉ có `127.0.0.1:18480` được publish. PostgreSQL và Redis sẵn có trên host (cổng 5432/6379) vẫn chạy song song, không xung đột.
- Một container giả lập bot Discord chạy suốt quá trình: được `preflight.sh` liệt kê, và **không bị khởi động lại** sau deploy, backup, reset hay launch.
- nginx (đúng file mẫu, chứng chỉ tự ký): HTTPS + HTTP/2, chuyển hướng 80→443, HSTS, route SPA; đăng nhập rồi chơi slots qua **WebSocket `wss://`** thành công.
- Header `X-Forwarded-For: 6.6.6.6` giả mạo bị bỏ qua; server ghi đúng IP thật của client.
- Redis chỉ có key `keyo:*`.
- `backup.sh`: dump được kiểm tra bằng `pg_restore --list`, quyền 600.
- `maintenance.sh`, chạy trong container maintenance:
  - tạo tài khoản TEST → dry-run → xoá (có 2 bản backup: phía host và của lệnh) → chỉ còn Keyo Support;
  - launch → server ở chế độ test **từ chối chạy** trên database production → chuyển `.env` sang production → người chơi thật đầu tiên đăng ký qua HTTPS nhận **UID 100000**, `is_test = false`;
  - reset sau khi đã launch bị từ chối.
- Khởi động lại Docker daemon (giả lập reboot): mọi container tự chạy lại.
- `shellcheck` sạch; `nginx -t` đạt (lỗi duy nhất là IPv6 không có trong container thử nghiệm).

**Phát hiện khi kiểm thử và đã sửa:**
- nginx 1.24 của Ubuntu 24.04 không hiểu `http2 on;`, đã đổi sang `listen 443 ssl http2`.
- `proxy_set_header` không được kế thừa vào location, đã khai báo đủ trong từng location.
- logrotate trùng với cấu hình nginx mặc định, đã bỏ phần trùng.
- Image maintenance dựa trên `postgres:16-alpine`, để `pg_dump` khớp đúng phiên bản server mà không phụ thuộc gói Alpine.

**Chưa kiểm chứng:**
- Chạy trên VPS Contabo thật.
- Chứng chỉ Let's Encrypt thật.
- Hành vi khi RAM của VPS bị các bot dùng nhiều.

Trước lần đầu, chạy `preflight.sh` trên VPS.
