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

## Phase 3 (current)

- **Domestic cup** (Touchline Cup): 56 clubs enter round 1 (4 byes), six knockout rounds on Wednesdays, draws three days ahead,
  extra time and penalty shoot-outs, prize money, cup stats and a bracket screen.
- **International football:** 14 national teams (one per nationality), Elo rankings, friendlies, a 6-matchday qualifying table and a
  12-team tournament (World Cup / Continental Championship alternate every other summer) with groups, quarter-finals, semi-finals and final.
  AI nations call up the best available players; the user can manage a nation alongside the club job (squad call-ups, lineup, tactics).
- **Advanced tactics:** five mentalities, pressing, defensive line, tempo, width, passing style, counter-attack, set-piece and corner
  routines, 24 player roles with suitability, presets and tactical familiarity (training and repeat use build it, changes cost it).
  The match report has a Tactics tab explaining which factors decided the game.
- **Manager career:** reputation (clubs and international), experience, history, trophies, achievements, tactical identity, contracts,
  extensions, resignation, dismissal, a vacancy market with interviews, job offers in the inbox. AI managers are hired, sacked and poached.
- **Media and news:** pre/post-match interviews, transfer questions and promises with real consequences (morale, asking prices,
  press relationship, broken promises), plus a world news feed (bounded to 300 items).
- **Economy:** TV, sponsor, kit, merchandise, season tickets, ticket pricing and attendance, instalments, interest on debt, points
  deductions for deep debt, weekly projection, club owner profiles that steer AI recruitment.
- **Stadium, facilities, staff:** construction projects with real costs, durations and planning limits; nine staff roles with attributes,
  wages and contracts that change training, injuries, scouting, youth intake and match preparation. AI clubs hire and invest too.
- **Relationships and contracts:** hierarchy, leadership group, friendships, rivalries, dressing-room harmony, playing-time expectations,
  transfer requests, expiry notices (180/90/30 days), appearance/goal/clean-sheet/loyalty bonuses and scheduled wage rises.
- **Scouting:** regional and global assignments, report accuracy from scouts and network level, personality and tactical-suitability notes,
  signing recommendations and a shortlist comparison.
- **History:** champions, cup winners, international champions, all-time scorers, season records, transfer records and manager records (all bounded).
- **Saves:** Phase 1 and Phase 2 careers migrate automatically (`migrateToV2`, `migrateToV3` in `src/engine/migrate.ts`).

### Tests

```bash
npm test    # engine, tactics, cups, international, managers, economy, Phase 3 interactions, persistence, migration (Phase 1 -> 3)
npm run build && node scripts/test-ui.mjs   # headless landscape UI walk through every screen, match, reload
```

### Known limitations

- **No continental club competition.** The world has a single country's league structure and only 14 nationalities, so
  international *national-team* tournaments exist but club tournaments across countries do not.
- Only 14 national teams exist (one per nationality in the database); qualification is a single table rather than regional groups.
- Players are fictional; no real-player import.
- The APK is a debug build signed with a fixed, committed debug key. Builds from Phase 2 onward share that key and update each other.
  The APK has been built in CI and the web UI tested in a headless browser, but installation on a physical Android device has not been verified.
- One career save slot. No multiplayer or online features.

## Phase 2

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

## Manager profile, save slots and real club names

- **Manager profile**: choose name, age, nationality, background (former professional, academy coach, tactical analyst, lower-league journeyman) and preferred style. Background sets starting tactics/motivation/youth attributes, reputation and experience; the style sets your starting tactical preset. Attributes grow with success and affect tactical quality, press/morale effects and youth development.
- **Save slots**: 6 independent careers (one IndexedDB database per slot). Slot 1 keeps the original database name, so earlier saves appear there automatically. Load/Manage screen shows manager, club, season and date, and allows deleting a slot.
- **Real club names**: new worlds use real club names for all three tiers (names only; no licences). Badges and kits are generated, and players and managers stay fictional. Existing saves keep their old fictional names. Untick "Real club names" in the profile screen for the fictional world.

## Usability

- **Save and close**: the in-game Menu (bottom of the left bar, or the Android back button) has Save game, Save and quit to menu, Save and close the game, and Back up to file. Every action is also saved automatically, and the game saves when it goes to the background.
- **Quick-sim**: from the arrow next to CONTINUE choose "Quick-sim..." to play 1 week / 1 month / 3 months, to a chosen date, or to the end of the season. Your lineup is auto-repaired when invalid, inbox offers are not answered while simming, and it stops if you are dismissed or a new season starts.
- **Backup**: "Back up to file" (or Export on the saves screen) writes a compressed `.tlsave` and opens the Android share sheet (a download in a browser). "Import from file" on Load / Manage Saves restores it into any slot, replacing that slot.
- **Club editor** (Club > Editor): rename clubs, change city, stadium, colours and badge shape; share or import a club database file (`.tlclubs`, matches clubs by id).
- **Settings** (title screen or Menu): text size (normal/large/extra large), dark or light theme, colour-blind palette (blue/orange/yellow), reduce motion.
- New plugins: `@capacitor/app` (back button, exit), `@capacitor/filesystem` and `@capacitor/share` (backup files).
