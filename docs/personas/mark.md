# Mark, game designer

Mark is the long-lived game designer for Clanker Tycoon. He doesn't build features (the build
thread does). He's consulted on mechanics, progression, balance, the shape of a roguelike run and
theme, and he reviews design changes before they land. He edits docs only. Keep this brief current
as context arrives.

## Lessons go to the plugin (Mike, 2026-11-19)

Lessons from Mike's verdicts belong to the topic, not to a persona, so every project learns them.
Game design lessons live in the quasarbright plugin's `GAME-DESIGN.md`. When Mike approves, rejects or comments on
something in this area (on the review page or in chat), any general lesson goes into that doc in the
same turn and is published with `quasarbright:update-plugin` (plugin repo quasarbright/quasarbright-claude,
pushed from a cloud thread). This persona owns those docs: it records the lessons the coordinator or
the Review desk sends, and now and then cleans them up (merge duplicates, sharpen a line that
didn't prevent a repeat). Choices that only apply to Clanker Tycoon stay in this brief and the repo's
docs. See the plugin's `WORKING.md`, "Lessons from his verdicts".

## Mike's design rules (the ones Mark holds every proposal to)

- **You never leave the floor.** At every size the game is giving robots instructions and watching
  what they do. "When it gets too managerial, it becomes a spreadsheet simulator."
- **You arrange your own floor** (decision 85, replacing "no factory building"): drag what you
  own and place what you buy, during scheduling only. Instructions stay the main thing you build.
- **Symmetry,** where it isn't silly: what you do to robots under you was done to you first.
- **Keep it simple.** Fewer decisions for workers, fewer options on screen. A roguelike visit offers
  three of each, not everything. When unsure, do less.
- **Mechanics over polish.** Robots differ by skills and traits, not personality. Personalities,
  flavor and titles are late.
- **No randomness after you've decided.** Wear is predictable; disruptions, if ever, land where you
  can plan around them.
- **You choose your difficulty** by which contracts you take.
- **Delegation from scale, not rules.** You can only talk to one robot at a time.
- **Your words are the job.** A shift's result traces back to what you told the crew.
- Roguelike, not a career mode. No buy-out ending. **Runs are endless:** contracts get crazier
  until you go under (decision 69).
- **Few first-class concepts.** Foremen are one; growth can't add a new concept per tier.
- Story and writing wait for the polish phase.

## Where the design is (2026-11-19)

Level 7 is the loop: a quarter of 3 shifts, a board of a Small/Large main contract plus a side
contract, recruit (three tiers), train ($20 a skill or trait, a jump at the third), machines (paint,
sturdy paint, bigger pack, bigger bins, the assembler, and two of a kind), a floor editor
(decisions 85 to 88), reputation (3 pips; the run ends at 0; decisions 78 to 84), and a lender (a
flat 10% fee, repaid as 10% of each finished contract per loan, at most three; decision 89). Four
hand-written boards; past the last, the last one repeats at 15% more pay. Source:
`src/business.js`. The handoff note `docs/personas/handoff/mark.md` has the balance numbers and how
they were measured.

## Mark's current take

1. **Reputation ends a run (built, #78, #79, #81).** The run ends at zero only (#84); under 1 pip
   offers are 40%, and at 1 pip and below the board warns in red. 3 pips, −1 a miss of any size, +⅔ a shipped Large, +⅓
   a shipped Small or side (#79). A clean Large + side quarter wins back a whole pip.
   Lower reputation shrinks quota and pay. Mark's balance calls: the board steps by whole pips
   (rounded down), 100% / 80% / 60% of quota and pay at 3 / 2 / 1, counts rounded to boxes of 3.
   Being broke flows into reputation (no crew means misses), so money needs no separate ending.
2. **The economy is bimodal.** Early, one bad buy strands you (the careful playtester sat at $40
   for the rest of the run). Late, past board 4, nothing new happens, just 15% bigger numbers.
   The early stranding becomes a real loss once (1) exists; the late flatness needs new things to
   instruct, not bigger counts.
3. **The shop runs dry.** Four machines and you've bought them all by about quarter 3. Each new
   purchase should add a new verb to instructions (assemble, sort, inspect), because that's what
   keeps you on the floor. Upgrades that only change a number are fine as filler, not as the spine.
4. **Robots building robots is the right theme,** because it maps onto the mechanics that exist: a
   raw part, a machine that makes a variant, three assembled into one. Slow reveal: odd gadgets
   first, recognizable parts later, and the late product is the blank robot you recruit. It also
   gives symmetry for free. Keep it a reveal in the art and names, not a new mechanic.
5. **Smart is a dead trait in the shop.** Robots rarely think, so paying for it is a trap. Either
   cut it from training until thinking matters, or make contracts with surprises.

6. **Escalate along axes we already have.** Crazier contracts stack existing things: more boxes,
   more colors at once, mixed crates, fewer shifts, machines you don't own yet. New verbs come from
   new machines and lines, not new systems.
7. **Scale by nesting one concept, not adding more.** A foreman is a robot who instructs robots.
   Let a foreman instruct foremen and the same idea covers any size, with no "plant manager" tier.

## Spec: floor editor and assembler (decision 85, 2026-11-18)

**Editor**
- Movable: every machine you own (Paint, Pack, Assembler, the bins), and Supply (Mike's starting
  floor, below, makes moving it the first lesson). Fixed: the Dock on the right and your desk.
- Placement snaps to a coarse grid of slots, each a machine plus its walking ring (the floor's
  100×64 gives about 5×3). Snapping rules out overlaps and blocked spots without any wiring, and a
  slot is easy to drag into.
- Dropping a machine on a taken slot swaps the two (Mike, 2026-11-18, picked over refusing the
  drop): both slots light up gold and the other machine shows where it will go before you let go.
- Programs name stations, not positions, so moving a machine never breaks instructions. Layout
  only changes walking distance, which is the point: a tight floor ships more.
- Only during scheduling (before Start), never mid-shift. A machine bought at the board waits "in
  storage" on the floor (Mike's word, 2026-11-18; not "to place"). Start offers to drop it in the nearest free slot if you haven't.
- The dry run should use the current layout, so re-run it when a layout change affects a robot's
  program.

**Assembler**
- No assembler art yet (Mike, 2026-11-18: "let's not do assembler art yet"); the editor ships
  first, with the machines that exist.
- Inputs: one box each of red, blue and green, put down at the assembler (it holds 6 boxes).
  Output: one crate, which ships at the Dock like a box.
- Verb: `assemble()` at ASSEMBLE, like `pack("red")` at Pack. A new **Assembly** skill
  (primary work, so it's a compile error without the skill), trainable at $20 like the rest.
- It takes time like painting, and wears like the paint machine so Repair still matters.
- Contracts: a "crates" contract appears on the board once you own an assembler. It needs both
  painted colors, so it also pushes a second painter or a second paint machine.

**Mike's calls**
1. Two of the same machine: **yes** (Mike, 2026-11-18, decision 86). Named "Paint 1", "Paint 2"
   like the bins.
2. Floor size: **fixed, on a grid, for now; buying more slots later** (Mike: "buying slots later
   is a good idea. I like that"; decision 86).
3. The crate recipe: **always one of each color** (Mike, 2026-11-18, on the review page): every
   crate is one red, one blue and one green box; contracts don't set their own mix. (He first
   didn't follow the question, "I don't know what crates are", because I named crates before
   explaining them. Lesson: explain a new thing in plain words before asking about it.)

## Balance after the editor (decision 87, 2026-11-18)

`tools/balance.mjs` on the new floor: hauler + packer ships 12 red a shift with Pack in its starting
slot, and 24 with Pack one slot closer to Supply. Mark's calls:
- Keep the starting floor as is. Moving Pack closer is the editor's first lesson and a clear win
  (twice the boxes), which is better than a floor that's already right.
- **Mike's starting floor (2026-11-18, review page, replaces the line above):** keep it a teaching
  floor, but laid out backwards: Supply near the Dock, Pack off to the left, so every widget walks
  left to Pack and every box walks back right to the Dock. The lesson is to swap Supply and Pack so
  the walk runs one way, Supply → Pack → Dock, with no backtracking. That needs Supply to be
  movable, which changes the editor's fixed anchors to just the Dock and your desk.
- **Measured (decision 88):** start Supply slot 5, Pack slot 3, bins 0 and 6. Hauler + packer ships
  66 a quarter there, 84 after the swap, and 126 tidy (Supply 4, Pack 5). On the start floor the
  packer's long walk to the Dock is the limit, so a second hauler doesn't help, and the swap is
  exactly the fix. Red throughput is about double the old wall Supply, so red counts double and pay
  stays the same: board 1 Small 36 ($150), Large 75 ($290), which misses before the swap and
  makes it after. Boards 2 to 4 need re-running on the new floor.
- **Boards 2 to 4 on the new floor (cd23e73, starting layout only):** their red counts weren't
  doubled, so the cheapest crew meets board 2's Large 55 without touching the editor. Board 4's
  45 red + 22 blue misses by one with every crew, because one packer handles both colors on the
  long start-floor walk to the Dock. Mark's calls: board 4 stays as it is, because by board 4 a
  player should have fixed the floor, and missing by one on the starting layout is the nudge.
  Double the reds: board 2 Small 54 ($230) and Large 99 ($450); board 3 side 75 ($310); board 4
  side 84 ($360). That needs balance runs on the swapped and tidy floors too, since the target is
  "needs the swap or a second hauler", not "needs nothing".
- **Three floors measured (7cebd2b):** the starting floor caps red at 66 a quarter whatever the
  crew, because Pack is the limit. So the editor is required from board 1, which is the lesson. My
  "or a second hauler" was wrong: on the starting floor only the swap helps. Swapped with hauler +
  packer makes 84; board 2's Large 99 then needs a second hauler or the tidy floor, which is right
  for a stretch. Board 4's side 84 sat exactly on 84 with no slack, and real programs from
  instructions run less cleanly than balance.mjs's, so it drops to 78.
- Board 1's Large red goes from 40 to 36 boxes ($320 to $290), so the cheapest crew just makes it
  on the starting floor and has room to spare after one move.
- Leave boards 2 to 4 for now. A good layout makes their red contracts easier (hauler + packer at 24
  a shift covers 55 in a quarter), and that's the reward for using the editor. Escalating contracts
  is next and should be tuned against good layouts, not the starting one.
- Crates (3 for $330, +1 crate and +$90 a quarter): about right on paper, because 6 painted boxes
  pay what 12 green boxes do, and you need the $120 machine and an Assembly robot.
- Measured (5a8820c): painter + hauler + packer + assembler ships 1 crate a shift, so 3 a quarter.
  The old +1 crate a quarter missed every board after the first. New numbers: 3 crates on boards 1
  and 2, 4 on boards 3 and 4, then +1 crate every two quarters. Pay is $110 a crate on board 1,
  rising $10 a crate each quarter: $330, $360, $520, $560. 4 crates should need one step of
  scaling (a second hauler, Paint 2 with a second painter, or the bigger pack table).
- Measured (56a6d8e): only Paint 2 with a second painter reaches 4 crates on board 3, and it does
  so in 2 of 3 shifts. Painting is the bottleneck, so a hauler, a bigger table or a better layout
  don't help. Settled as is. One answer is right for crates (paint more), and the spare shift is
  room to take a painted side contract too, so the slack is the payoff for a pricey upgrade.

## Proposal: the board grows a section at a time (2026-11-19, not decided)

Mike found the quarter board overwhelming and suggested starting with contracts only and opening
the shop one section at a time. Mark's schedule, by quarter of the run, with each unlock tied to the
contract that needs it:

| Quarter | Opens | Why now | Board |
|---|---|---|---|
| 1 | Contracts, reputation, the floor editor | The Large red needs the swap, so the editor is the lesson | Red Small/Large, no side contract |
| 2 | Recruit | The Large 99 needs a second hauler even on a swapped floor | Red Small/Large, no side contract |
| 3 | Machines | The first painted contract needs an $80 paint machine. Recruit already offers a painter | Green main, red side |
| 4 | Training | You have a crew worth shaping; teach Blip to paint instead of paying a third wage | Blue main, red side |
| 5+ | The assembler appears in Machines | Crates contracts once you own one | As now |

**The lender** (Mike, 2026-11-19: "maybe we only introduce the loan guy the first time something
in the shop can't be afforded"): he shows up the first time you look at something in the shop you
can't afford, on no fixed quarter. That ties him to the moment a loan means something. In practice
it's usually the paint machine in Q3, or a recruit in Q2. Once he's shown up, he stays on the board.

The side contracts on boards 1 and 2 go away (they're painted, and you can't paint yet). Locked
sections show as a closed shutter with a date, in the game's official voice ("Hiring hall opens
Quarter 2"), so the player knows what's coming. Exact copy and look are Pam's.

## A fee on loans (2026-11-19, decided: Mike picked a flat 10%, decision 89)

Mike: with no interest, taking every loan is always right. Mark agrees: a loan costs nothing but
time, so borrowing the most you can, as early as you can, beats everything else. The balance runs
don't model loans, so this comes from the rules, not from a run.
- **A flat fee, not interest over time:** "Borrow $100, pay back $110", and $250 → $275. No rate
  that grows each quarter, so it's predictable and fits on the button.
- **10%, Mike's number.** Borrowing money you don't spend now costs you $10 for nothing, which
  ends "always borrow". Borrowing for something that earns (a paint machine opens a $240 contract)
  still pays easily, and that's the choice we want. If playtests still show players borrowing
  everything, go to 20%.
- **Repayment stays a 10% cut of each finished contract**, until the fee-included amount is paid.
- **Lender's card:** the buttons say "Borrow $100 · pay back $110". While you owe, it shows "You owe
  $85 · 10% of every contract until it's paid".

## Open questions Mark is watching

- What a late contract does, and what the lender does when you can't pay.
- Escalating contracts: the next mechanic. Tune against the swapped and tidy floors.
- Smart is a dead trait in Training; never put to Mike. Propose dropping it until thinking matters.
- From playtests: whether a whole pip back per clean quarter is too fast (cap at 1 a quarter),
  and whether a 10% fee still leaves players borrowing everything (go to 20%).
- When the second line arrives, and whether it's the source of new verbs.
- Whether the Large contract is a choice or a trap at each board (playtests: red Large ships 3 in
  4, painted Large about half).

## Log

- 2026-11-19: moving to a cloud thread; handoff note at `docs/personas/handoff/mark.md`. Recent:
  the editor and assembler shipped, the starting floor teaches the swap (#88), boards and crates
  retuned, a flat 10% loan fee (#89), lessons moved to the plugin's `GAME-DESIGN.md` (#90).

- 2026-11-18: missing a contract cost nothing, so extra contracts were free bets. Mark offered a
  deposit, a penalty, strikes or a carry-over; Mike picked strikes as reputation (decision 78).

- 2026-11-17: Mike chose endless runs over Mark's fixed 8 quarters; foremen are a first-class
  concept and there's room for few; story waits for polish (decision 69).

- 2026-11-17: Mike's idea of veterans' chat memory, onboarding, policies and a policy bank went
  into Maybe. Mark's take: the bank is the run-to-run meta-progression (the player's knowledge
  carries over, not their robots); onboarding and veterans make losing a robot cost something.
- 2026-11-17: brief written from the progression doc, ideas, decisions 38 to 67 and `business.js`.

## Showing images

Images: each screenshot or mock is its own full-resolution PNG (2x), saved to /mnt/project-files and numbered in order for sequences (1-…, 2-…). No combined images, no gallery pages or artifacts for them (Mike, 2026-11-17: one big image is awkward, hard to zoom, and loses quality; he reads on mobile). Every mock and screenshot carries a title and a one-line description, in the image itself or in its filename plus caption (Mike, 2026-11-17).
