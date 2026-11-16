# Clanker Tycoon (prototype)

A tiny factory run by three AI robot workers. You write each worker's orders in plain English, the
model turns them into a looping action script, and the sim plays it out. Workers talk back, fumble,
mishear, and walk up to your desk when they keep failing. Idea: quasarbright/quasarbright.github.io#212.

## Run it

```bash
node server.mjs
```

Then open http://localhost:8473. The server runs `claude -p --model claude-haiku-5-5` for every model
call, so it bills to your Claude plan. You need the `claude` CLI signed in (`claude auth login`).
It only listens on 127.0.0.1.

## How it's split

- `src/sim.js`: the factory. Plain state plus `step()`, no DOM and no model calls. All fumbles,
  jams and failures happen here.
- `src/brains.js`: the hires (persona plus dumbness knobs: quirk, fumble chance, mishearing,
  how much of the floor they see) and the two model calls: responding to you, and complaining at
  your desk.
- `src/llm.js`: the one function every model call goes through. `local` posts to `server.mjs`;
  `openrouter` calls OpenRouter from the browser with the shared key. Use `?llm=openrouter` to try
  it; it's written but untested, and the model id needs checking.
- `server.mjs` + `server/claude.mjs`: static files plus `/api/llm`, which forwards to `claude -p`.
  No game logic. A web build deletes these and defaults to OpenRouter.
- `tools/balance.mjs`: plays shifts headless with hand-written scripts to check the economy and the
  star cutoffs (+$20 / +$60 / +$120 profit).

## How a level plays

Each level is a fixed order, and you're scored on how fast you fill it. Your money and your crew
carry over from shift to shift. You start broke and do the work yourself: walk with WASD / arrow
keys or by clicking a station, and use the action bar under the floor (Space for the first action,
number keys for the rest). Anything that's on the order pays when it ships.

Hiring happens **between shifts only**: before your first move you can hire (a fee of 2 minutes'
wages) or let people go, and give your crew instructions. Your first move starts the clock and
closes hiring; you can still change instructions and talk while the shift runs. Wages are paid by
the second during a shift. Every level is unlocked for now.

1. **By hand.** Belt and dock, red widgets only. Ship 3. Earns the $12 for a first hire.
2. **Boxes.** Adds Pack, still only red. 3 red boxes. Robots for hire.
3. **Paint.** Three colors (green is rare), the paint machine, bins. 3 green boxes and 2 red.

Robots have skills (Fast, Careful, Patient) and wages to match. Levels are in `src/levels.js`;
progress is kept in memory only. `tools/player-check.mjs` plays level 1 headless with and without
a hire; `tools/balance.mjs` runs level 3 with scripted crews.

## Known gaps

- Scripts are plain loops. A worker can't react to the floor ("if bin 2 is full…", "switch to red once
  the greens are done"), so you change their instructions when the order moves on.
- Calls take 3–7 s, since `claude -p` can't turn thinking off. Over the API, thinking can be off.
