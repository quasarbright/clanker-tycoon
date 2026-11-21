# Clanker Tycoon (prototype)

A small factory run by AI robot workers. You write each worker's instructions in plain English, the
model turns them into a program (a small JavaScript subset, never shown to you), and the sim runs it.
When something unexpected happens a worker thinks it over (a model call, from a slowly refilling
budget) and comes back with a one-off, new instructions, or a walk to your desk. Idea: quasarbright/quasarbright.github.io#212.

## Run it

```bash
node server.mjs
```

Then open http://localhost:8473. The server runs `claude -p --model claude-haiku-5-5` for every model
call, so it bills to your Claude plan. You need the `claude` CLI signed in (`claude auth login`).
It only listens on 127.0.0.1.

## How it's split

- `src/sim.js`: the factory. Plain state plus `step()`, no DOM and no model calls. Runs each
  worker's program, wears the paint machine, and raises "unexpected" events (stuck, stalled floor,
  program ended or broke).
- `src/lang.js`: the worker language. Parses with acorn, checks the subset and the worker's tools,
  and interprets the tree as a generator that pauses at each action. `node tools/lang-test.mjs`.
- `src/brains.js`: the hires (skills, attributes, persona) and the model calls: compiling
  instructions, and responding to a message, a yell or something unexpected. Every program is
  checked, with one repair attempt.
- `src/main.js`: the screen. Cards, thinking budget, ? / ! marks, desk visits.
- `src/llm.js`: the one function every model call goes through. `local` posts to `server.mjs`;
  `openrouter` calls OpenRouter from the browser with the shared key. Use `?llm=openrouter` to try
  it; it's written but untested, and the model id needs checking.
- `server.mjs` + `server/claude.mjs`: static files plus `/api/llm`, which forwards to `claude -p`.
  No game logic. A web build deletes these and defaults to OpenRouter.
- `tools/balance.mjs`: plays shifts headless with hand-written programs, no model calls.

## How a level plays

For now the levels are a tutorial, kept minimal. Each one is a fixed order, scored by time. Before
you press **Start** you hire (on levels with robots) and write instructions; Start begins the clock,
you and the crew start moving, and hiring closes. Robots cost wages while the shift runs (shown as
labor cost). Walk with WASD / arrow keys or by clicking; use the action bar under the floor (Space
for the first action, number keys for the rest). Picking up and putting down are instant; packing,
painting and servicing show their progress. At Pack, click the widgets you want boxed.

1. **By hand.** Belt and dock, red only. Ship 3 widgets.
2. **Boxes.** Adds Pack. 1 red box.
3. **Crew.** Same floor, 4 red boxes before a 45 s shift ends, which one robot can't do alone.
4. **Paint.** Paint 2 red widgets blue and ship them. The machine wears out after the first; service it.
5. **Full floor.** Three colors, bins. 3 green boxes and 2 red in a 2-minute shift.

Vision and design principles are in `CLAUDE.md`. The design in progress, the decision log and the
project's history are in `docs/`.

Robots have skills (Packing, Painting, Repair) and attributes (Fast, Nimble, Steady); wage is
$3/min plus $2 for each. Levels are in `src/levels.js`; progress is kept in memory only.
`tools/player-check.mjs` times the by-hand levels headless; `tools/balance.mjs` checks crew levels against their shift length.

## Known gaps

- The Strong attribute (carry two) isn't built.
- Calls take 3–7 s, since `claude -p` can't turn thinking off. Over the API, thinking can be off.
