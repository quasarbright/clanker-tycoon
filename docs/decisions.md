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

### 44. One boss and a growing factory, not a rank ladder (2026-11-17)

**Question:** Mike: "Do you think that maybe this whole climb the corporate ladder thing is not
really going to produce the type of shit we want? ... the factory just kind of grows, would that
lend itself more to this kind of same type of gameplay just at a higher level". And: "since it's a
tycoon game, the concept of budgets and quotas is nice. Maybe you just have one boss that stays
your boss the whole game and you just keep doing bigger stuff."
**Picked:** no ranks to play through. The dollar-eyed boss sets every quarter's quota and budget
for the whole game. Unspent budget from a met quota becomes savings, and savings buy growth (a new
line feeding the others, a machine, a robot slot, a foreman's badge, training) instead of a
promotion. Growth raises the next quotas. Titles survive only as flavor the boss hands out.
Foremen arrive when the floor is too big to run yourself (#42). Missing twice shrinks the factory
(proposed). Replaces the ladder in #39 and #40.

### 45. The ending: you buy the company (2026-11-17)

The tycoon fantasy is the story's ending, not the gameplay: your savings eventually buy the company
out from under the boss, and the last scene is you as the dollar-eyed robot saying "Numbers must go
up." Mike: "I really love that final scene." Post-game, you keep running the company as owner.
Issue #14.

### 46. No factory building: pre-wired bays, routing by talking (2026-11-17)

**Question:** with lines feeding lines, you need supply bins, belts between lines and output belts.
Mike: "once you're a factory manager, you're going to want to be like creating multiple lines and
wiring things up and then we're gonna get kind of factory gamey there. I don't really love the idea
of that though."
**Picked:** the plant has a fixed layout of bays; a bought line arrives in the next bay already
wired. Flexible routing (shared supplies, overflow, which source a line pulls from) is told to a
foreman in words, never drawn. The only thing the player builds is instructions. Added to CLAUDE.md.

### 47. A flat rate per shift, not wages per minute (2026-11-17)

**Problem:** Mike, after playing the quarter: "Having charge per minute doesn't really make sense
when a shift is a fixed time limit, so we should just have a flat rate to hire someone for this
shift." He also confirmed the quarter ends when the quota's met ("yeah end on quota met"), with
what's left of the budget kept as savings, as #39 assumes.
**Picked:** each robot has a price per shift: $5, plus $5 for every skill and attribute (Blip and
Dot $5, Pip $10, Gary and Rusty $15, Vex $20). The crew's pay comes out of the budget when you press
Start, and Start waits until the budget covers it. No hiring fee, so there's nothing to refund.
Hire buttons turn off when adding that robot would put the shift over budget. The budget readout
no longer ticks down; it changes at Start. On the other levels "labor" shows the crew's cost for
the shift. Replaces the per-minute wage and the hiring fee from #35.
**Rebalanced** (`tools/balance.mjs`) to **$110**: hauler + packer and two haulers + packer still
miss the blue; painter + hauler + packer makes it with $5 saved; haulers for a shift and then a
painter with Rusty saves $45; servicing the machine yourself saves $40; everyone at once can't pay
for shift 3.
**Also from that playtest:** the conversation with each robot carries across shifts with a
"Shift 2" divider; the shift-end card shows what's still to ship as tickets; the belt says what it
brings ("brings ● red only", tooltip with its rate). Mike asked whether raw inputs should come from
fixed sources instead (and that belts will still link lines later). Not yet: the quarter's balance
leans on the belt's rate (it's the limit that makes a fourth hire useless), so sources wait until
lines feed each other and the supply question comes up for real.

### 48. Robots wear their skills; the page never scrolls (2026-11-17)

**Problem:** Mike: "let's make it so skills have visual indications that change the character's
appearance. like a paint brush or a box, and for smart we'll give glasses and for fast maybe a
lightning bolt. repairman can have a wrench." And "I should never have to scroll the whole page. rn
i have to scroll down to pick actions when i'm doing manual control ... the main page shouldn't
scroll at all." And "the stuff on the top right is actually the most important stuff. replace the
big quota indicator with that stuff, since the quota shows as orders."
**Picked:**
- Skills are tools carried at the robot's side (cardboard box, paintbrush dipped blue, wrench);
  Smart wears round glasses, Fast has a yellow bolt on its head. The same looks on the small faces
  in the crew list and chat (`src/looks.js`). Nimble and Steady have no look yet.
- The page is exactly the window's height and never scrolls. The floor shrinks to fit the height
  it's given; only the crew list and the chat scroll, inside their panels. The bar under the floor
  keeps the same height before and after Start so the floor doesn't jump. On phones the floor sits
  on top and the list or chat takes the rest. Checked at 1920×1080, 1440×900, 1280×720, 375×812
  and 390×664, in the menu, planning, running, by hand and at shift end.
- The top bar's center is the shift ("Shift 1 of 3"), its clock in big type, and the budget. The
  big shipped/quota count is gone; the tickets above the floor already show it.

### 49. Contracts and equipment; the boss becomes your investor (2026-11-17)

**Question:** Mike: "rather than you having a boss that sends you quotas, you're taking on
contracts and you're gradually growing your business. By buying new equipment and new factories and
stuff like that? That's pretty tycoon." And: "Equipment can also have its own attributes, like you
could pay more for something that's not going to break down as often, and then you have to weigh
the cost of labor breaking down with the cost of the better equipment."
**Picked:** you own a small factory business. You choose contracts from a board (what, how many,
deadline, pay, machines needed), so you choose your difficulty. Contracts pay, so money comes in
again. You buy machines with attributes (wear, speed, capacity), then whole lines into pre-wired
bays (#46). Foremen come from scale: with several lines and only one robot you can talk to at a
time, delegating is the obvious move rather than a rule. The dollar-eyed robot becomes your
investor, who fronted your starting money and wants a growing cut every quarter; buying him out is
still the ending (#45). Replaces the boss's quotas and budgets in #44, and "no revenue" from #38.
Symmetry (#43) is now a loose aim rather than a rule.

### 50. Two living docs instead of one idea per issue (2026-11-17)

**Question:** Mike: "My concern about issues is that some of them become out of date pretty
quickly. Like they're entire concepts that we're just kind of not doing anymore, and I don't want to
have to keep going around and cleaning the issues, but if there's just like a couple of docs, it's
easier to keep those up to date." Also: "the progression doc shouldn't get overloaded."
**Picked:** `docs/progression-design.md` stays short (the shape of the game);
`docs/ideas.md` holds every idea as a short entry in Now / Next / Maybe / Dropped, each dropped
one with its reason. Both are also artifacts. GitHub issues are only for ready-to-build work and
bugs; old idea issues are left as they are. Replaces #5.

### 51. Pack by color; Fast robots roll on wheels (2026-11-17)

**Problem:** Mike: "at packing, we should have an option to pack red or pack blue etc. just one
color type per box for now. bc right now if packing has a RBR you're fucked. shouldn't depend on
drop off order." Your Pack 3 button took the first three widgets in drop-off order, so red, blue,
red made a mixed box that counted for nothing, and picking widgets by clicking them wasn't obvious.
And on Fast: the lightning bolt "look[s] like Harry Potter", wings looked like "Albert Einstein
hair".
**Options for Fast (mocked on real robots at game size):** A wheels, B racing stripes, C speed
lines while moving, D sneakers.
**Picked:**
- At Pack you get one button per color there are 3 of ("Pack red", "Pack blue"), the colors the
  order still needs first. It takes 3 of that color from wherever they sit. A box is always one
  color: a robot's `pack()` with no color packs a color there are 3 of (the one the order needs
  first), never a mix. Clicking widgets at Pack to pick 3 is gone. Replaces the pick-3 control.
- Fast is A, wheels under the head ("I like wheels. have them turn when he moves"). They turn while
  the robot moves, backwards when it heads left. Replaces the bolt from #48.

### 52. A plain pause you can talk through (2026-11-17)

**Question:** how do you get time to fix a mistake mid-shift? One idea was freezing the floor
while a worker thinks. Mike: "Thinking freezing the floor is really awkward, and really bad for the
pacing of the game. I think plain pause is the way to go for now."
**Picked:** the pause button (or Escape) stops the floor for as long as you like, with no limit or
cost. The Paused card sits on the floor only, so the crew list and chats stay usable: you can talk
to robots and change their instructions while nothing moves. Resume, Restart shift and Levels are
on the card. Thinking never freezes the floor, and there are no speed controls.

### 53. A first prototype of the contract loop, on level 6's floor (2026-11-17)

**Question:** level 6's single quarter "works decently" (Mike). What's the smallest playable version
of the loop in #49: contracts, money that carries over, equipment with trade-offs, the investor?
**Picked:** a new level 7, "Your business", that opens on a contract board. No new lines, no
foremen, same floor and robots as level 6.
- **The board** offers three contracts at a time: an easy one, one that needs a machine, and a
  stretch. Each has an order (boxes of 3), a deadline in shifts and a pay. A contract needing a
  machine you don't own can't be taken; one that asks for more boxes than the belt can bring says so
  ("the belt only brings enough widgets for about 25 boxes a shift"), and you can still take it.
  Boards are written by hand, one per contract finished; past the last, the last one repeats at 15%
  more pay per win.
- **A contract plays as a quarter** (#35, #47): its order is the quota, its deadline the number of
  shifts, all your money the budget. Crew pay still comes out at Start.
- **Money carries over.** The investor fronted $100. When a contract ships, the client pays and the
  investor takes 10% (a flat cut for now; growing it is for later). A missed deadline pays nothing,
  and you see the same board again. You're free labor, so you're never stuck without money.
- **The shop:** you start with no paint machine (the floor has no Paint station until you buy one).
  Paint machine, $80, wears 10% a job; Sturdy paint machine, $170, wears 5% a job and replaces it.
- **The crew carries over** from one contract to the next, with their instructions.
**Evidence (`tools/balance.mjs`, hand-written programs):** board 1's red contract makes $78 to $88
after wages and the cut; its blue one $111 to $141 but first needs the $80 machine, which leaves
$20 for wages at the start, so you paint yourself or do the red one first. The 45-in-one-shift
stretch tops out at 25. On board 3, 12 blue in 2 shifts works with the sturdy machine and just a
painter and a packer, and needs servicing (you or Rusty at $15 a shift) with the cheap one; the
same for the 20 red + 15 blue contract. With you servicing for free, the sturdy machine only buys
you attention, which is the trade-off we want.
**Open:** late contracts (nothing, or partial pay?), whether the board should change after a miss,
and what happens when you can't pay the investor (he only takes a cut of pay for now, so you
always can).

### 54. Several contracts per quarter, one deadline, no overlap (2026-11-17)

**Question:** Mike: "what if you take multiple contracts with different deadlines? Or multiple
contracts with overlapping orders? Which contract should an output go to?" Options: a dock per
contract with robots told which dock to deliver to (routing by talking); a shipped box filling the
earliest deadline first; or Mike's: "just have a quarter and then you pick what contracts you want
to take this quarter and they all have the same deadline and no overlap in what they are asking
for."
**Picked:** Mike's. "It simplifies everything so much. The fewer decisions that workers have to
make and the fewer options they have, I think the better right now." Replaces the
one-contract-at-a-time board from #53.
- Each quarter (3 shifts) opens on a board of four contracts, each boxes of one color with a pay.
  You pick any number, one per color: picking a red one rules out the other red one. Blue and green
  need a paint machine (the belt only brings red).
- The picked contracts' orders together are the quarter's quota; all your money is its budget.
- At the end of the quarter, each contract whose boxes all shipped pays (minus the investor's
  10%); the rest pay nothing. A contract doesn't pay early.
- The next quarter always gets the next board, whatever you shipped. The note under Start warns
  when your picks ask for more boxes than the belt brings in a quarter (75).
**Evidence (`tools/balance.mjs`, every pick on every board, hand-written programs):** on board 1
everything fits in 3 shifts, so the limit is money: $100 buys the cheap paint machine with $20 left
for wages. On board 2, 55 red plus anything else misses with one hauler; picking all three colors
pays $720 if someone services the cheap machine, and only $495 with the sturdy one and nobody
servicing (green comes up short). On board 3, blue 18 plus green 20 is 38 painted boxes, more than
one painter makes in a quarter, so one of them misses whatever the machine.

### 55. The shift count and each contract's pay stay in view (2026-11-17)

**Problem:** Mike, on level 7: "you should see how many shifts are in the [quarter] somewhere more
prominent. For each contract in the top left, when you're on the factory floor, also show how much
money that's going to give you."
**Picked:** the top bar's "Shift 2 of 3" is now full-size text with a dot per shift (done, now,
still to come), on level 6 too. The board says under its title how many shifts the quarter has and
that every contract is due at the end of the last one. Each contract's ticket on the floor shows
its pay after the shipped count; once all its boxes have shipped the pay turns green with a check,
because that money is now coming at the end of the quarter.

### 56. Train your crew and take on more robots between quarters (2026-11-17)

**Question:** Mike: "the roguelike element of getting more people on the crew and also upgrading
their skills and stuff. Like training. But if you train too many things or somebody has too many
skills, they start costing more ... Maybe just after some threshold, not like a continuous thing."
Then: "Let's just do it now."
**Picked:** in level 7, the board has a Your crew section.
- You start with two robots, Blip (no skills, $5 a shift) and Pip (packing, $10). Only your crew
  can be hired on the floor.
- Take on more for a one-time fee: Dot $20, Gary-7 $40, Rusty $40, Vex $60.
- Train any of your robots in packing, painting or repair for $50 a skill. Trained skills work like
  their own (tools in hand, compile checks), and carry over to the next quarter, already-hired robots
  included.
- Wages: $5, plus $5 per skill and attribute, as before, and a robot's third skill adds $20 more.
  So Pip with packing, painting and repair costs $40 a shift, where Pip, a trained Blip and Rusty
  cost $45 together and work three times as fast. The rule lives in `src/wages.js` and applies
  everywhere; only Doris and Bolt already had three skills, and no level hires them.
**Why a jump, not a creep:** Mike asked for a threshold, and a jump keeps the first two skills an
easy call while making a do-everything robot a real decision.

### 57. A supply that never runs out instead of the belt (2026-11-17)

**Question:** Mike: "let's implement sources now so we don't have the belt. I don't want the belt
anymore right now, for raw materials at least."
**Picked:** on every level the belt is gone. In its place is a **Supply** station that gives out
raw widgets and never runs out: take one and another takes its place. It gives out the level's
colors, red unless a level says otherwise, so blue and green always mean painting. Nothing can be put
down at the supply. Programs say `move("SUPPLY")`; old programs that say "BELT" still work, and
"belt" in your instructions still counts as naming the supply. The conveyor drawn in from the left
wall is gone.
- Level 5 (Full floor) used to bring all three colors with green rare; now its supply is red only,
  so its green boxes need the painter. Its opening line says so.
- Level 6's faster belt (1.6 s, decision 35) and the board's "the belt only brings enough for 25
  boxes a shift" warning are gone with the belt.
**Evidence (`tools/balance.mjs`, `tools/player-check.mjs`, one live model run):** throughput is now
set by walking. Level 3 (4 boxes in 45 s): two haulers and a packer take 18 s, one hauler and a
packer 35 s, a packer alone runs out of time, as before. Level 6 barely moved, since the 1.6 s belt
was close to what two haulers carry anyway (24 red a shift either way); the one change is that
hiring everyone now finishes the quota in one shift with $55 left. In the browser, Blip and Pip,
told in plain words to "carry red widgets from the supply to Pack" and to pack and ship, compiled
and filled level 3 in 34 s.

### 58. The board as a roguelike shop: three of each, wide, no scrolling (2026-11-17)

**Feedback:** Mike: "Training is too expensive right now. Call it recruit instead of take on. And in
the staffing, don't say hire ... Also have a clearer division in the shop between training and new
hires and machines ... This is going to be a PC only game ... Ideally we shouldn't have to scroll in
the post-quarter view." And: "for a classic roguelike, only give choices between three employees to
recruit and three machine things. Let's also just have three contracts. A small contract, a bigger
version of that contract, and then a side contract that doesn't overlap ... some other visual
indication that makes it more obvious that one is a bigger version of the other." Then: "You should
also be able to buy attributes like fast and smart, similar pricing model, and wage model."
**Picked:**
- **Three contracts a quarter.** One card holds a contract in two sizes, Small and Large, of the
  same color; picking one size drops the other, so you can't try to take both. A second card is the
  side contract, in another color. Replaces the four-contract board from #54.
- **Three columns under the contracts: Recruit, Training, Machines.** Recruit and Machines each show
  three choices per visit (seeded per quarter, so they don't reshuffle when you buy one; a paint
  machine is always offered until you own one). Doris and Bolt are now recruitable, at $80 and $120:
  tempting, and expensive every shift.
- **Training is $20** (was $50), for a skill or a trait: Fast, Nimble, Steady or Smart. Each adds $5
  a shift, and a third skill or a third trait adds $20 more (the threshold from #56, now for traits
  too).
- **Two new machines** so there are three to choose from: a bigger pack table (Pack holds 9, $50)
  and bigger bins (10 each, $30). These are the first capacity upgrades.
- **Wording:** "Recruit" instead of "take on". In level 7 the floor's list says **Schedule** and
  **Off shift** instead of Hire and Let go, since they're already your crew. Other levels still hire.
- **Layout:** the board fills a wide window (up to 1380 px) and fits without scrolling at 1440x900
  and 1920x1080. At 1280x720 the three columns scroll inside themselves. Mobile isn't a target
  anymore ("PC only").
**Evidence (`tools/balance.mjs`, now four boards):** on board 1 both sizes pay with the starting
crew; from board 2 the large size or the large plus the side contract can lose money with a thin
crew (55 red with one hauler: $-45), and pays most with a full one.

### 59. Recruits come in three tiers, and you can train them right away (2026-11-17)

**Feedback:** Mike: "buying or recruiting cheap people that don't have skills and then building up
exactly the skills that you want them to have. So in the shop we should have at least one low-skill
worker and one high skill expensive worker and then maybe something in between ... It should also be
possible to train someone right after recruiting them."
**Picked:** the three recruits each visit are always one of each tier: a blank robot with no skills
or traits for $10 (Dot, or three new ones: Nib, Cog and Tock), one with a skill or two (Gary-7,
Rusty, Vex, $40 to $60), and one who can do everything (Doris $80, Bolt $120, and pricey every
shift). A tier with nobody left is skipped. A robot you recruit joins the Training column at once,
so you can recruit Cog and teach painting and repair in the same visit ($10 + $40, then $15 a
shift). Replaces the random three from #58.

### 60. A cheap recruit may come with one skill and one trait (2026-11-17)

**Feedback:** Mike: "The cheap employee should have a random chance of either being zero skills or
... one skill and maybe an attribute ... but not two skills and not two attributes."
**Picked:** each visit, each cheap robot on offer rolls its kit: a 60% chance of one skill and a
50% chance of one trait, so sometimes nothing, never two of either. The roll is fixed for the visit
(seeded by the quarter and the robot) and kept for good once you recruit them. The fee is $10 plus
$5 for each thing they come with, and their wage counts the kit like any skill or trait. Amends #59.

### 61. A lender instead of an investor, and a forecast before every quarter (2026-11-17)

**Question:** Mike: "I think the investor would make more sense as you can take a loan at the shop.
And then when you take a loan, you have to pay back 10% of every contract you finish until the loan
is paid back plus some interest ... And we should have a clear indication what is actually going to
happen that quarter before it starts ... And we would just start out with like some amount of money
for free or whatever, no investor. But the robot with dollar signs could be the person you talk to
for a loan."
**Picked:**
- You start with $100 of your own. No investor, no cut on everything. Replaces the investor in #49
  and #53.
- The dollar-eyed robot is **the lender**, in the board's header. Borrow $100 (you owe $120) or $250
  (you owe $310), as often as you like; debts add up. Until it's paid, 10% of every contract you
  finish goes to him (never more than you owe). Contract cards say what you keep while you owe.
- **The forecast**, above Start: your money now, what the picked contracts pay if they all ship,
  what goes to the lender, wages if your whole crew works every shift, and where that leaves you at
  the end of the quarter. Wages are the whole crew because you choose who to schedule later, on the
  floor; the tooltip says fewer robots cost less.
- The end-of-quarter card shows what went to the lender instead of the investor's cut.

### 62. A roguelike, without the buy-out ending (2026-11-17)

**Question:** career mode or roguelike runs (open question 4 in the progression doc), and the
buy-out-the-investor ending (#45).
**Picked:** Mike: "We could just drop the buyout the investor ending. This is going to be a
roguelike anyway, probably. I don't think I'm gonna wanna do game design for a whole career mode."
The ending and the post-game move to Dropped. How a run ends (a way to lose, maybe a goal) is now
the first open question. Replaces #45. Issue #14 (the ending) stays open; I haven't commented on it.

### 63. No more freezing at a full Pack (2026-11-17)

**Problem:** Mike saw workers freeze, then drop what they held. A worker putting something down at
a full station waits up to 8 seconds for room; the drop is the put-down going through when a slot
opens. At Pack it jams: in his quarter, Gary-7 (the packer) and Blip both stood at a full Pack
holding reds, because Gary's routine was fetch, put down, then pack, so he never got to packing and
nobody else could make room. Waiting it out counts as one failure, and only six in a row made a
worker think, so Dot and Vex froze at a full Pack for about 70 seconds before Dot came to ask.
**Picked (Mike: "Sure, let's do one and two"):**
1. Routines pack before putting down. A sixth writing rule in the compile prompt says so, and the
   dry run gives anyone who packs one more try that starts with Pack full of the wanted color: a
   routine that walks up holding something and waits for room fails it, and the model gets told why
   and repairs it. In a live run, Gary told to "fetch red widgets, put them at Pack, pack red boxes
   and ship them" failed this check once and was repaired.
2. A worker who gives up waiting for room at a full station thinks about it right away (a new
   "full" unexpected), instead of after six failures. If they're out of thoughts, they come to your
   desk and say the station is full.
**Evidence:** `tools/dryrun-test.mjs` has the jamming routine (caught) and a pack-first one (passes);
all other cases still pass.

### 64. Loans without interest, stacking shares, and a budget instead of a wage guess (2026-11-17)

**Feedback:** Mike: "Don't include wages, whole crew, three shifts in the money calculation ...
you're not going to know how much you're going to spend on workers until you actually run all of
the shifts. Maybe we call the remaining amount a budget? ... Also, let's get rid of interest on the
loan for now. And if you take two loans at once, it should take 20%. And then the lender's thing
should say that."
**Picked:**
- No interest: borrow $100 or $250 and you owe exactly that.
- Each loan takes 10% of every contract you finish until that loan is paid off, so two loans take
  20%. The lender says what you owe, on how many loans, and the share he's taking now.
- The forecast drops wages. It shows what the picked contracts pay if they all ship, the lender's
  share, and what you get at the end of the quarter, with a note that wages come out of your
  budget as the shifts run. The money in the board's corner is labeled **Budget**.
- At most three loans at once (Mike: "you can only have three outstanding loans at once"). With
  three, the Borrow buttons grey out and the lender says "I'm not lending you any more money until
  you pay up, deadbeat!"
Amends #61. The "Numbers must go up" line is gone too ("getting a little cheesy").

### 65. The web build: an OpenRouter key from sign-in, a pasted key, or ?api-key= (2026-11-17)

**Ask:** Mike: "set up the open router thing ... a query string parameter or just OAuth, open router
OAuth, or you could just paste your key and it stores it in local storage. My other websites have a
specific local store key ... so that if you put your ... open router key in one of my websites, it
works for all of them ... if you load from query string parameter, it saves it to local storage as
well. ... this is going to be the first time we're doing that [OAuth]."
**Picked:**
- Off localhost (or with `?llm=openrouter`), the robots call Claude Haiku 5.5
  (`anthropic/claude-haiku-5.5`) through OpenRouter straight from the browser, with structured JSON
  output. On localhost the `claude -p` server stays the default for development.
- The key lives in `localStorage["quasarbright:openrouter-key"]`, the same key the shared
  `cohesion.js` uses, so one key works on every quasarbright.github.io project. `?api-key=` is
  saved and removed from the address bar by cohesion.js, as on his other sites; pasting uses the
  shared `<openrouter-key>` field.
- **Sign in with OpenRouter** (`src/openrouter-auth.js`) is OAuth with PKCE, the first on any of his
  sites: a random verifier kept in sessionStorage, its SHA-256 challenge sent to
  openrouter.ai/auth, and the returned `?code` traded at /api/v1/auth/keys for a key, which is saved
  under the same shared key. It lives in this repo for now; it could move into cohesion.js so every
  site gets it.
- The menu is now two columns (intro and model access on the left, levels on the right) so it fits
  without scrolling.
**Evidence:** unit tests (the RFC 7636 challenge vector), Playwright tests with OpenRouter faked
(sign-in round trip, a failed sign-in, ?api-key=, paste and remove, a compile sent to Haiku with the
key), and a live run with Mike's key from a gitignored .env (`tools/openrouter-check.mjs`): two
workers compiled through OpenRouter in 4.3 s, 3 calls, $0.001. Live on GitHub Pages
(quasarbright.github.io/clanker-tycoon): Mike signed in with OpenRouter there, "Sign-in worked,
everything was very nice."

### 66. Stay on Claude Haiku 5.5 (2026-11-17)

**Question:** Mike: "test models other than haiku that are similar price and intelligence to see if
maybe some of them are faster ... there are also some free models on OpenRouter ... can we just
like auto dispatch to one that's free but also similar intelligence and speed."
**Picked:** keep Haiku 5.5. Ten models on the game's real compile path (six instructions, twice
each): none was clearly faster, only DeepSeek V4.1 Flash and Muse Ember matched Haiku's 12/12, and
free models are capped at 50 requests a day without credits. OpenRouter exposes prices and
capabilities but not measured speed; it can sort providers by speed, and `openrouter/auto` can pick
among an allow-list by cost tier, but there's no "free and fast" setting. Details:
`tools/model-experiment/REPORT.md`. A free mode on Nemotron, or DeepSeek as a fallback, are
options for later.

### 67. Overnight: playtests, a dry-run gap, a UX pass (2026-11-17)

**Playtests** (`tools/business-playtest.mjs`): three scripted players (careful, greedy, middle) played
up to six quarters of level 7 with real instructions compiled by Haiku through OpenRouter (about
$0.09 in all). Robots don't think mid-shift there, so it's a little harsher than real play.
- Red Large contracts shipped 3 times in 4 with two or three haulers: a gamble, not a trap.
  Painted Large ones shipped about half every time with one painter, so they got a little smaller
  (green 20 to 18 for $510, blue 25 to 22 for $620). They still want a second painter.
- The careful player bought a machine and recruited, then couldn't pay its four-robot crew and sat
  at $40 for the rest of the run. In the game you could schedule fewer robots or borrow, but it
  shows how easily spending strands you.
- **A real gap:** a packer's routine packed and walked to the dock empty-handed, never shipping,
  and passed the dry run (packing counted as work). It jammed whole quarters. Instructions that say
  to ship now have to ship something in the dry run (`src/dryrun.js`, `tools/dryrun-test.mjs`).
**UX review** (a fresh reviewer on every screen): fixed the clear ones. Shift cards say whether the
quarter is on pace ("about 18 of 20: 2 short"); end-of-quarter crew pay covers all three shifts and
per-shift numbers say "this shift"; robots line up by the dock instead of stacking; the board keeps
its height and sits centered; "Take off shift"; Schedule buttons are secondary; chips say "Shift
over" after a shift; level 7's shift card has Levels; "Finished in" on level 3's card; the lender no
longer points at a pay-off button that doesn't exist; "No skills" only when a robot has no traits
either. Left for Mike: showing crew cost against the budget on the board, blocking Start when a
scheduled robot has no instructions, a more compact training layout, and the coach line repeating
the status bar.


### 68. Fixes from Pam's real playtest (2026-11-17)

Pam played a full level 7 quarter with the real model and found three plain bugs. The coordinator
asked for them fixed without waiting on Mike.

- **Robots spawned on top of you.** New robots lined up leftward from the dock, and the second one
  landed about 3.6 units from you at the desk, every shift. Now each new robot takes the first spot
  along the dock row that's at least a robot-width (7) from you and every robot already there
  (`spawnSpot` in `src/sim.js`). A unit test checks every level with six robots, plus one taken off
  and replaced.
- **Start was lit inconsistently.** It was grey only while a robot read its instructions or the
  budget was short; it stayed lit with nobody scheduled, with robots who had no instructions or
  couldn't do theirs, and with a robot still thinking over a message. Now there's one rule
  (`startBlocker` in `src/main.js`): on a crew level someone has to be scheduled, everyone scheduled
  has to be Ready, and the budget has to cover them. The tooltip on Start says who isn't ready. This
  settles the open call "block Start when a scheduled robot has no instructions" (yes). The other
  "needs instructions" repeats (chip, status bar, coach) are still Mike's call.
- **An early quarter didn't say it ended early.** When everything ships before the last shift, the
  card is titled "Quarter over early" and says which shifts are skipped, and the header budget
  shows the same total as the card (it showed the budget before the clients paid). The card's
  numbers now stay in one row with values lined up, however many there are (one `setEndStats`
  renderer for all three cards).

### 69. Endless runs; foremen as one of few first-class concepts; story waits (2026-11-17)

**Question:** how a roguelike run ends (open since #62). Mark proposed a fixed run of 8 quarters
scored by money, with bankruptcy as the way to lose.
**Picked:** Mike: "well do the typical roguelike thing where you keep going and the contracts get
crazier and eventually they'll die." A run is endless; contracts escalate until you go under.
Replaces the fixed-length proposal. What exactly ends a run (likely: out of money, with a debt you
can't pay) is still open.
**Scaling:** Mike: "We need to think about how we'll scale higher though. Right now a foreman is
going to be a first class concept. We can only have so many first class concepts to get bigger.
We may want to do something more flexible later somehow but we don't need to think about it yet."
So escalation has to come mostly from combining what exists, not from a new concept per tier.
**Story:** "not yet, maybe later. Story comes during the polish phase once mechanics are ironed
out."

### 70. A marker on every reply; one thinking indicator (2026-11-17)

Pam's real playtest: Blip answered "I'll help Pip and keep things tidy!" and kept his old routine,
and nothing said the message was just talk. A change showed only as a small grey
"(changed their instructions)". And thinking showed five ways, two of them speech bubbles ("…"
over the robot and in the chat), plus dots in the crew chip and status bar, and thinking-budget
pips drawn as three dots that read as "typing". Mike: "yeah fix that somehow" and "yeah good".

- Every reply to you ends in exactly one marker under the text, the same shape for every kind:
  "New instructions" (the first set), "Changed instructions", "One-off: <what>" or
  "No change to instructions". One table (`EFFECTS`) and one renderer (`effectHTML`).
- Reading and thinking are one indicator: the word, pulsing (`busyHTML`), in the crew chip, the
  status bar, the chat ("Pip is thinking", not a bubble) and a tag over the robot on the floor.
  The "?" and "!" marks stay. The thinking budget is short segments labeled "thoughts".
- Tests: `e2e/business.spec.mjs` checks every reply has one marker of the right kind, and that a
  thinking robot shows no dots and no speech bubble anywhere.

Mocks only, waiting on Mike: compact Training (one Train picker per robot), the coach dropping
"needs instructions", and Pam's crew-cost plan (whole crew's cost a shift on the board, this
shift's cost and what's left by Start).
