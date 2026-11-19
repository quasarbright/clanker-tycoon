# Rosa handoff (2026-11-19, local thread → cloud thread)

Everything Rosa knew that isn't already in `docs/personas/rosa.md`, the plugin's `ART.md`, or the
decision log. Read the brief first; this note fills the gaps.

## How short Rosa's history is

Rosa was set up on 2026-11-19 at Mike's request ("maybe we should have an art persona specifically
for assets, so pam can just focus on actual UI UX"). She has made **no mocks yet** and Mike has
given **no art verdicts to Rosa directly**. Every art verdict so far went through Pam, and all of
them are already recorded in Pam's log (`docs/personas/pam.md`) and in `ART.md`. Nothing is lost
by moving threads. The only things in her head are the survey below and the plans for the gaps.

## The true picked references (use these, not prose)

- **Crate:** `docs/mocks/crate/1-crate-x-braced-picked.png` (the image Mike picked) and
  `docs/mocks/crate/crates.mjs` (its source, option 1). Built in ca782ba: planks in a heavy frame,
  X brace, metal corners, a color tag, about 1.7x a box. The first two builds missed (smaller, a
  plain dot for the tag, no corner plates) and Mike saw it: "wtf is this? we just agreed on the
  crate art and it was something else", then "Still not the version you showed me that I liked".
  Pam's older text spec (3.8u × 3u, colors) is a summary; when it and the PNG disagree, the PNG wins.
- **Owner newspaper photos:** in code, `OWNER_PHOTOS` / `ownerHeadSVG` in `src/looks.js`. Mike's
  picks: classic shocked, 1 Mid-bite, 2 Blushing, 4 Awkward. 3 Glazed over is out. All share one
  head, hard hat and wall shadow.
- **License, newspaper, recap stamps:** the identity references (decision 80), in `index.html`.

## What Mike approved and rejected (art only)

- Approved: the X-braced wooden crate over a pallet of strapped boxes and a gray shipping case
  (Pam had recommended the pallet; Mike picked the crate). Reason given: the old crate was "too
  similar to box".
- Approved: owner photo expressions 1, 2, 4 ("4 is pretty funny"); rejected 3 Glazed over.
- Rejected earlier (via Pam's newspaper round): a "sad box drawing" as a newspaper image; it's a
  generic joke, not tied to a mechanic.
- On hold: **Assembler art.** Mike, 2026-11-18: "let's not do assembler art yet". It currently
  shows as a station card. Don't mock it until he asks or says go.

## Plans for the gaps (not started, no mocks yet)

1. **Machine art** (biggest gap). Each station card gets a drawing of the real machine, same
   chunky outlined style as the robot tools (`#17140a` outlines, flat fills): Supply as a widget
   hopper or chute, Pack as a packing table with a tape dispenser, Paint as a little paint booth or
   spray rig, bins as open wire or plastic bins. The name and count stay; the drawing sits inside
   the card at floor size. Readable when the editor turns cards blueprint blue (`body.is-editing`).
   The Assembler is excluded until Mike says go.
2. **Shop pictures.** The same machine drawing, small, beside each item in the Machines column
   (one renderer for floor and shop).
3. **Robot body shapes.** A few silhouettes (tall, squat, on treads) so recruits differ by more
   than color. Has to stay within "traits change the body": either tie shapes to traits, or ask
   Mike whether a shape that means nothing is OK. That's a real question for him, so put it to him
   with mocks.
4. **Your desk.** A real desk instead of a label, light touch (maybe the license pinned up). Low
   priority; check with Pam since it touches the floor layout.
5. **Crates ticket** (`src/main.js` line ~89) still draws three square dots for a crate order.
   ART.md's "one drawing per thing" says it should be the crate drawing. Send to the build thread.
6. Later: a worn machine that looks worn (not just a red border), and the robots-building-robots
   product reveal.

## Next steps for the cloud thread

- Start with the crates ticket fix (5): a small spec for the build thread, no Mike pick needed,
  since he already picked the crate.
- Then machine art mocks (1) for Supply, Pack, Paint and bins: 2 or 3 style options for one
  machine first, then the set in the picked style. Separate numbered 2x PNGs with a title and
  description, to /mnt/project-files, pending picks to Pam's review page via the coordinator.
- Keep `ART.md` current with any verdict; publish with `quasarbright:update-plugin`.

## Environment notes

- On the Mac the plugin is an org install, so `claude plugin marketplace update quasarbright-claude`
  fails ("not found"). Read the plugin from the repo (`plugins/quasarbright/docs/`).
- Local game server: `node server.mjs`, http://127.0.0.1:8473. `window.ct` test hook: `ct.license`,
  click `[data-level="7"]`, `ct.biz.money = 900; ct.buy("paint")`, `ct.renderBoard()`.
