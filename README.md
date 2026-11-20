# Touchline

An offline-first football management simulation for Android, built with web technologies.
Manage one of 20 fictional clubs through a multi-season career across three divisions: set lineups and tactics,
trade players, handle your inbox and finances, and simulate matches instantly.

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS, Dexie (IndexedDB) for saves, Capacitor 8 for the Android APK.
Landscape only. No network access or permissions required.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/engine/` | Pure TypeScript game logic - no UI or DB imports (data generation, fixtures, match simulation, transfers, finance, AI, inbox, season flow) |
| `src/db/` | Dexie/IndexedDB persistence (diff-based saves, load, delete) |
| `src/ui/` | React UI: store, shared components, seventeen screens, dialogs |
| `scripts/` | Headless tests (`test-engine.ts`, `test-persistence.ts`) and icon/splash generator |
| `android/` | Capacitor Android project (landscape-locked, immersive, no permissions) |
| `.github/workflows/android.yml` | CI: type-check, tests, web build, APK build, artifact + rolling release |

## Getting the APK

Every push to `main` runs GitHub Actions and produces an installable debug APK:

1. Open the **Actions** tab, pick the latest *Build Android APK* run, download the **Touchline-debug-apk** artifact, or
2. Download `Touchline-debug.apk` from the rolling **latest** release on the Releases page.

Copy it to your phone and install it (allow "install unknown apps" for your file manager/browser).

## Development

```bash
npm install
npm run dev            # web dev server (use a landscape viewport)
npm test               # engine + persistence + migration tests
npm run build          # type-check + production web build
```

### Building the APK locally

Requires JDK 21 and the Android SDK (`ANDROID_HOME` set, platform 36).

```bash
npm run android:debug  # vite build + cap sync + gradle assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Regenerate launcher icon and splash screens with `npm run assets` (needs Python + Pillow).

## Phase 2 (current)

- **Calendar:** every match has a real date (2026/27 starts 1 Aug 2026). Time advances day by day (Continue, +1 day, +3 days, +1 week,
  to next match). Matches are played on their scheduled day; all other leagues' matches are simulated on their dates.
  The Calendar screen has month/week/day views with colour-coded events (matches, transfer windows, training, injuries,
  contracts, board meetings, scouting, youth).
- **Three divisions** (60 clubs): Premier, Championship, League 1 with 3 up / 3 down, per-league fixtures and tables.
  Seasons roll over on 1 July (contracts, ageing, loans, retirements, youth intake, new fixtures, prize money).
- **Transfers:** instalments, sell-on clauses, release clauses, loan with option/obligation to buy, agent fees, promised roles,
  player refusals (ambition, role), rival interest, deadline-day activity and smarter AI clubs.
- **Scouting, youth academy, training and medical** (injuries in days, facility levels), **player development and decline**,
  **personalities** (professionalism, ambition, loyalty, leadership, adaptability), **board objectives, confidence and job security**
  (you can be dismissed and take another job), **history** (season reviews, awards, club records).
- **Inbox** is the first menu item. While you are on the Inbox, the main button reads the next unread message instead of advancing time.
- **Saves:** Phase 1 careers are migrated automatically on first load (see `src/engine/migrate.ts`, tested by `scripts/test-migration.ts`).

### Tests

```bash
npm test                      # engine (2 full seasons, 3 leagues), persistence (incl. rollover), Phase 1 -> Phase 2 migration
npm run build && node scripts/test-ui.mjs   # headless landscape UI smoke test (needs Playwright + Chromium)
```

### Known limitations

- The APK is a debug build signed with a fixed, committed debug key. Builds from Phase 2 onward share that key and update each other.
  The Phase 1 APK was signed with a throwaway key, so Android will refuse to install Phase 2 over it: uninstall Phase 1 once.
  (Uninstalling deletes the on-device save; the Phase 1 -> Phase 2 save migration therefore only applies to web/PWA saves or future updates.)
- The APK has been built in CI and the web UI tested in a headless browser, but installation on a physical Android device has not been verified.
- One career save slot. No cup competitions, international football, press conferences or multiplayer.
