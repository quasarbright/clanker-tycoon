# How Clanker Tycoon got here

A dated record of the project's turns, for looking back (and maybe a "coding adventure" video).
Decisions with their reasons are in [decisions.md](decisions.md); commits carry the details.
Quotes are Mike's.

## 2026-11-14: the idea, and which model

The idea had sat in an issue since June (quasarbright.github.io#212): "a game where you manage a
team of (deliberately dumb) AIs and have them try to accomplish tasks together." It imagined
factory workers you write instructions for, a worker walking up to say "uh boss, we have a
problem", and scaling up to AI managers, investors, an IPO. The worry was cost: lots of model calls.

The first question was what would run the workers. Three options came up: Claude Haiku, Apple's
on-device model (free), or JEV, a fast decision model. Two experiments ran in parallel on the same
toy-factory test suite. Apple's model was quick but scored 26/60, ran only one request at a time
for the whole machine, and blocked half the workplace-comedy prompts. Haiku scored 59/60 but took
about 5 seconds a call. JEV was ruled out because it can't read or write language. Haiku won.

A side quest found that there's no way for a web game to let players "sign in with Claude" and use
their own subscription, so a public version would use OpenRouter keys.

Then the first prototype, built in an afternoon: a static page and a tiny local server that sends
each model call through headless Claude Code on Mike's plan. Three robots with personalities and
deliberate handicaps: Gary-7 (eager, literal), Doris (veteran, grumbly), and Blip (cheap, nervous,
mishears things). You typed orders and they compiled them into looping routines. In the first run
Blip misheard "pack station" as "paint station" and piled widgets at the paint machine, and Gary
answered a pep talk by rewriting his loop to chase a raise.

## 2026-11-15, afternoon: making it playable

"i have no idea what's supposed to happen as a player." So: a plain how-to, labeled stations, a
coach line, a clock that waits for you. Then levels, starting with one worker carrying widgets from
belt to dock, and a planning step where you write everyone's instructions before Start. Complaints
moved to a panel under the floor because three speech bubbles at the desk covered each other.
A truck now drives off with each shipment.

## The pivot: from "they're so dumb" to managing workers who listen

"blip is just completely useless. way too dumb. i want the workers to actually follow
instructions. maybe this game is better as an actual factory management game." The handicaps came
out. Comedy would live in the voices; the challenge would be managing.

The long-term vision got written down as GitHub issues, one topic each, on a new repo: visible
skills, promotions or they leave, long-term memory and morale, a continuous career where you
delegate to managers, hiring and interviewing, investors and stock.

Then a run of restructures in about an hour:
- **Hire your own crew** from candidates with skills and wages.
- **The first "helpful" bug.** A worker told to pack and ship also fetched widgets, Pack filled up,
  and the line froze. Fixed by showing workers their coworkers' instructions and telling them to do
  only their own part.
- **You're on the floor.** Set orders scored by time; you walk around and do the work yourself.
  "the first thing that should happen is the player should be able to walk around and like do the
  factory themselves." Every machine is used by hand first.
- **Start broke, earn, hire,** with money and crew carrying over between levels. Then pulled back
  out: "that whole 'grind for money' thing is for when we do long term." The levels became a
  minimal tutorial. One color only until boxes are understood.

## 2026-11-15, evening: feel, and two embarrassing bugs

"i don't want anything to just be waiting without moving." Picking up became instant; packing,
painting and fixing show progress; at Pack you choose which 3 widgets to box. A Start button came
back. The repo got a CLAUDE.md with the vision and principles, kept current as Mike states them.

The helpful-worker bug came back even with coworkers' instructions in view, so a check now sends a
routine back if it visits a station its instructions never mention. Every model call started
being logged to a file.

Two bugs from screenshots: Mike was playing a tab opened hours earlier and still running old code
(now the page offers a reload when the game changes). And the hiring panel was hidden during
planning, exactly when you need it; my tests had clicked Hire from a script, which works on a hidden
button.

## The worker language

"how do workers operate? do they compile their prose instructions into 'code'?" They did: a flat
list of actions on repeat. "that seems very limited. we are never going to get workers that can
actually think like this."

That started the biggest design conversation. Haiku is too slow for a real-time loop, so the answer
had to be smarter programs, not more model calls. The idea that stuck came from Mike: "employees
should basically be AI agents that mostly act deterministically and sometimes the model is 'woken
up' to think. This is kind of like robotics." It is: current robots split a fast controller from a
slow planner (Figure's Helix, NVIDIA's GR00T, Physical Intelligence's Hi Robot), have the model
write a program instead of picking every action (Code as Policies), and re-plan when something
fails (Inner Monologue). Mike also noticed it "is sort of starting to feel like multi agent
orchestration when doing software development."

Along the way: the Claude Agent SDK was checked and set aside; the program will never be shown to
the player; a message to a worker should usually be a one-off, not a permanent change; workers
think on surprises with a **?** and on messages with a **!**; skills became actions a worker can
do, and traits like Fast became attributes.

My first proposal for the language was a set of event-triggered rules. Mike: "why do you think we
should do this event-based rule thing rather than a more general purpose language with limited
tools? I feel like your design is restrictive." Fair: the rules were built for checks that mattered
less once programs were hidden and thinking could recover from mistakes.

## Experiments: JavaScript or Lisp, and can prompting fix bugs?

Mike worried Haiku would wander outside a JavaScript subset, so we measured instead of guessing:
the same eight worker tasks in a JS subset and in a small Lisp, through the game's real path. Both
were always valid and equally fast, but JS did what was asked 24/24 against 19/24.

"that's weird that lisp vs js changed how much it overreached. suspicious." Right to be suspicious:
40 more runs showed the overreach gap was mostly noise, but one Lisp bug was real. Haiku kept
writing a branch per color that only shipped boxes nobody packed, 7 of 13 times, against 0 of 13 in
JS, where it put the color in a variable and wrote the work once.

"so the ai is just writing bugs? can this be overcome with some system prompting?" Five writing
rules took clean programs from 29/40 to 38/40 at no cost in speed. The one bug they couldn't fix (a
program that never makes progress) is for the runtime to catch.

## Jams become wear

Every program on the paint task fixed jams unasked, which raised a better question. "this kind of
makes me feel like jamming is just bad game design though." Random breakdowns can only be reacted
to, and the game is about planning. So machines will wear predictably instead: a meter that fills
with use, serviced by someone with the Repair skill, planned like any other work.

## Building it (2026-11-16)

"Alright, go build." The interpreter, the sim and the prompts went in first, then the screen. The
first real shifts turned up two things the experiments hadn't. Doris, told to box up whatever color
the order needs, wrote a program that only packed while 3 or more boxes were still wanted, and the
line jammed silently after one box: no one failed, so no one noticed. That's what the "never makes
progress" bug looks like in play, and the fix was to treat a still floor as unexpected for everyone.
And Blip, told to pack without the skill, didn't refuse; the model just left the packing out,
because it had never been told packing existed. Now workers are told what they can't do.

The good surprise: thinking works the way the design hoped. Doris, told to paint on a floor with
no paint machine, thought it over and walked to the desk to ask. Answered, she rewrote her own
instructions and the card updated.

## Where it stands

The worker-agent design is built: JavaScript programs, thinking with a budget and ? / ! marks,
one-offs and new instructions, desk visits, skills and attributes, and predictable wear with a
new Upkeep level. Not built: the Strong attribute and a pre-shift dry run.

## First playtest (2026-11-16)

Mike played it and came back with a list. The biggest one was talking to the robots: "the visual
feedback and UX on giving instructions and waiting for them to be ready is unclear and awkward ...
in general all the communication UX is very awkward." Talking was spread over four places (the
instructions box, a talk box, a desk panel and the floor radio), and nothing said clearly whether a
robot had finished reading. Each card became a chat with that robot, with a status chip, and the
other three places went away.

The second was strategy. "The best strat is just to have bolt do the whole job." Bolt could pack,
paint and repair, so hiring one robot beat managing a crew, which is the opposite of the game.
Robots with every skill left the early levels, crew levels got a shift clock that one robot can't
beat, and stars went with them ("that'll be subsumed by quotas and promotions").

Smaller ones: errors now come from the robot in its own words ("I can carry widgets, but I can't
pack them, so I need a worker with Packing to do it"), the paint machine breaks after the first job
so the paint level teaches servicing, and Try again puts you back at the start of the shift with
your crew and their instructions.

## The first quarter (2026-11-17)

After a night of interface fixes Mike turned to the game itself: "let's start doing more game
mechanics and design stuff." The plan was to prove one shift is fun before building progression
around it, starting with money. Mike kept shifts and wrapped them in a bigger unit: "a 'cycle' has
a quota, and you have some amount shifts in a cycle to accomplish the quota, and a budget." It got
named a quarter.

The first measurement killed the obvious version. On the normal belt every crew of two or more
shipped exactly 13 boxes a shift: the belt was the bottleneck, so hiring a third robot bought
nothing and there was no money decision to make. The quarter's belt runs twice as fast, and then
crew size matters (14 boxes with two, 25 with three). The level ended up as 24 red and 9 blue
boxes in three shifts on $120, where the cheap crews miss the blue, the big ones go broke by the
second shift, and the best runs come from changing the crew between shifts or servicing the paint
machine yourself.

## Making your words matter (2026-11-17)

Before money, the first item on the plan was that a shift's result should trace back to what you
told the crew. Two things broke that. Pip, told only to pack and ship, got nudged when the floor
stalled and rewrote his own instructions to fetch from the belt too; the check meant to stop that
compared his new program against his own new wording. Now only you change instructions, a worker
thinking on their own can only do one-offs inside them, and anything more sends them to your desk
to ask. In the test he did exactly that every time: "fetching from the belt isn't in my
instructions, so should I start doing that?"

The other was the leftover 1 in 10 programs that never get anything done. They now get a dry run
before the shift: 40 seconds on a private copy of the floor with a stage hand handing them what
coworkers would. Run over the 102 programs in the model log, it flagged exactly one, which turned
out to be Mike's joke order "run around in circles doing absolutely nothing", so the repair now
gets to say "yes, really" and the worker goes and runs in circles.
