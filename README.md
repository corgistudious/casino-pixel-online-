# Keyo Game

Casino giải trí **2D HD cao cấp** (Premium Modern Casino) chạy trên **Web Desktop, Web Mobile (landscape), Android APK và Windows EXE** — cùng một backend, cùng tài khoản.

> ⚠️ Chỉ dùng tiền ảo **Cxu Bạc** (cược) và **Cxu Vàng** (hiếm, dùng ở cửa hàng): không nạp/rút tiền thật, không quy đổi, không có phần thưởng giá trị thật.

Phần thưởng: quà tân thủ, điểm danh 7 ngày, cửa hàng khung avatar, huy hiệu Verified/Partner (xem `docs/PROGRESS.md`).

## Trò chơi hiện có (gameplay thật, server-authoritative)

| Game | Luật | RTP |
| --- | --- | --- |
| Royal Slots | 5 cuộn × 3 hàng, 10 paylines, Wild thay thế | 95.97% (tính chính xác) |
| Roulette | Châu Âu một số 0, 9 loại cược | 97.30% |
| Sic Bo (Tài Xỉu) | Tài/Xỉu, Chẵn/Lẻ, tổng 4–17, số đơn, bộ ba | 83–97% tuỳ cửa (bảng Macau) |
| Blackjack | 6 bộ bài, nhà cái dừng ở 17, BJ trả 3:2, gấp đôi 2 lá đầu | ~99% với chiến thuật cơ bản |

Mọi kết quả được tính trên server bằng **HMAC-SHA256 provably fair** (server seed hash công bố trước, client seed tuỳ chỉnh, nonce), người chơi có thể đổi seed để kiểm chứng.

## Cấu trúc

```
packages/shared   Luật game thuần (có test), Zod contracts, bản dịch vi/en
apps/server       Fastify + WebSocket + PostgreSQL (Drizzle) + Redis
apps/web          React + Phaser 3 + Tailwind + Zustand + i18next (+ Capacitor Android)
apps/desktop      Electron shell cho Windows (NSIS installer + portable)
deploy/           Caddyfile (HTTPS/WSS tự động)
docs/             Kiến trúc, tiến độ, pipeline asset
```

## Chạy local

Yêu cầu: Node 22+, pnpm 10, PostgreSQL 16, Redis 7 (tuỳ chọn).

```bash
cp .env.example .env          # sửa JWT_SECRET, DATABASE_URL
pnpm install
pnpm dev                      # server :3000 (tự chạy migration) + web :5173
```

Kiểm tra:

```bash
pnpm typecheck
TEST_DATABASE_URL=postgres://casino:casino@localhost:5432/casino_test pnpm test
pnpm build
```

## Triển khai (Ubuntu 24.04 + Docker Compose)

```bash
# .env: POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32), DOMAIN=play.example.com, ADMIN_USERNAMES=...
docker compose --env-file .env up -d --build
```

Caddy tự cấp chứng chỉ Let's Encrypt, phục vụ web và reverse proxy `/api` + `/ws` (WSS).

## Build ứng dụng

- **Android APK**: GitHub Actions → *Android APK* (chạy tay hoặc khi push tag `v*`). Đặt repository variable `API_URL`.
- **Windows EXE**: GitHub Actions → *Windows desktop*. Cũng cần `API_URL`.

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/PROGRESS.md](docs/PROGRESS.md) · [docs/ART_PIPELINE.md](docs/ART_PIPELINE.md)
