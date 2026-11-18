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
- **Identity:** charming, cute, industrial, almost slapstick, in the spirit of the business license
  and its stamp, the end-of-run newspaper and the quarter recap's rubber stamps (Mike, 2026-11-18:
  "let's lean more into this going forward"; decision 80). New screens borrow from that world of
  paperwork, stamps and factory things.
- **Humor:** the punchline is one of the game's own mechanics, said in a dry, official voice;
  never a generic business joke. The gold-standard examples are in `docs/humor.md` (Mike,
  2026-11-18: "this is the gold standard").
- **Look and feel: charming, cute, industrial, almost slapstick** (Mike, 2026-11-18: "I like the
  direction we're going with the license and stamp and the newspaper ... let's lean more into this
  going forward, it'll be good for charm and personality and identity"). Paperwork and physical
  props that land with a thunk: the license and its APPROVED stamp, SHIPPED/MISSED stamps on the
  quarter recap, the newspaper on your floor. Lean into this for new screens.
- Robots call you by your name (the one you sign on the business license), never "boss" (Mike,
  2026-11-18). `ownerLine` in `src/brains.js` tells the model; "boss" is a banned word in the tests.
- Your money is **funds**, never "budget" (Mike, 2026-11-18: "should we even call it budget anymore? let's just say funds"). `WORDS.funds` in `src/words.js`; "budget" is a banned word in the tests.
- **Showing screenshots and mocks:** each screenshot or mock is its own full-resolution PNG (2x), saved to /mnt/project-files and numbered in order for sequences (1-…, 2-…). No combined images, no gallery pages or artifacts for them (Mike, 2026-11-17: one big image is awkward, hard to zoom, and loses quality; he reads on mobile). Every mock and screenshot carries a title and a one-line description, in the image itself or in its filename plus caption (Mike, 2026-11-17).
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
  "!" when a yell or a direct message got them thinking. Reading and thinking look the same
  everywhere (crew chip, status bar, chat, a tag over the robot): the word, pulsing. Never dots or
  a speech bubble, which read as talking (Mike, 2026-11-17, from Pam's playtest).
- Workers keep working while they think. A thought can't change their instructions (only a
  message or yell from you can, and that change is auto-approved and shows on the card). Later,
  temperaments like independence could let some workers act on their own judgment (issue #1).
- A direct message or a `think` can inject a **one-time** sequence ("grab that box first"), after
  which the worker goes back to their routine. Changing the routine for good is a separate, visible
  thing: it rewrites the worker's instructions on their card. One-off is the default; players
  shouldn't have to guess which one a message did: every reply to you ends in exactly one marker,
  "New instructions", "Changed instructions", "One-off: …" or "No change to instructions"
  (`EFFECTS` in `src/main.js`).
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
- **You arrange your own floor** (Mike, 2026-11-18: "Maybe we should have a factory
  builder/editor where you can drag the stuff you own around. And when you buy something new you
  can place it down"; decision 85, which replaces "no factory building"). Editing happens during
  scheduling, before a shift, never mid-shift. Multiple factories and buying a factory are later.
  Built (decision 87): `src/floor.js` (slots, swap, storage), Edit floor in the plan bar; a bought
  machine waits **In storage** and Edit floor pulses until you place it or "Keep in storage" (Mike).
  You can own two of a machine ("Paint 2"), each with its own wear.
- Delegation comes from scale, not rules: you can only talk to one robot at a time.
- Runs are endless (Mike: "the contracts get crazier and eventually they'll die"). Growing bigger
  can't mean a new first-class concept per tier: foremen are one, and there's only room for a few.
- Story and writing wait for the polish phase, once the mechanics are settled.
- **Reputation ends a run** (decisions 78, 79, 81; built in `src/reputation.js`): 3 pips, a missed contract loses a whole one, a shipped
  Small (or side) contract wins back a third and a Large one two thirds; a miss is always a whole
  pip (Mike, 2026-11-18: "big contracts can give 2/3 reputation back but still -1 on miss"). Less reputation means smaller quotas and less pay
  (forgiving by default; 40% of size and pay under 1 pip). At zero, and only at zero, no client
  signs with you and the run ends; a miss never takes you below zero. At one pip and below the
  board warns in red that one more miss ends it (decision 84).

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
  The business layer and the UI too (decision 83): `run_start`, `license`, `board` (offers with
  full and scaled numbers, funds, reputation, loans, crew), `pick`, `recruit`, `train`, `buy`,
  `borrow`, `quarter_start`, `quarter_settle` (each contract, crew pay, funds and reputation before
  and after), `gameover`, `new_run`, `pause`/`resume`, `restart_shift`, `end_card`, `menu`,
  `chat_open`, `start_blocked` (with why), the floor editor (`floor_edit`, `floor_move`,
  `floor_done`, `floor_keep`, `floor_auto`), and `error`/`llm_error` (uncaught errors, console.error,
  failed model calls). Mike (2026-11-18): logs "pretty comprehensive, so if I do a playtest and then
  I report that something was weird ... you will be able to look at logs".
  When Mike mentions something that happened in play ("Blip just stood there"), find the shift in
  the newest play log first and read what happened, before asking him:
  `node tools/playlog.mjs` lists sessions, `--session <id>` or `--shift <id>` prints the timeline
  (with that shift's model calls). The web build (Pages) has no server: it keeps the log in the
  browser (memory and localStorage, model calls included without the key), and a small "Download
  log" link at the bottom left saves it as a .jsonl Mike can send; `tools/playlog.mjs <file>` reads it.
- Every model call is appended to `logs/llm.jsonl` (gitignored), tagged with the same `shift` id
  (`test: true` for automated browsers, which don't write play logs unless the URL has
  `?playlog`). Read it to see what a worker was told and decided.
- A tab left open across an update shows a "game was updated, Reload" banner (`/api/version`).
  When Mike reports something that doesn't match the current code, suspect a stale tab first.
- **One place for each thing** (Mike, 2026-11-17: "you should be using abstractions so that you don't
  have to make the same change in multiple places ... whenever I tell you to do something, you
  should have some process to make sure it's done everywhere, and we should also have tests"):
  - Player-facing terms live in `src/words.js` (static labels use `data-word`); one renderer per
    repeated thing (`ticketHTML` for order tickets). Add to these instead of writing a copy.
  - For every request: search the whole repo (code, levels, index.html, docs) for every place it
    touches, change all of them, and list the places in the report to Mike.
  - Every request gets a test that fails if it regresses (`test/words.test.mjs` fails if a term is
    spelled out outside `words.js` or "hire" reaches the player).
- **Tests** (Mike, 2026-11-17: "I generally want to have test coverage so we don't end up introducing
  bugs or regressing"): `npm test` runs everything; `npm run test:unit` is the fast part.
  - `test/*.test.mjs` (node:test): level 7's money logic, the sim, the usage log, and compiling and
    thinking in `brains.js` against a fake model (`useFakeLlm` in `src/llm.js`).
  - `tools/lang-test.mjs` and `tools/dryrun-test.mjs`: the worker language and the dry run.
  - `e2e/*.spec.mjs` (Playwright 1.63.0, its own server on port 8981): level 7 in a browser, with the
    model faked through `window.ct.useFakeLlm`. No real model calls in any of these.
  Every change comes with tests for what it changes, and `npm test` passes before every push. A bug
  gets a failing test first.
- **The web build** talks to OpenRouter from the browser (`src/openrouter-auth.js`, decision #65).
  The key is `localStorage["quasarbright:openrouter-key"]`, shared with every Mike site; never use
  another name. `node tools/openrouter-check.mjs` makes real calls with the key in `.env`
  (gitignored; never print, log or commit it).
- **Blind playtest** (Mike, 2026-11-17: "the playtester should be blind every time"): after a
  meaningful gameplay change, a fresh subagent gets only the game URL (the live Pages build, or
  localhost) and what a new player knows, plays a run, and reports where it got confused, stuck or
  bored. No docs, no repo, no memory between runs; it's a testing step, not a persona. See
  the quasarbright plugin's `WORKING.md`, "Before you show it".
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
  When the direction changes, update both docs (and their artifacts) in the same turn. Build each
  artifact page from its doc with `python3 tools/docs_artifact.py <doc> <out.html> "<title>"` and
  publish it to the same URL: Ideas https://claude.ai/artifact/6wwzBb7YT9cetPi5ieUoJG, Progression
  https://claude.ai/artifact/9Xi6oVYWpbo8T9CWo3saHP.
- Commit and push to master after every major change, unless Mike says otherwise (Mike, 2026-11-17:
  "let's push after every major change pretty much, unless I say otherwise"; a "push" relayed from
  another session counts as his). `npm test` passes first. Push with a plain `git push` run on its
  own from the repo folder, which the local settings allow (`git -C … push` chained after a pull
  gets blocked).
