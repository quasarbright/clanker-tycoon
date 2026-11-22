// What the factory sounds like (decision 97). The sounds themselves are made from code by
// tools/sounds.mjs into sounds/<name>.mp3. This file says which sound goes with which sim event,
// makes footsteps from how far each robot walked, and plays them in the browser.
// Nothing here touches the DOM, so the soundboard's replay recorder (tools/soundboard.mjs) uses the
// same rules headless.
import { STATIONS } from "./sim.js";

/** Every sound, what it's for, and how loud it plays (0..1; the files are all normalized). */
export const SOUNDS = {
  step:     { gain: 0.16, what: "A robot takes a step" },
  roll:     { gain: 0.14, what: "A Fast robot's wheels roll" },
  pickup:   { gain: 0.35, what: "Picking something up" },
  putdown:  { gain: 0.4,  what: "Putting something down" },
  pack:     { gain: 0.45, what: "Packing a box" },
  paint:    { gain: 0.3,  what: "The paint machine sprays" },
  assemble: { gain: 0.45, what: "The assembler puts a crate together" },
  service:  { gain: 0.45, what: "Servicing a machine" },
  ding:     { gain: 0.5,  what: "Shipped, and it was ordered" },
  nope:     { gain: 0.45, what: "Shipped, and nobody ordered it" },
  worn:     { gain: 0.55, what: "A machine wears out and stops" },
  fail:     { gain: 0.25, what: "Something a robot tried didn't work" },
  huh:      { gain: 0.3,  what: "Something unexpected sets a robot thinking" },
  whistle:  { gain: 0.4,  what: "The shift whistle, at Start and at the end" },
};

/** How far a robot walks between footsteps, in floor units (a Fast robot rolls, more often). */
export const STRIDE = { step: 7, roll: 5 };

/** The sound a sim event makes, or null. */
export function soundOf(ev) {
  switch (ev.type) {
    case "pickUp": return "pickup";
    case "putDown": return "putdown";
    case "work": return { pack: "pack", paint: "paint", assemble: "assemble", service: "service" }[ev.kind] ?? null;
    case "ship": return ev.matched ? "ding" : "nope";
    case "worn": return "worn";
    case "fail": return "fail";
    case "unexpected": case "thinkRequest": return "huh";
    case "end": return "whistle";
    default: return null;
  }
}

const everyone = (s) => [s.player, ...s.workers].filter(Boolean);

/** Where on the floor (x, 0..100) an event happens, for stereo. */
function whereOf(s, ev) {
  if (ev.type === "ship") return STATIONS.DOCK.x;
  if (ev.type === "worn" && STATIONS[ev.station]) return STATIONS[ev.station].x;
  return everyone(s).find((w) => w.id === ev.worker)?.x ?? 50;
}

/** The sounds these sim events make: [{ sound, x }]. */
export function eventCues(s, events) {
  const out = [];
  for (const ev of events) {
    const sound = soundOf(ev);
    if (sound) out.push({ sound, x: whereOf(s, ev) });
  }
  return out;
}

/**
 * Footsteps: each robot (and you) makes a step sound every STRIDE units walked. `feet` remembers
 * where everyone was last time (pass the same Map every frame). A jump of more than 12 units in
 * one frame is a new shift or a respawn, not a walk.
 */
export function footstepCues(s, feet) {
  const out = [];
  for (const w of everyone(s)) {
    const f = feet.get(w.id);
    if (!f) { feet.set(w.id, { x: w.x, y: w.y, d: 0 }); continue; }
    const moved = Math.hypot(w.x - f.x, w.y - f.y);
    f.x = w.x; f.y = w.y;
    if (moved > 12 || moved < 1e-4) { if (moved > 12) f.d = 0; continue; }
    const kind = w.hire?.attributes?.includes("fast") ? "roll" : "step";
    f.d += moved;
    if (f.d >= STRIDE[kind]) { f.d %= STRIDE[kind]; out.push({ sound: kind, x: w.x }); }
  }
  return out;
}

/**
 * Plays sounds in a browser. Self-contained on purpose: tools/soundboard.mjs copies this function's
 * source into the soundboard page, so the game and the soundboard play sounds the same way.
 *   sounds: SOUNDS; url(name): where that sound's file is.
 * play(name, x) pans by floor position (0..100). Muting is the caller's business.
 */
export function createSoundPlayer(sounds, url) {
  let ctx = null, master = null;
  const buffers = {}, last = {};
  const VARY = { step: 0.08, roll: 0.06, pickup: 0.06, putdown: 0.06, fail: 0.03 };
  function context() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  function load(name) {
    if (!buffers[name]) {
      buffers[name] = fetch(url(name))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${url(name)}`))))
        .then((data) => context().decodeAudioData(data))
        .catch((e) => { buffers[name] = null; throw e; });
    }
    return buffers[name];
  }
  return {
    /** Fetch and decode every sound (call after a click, so the browser lets audio start). */
    loadAll() { if (!context()) return Promise.resolve([]); return Promise.allSettled(Object.keys(sounds).map(load)); },
    play(name, x = 50, gain = 1) {
      const c = context(), spec = sounds[name];
      if (!c || !spec) return;
      // The same sound twice within 25 ms is one sound (a whole crew stalling says "huh" once).
      const now = c.currentTime;
      if (now - (last[name] ?? -1) < 0.025) return;
      last[name] = now;
      load(name).then((b) => {
        if (!b) return;
        const src = c.createBufferSource();
        src.buffer = b;
        src.playbackRate.value = 1 + (Math.random() * 2 - 1) * (VARY[name] ?? 0);
        const g = c.createGain();
        g.gain.value = spec.gain * gain;
        let node = src.connect(g);
        if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, ((x - 50) / 50) * 0.6)); node = node.connect(p); }
        node.connect(master);
        src.start();
      }).catch(() => {});
    },
    get context() { return ctx; },
  };
}
