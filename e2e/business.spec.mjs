// Level 7, "Your business", in a real browser: the board between quarters (contracts, the lender,
// recruit, training, machines), the floor, and the end-of-quarter card. The model is faked.
import { test, expect } from "@playwright/test";

/** Open the page, watch the console, and open level 7's board. */
async function openBoard(page) {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.evaluate(() => ct.license("Clank & Sons", "Mike")); // skip the license (its own test below)
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
  await expect(page.locator("#endNote")).toHaveText("1 of 2 contracts shipped in full and paid. The other pays nothing.");
  // Money with a sign uses a real minus sign, never a hyphen.
  expect(await page.locator("#endScreen").textContent()).not.toMatch(/-\$/);
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
  await expect(page.locator("#endNote")).toContainText("2 shifts left. Your crew");
  await expect(page.locator("#endNote")).not.toContainText("6 of 20"); // the contract row says it
  await expect(page.locator(".ct-end-contract")).toContainText("6 of 20 shipped");
  await expect(page.locator("#endScreen .ct-mascot")).toBeHidden();
  await expect(page.locator("#endNote")).not.toContainText("pace");
  await expect(page.locator("#endStats")).toContainText("Shipped this shift");
  await expect(page.locator("#endStats")).toContainText("Funds");
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
  await expect(page.locator("#shiftCost")).toHaveText("This shift $5 · funds after $95 · covers the rest of the quarter");
  await page.evaluate(() => { ct.quarter.money = 20; ct.hire("pip"); });
  await expect(page.locator("#shiftCost")).toHaveText("This shift $15 · funds after $5 · short for shift 2");
  // On the same row as the names by Start, and "funds after" isn't gold when it's short.
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
  const cells = [...r.children].filter((c) => c.tagName === "SPAN" || c.tagName === "B").map((c) => c.textContent.trim());
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
    lines: [["Started with", "$200"], ["Contracts paid", "+$150"], ["Lender's cut", "−$15"], ["Crew pay, all shifts", "−$15"], ["Funds now", "$320"]],
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
    lines: [["Started with", "$100"], ["Crew pay, all shifts", "−$45"], ["Funds now", "$55"]],
    net: "This quarter −$45",
  });
  await expect(page.locator(".ct-recap-net")).toHaveClass(/is-out/);
  await page.click('[data-go="board"]');
  await expect(page.locator("#boardLast")).toHaveText("Last quarter: 0 of 1 contract shipped, −$45");
  await expect(page.locator("#boardLast b")).toHaveClass(/is-out/);
});

test("a new business starts on its license: name it, sign it, and the lender stamps it when you open (decision 74)", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.click('[data-level="7"]');
  await expect(page.locator("#licenseScreen")).toBeVisible();
  await expect(page.locator("#boardScreen")).toBeHidden();
  await expect(page.locator("#licenseScreen")).not.toContainText(/quarter/i); // makes no sense on a license (Mike)
  const first = await page.locator("#licenseName").inputValue();
  expect(first.length).toBeGreaterThan(0); // a name to start from
  await expect(page.locator("#licenseGo")).toBeDisabled();
  await expect(page.locator("#licenseWhy")).toHaveText("Sign your name as the owner first.");
  await page.click("#licenseDice");
  expect(await page.locator("#licenseName").inputValue()).not.toBe(first);
  await page.fill("#licenseName", "Rivet Brothers");
  await page.fill("#licenseOwner", "Mike");
  await expect(page.locator("#licenseGo")).toBeEnabled();
  await expect(page.locator("#licenseStamp")).toHaveCSS("opacity", "0"); // no stamp until you open
  await page.click("#licenseGo");
  await expect(page.locator("#licenseStamp")).toHaveClass(/is-stamped/);
  await expect(page.locator("#boardScreen")).toBeVisible();
  await expect(page.locator("#boardBiz")).toHaveText("Rivet Brothers");
  expect(await page.evaluate(() => [ct.biz.name, ct.biz.owner])).toEqual(["Rivet Brothers", "Mike"]);
  expect(errors).toEqual([]);
});

test("robots are told your name and never to call you boss; their own lines use it too (decision 74)", async ({ page }) => {
  await openBoard(page); // owner "Mike", business "Clank & Sons"
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  const systems = await page.evaluate(async () => {
    const seen = [];
    ct.useFakeLlm(async ({ system }) => { seen.push(system); return { reply: "On it, Mike.", instructions: "carry reds", problem: "", program: 'while (needsAny() > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }' }; });
    ct.hire("blip");
    await ct.give("blip", "Carry red widgets from the supply to Pack.");
    return seen;
  });
  expect(systems.length).toBeGreaterThan(0);
  for (const s of systems) {
    expect(s).toContain("The boss is Mike, who owns Clank & Sons");
    expect(s).toContain('Never call them "boss" out loud');
  }
});

test("out of business: the front page lands on the floor, with the run's numbers beside it (decision 74)", async ({ page }) => {
  await openBoard(page);
  // Reputation gone: no client signs (decision 78).
  await page.evaluate(() => { const b = ct.biz; b.rep = 0; b.loans = [100, 100, 250]; b.money = 2; b.quarters = 4; b.wins = 3; b.taken = 5; b.best = 120; ct.openBoard(); });
  await expect(page.locator("#gameoverScreen")).toBeVisible();
  await expect(page.locator("#boardScreen")).toBeHidden();
  const hl = await page.locator("#paperHeadline").textContent();
  // Three loans out: the lender's headline fits too.
  expect(['Clank & Sons Ships Its Last Box (It Was Empty)', 'Robots of Clank & Sons Finally Given Clear Instructions: “Leave”', 'Lender Collects His 10% of Clank & Sons: $0',
    'Clank & Sons Paint Machine Outlasts Clank & Sons']).toContain(hl);
  // Said in terms of reputation, not money (decision 76).
  await expect(page.locator("#gameoverWhy")).toHaveText("The name Clank & Sons is mud. No client in the Widget District will sign another contract with it.");
  await expect(page.locator("#gameoverStats")).toContainText("Contracts shipped3 of 5");
  await expect(page.locator("#gameoverStats")).toContainText("Owed the lender$450");
  for (const row of ["Total revenue", "Total costs", "Funds left"]) await expect(page.locator("#gameoverStats")).toContainText(row);
  // The paper and the panel fit the window, once they've landed.
  await page.evaluate(() => Promise.all([document.fonts.ready, ...document.getAnimations().map((a) => a.finished)]));
  const fits = await page.evaluate(() => ["#gameoverPaper", ".ct-gameover-panel"].every((q) => { const r = document.querySelector(q).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }));
  expect(fits).toBe(true);
  // A new run starts on a fresh license.
  await page.click("#gameoverNew");
  await expect(page.locator("#licenseScreen")).toBeVisible();
  expect(await page.evaluate(() => [ct.biz.quarters, ct.biz.owner])).toEqual([0, ""]);
});

test("Pam's review of the license: long names fit, the lender waits for the stamp, the floor behind is quiet (decision 74)", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-level="7"]');
  await expect(page.locator("#licenseLender")).toHaveText('"Sign at the bottom."');
  for (const sel of ["#pauseBtn", "#clock", "#coach"]) await expect(page.locator(sel)).toBeHidden();
  await page.fill("#licenseName", "W".repeat(28));
  await page.fill("#licenseOwner", "W".repeat(20));
  await page.evaluate(() => document.fonts.ready);
  for (const sel of ["#licenseName", "#licenseOwner"]) {
    const fits = await page.locator(sel).evaluate((el) => {
      const c = document.createElement("canvas").getContext("2d"), cs = getComputedStyle(el);
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return c.measureText(el.value.toUpperCase()).width <= el.clientWidth;
    });
    expect(fits, sel).toBe(true);
  }
  await page.click("#licenseGo");
  await expect(page.locator("#licenseLender")).toHaveText(`"Lovely name. I'll remember it."`);
  await expect(page.locator("#boardScreen")).toBeVisible();
  await expect(page.locator("#pauseBtn")).toBeVisible(); // the HUD comes back
});

test("Pam's review of the front page: a long name fits the paper, curly quotes, a zero case, a quiet floor (decision 74)", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await page.evaluate(() => { ct.hire("blip"); });
  // Broke before anything shipped, with the longest name the license allows.
  await page.evaluate(() => { const b = ct.biz; b.name = "Cogsworth Shipping & Sprocket"; b.rep = 0; b.loans = [100, 100, 250]; b.money = 0; b.quarters = 0; b.wins = 0; b.taken = 0; b.best = null; ct.openBoard(); });
  await expect(page.locator("#paperColumn")).toHaveText("Cogsworth Shipping & Sprocket never shipped a contract. Robots on the floor declined to comment, as commenting was not part of their instructions.");
  await expect(page.locator("#paperHeadline")).not.toContainText('"');
  const fits = await page.evaluate(() => { const h = document.querySelector("#paperHeadline"), p = document.querySelector("#gameoverPaper"); return h.scrollWidth <= h.clientWidth + 1 && p.scrollHeight <= p.clientHeight + 1; });
  expect(fits).toBe(true);
  for (const sel of ["#pauseBtn", "#clock", "#coach", "#crewReady"]) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator("#gameoverStats")).not.toContainText("Best quarter"); // no quarter finished
  await expect(page.locator("#gameoverStats")).toContainText("Contracts shippedNone");
});

test("reputation on the board: pips under Funds, struck full numbers with the hover lines, the gain on each card (decisions 78, 79)", async ({ page }) => {
  await openBoard(page);
  await expect(page.locator("#bizRep .ct-rep-text")).toHaveText("3 of 3 · offers at 100%");
  // Green at full reputation (Mike), gold once it drops.
  await expect(page.locator("#bizRep")).toHaveClass(/is-full/);
  expect(await page.locator("#bizRep .ct-pie circle.full").first().evaluate((c) => getComputedStyle(c).fill)).toBe("rgb(95, 208, 138)");
  await expect(page.locator(".ct-struck")).toHaveCount(0); // nothing is lowered at full reputation
  await expect(page.locator("#missLine")).toHaveText("Miss any contract: −1 reputation");
  const gains = await page.locator("[data-contract] .ct-rep-gain").allTextContents();
  expect(gains).toEqual(["Ship it: +⅓ reputation", "Ship it: +⅔ reputation", "Ship it: +⅓ reputation"]);
  await page.evaluate(() => { ct.biz.rep = 7; ct.openBoard(); });
  await expect(page.locator("#bizRep .ct-rep-text")).toHaveText("2⅓ of 3 · offers at 80%");
  await expect(page.locator("#bizRep")).not.toHaveClass(/is-full/);
  const large = page.locator("[data-contract]").nth(1);
  const tips = await large.locator(".ct-struck").evaluateAll((els) => els.map((e) => [e.textContent, e.dataset.tooltip]));
  expect(tips).toEqual([
    ["40", "Clients ask for 80% of the boxes while Clank & Sons' reputation is questionable. Restore reputation for the full 40."],
    ["$320", "Clients pay 80% while Clank & Sons' reputation is questionable. Restore reputation for the full $320."],
  ]);
  await expect(large.locator(".ct-size-count")).toContainText("32 boxes");
  await expect(page.locator("#bizRep")).not.toHaveClass(/is-danger/);
  // At one pip: red, and a warning by name.
  await page.evaluate(() => { ct.biz.rep = 4; ct.openBoard(); });
  await expect(page.locator("#bizRep")).not.toHaveClass(/is-danger/); // 1⅓: a miss leaves ⅓, still in business
  await page.evaluate(() => { ct.biz.rep = 3; ct.openBoard(); });
  await expect(page.locator("#bizRep")).toHaveClass(/is-danger/);
  await expect(page.locator("#bizRep")).toContainText("One more missed contract and the name Clank & Sons is mud.");
  await expect(page.locator("#bizRep .ct-rep-text")).toHaveText("1 of 3 · offers at 60%");
  // Under one pip: still offered contracts, worse ones (decision 84).
  await page.evaluate(() => { ct.biz.rep = 1; ct.openBoard(); });
  await expect(page.locator("#boardScreen")).toBeVisible();
  await expect(page.locator("#bizRep .ct-rep-text")).toHaveText("⅓ of 3 · offers at 40%");
  await expect(page.locator("#bizRep")).toHaveClass(/is-danger/);
});

test("the recap stamps each contract and moves reputation; at zero the front page says why (decisions 78, 80)", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => { ct.biz.rep = 4; ct.openBoard(); });
  await page.click('[data-buy="paint"]');
  const ids = await page.locator("[data-contract]").evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${ids[1]}"]`); await page.click(`[data-contract="${ids[2]}"]`);
  await page.click("#boardGo");
  for (let s = 1; s <= 3; s++) { await endShift(page, [999, 0]); if (s < 3) await page.click('[data-go="next"]'); }
  await expect(page.locator(".ct-stamp")).toHaveText(["Shipped +⅔", "Missed −1"]);
  // They land like the license's stamp, one after another (Mike).
  const anim = await page.locator(".ct-stamp").evaluateAll((els) => els.map((e) => { const cs = getComputedStyle(e); return [cs.animationName, cs.animationDelay]; }));
  expect(anim).toEqual([["stampIn", "0.45s"], ["stampIn", "0.9s"]]);
  await expect(page.locator(".ct-recap-rep .ct-pie")).toHaveCount(6); // before → after
  await expect(page.locator(".ct-recap-next")).toHaveText("Next quarter: offers at 60% of size and pay"); // 4 + 2 − 3 = 3: one pip
  await page.click('[data-go="board"]');
  expect(await page.evaluate(() => ct.biz.rep)).toBe(3);
  // One more miss: reputation gone, and the front page says so.
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  for (let s = 1; s <= 3; s++) { await endShift(page, [0]); if (s < 3) await page.click('[data-go="next"]'); }
  await expect(page.locator(".ct-recap-next")).toHaveText("No client will sign with Clank & Sons again.");
  await page.click('[data-go="board"]');
  await expect(page.locator("#gameoverScreen")).toBeVisible();
  await expect(page.locator("#gameoverWhy")).toContainText("is mud");
});

test("too broke for any robot: Start lets you work the shift alone (being broke turns into misses)", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await expect(page.locator("#goBtn")).toBeDisabled(); // you can afford a crew: schedule one
  await page.evaluate(() => { ct.quarter.money = 2; ct.step(0); });
  await expect(page.locator("#goBtn")).toBeEnabled();
  await expect(page.locator("#crewReady")).toHaveText("You can't pay anyone this shift: Blip costs $5 and you have $2. Start works it yourself.");
  // Funds are prominent on the floor in a quarter (Mike): the big display face, not the small mono line.
  expect(parseFloat(await page.locator("#labor").evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(22);
  // Each robot you can't afford says how much you're short, like Recruit, Train and Buy.
  const blip = page.locator('[data-hire="blip"]');
  await expect(blip).toBeDisabled();
  await expect(blip.locator("xpath=..").locator(".ct-short")).toHaveText("$3 short");
});

test("struck box counts are as big as the counts beside them (Pam)", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => { ct.biz.rep = 7; ct.openBoard(); });
  const [now, struck] = await page.locator("[data-contract] .ct-size-count").first().evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el.querySelector(".ct-struck")).fontSize]);
  expect(struck).toBe(now);
});

test("money is green, costs and losses red, everywhere (Mike, decision 82)", async ({ page }) => {
  const GREEN = "rgb(95, 208, 138)", RED = "rgb(255, 138, 128)";
  const color = (sel) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).color);
  await openBoard(page);
  expect(await color("#bizMoney")).toBe(GREEN); // Funds on the board
  expect(await color("#bizCrewCost .ct-loss")).toBe(RED); // what the crew costs
  expect(await color("[data-contract] .ct-offer-pay")).toBe(GREEN); // contract pay
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  expect(await color("#labor")).toBe(GREEN); // Funds on the floor
  await page.evaluate(() => ct.hire("blip"));
  expect(await color("#shiftCost b")).toBe(RED); // this shift's crew pay
  expect(await color("#shiftCost b:nth-of-type(2)")).toBe(GREEN); // funds after
  await endShift(page, [3]);
  expect(await color(".ct-stat-value.ct-loss")).toBe(RED); // crew pay this shift
  expect(await color(".ct-stat-value.ct-gain")).toBe(GREEN); // funds
  await page.evaluate(() => { ct.biz.rep = 0; ct.openBoard(); });
  expect(await page.locator("#gameoverStats b").evaluateAll((els) => els.map((e) => [e.previousElementSibling.textContent, getComputedStyle(e).color])))
    .toEqual(expect.arrayContaining([["Total revenue", GREEN], ["Total costs", RED], ["Funds left", GREEN]]));
});
