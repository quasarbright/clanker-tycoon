// The two failure modes from the first run, checked mechanically on the follow-up run:
//   overreach: the program walks to the belt although a coworker hauls
//   never packs: the program ships boxes but never calls pack
//   node followup.mjs [results/runs-followup.json]
import { readFileSync } from "node:fs";

const { results } = JSON.parse(readFileSync(process.argv[2] || "results/runs-followup.json", "utf8"));
const goesToBelt = (lang, p) => (lang === "js" ? /move\(\s*"BELT"\s*\)/ : /\(move\s+BELT\)/).test(p);
const packs = (lang, p) => (lang === "js" ? /\bpack\(/ : /\(pack\b/).test(p);

for (const task of ["order-color", "switch-colors"]) {
  for (const lang of ["js", "lisp"]) {
    const rs = results.filter((r) => r.task === task && r.lang === lang && r.first.program);
    const belt = rs.filter((r) => goesToBelt(lang, r.first.program)).length;
    const noPack = rs.filter((r) => !packs(lang, r.first.program)).length;
    const ok = rs.filter((r) => !goesToBelt(lang, r.first.program) && packs(lang, r.first.program)).length;
    console.log(`${task.padEnd(14)} ${lang.padEnd(5)} n=${rs.length}  clean ${ok}/${rs.length}   walks to belt ${belt}   never packs ${noPack}`);
  }
}
