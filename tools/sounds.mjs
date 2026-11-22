// Makes every sound in the game from code, so a sound is changed here and nowhere else (decision 97).
// Each recipe below is plain synthesis (tones, noise, filters, envelopes); the result is written to
// sounds/<name>.mp3, which the game plays (src/sound.js) and the soundboard loads from Pages.
//   node tools/sounds.mjs            all of them
//   node tools/sounds.mjs ding pack  just these
// Needs ffmpeg. Deterministic: the same recipe makes the same file.
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SOUNDS } from "../src/sound.js";

const RATE = 44100;
const OUT = new URL("../sounds/", import.meta.url).pathname;

// ---------- building blocks ----------
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const buf = (sec) => new Float32Array(Math.ceil(sec * RATE));
const lerp = (a, b, k) => a + (b - a) * k;

/** Add `src` into `dst` starting at `at` seconds, times `gain`. */
function mix(dst, src, at = 0, gain = 1) {
  const o = Math.round(at * RATE);
  for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * gain;
  return dst;
}
/** A tone whose frequency follows f(t) (Hz), with waveform `wave`. */
function tone(sec, f, wave = "sine") {
  const b = buf(sec);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / RATE;
    ph += f(t) / RATE;
    const p = ph % 1;
    b[i] = wave === "sine" ? Math.sin(2 * Math.PI * p)
      : wave === "square" ? (p < 0.5 ? 1 : -1)
      : wave === "saw" ? 2 * p - 1
      : 4 * Math.abs(p - 0.5) - 1; // triangle
  }
  return b;
}
const noise = (sec) => buf(sec).map(() => rand());
/** Multiply by an envelope env(t) in 0..1. */
function shape(b, env) { for (let i = 0; i < b.length; i++) b[i] *= env(i / RATE); return b; }
const decay = (tau) => (t) => Math.exp(-t / tau);
/** Attack, hold, release (seconds), linear in and exponential-ish out. */
const ahr = (a, h, r) => (t) => (t < a ? t / a : t < a + h ? 1 : Math.max(0, 1 - (t - a - h) / r) ** 2);

/** A biquad filter (RBJ cookbook). type: lowpass, highpass, bandpass; f may follow time. */
function filter(b, type, f, q = 0.707) {
  const fAt = typeof f === "function" ? f : () => f;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < b.length; i++) {
    const w = (2 * Math.PI * Math.min(fAt(i / RATE), RATE * 0.45)) / RATE, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === "lowpass") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (type === "highpass") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    const x = b[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; b[i] = y;
  }
  return b;
}
/** A struck metal thing: inharmonic partials, each fading at its own rate, plus a click. */
function metal(sec, base, partials = [[1, 1, 0.5], [2.76, 0.5, 0.25], [5.4, 0.25, 0.12], [8.9, 0.12, 0.06]]) {
  const b = buf(sec);
  for (const [ratio, amp, tau] of partials) mix(b, shape(tone(sec, () => base * ratio), decay(tau)), 0, amp);
  mix(b, shape(filter(noise(0.01), "highpass", 3000), decay(0.003)), 0, 0.6);
  return b;
}

// ---------- the recipes ----------
// Tone of voice (decision 80): charming, cute, industrial, slapstick. Small machines doing honest
// work, a bell when it goes right and a deflating honk when it doesn't. Nothing harsh or sci-fi.
const RECIPES = {
  // A robot foot on the factory floor: a tiny metal tap over a soft thump.
  step: () => {
    const b = buf(0.09);
    mix(b, shape(filter(noise(0.03), "bandpass", 2400, 3), decay(0.006)), 0, 0.9);
    mix(b, shape(tone(0.08, (t) => lerp(120, 70, t / 0.08)), decay(0.02)), 0, 0.7);
    return b;
  },
  // A Fast robot's wheels: two quick clacks over a little whir, repeated as it rolls.
  roll: () => {
    const b = buf(0.14);
    mix(b, shape(filter(tone(0.12, () => 190, "saw"), "lowpass", 900), ahr(0.01, 0.07, 0.04)), 0, 0.35);
    for (const at of [0, 0.045]) mix(b, shape(filter(noise(0.02), "bandpass", 3600, 4), decay(0.004)), at, 0.9);
    return b;
  },
  // A grabber closing on something: a quick rising plip with a click.
  pickup: () => {
    const b = buf(0.1);
    mix(b, shape(tone(0.1, (t) => lerp(700, 1500, Math.min(1, t / 0.04))), decay(0.025)), 0, 0.8);
    mix(b, shape(filter(noise(0.01), "highpass", 4000), decay(0.002)), 0, 0.5);
    return b;
  },
  // Setting it down: the pickup turned around, a falling plop with a soft knock
  // (Mike: "the opposite of the pickup").
  putdown: () => {
    const b = buf(0.14);
    mix(b, shape(tone(0.14, (t) => lerp(1300, 520, Math.min(1, t / 0.05))), decay(0.03)), 0, 0.8);
    mix(b, shape(filter(noise(0.02), "lowpass", 1500), decay(0.004)), 0.035, 0.4);
    return b;
  },
  // Packing a box: two cardboard flaps fold in, a strip of tape crackles off the roll, a pat on
  // top. The tape is stick-slip: a run of tiny irregular clicks that speeds up as it's pulled, so it
  // can't be mistaken for the paint spray's steady hiss (Mike).
  pack: () => {
    const b = buf(1.0);
    for (const at of [0, 0.17]) mix(b, shape(filter(noise(0.1), "bandpass", 650, 1.2), ahr(0.008, 0.02, 0.06)), at, 0.9);
    const tape = buf(0.4);
    for (let t = 0; t < 0.36;) {
      const k = t / 0.36, click = shape(filter(noise(0.006), "bandpass", 1800 + 900 * k, 3), decay(0.0012));
      mix(tape, click, t, 0.6 + 0.4 * Math.abs(rand()));
      t += (1 / lerp(90, 260, k)) * (0.6 + 0.8 * Math.abs(rand()));
    }
    mix(b, shape(tape, ahr(0.02, 0.3, 0.08)), 0.38, 1);
    mix(b, shape(filter(noise(0.06), "lowpass", 500), decay(0.015)), 0.82, 0.9);
    mix(b, shape(tone(0.1, () => 140), decay(0.025)), 0.82, 0.5);
    return b;
  },
  // The paint machine: a valve clicks open and the nozzle sprays.
  paint: () => {
    const b = buf(0.95);
    mix(b, metal(0.08, 1800, [[1, 0.5, 0.01], [2.3, 0.3, 0.008]]), 0, 0.6);
    const spray = filter(filter(filter(noise(0.85), "highpass", 2200), "lowpass", 6500), "lowpass", 6500);
    shape(spray, (t) => ahr(0.04, 0.55, 0.26)(t) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 23 * t)));
    mix(b, spray, 0.05, 0.55);
    return b;
  },
  // The assembler: one heavy press, ka-CHUNK, as three boxes become a crate. One sound, no hiss
  // (Mike: the old one "makes absolutely no sense" and ended like the paint spray).
  assemble: () => {
    const b = buf(0.6);
    mix(b, shape(tone(0.4, (t) => lerp(110, 55, Math.min(1, t / 0.12))), decay(0.09)), 0, 1);
    mix(b, metal(0.5, 240, [[1, 0.5, 0.14], [2.76, 0.25, 0.07], [5.4, 0.1, 0.03]]), 0, 0.6);
    mix(b, shape(filter(noise(0.04), "lowpass", 1200), decay(0.008)), 0, 0.7);
    return b;
  },
  // Servicing a machine: a wrench ratchets twice (no ding at the end; Mike).
  service: () => {
    const b = buf(0.8);
    for (const start of [0, 0.42]) for (let k = 0; k < 7; k++) {
      mix(b, shape(filter(noise(0.015), "bandpass", 4200, 5), decay(0.003)), start + k * 0.042, 0.9);
      mix(b, shape(tone(0.03, () => 2300), decay(0.005)), start + k * 0.042, 0.2);
    }
    return b;
  },
  // Something shipped that was ordered: a bright desk bell.
  ding: () => {
    const b = buf(1.4);
    mix(b, metal(1.4, 1320, [[1, 1, 0.55], [2.32, 0.45, 0.3], [4.25, 0.2, 0.15], [6.63, 0.1, 0.08]]), 0, 1);
    return b;
  },
  // Something shipped that nobody ordered: two deflating honks.
  nope: () => {
    const b = buf(0.6);
    for (const [at, f0, f1] of [[0, 233, 220], [0.22, 196, 150]]) {
      const h = tone(0.24, (t) => lerp(f0, f1, t / 0.24) * (1 + 0.012 * Math.sin(2 * Math.PI * 9 * t)), "square");
      mix(b, shape(filter(h, "lowpass", 1100, 1.5), ahr(0.01, 0.14, 0.09)), at, 0.55);
    }
    return b;
  },
  // A machine wears out: one motor grinding to a halt, its pitch and its rattle both slowing down
  // (Mike: the old chug, clank and steam was "a little too busy").
  worn: () => {
    const sec = 1.3, b = buf(sec);
    const f = (t) => lerp(150, 28, Math.min(1, t / 1.1) ** 0.7);
    const grind = tone(sec, f, "saw");
    // The motor's own rotation rattles it, so the rattle slows with the pitch.
    let ph = 0;
    for (let i = 0; i < grind.length; i++) { ph += f(i / RATE) / 6 / RATE; grind[i] *= 0.55 + 0.45 * Math.sin(2 * Math.PI * ph) ** 2; }
    mix(b, shape(filter(grind, "lowpass", 900), ahr(0.02, 0.75, 0.5)), 0, 1);
    mix(b, shape(filter(noise(sec), "bandpass", (t) => f(t) * 8, 2), ahr(0.02, 0.75, 0.5)), 0, 0.5);
    return b;
  },
  // A worker's action didn't work: a small descending boop-boop.
  fail: () => {
    const b = buf(0.26);
    for (const [at, f] of [[0, 620], [0.11, 440]]) mix(b, shape(filter(tone(0.1, () => f, "square"), "lowpass", 1400), ahr(0.005, 0.05, 0.04)), at, 0.4);
    return b;
  },
  // Something unexpected got a worker thinking: a rising "hm?".
  huh: () => {
    const b = buf(0.36);
    mix(b, shape(filter(tone(0.12, (t) => lerp(330, 300, t / 0.12), "square"), "lowpass", 1200), ahr(0.01, 0.06, 0.05)), 0, 0.4);
    mix(b, shape(filter(tone(0.2, (t) => lerp(320, 560, (t / 0.2) ** 1.5), "square"), "lowpass", 1600), ahr(0.01, 0.12, 0.07)), 0.14, 0.4);
    return b;
  },
  // The shift whistle, at Start and when the shift ends: an old factory steam whistle (Mike: "more
  // like a steam whistle to give an old factory vibe"). Mostly steam: breathy noise ringing in a
  // pipe, a low chord, the pitch climbing as the pressure builds and sagging as it runs out.
  whistle: () => {
    const sec = 2.3, b = buf(sec);
    const env = (t) => (t < 0.25 ? (t / 0.25) ** 1.5 : t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.7) ** 1.5);
    const bend = (t) => (t < 0.3 ? 0.86 + 0.14 * (t / 0.3) ** 0.6 : t > 1.6 ? 1 - 0.05 * ((t - 1.6) / 0.7) : 1);
    const wobble = (t) => 1 + 0.004 * Math.sin(2 * Math.PI * 5.3 * t) + 0.003 * Math.sin(2 * Math.PI * 1.7 * t);
    // Each band is set to the same loudness before mixing: a narrow band of noise is far quieter
    // than broad hiss, and the hiss drowned the pipes until this.
    const rms = (x) => { let a = 0; for (const v of x) a += v * v; const r = Math.sqrt(a / x.length) || 1; return x.map((v) => v / r); };
    for (const [f0, amp] of [[262, 1], [330, 0.8], [392, 0.7]]) {
      const pitch = (t) => f0 * bend(t) * wobble(t);
      mix(b, shape(rms(filter(filter(noise(sec), "bandpass", pitch, 25), "bandpass", pitch, 25)), env), 0, amp);
      mix(b, shape(rms(filter(noise(sec), "bandpass", (t) => pitch(t) * 2, 20)), env), 0, 0.3 * amp);
      mix(b, shape(rms(tone(sec, pitch)), env), 0, 0.25 * amp);
    }
    // the hiss of steam around the pipe
    mix(b, shape(rms(filter(noise(sec), "highpass", 2500)), (t) => env(t) * (t < 0.2 ? 1.6 : 0.5)), 0, 0.18);
    return b;
  },
};

// ---------- write them out ----------
function writeWav(path, b) {
  let peak = 0;
  for (const v of b) peak = Math.max(peak, Math.abs(v));
  const k = peak ? 0.89 / peak : 1; // normalize to about -1 dBFS; loudness is set in SOUNDS
  const data = Buffer.alloc(44 + b.length * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + b.length * 2, 4); data.write("WAVE", 8);
  data.write("fmt ", 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(b.length * 2, 40);
  // A 3 ms fade at each end, so nothing clicks.
  const fade = Math.round(0.003 * RATE);
  for (let i = 0; i < b.length; i++) {
    const edge = Math.min(1, i / fade, (b.length - 1 - i) / fade);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[i] * k * edge)) * 32767), 44 + i * 2);
  }
  writeFileSync(path, data);
}

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(SOUNDS);
const missing = Object.keys(SOUNDS).filter((n) => !RECIPES[n]);
if (missing.length) throw new Error(`no recipe for ${missing.join(", ")}`);
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), "ct-sounds");
mkdirSync(tmp, { recursive: true });
for (const name of names) {
  if (!RECIPES[name]) throw new Error(`no recipe called ${name}`);
  seed = 1 + [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const wav = join(tmp, `${name}.wav`);
  writeWav(wav, RECIPES[name]());
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", join(OUT, `${name}.mp3`)]);
  console.log(`sounds/${name}.mp3`);
}
rmSync(tmp, { recursive: true, force: true });
