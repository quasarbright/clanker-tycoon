# Which OpenRouter models could run the robots? (2026-11-17)

`tools/model-experiment.mjs` runs the game's real compile path (prompt, checks, dry run, one
repair) on six instructions, twice each, per model: hauling, packing, an instruction the worker
lacks the skill for (should come back as a problem in their own words), painting, servicing, and
fetch-pack-ship in one robot (the full-Pack check). Routines that compile are also played for one
45 s shift with a partner to count boxes shipped. Reasoning off, except four models that refuse
that (minimal reasoning). About $0.04 in all.

| Model | Worked | Median time | Cost per task | Price in / out per M |
|---|---|---|---|---|
| anthropic/claude-haiku-5.5 (now) | 12/12 | 1.8 s | $0.00037 | $0.10 / $0.50 |
| deepseek/deepseek-v4.1-flash | 12/12 | 2.1 s | $0.00025 | $0.036 / $0.50 |
| meta/muse-ember (min. reasoning) | 12/12 | 1.6 s | $0.00033 | $0.10 / $0.50 |
| openai/gpt-6-luna | 11/12 | 1.9 s | $0.00018 | $0.10 / $0.50 |
| xiaomi/mimo-v2.6-flash | 11/12 | 1.9 s | $0.00033 | $0.14 / $0.28 |
| google/gemini-3.5-flash-lite (min. reasoning) | 10/12 | 1.4 s | $0.00101 | $0.30 / $2.50 |
| minimax/minimax-m3.1-flash (min. reasoning) | 10/12 | 1.9 s | $0.00046 | $0.15 / $0.60 |
| nvidia/nemotron-3.5-super-vl:free | 11/12 | 1.7 s | free | free |
| inclusionai/ling-3.2-flash:free | 9/12 | 5.6 s | free | free |
| baidu/ernie-5.5-flash-preview:free | 12/12 | 7.9 s | free | free |

Every routine that compiled shipped the full 4 boxes in its shift, except one GPT-6 Luna and one
MiMo fetch-pack-ship routine (0 and 3).

**What OpenRouter tells you.** The models API gives price, context and supported parameters per
model (including whether structured output works), and per-provider endpoints, but no measured
speed. Routing can sort providers by speed (`provider: { sort: "throughput" | "latency" }`, or a
`:nitro` suffix) and take soft latency/throughput targets. `openrouter/auto` picks a model per
request among an allow-list, with a `cost_tier` of low/medium/high, but has no "free" or "fast"
setting. Free models are capped at 20 requests a minute and 50 a day (1,000 a day after buying $10
of credits), which a busy shift can hit.

**Recommendation.** Stay on Haiku 5.5. Nothing tested is clearly faster (the fastest medians were
0.2 to 0.4 s quicker, within run-to-run noise), and only DeepSeek V4.1 Flash and Muse Ember matched
it 12/12. DeepSeek is about a third cheaper per task and could be a fallback. Free models aren't a
default: Nemotron is quick and nearly as good, but the daily cap means a player without credits
runs out after a few levels; it could be an opt-in "free mode".
