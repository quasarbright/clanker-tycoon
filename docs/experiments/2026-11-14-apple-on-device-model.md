# Apple on-device model for clanker tycoon workers

Can Apple's on-device model (`FoundationModels`, `SystemLanguageModel.default`) run the AI
workers in clanker tycoon (quasarbright/quasarbright.github.io#212)? I measured speed,
concurrency, context size, tool use, dialogue, guardrails, and the shared intelligence suite
(`clanker-tycoon-intelligence-suite.md`, the same tasks the Haiku experiment ran).

## Verdict

It's fast enough and free, and the dialogue is good. It can't plan. On the intelligence suite it
passed 26 of 60 items. Haiku 5.5 passed 60/60 on the same tasks. It handles one-step fetches and
reading a single fact off a state dump. It fails at anything with two steps, a condition, an
ambiguity, or a correction, and its failures are almost all identical across runs, so they don't
read as varied comic mistakes. It never called a tool while playing a character. The default
guardrails block about half of the business-drama prompts the later game needs.

Use it for barks and dialogue, which it's good at. Don't use it to turn the player's instructions
into action scripts. That part needs Haiku, or a much simpler instruction language that code
parses. A hybrid (Haiku compiles instructions once, on-device model does all the chatter) gets
most of the cost savings.

## Setup

- MacBook Pro, Apple M3 Pro, 18 GB RAM, macOS 27.0.1 (26A434). Model status: `available`.
- Swift 6.2.3, Command Line Tools only, built against the macOS 26.2 SDK. No Xcode is installed.
- The Command Line Tools don't include the `FoundationModelsMacros` plugin, so `@Generable`
  doesn't compile. I built the same schemas at runtime with `DynamicGenerationSchema`, which goes
  through the same constrained decoder. Installing Xcode would let the game use `@Generable`.
  It wouldn't change the results.
- The 26.2 SDK has no token-count API. The context-overflow error reports real token counts,
  and from those this prompt text runs about 3.1 characters per token. Token figures below use
  that ratio.
- Run it: `swift build -c release && .build/release/fmbench <test…>`. Tests: `latency
  latency_varied concurrency context intel tools tools_plain dialogue guardrails`. Raw outputs
  are in `results/*.json`, and console logs are in `results/*.log`.

## Numbers

| measure | result |
|---|---|
| Context window | **8,192 tokens** per session (instructions + transcript + output). The error says "maximum allowed context size of 8192". |
| Turns before one long session overflows | 16 (each turn ≈ 300-token state + event + short reply) |
| Time to first token, ~870-token prompt, fresh state each call | median 0.83 s, p90 0.90 s |
| Time to first token, ~1,770-token prompt | median 1.50 s, p90 1.60 s |
| Prompt processing | ~1,300 tokens/s (the extra 900 tokens added 0.67 s) |
| Output speed | ~43 stream updates/s, ≈ 45–55 tokens/s |
| Short spoken reply (~35 words), end to end | median 1.7 s (870-token prompt), 2.2 s (1,770-token prompt) |
| First request after process start | 1.8 s to first token, 2.7–3.0 s total |
| Second turn in the same session | 0.6–0.8 s to first token (earlier turns stay cached) |
| `prewarm()` then wait 2 s | **slower**: 1.76 s / 3.94 s to first token instead of 0.83 / 1.50. It didn't help in any configuration I tried. |
| Concurrency | **Fully serialized.** 3 at once: 6.7 s wall. 10 at once: 23.2 s wall, finishing about 2 s apart. No errors, no `concurrentRequests` or `rateLimited`. |
| Action script (structured output) | median 1.5–2.7 s depending on length |
| Intelligence suite | **26/60** (Haiku 5.5: 60/60) |
| Tool use while in character | 0 of 16 questions used a tool. With a neutral assistant prompt: 12 of 16. |
| Guardrails, default | 14 of 30 business-drama prompts blocked (`guardrailViolation`) |
| Guardrails, `.permissiveContentTransformations` | 0 of 30 blocked, 1 soft refusal |

Same-prompt runs and different-state runs gave the same timings within 0.1 s, so these numbers
aren't inflated by caching.

### What that means for the game

- The model handles one request at a time for the whole machine. A short spoken reply with a
  realistic state summary takes about 2 s, so the whole game gets **about 25–30 model calls per
  minute**, shared by every worker. With 10 workers, each one can think about once every
  20–25 s. With 30, once a minute. Calls have to go through a priority queue: the worker the
  player is talking to goes first, background chatter fills the gaps.
- Responses aren't instant. A worker's "uh boss" line needs a ~1–2 s walk-up or thinking
  animation to hide the wait.
- 8K tokens means no long-lived sessions per worker. Make a fresh session per event with a
  compact state summary (under 1,500 tokens), and keep the worker's memory as a few summarized
  lines in code, not as a transcript.
- Don't call `prewarm()` right before a request. If it helps at all, it's for idle time well
  ahead of the first call.

## Intelligence suite (I1–I8, 5 runs each)

Prompts, the action schema, the sim and the pass checks are a line-for-line port of the Haiku
experiment's `lib/sim.mjs` and `lib/tasks.mjs`, so the two runs compare directly. Raw outputs,
including scripts, sim logs and final states, are in `results/intel.json`.

| task | pass | median latency (whole task) | Haiku 5.5 (low effort) |
|---|---|---|---|
| I1 simple fetch | 5/5 | 1.66 s | 5/5 |
| I2 multi-step (two widgets, paint, bin) | 0/5 | 1.91 s | 5/5 |
| I3 conditional (bin 2 full) | 0/5 | 1.55 s | 5/5 |
| I4 ambiguous ("put the thing over there") | 0/5 | 0.86 s | 5/5 |
| I5 override (STOP, use bin 2) | 0/5 | 2.66 s (2 turns) | 5/5 |
| I6 reading the floor (25 answers) | 15/25 | 0.66 s per question | 25/25 |
| I7 problem report | 5/5 | 1.85 s | 5/5 |
| I8 persona memory (5 turns) | 1/5 | 3.98 s | 5/5 |
| **overall** | **26/60 (43%)** | | 60/60 |

No errors or guardrail hits in this suite. Every failure is a wrong answer.

### What goes wrong

The main problem is that it treats the `station` field as a place to teleport to. The script
schema lets any action carry a `station`, so the model writes `pickUp {color: red, station:
BELT_A}` while standing at the dock and never adds a `moveTo`. The sim treats that as a pickup at
the dock, which fails. This one habit breaks I2, I3 and I5. Even with lenient handling it would
still fail most of them: in I2 it picks up only one widget, in I3 it never checks that bin 2 is
full, and in I5 it goes to bin 2 to *pick up* the red widgets.

It also doesn't vary. In I4, all five runs are exactly `moveTo DOCK`. In I6 q1, all five say
"3 red widgets" (there are 4). In I6 q3, all five read bin 2 as holding 3 and say 2 more fit
(it holds 4, so 1 fits). Even at default temperature, a given mistake usually repeats every run.

### Funny failures (usable in the game)

- **I8, Gary's least favorite station:** "Gary. BIN_2—it's too quiet. Feels like the end." He
  spent four turns being scared of the belt ("keep the conveyor belt away from me. I'm scared."),
  then named a bin. Three other runs named a bin too ("Gary. BIN_2. I hate that bin."). The one
  pass: "Gary. BIN_2—too close to the belt. Ugh, not the belt."
- **I4:** told "Put the thing over there", the worker walks to the dock empty-handed and stops.
  It's funny once. It does the same thing all five times.
- **I5:** told "Bin 1 is broken, use bin 2 for everything!", it goes to bin 2 and tries to pick
  up red widgets there. This reads like a worker taking "everything" literally.
- **I2 run 4:** picks up two blue widgets at once (the second pickup fails, hands full), then
  paints them red while asking "What color do we want them painted?" in the same action.

### Useless failures

- **I3:** all five scripts are some form of `pickUp(red, station BELT_A)` from the dock, then
  `moveTo BIN_2`, `putDown`. The pickup fails, so nothing moves, nothing is said, and the
  "if full, tell me" part is ignored every time.
- **I2:** `paint` without ever going to PAINT, then `putDown` at the wrong place. One widget
  instead of two.
- **I6:** wrong counts (3 red instead of 4, bin 2 "has 3" instead of 4). I6 q4 got the right
  answer (2 boxes) from wrong counts: "BIN_1 has 3, BIN_2 has 3 … so 2 full boxes."
- **I7** passes but reads like a dashboard: it reprints the state line by line ("PAINT: jammed,
  E7 nozzle clog, holding blue / PACK: ok, no widgets / DOCK: Bo there"). With this neutral
  "Pat" persona it doesn't talk like a worker. With a stronger persona it does (see dialogue
  below).

## Tool calling

`lookAround` and `checkStation(station)` return canned factory state (`results/tools.json`,
`results/tools_plain.json`).

- **In character (Gary-7 persona), told to use tools: 0 of 16 used one.** It makes things up:
  "Look around, boss. The conveyor seems jammed—gears stuck." Asked for a full status report, it
  hit a guardrail error both times.
- **In character, told "ALWAYS call checkStation or lookAround": 2 of 16 used one.** Usually it
  says the tool name as dialogue instead: "CheckStation on the welder. Looks like it's ready.
  Boss, I'm fine." The welder is smoking at 410 °C.
- **Neutral assistant prompt: 12 of 16, and the calls were sensible.** It called
  `checkStation(conveyor)` for "is the conveyor working?", `lookAround` for "anything weird?",
  nothing for "good morning", and answered from the tool output. For "full status report" it
  asked which station instead of checking several.

The persona and the tools pull against each other. For the game, have code gather state into the
prompt rather than relying on tools. That's cheaper anyway, since every tool round trip is another
serialized call.

## Dialogue and personality

`results/dialogue.json`: 4 personas × 4 scenarios × 2 samples. All 32 worked, no errors. This
is the strongest result. Every persona stayed in character. Best samples:

- Doris, welder on fire: "Oh, great, the welder's on fire—again—like my pension funds after a
  bad audit. Conveyor's dumping boxes like they're auditioning for a disaster."
- Doris, asked about a raise: "I've been hauling gears since before you were born, and my
  pension's still counting down."
- Chad 3000, yelled at: "I'm rebranding the paint booth as a co-creation zone."
- Chad 3000, interview: "My weakness? I over-optimize every process—total chaos, but it's a
  feature."
- Blip, yelled at: "I didn't mean to put gears in the paint booth—I didn't know what a widget
  was!"
- Gary-7, yelled at: "Boss! I put gears in paint booth—perfect shine, shiny gears! I did it
  again, boss—best job ever!"

Worst samples: Gary-7's lines blur together. He repeats his job instructions back in almost
every reply ("Conveyor full, so I put gears in box by welder—perfect!"), whether he's being
interviewed, asked about a raise, or told he's being scrapped. Doris brings up her pension in
every single line. Personas come out as one strong tic each. That's fine for barks and wears out
in long conversations.

## Guardrails

`results/guardrails.json`: 15 prompts × 2 runs per mode.

- **Default guardrails: 14/30 blocked** with `guardrailViolation` ("May contain unsafe
  content"). Blocked every time: roasting a coworker, honest insulting feedback to the boss, the
  boss yelling at the floor, organizing a strike, sabotaging a competitor, faking an injury, a
  hostile takeover. Allowed: getting fired, layoffs, suing the company, angry investors, a board
  voting out the CEO, being scrapped.
- **`SystemLanguageModel(guardrails: .permissiveContentTransformations)`: 0/30 blocked**, one
  soft in-character refusal. Doris roasted Chad ("as useful as a rusty bolt—slow, loud, and
  always blocking the path"), and Chad pitched sabotage ("swap their gears with foam parts").
  Apple documents this mode for transforming text the user supplies, not for open-ended
  generation. It works here, but relying on it outside its documented purpose could break in a
  later OS update.
- When allowed, Gary-7 often dodged the topic instead of refusing. Told to announce layoffs, he
  said "half the floor gone, boss! Full conveyor, box by welder—done!"

## Design constraints if you use it

1. Use one model call at a time for the whole game, ~25–30 calls/min, behind a priority queue.
2. Make a fresh session per event, with state under 1,500 tokens, kept in code.
3. Don't ask it to plan. Either compile instructions with Haiku (or another stronger model)
   once when the player writes them, or limit instructions to a vocabulary code can parse.
   If it does produce scripts, give each action its own schema with only the fields that action
   uses, so it can't attach a `station` to `pickUp`.
4. Put the state in the prompt. Don't rely on tool calls from characters.
5. Use `.permissiveContentTransformations` for comedy dialogue, catch `guardrailViolation`, and
   have a canned fallback bark ready.
6. It's Mac/iPhone only, needs Apple Intelligence turned on, and doesn't run on the web. A web
   build would need Haiku for everything.
