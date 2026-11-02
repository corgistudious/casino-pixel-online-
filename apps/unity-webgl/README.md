# Keyo Game: Unity WebGL frontend (Unity + React hybrid)

Owner decision (audit `docs/unity/AUDIT.md`):

- **Unity** draws the lobby, room selection and all 8 games: Poker, Liêng, Xì Tố, Blackjack 5 ghế, Roulette, Tài Xỉu, Slots, Blackjack chơi đơn.
- **React** keeps the input-heavy and admin screens: auth, Chat, Friends, Guild, Profile, Bank, Inventory, Missions, VIP, Rank, Support, Settings, Admin.
- Backend, database, rules, economy, UID/RBAC: **unchanged**.

## Architecture

```
React (apps/web) ──iframe──▶ /unity/index.html?game=taixiu&table=<id>&lang=vi   (WebGL template)
   ▲  postMessage {source:'keyo-unity'|'keyo-react'} (same origin only)    │
   │                                                                          ▼
   │                                   keyoViewport.js (verified sizes) ─▶ Unity: KeyoApp.OnViewport
   │                                                                     KeyoApp ─ KeyoConnection (1 socket)
   └──────────────── backend /ws + REST (unchanged) ◀────────────────────────────┘
```

- **One gateway connection per Unity instance.** It never re-sends a request. Bets go through `BetGuard`; an unknown outcome triggers a resync, never a retry.
- **The session is never passed in a URL or `postMessage`.** Unity reads the same-origin `cpo.token` the React app already stores. Unity never sees a password.
- **Unloading Unity = removing the iframe.** The whole WASM heap is freed (memory P0). React falls back to its existing table when the device can't run Unity (`supportsUnity`), or when Unity fails to load.

### Bridge messages

| Direction | `payload.type` | Meaning |
|---|---|---|
| Unity → React | `ready` | Unity loaded and opened the game |
| Unity → React | `connection` | Connection state changed (`state`) |
| Unity → React | `session-expired` | React shows the sign-in |
| Unity → React | `unsupported` / `load-failed` / `unsupported-game` | React keeps or shows its own table (fallback) |
| React → Unity | `locale` | Switch VI/EN |
| React → Unity | `quality` | Quality mode: `auto`, `low`, `medium` or `high` |
| React → Unity | `foreground` | App came back to the foreground: probe the socket now |

## Layout

| Path | What | Compiled / tested by |
|---|---|---|
| `Assets/KeyoGame/Core/Runtime` | Engine-agnostic core: protocol, connection state machine, table state, `BetGuard`, `AdaptiveQuality`, `Localizer`, `KeyoKeys` | Unity **and** `dotnet test` |
| `Assets/KeyoGame/Tests/EditMode` | NUnit tests (one source, two runners) | Unity Test Runner and `dotnet test` |
| `Assets/KeyoGame/WebGL` | `KeyoBridge.jslib`, transports (browser and .NET), `HostBridge` | Unity (CI) |
| `Assets/KeyoGame/Bootstrap`, `UI`, `Games/SicBo` | `KeyoApp`, uGUI helpers, safe area, Tài Xỉu table | Unity (CI) |
| `Assets/KeyoGame/Editor/KeyoBuild.cs` | GameCI build method; WebGL settings in code | Unity (CI) |
| `Assets/WebGLTemplates/Keyo` | Host page, `keyoViewport.js` (Viewport Manager) | `node --test "web-tests/*.test.mjs"` |
| `Assets/KeyoGame/Localization/Resources/keyo-i18n.json` | VI/EN generated from `packages/shared` | Freshness check in CI |
| `hosting/` | Caddy/Nginx snippets for **staging** (Brotli, cache rules) | n/a |

Unity version: **6000.0.85f1 (Unity 6 LTS)**. A GameCI image exists (`unityci/editor:ubuntu-6000.0.85f1-webgl-3`).

## Run the tests

```bash
dotnet test apps/unity-webgl/dotnet/KeyoGame.Core.Tests     # core C# (no Unity needed)
node --test "apps/unity-webgl/web-tests/*.test.mjs"        # viewport manager
pnpm --filter @casino/server exec tsx ../unity-webgl/tools/export-i18n.mts   # after changing i18n
```

## CI / build (GitHub Actions + GameCI, `.github/workflows/unity.yml`)

- The `core` job always runs.
- The `unity` job (EditMode tests and WebGL build) needs repository **secrets**. Credentials are never committed.
  - Personal licence: `UNITY_LICENSE` (contents of the `.ulf` file), `UNITY_EMAIL`, `UNITY_PASSWORD`.
  - Pro: `UNITY_SERIAL`, `UNITY_EMAIL`, `UNITY_PASSWORD`.
  - See https://game.ci/docs/github/activation
- Without the secrets, the Unity job is skipped with a warning (**BLOCKED**), not reported as passed.

## Editor (local, optional)

Open `apps/unity-webgl` with Unity 6000.0.85f1, then set the environment variables before pressing Play:

- `KEYO_WS_URL=ws://localhost:3000/ws`
- `KEYO_TOKEN=<test account token>`
- `KEYO_TABLE=<taixiu table id>`

Use a **test** server and test accounts only.
