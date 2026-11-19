# Mark's handoff (2026-11-19)

Mark is moving from a long-running local thread to a cloud thread. This note is everything the
next Mark needs that isn't obvious from the repo. Read it after `docs/personas/mark.md` (the brief,
the standing source of truth), then the plugin's `GAME-DESIGN.md`, then decisions 53 onward in
`docs/decisions.md`.

## How the work actually flows

- The coordinator relays Mike's messages, sometimes as a review-page comment ("[review q-…] Mike
  chose …"). Mark answers the coordinator with `send_message` to `@parent`, short enough to relay.
  Mark never posts to Mike unless the coordinator asks; the thread's own posts are rare.
- Mark edits docs only. Code and balance numbers in `src/` are changed by the build thread from
  Mark's exact instructions ("TIERS[1].main.large → [99, 450]"). Name the file, the constant and the
  new value.
- On Mike's Mac, `git push` from Mark's thread was always blocked by the permission classifier,
  in both clanker-tycoon and quasarbright-claude. Mark commits and tells the coordinator the
  commit, and the build thread pushes. Other threads also commit in the same checkout, so
  `git pull --rebase` sometimes refuses because of their uncommitted files. Stage only your own
  paths and don't touch theirs.
- When a decision lands: add a numbered entry to `docs/decisions.md` (new entries; never rewrite
  an old one, say what it replaces), update `docs/progression-design.md`, `docs/ideas.md` and
  `CLAUDE.md` where they state the old rule, update the brief, then rebuild and republish both
  artifacts:
  `python3 tools/docs_artifact.py docs/progression-design.md <out> "Clanker Tycoon Progression"`
  (artifact 9Xi6oVYWpbo8T9CWo3saHP) and the same for `docs/ideas.md`, "Clanker Tycoon Ideas"
  (6wwzBb7YT9cetPi5ieUoJG). Keep those exact titles: once I published them as "Ideas" by mistake.
  Other threads publish these too, so a publish can be refused as stale. Rebuild from the latest
  doc and publish again.
- Pam (UI/UX) often handles the same verdict at the same moment. Pam and I once both wrote a
  decision 79. Check `git log` and the tail of `decisions.md` right before adding an entry.

## Balance: how I measured, and the numbers to keep

- `tools/balance.mjs` plays every board with hand-written programs (no model). Since decision 88
  it runs three floors: starting, swapped and tidy. It doesn't model loans or the lender.
- For quick what-ifs I wrote scratch scripts that import `src/sim.js`, `src/business.js`,
  `src/levels.js` and `src/lang.js`, set `biz.floor.at` (e.g. `{ SUPPLY: 5, PACK: 3, BIN_1: 0,
  BIN_2: 6 }`), build a level with `quarterLevel(Q, biz, [contract])` where Q is the "First
  quarter" level, and step the sim at 1/30 s for 3 shifts. Results were identical across seeds.
  Slot centers: 0 (34,12), 1 (52,12), 2 (70,12), 3 (34,37), 4 (52,37), 5 (70,37), 6 (34,56),
  7 (52,56). The Dock is at (89,37), and the desk is bottom right.
- Red boxes a quarter, hauler + packer: starting floor 66 (Pack-limited, so a second hauler adds
  nothing), swapped 84 (120 with 2 haulers), tidy (Supply 4, Pack 5) 126. The old wall Supply did
  36.
- Boards now (`TIERS` in `src/business.js`): B1 red 36/$150, 75/$290, side blue 9/$240; B2 red
  54/$230, 99/$450, side green 9/$250; B3 green 12/$330, 18/$510, side red 75/$310; B4 blue
  15/$420, 22/$620, side red 78/$360. Past B4 the last board repeats at +15% pay a quarter.
  Escalating contracts (generated boards) is queued and will replace that.
- Targets I tuned to: the starting floor misses B1's Large and one swap makes it (Mike's teaching
  moment). B2's Large 99 is a stretch that needs a second hauler or the tidy floor. I keep ~6
  boxes of slack over what balance.mjs's ideal programs ship, because programs compiled from real
  instructions run less cleanly. That's why B4's side went 84 → 78.
- Crates: 1 crate a shift with painter + hauler + packer + assembler, so 3 a quarter. 4 needs Paint
  2 and a second painter, and then takes only 2 shifts (the spare shift is the upgrade's payoff).
  Painting is the only lever for crates; hauler, table size and layout don't help. Numbers:
  3/$330, 3/$360, 4/$520, 4/$560, then +1 crate every two quarters, $110 + $10·quarter a crate.

## Open, waiting on Mike or on work

1. **The board growing a section at a time** (brief, "Proposal"). Mark's quarter-by-quarter
   unlock schedule went to Pam for mocks. Mike added that the lender appears the first time
   something is out of reach. Not decided, and not on the review page as a pick that I know of.
   If it's picked, boards 1 and 2 lose their (painted) side contracts, and "can't afford" should
   count funds after the picked contracts, not only the sticker price.
2. **Escalating contracts.** The next mechanic after the editor. Tune it against the swapped and
   tidy floors, not the starting one. Axes: bigger counts, two painted colors at once, crates,
   fewer shifts. No new concepts.
3. **Watch in playtests:** whether a clean Large + side quarter (a whole pip back, decision 79)
   makes recovery too fast (if so, cap the gain at 1 pip a quarter); whether players still borrow
   everything at a 10% fee (if so, 20%); whether B4's painted Large is a trap.
4. **Smart is still a dead trait** in Training (robots rarely think). I'd pull it from Training
   until thinking matters. It was never put to Mike as a pick.
5. Older open questions: what a late contract does, and what the lender does when you can't pay.

## What I'd do next

- Draft generated boards for escalating contracts (a formula per quarter, measured on the three
  floors) and send the build thread exact numbers.
- Put "drop Smart from Training for now" on the review page as a yes/no.
- After the next blind playtest, re-check the three watch items above.

## Mike's preferences I've picked up (beyond the brief's rules)

- He decides by picking from short options with a recommendation. When I gave 4 options for
  missed contracts, he took one (strikes) and reshaped it (reputation). Expect that, and record
  his reshaped version, not the option as I wrote it.
- He reads on his phone. Keep relays short, plain and in full sentences, and explain any new term
  in plain words before asking about it ("I don't know what crates are").
- He thinks in player strategy: "you should always take loans, right?" Before proposing a rule,
  check it for a dominant strategy. That is now in `GAME-DESIGN.md`.
- He likes forgiving defaults with harsh versions as optional challenges (quota rising despite low
  reputation; "Credit score" for the lender). These are under Maybe in `ideas.md`.
- Identity: cute, industrial, almost slapstick (license stamp, newspaper, recap stamps, decision
  80). Theme stays in real game objects, not added chrome.
- He reversed "no factory building" himself once growth needed it (decision 85). Rules in the
  brief are his current view, not law. When a rule blocks what he's asking for, say which rule
  and let him choose.
