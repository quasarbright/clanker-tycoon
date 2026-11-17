// Level 7, "Your business", in a real browser: the board between quarters (contracts, the lender,
// recruit, training, machines), the floor, and the end-of-quarter card. The model is faked.
import { test, expect } from "@playwright/test";

/** Open the page, watch the console, and open level 7's board. */
async function openBoard(page) {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.click('[data-level="7"]');
  await expect(page.locator("#boardScreen")).toBeVisible();
  return errors;
}
const contracts = (page) => page.locator("[data-contract]");
/** Finish the running quarter's shift as if `fill` boxes of each contract shipped (all, by default). */
const endShift = (page, fill = []) => page.evaluate((fill) => {
  ct.begin(); ct.step(1);
  const g = ct.game;
  g.order.forEach((l, i) => (l.done = Math.min(l.count, fill[i] ?? l.count)));
  g.over = true; g.won = g.order.every((l) => l.done >= l.count); g.t = 120;
  g.events.push({ type: "end" }); ct.step(0);
}, fill);

test("the board fits the window, offers three contracts, and Start waits for a pick", async ({ page }) => {
  const errors = await openBoard(page);
  await expect(contracts(page)).toHaveCount(3);
  await expect(page.locator("#boardGo")).toBeDisabled();
  await expect(page.locator("#forecast")).toBeEmpty();
  const scroll = await page.evaluate(() => {
    const o = document.querySelector("#boardScreen");
    return { overlay: o.scrollHeight > o.clientHeight + 1, page: document.documentElement.scrollHeight > innerHeight };
  });
  expect(scroll).toEqual({ overlay: false, page: false });
  expect(errors).toEqual([]);
});

test("Small and Large are one choice; the side contract needs a paint machine", async ({ page }) => {
  await openBoard(page);
  const [small, large, side] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await expect(page.locator(`[data-contract="${side}"]`)).toBeDisabled();
  await page.click(`[data-contract="${small}"]`);
  await page.click(`[data-contract="${large}"]`);
  await expect(page.locator(".ct-size.is-on")).toHaveCount(1);
  await expect(page.locator(`[data-contract="${large}"]`)).toHaveClass(/is-on/);
  await expect(page.locator("#boardGo")).toBeEnabled();
  await expect(page.locator("#forecast")).toContainText("Contracts pay");
  await page.click('[data-buy="paint"]');
  await expect(page.locator(`[data-contract="${side}"]`)).toBeEnabled();
});

test("disabled buttons are flat: no gold, no lip", async ({ page }) => {
  await openBoard(page);
  const style = await page.locator("#boardGo").evaluate((b) => { const s = getComputedStyle(b); return { bg: s.backgroundColor, shadow: s.boxShadow }; });
  expect(style.bg).not.toMatch(/242, 194, 48/); // the gold accent
  expect(style.shadow).not.toMatch(/0px 4px 0px/); // the lip
});

test("loans: 10% each, three at most, then he won't lend", async ({ page }) => {
  await openBoard(page);
  await expect(page.locator("#investorLine")).toContainText("no interest");
  await page.click('[data-loan="0"]');
  await expect(page.locator("#bizMoney")).toHaveText("$200");
  await expect(page.locator("#investorLine")).toContainText("You owe me $100, and I take 10% of every contract you finish until you're paid up.");
  await page.click('[data-loan="1"]');
  await expect(page.locator("#investorLine")).toContainText("20%");
  await page.click('[data-loan="0"]');
  await expect(page.locator("#investorLine")).toContainText("until you pay up, deadbeat!");
  await expect(page.locator("[data-loan]")).toHaveCount(2);
  for (const b of await page.locator("[data-loan]").all()) await expect(b).toBeDisabled();
  const [small] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await expect(page.locator("#forecast")).toContainText("To the lender (30%)");
});

test("recruit a cheap robot and train them in the same visit", async ({ page }) => {
  await openBoard(page);
  const id = await page.locator("[data-recruit]").first().getAttribute("data-recruit");
  await page.click(`[data-recruit="${id}"]`);
  await expect(page.locator("#recruits")).toContainText("Recruited");
  await page.click(`[data-train-open="${id}"]`);
  const train = page.locator(`[data-train^="${id}:"]`).first();
  await expect(train).toBeEnabled();
  const before = await page.evaluate(() => ct.biz.money);
  await train.click();
  expect(await page.evaluate(() => ct.biz.money)).toBe(before - 20);
});

test("a quarter: schedule the crew, a faked model gives instructions, robots ship, contracts pay", async ({ page }) => {
  const errors = await openBoard(page);
  const [small] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await page.click("#boardGo");
  await expect(page.locator("#goalLabel")).toHaveText("Contracts");
  await expect(page.locator("#levelName")).toContainText("Shift 1 of 3");
  await expect(page.locator("#crew")).toContainText("Schedule");
  await page.evaluate(() => {
    const programs = {
      blip: `while (needs("red") > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`,
      pip: `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`,
    };
    ct.useFakeLlm(async ({ system }) => {
      const id = /You are Blip/.test(system) ? "blip" : "pip";
      return { reply: "On it.", instructions: id === "blip" ? "carry reds to pack" : "pack and ship", problem: "", program: programs[id] };
    });
    ct.hire("blip"); ct.hire("pip");
  });
  await page.evaluate(() => Promise.all([ct.give("blip", "Carry red widgets from the supply to Pack."), ct.give("pip", "Pack red boxes and ship them from the dock.")]));
  await expect.poll(() => page.evaluate(() => ct.game.workers.every((w) => w.ast && !w.compiling))).toBe(true);
  const budget = await page.evaluate(() => ct.biz.money);
  await page.evaluate(() => { ct.begin(); for (let i = 0; i < 240; i++) ct.step(0.5); });
  await expect(page.locator("#endScreen")).toBeVisible();
  const shipped = await page.evaluate(() => ct.quarter.done[0]);
  expect(shipped).toBeGreaterThan(5);
  // Play out the rest of the quarter the same way, then back to the board.
  while (await page.locator('[data-go="next"]').count()) {
    await page.click('[data-go="next"]');
    await page.evaluate(() => { ct.begin(); for (let i = 0; i < 240; i++) ct.step(0.5); });
    await expect(page.locator("#endScreen")).toBeVisible();
  }
  const paid = await page.evaluate(() => ct.quarter.done[0] >= ct.game.order[0].count);
  await page.click('[data-go="board"]');
  await expect(page.locator("#boardTitle")).toHaveText("Quarter 2");
  const after = await page.evaluate(() => ct.biz);
  expect(after.quarters).toBe(1);
  expect(after.wins).toBe(paid ? 1 : 0);
  expect(after.money).toBeLessThan(budget + 1000);
  expect(errors).toEqual([]);
});

test("the end-of-quarter card: a missed contract pays nothing, the shipped one pays", async ({ page }) => {
  await openBoard(page);
  await page.click('[data-buy="paint"]');
  const [small, , side] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await page.click(`[data-contract="${side}"]`);
  await page.click("#boardGo");
  for (let shift = 1; shift <= 3; shift++) {
    await endShift(page, [999, 1]);
    if (shift < 3) await page.click('[data-go="next"]');
  }
  await expect(page.locator("#endTitle")).toHaveText("Quarter over");
  await expect(page.locator(".ct-end-contract.is-done")).toHaveCount(1);
  await expect(page.locator(".ct-end-contract.is-missed")).toHaveCount(1);
  const money = await page.evaluate(() => ct.biz.money);
  await page.click('[data-go="board"]');
  const small$ = await page.evaluate(() => ct.biz);
  expect(small$.wins).toBe(1);
  expect(small$.money).toBeGreaterThan(money);
});

test("a shift card says plainly what has shipped and how many shifts are left; the quarter card adds up all shifts' pay", async ({ page }) => {
  await openBoard(page);
  const [small] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await page.click("#boardGo");
  await page.evaluate(() => { ct.hire("blip"); ct.hire("pip"); });
  await endShift(page, [6]); // 6 of 20 in the first shift
  await expect(page.locator("#endNote")).toContainText("6 of 20 shipped, 2 shifts left.");
  await expect(page.locator("#endNote")).not.toContainText("pace");
  await expect(page.locator("#endStats")).toContainText("Shipped this shift");
  await page.click('[data-go="next"]');
  await endShift(page, [12]);
  await page.click('[data-go="next"]');
  await endShift(page, [18]);
  await expect(page.locator("#endStats")).toContainText("Crew pay, all shifts");
  await expect(page.locator("#endStats")).toContainText("$45"); // 3 shifts of $15
});

test("robots put on the shift don't start on top of you or each other, next shift too", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await page.evaluate(() => { ct.hire("blip"); ct.hire("pip"); ct.hire("dot"); });
  const gaps = () => page.evaluate(() => {
    const all = [ct.game.player, ...ct.game.workers];
    return Math.min(...all.flatMap((p, i) => all.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
  });
  expect(await gaps()).toBeGreaterThanOrEqual(8.4);
  await endShift(page, [1]);
  await page.click('[data-go="next"]');
  expect(await page.evaluate(() => ct.game.workers.length)).toBe(3);
  expect(await gaps()).toBeGreaterThanOrEqual(8.4);
});

test("Start waits until everyone scheduled is ready, and says who isn't", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  const go = page.locator("#goBtn");
  await expect(go).toBeDisabled(); // nobody scheduled
  await page.evaluate(() => {
    ct.useFakeLlm(async () => ({ reply: "On it.", instructions: "ship", problem: "",
      program: `while (needsAny() > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }` }));
    ct.hire("blip"); ct.hire("pip");
  });
  await expect(go).toBeDisabled();
  await expect(go).toHaveAttribute("data-tooltip", /Blip needs instructions, Pip needs instructions/);
  await page.evaluate(() => ct.give("blip", "Carry red widgets from the supply to Pack."));
  await expect(go).toHaveAttribute("data-tooltip", /^Not everyone is ready: Pip needs instructions\.$/);
  await page.evaluate(() => ct.give("pip", "Carry red widgets from the supply to Pack."));
  await expect(go).toBeEnabled();
  await expect(go).toHaveAttribute("data-tooltip", "");
  // Thinking over a message before the shift holds Start too.
  await page.evaluate(() => ct.thinking("pip", 1));
  await expect(go).toBeDisabled();
  await expect(go).toHaveAttribute("data-tooltip", "Waiting for Pip to finish thinking.");
  await page.evaluate(() => ct.thinking("pip", -1));
  await expect(go).toBeEnabled();
  await go.click();
  await expect(page.locator("#levelName")).toContainText("Shift 1 of 3");
});

test("a quarter that ships everything early says so, and the header budget matches the card", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await endShift(page); // everything ships in shift 1
  await expect(page.locator("#endTitle")).toHaveText("Quarter over early");
  await expect(page.locator("#endNote")).toContainText("Everything shipped in shift 1 of 3, so the quarter ends early and shifts 2 and 3 are skipped.");
  const budget = await page.locator(".ct-recap b.is-total").textContent();
  await expect(page.locator("#labor")).toHaveText(budget);
  await page.click('[data-go="board"]');
  await expect(page.locator("#bizMoney")).toHaveText(budget);
});

test("a robot with a trait but no skills shows the trait, not 'No skills'", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => { ct.biz.trained.blip = ["fast"]; ct.openBoard(); });
  const blip = page.locator("#bizCrew .ct-robot", { hasText: "Blip" });
  await expect(blip).toContainText("Fast");
  await expect(blip).not.toContainText("No skills");
});

test("every reply to you ends in one marker saying what it did to the robot's instructions", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  const loop = 'while (needsAny() > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }';
  await page.evaluate((loop) => {
    window.__kind = "talk";
    ct.useFakeLlm(async () => ({ reply: "Sure thing.", kind: window.__kind, summary: window.__kind === "once" ? "drop one red at Pack" : "",
      now: window.__kind === "once" ? 'move("SUPPLY"); pickUp("red"); move("PACK"); putDown();' : "",
      instructions: "Carry red widgets from the supply to Pack.", program: loop, problem: "", onPurpose: false }));
    ct.hire("blip");
  }, loop);
  await page.evaluate(() => ct.give("blip", "Carry red widgets from the supply to Pack."));
  const log = page.locator("#chat .ct-log");
  await expect(log.locator(".ct-effect").last()).toHaveText("New instructions");
  for (const [kind, text] of [["talk", "No change to instructions"], ["once", "One-off: drop one red at Pack"], ["change", "Changed instructions"]]) {
    await page.evaluate(async (k) => { window.__kind = k; await ct.say("blip", "Carry red widgets from the supply to Pack, please."); }, kind);
    await expect(log.locator(".ct-msg.is-them").last().locator(".ct-effect")).toHaveText(text);
  }
  // Every reply has exactly one marker.
  expect(await log.locator(".ct-msg.is-them").evaluateAll((els) => els.map((e) => e.querySelectorAll(".ct-effect").length))).toEqual([1, 1, 1, 1]);
});

test("reading and thinking look the same everywhere: the word, no dots, no speech bubble", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await page.evaluate(() => { ct.hire("blip"); ct.openChat?.("blip"); ct.thinking("blip", 1); ct.step(0); });
  await expect(page.locator(".ct-dots")).toHaveCount(0);
  await expect(page.locator(".ct-bubble")).toHaveCount(0);
  await expect(page.locator(".ct-bot-busy")).toHaveText("thinking");
  // Under the robot's name, clear of the speech bubble and the stations above.
  const [tag, name] = await page.evaluate(() => [".ct-bot-busy", ".ct-bot-name"].map((s) => document.querySelector(s).getBoundingClientRect().top));
  expect(tag).toBeGreaterThan(name);
  await expect(page.locator("#crewReady .ct-busy")).toHaveText("thinking");
  await expect(page.locator(".ct-chip .ct-busy").first()).toHaveText("Thinking");
  await expect(page.locator("#chat .is-busyline")).toHaveText("Blip is thinking");
  await page.evaluate(() => { ct.thinking("blip", -1); ct.step(0); });
  await expect(page.locator(".ct-busy")).toHaveCount(0);
});

test("Training: one row per robot with one Train picker that lists what's left and what it adds", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => { ct.biz.trained.pip = ["painting"]; ct.openBoard(); }); // Pip: packing + painting
  const pip = page.locator("#bizCrew .ct-robot", { hasText: "Pip" });
  await expect(pip.locator("[data-train]")).toHaveCount(0); // closed until you open it
  await pip.locator("[data-train-open]").click();
  const menu = pip.locator(".ct-train-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-train="pip:repair"]')).toContainText("+$25 a shift"); // a third skill jumps a tier
  await expect(menu.locator('[data-train="pip:fast"]')).toContainText("+$5 a shift");
  await expect(menu.locator('[data-train="pip:packing"]')).toHaveCount(0); // already has it
  // Nothing cuts the menu off: every item is the topmost thing at its own center, on screen.
  const hidden = await menu.locator(".ct-train-item").evaluateAll((els) => els.filter((e) => {
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return y > innerHeight || !e.contains(document.elementFromPoint(x, y));
  }).length);
  expect(hidden).toBe(0);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await pip.locator("[data-train-open]").click();
  const before = await page.evaluate(() => ct.biz.money);
  await page.click('[data-train="pip:fast"]');
  expect(await page.evaluate(() => ct.biz.money)).toBe(before - 20);
  await expect(pip).toContainText("Fast");
  await expect(page.locator(".ct-train-menu")).toHaveCount(0);
});

test("a Train item you can't afford keeps its wage cost and says how much you're short", async ({ page }) => {
  await openBoard(page);
  await page.locator('#bizCrew [data-train-open="pip"]').click(); // open while you can afford it
  await page.evaluate(() => { ct.biz.money = 12; ct.renderBoard(); });
  const fast = page.locator('[data-train="pip:fast"]');
  await expect(fast).toBeDisabled();
  await expect(fast).toContainText("+$5 a shift · $8 short");
});

test("when nothing in a robot's Train list is affordable, the Train button is greyed out with the short note", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => { ct.biz.money = 12; ct.openBoard(); });
  const open = page.locator('#bizCrew [data-train-open="pip"]');
  await expect(open).toBeDisabled();
  await expect(open.locator("xpath=..").locator(".ct-short")).toHaveText("$8 short");
});

test("crew cost: the whole crew's shift on the board, this shift's cost by Start (decision 71)", async ({ page }) => {
  await openBoard(page);
  await expect(page.locator("#bizCrewCost")).toHaveText(/^Whole crew \$\d+ a shift$/);
  await page.locator("[data-contract]").first().click();
  await expect(page.locator("#forecast")).not.toContainText("You get");
  await expect(page.locator("#forecast")).not.toContainText("not counted");
  await page.click("#boardGo");
  await expect(page.locator("#shiftCost")).toBeHidden(); // nobody on the shift yet
  await page.evaluate(() => ct.hire("blip"));
  await expect(page.locator("#shiftCost")).toHaveText("This shift $5 · budget after $95 · covers the rest of the quarter");
  await page.evaluate(() => { ct.quarter.money = 20; ct.hire("pip"); });
  await expect(page.locator("#shiftCost")).toHaveText("This shift $15 · budget after $5 · short for shift 2");
  // On the same row as the names by Start, and "budget after" isn't gold when it's short.
  const [cost, names] = await page.evaluate(() => ["#shiftCost", "#crewReady"].map((q) => document.querySelector(q).getBoundingClientRect()));
  expect(cost.top).toBeLessThan(names.bottom);
  expect(cost.left).toBeGreaterThanOrEqual(names.left);
  expect(await page.locator("#shiftCost b").nth(1).evaluate((b) => getComputedStyle(b).color)).not.toMatch(/242, 194, 48/);
  // The extra line by Start doesn't push the page past the window.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  expect(await page.locator("#shiftCost").evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
});

test("before a shift the coach doesn't repeat who needs instructions; the chip and status bar say it", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await page.evaluate(() => ct.hire("pip"));
  await expect(page.locator("#crewReady")).toContainText("needs instructions");
  await expect(page.locator("#coach")).not.toContainText("needs instructions");
});

test("everything on the board you can't afford says how much you're short, the same way (Recruit, Buy, Training)", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => { ct.biz.money = 12; ct.openBoard(); });
  const checks = await page.evaluate(() => [...document.querySelectorAll("[data-recruit], [data-buy]")].map((b) => {
    const price = +b.textContent.match(/\$(\d+)/)[1];
    return { price, disabled: b.disabled, note: b.parentElement.querySelector(".ct-short")?.textContent ?? null };
  }));
  expect(checks.length).toBeGreaterThan(0);
  for (const c of checks) {
    if (c.price > 12) expect(c).toEqual({ price: c.price, disabled: true, note: `$${c.price - 12} short` });
    else expect(c).toEqual({ price: c.price, disabled: false, note: null });
  }
  await expect(page.locator('#bizCrew [data-train-open="pip"]')).toBeDisabled();
  await expect(page.locator(".ct-train-pick .ct-short").first()).toHaveText("$8 short");
  // One look for the note everywhere: same color and opacity as under Recruit and Buy.
  const look = (sel) => page.locator(sel).first().evaluate((e) => { const st = getComputedStyle(e); let o = 1; for (let n = e; n; n = n.parentElement) o *= +getComputedStyle(n).opacity; return [st.color, st.fontFamily, o]; });
  const recruitLook = await look("[data-recruit] ~ .ct-short, [data-buy] ~ .ct-short");
  expect(await look(".ct-train-pick .ct-short")).toEqual(recruitLook);
  await page.evaluate(() => { ct.biz.money = 25; ct.openBoard(); });
  await page.locator('#bizCrew [data-train-open="pip"]').click();
  await page.evaluate(() => { ct.biz.money = 12; ct.renderBoard(); });
  expect(await look(".ct-train-item .ct-short")).toEqual(recruitLook);
});

/** The recap's lines as [label, value] pairs. */
const recap = (page) => page.locator(".ct-recap").evaluate((r) => {
  const cells = [...r.children].filter((c) => !c.classList.contains("ct-recap-net")).map((c) => c.textContent.trim());
  const out = [];
  for (let i = 0; i < cells.length; i += 2) out.push([cells[i], cells[i + 1]]);
  return { lines: out, net: r.querySelector(".ct-recap-net").textContent.trim() };
});

test("the quarter card is a recap: started with, paid, lender, crew, budget now, and the quarter's result (decision 72)", async ({ page }) => {
  await openBoard(page);
  await expect(page.locator("#boardLast")).toBeHidden(); // nothing to recap in quarter 1
  await page.click('[data-loan="0"]'); // $200, one loan: the lender takes 10%
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await page.evaluate(() => { ct.hire("blip"); ct.hire("pip"); });
  await endShift(page); // everything ships in shift 1: crew $15, contract $150, lender $15
  await expect(page.locator("#endScreen .ct-mascot")).toBeHidden();
  expect(await recap(page)).toEqual({
    lines: [["Started with", "$200"], ["Contracts paid", "+$150"], ["Lender's cut", "−$15"], ["Crew pay, all shifts", "−$15"], ["Budget now", "$320"]],
    net: "This quarter +$120",
  });
  await expect(page.locator(".ct-recap-face")).toHaveCount(1);
  await expect(page.locator('[data-go="restart"]')).toHaveCount(0);
  await expect(page.locator('[data-go="board"]')).toHaveText("To the board");
  // It fits the window.
  expect(await page.evaluate(() => { const c = document.querySelector("#endScreen .ct-card-big").getBoundingClientRect(); return c.top >= 0 && c.bottom <= innerHeight; })).toBe(true);
  await page.click('[data-go="board"]');
  await expect(page.locator("#boardLast")).toHaveText("Last quarter: 1 of 1 contract shipped, +$120");
});

test("a losing quarter: no $0 lines, no lender line without a loan, the result in red", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await page.evaluate(() => { ct.hire("blip"); ct.hire("pip"); });
  for (let shift = 1; shift <= 3; shift++) {
    await endShift(page, [shift * 2]);
    if (shift < 3) await page.click('[data-go="next"]');
  }
  await expect(page.locator("#endTitle")).toHaveText("Quarter over");
  expect(await recap(page)).toEqual({
    lines: [["Started with", "$100"], ["Crew pay, all shifts", "−$45"], ["Budget now", "$55"]],
    net: "This quarter −$45",
  });
  await expect(page.locator(".ct-recap-net")).toHaveClass(/is-out/);
  await page.click('[data-go="board"]');
  await expect(page.locator("#boardLast")).toHaveText("Last quarter: 0 of 1 contract shipped, −$45");
  await expect(page.locator("#boardLast b")).toHaveClass(/is-out/);
});
