---
name: keyo-asset-studio
description: Plan, generate (OpenAI Image API via GitHub Actions), validate, preview and hand over KEYO GAME art assets with a persistent budget ledger. Use for any request to create, revise, review or integrate game/cosmetic/event art for Keyo Game.
---

# Keyo Asset Studio

Production asset pipeline for KEYO GAME. Code: `tools/asset-studio/`. Data: `assets/studio/`.
Guides: `docs/asset-studio/ART_DIRECTION.md`, `docs/asset-studio/README.md`.

## Hard rules (never break)
- Never print, log or commit `OPENAI_API_KEY`. Paid generation runs only in GitHub Actions
  (`.github/workflows/keyo-asset-studio.yml`), never from a local session.
- Budget: every paid run is capped by its request budget AND the remaining approved budget in
  `assets/studio/budget-ledger.json` (persisted; never reset or edit it downward). Approved total is
  `APPROVED_TOTAL_USD` in `src/config.mjs`; only the user raises it. No paid auto-retry
  (`maxRetries: 0`), no automatic variants, no top-ups.
- Never set `USER_APPROVED` or `INTEGRATED` yourself; only the user approves (`cli.mjs review`).
- Never regenerate, overwrite, rename or move `EXISTING_APPROVED` assets (Cxu Bạc/Vàng, badges,
  rename card, logo) or anything `USER_APPROVED` / `INTEGRATED`.
- Never change gameplay, economy, VIP perks, DB data or item ownership while integrating art.
- Work only on branch `feat/hd-game-ui`; never merge to main or deploy.

## Workflow
1. Audit / manifest: `cd tools/asset-studio && npm ci && node src/cli.mjs audit && node src/cli.mjs manifest`.
2. Add or edit assets in `src/catalog.mjs` (structured fields: object, materials, camera,
   composition, size, transparent, priority, batch). Prompts are built by `src/prompt.mjs` with the
   shared style in `src/style.mjs`. One distinct prompt per asset; never generic.
3. Dry run (free): `node src/cli.mjs run --dry-run --batch <b> --budget <usd>` → plan + estimate.
4. Paid run: commit a request file `assets/studio/requests/<date>-<name>.json`:
   `{ "id": "...", "mode": "generate", "batch": "sample-1", "batchSize": 20, "budgetLimitUsd": 5, "model": "auto", "quality": "high", "approvedBy": "<user>", "note": "..." }`
   and push to `feat/hd-game-ui` (or use workflow_dispatch once the workflow is on the default
   branch). Report the estimate to the user BEFORE pushing a generate request.
5. The workflow commits back: `assets/studio/generated/<id>/v<n>/{source.png,optimized.webp}`,
   manifest/ledger updates, contact sheets in `assets/studio/previews/`, reports in
   `docs/asset-studio/`. Pull, look at every contact sheet yourself, and report honestly (visual
   defects, wrong text, style drift) — technical checks do not judge aesthetics.
6. User review: `node src/cli.mjs review <id> approve|revise|reject "note"` (user's decision).
7. Integrate only USER_APPROVED assets, behind the existing rendering (e.g. `ASSET_OVERRIDES` in
   `apps/web/src/game/art.ts`, cosmetic upload ≤1024 px / ≤1 MB), with responsive/hitbox e2e tests.

## Models and pricing
Model ids are verified from the official SDK typings (`node_modules/openai/resources/images.d.ts`)
and re-checked by the free CI probe (`assets/studio/reports/probe.json`). `gpt-image-1` is retired
(2026-10-23). Pricing in `assets/studio/pricing.json` stays `verified: false` (pessimistic) until the
user confirms the official prices; then update it and set `verified: true`.
