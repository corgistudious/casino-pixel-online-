# Keyo Game — review of requested changes

## Included in this staged source copy
- Official supplied transparent logo at `apps/web/public/assets/official/keyo-game-logo.png`.
- Official supplied rename card artwork at `apps/web/public/assets/official/rename-card.png`.
- `KeyoLogo` component uses supplied logo.

## Not yet implemented — do not deploy as the requested full feature update
- Optional email registration and activation without email. Current server registration requires email and sets pending_verification.
- UID/email login: current server login uses username/email; UID login must be implemented server-side.
- First rename free; 60-day cooldown; consumable rename card priced at 300 gold, atomic purchase/use. Current profile PATCH allows unlimited free displayName changes.
- Registration receipt PNG and first-login onboarding age/avatar.

## Production safety
This source is for review/staging only. Do not replace production directly. Existing user data, special UIDs and database must be preserved. Migrations and full regression tests required before deployment.
