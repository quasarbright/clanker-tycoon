# Decision log

One entry per real decision, in the order they were made. Each says what we were deciding, what we
considered, what we picked and why, and where the evidence is. Entries aren't rewritten when a later
decision overrides them; the later entry says what it replaces. The story around these is in
[history.md](history.md); the current design is in [worker-agent-design.md](worker-agent-design.md).

---

### 1. Haiku, not Apple's on-device model or a decision model (2026-11-14)

**Question:** what powers the workers? Candidates: Claude Haiku 5.5, Apple's on-device model
(free, local), or JEV (a fast model that only picks from a fixed list of actions).

**Evidence:** two experiments on the same 8-task intelligence suite (a toy factory with scripted
scoring). Apple's model scored 26/60, Haiku 59/60. Apple's was faster to first token (about 0.8 s)
but ran one request at a time for the whole machine, had an 8K context, and its guardrails blocked
about half of the workplace-comedy prompts. Haiku took about 5 s per call, mostly thinking time.
JEV can't read or write language, and the game is all language.

**Decision:** Haiku. Apple's model is good at dialogue but can't plan; JEV can't talk.

**Evidence:** `clanker-tycoon-fm-experiment/REPORT.md`, `clanker-tycoon-haiku-experiment/REPORT.md`
(sibling folders in `~/GitHub`).

### 2. A local prototype on the Claude plan, built to port to the web (2026-11-14)

**Question:** how to run it while developing, without paying per call?

**Decision:** a tiny local Node server that runs headless Claude Code (`claude -p`), which bills to
Mike's Claude plan. The game itself is a static page; every model call goes through one function
(`src/llm.js`) with a second backend (OpenRouter) for a future web build. The server holds no game
logic, so porting means deleting it.

**Also learned:** there's no "Sign in with Claude" that lets a web app use a player's subscription
(Anthropic blocked that in 2026), so a web build would use OpenRouter keys
(quasarbright.github.io#271 for OpenRouter's own login).

### 3. Workers follow instructions; this is a management game (2026-11-15)

**Replaces:** the original pitch (quasarbright.github.io#212), "manage a team of deliberately dumb
AIs", where dumbness came from handicaps: one worker misheard 35% of orders, saw only their own
station, and dropped things 15% of the time.

**Why:** Mike: "blip is just completely useless. way too dumb. i want the workers to actually follow
instructions." Stacked handicaps made workers fail at basic things, which isn't funny, just
frustrating. And reliability is what makes managing them a game.

**Decision:** clear instructions get done, every time. Comedy lives in their voices and in genuinely
vague orders. The challenge moves to the management side.

### 4. "Instructions", not "job" (2026-11-15)

What you write for a worker is their **instructions**. "Job" is saved for a long-term role a worker
holds, which doesn't exist yet.

### 5. Long-term ideas go in GitHub issues, one topic each (2026-11-15)

Skills, morale, career mode, managers, hiring, the business side and so on are filed as separate
single-purpose issues on this repo and not built until asked. The repo was created for this.

### 6. Fixed orders scored by time; you're on the floor yourself (2026-11-15)

**Replaces:** an open-ended shift where you made as much money as you could in four minutes.

**Decision:** each level is a set order ("3 green boxes and 2 red"), scored by how fast you fill it.
You're a character who walks the floor and does the work by hand. Every new machine shows up first
in a level where you use it yourself.

**Why (Mike):** "the first thing that should happen is the player should be able to walk around and
like do the factory themselves as if they were an employee."

### 7. Money is parked; the levels are a tutorial (2026-11-15)

**Tried and reverted:** start broke, earn by hand, hire with what you earn, carry money and crew
between levels, hire only between shifts.

**Why reverted (Mike):** "that whole 'grind for money' thing is for when we do long term." It
belongs to the long-term game (issue #9), not to levels that teach mechanics.

**Kept:** hiring happens only before the shift starts (Start closes it). Workers still cost wages
while the shift runs. Tutorials stay minimal: one idea each, just enough to get it across.

### 8. Nothing waits without moving (2026-11-15)

Anything that takes time shows its progress (packing fills a box in, servicing, waiting). Simple
actions like picking up are instant. A still screen reads as broken.

### 9. Workers do their part and nothing more (2026-11-15)

**What happened:** told "pack boxes and ship them", a worker also fetched widgets from the belt,
Pack filled up, and the line deadlocked. Haiku's habit is to help.

**Decision:** workers see their coworkers' instructions, the prompt says to do only your own part
(with that exact example), and a routine that visits a station the instructions never mention is
sent back once. Chat and yelling only change a routine when they're real new instructions.

### 10. Compile once, run deterministically, wake the model to think (2026-11-15)

**Question:** workers can't really think with a fixed loop, but Haiku is too slow to call every
moment. How do they get smarter?

**Options:** a richer language compiled once; calling the model on events; testing programs in the
sim; letting workers message each other; the model writing real code.

**Decision:** workers are agents that mostly run a deterministic program and are woken to think on
unexpected events, messages, or an explicit `think`. This matches how current robots are built (a
fast controller plus a slow planner: Figure's Helix, NVIDIA's GR00T, Physical Intelligence's
Hi Robot; Code as Policies; Inner Monologue). Mike: "employees should basically be AI agents that
mostly act deterministically and sometimes the model is 'woken up' to think."

**Not chosen:** the Claude Agent SDK. It still spawns Claude Code per call, can't turn Haiku's
thinking off, and its docs point SDK-built apps to API keys rather than a subscription login.

### 11. One-off steps by default; instruction changes are visible (2026-11-15)

**Problem:** a direct message silently either replaced the routine or didn't. Mike: "I wouldn't
expect this to permanently alter the routine always."

**Decision:** a message or a thought returns one-time steps by default, then the worker goes back to
their program. When it does change their work, it rewrites the instructions on their card, so the
card and the robot never disagree. Auto-approved for now; temperaments may change that later.

### 12. The program is never shown to the player (2026-11-15)

Mike: showing it "will make it harder to make programs more complex." The card shows instructions
and what the worker is doing, not code.

### 13. Thinking: on unexpected events, with a slowly refilling budget, shown with ? and ! (2026-11-15)

Workers think when something unexpected happens (a **?** over them) or when you message or yell
(a **!**). They keep working while they think. A budget that refills slowly keeps model calls in
check. They come to your desk when a thought says it needs you, or when the same problem comes back
after thinking.

### 14. Skills are actions; attributes are traits (2026-11-15)

**Replaces:** Fast, Careful and Patient as "skills".

**Decision:** skills are things a worker can do (Packing, Painting, Repair, …). Primary work without
the skill is a compile error before the shift; side tasks (servicing) just do nothing. Attributes:
Fast, Strong, Nimble, Steady, Smart. Everyone is careful, patient and has a long memory. No cheap
downside traits ("annoying in a non fun way"), nothing we can't really control (thinking speed) or
define cleanly ("notices problems").

### 15. The LLM backend stays swappable (2026-11-15)

Nothing in the design, prompts or worker language may depend on Claude or Haiku. Everything goes
through `src/llm.js`, text in and JSON out.

### 16. Worker programs are a JavaScript subset (2026-11-15)

**Options:** JSON rules (my first proposal; Mike found it too restrictive), a small Lisp, or a
JavaScript subset, interpreted by us either way.

**Evidence:** 48 compiles on Haiku, same tasks and tools. Both languages were always valid with no
repairs and equally fast, but JavaScript programs did what the instructions asked 24/24 against
19/24. A follow-up of 40 more compiles showed the "overreach" gap was mostly noise (both do it), but
Lisp's "never packs" bug was real: 7 of 13 Lisp programs on one task against 0 of 13 in JS.
Haiku never wrote JS outside the subset.

**Decision:** a JavaScript subset, parsed with acorn, interpreted by us as a coroutine.

**Evidence:** `tools/lang-experiment/REPORT.md`.

### 17. Writing rules in the compile prompt (2026-11-15)

**Evidence:** five rules (do your part only, choices in variables, numbers from the questions, no
extra steps, trace one pass) took clean JS programs from 29/40 to 38/40 at no cost in time.
Overreach went to zero. One "never makes progress" program in 10 remains, for the runtime to catch.

**Evidence:** `tools/lang-experiment/REPORT.md`, "Prompting".

### 18. Predictable wear, not random jams (2026-11-15)

**Problem:** every program on the paint task added jam-fixing unasked, which raised whether random
jams were good design at all. Randomness that lands after you've decided can only be reacted to,
and the game's challenge is planning.

**Decision:** machines wear predictably (a visible meter, serviced by someone with Repair). Steady
means slower wear. Introduced in a manual level where you service the machine yourself. Issue #12.

### 19. Worker-to-worker messages wait for managers (2026-11-15)

A message from one worker to another would wake the recipient to think, so it's for decisions, not
routine coordination. The repair case is covered without it (full vision plus wear meters). It
belongs with bots managing bots (issue #6).
