# Đưa bản vá iOS PWA lên Test và thử trên iPhone

- Chỉ áp dụng cho môi trường **Test** (`https://test.play.keyogame.com`).
- Không đụng Production `/opt/keyo-game`, compose project `keyo-game`, database, Redis hay dữ liệu người chơi.
- Không restart container nào.

> ⚠️ Không dùng `deploy/vps/scripts/*.sh` (`deploy.sh`, `healthcheck.sh`, …) cho Test. `common.sh` gắn cứng `--project-name keyo-game`, tức là **Production**.

## 1. Kiểm tra môi trường Test (chỉ đọc)

```bash
cd /tmp && curl -fsSLO https://raw.githubusercontent.com/corgistudious/casino-pixel-online-/fix/ios-pwa-landscape-startup/deploy/vps/test/inspect-test-env.sh
bash inspect-test-env.sh /opt/keyo-game-pr29-1-work/source test.play.keyogame.com > test-env-report.txt 2>&1
less test-env-report.txt
```

Báo cáo trả lời các câu hỏi sau:

- `test.play.keyogame.com` được phục vụ từ **thư mục tĩnh** trên host hay từ **container web** nào, thuộc compose project nào?
- Test đang build với `VITE_DEMO=1` (chỉ giao diện) hay có backend Test riêng (`/api/health` trả gì)?
- Header `Cache-Control` của `/` có phải `no-cache` không?
- Checkout Test có thay đổi chưa commit không? Script không đụng vào chúng, nhưng vẫn nên biết.
- Container Production đã chạy từ lúc nào? Ghi lại để so sánh sau khi deploy.

**Dừng lại** và gửi báo cáo nếu gặp một trong các trường hợp:

- Test dùng chung container web với Production.
- Không xác định được Test phục vụ từ đâu.
- Đĩa còn dưới 2 GB.

## 2. Deploy riêng frontend lên Test

Script `deploy/vps/test/deploy-test-web.sh` làm các bước sau:

- `git fetch` nhánh, **không đụng working tree** của checkout Test.
- Build trong một git worktree riêng (`build-web-<commit>`), bằng container `node:22-alpine` dùng xong xóa ngay.
- Gắn dấu commit vào build (`<meta name="keyo-build">`) và bật overlay chẩn đoán.
- Backup bản đang chạy, rồi chép file web mới vào: assets trước, `index.html` sau cùng.
- **Từ chối** chạy nếu đích nằm trong `/opt/keyo-game` hoặc container thuộc project `keyo-game`.

```bash
cd /opt/keyo-game-pr29-1-work
curl -fsSLO https://raw.githubusercontent.com/corgistudious/casino-pixel-online-/fix/ios-pwa-landscape-startup/deploy/vps/test/deploy-test-web.sh
# A) Test phục vụ từ thư mục tĩnh trên host:
TEST_DEMO=1 TEST_STATIC_DIR=/đường/dẫn/thư-mục-web-test bash deploy-test-web.sh
# B) Test phục vụ từ container Caddy riêng (chép vào /srv, không restart):
TEST_DEMO=1 TEST_WEB_CONTAINER=<tên-container-web-test> bash deploy-test-web.sh
```

- `TEST_DEMO` phải khớp cách Test đang build: `1` nếu Test chỉ là giao diện demo, `0` nếu có backend Test.
- Lệnh rollback được in ra ở cuối, kèm đường dẫn backup.

## 3. Xác nhận commit đang chạy

```bash
curl -s https://test.play.keyogame.com/ | grep -o '<meta name="keyo-build"[^>]*>'
# → <meta name="keyo-build" content="<12 ký tự commit> <thời điểm build>" />
git -C /opt/keyo-game-pr29-1-work/source rev-parse --short=12 origin/fix/ios-pwa-landscape-startup
# Production không bị đụng: thời điểm khởi động phải giống trong báo cáo ở bước 1
for c in $(docker ps --filter label=com.docker.compose.project=keyo-game --format '{{.Names}}'); do echo "$c $(docker inspect "$c" --format '{{.State.StartedAt}}')"; done
```

Trên iPhone, ô `VP` ở góc phải dưới, khi mở ra, có dòng `build <commit>`.

## 4. Tránh cache bản cũ trên iPhone

- Repo không có service worker. `index.html` và manifest được phục vụ `no-cache`, bundle JS có hash trong tên.
- Tuy vậy, iOS **lưu cấu hình PWA (meta, manifest, kiểu thanh trạng thái) lúc "Thêm vào MH chính"**, và PWA có bộ nhớ riêng, tách khỏi Safari.

Làm theo thứ tự:

1. Nhấn giữ icon Keyo, chọn **Xóa ứng dụng** (xóa luôn dữ liệu riêng của PWA).
2. Vào Cài đặt → Safari → Nâng cao → Dữ liệu trang web, xóa mục `keyogame.com`.
3. Mở `https://test.play.keyogame.com` bằng Safari, kéo xuống để tải lại.
4. Chọn Chia sẻ → **Thêm vào MH chính**, rồi mở app từ icon mới.
5. Mở ô `VP` và kiểm tra dòng `build` trùng commit ở bước 3. Nếu không trùng, đóng app trong App Switcher, mở lại và kiểm tra lần nữa.

## 5. Kịch bản thử

Trước mỗi kịch bản, **đóng hẳn app trong App Switcher**. Về Home rồi quay lại không tính là mở lại.

| # | Kịch bản | Mong đợi |
|---|---|---|
| A1 | Giữ máy dọc → mở app → xoay ngang | Toàn màn hình, không có dải đen |
| A2 | Tiếp A1: vào Chat → chạm ô nhập | Không có dải đen; ô nhập và nút Gửi nằm ngay trên bàn phím |
| B1 | Giữ máy dọc ở màn hình chính → xoay ngang → mở app | Ghi lại `VP`: 956×440 là đúng; 956×378 là iOS cấp cửa sổ thiếu (sẽ có gợi ý trong app) |
| B2 | Tiếp B1: vào Chat → chạm ô nhập | **Không còn dải đen trên bàn phím** (đây là lỗi cần sửa) |
| B3 | Tiếp B2: đóng/mở bàn phím 5 lần, chuyển giữa các ô nhập, gửi tin, chuyển sang app khác rồi quay lại | Không giật, không mất nội dung đang gõ, tin được gửi |
| C | Đăng nhập / xác minh email ở chế độ dọc | Như trước |

Nếu B1 hoặc B2 không đạt:

- Bấm `VP` → **copy JSON** và gửi lại. JSON có commit, kích thước cửa sổ, `offsetTop` và các biến bàn phím ở mỗi lần focus.
- Có thể chụp màn hình khi bật "probe".

## 6. Gỡ bản vá khỏi Test

Chạy lệnh rollback mà script đã in ra:

- Thư mục tĩnh: `rm -rf <dir> && mv <dir>.bak-<ts> <dir>`.
- Container: `docker cp <backup>/. <container>:/srv/`.

Dọn worktree: `git -C /opt/keyo-game-pr29-1-work/source worktree remove ../build-web-<commit>`.
