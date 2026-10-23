# Tiến độ dự án

_Cập nhật: 2026-10-23_

## Nhánh & quy trình

- Nhánh chính thức: **`Corgi-Casino`** (default branch trên GitHub).
- Mọi thay đổi làm trên nhánh feature riêng và mở Pull Request vào `Corgi-Casino` để chủ dự án duyệt. Không reset, force-push hay xoá nhánh khi chưa được phép.

## UI approval gate (nhánh `claude/ui-hub-approval`) — CHỜ CHỦ DỰ ÁN DUYỆT

Giao diện **chưa được duyệt**. Gameplay và tính năng mới tạm dừng cho tới khi có xác nhận.

- Sảnh Game mới: banner, 6 trò chơi chính thức (Poker, Tài Xỉu, Roulette, Liêng, Xì Tố, Blackjack 21). Royal Slots ẩn khỏi sảnh, source và route `/play/slots` vẫn giữ.
- Thanh người chơi: avatar + khung, Player ID, Cxu Bạc/Vàng (asset chính thức), VIP 1–15 + thanh VIP EXP, Điểm Hấp Dẫn, huy hiệu Partner/Verified.
- Điều hướng 11 mục; Chợ Xa Hoa, Hồ sơ, VIP 15 cấp đã có màn hình; Danh sách phòng, Bộ Sưu Tập, Nhiệm Vụ, Bạn Bè, Quà Tặng là màn hình "Sắp ra mắt".
- **Chưa có backend**: VIP EXP, Điểm Hấp Dẫn, quyền lợi VIP, Poker/Liêng/Xì Tố, các mục "Sắp ra mắt", các tab Chợ Xa Hoa ngoài Khung avatar. Giá trị VIP EXP/Điểm Hấp Dẫn trên UI là demo và luôn gắn nhãn **DEMO**.
- Bản Web Preview: `pnpm --filter @casino/web build:preview` (biến `VITE_DEMO=1`) chạy không cần server, dữ liệu demo nằm trong `apps/web/src/demo.ts`, có banner "BẢN XEM TRƯỚC GIAO DIỆN" cố định. Bản build thật không chứa dữ liệu demo.
- Sửa lỗi có từ trước: nút trong panel điều khiển bàn chơi bị co về chiều cao 0 trên màn hình thấp (iPhone landscape).

## Kinh tế & phần thưởng (PR: Cxu Bạc/Vàng, quà tân thủ, điểm danh, cửa hàng, huy hiệu)

- **Cxu Bạc**: tiền cược của mọi game (thay cho "chip"). **Cxu Vàng**: tiền hiếm, chỉ nhận qua quà tân thủ, điểm danh, admin; dùng ở cửa hàng. Không thể mua bằng tiền thật.
- **Quà tân thủ**: 10.000 Bạc + 10 Vàng khi đăng ký, có hộp chào mừng.
- **Điểm danh 7 ngày** (ngày tính theo giờ Việt Nam): 1K → 5K Bạc, ngày 4 +1 Vàng, ngày 7 +5 Vàng; bỏ lỡ một ngày thì quay lại Ngày 1. Thay cho "thưởng hằng ngày" cũ (cột cũ vẫn giữ, không xoá dữ liệu).
- **Cửa hàng**: 6 khung avatar trang trí, mua bằng Cxu Vàng (không ảnh hưởng gameplay).
- **Huy hiệu Verified / Partner**: admin cấp/thu hồi; hiển thị cạnh tên ở sảnh, hồ sơ, xếp hạng, big win.
- Admin: cộng/trừ theo loại tiền, bật/tắt huy hiệu, thống kê Cxu Vàng lưu hành.
- Sổ cái tách theo loại tiền; test kiểm `sum(ledger) == ví` cho cả Bạc và Vàng; điểm danh và mua hàng an toàn khi gửi đồng thời.
- Migration `0001` chỉ thêm cột/bảng; đã thử nâng cấp DB có dữ liệu thật: không mất dòng nào.
- Gameplay (luật game, scene Phaser, dịch vụ game server) **không thay đổi**.

## ✅ Đã hoàn thành & đã kiểm chứng

- Monorepo pnpm: `shared`, `server`, `web`, `desktop`; TypeScript strict.
- Luật 4 game thuần + test (RTP slots tính chính xác bằng liệt kê 7⁵ tổ hợp; roulette/sic bo tính chính xác; blackjack mô phỏng 20.000 ván).
- Backend: đăng ký/đăng nhập, JWT + thu hồi, ví giao dịch + sổ cái, idempotency, provably fair, thưởng hằng ngày, chip hỗ trợ khi hết tiền, lịch sử, thống kê, xếp hạng, big win broadcast, presence, admin (tổng quan, cộng/trừ chip, khoá), Redis fan-out tuỳ chọn, rate limit.
- Client HD: sảnh, 4 bàn chơi Phaser có animation (quay cuộn, bánh xe + bi, lắc xúc xắc, chia/lật bài, chip rơi, ăn mừng ánh sáng + hạt), hồ sơ, provably fair UI, xếp hạng, cài đặt (vi/en, âm lượng, giảm chuyển động), admin, overlay xoay ngang.
- Song ngữ vi/en đầy đủ (kiểm tra compile-time + test).
- Electron shell: đã chạy thử trên Linux/Xvfb, load game từ `app://casino`.
- Bản build server production (`pnpm deploy`) đã chạy thử và trả `/api/health` OK.
- CI GitHub Actions (typecheck, test có Postgres + Redis, build); workflow build APK & EXE.
- Kết quả test gần nhất: shared 33 ✓, server 32 ✓ (cả có và không Redis), web 4 ✓. E2E Playwright (desktop 1280×720 & mobile 844×390): đăng ký → chơi cả 4 game → hồ sơ → ranking, 0 lỗi console.

## ⚠️ Chưa kiểm chứng trong môi trường này

- `docker build` (Docker Hub trả 429 rate limit) — Dockerfile/compose chưa được build thực tế.
- Workflow Android/Windows chưa chạy (cần chạy trên GitHub; cần biến `API_URL`).
- Chưa thử trên thiết bị Android/Windows thật.

## 🔜 Việc tiếp theo (đề xuất theo thứ tự)

1. Asset raster chuyên nghiệp (xem `docs/ART_PIPELINE.md`) — cần công cụ tạo ảnh/hoạ sĩ.
2. Game nhiều người chơi theo bàn: Poker Texas Hold'em, Xì Tố, Liêng (phòng, ghế, lượt, timeout, reconnect).
3. Hệ thống VIP 15 cấp (đã nhận yêu cầu, làm ở PR riêng), nhiệm vụ, thành tựu, bạn bè, thông báo.
4. Blackjack: split, insurance.
5. Sao lưu PostgreSQL tự động, giám sát (metrics/log tập trung), staging.
6. Ký số bản Windows, ký bản phát hành Android (keystore qua GitHub Secrets).

## Quyết định cần chủ dự án

- Domain production và repository variable `API_URL`.
- Danh sách admin (`ADMIN_USERNAMES`).
- Ưu tiên game kế tiếp (Poker / Xì Tố / Liêng) và luật biến thể Việt Nam mong muốn.
