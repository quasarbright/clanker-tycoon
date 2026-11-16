# JavaScript subset vs small Lisp for worker programs

2026-11-15. Which language should Haiku write worker programs in? Same world, same tools, same 8
sets of instructions; only the language guidance differs. 3 runs each, 48 compiles, through the
game's real path (`claude -p`, Haiku 5.5, effort low, JSON answer with the program as a string).
Programs checked automatically, then graded by hand. Raw outputs: `results/runs.json`; every
program side by side: `results/programs.md`. Rerun: `node run.mjs && node analyze.mjs`.

## Result

JavaScript. Both languages were equally valid and equally fast, but the JS programs were more
often correct: **24/24 vs 19/24**. Every Lisp miss was on the tasks with real logic.

| | JS subset | Lisp |
|---|---|---|
| Parses | 24/24 | 24/24 |
| Stays inside the allowed subset | 24/24 | 24/24 |
| Only real tools, valid stations and colors | 24/24 | 24/24 |
| Repairs needed | 0 | 0 |
| Does what the instructions ask (my grading) | **24/24** (1 with a minor flaw) | **19/24** |
| Model time, median / p90 | 4.8 s / 7.5 s | 4.8 s / 8.0 s |
| Wall time per compile, median | 5.6 s | 5.8 s |
| Output tokens, median (thinking) | 866 (645) | 876 (670) |

For comparison, today's game (a flat action list) logged a median of 3.7 s wall per compile over
14 compiles. Programs are a bit longer to write than action lists, so expect about 2 s more per
compile with either language.

## Grading, task by task

| Task | JS | Lisp | Notes |
|---|---|---|---|
| haul | 3/3 | 3/3 | |
| packer (coworkers haul) | 3/3 | 3/3 | Nobody fetched from the belt. The coworker context works in both. |
| order-color (pack what the order needs most) | 3/3 | **0/3** | Every Lisp program also went to the belt to fetch widgets, though Gary was hauling. |
| paint-to-order | 3/3 (1 minor) | 3/3 | JS #2 hard-coded "2" instead of asking the order. |
| overflow (Pack full → bin 1) | 3/3 | 3/3 | |
| jam-keeper | 3/3 | 3/3 | |
| switch-colors (red, then blue) | 3/3 | **1/3** | Two Lisp programs never pack at all: they only ship boxes nobody makes. |
| sorter | 3/3 | 3/3 | No one picked up a green. |

## What this means for the worries

- **Writing JS outside the subset:** didn't happen once in 24 programs, including on the longer ones
  (helper functions, `for...of` over a color list). The prompt's "not allowed" list was enough.
  With 0/24, the true rate is likely under ~12%, and one repair retry is the fallback.
- **Parse errors:** none in either language. A repair would add about one more compile (~5 s).
- **Latency:** the same for both languages; about 2 s more than today's action lists.
- **Scope discipline:** both mostly did only their part. Both added unrequested jam fixing on the
  paint task (`if (jammed()) fix()`), a reasonable but extra step. Lisp's belt-fetching on
  order-color is the same "helpful" habit that broke Pip, coming back when the logic gets harder.

## Follow-up: was the gap noise?

The first run had only 3 runs per cell, and repeats of the same prompt tend to land on the same
approach, so I reran the two tasks where Lisp lost, 10 more times per language
(`results/runs-followup.json`, checked by `followup.mjs`: does it walk to the belt, does it ever pack).

| | JS | Lisp |
|---|---|---|
| order-color: walks to the belt although Gary hauls | 1/10 | 3/10 |
| switch-colors: never packs anything | 0/10 | 5/10 |
| Both runs combined, clean programs | order-color 12/13, switch-colors 12/13 | order-color 7/13, switch-colors 6/13 |

- **Overreach (fetching from the belt) was mostly noise.** It happens in both languages. The first
  run's 0/3 for Lisp was the unlucky end. It's a prompt problem, not a language one, and the
  stray-station check in the game exists for exactly this.
- **"Never packs" is real.** 7 of 13 Lisp programs for switch-colors ship boxes nobody makes,
  against 0 of 13 in JS (Fisher exact, p ≈ 0.005). In Lisp, Haiku keeps writing a `cond` with one
  identical branch per color that only ships; in JS it writes `color = needs("red") > 0 ? "red" :
  "blue"` and then the full pack-and-ship sequence once. The JS idiom puts the color in a variable
  and the work in one place; the Lisp one duplicated the work and lost a step along the way.

So the choice stands, for a narrower reason than the first table suggested: JS isn't less prone to
overreach, but Haiku writes the branching logic correctly in JS much more reliably.

## Caveats

One model, 3 runs per cell, one prompt per language. Graded by me against a written "correct"
for each task, not by running the programs. The Lisp guide and the JS guide each had one example;
a different example could shift the Lisp numbers.
