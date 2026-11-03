# Đưa bản nâng cấp 8 game (`feat/hd-game-ui`) lên V7.1 để kiểm thử

- Chỉ thay **frontend** của V7.1. Không đụng Production V7.0 (`/opt/keyo-game`, compose project `keyo-game`), backend, database, Redis, Nginx, DNS hay firewall.
- Không restart hay tạo lại container nào.
- Chưa promote lên Production; việc đó cần bạn duyệt riêng.

## Bước 1. Kiểm tra V7.1 (chỉ đọc)

```bash
cd /tmp && curl -fsSLO https://raw.githubusercontent.com/corgistudious/casino-pixel-online-/feat/hd-game-ui/deploy/vps/v71/inspect-v71.sh
sudo bash inspect-v71.sh <domain-V7.1> [thư-mục-V7.1] > v71-report.txt 2>&1
less v71-report.txt
```

Script không thay đổi gì. Mật khẩu và secret được che, chỉ in tên biến, host/tên database và chế độ dữ liệu. Báo cáo trả lời các câu hỏi sau:

- Domain V7.1 trỏ tới đâu: **thư mục tĩnh** trên host (`root …`) hay **container web** (`proxy_pass 127.0.0.1:<port>` → container nào, thuộc compose project nào)?
- Commit V7.1 đang chạy (`keyo-build`).
- V7.1 có backend riêng không (`/api/health` → `dataMode`), và backend đó dùng **database nào** so với Production.
- Chứng chỉ HTTPS của domain V7.1, dung lượng đĩa, RAM, CPU đang dùng.

**Dừng lại** và gửi báo cáo nếu gặp một trong các trường hợp:

- V7.1 dùng chung container web hoặc thư mục với Production.
- Không xác định được V7.1 phục vụ từ đâu.
- Domain V7.1 chưa có HTTPS.
- Đĩa còn dưới 3 GB, hoặc RAM trống dưới 2 GB (bước build cần khoảng 2 GB trong vài phút).

## Bước 2. Chọn chế độ

| Kết quả bước 1 | `V71_DEMO` | Ý nghĩa |
|---|---|---|
| Không có backend V7.1, hoặc backend không báo `dataMode: test`, hoặc dùng chung database với Production | `1` | Chỉ kiểm thử giao diện và thao tác, dữ liệu giả trong trình duyệt. **Không phải multiplayer thật.** |
| Backend V7.1 riêng, `dataMode: test`, database khác Production | `0` | Chơi thật trên dữ liệu **test** của V7.1 |

Script tự kiểm tra lại điều kiện cho `V71_DEMO=0` và **từ chối chạy** nếu không chứng minh được.

## Bước 3. Triển khai frontend

```bash
cd <thư-mục-chứa-checkout-V7.1>
curl -fsSLO https://raw.githubusercontent.com/corgistudious/casino-pixel-online-/feat/hd-game-ui/deploy/vps/v71/deploy-v71-web.sh
# A) V7.1 phục vụ từ thư mục tĩnh:
V71_HOST=<domain-V7.1> V71_SRC=<checkout-V7.1> V71_DEMO=1 V71_STATIC_DIR=<thư-mục-web-V7.1> EXPECT_SHA=a63d23f bash deploy-v71-web.sh
# B) V7.1 phục vụ từ container web riêng (chép vào /srv, không restart):
V71_HOST=<domain-V7.1> V71_SRC=<checkout-V7.1> V71_DEMO=1 V71_WEB_CONTAINER=<container-web-V7.1> EXPECT_SHA=a63d23f bash deploy-v71-web.sh
# Nếu dùng backend test của V7.1, thêm: V71_DEMO=0 V71_SERVER_CONTAINER=<container-server-V7.1>
```

Script **dừng trước khi thay đổi bất cứ gì** nếu:

- Domain là Production, hoặc đường dẫn nằm trong `/opt/keyo-game`.
- Container thuộc project `keyo-game`.
- Domain đang **không** phục vụ đúng thư mục hoặc container được chỉ định.
- Commit trên nhánh khác `EXPECT_SHA`.

Script làm các bước sau:

1. Build trong git worktree riêng, bằng container `node:22-alpine` dùng xong xóa, giới hạn 1,5 CPU và 2 GB RAM. Build có:
   - `VITE_PWA_BLOCK=off`, để thử "Thêm vào MH chính" trên iPhone.
   - Ô chẩn đoán viewport `VP`, để đo dải đen PWA.
2. Sao lưu bản đang chạy, chép file mới vào: assets trước, `index.html` sau cùng.
3. Kiểm tra qua HTTPS: stamp commit, bundle JS, manifest, logo đều trả về 200, và health của container (nếu có).
4. So thời điểm khởi động các container Production trước và sau để xác nhận Production không bị đụng.
5. Ghi script rollback `…/v71-web-backups/rollback-<thời-điểm>.sh`.

## Bước 4. Rollback

```bash
bash <đường dẫn rollback in ra ở cuối bước 3>
```

Rollback khôi phục đúng bản trước lần triển khai đó: cùng thư mục hoặc container, không restart. Mỗi lần triển khai có backup và script rollback riêng.

## Bước 5. Thử trên iPhone

1. Xóa icon Keyo cũ trên màn hình chính, nếu có.
2. Vào Cài đặt → Safari → Nâng cao → Dữ liệu trang web, xóa mục của domain V7.1.
3. Mở `https://<domain-V7.1>` bằng Safari, xoay ngang, và kiểm tra ô `VP` có dòng `build a63d23f…`.
4. Thử lần lượt 8 game: Poker, Liêng, Xì Tố, Blackjack nhiều người, Blackjack chơi đơn, Tài Xỉu/Sic Bo, Roulette, Slots.
   - Đặt cược hoặc hành động, mở và đóng từng nút công cụ, mở chat rồi gõ thử.
5. Thêm vào màn hình chính rồi mở bằng icon, và thử từng tình huống:
   - Xoay máy khi app đang mở.
   - Chuyển sang app khác rồi quay lại.
   - Khóa rồi mở khóa màn hình.
   - Đóng hẳn app trong App Switcher rồi mở lại.

   Nếu thấy dải đen, ghi lại số trong ô `VP`.
