# iPhone landscape full-screen + đồng bộ tên hiển thị và @username

Nhánh `feat/landscape-username-sync`, tách từ `feat/mobile-ui-keyboard` (`b0f1549`, frontend đang chạy production `ui-kb-20261031`).
Không merge, không deploy, không chạy migration trên Production.

## A. Viền đen khi iPhone nằm ngang

### Nguyên nhân (đo trên ảnh chụp của bạn)

- **Viền trái/phải (cả hai trường hợp) và khoảng đen dưới nhỏ (xoay từ dọc sang ngang):** `#root` được đệm (padding) bằng safe-area (khoảng 59px trái/phải và 21px dưới khi cầm ngang). Phần đệm để lộ nền `body`, tối hơn nền sảnh nhiều. Đây là bản vá của chính tôi ở lần trước (`#root { padding: env(safe-area-inset-*) }`).
- **Khoảng đen dưới lớn (mở thẳng khi đang ngang):** app trên màn hình chính của iPhone, khi mở lúc đang ngang, nhận chiều cao viewport sai (ngắn hơn thực tế). Chỉ sau một lần xoay iOS mới tính lại. Phần thiếu đó hiện ra như một dải đen.
- `Stage` của sảnh không phải nguyên nhân: nó luôn phóng to cho vừa khung chứa. Sai là ở kích thước của khung chứa.

### Cách sửa

- `#root` không còn padding và phủ toàn bộ màn hình.
- Safe-area trở thành biến `--sa-t/r/b/l`. Khi bàn phím mở thì `--sa-b` bằng 0.
- Mỗi khung màn hình để nền **tràn viền** và chỉ chừa vùng an toàn cho phần điều khiển:
  - **Sảnh:** nền lounge tràn viền; stage (nút, thẻ game, thanh dưới) chừa vùng an toàn.
  - **AppShell:** header tràn viền, nội dung tránh Dynamic Island; thanh điều hướng trái mở rộng ra mép, icon nằm ngoài vùng an toàn; vùng nội dung chừa phải và dưới.
  - **Phòng chơi (GameLayout/TopBar), Admin, Đăng nhập:** cùng nguyên tắc.
- **iPhone PWA (`navigator.standalone`):** kích thước app lấy từ `screen` theo hướng vật lý, vì app trên màn hình chính iPhone luôn phủ toàn màn hình. Nhờ vậy mở thẳng lúc ngang cũng đúng ngay. iPad được loại trừ (Split View và Stage Manager làm cửa sổ nhỏ hơn màn hình).
- Không kéo giãn hay ép tỉ lệ. Không che bằng màu nền. Bàn phím, OrientationGuard và vùng an toàn vẫn chạy chung qua `lib/viewport.ts`.

### Kiểm thử (Chromium giả lập, safe-area giả lập thật qua CDP `Emulation.setSafeAreaInsetsOverride`)

`land.mjs`: **27/27**.

- Mở thẳng lúc ngang, và mở dọc rồi xoay ngang: bố cục **giống hệt**.
- Xoay qua lại 3 lần, reload khi đang ngang: vẫn giống hệt.
- Mở/đóng bàn phím: phục hồi đúng như cũ.
- Chat, Hồ sơ, Ngân hàng, Bạn bè: nền tràn viền, icon/nút nằm ngoài notch, không tràn ngang.
- Phòng Tài Xỉu: nút Quay lại và bàn chơi nằm ngoài vùng an toàn.
- Giả lập PWA iPhone (932×430).
- iPad ngang và desktop 1366: không đổi.

Hồi quy cũng qua: bàn phím 29/29, OrientationGuard 105/105, responsive 320/320, mỹ phẩm/multiplayer 37/37.

**Chưa xác minh trên iPhone thật:** Chromium không tái hiện được lỗi chiều cao lúc mở PWA ngang của iOS. Phần sửa dựa trên `screen` đã có unit test và E2E giả lập, nhưng cần thử trên máy thật.

## B. Một tên duy nhất: tên hiển thị = @username

### Quy tắc

- Tên tài khoản dài **3–20 ký tự**, chỉ gồm **chữ Latin, số và `_`**, có **ít nhất một chữ cái**. Tên toàn số bị cấm vì đăng nhập coi chuỗi toàn số là UID.
- Không trùng, không phân biệt hoa thường. Không trùng với tên đang hiển thị của tài khoản cũ.
- Không dùng tên chính thức (Keyo Support/Admin/Owner…).
- `@` chỉ để hiển thị, không lưu vào username.
- Lỗi trả về: `name_invalid` (400), `name_reserved` (409), `username_taken` (409).

### Các đường ghi tên (backend thực thi, frontend chỉ gợi ý)

| Luồng | Thay đổi |
|---|---|
| Đăng ký | Chỉ một ô "Tên tài khoản". Kiểm tra quy tắc, tên dành riêng và trùng, rồi ghi `username = display_name` trong cùng transaction. Không còn `player_<random>`. |
| Admin tạo UID đặc biệt | Một ô tên, đồng bộ cả hai. Không còn `uid_<UID>`. Giữ nguyên RBAC/cấp UID. |
| Đổi tên bằng thẻ / lượt miễn phí | Một transaction: khóa user → kiểm tra tên trùng → kiểm tra cooldown → trừ thẻ (nếu cần) → ghi cả hai → audit `account.rename`. Lỗi ở bất kỳ bước nào (kể cả hai người tranh cùng tên) thì không đổi gì và không mất thẻ. Cooldown 60 ngày và giá thẻ giữ nguyên. |
| **Admin đổi tên (mới)** | `POST /api/admin/users/:uid/rename`. Quyền mới `users.rename` (Owner và Super Admin), phải nhập lại mật khẩu. Không được tự đổi tên mình, không được đổi tên người cùng hoặc cao hơn cấp (nên **Owner 1002 được bảo vệ**), không đổi được Keyo Support/tài khoản đã xóa. Audit `user.rename` gồm UID, tên cũ, tên mới, người thực hiện, lý do, thời điểm. |
| Owner CLI `create-owner` | Một tên cho cả hai. |
| `PATCH /api/me` | Vẫn cấm đổi tên (như cũ). |

- **Chống race:** unique index `users_username_lower_idx` sẵn có quyết định khi hai yêu cầu cùng tên.
- **Chặn cứng ở DB (migration `0036_account_name_sync`):** trigger từ chối mọi INSERT, hoặc UPDATE chạm vào tên, khiến hai trường của người chơi lệch nhau. Trigger cũng tự đặt `username_lower`.
  - Tài khoản cũ đang lệch **không bị đổi** và vẫn hoạt động bình thường (đăng nhập, ví, trang bị…), cho tới lần đổi tên tiếp theo.
  - Tài khoản đã xóa và Keyo Captain (UID 1000) được miễn.
- **Hiển thị:** đổi tên phát sự kiện identity qua WebSocket. Danh sách, chat và hồ sơ nhận ngay; phiên của chính người bị đổi tên tự tải lại `/api/me`, không cần đăng nhập lại.
  - Bàn bài và Blackjack ghép tên từ DB mỗi lần cập nhật.
  - Bảng xếp hạng có cache 30 giây.
  - Lịch sử tài chính và audit không bị sửa: chúng tham chiếu theo user/UID.
- **Đăng nhập:** UID và email đã xác minh như cũ. Đăng nhập bằng tên cũng được (tên mới thay tên cũ). Phiên gắn với tài khoản nên không bị đăng xuất khi đổi tên.

### Tài khoản hiện có: kiểm tra và chuẩn hóa (chưa chạy trên Production)

```bash
pnpm --filter @casino/server names:audit                                   # chỉ đọc
pnpm --filter @casino/server names:sync --operator TÊN                     # chạy thử (dry run)
pnpm --filter @casino/server names:sync --operator TÊN --execute           # pg_dump trước, rồi một transaction
```

- Chỉ đặt `@username = tên hiển thị` khi tên hiển thị hợp lệ, không thuộc tên dành riêng và không trùng với ai. **Tên người khác nhìn thấy không đổi.**
- Tên không hợp lệ (có dấu cách, có dấu, quá ngắn hoặc dài), tên trùng và tên dành riêng được liệt kê để người chơi tự đổi (lượt miễn phí) hoặc admin đổi giúp.
- **Owner 1002 và Keyo Support 1000 không bao giờ bị đổi tự động.** Owner tự đổi bằng lượt đổi tên của mình.
- Mỗi tài khoản có một bản ghi audit `account.name_sync`. Chạy lại lần hai không đổi thêm gì.
- Chạy thử trên DB cục bộ: 7 người chơi; 4 tài khoản sẽ được đồng bộ; 2 có tên không hợp lệ cần tự chọn; Owner 1002 được liệt kê riêng.

### Kiểm thử

- Server **340/340**, trong đó có `accountNameSync.test.ts` mới (13 test):
  - đăng ký (hợp lệ, trùng, không hợp lệ, dành riêng, đăng ký đồng thời);
  - đổi tên (đồng bộ, giữ phiên, audit; thất bại không mất thẻ; hai người tranh một tên);
  - tài khoản cũ được đồng bộ khi đổi tên; Owner tự đổi tên và vẫn giữ quyền;
  - admin đổi tên (cần nhập lại mật khẩu, audit, chặn Admin/Owner/Keyo Support/tự đổi);
  - trigger; `names-audit`/`names-sync`.
- `migrations.test.ts`: chạy 0036 không đổi dữ liệu cũ; chặn ghi lệch; rollback chỉ gỡ trigger.
- Web 18/18. Test mới kiểm mọi key i18n tĩnh có trong vi và en; nó đã phát hiện lỗi chuỗi đổi tên ở Hồ sơ bị đặt sai chỗ (đang hiện key thô trên Production) và đã sửa.
- E2E trên trình duyệt `names.mjs`: **13/13** (đăng ký qua UI, tên trùng, đổi tên ở Hồ sơ, người khác thấy tên mới, admin đổi tên cập nhật trang người chơi đang mở, Owner không đổi).

## Triển khai (cần phê duyệt; chưa làm)

**Thứ tự đề xuất: backend → frontend.**

1. **Backend** (`keyo-game/server:<tag mới>`):
   - Có migration 0036 (chỉ thêm trigger, không đổi dữ liệu). Server phải khởi động lại để chạy migration.
   - Làm trước: `pg_dump -Fc` và thử khôi phục vào DB tạm.
   - **Lưu ý:** image production hiện là `pr28-fix36`, không có trong repo. Phải kiểm tra `SELECT count(*), max(created_at) FROM drizzle.__drizzle_migrations` (mong đợi 36 dòng, 0000–0035) để chắc VPS không có migration riêng trùng số 0036.
   - Sau deploy: kiểm tra `SELECT count(*) FROM pg_trigger WHERE tgname = 'users_name_sync'` = 1, và tổng ví không đổi.
2. **Frontend** (`keyo-game/web:<tag mới>`): chỉ thay container `web` (`compose up -d --no-deps --no-build web`), như hướng dẫn ở `docs/DEPLOY_FRONTEND_UI_KB.md`.
   - Nếu chỉ deploy frontend mà chưa có backend mới: sửa landscape và i18n có tác dụng ngay. Nút "Đổi tên tài khoản" trong Admin sẽ báo lỗi, và đăng ký vẫn tạo `player_…` như cũ cho tới khi backend lên.
3. **Chuẩn hóa tài khoản cũ** (`names:sync --execute`): bước riêng, chỉ sau khi Owner xem báo cáo `names:audit` và duyệt.

## Rollback

- **Frontend:** `KEYO_IMAGE_TAG=<tag web cũ> compose up -d --no-deps --no-build web`.
- **Backend — BẮT BUỘC làm cả hai bước, theo thứ tự:**
  1. Gỡ trigger **trước**: `psql -v ON_ERROR_STOP=1 -f apps/server/drizzle/rollback/0036_account_name_sync.down.sql`, rồi xóa dòng 0036 trong `drizzle.__drizzle_migrations`. Chỉ gỡ trigger, không đổi dữ liệu.
  2. Deploy lại image server cũ.

  Lý do: code cũ đăng ký với `username = player_…` khác tên hiển thị, và đổi tên chỉ ghi `display_name`. Nếu trigger còn, **cả đăng ký lẫn đổi tên đều bị từ chối**.
- **`names:sync`:** khôi phục từ file `pg_dump` tạo ngay trước khi chạy (đường dẫn có trong báo cáo JSON), hoặc đổi tên lại từng tài khoản theo audit.
- Không bao giờ `docker compose down -v` hay `volume prune`.
