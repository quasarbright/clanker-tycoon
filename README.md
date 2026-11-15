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

## Levels

Each level starts with planning: you write every worker's job, press Start, and they all read
their jobs at once before anything moves. While it runs you can change a job, talk to one worker or
yell to everyone. A worker who keeps failing walks to your desk; their message and a reply box show
up under the floor.

1. **First day.** Gary-7, a belt and a dock. Any widget that reaches the dock ships. Ship 5.
2. **Boxes.** Adds Pack and Doris. Only boxes of 3 ship. Ship 3.
3. **Full shift.** Everything: orders by color, paint, bins, Blip, payroll, a 4-minute clock, stars.

Levels are in `src/levels.js`. Each level unlocks after the one before it (kept in memory only).

## Known gaps

- Scripts are plain loops. A worker can't react to the floor ("if bin 2 is full…", "whatever color
  the first order wants"), so they fail and come complain instead.
- Calls take 3–7 s, since `claude -p` can't turn thinking off. Over the API, thinking can be off.
