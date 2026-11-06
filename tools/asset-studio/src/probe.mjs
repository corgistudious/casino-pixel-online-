import fs from 'node:fs';
import path from 'node:path';
import { MODEL_PREFERENCE, PATHS, RETIRED_MODELS } from './config.mjs';

const PRICING_URLS = ['https://developers.openai.com/api/docs/pricing', 'https://openai.com/api/pricing/', 'https://platform.openai.com/docs/pricing'];

/**
 * Free checks before any paid call: which image models this API key can use (models.list) and an
 * attempt to read the official pricing page (excerpts saved for the human to confirm prices).
 */
export async function probe(client) {
  const out = { at: new Date().toISOString(), imageModels: [], preferred: null, pricing: [] };
  if (client) {
    try {
      const ids = [];
      for await (const m of client.models.list()) ids.push(m.id);
      out.imageModels = ids.filter((id) => /image|dall-e/.test(id)).sort();
      out.preferred = MODEL_PREFERENCE.find((m) => ids.includes(m)) ?? null;
      out.retiredSeen = out.imageModels.filter((m) => RETIRED_MODELS.includes(m));
    } catch (e) {
      out.modelsError = `${e?.status ?? ''} ${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 200)}`.trim();
    }
  } else out.modelsError = 'no API key in this environment';
  for (const url of PRICING_URLS) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'keyo-asset-studio/1.0 (pricing check)' }, signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      const plain = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const hits = [];
      for (const m of plain.matchAll(/gpt-image[\w.-]*/g)) hits.push(plain.slice(Math.max(0, m.index - 120), m.index + 360));
      out.pricing.push({ url, status: res.status, excerpts: hits.slice(0, 24) });
    } catch (e) {
      out.pricing.push({ url, error: String(e?.message ?? e) });
    }
  }
  fs.mkdirSync(PATHS.reports, { recursive: true });
  fs.writeFileSync(path.join(PATHS.reports, 'probe.json'), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}
