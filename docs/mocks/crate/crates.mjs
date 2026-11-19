// Three crate looks, each shown in the Assembler card next to the game's real box, at the floor's
// size (--u = 10px here, the game's own unit) and blown up 2x so the details read.
import { chromium } from "/Users/mdelmonaco/GitHub/clanker-tycoon/node_modules/playwright/index.mjs";
const S = "/private/tmp/claude-501/-Users-mdelmonaco-GitHub/18e72a85-6f93-406b-96f2-5a907d41c25b/scratchpad";
const stamp = "0355";
const R = "#e05a4a", B = "#4a86e8", G = "#4cb26a";

const box = (c) => `<span class="box"><i style="background:${c}"></i><i style="background:${c}"></i><i style="background:${c}"></i></span>`;
const now = `<span class="crate-now"><i style="background:${R}"></i><i style="background:${B}"></i><i style="background:${G}"></i></span>`;

const options = {
  "1-crate-x-braced": {
    title: "1 · X-braced wooden crate",
    desc: "Dark planks in a heavy frame with an X brace across the front and metal corners. The colors sit on a small tag. A box is plain cardboard; this is lumber.",
    css: `.crate{position:relative;width:calc(var(--u)*3.8);height:calc(var(--u)*3);background:#6b4220;border:3px solid #3d2410;border-radius:2px;box-shadow:inset 0 0 0 2px #8a5a2c, 0 3px 0 #0006;overflow:hidden}
      .crate:before,.crate:after{content:"";position:absolute;left:-10%;right:-10%;top:50%;height:4px;background:#8a5a2c;border-top:1px solid #3d2410;border-bottom:1px solid #3d2410}
      .crate:before{transform:rotate(38deg)}.crate:after{transform:rotate(-38deg)}
      .crate .tag{position:absolute;z-index:1;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:2px;padding:2px 3px;background:#efe6cf;border-radius:2px;box-shadow:0 0 0 1px #3d2410}
      .crate .tag i{width:6px;height:6px;border-radius:1px}
      .crate b{position:absolute;width:6px;height:6px;background:#9aa0a8;border:1px solid #444}
      .crate b:nth-of-type(1){left:-1px;top:-1px}.crate b:nth-of-type(2){right:-1px;top:-1px}.crate b:nth-of-type(3){left:-1px;bottom:-1px}.crate b:nth-of-type(4){right:-1px;bottom:-1px}`,
    html: `<span class="crate"><span class="tag"><i style="background:${R}"></i><i style="background:${B}"></i><i style="background:${G}"></i></span><b></b><b></b><b></b><b></b></span>`,
  },
  "2-crate-three-boxes-strapped": {
    title: "2 · Three boxes strapped on a pallet",
    desc: "The crate shows what it is: a red, a blue and a green box stacked on a little pallet, tied with a yellow strap. Taller than a box, and the three colors are the whole look.",
    css: `.crate{position:relative;display:inline-flex;flex-direction:column;align-items:center;width:calc(var(--u)*3.6)}
      .stack{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:1px;width:calc(var(--u)*3);}
      .stack span{height:calc(var(--u)*1.2);border-radius:2px;box-shadow:inset 0 -2px 0 #0003, 0 0 0 1px #0005}
      .stack span:first-child{grid-column:1/3;width:55%;justify-self:center}
      .strap{position:absolute;left:50%;top:1px;bottom:0;width:4px;margin-left:-2px;background:#f2c230;box-shadow:0 0 0 1px #6b5410}
      .pallet{width:100%;height:6px;margin-top:1px;background:repeating-linear-gradient(90deg,#8a5c2c 0 8px,transparent 0 11px);border-top:3px solid #a8743c;border-radius:1px}`,
    html: `<span class="crate"><span class="stack"><span style="background:${R}"></span><span style="background:${B}"></span><span style="background:${G}"></span><span class="strap"></span></span><span class="pallet"></span></span>`,
  },
  "3-crate-shipping-case": {
    title: "3 · Gray shipping case with color bands",
    desc: "Not brown at all: a gray steel case with rivets and a handle, and three colored bands around it. Boxes are the only brown things on the floor.",
    css: `.crate{position:relative;width:calc(var(--u)*3.8);height:calc(var(--u)*2.8);background:linear-gradient(#8f98a3,#6b737d);border:2px solid #3a4048;border-radius:5px;box-shadow:0 3px 0 #0006;display:flex;gap:4px;justify-content:center}
      .crate i{width:5px;height:100%;}
      .crate .handle{position:absolute;top:-7px;left:50%;margin-left:-8px;width:16px;height:7px;border:2px solid #3a4048;border-bottom:none;border-radius:4px 4px 0 0}
      .crate b{position:absolute;width:3px;height:3px;border-radius:50%;background:#c8ced6}
      .crate b:nth-of-type(1){left:3px;top:3px}.crate b:nth-of-type(2){right:3px;top:3px}.crate b:nth-of-type(3){left:3px;bottom:3px}.crate b:nth-of-type(4){right:3px;bottom:3px}`,
    html: `<span class="crate"><span class="handle"></span><i style="background:${R}"></i><i style="background:${B}"></i><i style="background:${G}"></i><b></b><b></b><b></b><b></b></span>`,
  },
};

const page = (o) => `<html><head><style>
  body{margin:0;background:#0e1014;font-family:Barlow,system-ui,sans-serif;color:#e8e6df;--u:10px}
  .wrap{padding:22px 26px}
  h1{font-size:19px;margin:0 0 4px}p{margin:0 0 16px;color:#9aa3ad;font-size:13px;max-width:520px;line-height:1.35}
  .row{display:flex;gap:28px;align-items:flex-start}
  .card{background:#1d222b;border:1px solid #2e3440;border-radius:10px;padding:10px 12px;width:200px}
  .card h2{font:800 14px system-ui;letter-spacing:.08em;margin:0 0 2px}
  .card small{color:#9aa3ad;font-size:10.5px}
  .items{display:flex;flex-wrap:wrap;gap:5px;align-items:flex-end;margin-top:8px;min-height:40px}
  .lab{font-size:10px;color:#9aa3ad;text-align:center;margin-top:3px}
  .pair{display:flex;gap:26px;align-items:flex-end}
  .box{width:calc(var(--u)*2.6);height:calc(var(--u)*2.2);border-radius:3px;background:#b88a52;display:inline-flex;align-items:center;justify-content:center;gap:1px;box-shadow:inset 0 -2px 0 #0004}
  .box i{width:5.5px;height:5.5px;border-radius:50%}
  .crate-now{width:calc(var(--u)*3.6);height:calc(var(--u)*2.4);border-radius:3px;background:repeating-linear-gradient(90deg,#9a6a35 0 5px,#8a5c2c 0 6px);border:2px solid #5a3a18;display:inline-flex;align-items:center;justify-content:center;gap:2px}
  .crate-now i{width:6px;height:6px;border-radius:2px}
  .col{display:flex;flex-direction:column;align-items:center}
  ${o.css}
</style></head><body><div class="wrap"><h1>${o.title}</h1><p>${o.desc}</p>
<div class="row">
  <div class="card"><h2>ASSEMBLER</h2><small>red + blue + green box → 1 crate</small><div class="items">${box(R)}${box(B)}${o.html}</div></div>
  <div class="pair"><div class="col">${box(R)}<div class="lab">box</div></div><div class="col">${now}<div class="lab">crate now</div></div><div class="col">${o.html}<div class="lab">new crate</div></div></div>
</div></div></body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 620, height: 260 }, deviceScaleFactor: 2 });
for (const [name, o] of Object.entries(options)) {
  await p.setContent(page(o));
  await p.screenshot({ path: `${S}/${name}-${stamp}.png`, fullPage: true });
  console.log(`${S}/${name}-${stamp}.png`);
}
await b.close();
