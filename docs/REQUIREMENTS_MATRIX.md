# Đối chiếu yêu cầu Master Prompt với source thực tế

Baseline: `main` @ `6932b19`, đánh giá ngày 2026-10-24. Trạng thái:
- ✅ **có và đã kiểm thử**;
- 🟡 **có một phần**;
- ❌ **chưa có**;
- 🔒 **làm trong Giai đoạn 1** (PR này).

| Phân hệ | Trạng thái tại baseline | Ghi chú / giai đoạn |
|---|---|---|
| Đăng ký, xác minh email, UID, ban, xoá tài khoản | ✅ | PR #4 |
| Bảo vệ UID 1000 Keyo Support | 🟡, nay 🔒 ✅ | Trước chỉ chặn ở vài API; nay có trigger DB |
| Bảo vệ UID 1002 Owner | ❌ (chỉ frontend), nay 🔒 ✅ | Giai đoạn 1 |
| RBAC 5 vai trò, phân cấp, chống tự nâng quyền | 🟡, nay 🔒 ✅ | Giai đoạn 1 |
| Audit log | 🟡 (sửa/xoá được), nay 🔒 ✅ append-only | Giai đoạn 1 |
| Admin Panel: dashboard, người chơi, nhân sự, audit | 🟡 trang đơn giản | Giai đoạn 2 |
| Admin: kho vật phẩm, khung, avatar, hộp thư, chợ, ngân hàng, sự kiện, phòng, cấu hình, ticket, chat, lỗi hệ thống | ❌ | Giai đoạn 2–6, theo phân hệ |
| Khung hồ sơ | 🟡 6 khung CSS cố định trong code, mua bằng Bạc, trang bị được | Giai đoạn 3: catalog trong DB, upload, xem trước, tháo khung |
| Avatar đặc biệt | ❌ (16 avatar mặc định) | Giai đoạn 3 |
| Kho đồ | 🟡 bảng `user_items` (chỉ khung) | Giai đoạn 3 |
| Hộp thư có đính kèm | ❌ | Giai đoạn 3 |
| Tài Xỉu / Sicbo | 🟡 mỗi người một ván riêng, kết quả ngay, chưa có chu kỳ chung 30s/5s, chưa có bát úp; nay ✅ bàn chung `taixiu-1`: lắc bát → cược 30 s (cảnh báo 5 s) → nâng bát → trả qua ledger → nghỉ 5 s | Giai đoạn 4a, `docs/MULTIPLAYER.md` |
| Roulette | 🟡 European, ván riêng từng người, quay ngắn; nay ✅ bàn chung `roulette-1`, quay 15 s (cấu hình được), bi ngược chiều, rơi đúng ô của server | Giai đoạn 4a |
| Poker Texas Hold'em | ❌; nay ✅ bàn có ghế, no-limit, pot phụ, seed kiểm chứng | Giai đoạn 4b, `docs/CARDS.md` |
| Liêng 3 lá | ❌; nay ✅ Sáp > Liêng > Ảnh > Điểm, 1 vòng cược | Giai đoạn 4b |
| Xì Tố | ❌; nay ✅ 1 úp + ngửa dần, 4 vòng, bài ngửa mạnh nhất nói trước | Giai đoạn 4b |
| Blackjack, Slots | ✅ (có từ trước, ngoài danh sách 5 game) | Giữ nguyên |
| Phòng game nhiều người | ❌; nay ✅ bàn chung theo vòng (Tài Xỉu, Roulette) và bàn có ghế (Poker, Liêng, Xì Tố), trạng thái lưu DB, tiếp tục sau khi server khởi động lại | Giai đoạn 4a ✅, 4b ✅ |
| Level 1–999, EXP server, thưởng mốc | ❌; nay ✅ | Giai đoạn Progression, `docs/PROGRESSION.md` |
| Đấu Rank 40 bậc + Top 3/10/50, 200 RP, bảo vệ điểm, chuỗi 3 thắng, mùa giải, reset mềm | ❌; nay ✅ engine, mùa, BXH, admin, UI; tìm trận 1-1 Poker/Liêng/Xì Tố bằng chip trận đấu (không dùng Cxu), xử thua khi rời/AFK | Progression ✅, Giai đoạn 4b ✅ |
| Hệ thống phần thưởng thống nhất | ❌; nay 🟡 `deliverReward` (thư + ledger khi nhận) dùng cho Level/Mùa; Giftcode/thành tích/VIP sẽ dùng chung | Progression, Giai đoạn Rewards |
| Ngân hàng | ❌ | Giai đoạn 5 |
| Chợ sưu tầm | ❌ (chỉ có cửa hàng khung) | Giai đoạn 5 |
| Cửa hàng | 🟡 khung avatar | Giai đoạn 5 |
| VIP 15 cấp | 🟡 bảng cấp và giao diện; EXP chưa có backend (hiện 0 + "Chưa hoạt động") | Giai đoạn 5 |
| Thành tích | ❌ | Giai đoạn 5 |
| Huy hiệu Verified/Partner | ✅ | Từ PR #1 |
| Support Hub / ticket | ❌ (chỉ có tài khoản Keyo Support) | Giai đoạn 6 |
| Chat + kiểm duyệt | ❌ | Giai đoạn 6 |
| Song ngữ vi/en | ✅ cho phần đã có; có kiểu `Translation` kiểm tra lúc compile | Mọi giai đoạn |
| Provably fair, server-authoritative, ledger, idempotency ván chơi | ✅ | Có từ đầu |
| Môi trường TEST/PRODUCTION, reset dữ liệu test | ✅ | PR #5 |

## Phát hiện quan trọng về server live

- VPS chạy bằng `docker-compose.yml` gốc tại `127.0.0.1:18481`, **không có** `KEYO_DATA_MODE`. Server và DB đang ở **chế độ test**: mọi tài khoản đăng ký trên live bị gắn cờ TEST, và web hiện nhãn "MÔI TRƯỜNG THỬ NGHIỆM".
- Nếu live đã là bản chính thức, cần quyết định trước khi chuyển:
  - Nếu chưa có người chơi thật: chạy `reset:test-data` rồi `launch:production` theo `docs/TEST_ENVIRONMENT.md`.
  - Nếu đã có người chơi thật giữ UID ≥ 100000: `launch:production` sẽ **từ chối** (đúng thiết kế, không reset UID khi đã có người chơi). Khi đó cần một quyết định riêng: giữ chế độ test hoặc thêm lệnh chuyển chế độ không reset UID. Chưa làm vì chưa được duyệt.
- Caddyfile live gộp mọi người chơi thành một IP. Đã sửa ở Giai đoạn 1 (V11), có hiệu lực khi deploy lại.
