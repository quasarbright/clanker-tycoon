# Progression design

Status: **proposal, not agreed.** Nothing here is built. Mike decides; open questions are collected
at the end. Mocks are rough and live in [`mocks/progression/`](mocks/progression/).

What's already agreed (from the coordinator thread and decisions #7, #25):
- The unit of play is a **quarter**: an order quota, a set number of shifts to meet it, and a
  starting budget.
- Labor costs money. Stars are gone; quotas and promotions replace them.
- Roadmap order: words matter, the quarter sandbox (both in progress), crew variety through
  mechanics, then **progression** (this doc), then disruptions (later, not core). Personalities are
  late polish; this doc is about mechanics.

The shape this doc proposes is Mike's "corporate ladder" from issue #3: a robot boss gives you a
quota, you hit it, you get promoted into a bigger job, and the job changes what you do all day.
Mike's twist on it: you buy the promotion with the budget you didn't spend. The roguelike and the
continuous business are compared in "Alternatives" at the end.

---

## 1. The idea in one paragraph

Your boss is the dollar-eyed robot from the favicon. Every quarter they hand you a quota, a number
of shifts and a budget. You staff your floor, write instructions, run the shifts, and at the end the
boss reviews you. Hit quota and you keep your job; whatever budget you didn't spend is yours, and
you save it up to buy your promotion from the boss. Each promotion gives you
a bigger floor, with more lines feeding into each other, than you can personally run, so the only
way to keep hitting quota is to put robots you've developed in charge of lines. **You never leave
the floor**: at every rank you're on it, talking to robots and watching what they do with your
words. What changes is who you talk to (a foreman instead of each worker) and how far your words
travel before they turn into work.

The difficulty ramp comes from **your attention running out**, more than from harder numbers.
Each rank's quotas are sized so that the way you played the previous rank stops working.

---

## 2. A quarter, step by step

![Quarter briefing](mocks/progression/1-briefing.svg)

1. **Briefing.** The boss's card: quota (e.g. 36 boxes, any mix the orders call for), shifts (4),
   budget ($600). Plus anything new this quarter: a new machine, a new product, a bigger floor.
2. **Before each shift:** hire and let people go, train, buy, write and adjust instructions.
   Hiring stays between shifts only (decision #7).
3. **The shift** runs as it does now: orders arrive, the crew works them, wages tick.
4. **Shift report.** Shipped against the pace needed, the budget left, and anything
   worth knowing (a machine that sat worn out for 40 s, a worker who came to your desk three times).
5. After the last shift, **the review.**

![Between shifts](mocks/progression/2-shift-report.svg)

**Quota is cumulative across the quarter.** One bad shift doesn't fail you; it puts you behind pace,
and you fix the crew before the next one. This is the main answer to issue #10 (one problem wrecks
the run): a shift going wrong becomes something you recover from between shifts.

### Money inside a quarter

- **Budget** is what the boss gives you for the quarter, and it only goes down. Wages, hiring fees,
  training and purchases come out of it. A line lead doesn't see sales or revenue: the money a box
  makes is the company's business, not yours (Mike: a line manager worrying about money earned by
  selling "doesn't really make sense"). Quota is the number that goes up; budget is the one that
  goes down.
- As in the quarter sandbox (decision #35), Start waits until the budget covers the shift's payroll,
  so you can't overspend. Running short means a smaller crew, not debt.
- **Money left over is yours, and it buys your promotion.** When a quarter ends with the quota met,
  the unspent budget goes into your savings. A promotion has a price, and you buy it from the boss
  once you can afford it (Mike: "you use your money to buy a promotion"). So running lean is how
  you climb: every robot you didn't need is money toward the next rank. It also fits the dollar-eyed
  boss. (An earlier idea, spending it on your own little house, was dropped for this.)

---

## 3. The review, and failure

![Quarter review](mocks/progression/3-review.svg)

Each quarter ends one of two ways:

| Result | What happens |
|---|---|
| **Quota met** | The budget you didn't spend goes into your savings |
| **Quota missed** | The leftover goes back to the company, and you're **on notice** |

There are no grades beyond that, because the money already says how well you did. Meeting quota a
shift early leaves that shift's payroll unspent, so speed pays too.

**Promotion** has a price at each rank, and you buy it from the boss between quarters once your
savings cover it. Prices are set so a lean quarter or two gets you there at the lower ranks and it
takes longer higher up (Mike: "keep the lower stages short"). Buying it spends the savings, so you
start the new rank at zero.

**Failure:**
- Missed once: on notice. The next quarter's quota stays the same instead of growing, and the boss
  says so.
- Missed twice in a row: **demoted** one rank. You keep your crew; you lose the
  rank's unlocks until you earn it back. At the bottom rank there's nowhere to fall, so you replay
  the quarter.
- No game over in the main mode. Getting fired (a run ending) is the roguelike variant's failure,
  if we make one. (Open question 1.)

The boss reacts in a few fixed lines (deterministic, no model calls, per #3). Comedy lives in their
voice: the dollar eyes, the corporate phrasing.

---

## 4. What carries between quarters

| Carries | Doesn't |
|---|---|
| Your crew: every worker, their skills, attributes, wage, experience | The budget (each quarter gets a fresh one; leftovers are open question 3) |
| Each worker's instructions, as written on their card | Orders in progress (the quarter closes them out) |
| The floor: machines, layout, stations you bought | The shift clock |
| Your rank and your savings | |
| Who runs what (foremen, managers) | |

Carrying instructions matters: quarter two should start with a working floor you tune, not a blank
one. A new quarter's briefing points at what will break ("new this quarter: blue widgets") so you
know which cards to revisit.

---

## 5. The ladder

![The ladder](mocks/progression/4-ladder.svg)

Each rank says what you do, what's new, and why the previous way of playing stops working.

### Rank 0: Floor hand (the current tutorial)
- **You:** do the work by hand under the boss's instructions.
- **This is the tutorial levels**, reframed as your first week. You learn every machine by hand
  (that principle stays). No budget.
- **Promotion:** finish the tutorial.

### Rank 1: Line lead
- **You:** run one line. Hire 2 to 4 robots, write their instructions, still walk the floor and
  step in by hand.
- **Quarters:** 3 shifts. Small quotas, generous budgets.
- **Unlocks during the rank:** new machines arrive one at a time, each used by hand first. Later in
  the rank, **training** (pay to teach a worker a skill, #4) and **foremen**: you can make one of
  your workers foreman of your line. You tell the foreman what the line has to do; the foreman
  writes the instructions for the others, and they show up on those robots' cards. The foreman is
  still a robot on the floor and still does work. You're still there too, so it's delegation with
  you watching, which is the practice you need before you leave the floor.
- **Transfers.** Between quarters, corporate sometimes moves people: one of your robots gets sent
  to another line, or someone gets sent to you, with their skills and habits. You plan around a
  crew that changes under you, and the idea of people moving between lines exists before you're
  the one moving them (Mike's ask).
- **Why foremen fit:** the worker design already has the pieces. A foreman is a worker whose
  instructions are about other workers' instructions, and decision #19 parked worker-to-worker
  messages for exactly this.
- **Why it stops working:** the next rank needs several lines' worth of output, and you can only
  stand on one.

(A Shift supervisor rank, two lines on one floor, sat between these two in the first draft. Mike
cut it: "this kind of feels like it shouldn't exist.")

### Rank 2: Plant manager

**The principle (Mike, 2026-11-17):** the higher ranks have to play like the floor. "Gameplay at a
lower level is what really makes us special, like the whole give people instructions type of
thing. When it gets too managerial, it becomes a spreadsheet simulator." So promotion makes the
floor bigger. It doesn't swap the floor for a dashboard.

![Never leave the floor](mocks/progression/8-never-leave-the-floor.svg)

**A floor of lines that feed each other.** Mike's idea: lines are stages of one product. Line A
makes painted widgets and boxes them, Line B combines boxes into something bigger (a kit, a crate of
mixed colors), Line C ships. Each line's output is the next line's input, joined by belts you can
see. You start with two stages (your old line, now under the foreman you left in charge, plus the
next stage) and grow to 3 to 5.

**Foremen run lines, in plain view.** Each line has a foreman, one of your robots, promoted. You
talk to the foreman, and the foreman talks to their crew. Their crew's instructions are the
foreman's words, written on the robots' cards like always, so you can open any robot on any line
and see exactly what it was told and by whom. You can still walk to any line, watch it and talk to
any robot directly.

**What you do, minute to minute, is the same game one level up:**
- **Brief foremen.** "Line B needs 12 mixed crates this shift; red is short, so build the
  all-blue crates first." The foreman turns it into instructions for their crew.
- **Watch it play out on the floor,** across lines. Because the lines are joined, a mistake travels:
  Line A paints too much blue, and twenty seconds later Line B is starved of red. You see the pile
  grow on the belt between them.
- **Debug second-hand.** Trace the problem back: open Line A's painter, read what Doris told her,
  and fix it by talking to Doris, not to the painter (or go around her, at some cost, see open
  questions).
- **Foremen come to your desk** when their line is starved, flooded or behind, the same way workers
  do at Line lead.

**The numbers are a light layer between shifts.** Corporate's order becomes the plant's output
target, and each line's target follows from the chain. You split the plant's budget across lines
and move robots between them. That takes a minute between shifts, and it isn't where the game is.
Repairs stay each line's business (Mike).

**Cost.** Robots on lines you aren't looking at still run their compiled programs, which cost no
model calls. Foremen think when something goes wrong on their line, like any worker. Whether a big
floor needs a cheaper simulation for far-away lines is an implementation question for later.

#### What's still open

- **Going around a foreman.** If you tell a crew robot something directly, does the foreman mind
  (morale, #5), or is it free?
- **What the stages make.** Boxes into crates is the easy first chain. What comes after, and does
  each new stage bring a new machine you try by hand first, the way Line lead does?
- **Which of the earlier ideas still fit:** quota pushback from foremen and coaching a foreman's
  standing instructions both work on this floor, between shifts.
- **Director** (several plants) has the same problem one level higher. Probably the game stops at
  Plant manager for now.

(Earlier versions of this section: a plant view of rows and bars, then shared resources with
conflicts at your desk, then foremen meetings between shifts only. All replaced by this, because
they turned the rank into a different, more managerial game.)

### Rank 3: Director (top of the core ladder)
- **You:** several plants, each run by a plant manager. You're your old boss now.
- **New:** you set quotas and budgets for your plant managers, the way the boss set them for you.
- **Endgame:** the business side (#8: investors, competitors) would hang off this rank. Out of scope
  for the core game.

### Symmetry: what the boss does to you, you later do to your foremen

Mike's principle (2026-11-17): "it would be cleaner if anything that you do to your subordinates
at some level is something that your superior did to you when you were at that level", unless it
would be silly. It also teaches each tool from the receiving end before you use it.

| What | Line lead: done to you | Plant manager: you do it |
|---|---|---|
| Quota for the quarter | the boss gives you one | you give each foreman one, from the plant's order |
| Budget for the quarter | the boss gives you one | you split yours across lines |
| Transfers | corporate moves your robots | you move robots between lines |
| A briefing in words | the boss's briefing card | your briefing to each foreman |
| Standing rules for how to work | not for you: you have a brain | a foreman's standing instructions |

### When you're promoted, someone takes your old job

This is the thread that ties the ladder together. Promotion day asks who runs the line you're
leaving. If you've developed a worker who can, they take it, and that line becomes the first stage of
your new floor. If you haven't, the boss puts in a stock hire, cheaper and worse. So developing your
people pays off at the exact moment you rise, and the crew from your first quarter can still be
working for you at the top.

---

## 6. Your workers grow too (#4, #5)

- **Experience** comes from shifts worked. It shows on the card.
- **Training** costs money and time (the worker misses a shift) and adds a skill. Experience makes
  training cheaper, so the robot who has watched the paint machine for three quarters learns
  Painting for less.
- **Promoting a worker** (to foreman, then manager) raises their wage. Passing over someone who has
  earned it hurts morale (#5), which isn't designed here.
- **What makes a good foreman** is a mechanic, not a personality: Smart (a bigger thinking budget)
  matters most, because a foreman's work is thinking. (Open question 6.)

---

## 7. How difficulty ramps

Six dials. Each rank turns some of them, one new thing at a time:

| Dial | Line lead | Plant manager |
|---|---|---|
| Quota per shift | small, growing each quarter | 2x at first, about 5x by the end |
| Order mix | one color, then two or three | several products |
| New machines | one per quarter | a new line type, then the line types you choose |
| Budget | generous | tight, split by you |
| Stages (lines feeding lines) | 1 | 2 at first, 3 to 5 by the end |
| Span (robots you're responsible for) | 2 to 5 | 8 at first, 15 to 30 by the end |

Within a rank, each quarter's quota grows a bit over the last (unless you're on notice). Budget grows
more slowly, so the same crew gets tighter and you have to get smarter.

Disruptions (supply delays, rush orders, a key worker out sick) are a later dial, per the roadmap.
When they come, they should land at the briefing or between shifts, where you can plan around them,
following the no-random-breakdowns principle.

---

## 8. Alternatives considered

- **Roguelike (#3 comment):** each run is a ladder climb; missing twice ends the run. After each
  shift you pick 1 of 3 new hires. Shorter, replayable, and fits the hire-picks idea. Costs: crew
  you've grown for hours is lost, which fights the "develop your people" core. Could be a separate
  mode built on the same quarters.
- **Continuous business (#3):** no ranks, the company just grows. Has no built-in reason for the
  game to change shape, which the ladder gives for free.
- **Repeatable levels to grind (#3):** close to this doc if each rank's quarters were replayable.
  Grinding was rejected for the tutorial (#7); here it's avoided because quotas grow.

---

## 9. Open questions for Mike

1. **Failure:** demotion with no game over (proposed), or getting fired ends the run?
2. **Rank 0:** is the tutorial reframed as "your first week as a floor hand", or kept separate?
   Does being a worker under a robot boss stay that short?
3. **Savings:** leftover budget buys your promotion (agreed). Open: can savings buy anything else
   (training, a machine), or only the promotion? If both, every purchase delays your promotion,
   which is an interesting choice but might make training feel like a trap.
4. **Demotion and savings:** do you keep your savings when demoted? Keeping them makes the climb
   back quick.
5. **Quota counting:** does quota count boxes shipped of any kind, or must every order in the
   quarter be filled? (The second makes order mix matter more.)
6. **Foremen:** can any worker be promoted, or only one with enough experience? Does a foreman keep
   working the line, or only manage?
7. **The plant view:** is dropping into a line free, or does it cost something (time keeps running
   at full speed everywhere else)?
8. **The boss:** do they have a name? Do they ever get promoted away and replaced?
9. **Length:** about how long should a run from Line lead to Director take? This sets the number of
   quarters per rank.
