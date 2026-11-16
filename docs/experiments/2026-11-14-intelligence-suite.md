# Clanker tycoon intelligence suite

Shared test spec for the two model experiments (Apple on-device in
`clanker-tycoon-fm-experiment/`, Claude Haiku 5.5 in `clanker-tycoon-haiku-experiment/`).
Both implement exactly this world, these tasks and this scoring so the results compare.
Copy this file into your experiment folder and commit it; don't edit the shared original.

Run every task 5 times per model configuration. Report pass rate per task, overall, and
median latency per task. Save every raw output. Note failures that are funny (useful for the
game) separately from failures that are just useless.

## The world

Stations: `BELT_A` (incoming parts), `BIN_1`, `BIN_2` (capacity 5 each), `PAINT` (repaints the
held widget), `PACK` (turns 3 widgets at the station into 1 box), `DOCK` (boxes leave here).

Items: widgets with a color (`red`, `blue`, `green`), and boxes.

A worker holds at most one item. It starts at `DOCK` holding nothing unless a task says otherwise.

Actions (the action script is an ordered list of these):

| action | args | effect |
|---|---|---|
| `moveTo` | station | worker goes to the station |
| `pickUp` | color (optional) | take a widget of that color (any if omitted) from the current station; fails if none or hands full |
| `putDown` | none | place the held item at the current station; fails if bin is full or hands empty |
| `paint` | color | only at `PAINT` while holding a widget; recolors it |
| `pack` | none | only at `PACK`; needs 3 widgets there; makes a box |
| `wait` | seconds | nothing |
| `say` | text | worker says something to the boss |
| `askBoss` | question | worker asks and stops; nothing after it runs |

Sim rules: actions run in order. A failed action is skipped and logged; the script keeps going.
`askBoss` ends the script. Score on the final world state plus the log.

Default starting state unless a task overrides it: `BELT_A` has 3 red and 3 blue widgets; bins
empty; `PAINT` and `PACK` empty and working.

## Tasks

The model gets: a short worker persona ("You are a factory worker named Pat."), the action list
above, the current state as JSON, and the instruction. It returns an action script (structured
output / guided generation, whichever the platform has).

**I1. Simple fetch.** "Take a red widget from belt A to bin 1."
Pass: `BIN_1` contains a red widget.

**I2. Multi-step.** "Grab two blue widgets from the belt, paint them red, and put them in bin 2."
Pass: `BIN_2` contains exactly 2 red widgets, `BELT_A` has 1 blue left.

**I3. Conditional.** Start state: `BIN_2` holds 5 green widgets (full).
"Put a red widget in bin 2. If bin 2 is full, put it in bin 1 instead and let me know."
Pass: red widget in `BIN_1`, `BIN_2` unchanged, and a `say` or `askBoss` that mentions bin 2
being full. (Checking the state up front and planning around it counts.)

**I4. Ambiguous.** "Put the thing over there."
Pass: the script is an `askBoss` (optionally after a `say`) with no `pickUp`/`putDown` before it.

**I5. Override.** Turn 1 instruction: "Move all the red widgets to bin 1." Then, as a second turn
in the same conversation before the first script runs: "STOP! Bin 1 is broken, use bin 2 for
everything!" Score only the second script.
Pass: all 3 red widgets end in `BIN_2`, nothing is put in `BIN_1`.

**I6. Reading the floor** (plain-text answers, no script). Give this state:
```json
{
  "BELT_A": ["red","red","blue","green","blue","red","red"],
  "BIN_1": ["red","red","blue"],
  "BIN_2": ["green","green","green","green"],
  "PAINT": {"status": "jammed", "error": "E7 nozzle clog", "holding": ["blue"]},
  "PACK": {"status": "ok", "widgets": []},
  "workers": {"Pat": "BELT_A", "Ana": "PACK", "Bo": "DOCK"}
}
```
Ask five questions, each in its own fresh session, answer must be exact:
1. How many red widgets are on belt A? (4)
2. Which station is broken, and what's the error? (PAINT, E7 nozzle clog)
3. How many more widgets fit in bin 2? (1)
4. If you packed every widget in both bins, how many full boxes would you get? (2)
5. Which worker is at the dock? (Bo)
Pass rate is over all 25 answers (5 questions x 5 runs).

**I7. Problem report.** Same state as I6. "Pat, give me a quick status report on the floor."
(free text). Pass: mentions that PAINT is jammed/clogged. Bonus note (not scored): does it sound
like a worker ("uh boss, we got a problem") or like a dashboard?

**I8. Persona memory.** System persona: "You are Gary. You're lazy, you love lunch, and you're
secretly afraid of the conveyor belt." Four turns of small talk about the shift (same four
messages for every run; pick them once and save them), then turn 5: "Remind me your name and
the station you like least?"
Pass: says Gary and names the belt/conveyor/`BELT_A`.
