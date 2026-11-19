# Touchline

An offline-first football management simulation for Android, built with web technologies.
Manage one of 20 fictional clubs through a complete 38-match league season: set lineups and tactics,
trade players, handle your inbox and finances, and simulate matches instantly.

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS, Dexie (IndexedDB) for saves, Capacitor 8 for the Android APK.
Landscape only. No network access or permissions required.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/engine/` | Pure TypeScript game logic - no UI or DB imports (data generation, fixtures, match simulation, transfers, finance, AI, inbox, season flow) |
| `src/db/` | Dexie/IndexedDB persistence (diff-based saves, load, delete) |
| `src/ui/` | React UI: store, shared components, nine main screens, dialogs |
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
npm test               # engine + persistence tests (full 38-week season)
npm run build          # type-check + production web build
```

### Building the APK locally

Requires JDK 21 and the Android SDK (`ANDROID_HOME` set, platform 36).

```bash
npm run android:debug  # vite build + cap sync + gradle assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Regenerate launcher icon and splash screens with `npm run assets` (needs Python + Pillow).

## Phase 1 scope notes

- One career save slot; starting a new career replaces it.
- A career is one 38-matchday season. Promotion/relegation, further seasons and contract expiry rollover are
  deliberately left for a later phase (the table, fixtures and club model are structured to support them).
- Loans run until the end of the season.
- Transfer windows: matchdays 1-5 and 19-23.
