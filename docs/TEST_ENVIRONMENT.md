# Môi trường TEST, reset dữ liệu thử nghiệm và reset UID Production

## Phân biệt TEST / PRODUCTION

Có hai lớp, cả hai đều do database cưỡng chế chứ không chỉ do code ứng dụng:

1. **Chế độ của database** — bảng `environment_state` (đúng 1 dòng): `test` hoặc `production`.
   - Database mới luôn bắt đầu ở `test`.
   - Chỉ lệnh `launch:production` mới chuyển sang `production`, và trigger **cấm quay lại `test`** hay xoá dòng này.
   - Server phải được cấu hình `KEYO_DATA_MODE` khớp với database, nếu không sẽ **từ chối khởi động**: server test không thể ghi vào database production, và server production không chạy trên dữ liệu test.
2. **Cờ trên từng tài khoản** — `users.is_test`.
   - Trigger `users_set_is_test` tự gắn `is_test = true` cho mọi tài khoản tạo khi database ở chế độ `test`, dù tạo bằng đăng ký, admin hay script.
   - Ở chế độ `production`, trigger **từ chối** mọi tài khoản test.
   - Ngoại lệ có chủ đích: Keyo Support (UID 1000) luôn `false`. Tài khoản UID đặc biệt do admin tạo mặc định là chính thức, trừ khi admin tích "Tài khoản TEST".
   - Tài khoản có trước migration `0003` được giữ `false`, để không gì bị xoá nhầm.

Mọi dữ liệu khác (ví, sổ cái, ván chơi, vật phẩm, khung, VIP, giải đấu, thư…) gắn với tài khoản qua `user_id`, nên được coi là TEST theo chủ của nó.

Dấu hiệu nhìn thấy được:
- Góc màn hình game hiện **"MÔI TRƯỜNG THỬ NGHIỆM"** khi server chạy chế độ test.
- `/api/health` trả `dataMode`.
- Bảng admin hiện số tài khoản TEST và nhãn **TEST** cạnh từng tài khoản.

## Trong giai đoạn thử nghiệm

- UID người chơi bắt đầu từ **100000** (sequence `player_uid_seq`).
- Đăng ký bình thường: mỗi tài khoản đều là TEST.
- Tạo nhanh nhiều tài khoản TEST (đã xác minh, có quà tân thủ). Mật khẩu lấy từ biến môi trường, không bao giờ truyền trên dòng lệnh:

  ```bash
  # đặt KEYO_TEST_ACCOUNT_PASSWORD trong deploy/vps/.env trước
  deploy/vps/scripts/maintenance.sh create-test-accounts --operator <tên> --count 20 --prefix tester
  ```
  Email dạng `tester001@test.keyo.invalid` (đuôi `.invalid` không bao giờ nhận được thư thật).
- Kiểm thử ngân hàng, ví, game, VIP, Marketplace, Frame, Reviewer, Tournament, Giftcode: mọi tính năng mới **bắt buộc** đăng ký bảng của mình vào `TEST_DATA_TABLES` (`apps/server/src/maintenance/testData.ts`). Nếu quên, lệnh reset tự **từ chối chạy**, và test `every table referencing users is covered by the reset registry` sẽ thất bại.
- Nội dung chính thức do tài khoản test tạo ra mà phải giữ lại (ví dụ khung đã duyệt) dùng chế độ `reassign_to_support`: nội dung được chuyển cho Keyo Support thay vì bị xoá.

## `reset:test-data`

```bash
deploy/vps/scripts/maintenance.sh reset-test-data                       # 1. dry-run (mặc định)
deploy/vps/scripts/maintenance.sh reset-test-data --execute \
  --operator <tên> --confirm "RESET keyo_game 37"                       # 2. chỉ khi chủ dự án xác nhận
```

| Điều kiện | Cách đảm bảo |
|---|---|
| 1. Chỉ chạy khi chủ dự án xác nhận rõ ràng | Mặc định là dry-run. Muốn xoá phải có `--execute`, `--operator` và `--confirm "RESET <tên database> <số tài khoản TEST>"` khớp chính xác với dry-run, nên phải xem dry-run trước. Số lượng thay đổi thì cụm xác nhận cũ hết hiệu lực. |
| 2. Chỉ tác động dữ liệu TEST | Chỉ xoá `users` có `is_test = true`, `account_type = 'player'`, UID ≠ 1000, và các dòng gắn với họ. Từ chối hoàn toàn khi database ở chế độ `production`. |
| 3. Backup trước khi xoá | `pg_dump` dạng custom, kiểm tra bằng `pg_restore --list`, chmod 600. Thiếu `pg_dump` hoặc backup lỗi thì dừng. `maintenance.sh` còn backup thêm một bản phía host. |
| 4. Dry-run liệt kê số lượng | Số tài khoản TEST, dải UID, số dòng sẽ xoá / giữ trong từng bảng, số thư trong hàng đợi, và các lý do chặn. |
| 5. Xoá tài khoản và dữ liệu liên quan | Ví, sổ cái, ván chơi, seed, vật phẩm và khung, vai trò, ban, token email, yêu cầu xoá, thư chờ gửi. Bảng mới (ngân hàng, VIP, giải đấu, thư…) vào registry khi được xây. Redis: xoá danh sách big win trong namespace `keyo:`. |
| 6. Không xoá Keyo Support | Bị loại khỏi danh sách xoá; kiểm tra lại sau khi xoá, thiếu thì rollback. |
| 7. Không xoá tài khoản/giao dịch thật | Chụp số dòng của dữ liệu được giữ trước và sau; mọi thay đổi → rollback toàn bộ (một transaction). Kiểm tra cả tính khớp ví–sổ cái của tài khoản được giữ. |
| 8. Không xoá nội dung/cấu hình chính thức | Chỉ xoá dòng gắn với tài khoản TEST; bảng cấu hình (vai trò, quyền, cài đặt) không bị đụng; nội dung cần giữ dùng `reassign_to_support`. |
| 9. Không đụng app khác trên VPS | Chỉ kết nối database `keyo_game` trong container riêng; Redis chỉ xoá key có tiền tố `keyo:`. |
| 10. Nhật ký | Mỗi lần chạy (dry-run, bị từ chối, lỗi, thành công) ghi vào bảng `maintenance_runs`. Lần xoá thật ghi thêm `audit_logs` (`system.reset_test_data`) và file báo cáo JSON cạnh bản backup; `maintenance.sh` ghi `/opt/keyo-game/logs/maintenance.log`. |

Trong lúc reset, `maintenance.sh` dừng server và web để không có người chơi thao tác, rồi khởi động lại.

`audit_logs` không bị xoá: đây là nhật ký chỉ ghi thêm, dùng làm bằng chứng kiểm toán.

## Reset UID Production — `launch:production`

Chạy **sau** `reset:test-data`, **trước** khi mở đăng ký chính thức:

```bash
deploy/vps/scripts/maintenance.sh launch-production                     # dry-run
deploy/vps/scripts/maintenance.sh launch-production --execute \
  --operator <tên> --confirm "LAUNCH keyo_game"
# Sau đó: đặt KEYO_DATA_MODE=production trong .env
deploy/vps/scripts/maintenance.sh start
```

Lệnh từ chối nếu:
- database đã ở `production` (UID **không bao giờ** được reset lần hai);
- còn bất kỳ tài khoản TEST nào;
- đã có tài khoản giữ UID ≥ 100000, nghĩa là UID 100000 có thể đã bị dùng;
- thiếu Keyo Support.

Khi chạy, trong một transaction, lệnh làm:
- `ALTER SEQUENCE player_uid_seq RESTART WITH 100000`;
- chuyển database sang `production`;
- kiểm tra sequence;
- ghi audit `system.launch_production`.

Người chơi thật đầu tiên nhận UID **100000**, tiếp theo 100001, 100002… UID 1000 vẫn dành cho Keyo Support. UID 1–99999 vẫn do admin cấp theo quy tắc riêng.

## Đã kiểm thử

- `apps/server/test/maintenance.test.ts` (11 test):
  - tài khoản mới tự gắn cờ TEST;
  - server từ chối chạy khi sai chế độ;
  - registry phủ mọi khoá ngoại tới `users`, và chặn khi có bảng mới chưa đăng ký;
  - backup bằng `pg_dump`;
  - dry-run;
  - từ chối khi sai cụm xác nhận;
  - xoá đúng dữ liệu TEST mà giữ Keyo Support và dữ liệu chính thức;
  - reset UID về 100000 một lần duy nhất, rồi khoá production vĩnh viễn;
  - CLI ghi nhật ký.
- Chạy thật toàn bộ CLI trên database riêng:
  - tạo 3 tài khoản TEST, dry-run, xoá, khôi phục thử từ backup (đủ 4 tài khoản);
  - launch xong, tài khoản tiếp theo nhận UID 100000; launch lần hai bị từ chối.
- Chạy lại toàn bộ chuỗi trên stack Docker Compose thật bằng `deploy/vps/scripts/maintenance.sh` (xem `docs/DEPLOYMENT_VPS.md`, mục Đã kiểm chứng).
