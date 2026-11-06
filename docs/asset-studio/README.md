# Keyo Asset Studio: hướng dẫn chạy, duyệt và tích hợp

## Thành phần
| Thành phần | Vị trí |
|---|---|
| Công cụ (Node, OpenAI SDK chính thức, sharp) | `tools/asset-studio/` |
| Catalog và prompt từng asset | `tools/asset-studio/src/catalog.mjs`, `prompt.mjs`, `style.mjs` |
| Master manifest (trạng thái, phiên bản, chi phí, provenance) | `assets/studio/manifest.json` (bảng đọc được: `MANIFEST.md`) |
| Sổ ngân sách, lưu giữa các lần chạy | `assets/studio/budget-ledger.json` (báo cáo: `BUDGET.md`) |
| Bảng giá (chưa xác minh = giả định bi quan) | `assets/studio/pricing.json` |
| Ảnh gốc / ảnh giao hàng | `assets/studio/generated/<id>/v<n>/source.png`, `optimized.webp` |
| Contact sheet để duyệt | `assets/studio/previews/<nhóm>.png`, `batch-<tên>.png` |
| Báo cáo audit, probe, từng lần chạy | `assets/studio/reports/` |
| Kiểm tra chất lượng | `docs/asset-studio/QUALITY.md` |
| Skill cho Claude | `.claude/skills/keyo-asset-studio/SKILL.md` |
| Workflow | `.github/workflows/keyo-asset-studio.yml` |

## Chạy
- **Dry-run (miễn phí)**: probe model, kiểm tra manifest, ước tính chi phí, xuất contact sheet.
- **Generate (trả phí)**: chỉ chạy khi có yêu cầu rõ ràng. Mỗi lần chạy bị giới hạn bởi `budgetLimitUsd` của yêu cầu **và** số tiền còn lại trong ngân sách đã duyệt.

Hai cách kích hoạt:
1. **File yêu cầu** (dùng được ngay trên nhánh `feat/hd-game-ui`): thêm `assets/studio/requests/<ngày>-<tên>.json` rồi push.
   ```json
   { "id": "2026-11-07-vip-badges", "mode": "generate", "category": "vip", "batchSize": 12,
     "budgetLimitUsd": 5, "model": "auto", "quality": "high", "approvedBy": "owner", "note": "VIP 2-14" }
   ```
   Mỗi `id` chỉ chạy **một lần**; id được ghi vào sổ ngân sách.
2. **Actions → Keyo Asset Studio → Run workflow** (`workflow_dispatch`, có các input mode, batch, category, assets, batch_size, budget_limit, model, quality). Nút này chỉ hiện khi file workflow nằm trên nhánh mặc định. Cần anh/chị cho phép thì mới đưa lên.

Workflow tự commit ảnh, manifest, sổ ngân sách, contact sheet và báo cáo về nhánh, đồng thời tải lên artifact.

## Duyệt
1. Mở contact sheet trong `assets/studio/previews/`. Mỗi ô hiển thị asset trên nền tối và nền sáng, kèm bản thu nhỏ 128/64/44 px. Khung avatar được đặt lên một ảnh đại diện mẫu.
2. Xem `docs/asset-studio/QUALITY.md` để biết kết quả kiểm tra kỹ thuật.
3. Ghi quyết định của anh/chị (Claude không tự duyệt):
   ```bash
   cd tools/asset-studio
   node src/cli.mjs review vip.badge.vip-15 approve
   node src/cli.mjs review frame.vip.vip-15 revise "viền dày quá, giảm 20%"
   node src/cli.mjs review chest.legendary reject "trùng phong cách với epic"
   ```
   Hoặc chỉ cần nhắn ID kèm "duyệt / sửa: … / loại", Claude sẽ ghi đúng quyết định đó.
4. Asset `NEEDS_REVISION` có thể được tạo lại (phiên bản `v2`, bản cũ vẫn giữ) bằng file yêu cầu ghi rõ `"assets": ["<id>"]`.

## Tích hợp (chỉ với asset USER_APPROVED)
- Game (Phaser): thêm vào `ASSET_OVERRIDES` trong `apps/web/src/game/art.ts`. Ảnh thay thế texture vẽ bằng code cùng tên; layout và hitbox vẫn do code quyết định.
- Cosmetic (khung, bubble, danh hiệu, item): dùng `optimized.webp` (≤ 1024 px, ≤ 1 MB) qua luồng upload asset hiện có. Không đổi giá, số lượng hay quyền sở hữu.
- Sau khi tích hợp: chạy e2e (`apps/web/e2e`) để kiểm tra layout, hitbox và responsive, rồi đánh dấu `INTEGRATED`.

## Ngân sách
- Đã duyệt **$10** (`APPROVED_TOTAL_USD`). Khi hết tiền, pipeline dừng các yêu cầu trả phí và báo cáo số tiền đã dùng, số asset đã xong và dự toán phần còn lại.
- Khi anh/chị nạp thêm và duyệt hạn mức mới, tăng `APPROVED_TOTAL_USD` trong `tools/asset-studio/src/config.mjs`. Ghi rõ lý do trong commit.
- Đơn giá trong `pricing.json` đang là **giả định bi quan, chưa xác minh**: sandbox phát triển không truy cập được trang giá OpenAI. Khi anh/chị xác nhận giá thật, cập nhật file này và đặt `"verified": true`. Bộ đếm nội bộ không thay thế giới hạn chi tiêu trên OpenAI Platform; nên đặt hard limit ở đó.
