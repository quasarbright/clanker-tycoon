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
more floor than you can personally watch, so the only way to keep hitting quota is to put people
you've developed in charge of parts of it. By the top of the ladder you mostly talk to managers,
and the robots you hired in your first quarter are running lines for you.

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

You run a plant of lines, starting with 2 (your old line, under the foreman you left in charge,
plus a new one) and growing to 3 to 5. You don't walk the floor anymore. Each line has a foreman,
one of your robots, promoted. Mike's calls so far (2026-11-17):

- **You work between shifts only.** Shifts run without you. Foremen talk to you between shifts,
  for example when they're at risk of missing their quota.
- **Corporate's order becomes your lines' quotas.** The boss hands you one big order for the
  quarter; you split it into a quota per line.
- **Your budget becomes your lines' budgets.** You split the plant's budget across lines.
- **Headcount.** You move robots between lines, hire, and choose foremen.
- **Repairs stay at Line lead.** Machines and wear are the foreman's problem, never yours.
- **Lines run as a deterministic simulation.** A line's output comes from its crew, its plan and
  its quota, worked out without simulating every robot on the floor (or calling the model for them).

![Plant manager ideas](mocks/progression/7-plant-talking.svg)

#### The worry: this turns into a generic business game

Mike: "the whole what we have so far is you are giving instructions to AIs, but what we're
thinking about here feels like a whole different game where ... you're kind of just setting
quotas, which is like not that fun." Splitting numbers is fine as a backdrop, but the thing you
*do* at this rank has to be talking to robots and having them act on what you said. Plant rules
help a little; Mike: "it feels like that's still not really enough." Ideas for putting it back,
not decided:

1. **Foremen write a line plan, you read it.** Between shifts you talk to each foreman about the
   coming shift. They turn what you said into a short written plan (who's on what, what they'll
   tell the crew, what they'll do if paint falls behind). You read it and correct it before the
   shift. It's the Line lead loop one level up: you write, a robot interprets, you check.
2. **Foremen push back on quotas.** Give Doris 40 boxes and she says "we can do 30 with this
   crew." You argue, offer her a robot, or take it back. Her estimate comes from the sim, so
   whether she's right is a real question you can check.
3. **Coaching a foreman.** Each foreman has their own standing instructions about how to manage
   ("ask me before letting anyone go", "train before you hire"). A foreman who keeps missing gets a
   talk, and what you say changes how they run their line from then on.
4. **One memo, read differently.** You write one plant-wide memo before the quarter. Each foreman
   reads it their own way, and their plans show it. You spot who misread it.
5. **Reports can be wrong.** Foremen report between shifts, and some are optimistic. You question
   them ("why is blue behind?") and check what they say against the numbers.
6. **Choosing foremen by talking to them.** For a new line, you interview candidates (from your own
   crew or from outside), and how they answer shows how they'd run it (#7).

My pick: 1, 2 and 3 together, as one between-shifts meeting with each foreman. They report, push
back on the quota, and propose their plan; you answer in words, and the plan they run changes.
4 to 6 can come later.

#### Open questions for Plant manager

- Which of the six ideas, and in what combination.
- How abstract the line sim is: does a line's plan still become real robot instructions, run
  quickly off screen, or is output just a formula of crew and plan?
- Can you still drop in on a line during a shift, or is that gone at this rank?

### Rank 3: Director (top of the core ladder)
- **You:** several plants, each run by a plant manager. You're your old boss now.
- **New:** you set quotas and budgets for your plant managers, the way the boss set them for you.
- **Endgame:** the business side (#8: investors, competitors) would hang off this rank. Out of scope
  for the core game.

### When you're promoted, someone takes your old job

This is the thread that ties the ladder together. Promotion day asks who runs the line you're
leaving. If you've developed a worker who can, they take it, and that line becomes the first row of
your new view. If you haven't, the boss puts in a stock hire, cheaper and worse. So developing your
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

Five dials. Each rank turns some of them, one new thing at a time:

| Dial | Line lead | Plant manager |
|---|---|---|
| Quota per shift | small, growing each quarter | 2x at first, about 5x by the end |
| Order mix | one color, then two or three | several products |
| New machines | one per quarter | a new line type, then the line types you choose |
| Budget | generous | tight, split by you |
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
