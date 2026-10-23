# Kiến trúc

## Tổng quan

```
 Web / Android (Capacitor) / Windows (Electron)
        │  HTTPS (REST: auth, hồ sơ, bonus, lịch sử, ranking, admin)
        │  WSS   (game: slots.spin, roulette.spin, sicbo.roll, blackjack.*)
        ▼
 Caddy ──► Fastify server (stateless, scale ngang)
              ├─ PostgreSQL: users, wallets, ledger_entries, fair_seeds, game_rounds
              └─ Redis (tuỳ chọn): pub/sub sự kiện, presence, big wins giữa các instance
```

Ba nền tảng dùng **cùng một bundle web**; Android/Windows chỉ là vỏ bọc. Không có ba bản gameplay riêng.

## Server-authoritative & kinh tế ảo

- Client chỉ gửi *ý định* (cược bao nhiêu, cửa nào, hit/stand). Server sinh kết quả, trừ/cộng chip.
- Mỗi round chạy trong **một transaction**: trừ cược → lấy nonce → tính kết quả → ghi `game_rounds` → trả thưởng → ghi `ledger_entries`.
- `UPDATE wallets SET balance = balance + delta WHERE balance + delta >= 0` — nguyên tử, không bao giờ âm (đã test 30 cược đồng thời).
- Bất biến: `sum(ledger_entries.delta) == wallets.balance` (được kiểm trong test).
- **Idempotency**: `id` của mỗi message WebSocket là khoá idempotency (unique `(user_id, idempotency_key)`); gửi lại không bị trừ tiền hai lần.
- Blackjack lưu shoe còn lại trong `game_rounds.state` (không bao giờ gửi cho client); lá úp của nhà cái bị ẩn tới khi kết thúc. Chỉ một ván đang mở/người chơi (partial unique index); có `blackjack.resume` khi mất kết nối.

## Provably fair

`float_i = bytes(HMAC_SHA256(serverSeed, "clientSeed:nonce:cursor"))` → 8 số thực/khối. Hash của server seed công bố trước; khi đổi seed, seed cũ được tiết lộ để tự kiểm tra (`test/games.test.ts` tái tạo lại kết quả). Không cho đổi seed khi đang có ván Blackjack mở.

## Bảo mật

- Mật khẩu scrypt (N=16384) + so sánh constant-time; thời gian đăng nhập không lộ tên tồn tại.
- JWT 30 ngày có `token_version` (đăng xuất mọi thiết bị, khoá tài khoản thu hồi token ngay).
- Zod validate mọi input REST/WS; giới hạn kích thước body 64KB, WS payload 16KB.
- Rate limit: đăng nhập/đăng ký 10/phút/IP; WebSocket token bucket (mặc định 8 msg/s, burst 16).
- Helmet, CORS whitelist (`CORS_ORIGINS`), Electron: `contextIsolation`, `sandbox`, không Node trong renderer, origin riêng `app://casino`.
- Không có secret trong source; cấu hình qua biến môi trường.

## Client

- **React** quản lý sảnh, hồ sơ, ranking, cài đặt, admin và panel điều khiển; **Phaser 3** vẽ bàn chơi và animation.
- Scene được thiết kế trong không gian 640×360, camera zoom ×2–3 → canvas tới 1920×1080; texture vẽ ở cùng độ phân giải nên luôn sắc nét.
- Số dư hiển thị được "giữ" trong lúc animation chạy rồi mới cập nhật (`holdBalance/releaseBalance`).
- i18n: `packages/shared/src/i18n` — kiểu `Translation` bắt buộc `vi` có đủ khoá như `en` (lỗi compile nếu thiếu) + test so khớp biến nội suy.
