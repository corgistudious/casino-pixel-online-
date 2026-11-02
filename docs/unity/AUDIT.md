# Keyo Game: audit trước khi chuyển frontend sang Unity WebGL

Audit chỉ đọc trên nhánh `Corgi-Casino` (`d2e72f4`). Không có thay đổi code, backend, database hay Production.

## 1. Quy mô hệ thống hiện tại

| Phần | Số liệu |
|---|---|
| Backend Node.js (`apps/server/src`) | ~14.600 dòng TS, 22 module route, **234 endpoint REST** (xem `API_INVENTORY.md`) |
| Frontend React (`apps/web/src`) | ~24.300 dòng TS/TSX, 107 file TSX, **35 route**, 22 trang Admin |
| Hợp đồng dùng chung (`packages/shared`) | Schema Zod cho request/response, i18n VI/EN (~1.000 khóa mỗi ngôn ngữ), luật game dùng chung |

Endpoint theo module:

| Module | Số endpoint |
|---|---|
| social | 38 |
| admin | 24 |
| progression | 21 |
| api | 16 |
| gifts, auth | 15 mỗi module |
| adminContent | 14 |
| rooms | 13 |
| cosmetics, chat | 11 mỗi module |
| support | 9 |
| vip | 8 |
| giftcodes, adminPanel | 7 mỗi module |
| tables, missions, market | 4 mỗi module |
| cards, blackjackTables, bank | 3 mỗi module |
| leaderboards, achievements | 2 mỗi module |

## 2. Giao thức realtime (WebSocket `/ws`, `realtime/gateway.ts`)

- **Xác thực:** gói đầu tiên `{type:'auth', token}`; quá thời gian thì đóng với mã `4001`. Có `ping`. Mỗi socket có rate-limit kiểu token bucket. Bị ban hoặc mất quyền thì đóng `4001`.
- **Request/response:** `{type, id, ...}` → `{type:'res', id, ok, data | error{code}}`.
- **Lệnh client gửi:**
  - bàn chung (Tài Xỉu, Roulette): `table.join`, `table.leave`, `table.bet`;
  - Blackjack đơn: `blackjack.start`, `blackjack.action`, `blackjack.resume`;
  - Blackjack nhiều người: `bjt.join`, `bjt.sit`, `bjt.bet`, `bjt.act`, `bjt.stand`, `bjt.leave`;
  - bài Poker/Liêng/Xì Tố: `card.join`, `card.sit`, `card.queue`, `card.unqueue`, `card.act`, `card.back`, `card.stand`, `card.leave`;
  - lượt đơn: `roulette.spin`, `sicbo.roll`, `slots.spin`.
- **Sự kiện server đẩy (`type:'event'`):** `table`, `bjt`, `card`, `cardMatch`, `room`, `roomInvite`, `roomKicked`, `chatMessage`, `chatRemoved`, `presence`, `social`, `support`, `mail`, `wallet`, `progress`, `profile`, `identity`, `counts`, `bigwin`.
- **Chống trùng:**
  - Bank, tạo UID và các thao tác Admin dùng `idempotencyKey` (`services/bank.ts`, `adminOps.ts`).
  - Lệnh cược qua WebSocket được backend kiểm tra theo trạng thái ván.
  - Client Unity **không** được tự gửi lại lệnh cược. Đây là điều kiện bắt buộc trong thiết kế networking.
- **Backend đã đủ API cho mọi màn hình React hiện có.** Unity chỉ cần một client C# nói đúng giao thức này. Không cần endpoint mới, trừ khi có nhu cầu mới.

## 3. Màn hình React cần chuyển (35 route + lớp phủ)

- **Auth:**
  - đăng nhập, đăng ký, xác minh email bắt buộc (cổng chờ xác minh);
  - link email: verify, reset, activate, captain-setup.
- **Sảnh** `/` (Stage 2D theo tỷ lệ), dock, chat nổi.
- **Game:**
  - `/play/:game` (slots, roulette, sicbo, blackjack đơn);
  - `/tables/:id` (Tài Xỉu/Roulette nhiều người);
  - `/bjt`, `/bjt/:id` (Blackjack 5 ghế);
  - `/rooms`, `/cards/:id` (Poker, Liêng, Xì Tố);
  - `/custom-rooms` (phòng riêng có mật khẩu).
- **Kinh tế:** `/bank`, `/market`, `/collection`, `/gifts` (giftcode), `/mail` (hộp thư, đính kèm), `/trading`.
- **Xã hội:** `/friends`, `/chat` (Server/Guild/Private), `/guild`, `/player/:uid`, menu thao tác người chơi, báo cáo, gửi quà.
- **Tiến trình:** `/profile`, `/vip`, `/rank`, `/leaderboard`, `/frames`, `/achievements`, `/missions`.
- **Khác:** `/support` (Support Hub, UID 1000), `/settings`.
- **Admin** `/admin/*`, 22 trang:
  - người chơi, nhân sự (RBAC), audit, báo cáo, hỗ trợ, phòng;
  - vật phẩm, bộ sưu tập, quà, charm, VIP, tiến trình, phần thưởng mùa, nhiệm vụ, giftcode, thư.
- **Lớp phủ toàn cục:** OrientationGuard, Toasts, LevelUp, VictoryEffect, ConnectionBanner, lời mời phòng.

Lưu ý so với đặc tả: repo còn có **Slots** (`/play/slots`) ngoài 6 game được liệt kê, và Blackjack có cả chế độ đơn lẫn bàn 5 ghế. Cần Owner xác nhận có giữ Slots không.

## 4. Kiểm tra khả năng thực hiện trong môi trường hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Unity Editor / Unity Hub | **Không có** trong container. Cài và kích hoạt cần tài khoản Unity cùng license (Personal/Pro); không thể tự kích hoạt ở đây. |
| .NET / Mono (biên dịch C# ngoài Unity) | **Không có**. |
| Unity WebGL build, EditMode/PlayMode test | **Blocked**: cần Unity Editor (máy dev hoặc CI có license, ví dụ GameCI với secret `UNITY_LICENSE`). |
| Kiểm thử iPhone thật | **Blocked** ở đây: cần Owner thử trên thiết bị. |

Hệ quả: trong môi trường này có thể viết mã nguồn C# và dựng cấu trúc project, nhưng **không thể** biên dịch, chạy test hay tạo build WebGL. Theo Definition of Done, những phần đó không được đánh dấu "Tested/Passed".

## 5. Rủi ro kỹ thuật chính (ảnh hưởng trực tiếp tới ưu tiên STABILITY)

1. **Nhập liệu trên iPhone trong Unity WebGL.**
   - Unity WebGL không có bàn phím iOS gốc cho ô nhập uGUI/UI Toolkit. Thực tế phải phủ thẻ `<input>` HTML lên canvas và tự đồng bộ.
   - Mọi màn hình nhiều ô nhập (đăng nhập, đăng ký, Chat, Admin, Bank, Support) chuyển sang Unity sẽ **tái tạo đúng lớp lỗi bàn phím/viewport** vừa được sửa ở V6.4, với ít công cụ hơn.
2. **Bộ nhớ và tải trang trên iOS Safari.**
   - Một build Unity WebGL thường tải hàng chục MB và giữ heap WebAssembly cố định.
   - iOS hay giết tab hoặc PWA nặng khi chạy nền. Điều này mâu thuẫn với yêu cầu P0 "resume từ background 20 lần không lỗi".
3. **Dải đen PWA khi khởi động ở chế độ ngang.**
   - Bằng chứng đến nay cho thấy lỗi nằm ở cửa sổ iOS cấp cho web view, chưa xác nhận trên máy thật.
   - Canvas Unity cũng chỉ vẽ được trong cửa sổ đó, nên chuyển sang Unity **không tự sửa** lỗi này.
   - Hiện đã có cơ chế chặn PWA (PR #30) theo quyết định của Owner.
4. **Khối lượng:**
   - 35 route, 22 trang Admin, 234 endpoint, 6–7 game có hoạt ảnh;
   - toàn bộ Design System HD và asset gốc có license;
   - i18n ~1.000 khóa × 2 ngôn ngữ.
   - Ước lượng thực tế: **nhiều tháng** với một nhóm có Unity, họa sĩ 2D và QA trên thiết bị. Không thể hoàn thành trong một phiên.

## 6. Kiến trúc đề xuất (chờ Owner chọn phạm vi)

- **Phương án A: Unity toàn phần.** Đúng như đặc tả, mọi màn hình viết bằng Unity. Rủi ro cao nhất ở mục 5.1–5.2.
- **Phương án B: lai (khuyến nghị).**
  - Unity WebGL đảm nhận phần cần đồ họa HD: sảnh, 6 bàn chơi, hoạt ảnh, hiệu ứng thắng.
  - React giữ các màn hình nhiều nhập liệu và quản trị: auth, Chat, Bank, Admin, Support, Settings, đã ổn định và có kiểm thử.
  - Hai lớp nói chuyện qua cầu JS ↔ Unity (`jslib`) và dùng chung phiên đăng nhập.
- **Phương án C: nâng cấp đồ họa HD trong stack hiện tại.**
  - Dùng Phaser (đã dùng cho bàn chơi) và WebGL cho sảnh, game; không thêm runtime Unity.
  - Ít rủi ro nhất về tải trang và bộ nhớ trên iPhone.

Dù chọn phương án nào, backend, database, giao thức, UID/RBAC và kinh tế đều giữ nguyên. React vẫn là bản chạy Production cho tới khi bản mới được kiểm thử và Owner duyệt.

## 7. Bước tiếp theo khả thi ngay khi có quyết định

1. Owner chọn A, B hoặc C, và xác nhận có giữ Slots.
2. Chuẩn bị môi trường Unity cho A/B:
   - phiên bản Unity LTS;
   - máy dev hoặc CI có license (GameCI + secret);
   - nơi lưu asset (Git LFS).
3. Mốc đầu tiên đề xuất cho A/B:
   - `apps/unity-webgl/` gồm project skeleton, Keyo Viewport Manager (JS + C#), client WebSocket/REST C# theo đúng giao thức mục 2 (auth, request/response, reconnect, chống trùng sự kiện);
   - một bàn chơi chạy với backend thật trên staging (ví dụ Tài Xỉu, luồng đơn giản nhất).
   - Mục tiêu: đo tải trang, bộ nhớ và ổn định trên iPhone thật **trước khi** chuyển các màn hình còn lại.
