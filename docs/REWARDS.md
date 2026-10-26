# Phần thưởng mùa giải, bộ Vương Giả, thưởng tham gia Rank, Giftcode và cosmetics

## 1. Thưởng cuối mùa chính thức

Mỗi mùa kéo dài 2 tháng (`SEASON_LENGTH_MONTHS`). Khi mùa kết thúc, hệ thống tự chốt kết quả, phát thưởng và mở mùa mới.

| Hạng | Thưởng |
|---|---|
| Top 1 — Vương Giả | 3.000.000 Bạc · 3.000 Vàng · bộ Vương Giả 60 ngày |
| Top 2 — Vương Giả | 2.000.000 Bạc · 2.000 Vàng · bộ Vương Giả 60 ngày |
| Top 3 — Vương Giả | 1.000.000 Bạc · 1.000 Vàng · bộ Vương Giả 60 ngày |
| Top 4–10 — Thần Tướng | 500.000 Bạc · 500 Vàng |
| Top 11–50 — Thần Vương | 300.000 Bạc |
| Top 51 trở đi | 200.000 Bạc |

**Cấu hình:**
- Bảng thưởng lấy theo `OFFICIAL_SEASON_REWARDS` (`packages/shared/src/rewards.ts`).
- Mùa mới mặc định dùng bảng này. Owner/Super Admin có thể chỉnh trong Admin → Level & Rank trước khi tạo mùa.

**Điều kiện nhận thưởng:**
- Có ít nhất 1 trận Đấu Rank hợp lệ trong mùa.
- Là tài khoản người chơi đang hoạt động. Tài khoản hệ thống, tài khoản bị khóa và tài khoản bị loại vì gian lận đã xác minh (`player_ranks.disqualified`) không nhận thưởng.

**Xác định hạng Top 1–50:**
- Top 1–50 là người giữ danh hiệu Top: Chiến Thần I có ít nhất 200 RP, xếp theo RP, rồi theo thời điểm đạt RP, rồi theo UID.
- Mọi người đủ điều kiện khác nhận thưởng "Top 51 trở đi".
- Nếu mùa có ít hơn 50 người giữ danh hiệu, không tạo thứ hạng giả.

**Quy trình kết thúc mùa** (`endSeason`, một transaction):
1. Đóng mùa bằng một câu cập nhật có điều kiện, nên chỉ chạy đúng một lần. Kết quả trận gửi tới sau thời điểm này không được tính vào mùa cũ.
2. Chốt hạng cuối mùa và danh hiệu Top (`rank_season_results`).
3. Mở mùa kế tiếp. Nếu Owner đã lên lịch sẵn một mùa thì dùng mùa đó; nếu không, tự tạo mùa 2 tháng với cùng luật và bảng thưởng.
4. Ghi bản ghi thưởng cho từng người (`season_rewards`):
   - gồm bracket, đính kèm, tổng Bạc và Vàng;
   - không sửa được bằng trigger, chỉ trạng thái gửi thư được phép thay đổi;
   - thời hạn vật phẩm được chốt tại đây, tính từ khi mùa mới bắt đầu.

**Sau khi commit** (`deliverSeasonRewards`):
- Gửi từng thư với khóa `season:<id>:reward`, mỗi thư trong một transaction riêng.
- Thư lỗi được gửi lại mỗi phút, hoặc Owner bấm "Gửi lại" trong Admin.
- Server khởi động lại hay nhiều instance chạy cùng lúc vẫn không gửi trùng. Người chơi không cần online.

**Phạm vi:** không động tới Level/EXP, Cxu, ngân hàng, VIP hay kho đồ. Cxu chỉ vào ví khi người chơi nhận thư, qua ledger.

**Kiểm toán:** Admin → Thưởng mùa giải hiển thị:
- tổng Cxu đã chốt phát hành, Cxu người chơi đã nhận, Cxu thưởng tham gia trận;
- danh sách người nhận, trạng thái gửi thư và nhận thư;
- ngày hết hạn bộ Vương Giả.

## 2. Bộ Vương Giả độc quyền 60 ngày

Bốn vật phẩm trong catalog, được seed bởi migration 0008:

| ID | Loại |
|---|---|
| `vuong_gia_card_back` | Mặt lưng lá bài |
| `vuong_gia_frame` | Khung |
| `vuong_gia_bubble` | Bong bóng chat |
| `vuong_gia_avatar` | Avatar |

**Đặc tính:**
- Độ hiếm "Thần thoại", nguồn "Thưởng mùa giải".
- Không giao dịch được, không bán ở cửa hàng.
- Hình được client vẽ bằng SVG (`style.art = "vuong_gia"`): vương miện, viền vàng và đỏ thẫm, đá quý, có chuyển động; tắt chuyển động khi người chơi bật giảm chuyển động.
- Có tên và mô tả VI/EN.

**Thời hạn:**
- `inventory_items.expires_at` là mốc tuyệt đối = ngày mùa mới bắt đầu + 60 ngày.
- Nhận thư muộn không gia hạn.
- Nhận thư khi vật phẩm đã hết hạn: chỉ ghi vào lịch sử sở hữu (kết quả `expired`), không dùng được.

**Hết hạn:**
- Không trang bị được nữa (lỗi `item_expired`).
- `/api/me` coi như đã tháo ngay lập tức.
- Job mỗi phút (`sweepExpiredEquipment`) tháo vật phẩm ở mọi ô trang bị và gửi sự kiện `profile`, để hồ sơ, chat và bàn chơi cập nhật.
- Dòng sở hữu vẫn được giữ làm lịch sử.

**Nhận lại ở mùa sau:** hạn được kéo dài (không bao giờ bị rút ngắn). Nếu đã có bản vĩnh viễn thì giữ vĩnh viễn.

## 3. Thưởng Cxu khi tham gia trận Rank

**Cấu hình:** theo từng mùa trong Admin → Thưởng mùa giải (`participation`):
- Bạc mỗi trận hợp lệ;
- Bạc thêm khi thắng;
- số trận được thưởng mỗi ngày;
- số trận được thưởng với cùng một đối thủ mỗi ngày.

Mặc định **tắt** (0). Chỉ Owner/Super Admin bật, sau khi Owner duyệt mức thưởng.

**Cách trả thưởng:**
- Được trả trong cùng transaction với kết quả trận (`recordRankedMatch`), qua ledger với lý do `rank_reward` và ref `rank:<season>:<match>`.
- Trận bị hủy hoặc không hợp lệ không bao giờ được ghi nhận. Trận gửi lại hoặc gửi đồng thời không trả thêm (khóa trận duy nhất).

**Chặn thưởng và gắn cảnh báo** (`reward_flags`, xem trong Admin):
- người chơi AFK (engine báo);
- hai người đăng ký từ cùng IP (dấu hiệu dùng nhiều tài khoản);
- vượt giới hạn trận mỗi ngày;
- trùng đối thủ quá số lần cho phép.

**Không ảnh hưởng RP:** quy tắc RP giữ nguyên (Đồng–Vàng được bảo vệ, từ Bạch Kim trở lên có thể mất RP và hạ bậc).

## 4. Giftcode

**Người chơi:**
- Trang Quà Tặng (`/gifts`): nhập mã, nhận thưởng qua Hộp thư, xem lịch sử đổi mã.
- Mã không phân biệt hoa thường; bỏ qua khoảng trắng và dấu gạch.

**Owner/Super Admin** (quyền `giftcode.manage`; Admin, Moderator, Support không có quyền này):
- tạo mã thủ công, 1 mã ngẫu nhiên, hoặc hàng loạt tới 5.000 mã (bỏ các ký tự dễ nhầm 0/O, 1/I/L);
- đặt chiến dịch, ngày bắt đầu và hết hạn, tổng lượt dùng, lượt mỗi tài khoản, phần thưởng (Cxu, mọi loại vật phẩm, có thể có hạn bằng `durationDays`);
- bật hoặc tắt mã; xem thống kê và lịch sử đổi;
- xuất CSV theo chiến dịch (cần xác thực lại, có audit log).

**Bảo mật:**
- Mỗi lần đổi mã là một transaction có khóa dòng mã. Hệ thống kiểm tra:
  - trạng thái và ngày hiệu lực;
  - tổng lượt dùng;
  - lượt mỗi người (unique `(mã, người, lần thứ n)`).
- Thư thưởng có khóa `giftcode:<id>:<n>`.
- Không thể vượt giới hạn hay nhận trùng, kể cả khi gửi đồng thời; có test với 5 người đổi cùng lúc một mã chỉ còn 1 lượt.
- Giới hạn 10 lần đổi mỗi phút theo IP, và tối đa 20 mã sai mỗi giờ cho mỗi người chơi (bộ đếm trong bộ nhớ của từng instance).

## 5. Cosmetics: danh hiệu, bong bóng chat, mặt lưng bài

**Loại vật phẩm mới:** `title`, `chat_bubble`, `card_back`.

**Ô trang bị:** 5 ô (khung, avatar, danh hiệu, bong bóng chat, mặt lưng bài) qua `POST /api/me/equip`. Chỉ trang bị được vật phẩm đang sở hữu, còn hạn và đúng loại.

**Vật phẩm seed sẵn:**
- 3 danh hiệu, 3 bong bóng chat, 3 mặt lưng bài, bán ở Chợ Xa Hoa (tab Mặt lưng bài / Danh hiệu / Bong bóng chat), trừ Cxu qua ledger; mẫu cơ bản miễn phí, mỗi người nhận một lần;
- bộ Vương Giả.

**Tạo vật phẩm mới:** Admin → Vật phẩm. Ảnh upload được kiểm tra định dạng và dung lượng, hoặc dùng "màu vẽ" cho khung, danh hiệu, bong bóng và mặt lưng bài; có xem trước.

**Hiển thị:**
- Danh hiệu hiện trên hồ sơ, tách biệt với Rank thi đấu (Rank là huy hiệu riêng, không giả mạo được).
- Bong bóng chat và mặt lưng bài có xem trước trong Bộ sưu tập. Chúng sẽ được dùng khi có chat và bàn bài (Giai đoạn 5–6); mặt lưng không bao giờ làm lộ bài.

## 6. Font chữ

**Font:**
- Giữ Be Vietnam Pro, hỗ trợ đầy đủ dấu tiếng Việt và được đóng gói sẵn nên chạy offline trên APK và PC.
- Thêm độ đậm 500. Tiêu đề dùng Playfair Display, cũng có bộ ký tự tiếng Việt.

**Token dùng chung** (`index.css`, `tailwind.config.js`: `font-body`, `font-label`, `font-strong`, `font-heading`):

| Token | Độ đậm | Áp dụng |
|---|---|---|
| body | 500 | Chữ thường |
| label | 600 | Nút, nhãn, tab |
| strong | 700 | Tiêu đề nhỏ, nút chính |
| heading | 800 | Tiêu đề chính |

Không dùng 900 cho chữ.

**Áp dụng:**
- Số dư, RP, Level và phần thưởng dùng chữ đậm.
- Chữ trên canvas (bàn chơi Phaser) mặc định 700.
- Chiều cao dòng 1,45 để không bị cắt dấu.
- Đã kiểm tra hiển thị trên Chromium ở desktop 1280×800 và điện thoại ngang 844×390. Bản Android/Windows dùng cùng trình hiển thị Chromium (Capacitor/Electron), nhưng chưa thử trên máy thật.

## Migration `0008_rewards_cosmetics`

**Nội dung:**
- Thêm cột `inventory_items.expires_at` (cho phép null; vật phẩm cũ vẫn vĩnh viễn) và 3 cột ô trang bị trong `users`.
- Thêm cột `participation` và `auto_rollover` cho mùa; `disqualified` cho hạng người chơi; `opponent_ids` và `reward_silver` cho lịch sử trận.
- Bảng mới: `season_rewards` (kèm trigger không cho sửa), `reward_flags`, `giftcodes`, `giftcode_redemptions`.
- Seed vật phẩm. Mùa chưa kết thúc dùng định dạng thưởng cũ được chuyển sang bảng thưởng chính thức.

**An toàn dữ liệu:**
- Có test nâng cấp.
- Rollback: `drizzle/rollback/0008_rewards_cosmetics.down.sql`.
- `reset:test-data` đã đăng ký các bảng mới.

## Kiểm thử

**Server** (`test/rewards.test.ts`, 11 test, PostgreSQL thật):
- **Thưởng mùa:**
  - từng hạng nhận đúng (Top 1/2/3 nhận Bạc, Vàng và 4 vật phẩm; Top 4–10; Top 11–50; 51+);
  - không phát cho người chưa đấu trận nào, người bị khóa, người bị loại hay tài khoản hệ thống;
  - dự kiến phát hành khớp số thực tế; giao thư không trùng; bản ghi thưởng không sửa được.
- **Bộ Vương Giả:** hạn đúng 60 ngày tính từ đầu mùa mới; nhận muộn không gia hạn; hết hạn thì tự tháo và không trang bị lại được; nhận khi đã hết hạn chỉ ghi lịch sử.
- **Thưởng tham gia trận:** tắt mặc định; Admin không chỉnh được; trả đúng cho người thắng và người thua; không trả cho trận gửi lại hay gửi đồng thời; chặn khi trùng đối thủ, AFK hoặc trùng IP đăng ký.
- **Giftcode:** chuẩn hóa mã; giới hạn lượt; mỗi người một lần; mã hết hạn, đã tắt, không tồn tại đều bị từ chối; đổi đồng thời không vượt giới hạn; nhận thư thì cộng qua ledger và cấp danh hiệu có hạn; tạo hàng loạt; xuất CSV có xác thực lại.
- **Ô trang bị:** đúng loại, đúng quyền sở hữu.

**Shared:** bảng thưởng chính thức, phân hạng, quy đổi 60 ngày, chuẩn hóa mã.

**Migration:** test nâng cấp 0008.

**E2E trình duyệt (tiếng Việt):**
- Admin xem dự kiến phát hành; kết thúc mùa phát 3 thư (6.000.000 Bạc và 6.000 Vàng); mùa 2 tự mở; báo cáo hiển thị đúng.
- Top 1 nhận thư, trang bị đủ 4 vật phẩm Vương Giả, thấy ngày hết hạn.
- Đổi Giftcode thành công; đổi lần hai bị chặn.
- Giao diện điện thoại.
