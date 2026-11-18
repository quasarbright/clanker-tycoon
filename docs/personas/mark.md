# Mark, game designer

Mark is the long-lived game designer for Clanker Tycoon. He doesn't build features (the build
thread does). He's consulted on mechanics, progression, balance, the shape of a roguelike run and
theme, and he reviews design changes before they land. He edits docs only. Keep this brief current
as context arrives.

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

## Where the design is (2026-11-17)

Level 7 is the loop: a quarter of 3 shifts, a board of a Small/Large main contract plus a side
contract, recruit (three tiers), train ($20 a skill or trait, a jump at the third), machines (paint,
sturdy paint, bigger pack, bigger bins), and a lender (10% of each finished contract per loan, at
most three, no interest). Four hand-written boards; past the last, the last one repeats at 15% more
pay. Source: `src/business.js`, decisions 53 to 67.

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
- Movable: every machine you own (Paint, Pack, Assembler, the bins). Fixed: Supply on the left
  wall, Dock on the right, your desk. Those fixed anchors keep every floor readable and set a
  real start and end for the walk.
- Placement snaps to a coarse grid of slots, each a machine plus its walking ring (the floor's
  100×64 gives about 5×3). Snapping rules out overlaps and blocked spots without any wiring, and a
  slot is easy to drag into.
- Programs name stations, not positions, so moving a machine never breaks instructions. Layout
  only changes walking distance, which is the point: a tight floor ships more.
- Only during scheduling (before Start), never mid-shift. A machine bought at the board waits in a
  "to place" tray on the floor. Start offers to drop it in the nearest free slot if you haven't.
- The dry run should use the current layout, so re-run it when a layout change affects a robot's
  program.

**Assembler**
- Inputs: one box each of red, blue and green, put down at the assembler (it holds 6 boxes).
  Output: one crate, which ships at the Dock like a box.
- Verb: `assemble()` at ASSEMBLE, like `pack("red")` at Pack. A new **Assembly** skill
  (primary work, so it's a compile error without the skill), trainable at $20 like the rest.
- It takes time like painting, and wears like the paint machine so Repair still matters.
- Contracts: a "crates" contract appears on the board once you own an assembler. It needs both
  painted colors, so it also pushes a second painter or a second paint machine.

**Mike's calls**
1. Can you own two of the same machine (two Paint, two Pack)? Mark: yes, named "Paint 1" and
   "Paint 2" like the bins. Without that, an editor can't make a factory grow.
2. Does the floor itself get bigger (buy more floor, more slots)? Mark: yes, later, as the next
   scaling step. For now a fixed floor with free slots.
3. The crate recipe: one of each color (Mark), or set by each contract.

## Open questions Mark is watching

- How a run ends (above), what a late contract does, what the lender does when you can't pay.
- When the second line arrives, and whether it's the source of new verbs.
- Whether the Large contract is a choice or a trap at each board (playtests: red Large ships 3 in
  4, painted Large about half).

## Log

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
