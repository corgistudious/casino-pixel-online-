import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.mjs';
import { loadManifest, summarize } from './manifest.mjs';
import { loadLedger, loadPricing, remainingUsd, spentUsd } from './budget.mjs';

const md = (rows) => rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`).join('\n');

/** Human-readable reports in docs/asset-studio (regenerated after every run). */
export function writeReports() {
  const m = loadManifest();
  const s = summarize(m);
  const ledger = loadLedger();
  const pricing = loadPricing();
  fs.mkdirSync(PATHS.docs, { recursive: true });

  // Master manifest (full list).
  const cats = [...new Set(m.assets.map((a) => a.category))];
  let out = `# Master Asset Manifest (generated)\n\nNguồn dữ liệu: \`assets/studio/manifest.json\` (sinh từ \`tools/asset-studio/src/catalog.mjs\`). Tổng **${s.total}** asset.\n\n`;
  out += `## Theo trạng thái\n\n| Trạng thái | Số |\n|---|---|\n${md(Object.entries(s.byStatus))}\n\n## Theo nhóm\n\n| Nhóm | Số |\n|---|---|\n${md(Object.entries(s.byCategory))}\n\n`;
  for (const c of cats) {
    out += `## ${c}\n\n| ID | Tên | Hệ thống | Kích thước | Alpha | Ưu tiên | Batch | Trạng thái | Ước tính (USD) |\n|---|---|---|---|---|---|---|---|---|\n`;
    out += `${md(m.assets.filter((a) => a.category === c).map((a) => [a.id, a.name, a.system, a.resolution ?? '-', a.transparency ? 'yes' : 'no', a.priority, a.batch ?? '', a.status, a.costEstimateUsd?.toFixed(2) ?? '0']))}\n\n`;
  }
  fs.writeFileSync(path.join(PATHS.docs, 'MANIFEST.md'), out);

  // Budget.
  const ok = ledger.entries.filter((e) => e.ok);
  let b = `# Budget Tracking (generated)\n\n- Ngân sách đã duyệt: **$${ledger.approvedTotalUsd}**\n- Đã tính vào ngân sách: **$${spentUsd(ledger).toFixed(4)}** (chi phí thật từ token usage khi API trả về; nếu không có thì tính theo ước tính trần)\n- Chi phí thật theo token usage × bảng giá ${pricing.verified ? 'đã xác minh' : 'CHƯA xác minh'}: ${ledger.spentActualUsd ? `$${ledger.spentActualUsd.toFixed(4)}` : 'chưa có'}; tổng ước tính trần: $${ledger.spentEstimatedUsd.toFixed(2)}\n- Còn lại theo bộ đếm nội bộ: **$${remainingUsd(ledger).toFixed(2)}**\n- Ảnh đã tạo: ${ledger.images}; yêu cầu đã chạy: ${ledger.executedRequests.join(', ') || '—'}\n\n`;
  b += '> Bộ đếm nội bộ không thay thế giới hạn chi tiêu của OpenAI Platform. Số thực tế xem tại OpenAI dashboard → Usage.\n\n';
  b += `| Thời gian | Request | Asset | Model | Quality | Size | OK | Ước tính | Token usage |\n|---|---|---|---|---|---|---|---|---|\n${md(ledger.entries.map((e) => [e.at, e.requestId, e.assetId, e.model, e.quality, e.size, e.ok ? 'yes' : `no (${e.error})`, `$${(e.estimatedUsd ?? 0).toFixed(2)}`, e.usage ? `in ${e.usage.input_tokens ?? '?'} / out ${e.usage.output_tokens ?? '?'}` : '—']))}\n`;
  const planned = m.assets.filter((a) => a.status === 'PLANNED');
  b += `\n## Dự toán phần còn lại\n\n${planned.length} asset ở trạng thái PLANNED, ước tính **$${planned.reduce((t, a) => t + (a.costEstimateUsd ?? 0), 0).toFixed(2)}** theo đơn giá hiện tại của \`assets/studio/pricing.json\` (chưa gồm làm lại/biến thể).\n`;
  fs.writeFileSync(path.join(PATHS.docs, 'BUDGET.md'), b);

  // Quality.
  const gen = m.assets.filter((a) => a.validation);
  let q = `# Quality Validation (generated)\n\nKiểm tra kỹ thuật tự động (file, kích thước, alpha thật, viền trong suốt, bị cắt, tâm khung trong suốt, ảnh trống, độ nét, trùng lặp). Phần thẩm mỹ, chữ sai, lỗi hình do người duyệt quyết định.\n\n| Asset | Trạng thái | Kết quả | Lỗi | Cảnh báo | Coverage | Edge alpha | Sharpness | WebP |\n|---|---|---|---|---|---|---|---|---|\n`;
  q += md(gen.map((a) => [a.id, a.status, a.validation.ok ? 'OK' : 'FAIL', a.validation.errors.join('; '), a.validation.warnings.join('; '), a.validation.metrics.coverage, a.validation.metrics.borderAlpha, a.validation.metrics.sharpness, a.validation.optimized ? `${Math.round(a.validation.optimized.bytes / 1024)} KB` : '']));
  fs.writeFileSync(path.join(PATHS.docs, 'QUALITY.md'), `${q}\n`);
  return { manifest: 'docs/asset-studio/MANIFEST.md', budget: 'docs/asset-studio/BUDGET.md', quality: 'docs/asset-studio/QUALITY.md' };
}
