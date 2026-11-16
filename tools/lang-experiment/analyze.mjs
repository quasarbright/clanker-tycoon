// Numbers from results/runs.json, plus every program side by side for hand grading.
//   node analyze.mjs   → prints the table, writes results/programs.md
import { readFileSync, writeFileSync } from "node:fs";

const { tasks, results } = JSON.parse(readFileSync("results/runs.json", "utf8"));
const valid = (c) => c && c.parse && c.subsetOk && c.toolsOk;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p90 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.9)] : null; };

for (const lang of ["js", "lisp"]) {
  const rs = results.filter((r) => r.lang === lang);
  const n = rs.length;
  const parse = rs.filter((r) => r.check.parse).length;
  const subset = rs.filter((r) => r.check.parse && r.check.subsetOk).length;
  const tools = rs.filter((r) => r.check.parse && r.check.toolsOk).length;
  const first = rs.filter((r) => valid(r.check)).length;
  const repaired = rs.filter((r) => r.repair);
  const fixed = repaired.filter((r) => valid(r.repairCheck)).length;
  const ms = rs.map((r) => r.first.ms).filter(Boolean);
  const out = rs.map((r) => r.first.out).filter(Boolean);
  const think = rs.map((r) => r.first.thinking ?? 0);
  const repairMs = repaired.map((r) => r.repair.ms).filter(Boolean);
  const issues = {};
  for (const r of rs) for (const i of r.check.issues ?? (r.check.error ? [r.check.error.replace(/\(\d+:\d+\)/, "")] : [])) issues[i] = (issues[i] || 0) + 1;
  console.log(`\n== ${lang} (${n} compiles)`);
  console.log(`  parses: ${parse}/${n}   in subset: ${subset}/${n}   tools ok: ${tools}/${n}   fully valid first try: ${first}/${n}`);
  console.log(`  repairs: ${repaired.length}, fixed by one retry: ${fixed}/${repaired.length}   → valid after repair: ${first + fixed}/${n}`);
  console.log(`  model time median ${med(ms)} ms, p90 ${p90(ms)} ms   output tokens median ${med(out)} (thinking median ${med(think)})`);
  if (repairMs.length) console.log(`  a repair adds median ${med(repairMs)} ms`);
  console.log(`  issues: ${JSON.stringify(issues)}`);
}

let md = "# Programs, side by side\n\nFor hand grading. Each task: what a correct program does, then every program per language with its check.\n";
for (const t of tasks) {
  md += `\n## ${t.id}\n\n**Instructions:** ${t.instructions}  \n**Order:** ${t.order}  \n**Coworkers:** ${JSON.stringify(t.coworkers)}  \n**Correct:** ${t.expect}\n`;
  for (const lang of ["js", "lisp"]) {
    for (const r of results.filter((r) => r.task === t.id && r.lang === lang).sort((a, b) => a.run - b.run)) {
      const c = r.check;
      const verdict = valid(c) ? "valid" : c.parse ? `issues: ${c.issues.join("; ")}` : c.error;
      md += `\n### ${lang} #${r.run} (${verdict}${r.repair ? `; repair: ${valid(r.repairCheck) ? "fixed" : "still bad"}` : ""}, ${r.first.ms} ms)\n\n\`\`\`${lang === "js" ? "js" : "lisp"}\n${r.first.program ?? "(no program)"}\n\`\`\`\n`;
      if (r.repair) md += `\nRepaired:\n\n\`\`\`${lang === "js" ? "js" : "lisp"}\n${r.repair.program ?? "(no program)"}\n\`\`\`\n`;
    }
  }
}
writeFileSync("results/programs.md", md);
console.log("\nwrote results/programs.md");
