# Clanker Tycoon: vision and principles

Keep this file current. When Mike states a principle or a direction ("nothing should wait without
moving", "tutorials stay minimal"), add it here in the same turn, without being asked.

Keep the historical record too (Mike may make a "coding adventure" video about this project):
- `docs/decisions.md`: add a numbered entry for every real decision (the question, the options,
  what we picked and why, the evidence), in the same turn. Don't rewrite old entries; a new one
  says what it replaces.
- `docs/history.md`: add to the dated story when the project turns (a pivot, a notable bug, an
  experiment), with Mike's own words where they mattered.
- `docs/worker-agent-design.md` (and any future design docs): keep the current design and its
  status (agreed / built) accurate. The
workspace `~/GitHub/CLAUDE.md` and `DESIGN.md` still apply on top of this.

## Vision

A factory management game where you run a floor staffed by AI robots. You write each robot's
instructions in plain English; the model turns them into a routine and the sim plays it out. The
long-term goal is growing your own factory business: start alone on one small line, take
contracts, buy equipment and lines, hand lines to foremen (`docs/progression-design.md`). Realistic enough to be interesting, but fun and
game-y in the right amount.

Right now the game is a short, level-based tutorial that works out the core mechanics. Long-term
ideas live in `docs/ideas.md` and don't get built until Mike asks.

## Principles

**Workers**
- Workers follow instructions. Clear instructions get done, every time. They do what they're told
  and nothing more: no extra steps, no "helpful" side work, no unrequested trips to your desk.
  (Haiku's habit is to "help": a packer told to pack and ship also fetched widgets and blocked the
  line. `brains.js` sends back any routine that visits a station the instructions don't mention.)
- Talking and yelling don't change a worker's routine unless you actually give new instructions.
  "Great work" is not an order.
- The comedy is in their voices and personalities, and in orders that really are vague. Never in
  workers being unable to do basic things. (Stacked handicaps made Blip "completely useless".)
- What you write for a worker is called **instructions**. "Job" is reserved for a long-term role.
- Each worker gets their own instructions.
- **Skills** are concrete things a worker knows how to do (pack, paint, repair, ship, sort, future
  machines); a worker without the skill can't do it. Two kinds of action:
  - **Primary work** (painting, packing, …): a program that uses it without the skill is a compile
    error, caught before the shift starts.
  - **Side tasks** (servicing a machine): a program may include them; without the skill they
    silently do nothing. So "service the paint machine when it's worn" is fine in anyone's program,
    and only a worker with the Repair skill actually services anything.
  (Long term: pay to train a new skill.)
- **Attributes** are traits that raise the wage: Fast (walks faster), Strong (carries two),
  Nimble (works machines faster), Steady (machines wear more slowly in their hands, every machine), Smart
  (more in-game thinking: a bigger think budget or faster refill). Everyone is patient, careful and
  has a long memory; those aren't traits. No cheap downside traits: they're annoying, not fun. No
  traits we can't really control (thinking speed) or can't define cleanly ("notices problems").
  (Strong isn't built yet.)
- Workers come to your desk when thinking can't solve it: when a thought decides it needs you
  (missing info, conflicting instructions, something only you can do), or when they've thought
  about the same problem twice and it came back.
- **Your words are the job.** Success or failure should trace back to what you told them. Only you
  change a worker's instructions; thinking never widens them, not even for a one-off. A worker who
  thinks something outside their instructions needs doing comes to your desk and asks. (Mike: Pip,
  told to pack and ship, "rewrote his own instructions" mid-shift to fetch from the belt too.) The
  stray-station check compares against your own words, not the worker's restatement on the card.
- Workers cost money: a flat rate per shift (shifts are a fixed length, so per-minute pay meant
  nothing), paid at Start. A robot's third skill jumps their wage a tier instead of creeping it up
  (Mike: "just after some threshold, not like a continuous thing"), so one robot who can do
  everything costs more than a crew.

**Feel**
- Waiting is said in words, never a filling meter: a worker holding on at a station gets a
  "waiting for <item>" tag under their name. A worker's own pause (wait() between checks) shows
  nothing; standing by is just standing.
- Nothing just waits without moving. Anything that takes time shows its progress: packing fills a
  box in, painting, servicing a machine, a worker waiting for something. A still screen reads as broken.
- Simple actions are instant: picking up and putting down take no time.
- No random breakdowns. Machines **wear predictably**: a visible wear meter fills with every job,
  and a full meter means the machine stops until it's serviced (Repair skill, takes a few
  seconds). Servicing is planned work (who does it, and when), not bad luck. Randomness that hits
  after you've made your decisions isn't fun; the challenge is planning. (Issue #12.)
- You can use a station from any side.
- The factory floor stays in view; scrolling the crew list doesn't scroll the floor away.
- The page never scrolls, in any state (Mike: "the main page shouldn't scroll at all"). Everything
  fits the window; only inner panels (the crew list, the chat) scroll.
- Before reporting any UI change, screenshot every state it touches (disabled, selected, hover,
  done, empty, full) and spot-check them for ugliness, with a fresh-eyes reviewer that hasn't seen
  your reasoning (Mike, 2026-11-17: "i shouldn't see this, it should be caught before something
  comes to me ... do visual spot-checks for ugliness"). Disabled gold buttons with a gold lip and
  outlines that don't follow rounded corners were the examples.
- PC only (Mike, 2026-11-17: "This is going to be a PC only game"). Design for wide windows and
  use the horizontal space; phones don't need to work.
- You can see what a robot can do by looking at it: skills are tools they carry, attributes change
  their look (glasses for Smart, wheels for Fast that turn as it moves). New skills and attributes
  get a look too.

**Levels and tutorials**
- Tutorials are minimal: just enough to get the idea across, nothing more (level 2 is one box;
  the paint level is two red widgets painted blue).
- Every new machine shows up first in a level where you use it yourself.
- Introduce one idea at a time: one color until boxes are understood, no paint before that.
- A level is a fixed order. Crew levels have a shift length the order must ship within; no stars
  (they'll be subsumed by quotas and promotions). You press Start to begin; hiring happens before
  Start and closes once the shift runs. You can still change instructions and talk mid-shift.
- Pause is plain and free: it stops the floor only, and you can keep talking and changing
  instructions while paused. Thinking never freezes the floor (Mike: "really bad for the pacing").
- Early levels never offer one robot who can do everything: the point is a crew that has to
  coordinate. Set shift lengths so one robot can't fill the order alone.
- Try again puts you back at the start of the shift with your crew and their instructions, ready
  to edit.
- The bigger unit is a **quarter** (Mike: a quota, "some amount shifts ... to accomplish the quota,
  and a budget"). Shifts stay as they are inside it. Money is a planning problem, never a surprise:
  Start waits until the budget covers the whole shift's pay, so you can't go broke mid-shift. The
  quarter ends when the quota's met; what's left of the budget is saved, no surplus production.
- Roadmap order (Mike, 2026-11-17): make your words matter, the quarter sandbox, then progression
  (core) before disruptions (a later "pinch of chaos"). Personalities are late polish, not a
  mechanic.

**The model backend**
- The LLM backend must stay swappable. Nothing Claude- or Haiku-specific in the design, the
  prompts, or the worker language: everything goes through `src/llm.js` (text in, JSON out), and
  any provider-specific code lives behind it. Keep this in mind for every design decision.

**The worker language**
- Workers' programs are a small **JavaScript subset**: models of every provider write JS fluently,
  and an off-the-shelf parser (acorn) gives us the syntax tree, so there's no parser to write. We
  interpret the tree ourselves as a coroutine that pauses at each action, with a step limit, a
  per-worker whitelist of tools (from their skills), and no access to anything else. The program
  comes back as plain text inside the JSON answer, so it works with any backend. Chosen after an
  experiment against a small Lisp (`tools/lang-experiment/REPORT.md`): equally valid and fast, but
  correct 24/24 vs 19/24, and it never strayed outside the subset.
- The compile prompt includes the writing rules from that experiment (`RULES` in
  `tools/lang-experiment/run.mjs`): do your part only, choices in variables and the work once,
  numbers from the questions, no extra steps, trace one pass. They took clean programs from 29/40
  to 38/40 at no cost in time. The leftover failure (a program that never makes progress) is
  caught by a **dry run** (`src/dryrun.js`): before a worker takes a program, it plays for 40
  seconds on a private copy of the floor with a stage hand supplying what coworkers would hand them.
  No work done means one repair, then the worker says what's wrong in their own words and their chip
  stays red. Instructions that really ask for no work ("walk in circles") still get done.
- Workers compile instructions once into a routine the sim runs without the model. Haiku isn't fast
  enough for a real-time loop, so make what it compiles smarter instead of calling it more.
- Programs have conditionals and full vision (questions read every station, the order, wear, and
  where coworkers are and what they hold).
- Tell the model about work the worker can't do, so asking for it becomes a visible compile error
  instead of a program that quietly leaves it out.
- A floor where nothing has moved for a while is unexpected for everyone. That's how the runtime
  catches programs that never make progress, including jams between two workers.
- The compiled program is never shown to the player. That keeps us free to make it as complex as
  it needs to be. The card shows instructions and what they're doing, not code.
- Workers think (call the model) when something unexpected happens. Thinking draws on a budget
  that refills slowly; talking to them is free (they always answer you). Show it: a "?" pops up over a worker thinking about something unexpected, a
  "!" when a yell or a direct message got them thinking, alongside the thinking bubble.
- Workers keep working while they think. A thought can't change their instructions (only a
  message or yell from you can, and that change is auto-approved and shows on the card). Later,
  temperaments like independence could let some workers act on their own judgment (issue #1).
- A direct message or a `think` can inject a **one-time** sequence ("grab that box first"), after
  which the worker goes back to their routine. Changing the routine for good is a separate, visible
  thing: it rewrites the worker's instructions on their card. One-off is the default; players
  shouldn't have to guess which one a message did.
- Workers coordinating by talking to each other is for managers later, as model calls. Not
  deterministic messaging between scripts.
- The overall shape: each worker is an agent that mostly runs deterministically and is "woken up"
  to think now and then (like robots: a fast controller plus an occasional slow planner).
- Model calls run with thinking off where the backend allows it. No compiling while you type.

**Talking to workers**
- Talking to workers works like a messages app: a crew list with one row per worker (face, name,
  status chip, their last line, an unread dot) and the open conversation under it; on phones, the
  list or one chat. Clicking a row or a robot on the floor opens their chat. Instructions, replies,
  problems, desk visits and yells all show up in that conversation, never in a separate log, and
  Start says who's still reading.
- It's one conversation: no separate "instructions" and "messages". Until a worker has working
  instructions, what you say becomes them; after that, the worker decides whether a message changes
  their instructions, is a one-off, or is just talk.
- Before a shift each worker's status chip is red until they have instructions they can do, and
  green once they do. (No colored stripes down the side of rows or boxes; Mike dislikes them.)
- When a worker can't do their instructions, they say what's wrong in their own words: which part
  and why, and what would help. Never a canned error.

**Progression**
- Progression is your own factory business, as a roguelike run (probably): take contracts, get
  paid, recruit, train, buy equipment and then lines, and borrow from the dollar-eyed lender if you
  need to. No rank ladder, no career mode. You never leave the floor:
  growth makes it bigger (lines that feed each other) and has you talk to foremen instead of every
  worker, but you still give robots instructions and watch what they do with them. Mike: "When it
  gets too managerial, it becomes a spreadsheet simulator." Design: `docs/progression-design.md`.
- No factory building. New lines drop into pre-wired bays (supply bins, belts between lines,
  output belts already connected); anything flexible about routing is told to a foreman in words.
  The only thing the player builds is instructions.
- Delegation comes from scale, not rules: you can only talk to one robot at a time.

**Controls**
- Tools should let you choose what they act on: at Pack you choose the color ("Pack red"), and a
  box is always one color, taken from wherever those widgets sit. Drop-off order never matters.

## Working on this repo

- Run: `node server.mjs`, open http://localhost:8473. Model calls go through `claude -p` on Mike's
  plan; `src/llm.js` also has an OpenRouter path for a future web build.
- **Play logs:** every shift Mike plays is logged to `logs/play/<date>.jsonl` (gitignored): each line
  has `shift` (`<page session>/<attempt>`), game time `t`, and a `type`: `shift` (level opened, with
  the crew carried over), `hire`/`fire`, `chat` (everything said in a worker's conversation,
  both ways), `instructions` (what a worker wrote down), `start`, `you` (your moves), `sim` (every
  sim event: pickups, ships, fails, waits that gave up, unexpected, desk visits, wear), a
  `snapshot` every 5 s (where everyone is, holding, doing, station contents, order), and `end`.
  When Mike mentions something that happened in play ("Blip just stood there"), find the shift in
  the newest play log first and read what happened, before asking him.
- Every model call is appended to `logs/llm.jsonl` (gitignored), tagged with the same `shift` id
  (`test: true` for automated browsers, which don't write play logs unless the URL has
  `?playlog`). Read it to see what a worker was told and decided.
- A tab left open across an update shows a "game was updated, Reload" banner (`/api/version`).
  When Mike reports something that doesn't match the current code, suspect a stale tab first.
- **Tests** (Mike, 2026-11-17: "I generally want to have test coverage so we don't end up introducing
  bugs or regressing"): `npm test` runs everything; `npm run test:unit` is the fast part.
  - `test/*.test.mjs` (node:test): level 7's money logic, the sim, the usage log, and compiling and
    thinking in `brains.js` against a fake model (`useFakeLlm` in `src/llm.js`).
  - `tools/lang-test.mjs` and `tools/dryrun-test.mjs`: the worker language and the dry run.
  - `e2e/*.spec.mjs` (Playwright 1.63.0, its own server on port 8981): level 7 in a browser, with the
    model faked through `window.ct.useFakeLlm`. No real model calls in any of these.
  Every change comes with tests for what it changes, and `npm test` passes before every push. A bug
  gets a failing test first.
- **Model usage and cost:** every call's tokens, cost at API prices and source (`play` for Mike's
  games, `test` for automated browsers, `check` for thinking-check) go into `logs/llm.jsonl`.
  `npm run usage -- --since 2d` (or `--source play`, `--until <date>`) totals any window.
- `tools/player-check.mjs` and `tools/balance.mjs` play levels headless to check timings and shift lengths;
  `balance.mjs` also plays every contract on the boards in `src/business.js` and prints the profit.
- **Where things are written down** (Mike, 2026-11-17: issues "become out of date pretty quickly",
  and a couple of docs are "easier to keep those up to date"):
  - `docs/progression-design.md`: the shape of the long-term game. Keep it short.
  - `docs/ideas.md`: every idea, one short entry, in Now / Next / Maybe / Dropped (each dropped
    one with a one-line reason). New ideas go here.
  - `docs/decisions.md` and `docs/history.md` as below.
  - GitHub issues only for concrete work that's ready to build, and bugs. Old idea issues 1 to 13
    aren't kept up to date; don't clean them up.
  When the direction changes, update both docs (and their artifacts) in the same turn.
- Commit every change and push it to master right away (Mike, 2026-11-17: "you can be pushing stuff as we go"). Push with `git -C /Users/mdelmonaco/GitHub/clanker-tycoon push`, which the local settings allow.
