# KEYO GAME V7.1 — Tích hợp 252 asset vào game

Nhánh: `feat/hd-game-ui` · Không merge main · Không deploy Production · Không SSH VPS · Không sửa database · Không gọi OpenAI Image API (chi phí tạo ảnh đợt này: **$0**).

Bảng trạng thái từng asset: [`INTEGRATION.md`](./INTEGRATION.md) (sinh tự động từ `apps/web/src/assets/keyo/integration.json` và kết quả kiểm tra trên trình duyệt).

## 1. Kiểm kê
- Master Asset Manifest: 279 mục = 9 asset có sẵn (EXISTING_APPROVED, không đụng tới: Cxu Bạc, Cxu Vàng, Verified, Partner, Rename Card, logo…) + **270 asset studio USER_APPROVED** = **252 asset đợt thư viện** + 18 asset mẫu đã duyệt trước đó.
- File gốc: 270/270 có trong repo (`assets/studio/generated/<id>/v<n>/source.png`, đúng phiên bản mới nhất: v2 cho 6 asset làm lại, 6 asset chỉnh lề, avatar đã cắt tròn; v3 cho bánh xe roulette). Không asset nào chỉ nằm trong artifact GitHub Actions → không cần tải về.
- Định dạng: PNG nguồn (nền trong suốt 257/270; 13 ảnh nền đặc: felt, banner sự kiện, header/background hồ sơ). Không có sprite sheet trong đợt này (hiệu ứng là ảnh đơn, chuyển động bằng tween Phaser/CSS).
- Provenance: tạo bằng OpenAI Image API từ prompt trong manifest, tranh gốc, không dùng tài nguyên bên thứ ba, không logo thương hiệu thật, không người thật.
- Trùng lặp: id duy nhất (test `delivery.test.mjs`); không hai vật phẩm catalog dùng chung một ảnh (test `keyoAssets.test.ts`).

## 2. Kiến trúc (dùng lại cơ chế có sẵn)
| Thành phần | Ở đâu | Ghi chú |
|---|---|---|
| Asset Manifest | `assets/studio/manifest.json` | nguồn duy nhất, có trạng thái duyệt |
| Xuất bản web + versioning | `tools/asset-studio/src/export-web.mjs` | WebP 128/256/512 (vuông) hoặc 512/1024 (ngang/dọc); tên file chứa hash nội dung → URL mới mỗi phiên bản; cache Caddy hiện có (`/assets/<thư mục>/` 1 ngày) giữ nguyên |
| Asset Registry | `apps/web/src/assets/keyo/registry.generated.ts` | kiểu `KeyoAssetId`: id sai thì không biên dịch được (phát hiện import hỏng) |
| Asset Loader | `apps/web/src/assets/keyo/index.tsx` | chọn file nhỏ nhất đủ nét theo kích thước × DPR; `KeyoImg`, `KeyoFit`, `SliceFrame` (9-slice) |
| Lazy loading | `loading="lazy"` + `decoding="async"` | Shop, Hồ sơ, Sự kiện chỉ tải ảnh đang hiển thị |
| Preload bàn chơi | `apps/web/src/game/assetTextures.ts` + `art.ts preloadOverrides` | mỗi scene chỉ tải texture của nó trong `preload`; ảnh phụ thuộc dữ liệu (huy hiệu VIP người ngồi, mặt sau bài, hiệu ứng hiếm) tải lười khi cần |
| Error fallback | mọi component | file lỗi → hiện lại bản vẽ bằng code (Phaser: texture procedural cùng key) |
| Ánh xạ dữ liệu → ảnh | `apps/web/src/assets/keyo/bindings.ts` | VIP, vật phẩm catalog, skin bàn, mùa sự kiện, quà, thành tích, rương thư |
| Giải phóng tài nguyên | `PhaserView` → `game.destroy(true)` | texture bị huỷ khi rời bàn; listener loader dùng một lần, không cộng dồn |

Không đổi: luật chơi, xác suất, kết quả (server), số dư, ledger, hitbox/vùng cược, giá bán, độ hiếm, quyền sở hữu, chính sách chặn PWA, cache.

## 3. Những gì KHÔNG tích hợp và vì sao (READY_FOR_FUTURE_USE)
Các asset này đã được xuất bản và nằm trong registry, nhưng game chưa có tính năng/vật phẩm tương ứng; tạo vật phẩm hoặc gameplay mới cần Owner duyệt (thay đổi database/gameplay). Owner có thể dùng chúng ngay trong **Admin › Vật phẩm › "Thư viện Keyo"** (ảnh đi qua luồng upload có sẵn; chỉ tạo khi Owner bấm lưu).
- Slots: crown / scatter / gold bar (thêm biểu tượng = đổi bảng trả thưởng), cabinet frame (ô cửa không khớp lưới 5×3 nếu không đổi bố cục). Sic Bo dice set (mặt xúc xắc phải khớp kết quả từng viên).
Số lượng trong 252 asset thư viện (trong ngoặc: tính cả 18 asset mẫu):
- Avatar 10 (10): server chỉ nhận avatar 0–15 và chưa có vật phẩm avatar.
- Khung 11 (12), khung chat 6 (6), danh hiệu 12 (12), mặt sau bài 3 (5), vật sưu tầm 21 (22), hiệu ứng chiến thắng 2 (2), accent "limited" 1, quà cao cấp 1: chưa có vật phẩm/dữ liệu tương ứng.
- Game 4 (5): Slots scatter / gold bar (+ crown mẫu), cabinet frame; Sic Bo dice set.
- Vòng quay may mắn 4, Lễ Tạ Ơn 5 (khung Easter/Thanksgiving nằm trong mục khung): game chưa có tính năng/mùa này.
- UI 4: panel nhận thưởng/tiến độ, thông báo, bảng tin — chưa có màn hình tương ứng.

## 4. Kiểm thử
Xem mục "Kết quả kiểm thử" trong báo cáo gửi Owner (cập nhật theo lần chạy thực tế).
