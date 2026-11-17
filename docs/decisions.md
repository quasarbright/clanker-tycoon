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

**Evidence:** [the Apple experiment](experiments/2026-11-14-apple-on-device-model.md),
[the Haiku experiment](experiments/2026-11-14-haiku.md), and
[the shared test suite](experiments/2026-11-14-intelligence-suite.md). (Copied from their own
folders, `~/GitHub/clanker-tycoon-fm-experiment` and `…-haiku-experiment`, which hold the code.)

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

### 20. Talking is free; only a worker's own thinking spends the budget (2026-11-16)

**Question:** should your messages and yells draw on a worker's thinking budget?
**Picked:** no. You should always get an answer when you talk to someone. The budget (3 thoughts,
one back every 20 s; Smart holds 5, one back every 12 s) only limits thinking a worker starts on
their own: something unexpected, or think() in their program. Out of budget, they come to your desk
instead. A problem that returns within 45 s of thinking about it also sends them to your desk.

### 21. A stalled floor is "unexpected" for everyone (2026-11-16)

**Problem:** in the first real full-floor shift, Doris's program packed only while the order needed
3 or more green boxes (`needs("green") >= 3`), so after one box she waited forever, Pack filled up
and Vex could never put anything down. Nobody failed an action, so the "stuck" rule never fired.
This was the leftover bug from the writing-rules experiment.
**Picked:** if nothing on the floor is picked up, put down, packed, painted or serviced for 15 s, every
worker gets an unexpected "stalled" to think about. Cheaper than a dry run and catches jams between
workers that no single program can see. The prompt also now says needs() counts boxes on a boxes
order. After both changes the same instructions finished the order in 64 s.

### 22. Workers are told about skills they don't have (2026-11-16)

**Problem:** Blip (no skills), told "pack the red widgets into boxes and ship them", came back with a
program that quietly skipped packing. The prompt only listed the tools Blip had, so the model never
wrote pack(), and the skill check had nothing to catch.
**Picked:** the prompt lists the floor's primary work the worker can't do, marked with the missing
skill, and says to write it in anyway when the instructions ask for it. The checker then turns it
into a compile error on the card: "they ask for packing, and Blip doesn't have the Packing skill."


### 23. The worker card is a conversation (2026-11-16)

**Problem:** Mike's first playtest: "the visual feedback and UX on giving instructions and waiting
for them to be ready is unclear and awkward ... in general all the communication UX is very
awkward." Instructions lived in a textarea whose Give button looked the same before and after
giving them, "reading instructions…" was small gray text, the reply was a floor bubble that faded,
talk went in a separate box, desk visits in a panel under the floor, and everything else in a
"floor radio" log.
**Options (mocked side by side):** A, keep the instructions box and pin the worker's answer under
it; B, make each card a short chat with that worker, one text box sent either as instructions or
as plain talk, with the current instructions pinned at the top.
**Picked:** B, because it gives every kind of exchange one place: instructions, replies, problems,
one-offs, changed instructions, desk visits and yells all land in that worker's card. A chip in
the header says where they stand (Needs instructions, Reading, Ready, Can't do this, Working,
Thinking, At your desk), the pinned instructions' edge has the same color, and Start waits while
anyone is still reading, with each worker's state listed next to it. The floor radio and the desk
panel are gone.

### 24. Workers say what's wrong in their own words (2026-11-16)

**Problem:** "Bolt can't do these instructions: I couldn't make sense of them. Try saying it
another way." didn't say what was wrong.
**Picked:** the compile answer has a "problem" field: when the instructions ask for work they lack
the skill for, or are really unclear, the worker says so in their own voice, naming the part and
asking the question that would clear it up. When no working program comes back after a repair, one
more small call asks the worker to explain the failure out loud. Replaces the canned error and the
"they ask for packing…" text from #22 (the prompt no longer tells the model to write the missing
work in; it says so in "problem" instead, and the checker stays as a backstop).

### 25. Shifts instead of stars; no one robot can do everything early (2026-11-16)

**Problem:** "the best strat is just to have bolt do the whole job." Bolt (and Doris) had every
skill. And "get rid of stars and stuff. that'll be subsumed by quotas and promotions."
**Picked:** stars are gone. Crew levels have a shift length instead, and the order must ship before
it ends: Crew is 45 s, which a hauler and a packer make (35 s with hand-written programs) and one
packer alone can't (48 s); Full floor is 2 minutes. Doris and Bolt are out of the early hiring
pools, so every early hire has at most one skill and Full floor needs a painter, a packer and
someone who can service the machine (or you). By-hand levels have no clock limit. The end card says
"Order filled" with your time, or "Shift over" with what shipped. Quotas and promotions are the
long-term version of this.

### 26. Paint wears out after the first job (2026-11-16)

**Problem:** "on the manual paint level, we should have it break down after the first paint to
teach about repair."
**Picked:** the Paint level wears 100% per job, so the machine stops after the first widget and the
coach explains servicing. The separate Upkeep level was the same lesson and is folded in; the game
is five levels now.

### 27. Try again keeps your crew (2026-11-16)

**Problem:** "try again should basically bring you back to shift start with all your staff and
instructions ready to edit."
**Picked:** Try again (and Restart shift in the pause menu) starts a fresh shift with the same
hires, their current instructions and the routines they already worked out, so you can press Start
right away or edit first. Opening a level from the level list still starts empty.

### 28. One conversation, no instructions-versus-message split (2026-11-17)

**Problem:** Mike, on the chat card from #23: "I don't like the concept of initially writing
instructions versus messages. I think the whole thing should just be a conversation, and the first
message is instructions, and then subsequent messages, the agent decides whether to update their
instructions or not." Then: "before a shift, we still have to make sure that there is an indication
if the worker is not going to be able to perform that task. So like they should turn green once
everything is good, but be red until then."
**Picked:** the card has one text box and one Send. Until a worker has working instructions, what
you say is read as instructions (with the earlier conversation, so an answer to their question
counts); after that every message goes to the same respond call as before, and the worker decides
whether it's talk, a one-off or a change to their instructions. The worker writes the instructions
down as one short sentence in your words, pinned under the conversation. Before the shift each card
is outlined red until the worker has instructions they can do, yellow while reading, green when
ready. Replaces the two buttons and the Edit link from #23.

### 29. A crew list and one open chat, like a messages app (2026-11-17)

**Problem:** Mike: "having all of these chats one above the other" is awkward; make it "more like
iMessage ... where you see their icon, their name, and their status ... And clicking an agent in
the game can expand their chat window."
**Options (mocked):** A, the list on top of the sidebar with the open chat under it; B, the list or
one chat with a Back button, like iMessage on a phone.
**Picked:** A ("I like A"), with B's behavior on phones where there isn't room for both. Each row
has the face, name, status chip, the last line said, an unread dot, and before the shift the red
or green edge. Hiring moved into the list as its last row. Replaces the stacked cards from #23.

### 30. No meter for a worker's own pauses (2026-11-17)

**Problem:** a repairman told to service the machine when it needed it stood still with a bar
filling over and over. His routine was "check, wait a second, check again", and the bar was the
countdown on each wait(). Mike: not a bug, but "I don't think that's the best way to indicate
waiting".
**Picked:** wait() shows no meter. Waiting on something (a widget at the belt, room at Pack) still
has its meter until Mike picks a replacement from the three mocked (a bubble showing the wanted
item, a dashed outline in their hands, or the robot watching the station).

### 31. A play log of every shift (2026-11-17)

**Question:** Mike: "I want you to be able to know what I'm referring to and deep dive the play log
when I talk about something that happened." Only model calls were logged, with no way to tell
which shift they came from.
**Picked:** the game posts a line for everything that happens in a shift to the local server,
which appends it to `logs/play/<date>.jsonl`: the level and crew, every line of every
conversation, instructions as workers wrote them, your moves, every sim event, a snapshot every
5 s, and the result. Lines and model calls share a shift id. Automated test browsers don't log
unless asked, and their lines are marked `test`. The repo's CLAUDE.md says to check the play log
first when Mike mentions something from a playthrough.

### 32. No side stripes (2026-11-17)

**Problem:** Mike: "i don't like this left border thing, idk why you use that so much", about the
red/green stripe on crew rows (and the stripes on the instructions and one-off boxes).
**Picked:** all left stripes are gone. The open conversation's whole row is lit; readiness before
the shift is the status chip's red or green. Also added to the workspace UX-CHECKLIST.md.

### 33. Waiting is said in words (2026-11-17)

**Problem:** the meter that filled while a worker held on at a station (for a widget, a box, room,
3 to pack). Mike rejected a speech-like bubble ("makes it seem like he's about to talk") and two
quieter signs ("none of those are obvious").
**Picked:** "say it with words": a small tag under the worker's name, an hourglass, "waiting for"
and the item (a colored dot, "a box", "room", "3" and a dot). Work that takes time (packing,
painting, servicing) keeps its bar. Replaces the waiting half of #30.

### 34. Hiring lives in the crew list (2026-11-17)

**Problem:** Mike: the empty Crew box with only a "+ Hire" row "shouldn't show until we have at
least one employee. the whole hiring vs messaging flow is kind of awkward", and the Hire row "is
useless when the crew window is open".
**Picked:** one list. Before anyone is hired it shows only the people you can hire, each with a
Hire button on their row. Hiring moves them up into Crew and opens their chat; the rest stay
under Hire until the shift starts, then that part goes away. Replaces the Hire row and panel from
#29.

### 35. The quarter: a quota, a few shifts and a budget (2026-11-17)

**Question:** before building progression, prove the money-against-crew tension in one sandbox.
Mike: "a 'cycle' has a quota, and you have some amount shifts in a cycle to accomplish the quota,
and a budget/starting amount of money ... maybe deadline or quarter or something?" Keep shifts as
they are; no personalities or disruptions yet.
**Name:** a **quarter**. It fits the corporate satire and the dollar-eyed boss.
**Picked:** level 6, "First quarter", on the full floor:
- **Quota:** 24 red boxes and 9 blue over **3 shifts of 2 minutes**. The belt brings only red, so
  every blue box is three paint jobs and the paint machine wears (10% a job).
- **Budget: $120.** Wages come out by the second while a shift runs. Hiring costs **one minute of
  the wage** up front; letting someone go before they've worked a shift gives it back, so a
  misclick is free. You, on the floor, are free labor.
- **Start waits until the budget covers the whole shift's payroll.** Options were letting money go
  negative, stopping the robots when it runs out, or this. Running dry mid-shift would be bad luck
  after your decisions; this keeps it a planning problem (the same reason as predictable wear).
- **No revenue per box.** The budget is a labor budget, and money left when the quota's met is the
  score. Income from shipping is the obvious next step once progression needs money to flow (#9).
- **Between shifts** the crew and their instructions stay, what's shipped carries over, and the
  floor starts fresh. You can hire, let people go and change instructions. The quarter ends as soon
  as the quota ships. End cards: "Shift N done" (Next shift / Replay this shift), "Quota met" or
  "Quota missed" (Try again starts the quarter over with the same crew, fees charged again).
- **Belt twice as fast here (1.6 s).** At the normal 3.2 s two workers already empty the belt, so a
  third hire ships nothing more (measured: 13 boxes a shift for every crew of two or more). At
  1.6 s a hauler and a packer ship 14 a shift and two haulers and a packer ship 25.
- **Dot,** a second cheap hauler ($3), so crew size is a real choice.
**Evidence** (`tools/balance.mjs`, hand-written programs): small crews miss (two haulers and a
packer ship all the red and no blue), big crews run out of money by shift 2 (everyone at once is
$37/min), and the middle makes it: painter + hauler + packer meets it in 3 shifts with $25 left;
haulers for a shift then painter + repair in 2 with $36; servicing the machine yourself with
painter + hauler + packer in 2 with $46. In a browser with real model-written instructions, Blip,
Pip and Vex (no one servicing) shipped 19, then 11, then missed by 3.

### 36. Thinking can't widen a worker's instructions (2026-11-17)

**Question:** in play, Pip (told "pack red boxes and ship them") got the "nothing has moved for 15
seconds" nudge, and his thought answered with *new instructions* that added fetching from the belt.
Thoughts were allowed to change instructions (auto-approved), and the stray-station check compared
the new program against the instructions Pip had just written for himself, so it passed. Mike's
goal for this step: "success or failure should clearly trace back to the player's instructions."
**Options:** keep auto-approving thought changes but check them against the old instructions; let
thoughts only do one-offs; or one-offs only inside the instructions, everything else to the desk.
**Picked:** the last. A thought of the worker's own can talk, do a one-off inside the instructions,
or come to your desk; "change" isn't one of its choices. Only a message or yell from you changes
instructions. Every program (compile, one-off, change) is checked against what you actually said
(`scope`: the instructions as you gave them, plus messages that changed them), not the worker's
rewording on the card. A one-off from thinking that strays gets one repair ("choose boss instead"),
and if it still strays the worker comes to the desk.
**Evidence** (`tools/thinking-check.mjs`, real model, 4 runs): Pip stalled with nobody hauling came
to the desk 4/4 ("fetching from the belt isn't in my instructions, so should I start doing
that?"), never changed his instructions or walked to the belt. Told "fetch them from the belt
yourself", he changed them 4/4.

### 37. A dry run before a worker takes a program (2026-11-17)

**Question:** about 1 compiled program in 10 never makes progress (the language experiment's "only
ships boxes nobody packs"). Catch it before the shift, in the worker's own words, chip red.
**Options:** run the whole crew together (a packer with no hauler hired yet would fail, which is
the crew's fault, not their program's); run the worker alone (same problem); or run the worker
alone with a **stage hand** that keeps their inputs in reach.
**Picked:** alone with a stage hand: widgets of the wanted color on the belt and at Pack, room left
at Pack, and a finished box at Pack unless the instructions ask this worker to pack (so "pack and
ship" that only ships still fails). Progress means putting something down, packing, painting or
servicing; picking up alone isn't enough. 40 game seconds, plus a second try with the paint machine
worn for repair-only workers. Failure gets the same one repair as other model mistakes; the repair
may say the boss really asked for no work ("run around in circles"), which is then done, since
clear instructions get done. Otherwise the worker explains in their own words. Mid-shift changes
from you get the same check.
**Evidence:** `tools/dryrun-test.mjs` (hand-written programs: haulers, packers, a shipper, a
painter, a repair worker pass; only-ships, ends-early and a tight loop fail). Of 102 programs in
`logs/llm.jsonl`, it flagged one: "run around in circles", which the repair now accepts. In the
game, "pack, but only while Gary-7 is at the dock" with no Gary hired came back red: "I keep
waiting at PACK and never get to packing because Gary-7 isn't standing at the dock."

### 38. A line lead's budget only goes down; leftovers are parked (2026-11-17)

**Question:** in the progression mocks, the between-shifts card showed money spent against a pace.
Mike: a "line manager shouldn't worry about how much money is earned by selling, that doesn't
really make sense. I think just a dwindling budget for the quarter makes more sense, and quota is
the thing that should go up."
**Picked:** the quarter shows quota going up and budget left going down, with no revenue in view.
Grades no longer count "over budget" as a miss, since Start already waits for payroll (#35).
What happens to money left at the end is undecided; Mike's lead is that it goes to you, for your
own little house you see between shifts. Replaces the "capital" fund in the first draft of
`docs/progression-design.md`.

### 39. You buy your promotion with the budget you didn't spend (2026-11-17)

**Question:** what leftover budget is for (parked in #38, with "your own little house" as the lead).
Mike, looking at the review mock: "oh wait you use your money to buy a promotion, screw house lol".
**Picked:** a quarter that meets quota puts its unspent budget into your savings; a missed quarter's
leftover goes back to the company. Each rank's promotion has a price, and you buy it from the boss
once savings cover it. This replaces the beat/met/missed grades and promotion credits in the first
draft of `docs/progression-design.md`: the money already says how well you did, and finishing a
shift early saves that shift's payroll. The house idea is dropped.

### 40. No Shift supervisor rank: Line lead goes straight to Plant manager (2026-11-17)

**Question:** the first progression draft had five ranks, with Shift supervisor (two lines on one
floor, training and foremen) between Line lead and Plant manager. Mike: "this kind of feels like it
shouldn't exist. maybe straight from line to plant?"
**Picked:** four ranks: Floor hand, Line lead, Plant manager, Director. Training and foremen move
to late in Line lead, so you practice delegating while you're still on the floor. Plant manager
starts with two lines (your old one under the foreman you left, plus a new one) and grows to 3 to 5.

### 41. Plant manager: between shifts, splitting orders and budgets, no repairs (2026-11-17)

**Question:** what a Plant manager controls. The draft proposed shared resources between lines (one
supply belt, a floating repair robot) so foremen would bring conflicts to your desk mid-shift.
**Mike:** likes headcount, moving people around, and allocating the plant's budget and corporate's
big order into per-line budgets and quotas. Repairs stay a line's problem ("I don't think we should
think about repairs when we're a factory manager"). Foremen talk to you between shifts only, and
lines can be a deterministic simulation instead of the whole tree. Moving people should exist at
Line lead too: "somebody that you've hired gets sent away and then maybe sometimes people get sent
to you."
**His worry:** "you're not really talking to anybody or giving instructions that much, you're kind
of just setting quotas, which is like not that fun. It's kind of just a generic business game."
**Picked:** the above, with transfers between quarters at Line lead. How to put talking and
instructing back at the center of Plant manager is open; six ideas are in
`docs/progression-design.md`. Replaces the shared-resources version.

### 42. Never leave the floor: promotion grows the floor (2026-11-17)

**Question:** every version of Plant manager so far (a dashboard of lines, shared resources with
desk conflicts, between-shift meetings) drifted into managing numbers. Mike: "gameplay at a higher
level doesn't feel like gameplay at a lower level, and gameplay at a lower level is what really
makes us special, like the whole give people instructions type of thing. When it gets too
managerial, it becomes a spreadsheet simulator, which isn't really that fun." He also suggested
lines that feed each other: "one line is building boxes and then another line is combining boxes
into other shit."
**Picked:** Plant manager stays on the floor. The floor grows into stages joined by belts, each line
run by a foreman robot who writes its crew's instructions, visible on their cards. You brief
foremen, watch the result travel down the chain, and debug by tracing it back. Splitting the
budget and moving robots is a short step between shifts. Replaces the Plant manager design in #41
(its calls on budgets, transfers and repairs still stand). Added to CLAUDE.md as a principle.

### 43. Symmetry between ranks (2026-11-17)

Mike: "it would be cleaner if anything that you do to your subordinates at some level is something
that your superior did to you when you were at that level ... in some cases that symmetry is nice
unless it is a stupid idea." **Picked:** quotas, budgets, transfers and briefings in words all reach
you from the boss at Line lead before you hand them out as Plant manager. Standing rules are the
exception: the boss doesn't give the player robot-style rules. In `docs/progression-design.md` and
the repo CLAUDE.md.
