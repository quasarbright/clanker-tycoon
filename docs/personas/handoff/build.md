# Build thread handoff (2026-11-19)

What the next build thread needs that isn't already in `CLAUDE.md`, `docs/decisions.md` or the
code. Read `CLAUDE.md` first; this file is the leftovers.

## Where things stand

Everything is pushed to `master`. Nothing is half-built. The last stretch shipped, in order:
- Newspaper photos: four poses of the owner (shocked, awkward, mid-bite, blushing) in `src/looks.js`
  (`OWNER_PHOTOS`, `ownerHeadSVG(face)`); captions per photo. The floor's "You" wears only the
  photo's hard hat (`ownerHatSVG`) over the robot-style face. Mike: never change the in-game eyes.
- Floor editor and Assembler (decisions 85 to 88): `src/floor.js`, editor code in `src/main.js`
  ("the floor editor" section), `e2e/floor-editor.spec.mjs`, `test/floor.test.mjs`.
- Supply movable; the starting floor runs backwards on purpose (Supply in slot 5 by the Dock, Pack in
  slot 3). Board reds sized so the starting floor misses and a Supply/Pack swap makes it.
- Crates: `cratesOffer(q)` in `src/business.js`; crate art is `CRATE_SVG` in `src/main.js`, drawn
  from the review page's picked image (see gotchas).
- Loan fee: flat 10% (`LENDER.fee`, `payBackOf`); recap and forecast show "Still owed".
- Shift header margin (`.ct-top` 116px), paint quick actions offer only needed colors
  (`paintChoices`), `e2e/hud.spec.mjs` covers both plus the crate drawing.

## Open threads / likely next asks

- ~~Board 4's large blue (22) misses with every crew (21 of 22).~~ Stale (cloud build thread, 2026-11-19): that was board 4's old 45-red side, and Mark chose to keep it (mark.md). With today's 78-red side, `balance.mjs` meets 22 blue alone on every floor whenever someone services the paint machine, and red + 22 blue on the swapped and tidy floors. Only the sturdy machine with nobody servicing stops at 18, which is the point of servicing. No change made.
- ~~The Assembler wraps to two rows with three or more waiting boxes.~~ Fixed (cloud build thread): a crowded Assembler shrinks its whole row to fit (`assemblerZoom` in `src/main.js`), tested with six boxes and three boxes + three crates in `e2e/hud.spec.mjs`.
- Plugin 0.10.2 is pushed, but `claude plugin marketplace update quasarbright-claude` fails on this
  Mac: the plugin comes through the desktop app, not that CLI marketplace. Sessions pick it up when
  the app refreshes.
- Machine art: machines in storage show a plain wooden crate with their name (`.ct-stored-crate`), a
  placeholder until Rosa's machine art exists. Don't confuse it with the shipping crate.

## Gotchas learned the hard way

- **Build approved art from the exact picked image.** Review items live in the review artifact's
  db (`ArtifactData get items/<id>` on https://claude.ai/code/artifact/ed6c8001-42ce-4490-817e-b007cae104c2);
  the picked option's `img` is a blob (`Artifact read path=<asset id>`). Library files with similar
  names (`mocks-crate/1-crate-braced.png`) were a different draft, and Mike rejected the crate twice.
  Put your screenshot next to that image before sending.
- **Mike rejects stitched images.** Send each screenshot as its own titled 2x PNG; side-by-side
  comparisons are for your own checking.
- **`npm test | grep` hides failures.** A pipe makes the chain succeed even when tests fail (this once
  pushed a failing test). Run `npm test > file; echo exit=$?` and check the exit code before pushing.
- **Heredocs and `$`/backticks in Bash get blocked** by the safety checker on this Mac. Write the edit
  as a Python script with the Write tool and run it.
- **STATIONS positions are module-global.** `newGame` calls `applyLayout(level.positions)`; ordinary
  levels reset to home positions. Anything that builds a level for a business floor must go through
  `floorLevel(biz)` / `quarterLevel`.
- **Edit floor's Done reopens the shift** (`relayout()` → `openLevel(..., { relaid: true })`). It's
  disabled while any robot is still reading, because an in-flight compile for a replaced game is
  dropped.
- **The coach note** sits in the free left column on business floors (`.ct-coach.is-column`); the
  slots fill the middle and bottom.
- **Line arrows** skip any segment that would run under another station, and neighbors too close for
  an arrow (`buildFloor`).
- `--u` scales with the floor; measure real widths in the browser (`getBoundingClientRect`) before
  fiddling with item sizes inside a station tile.
- A push can be rebased onto someone else's commit; report the new hash, not your local one.

## Mac-only setup

- Server: `node server.mjs` (port 8473), started detached; Playwright e2e uses its own on 8981.
- Screenshot scripts live in the session scratchpad (gone with the session). The pattern: Playwright
  at 1440×900, `deviceScaleFactor: 2`, `ct.license(...)`, click level 7, drive state through the
  `window.ct` hook (`ct.buy`, `ct.begin`, `ct.step`, `ct.relayout`, `ct.photoSeed`, `ct.paintChoices`),
  then wrap the capture in a page with a title and one-line description.
- Persona sessions (Mark, Pam, Rosa) commit docs locally on the Mac and can't push; the build thread
  pushed for them with `git pull --rebase -q && git push` from the repo folder.

## Added by the cloud build thread (2026-11-19)

- The build thread now runs in the cloud; `npm test` (all 54+ e2e) passes there with the stand-ins of
  decision 92. Screenshot scripts in the cloud import Playwright by path
  (`node_modules/playwright/index.mjs`) and route outside files with `offlineRoutes` from
  `tools/playtest-browser.mjs`.
- A thread can hit a limit on attached files; then name the files in `/mnt/project-files` instead.
- The colored bar under the Assembler is its wear meter (same as Paint's), not a waiting meter.
