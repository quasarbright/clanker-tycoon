# Clanker Tycoon: vision and principles

Keep this file current. When Mike states a principle or a direction ("nothing should wait without
moving", "tutorials stay minimal"), add it here in the same turn, without being asked. The
workspace `~/GitHub/CLAUDE.md` and `DESIGN.md` still apply on top of this.

## Vision

A factory management game where you run a floor staffed by AI robots. You write each robot's
instructions in plain English; the model turns them into a routine and the sim plays it out. The
long-term goal is a continuous career mode: start on one line, develop your people, delegate to
managers, grow into something bigger (issue #3). Realistic enough to be interesting, but fun and
game-y in the right amount.

Right now the game is a short, level-based tutorial that works out the core mechanics. Long-term
systems (money, skill growth, morale, hiring and interviewing, managers, the business side) live in
GitHub issues on this repo, one topic per issue, and don't get built until Mike asks.

## Principles

**Workers**
- Workers follow instructions. Clear instructions get done, every time. They do what they're told
  and nothing more: no extra steps, no "helpful" side work, no unrequested trips to your desk.
  (Haiku's habit is to "help": a packer told to pack and ship also fetched widgets and jammed the
  line. `brains.js` sends back any routine that visits a station the instructions don't mention.)
- Talking and yelling don't change a worker's routine unless you actually give new instructions.
  "Great work" is not an order.
- The comedy is in their voices and personalities, and in orders that really are vague. Never in
  workers being unable to do basic things. (Stacked handicaps made Blip "completely useless".)
- What you write for a worker is called **instructions**. "Job" is reserved for a long-term role.
- Each worker gets their own instructions.
- Skills are mechanical (Fast, Careful, Patient) and visible on the worker. Personality is flavor.
- Workers cost money (wages), even while the bigger money system is parked.

**Feel**
- Nothing just waits without moving. Anything that takes time shows its progress: packing fills a
  box in, painting, fixing a jam, a worker waiting for something. A still screen reads as broken.
- Simple actions are instant: picking up and putting down take no time.
- You can use a station from any side.
- The factory floor stays in view; scrolling the crew list doesn't scroll the floor away.

**Levels and tutorials**
- Tutorials are minimal: just enough to get the idea across, nothing more (level 2 is one box;
  the paint level is two red widgets painted blue).
- Every new machine shows up first in a level where you use it yourself.
- Introduce one idea at a time: one color until boxes are understood, no paint before that.
- A level is a fixed order, scored by time. You press Start to begin; hiring happens before Start
  and closes once the shift runs. You can still change instructions and talk mid-shift.

**Controls**
- Tools should let you choose what they act on: at Pack you pick which 3 widgets get boxed.

## Working on this repo

- Run: `node server.mjs`, open http://localhost:8473. Model calls go through `claude -p` on Mike's
  plan; `src/llm.js` also has an OpenRouter path for a future web build.
- Every model call is appended to `logs/llm.jsonl` (gitignored). Read it when Mike reports a worker
  doing something odd.
- `tools/player-check.mjs` and `tools/balance.mjs` play levels headless for star times.
- Ideas go in this repo's issues, one topic each; check for an existing issue first.
- Commit every change; push only when asked.
