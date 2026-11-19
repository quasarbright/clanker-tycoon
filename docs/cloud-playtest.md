# Playtesting in a cloud Claude session

A cloud Claude session can't reach the model the usual ways: `claude -p` isn't signed in there
("Authentication error"), and there's no OpenRouter key. The **file bridge** gets around both:
the server writes each model call to a file, a Haiku subagent of the session answers it with the
same prompt and JSON format, and the server picks the answer up. The workers are still Claude Haiku,
following the game's real prompts; only the delivery changes. It needs a Claude session running
alongside it, so it's for automated playtests, never for players. Decision 91.

The cloud network also blocks `cdn.jsdelivr.net` and `quasarbright.github.io`, where the page gets
acorn and the shared footer, so the browser opens the game through `tools/playtest-browser.mjs`,
which serves acorn from `node_modules` and leaves the footer out.

## When to use it

Playtest on Mike's Mac when it's online (the normal server, real `claude -p`); use the cloud bridge
only when the Mac isn't reachable (Mike, 2026-11-19: "we should playtest on Mac when possible, but
if the Mac is not alive, then playtest on the cloud thing with that bridge").

The browser suite (`npm run test:e2e`) also can't load the page in the cloud, for the same CDN
reason: all but one test time out there, with or without the bridge. Run it on the Mac.

## Running one

From the repo folder:

1. `npm ci` if `node_modules` is missing.
2. Start the server in bridge mode, in the background:
   `LLM_BRIDGE=logs/bridge node server.mjs 8473`
   It says "model calls through the file bridge" when it starts. Nothing else about the server
   changes, and without `LLM_BRIDGE` it's the normal `claude -p` server.
3. Start the answerer: a background subagent on the Haiku model (Agent tool, `model: "haiku"`,
   `run_in_background: true`), whose whole prompt is `tools/llm-bridge-answerer.md` with
   `{{REPO}}` replaced by the repo's absolute path and `{{ENV}}` by nothing (or by
   `LLM_BRIDGE=<dir> ` for a folder other than `logs/bridge`). It loops on
   `node tools/llm-bridge.mjs next`, answers each request, and only stops on `STOP`.
4. Play through a browser opened with the helper:
   ```js
   import { openGame } from "<repo>/tools/playtest-browser.mjs";
   const { browser, page } = await openGame("http://localhost:8473/?playlog");
   ```
   `?playlog` keeps the play log (`logs/play/<date>.jsonl`), which an automated browser
   otherwise skips. A blind playtester gets the URL plus this one import and nothing else about
   the game.
5. When done: `node tools/llm-bridge.mjs stop` (the answerer finishes on its next `next`), then
   stop the server. `node tools/llm-bridge.mjs start` clears the stop for the next run.

`node tools/llm-bridge.mjs status` shows how many calls are waiting, claimed and answered.
Every call still goes into `logs/llm.jsonl`, with `usage.model: "bridge"`.

## How it works

- `server/bridge.mjs`: the server writes `requests/<id>.json` (system, prompt, schema) and polls
  for `answers/<id>.json` every 250 ms, for up to 10 minutes. An answer that doesn't match the
  schema is refused; no answer in time is a plain model error in the game, the same as a failed
  `claude -p` call.
- `tools/llm-bridge.mjs`: the answerer's side. `next` claims the oldest request by renaming it into
  `claimed/` (atomic, so two answerers never take the same one) and prints it; `answer` checks the
  JSON against the request's schema and prints `NOT SENT` with the problems if it doesn't fit.
- Tests: `test/bridge.test.mjs`.

## Limits

- **Latency.** In the first run a call took 3.5 and 7 seconds, about what `claude -p` takes, but
  it depends on the answerer being idle on `next`: calls queue behind each other (one at a time),
  and a busy answerer adds its own turn time. Compiling before a shift doesn't care; mid-shift
  thinking lands later than in real play, since the floor doesn't wait for it.
- **Not quite a clean call.** The answerer is Haiku, but inside an agent with its own system prompt,
  and its context keeps every earlier request of the run. It's told to treat each request alone,
  and the game's prompts carry everything a worker needs, so answers come out close to the real
  thing; for long runs, restart the answerer every few dozen calls to keep it fresh.
- One answerer handles one call at a time. Two answerers on the same folder share the work.
