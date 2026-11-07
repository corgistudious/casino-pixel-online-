/**
 * Inventory of the library assets not wired into the game (READY_FOR_FUTURE_USE). Read-only: reads
 * the Master Asset Manifest and apps/web/src/assets/keyo/integration.json, writes
 * docs/keyo-assets/unused-84-assets.{md,csv} and a contact sheet. Changes nothing in the game.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PATHS } from './config.mjs';

const OUT_DIR = path.join(PATHS.repo, 'docs/keyo-assets');
const integration = JSON.parse(fs.readFileSync(path.join(PATHS.repo, 'apps/web/src/assets/keyo/integration.json'), 'utf8'));
const registry = fs.readFileSync(path.join(PATHS.repo, 'apps/web/src/assets/keyo/registry.generated.ts'), 'utf8');

const GROUPS = [
  ['Game / Table / Card Back', (id) => id.startsWith('game.') || id.startsWith('cardback.')],
  ['VIP / Avatar Frame / Avatar', (id) => id.startsWith('frame.') || id.startsWith('avatar.') || id.startsWith('vip.')],
  ['Profile / Chat Bubble / Title', (id) => id.startsWith('profile.') || id.startsWith('bubble.') || id.startsWith('title.')],
  ['Banking / Reward Chest', (id) => /^(bank|chest|reward)\./.test(id)],
  ['Item / Collectibles', (id) => id.startsWith('collectible.')],
  ['Tournament / Events', (id) => id.startsWith('tournament.') || id.startsWith('event.')],
  ['Achievement / System UI', (id) => id.startsWith('achievement.') || id.startsWith('ui.')],
  ['Khác: Hiệu ứng / Vòng quay', () => true],
];

const CLASSES = {
  A: 'Có chức năng sẵn nhưng chưa kết nối UI',
  B: 'Có thể đưa vào Shop/Inventory bằng luồng hiện có',
  C: 'Cần cơ chế trang bị hoặc mở khóa mới',
  D: 'Chỉ phù hợp cho sự kiện tương lai',
  E: 'Chưa xác định cách sử dụng / cần tính năng mới',
};

/** Proposal per asset: [class, suitable feature, can attach now?]. Based on what the code supports today. */
function proposal(id) {
  const [g, ...rest] = id.split('.');
  const sub = rest.join('.');
  if (g === 'avatar') return ['B', 'Vật phẩm avatar (kind "avatar", ô trang bị avatar đã có — như Vương Giả): Admin › Vật phẩm › Thư viện Keyo, rồi bán ở Cửa hàng / trao qua Thư', 'Gắn ngay được sau khi Owner tạo vật phẩm'];
  if (g === 'frame' && /seasonal\.(easter|thanksgiving)/.test(sub)) return ['D', `Khung bộ sưu tập mùa ${sub.split('.')[1]} khi game có mùa này`, 'Cần thêm mùa sự kiện (SEASON_THEMES) trước'];
  if (g === 'frame' && sub === 'tournament.top-100') return ['B', 'Khung thưởng giải đấu Top 100 (vật phẩm frame, trao qua Thư/phần thưởng mùa)', 'Gắn ngay được sau khi Owner tạo vật phẩm'];
  if (g === 'frame') return ['B', 'Khung avatar (vật phẩm frame): Cửa hàng, hoặc Owner trao thủ công qua Thư (founder/KOL/creator/reviewer…)', 'Gắn ngay được sau khi Owner tạo vật phẩm'];
  if (g === 'bubble') return ['B', 'Khung chat (vật phẩm chat_bubble): Cửa hàng / Thư / Bộ sưu tập', 'Gắn ngay được sau khi Owner tạo vật phẩm'];
  if (g === 'title') return ['B', 'Danh hiệu (vật phẩm title): Cửa hàng / phần thưởng giải đấu, thành tích, sự kiện qua Thư', 'Gắn ngay được sau khi Owner tạo vật phẩm'];
  if (g === 'cardback') return ['B', 'Mặt sau lá bài (vật phẩm card_back) cho Poker/Liêng/Xì Tố', 'Gắn ngay được sau khi Owner tạo vật phẩm'];
  if (g === 'collectible') return ['B', 'Vật phẩm sưu tầm (kind "collectible"): Cửa hàng, Kho, Trưng bày hồ sơ, Giao dịch; hoặc thêm vào Shop quà (gift catalog) qua Admin › Quà', 'Gắn ngay được sau khi Owner tạo vật phẩm / quà'];
  if (g === 'fx') return ['C', 'Hiệu ứng chiến thắng (victory_effect) — hiện hiệu ứng chỉ vẽ bằng code theo danh sách cố định, chưa nhận ảnh tải lên', 'Cần sửa code VictoryEffect để nhận ảnh, rồi tạo vật phẩm'];
  if (id === 'game.slots.cabinet-frame') return ['A', 'Khung máy Slots (bàn Slots đã có)', 'Cần chỉnh bố cục cuộn/khung trong scene Slots (không đổi gameplay)'];
  if (id === 'game.sicbo.dice-set') return ['A', 'Mặt xúc xắc Sic Bo / Tài Xỉu (texture die-1…6, khớp đúng kết quả server) sau khi cắt bảng thành 6 mặt', 'Gắn được: cắt ảnh (không tốn phí) + khai báo texture; không đổi gameplay'];
  if (g === 'game') return ['E', 'Biểu tượng Slots mới (scatter / gold bar) — thêm vào cuộn = đổi tỉ lệ & bảng trả thưởng', 'Cần thay đổi gameplay (Owner quyết định)'];
  if (g === 'event') return ['D', 'Bộ sự kiện Lễ Tạ Ơn (banner, icon, rương, huy hiệu, trang trí)', 'Cần thêm mùa sự kiện Lễ Tạ Ơn trước'];
  if (g === 'spin') return ['E', 'Vòng quay may mắn (wheel, kim, vé, nút)', 'Cần tạo tính năng mới (tỉ lệ thưởng, giới hạn lượt, ledger)'];
  if (id === 'profile.accent-limited') return ['A', 'Dấu nhấn hồ sơ cho người sở hữu vật phẩm giới hạn (khu dấu nhấn cạnh tên đã có)', 'Cần quy tắc dữ liệu: thế nào là "giới hạn"'];
  if (id === 'reward.premium-gift') return ['A', 'Quà tân thủ / quà cao cấp: hộp chào mừng, nhóm quà premium trong Shop quà', 'Gắn được bằng thay đổi UI nhỏ'];
  if (id === 'ui.notification') return ['A', 'Biểu tượng thư chưa đọc / thông báo trên thanh điều hướng', 'Gắn được bằng thay đổi UI nhỏ'];
  if (id === 'ui.claim-panel') return ['A', 'Khung popup nhận thưởng (Hộp thư, Điểm danh, Nhiệm vụ)', 'Gắn được bằng thay đổi UI (popup nhận thưởng)'];
  if (id === 'ui.progress-panel') return ['A', 'Khung tiến độ (Nhiệm vụ, Bộ sưu tập, VIP)', 'Gắn được bằng thay đổi UI'];
  if (id === 'ui.announcement') return ['E', 'Bảng tin / thông báo hệ thống', 'Cần tạo tính năng bảng tin'];
  return ['E', '—', 'Chưa xác định'];
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

export async function unusedReport({ log = console.log } = {}) {
  const manifest = JSON.parse(fs.readFileSync(PATHS.manifest, 'utf8'));
  const byId = Object.fromEntries(manifest.assets.map((a) => [a.id, a]));
  const ids = Object.entries(integration).filter(([, e]) => e.wave === 'library' && e.status === 'READY_FOR_FUTURE_USE').map(([id]) => id);
  // Cross-check with the manifest: every one exists, is approved, and is a library (non-sample) asset.
  for (const id of ids) if (!byId[id] || byId[id].status !== 'USER_APPROVED') throw new Error(`${id} not an approved manifest asset`);
  const web = (id) => new RegExp(`'${id.replace(/\./g, '\\.')}':.*?512: '([^']+)'`).exec(registry)?.[1] ?? '';
  const rows = [];
  for (const [group, test] of GROUPS) {
    for (const id of ids.filter((i) => !rows.some((r) => r.id === i) && test(i)).sort()) {
      const a = byId[id];
      const [cls, feature, now] = proposal(id);
      rows.push({ id, name: a.name, group, source: a.sourceFile, web: `apps/web/public/${web(id)}`, status: integration[id].status, why: integration[id].why, feature, now, cls });
    }
  }
  if (rows.length !== ids.length) throw new Error('grouping lost rows');
  rows.forEach((r, i) => (r.n = i + 1));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // CSV (UTF-8 BOM so Excel shows Vietnamese correctly).
  const head = ['STT', 'Asset ID', 'Tên asset', 'Nhóm', 'File nguồn', 'File web (512)', 'Trạng thái', 'Lý do chưa gắn', 'Tính năng phù hợp', 'Gắn ngay / cần chức năng mới', 'Phân loại', 'Ý nghĩa phân loại'];
  const csv = [head, ...rows.map((r) => [r.n, r.id, r.name, r.group, r.source, r.web, r.status, r.why, r.feature, r.now, r.cls, CLASSES[r.cls]])].map((l) => l.map(csvCell).join(',')).join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'unused-84-assets.csv'), `﻿${csv}\n`);

  // Markdown.
  const count = (f) => rows.filter(f).length;
  const md = [
    '# 84 asset thư viện chưa gắn vào game (READY_FOR_FUTURE_USE)',
    '',
    `Nguồn: \`assets/studio/manifest.json\` (Master Asset Manifest) + \`apps/web/src/assets/keyo/integration.json\` (Integration Mapping) · Tạo lúc ${new Date().toISOString()} bằng \`node tools/asset-studio/src/cli.mjs unused-report\`.`,
    '',
    `Đối chiếu: ${ids.length} asset có wave = library và status = READY_FOR_FUTURE_USE; cả ${ids.length} đều USER_APPROVED trong manifest. 252 thư viện = 168 đã gắn + ${ids.length} chưa gắn. (5 asset mẫu READY khác thuộc 18 asset mẫu, không nằm trong danh sách này.)`,
    '',
    'Đây chỉ là kiểm kê và đề xuất: không asset nào được gắn, không vật phẩm nào được tạo, không thay đổi database.',
    '',
    '## Tổng hợp',
    '',
    '| Phân loại | Ý nghĩa | Số asset |',
    '|---|---|---|',
    ...Object.entries(CLASSES).map(([k, v]) => `| ${k} | ${v} | ${count((r) => r.cls === k)} |`),
    `| | **Tổng** | **${rows.length}** |`,
    '',
    '| Nhóm | Số asset |',
    '|---|---|',
    ...GROUPS.map(([g]) => `| ${g} | ${count((r) => r.group === g)} |`).filter((l) => !l.endsWith('| 0 |')),
    '',
    '- **Tận dụng ngay (B, 66 asset nếu đúng như bảng):** Owner tạo vật phẩm trong Admin › Vật phẩm, chọn ảnh ở ô "Thư viện Keyo"; hiển thị, trang bị, bán và trao qua Thư dùng luồng có sẵn.',
    '- **Cần thay đổi UI nhỏ (A):** tính năng đã có, chỉ cần nối giao diện.',
    '- **Cần phát triển thêm (C, D, E):** cơ chế mới, mùa sự kiện mới, hoặc tính năng mới hoàn toàn.',
    '',
    'Ảnh: [`unused-84-contact-sheet.png`](./unused-84-contact-sheet.png) · Bảng tính: [`unused-84-assets.csv`](./unused-84-assets.csv)',
    '',
  ];
  for (const [g] of GROUPS) {
    const rs = rows.filter((r) => r.group === g);
    if (!rs.length) continue;
    md.push(`## ${g} (${rs.length})`, '', '| STT | Asset ID | Tên asset | File | Trạng thái | Lý do chưa gắn | Tính năng phù hợp | Gắn ngay / cần chức năng mới | Loại |', '|---|---|---|---|---|---|---|---|---|');
    for (const r of rs) md.push(`| ${r.n} | \`${r.id}\` | ${r.name} | \`${r.source}\`<br>\`${r.web}\` | ${r.status} | ${r.why} | ${r.feature} | ${r.now} | ${r.cls} |`);
    md.push('');
  }
  const realB = count((r) => r.cls === 'B');
  fs.writeFileSync(path.join(OUT_DIR, 'unused-84-assets.md'), md.join('\n').replace('(B, 66 asset nếu đúng như bảng)', `(B, ${realB} asset)`));

  await contactSheet(rows, path.join(OUT_DIR, 'unused-84-contact-sheet.png'));
  log(`unused report: ${rows.length} assets → docs/keyo-assets/ (md, csv, contact sheet)`);
  return rows;
}

async function contactSheet(rows, out) {
  const COLS = 8;
  const CELL = 220;
  const IMG = 168;
  const LABEL = 46;
  const HEAD = 56;
  const W = COLS * CELL;
  const H = HEAD + Math.ceil(rows.length / COLS) * (CELL + LABEL - 20);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#120a1f"/><text x="14" y="36" font-family="DejaVu Sans, Arial" font-size="24" fill="#ffe08a">KEYO — 84 asset chưa gắn (READY_FOR_FUTURE_USE) · STT · Asset ID · loại A–E</text>`;
  for (const [i, r] of rows.entries()) {
    const x = (i % COLS) * CELL;
    const y = HEAD + Math.floor(i / COLS) * (CELL + LABEL - 20);
    svg += `<rect x="${x + 6}" y="${y}" width="${CELL - 12}" height="${CELL + LABEL - 32}" rx="10" fill="${(i % 2) ? '#1d1233' : '#211539'}"/>`;
    svg += `<text x="${x + CELL / 2}" y="${y + IMG + 30}" text-anchor="middle" font-family="DejaVu Sans Condensed, DejaVu Sans, Arial" font-size="${r.id.length > 28 ? 10 : 12}" fill="#ffffff">${r.n}. ${esc(r.id)}</text>`;
    svg += `<text x="${x + CELL / 2}" y="${y + IMG + 48}" text-anchor="middle" font-family="DejaVu Sans, Arial" font-size="12" fill="#c8b8e8">loại ${r.cls}</text>`;
    const img = await sharp(path.join(PATHS.repo, r.source)).resize(IMG, IMG, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    parts.push({ input: img, left: x + (CELL - IMG) / 2, top: y + 8 });
  }
  svg += '</svg>';
  await sharp(Buffer.from(svg)).composite(parts).png({ compressionLevel: 9 }).toFile(out);
}
