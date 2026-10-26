# Keyo Game — bản vá đăng ký/đăng nhập, đổi tên, logo

## Có trong bản vá
- Đăng ký: tên hiển thị, mật khẩu, xác nhận; email tùy chọn. Tên hiển thị là tên hồ sơ; username nội bộ sinh ngẫu nhiên để tránh xung đột.
- Đăng nhập: UID hoặc email **đã xác minh**; username cũ vẫn đăng nhập được để tương thích.
- Sau đăng ký: đăng nhập bằng token trả về; hiển thị UID, tải ảnh thẻ tài khoản PNG **không chứa mật khẩu**, yêu cầu tuổi trước khi vào game.
- Hồ sơ: đổi tên lần đầu miễn phí; sau đó 60 ngày giữa các lần đổi miễn phí; dùng 1 thẻ để bỏ qua thời gian chờ.
- Cửa hàng: thẻ đổi tên giá 300 Cxu Vàng; debit ledger và tăng số thẻ trong cùng transaction, khóa user row; thẻ được tiêu thụ trong transaction đổi tên.
- Logo Keyo Game và icon thẻ đổi tên từ ảnh người dùng.

## BẮT BUỘC trước khi triển khai
1. Đây là **source patch chưa được build/test tích hợp** vì bản backup loại trừ `node_modules` và **toàn bộ file `.sql` của Drizzle migrations**. Không triển khai trực tiếp gói này lên Production.
2. Trên VPS, sao lưu PostgreSQL trước, và giữ nguyên bản source/migrations thực tế trên VPS. Không chạy `launch-production`, `reset-test-data` hoặc chạy lại các migration cũ.
3. Kiểm tra thứ tự migration thực tế. `KEYO_MANUAL_MIGRATION_0018.sql` là migration bổ sung idempotent, phải chạy riêng có kiểm soát trước khi bật server patch. Không tự chép vào journal Drizzle khi chưa đối chiếu migration history.
4. Chạy `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build` trong bản staging với đúng Node/pnpm dự án, và kiểm thử đăng ký UID/email, xác minh email, rename miễn phí, cooldown, mua/tiêu thụ thẻ, giao dịch đồng thời.
5. Phải triển khai backend+frontend+schema đồng bộ, tránh lỗi SQL khi `toPublicUser` gọi bảng mới.

## Giới hạn cần lưu ý
- Thẻ đổi tên lưu tại bảng `keyo_rename_cards` (inventory chức năng chuyên biệt), hiển thị trong Hồ sơ và Cửa hàng; chưa hòa chung với catalog_items/inventory_items chung.
- Độ tuổi được hỏi ở màn hình sau đăng ký; hiện không lưu ngày sinh hay kiểm tra danh tính. Người dùng có thể bỏ qua giao diện nếu gọi API trực tiếp; cần quy tắc xác thực tuổi phù hợp trước khi ra mắt rộng.
- Đăng ký có email vẫn cho phép vào game ngay; email chưa xác minh không dùng để đăng nhập/khôi phục cho đến khi xác minh. Các phần thưởng gắn với xác minh email giữ nguyên.
- Đổi tên hiển thị chỉ thông qua `/api/me/rename`; `/api/me` PATCH không cho đổi tên trực tiếp.
- Dữ liệu Owner/Support, UID và số dư không được chỉnh trong bản vá.
