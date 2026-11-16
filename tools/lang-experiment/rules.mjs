// Prompt experiment: JS with today's guide ("js") vs the guide plus writing rules ("js-rules").
// Bugs, checked mechanically per program:
//   overreach   walks to the belt although a coworker hauls (packer, order-color, switch-colors)
//   never packs no pack() although no coworker packs (same three tasks)
//   ignores order doesn't ask needs()/needsAny(), so counts are hard-coded or it never stops
//   extras      fix() or say() the instructions didn't ask for (reported separately; not "bugs")
//   node rules.mjs [results/runs-rules.json]
import { readFileSync } from "node:fs";

const { results } = JSON.parse(readFileSync(process.argv[2] || "results/runs-rules.json", "utf8"));
const COWORKER_HAULS = new Set(["packer", "order-color", "switch-colors"]);
const NEEDS_ORDER = new Set(["order-color", "switch-colors", "paint-to-order"]);

function bugs(task, p) {
  const b = [];
  if (COWORKER_HAULS.has(task) && /move\(\s*"BELT"\s*\)/.test(p)) b.push("overreach");
  if (COWORKER_HAULS.has(task) && !/\bpack\(/.test(p)) b.push("never packs");
  if (NEEDS_ORDER.has(task) && !/\bneeds(Any)?\(/.test(p)) b.push("ignores order");
  return b;
}
const extras = (p) => [/\bfix\(/.test(p) && "fix", /\bsay\(/.test(p) && "say"].filter(Boolean);

const tasks = [...new Set(results.map((r) => r.task))];
const variants = ["js", "js-rules"];
const total = Object.fromEntries(variants.map((v) => [v, { n: 0, clean: 0 }]));
for (const task of tasks) {
  for (const v of variants) {
    const rs = results.filter((r) => r.task === task && r.lang === v && r.first.program);
    const tally = {};
    let clean = 0;
    for (const r of rs) {
      const bs = bugs(task, r.first.program);
      if (!bs.length) clean++;
      for (const x of [...bs, ...extras(r.first.program).map((e) => `extra ${e}`)]) tally[x] = (tally[x] || 0) + 1;
    }
    total[v].n += rs.length; total[v].clean += clean;
    console.log(`${task.padEnd(15)} ${v.padEnd(9)} clean ${clean}/${rs.length}   ${JSON.stringify(tally)}`);
  }
}
for (const v of variants) console.log(`TOTAL ${v.padEnd(9)} clean ${total[v].clean}/${total[v].n}`);
const ms = (v) => { const a = results.filter((r) => r.lang === v).map((r) => r.first.wall).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
for (const v of variants) console.log(`wall median ${v}: ${ms(v)} ms`);
