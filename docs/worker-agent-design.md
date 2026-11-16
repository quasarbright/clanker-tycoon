# Worker agents: the design

Status: **built** (2026-11-16), except the Strong attribute (carrying two) and the dry run (step 6
below), which aren't. Choices made while building: talking to a worker is free (only their own
thinking spends the budget, 3 thoughts refilling one per 20 s, Smart 5 per 12 s); a problem that
comes back within 45 s of thinking about it sends them to your desk; and a floor where nothing has
moved for 15 s counts as unexpected for everyone, which is how the runtime catches a program that
never makes progress.
How we got here is in [history.md](history.md); each decision with its reasons is in
[decisions.md](decisions.md).

## The shape

Each worker is an agent that mostly runs a **deterministic program** and is now and then **woken up
to think** (a model call). It's the split robots use: a fast controller that runs all the time, and a
slow planner that steps in when something needs judgment. The model is never in the per-second
loop. Personality only shows in what workers say; it never changes how they act.

## What a worker carries

- **Instructions:** the plain-English text on their card. (Never called a "job"; that word is
  saved for a long-term role.)
- **A program:** compiled from the instructions. Never shown to the player.
- **A queue of one-time steps:** from a message or a thought; done before the program continues.
- **Memory:** a short log of what they've been told and what happened to them.
- **Skills**, **attributes**, and a **think budget**.

## The program

- Written in a **small JavaScript subset** that the model writes as plain text inside its JSON
  answer. We parse it with an off-the-shelf parser (acorn) and run the syntax tree in **our own
  interpreter**, as a coroutine that pauses at every action and resumes when the action is done.
  It has a step limit (a loop that never acts gets cut off and turned into a `think`) and can see
  nothing except the tools we hand it.
- **Tools** are the worker's actions (move, pick up, put down, pack, paint, service, wait, say)
  plus questions with **full vision**: what's at every station, what they're holding, what today's
  order still needs, where each coworker is and what they hold, each machine's wear, and
  `think(reason)`.
- The compile prompt includes **five writing rules**: do your part only; put each choice in a
  variable and do the work once; read numbers from the questions instead of writing them in; add no
  steps the instructions don't ask for; trace one pass of the loop before answering.
- **Checks before the shift:** it parses, it stays inside the subset, and it only uses skills the
  worker has (see below).
- Possibly later: a short **dry run** in the headless sim before accepting a program, to catch one
  that never makes progress (about 1 compile in 10 with the rules).

## Skills and attributes

- **Skills** are actions a worker knows how to do: Packing, Painting, Repair, and maybe Shipping
  and Sorting. Two kinds:
  - **Primary work** (painting, packing): a program that uses it without the skill is a compile
    error, caught before the shift.
  - **Side tasks** (servicing a machine): any program may include them; without the skill they
    silently do nothing.
- **Attributes** are traits: Fast (walks faster), Strong (carries two), Nimble (works machines
  faster), Steady (machines wear more slowly in their hands), Smart (more thinking budget).
- Everyone is careful, patient, and has a long memory; those aren't traits. No cheap downside
  traits. More skills and better attributes mean a higher wage.

## Thinking

- **Triggers:**
  - something unexpected happens: a **?** pops up over the worker;
  - you send them a direct message, or yell to everyone: a **!** pops up;
  - their program calls `think()`.
- Thinking draws on a **budget that refills slowly**. Workers **keep working while they think**.
- A thought returns a spoken **reply**, and either **one-time steps** (the default: "grab that box
  first") or **new instructions** (when the work really changes). New instructions are
  auto-approved and show on the card, so the card never disagrees with the robot. Later,
  temperaments like independence and confidence could make some workers check with you first.
- A worker **comes to your desk** when a thought decides it needs you (missing information,
  conflicting instructions, something only you can do), or when the same problem comes back after
  they've thought about it.

## Machines

No random breakdowns. Every machine has a visible **wear meter** that fills a little with each job.
When it's full the machine stops until someone with the Repair skill **services** it, which takes a
few seconds and shows progress. That makes maintenance planned work: who services it, and when. A
player meets wear first in a manual level, servicing the machine themselves.

## The model backend

Swappable: nothing in the design, prompts or language is specific to Claude or Haiku. Every call
goes through one function (`src/llm.js`), text in and JSON out. Thinking is turned off wherever the
backend allows it (headless Claude Code doesn't; the API and OpenRouter do). Nothing compiles while
you're still typing.

## Changes to make, in order

1. **One-off messages.** Messages and yells return a reply plus one-time steps or new instructions.
   Cards get a "doing now" row, the instructions text updates when it changes, and the floor radio
   labels which one happened. Works with today's action lists.
2. **The JavaScript worker language.** Interpreter, tools with full-vision questions, compile
   prompt with the writing rules, pre-shift checks. Replaces the action lists.
3. **Thinking.** Triggers, the slowly refilling budget, ? and ! markers, the new desk-visit rules.
   Replaces "fail 6 times, walk to the desk".
4. **Skills and attributes.** Rebuild the candidates, wages and badges; compile errors for missing
   primary skills.
5. **Machine wear.** Wear meter, servicing, Steady, and the manual level that introduces it.
   Random jams go.
6. **Maybe the dry run**, if the remaining "never makes progress" bug shows up in play.

## Open questions

- Does labor cost count toward the stars, or is it only shown?
- How big is the think budget, and how fast does it refill? How fast do machines wear?
- Add an API-key backend for thinking-off speed (about 2 s per call instead of 4–5 s)?
