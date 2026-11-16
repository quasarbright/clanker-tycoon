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

For now the levels are a tutorial. Each one is a fixed order, and you're scored on how fast you
fill it. You're on the floor yourself: walk with WASD / arrow keys or by clicking a station, and use
the action bar under the floor (Space for the first action, number keys for the rest). You and the
robots can use a station from any side; everyone walks to the nearest side.

On levels with robots for hire, hiring is free but only happens **before your first move**. Your
first move starts the clock and closes hiring; you can still change instructions and talk while the
shift runs. Each new machine shows up first in a level where you use it yourself. All levels are
unlocked for now. (Earning money and spending it on your crew is parked in issue #9.)

1. **By hand.** Belt and dock, red only. Ship 3 widgets.
2. **Boxes.** Adds Pack. 2 red boxes, just you.
3. **Crew.** Same floor, 6 red boxes. Hire robots first.
4. **Paint.** Three colors (green is rare) and the paint machine. 1 green box, just you.
5. **Full floor.** Adds bins. 3 green boxes and 2 red, hire from everyone.

Robots have skills (Fast, Careful, Patient). Levels are in `src/levels.js`;
progress is kept in memory only. `tools/player-check.mjs` times levels 1–2 by hand headless (for star times);
`tools/balance.mjs` runs the full floor with scripted crews.

## Known gaps

- Scripts are plain loops. A worker can't react to the floor ("if bin 2 is full…", "switch to red once
  the greens are done"), so you change their instructions when the order moves on.
- Calls take 3–7 s, since `claude -p` can't turn thinking off. Over the API, thinking can be off.
