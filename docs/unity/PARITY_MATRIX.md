# Feature parity matrix: Unity + React hybrid vs. current React

Status per the master prompt:

| Status | Meaning |
|---|---|
| Implemented | Code exists |
| Tested | Automated tests exist |
| Passed | Tests ran and passed (where) |
| Blocked | Cannot proceed yet (why) |
| Not Implemented | Not started |

Nothing is marked Passed without a test run. Unity-engine code stays **Blocked** until GameCI builds it, because it can't be compiled in this environment.

Updated: milestone 1 (branch `unity/webgl-foundation`).

## Foundation

| Feature | Owner | Status | Evidence / note |
|---|---|---|---|
| Gateway protocol (`res`/`event`, `{type,id}`) | Unity core | Implemented, Tested, **Passed** | `dotnet test`: ProtocolTests |
| Auth handshake, reconnect with back-off, 4001 → session expired | Unity core | Implemented, Tested, **Passed** | ConnectionTests |
| Heartbeat and dead-socket detection; foreground probe (iOS resume) | Unity core | Implemented, Tested, **Passed** | ConnectionTests |
| No resend; unknown outcome → resync | Unity core | Implemented, Tested, **Passed** | ConnectionTests, TableStateTests (BetGuard) |
| Event ordering and dedupe for shared tables (seq, phase) | Unity core | Implemented, Tested, **Passed** | TableStateTests |
| Countdown in server time | Unity core | Implemented, Tested, **Passed** | TableStateTests |
| VI/EN from the same source as React; key coverage | Unity core | Implemented, Tested, **Passed** | LocalizerTests, I18nCoverageTests, CI freshness check |
| Adaptive quality Low/Medium/High/Auto with hysteresis | Unity core | Implemented, Tested, **Passed** | AdaptiveQualityTests (logic only; benchmark on devices pending) |
| Viewport Manager (settled sizes, bounded re-checks, keyboard-stable, no loop) | Template JS | Implemented, Tested, **Passed** | `node --test`: 6 tests. **On-device check still pending** |
| Device tier and Unity support from capabilities (not UA) | Template JS | Implemented, Tested, **Passed** | `node --test` |
| WebSocket transports (jslib, .NET), `HostBridge` | Unity | Implemented | **Blocked**: compile in GameCI |
| `KeyoApp` bootstrap, safe area, quality apply | Unity | Implemented | **Blocked**: GameCI |
| WebGL build settings (Brotli, hashed names, 1 GB heap cap, no threads) | Unity Editor | Implemented | **Blocked**: GameCI + licence secrets |
| Staging hosting (Caddy/Nginx snippets) | Ops | Implemented | Not deployed |
| React host (iframe, bridge, fallback) | React | Not Implemented | Milestone 2 |

## Games (Unity)

Rules are unchanged; the backend decides every result.

| Game | Status | Note |
|---|---|---|
| Tài Xỉu (shared table) | Implemented (milestone-1 UI, no HD art) | **Blocked**: GameCI build, then staging test with real backend |
| Roulette (shared table) | Not Implemented | Reuses TableState / BetGuard |
| Sic Bo solo (`sicbo.roll`) | Not Implemented | |
| Slots (`slots.spin`) | Not Implemented | |
| Blackjack solo (`blackjack.*`) | Not Implemented | |
| Blackjack 5 ghế (`bjt.*`) | Not Implemented | |
| Poker / Liêng / Xì Tố (`card.*`) | Not Implemented | |
| Lobby, game and room selection, private rooms | Not Implemented | |

## React screens (kept; restyling to the HD design later, logic unchanged)

Auth, Email verification, Recovery, Chat (Server/Guild/Private), Friends, Guild, Profile, Bank, Market/Inventory/Collection, Mailbox, Giftcode, Missions, VIP, Rank, Leaderboard, Frames, Achievements, Support Hub, Settings, Admin (22 pages): **unchanged**, all working as today.

## Not yet verifiable in this environment

- Unity compile, EditMode/PlayMode and WebGL build: need the GameCI licence secrets.
- FPS, RAM, download size, startup time and viewport recovery: need a build and real devices (iPhone, Android, iPad, PC).
- The iOS standalone landscape black band: see `docs/IOS_PWA_LANDSCAPE_STARTUP.md`. Unity draws inside the same window as the page, so it **cannot** fix an iOS-short window by itself. The PWA block (PR #30) still applies.
