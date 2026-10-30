# Cửa hàng mỹ phẩm theo mùa & hiển thị trong multiplayer

Nhánh `feat/seasonal-cosmetics`, xếp chồng trên `feat/leaderboards-frames` (PR #27 → #26 → #25 → #24).
Không triển khai VPS, không chạy migration trên Production — cần Owner duyệt.

## 1. Mô hình dữ liệu (dùng lại hệ thống có sẵn)

- **Không có hệ thống mua/trang bị thứ hai.** Mọi vật phẩm là một dòng `catalog_items`. Mua đi qua `buyItem` → `grantItem` (kho đồ `inventory_items`) → `applyDelta` (ví + sổ cái). Trang bị đi qua `equip`/`effectiveEquipment`.
- Thêm 2 loại/ô: `table_skin` (giao diện bàn), `victory_effect` (hiệu ứng thắng). Cột `users.equipped_table_skin`, `users.equipped_victory_effect`.
- `catalog_items.price_gold`. Một vật phẩm có tối đa **một** giá (ràng buộc `catalog_items_one_price`).
- Thư viện nội dung: `packages/shared/src/cosmeticLibrary.ts` (id, tên/mô tả VI-EN, độ hiếm, game tương thích, thông số artwork). Artwork vẽ bằng canvas/vector gốc (`apps/web/src/cosmetics/*`), không dùng ảnh pixel, không dùng placeholder.
- Migration `0035_seasonal_cosmetics.sql` (+ `rollback/0035_seasonal_cosmetics.down.sql`) seed 55 vật phẩm và 8 bộ sưu tập **draft**. Migration **không đụng** 24 khung theo mùa, chỉ chuyển chúng từ `draft` sang `released` để người khác vẽ được. Việc bán vẫn chỉ đi qua bộ sưu tập đã duyệt.

| Loại | Cơ bản | Theo mùa | Hiển thị |
|---|---|---|---|
| Giao diện bàn | Classic Green (mặc định, miễn phí), Royal Gold, Midnight Purple, Emerald Palace, Diamond Lounge | Haunted Casino, Winter Casino, New Year Gala, Lunar Palace, Rose Lounge, Tropical Casino, Moon Palace, Keyo Royal Hall | **Cá nhân** |
| Hiệu ứng thắng | Golden Shower, Diamond Sparkle, Royal Crown, Firework Burst, Lucky Stars, Emerald Aura | Ghostly Jackpot, Snowfall Celebration, Midnight Fireworks, Fortune Rain, Heart Celebration, Summer Splash, Lunar Glow, Anniversary Jackpot | **Cá nhân** |
| Mặt lưng bài | (đã có: Classic, Sapphire, Jade, Vương Giả) | Haunted Cards, Snowflake Cards, Midnight Countdown, Lucky Red, Ruby Hearts, Ocean Breeze, Moonlight Cards, Anniversary Edition | Công khai (theo **chủ bài**) |
| Bong bóng chat | Classic Gold, Royal Purple, Diamond Blue, Emerald Glow | Pumpkin Whisper, Christmas Gift, New Year Sparkle, Lucky Lantern, Sweet Message, Sunny Wave, Moon Lantern, Celebration Gold | Công khai (theo người gửi) |
| Danh hiệu | (đã có) | Halloween Royalty, Winter Star, New Year Champion, Xuân Phú Quý, Heart Collector, Summer Star, Moonlight Guardian, Anniversary Legend | Công khai |
| Khung | 24 khung theo mùa của Thư viện khung (dùng lại, không ghi đè) | | Công khai |

## 2. Hiển thị trong multiplayer

- **Giao diện bàn**: mỗi client vẽ nền bàn từ skin **của chính người xem** (`viewerTableSkin()` trong `BaseScene`, đọc từ session). Skin không bao giờ nằm trong trạng thái phòng và không được broadcast. Hồ sơ công khai không có ô cá nhân.
- **Một bố cục cho mỗi game**: `oval` (Poker, Liêng, Xì Tố), `arc` (Blackjack đơn & bàn 5 ghế), `board` (Tài Xỉu, Roulette). Skin chỉ thay nỉ/hoa văn/viền/ánh sáng. Vùng bấm, vị trí cửa cược, chia bài, timer, kết quả và tỉ lệ trả thưởng giữ nguyên (cùng tọa độ). Skin không hỗ trợ một game thì dùng Classic Green.
- **Hiệu ứng thắng**: `celebrateWin(roundKey)` chỉ chạy khi client đã nhận kết quả **server đã kết toán** của chính mình, và thắng > cược. Chống phát lại bằng `sessionStorage` (reload, reconnect, retry, re-render không phát lại). Một hiệu ứng một lúc, ~2,2 s, `pointer-events: none` nên không che nút. Có đường giảm chuyển động riêng. Tắt được trong Cài đặt. Không ảnh hưởng kết toán.
- **Mặt lưng bài**: lấy theo **chủ ghế** (`CardSeatView.cardBack`), người xem nào cũng thấy cùng một mặt lưng cho cùng một ghế. Chưa trang bị thì dùng mặt mặc định. Không gửi giá trị bài ẩn. Blackjack chỉ có lá úp của nhà cái nên dùng mặt mặc định.
- **Bong bóng/Danh hiệu/Khung**: theo người sở hữu, ở Chat Server, Guild, DM và chat phòng (các kênh có sẵn, không thêm kênh mới).
- Server luôn kiểm tra quyền sở hữu khi trang bị (`not_owned`). Danh hiệu không cấp quyền RBAC. Tên dạng Owner/Super Admin/Admin/Moderator/Verified bị chặn (`RESERVED_TITLE_PATTERN`).

## 3. Bộ sưu tập theo mùa

- Bảng `cosmetic_collections` (id theo năm, vd. `halloween_2026`; thời gian bắt đầu/kết thúc; múi giờ; `approved_at/by`; `ended_at`; `rerun_of`) và `collection_items` (giá + loại tiền theo bộ sưu tập).
- Trạng thái suy ra: `draft` (chưa duyệt) → `scheduled` → `active` → `ended` (theo ngày, hoặc kết thúc sớm).
- **Chỉ Owner duyệt mở bán** (kiểm tra vai trò ở service; Super Admin bị từ chối). Mọi thay đổi (`collection.save/approve/end/rerun`) ghi audit.
- Vật phẩm thuộc bất kỳ bộ sưu tập nào **chỉ** bán qua bộ đang `active`. Không mua trước giờ mở hoặc sau giờ đóng.
- Kết thúc: dừng bán. Người đã mua vẫn giữ và trang bị được: không xóa kho đồ, không hoàn tiền, không sửa sổ cái. Thông tin "sở hữu vĩnh viễn" và khung thời gian hiện trước khi mua.
- Năm sau: "Tạo bản năm sau" tạo draft mới (`halloween_2027`) với cùng vật phẩm. Không ghi đè năm trước. Thêm sự kiện mới chỉ cần thêm dữ liệu (theme + vật phẩm), không sửa lõi.

## 4. Mua hàng (server quyết định)

`POST /api/shop/buy {itemId, expectedPrice?, expectedCurrency?}`:
1. `saleOffer` trên server: giá của bộ sưu tập đang `active`, hoặc giá cửa hàng. Vật phẩm role/draft không bao giờ bán.
2. Khác giá client đang thấy → `gift_price_changed`, không trừ tiền. Server luôn trừ theo giá của mình.
3. Một transaction: `grantItem` (`onConflictDoNothing`; đã có → `already_owned`, không trừ) rồi `applyDelta` (ví đủ hay không, khóa dòng ví). 5 yêu cầu đồng thời → đúng 1 lần mua, 1 lần trừ.

"Trang bị cả bộ" (`POST /api/me/equip-set`): chỉ trang bị món đã sở hữu, không tự mua, trả về danh sách còn thiếu. Đang đeo khung đặc quyền thì giữ nguyên trừ khi người chơi xác nhận thay.

## 5. Giao diện

- **Chợ Xa Hoa** (`/market`): tab Bộ sưu tập, Khung, Mặt lưng bài, Danh hiệu, Bong bóng chat, Giao diện bàn, Hiệu ứng thắng. Lọc theo mùa, độ hiếm, đang bán, đã sở hữu, yêu thích. Nhãn "Chỉ bạn nhìn thấy"/"Mọi người nhìn thấy". Hộp xem trước:
  - bàn mẫu với từng bố cục;
  - nút "▶ Phát thử" hiệu ứng;
  - hai lá bài;
  - đoạn chat mẫu;
  - danh hiệu trên hồ sơ mini;
  - khung trên avatar.
  
  Xem trước không trừ tiền và không gửi sự kiện game. Mua cần xác nhận hai bước.
- **Bộ sưu tập** (`/collection`): mọi vật phẩm đã sở hữu theo loại (gồm bàn và hiệu ứng), lọc theo mùa, trang bị/tháo, nguồn và hạn dùng.
- **Admin → Bộ sưu tập mùa** (`/admin/collections`, quyền `items.read`/`items.manage`): xem trạng thái, sửa tên/thời gian/múi giờ/giá/loại tiền, duyệt (Owner), kết thúc sớm, tạo bản năm sau. Các thao tác ghi đều yêu cầu nhập lại mật khẩu. **Admin → Vật phẩm** có thêm giá Vàng.
- iPhone ngang dùng biến thể `short:` (max-height 520px). Ảnh trong `docs/previews/seasonal-cosmetics/`.

## 6. Kiểm thử

- `apps/server/test/seasonalCosmetics.test.ts`: seed, chặn giá, đồng thời, vòng đời bộ sưu tập, rerun, danh hiệu cấm, ô cá nhân không lộ, trang bị cả bộ, phủ khóa ngoại.
- E2E hai tài khoản (Playwright, dữ liệu thử cục bộ): xem báo cáo PR.

## 7. Deploy & rollback

- Deploy: `pg_dump -Fc` trước. Server tự chạy 0035. Sau deploy, Owner mở `/admin/collections`, kiểm tra ngày/giá rồi bấm duyệt từng bộ.
- Rollback ứng dụng: deploy lại image cũ. Code cũ bỏ qua các cột/bảng mới.
- Rollback DB (chỉ khi cần gỡ hẳn): `psql -v ON_ERROR_STOP=1 -f drizzle/rollback/0035_seasonal_cosmetics.down.sql`, rồi xóa dòng 0035 trong `drizzle.__drizzle_migrations`. Rollback xóa bảng bộ sưu tập và các vật phẩm mới **chưa ai sở hữu**. Vật phẩm đã mua, kho đồ và sổ cái được giữ nguyên. Người đang dùng giao diện bàn/hiệu ứng chỉ đơn giản là không thấy nữa. Không dùng `docker compose down -v` hay `volume prune`.
