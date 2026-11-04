# Build và chạy Keyo Game V7.1 độc lập trên VPS (không ảnh hưởng V7.0)

V7.1 chỉ thay **frontend** (React/TypeScript, Phaser). Backend, API, WebSocket, database, luật chơi và kinh tế giữ nguyên, nên frontend V7.1 dùng được với chính backend mà môi trường V7.1 đang có. Không cần migration và không cần đổi Nginx.

## Nguồn
- Nhánh: `feat/hd-game-ui`. Commit cụ thể xem trong báo cáo bàn giao, hoặc chạy `git log -1 origin/feat/hd-game-ui`.
- Không dùng Unity.

## Cách 1 (khuyên dùng): chỉ thay frontend của môi trường V7.1 đang có
Làm theo `docs/V71_DEPLOY.md`:
1. Chạy `inspect-v71.sh`. Script chỉ đọc: xác định domain, container hoặc thư mục, backend và database của V7.1.
2. Chạy `deploy-v71-web.sh`. Script:
   - từ chối nếu đích là Production;
   - build trong worktree riêng, giới hạn 1,5 CPU và 2 GB RAM;
   - sao lưu bản cũ, thay file, kiểm tra qua HTTPS;
   - ghi script rollback.

Có hai chế độ:
- `V71_DEMO=1`: chỉ giao diện, dữ liệu giả ngay trong trình duyệt, không giao dịch nào.
- `V71_DEMO=0`: chỉ cho phép khi backend V7.1 báo `dataMode: test` và dùng database khác Production. Script tự kiểm tra hai điều kiện này.

## Cách 2: build tay (khi cần kiểm tra trước)
```bash
git clone --branch feat/hd-game-ui https://github.com/corgistudious/casino-pixel-online-.git keyo-v71-src
cd keyo-v71-src
docker run --rm --cpus 1.5 --memory 2g -v "$PWD":/w -w /w \
  -e CI=1 -e KEYO_COMMIT="$(git rev-parse HEAD)" -e VITE_API_URL="" -e VITE_PWA_BLOCK=off -e VITE_DEMO=1 \
  node:22-alpine sh -c 'corepack enable && pnpm install --frozen-lockfile --filter "@casino/web..." && pnpm --dir apps/web build'
# Kết quả: apps/web/dist (index.html + assets). Chép vào thư mục hoặc container web của V7.1, không chép vào /opt/keyo-game.
```
- Bỏ `-e VITE_DEMO=1` chỉ khi V7.1 có backend test riêng (xem cách 1).
- `VITE_PWA_BLOCK=off` cho phép thử "Thêm vào MH chính". Production giữ cấu hình riêng.

## Điều không được làm
- Không deploy lên `play.keyogame.com`, không merge vào nhánh chính.
- Không restart hay đụng container, image, Nginx, database hoặc volume của Production (`/opt/keyo-game`, compose project `keyo-game`).

## Rollback
- Cách 1: `bash <đường dẫn rollback-…sh>`, in ra ở cuối lần triển khai.
- Cách 2: chép lại bản backup đã lưu trước khi thay file.
