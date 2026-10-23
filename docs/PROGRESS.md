# Tiến độ dự án

_Cập nhật: 2026-10-23_

## ✅ Đã hoàn thành & đã kiểm chứng

- Monorepo pnpm: `shared`, `server`, `web`, `desktop`; TypeScript strict.
- Luật 4 game thuần + test (RTP slots tính chính xác bằng liệt kê 7⁵ tổ hợp; roulette/sic bo tính chính xác; blackjack mô phỏng 20.000 ván).
- Backend: đăng ký/đăng nhập, JWT + thu hồi, ví giao dịch + sổ cái, idempotency, provably fair, thưởng hằng ngày, chip hỗ trợ khi hết tiền, lịch sử, thống kê, xếp hạng, big win broadcast, presence, admin (tổng quan, cộng/trừ chip, khoá), Redis fan-out tuỳ chọn, rate limit.
- Client HD: sảnh, 4 bàn chơi Phaser có animation (quay cuộn, bánh xe + bi, lắc xúc xắc, chia/lật bài, chip rơi, ăn mừng ánh sáng + hạt), hồ sơ, provably fair UI, xếp hạng, cài đặt (vi/en, âm lượng, giảm chuyển động), admin, overlay xoay ngang.
- Song ngữ vi/en đầy đủ (kiểm tra compile-time + test).
- Electron shell: đã chạy thử trên Linux/Xvfb, load game từ `app://casino`.
- Bản build server production (`pnpm deploy`) đã chạy thử và trả `/api/health` OK.
- CI GitHub Actions (typecheck, test có Postgres + Redis, build); workflow build APK & EXE.
- Kết quả test gần nhất: shared 26 ✓, server 26 ✓ (cả có và không Redis), web 4 ✓. E2E Playwright (desktop 1280×720 & mobile 844×390): đăng ký → chơi cả 4 game → hồ sơ → ranking, 0 lỗi console.

## ⚠️ Chưa kiểm chứng trong môi trường này

- `docker build` (Docker Hub trả 429 rate limit) — Dockerfile/compose chưa được build thực tế.
- Workflow Android/Windows chưa chạy (cần chạy trên GitHub; cần biến `API_URL`).
- Chưa thử trên thiết bị Android/Windows thật.

## 🔜 Việc tiếp theo (đề xuất theo thứ tự)

1. Asset raster chuyên nghiệp (xem `docs/ART_PIPELINE.md`) — cần công cụ tạo ảnh/hoạ sĩ.
2. Game nhiều người chơi theo bàn: Poker Texas Hold'em, Xì Tố, Liêng (phòng, ghế, lượt, timeout, reconnect).
3. Thành tựu + huy hiệu, bạn bè, thông báo.
4. Blackjack: split, insurance.
5. Sao lưu PostgreSQL tự động, giám sát (metrics/log tập trung), staging.
6. Ký số bản Windows, ký bản phát hành Android (keystore qua GitHub Secrets).

## Quyết định cần chủ dự án

- Domain production và repository variable `API_URL`.
- Danh sách admin (`ADMIN_USERNAMES`).
- Ưu tiên game kế tiếp (Poker / Xì Tố / Liêng) và luật biến thể Việt Nam mong muốn.
