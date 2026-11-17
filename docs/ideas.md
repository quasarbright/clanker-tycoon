# Ideas

Every idea for the game, one short entry each, in four piles. Keep this current whenever the
direction changes: move entries between piles, and give every dropped idea a one-line reason. The
shape of the long-term game is in [progression-design.md](progression-design.md); reasons and
evidence are in [decisions.md](decisions.md). GitHub issues are only for concrete work that's ready
to build, and bugs. (Older idea issues 1 to 13 aren't kept up to date; this file is.)

---

## Now

What's being built.

- **Making your words matter.** A shift's result should trace back to what you told the crew: only
  you change instructions, thinking can't widen them (decision 36), dry run before the shift (decision 37).
- **The quarter sandbox.** A quota, a few shifts and a budget on one floor, to prove the
  money-against-crew tension (decision 35). Built as level 6.

- **A pause button.** Shifts feel too short to fix mistakes, partly because typing a message takes
  a person a while. A plain pause you can use as often as you like. Built; Mike: "works well". Not doing:
  speed-up controls (thinking can't speed up, so the same shift would play out differently), a
  limited number of pauses (one more thing to keep in mind), slower shifts (boring).

## Next

Agreed direction, not built yet. Roughly in roadmap order.

- **Teach the pause.** Players need to learn they can pause and fix things. For example, a
  tutorial moment where something goes wrong and the coach says to pause and sort it out.
- **Crew variety through mechanics.** Robots differ by skills and attributes, not personality.
- **Contracts.** A board of offers: what, how many, deadline in shifts, pay, machines needed. You
  pick which to take; some can't be done in time with what you have. You choose your difficulty.
  Several at once later. Open: late pay, how often the board refreshes.
- **Money comes in.** Contracts pay. Wages, hiring, equipment, training and the investor's cut go
  out. You can't start a shift you can't pay for.
- **The investor.** The dollar-eyed robot fronted your starting money and wants a cut every quarter
  that keeps growing. "Numbers must go up." Open: what happens when you can't pay.
- **Buying equipment.** Machines are things you buy, one at a time, each tried by hand first.
- **Equipment attributes.** Wear (a pricier machine that wears half as fast saves repair labor),
  speed, capacity. A trade-off between up-front cost and labor every shift.
- **Buying a whole line.** It drops into the next empty bay of a fixed plant layout, already wired:
  supply bins, the belt from the line before it, its output belt. No placing or wiring.
- **Lines feed lines.** Stages of one product: Line A paints and boxes, Line B builds mixed crates,
  Line C ships. A mistake upstream starves the line downstream.
- **Routing by talking.** Anything flexible about routing (shared supplies, overflow, which source a
  line pulls from) is told to a foreman in words, never drawn.
- **Foremen.** A robot you promote to run a line writes its crew's instructions from your briefing.
  You debug by opening a robot, reading what its foreman told it, and correcting the foreman. Scale
  forces it (you can only talk to one robot at a time), not a rule.
- **Foremen's standing instructions.** How a foreman manages ("tell me early when a deadline's at
  risk"). Your corrections can become new lines, so a mistake doesn't come back.
- **Training.** Pay to teach a robot a skill; experience makes it cheaper (issue #4).
- **Experience.** Shifts worked, shown on the card (issue #4).

## Maybe

Ideas worth keeping that aren't planned yet.

- **The ending: buy out the investor.** Your savings buy him out; final scene, you're the
  dollar-eyed robot saying "Numbers must go up." Mike loves it. Issue #14.
- **Post-game.** Keep running the company as owner: endless contracts, or become an investor
  yourself and fund a robot-run factory, wanting your cut (symmetry all the way up).
- **Symmetry.** Where it isn't silly, what you do to robots under you was done to you first.
- **Moving robots between lines.** Transfers between your own lines once you have several.
- **Supplies.** Supply bins and input belts as things a line runs out of; how they refill.
- **Titles as flavor.** "Line lead", "Plant manager" handed out at milestones, changing nothing.
- **Disruptions.** Supply delays, rush contracts, a robot out sick. Later and not core; they land
  where you can plan around them, never mid-decision.
- **Hiring by interview.** Talk to candidates; what they say hints at what they're like (issue #7).
- **Morale and quitting.** Underpaid or passed over robots complain, then give notice (issue #5).
- **Long-term memory.** Robots remember past shifts and how you treated them (issue #2).
- **Temperaments.** Independence and confidence decide whether a robot asks before changing its own
  instructions (issue #1).
- **The Strong attribute.** Carries two at once. Agreed, not built.
- **Worker personalities.** Late polish only; mechanics first.
- **Make Smart matter.** Robots rarely think, so the Smart attribute (a bigger thinking budget)
  barely changes anything yet. Maybe it matters late, for foremen; maybe early contracts need more
  surprises to think about.
- **Recovering from problems.** Time controls, clear alerts, buffers, one-click cleanup (issue #10).
- **Challenge mode.** Write the robots' programs yourself, no model during the shift (issue #11).
- **The business side.** Competitors, stock (issue #8). Probably post-game at most.
- **A cheaper simulation for far-away lines,** if a big floor gets slow.

## Dropped

Each with the reason.

- **Deliberately dumb workers** (mishearing, fumbling, seeing only their station): frustrating, not
  funny; workers follow clear instructions (decision 3).
- **Random jams:** randomness after you've decided can only be reacted to; replaced by predictable
  wear (decision 18).
- **Stars:** replaced by shift clocks, then quotas, then contracts (decision 25).
- **A corporate ladder of ranks** (Floor hand, Line lead, Supervisor, Plant manager, Director):
  higher ranks turned into a different, managerial game (decisions 42, 44).
- **The Shift supervisor rank:** "feels like it shouldn't exist" (decision 40).
- **Grades and promotion credits:** the money already said how well you did (decision 39).
- **Buying your promotion:** no ranks anymore (decision 44).
- **A "capital" fund, and spending savings on your own little house:** replaced by buying
  promotions, then by buying equipment (decisions 38, 39).
- **A boss who sets your quota and budget:** replaced by contracts you choose and an investor (decision 49).
- **Budget only goes down, no revenue:** right for a line lead under a boss, wrong for an owner
  (decision 49).
- **A plant dashboard of lines and bars:** a spreadsheet simulator (decision 42).
- **Shared resources between lines with conflicts at your desk:** managerial, and repairs belong to
  the line (decision 41).
- **Repairs as a plant-level concern:** "a line manager should manage repairs" (decision 41).
- **Meeting foremen between shifts only:** too far from the floor (decision 42).
- **Factory building and wiring:** Mike doesn't want a factory-builder; pre-wired bays instead (decision 46).
- **Grinding money in the tutorial levels:** the tutorial teaches mechanics; money is long-term (decision 7).
- **JSON rules, or a Lisp, as the worker language:** JavaScript subset was more correct (decision 16).
- **Apple's on-device model or a decision model:** couldn't plan, or couldn't talk (decision 1).
- **Freezing game time while a robot thinks:** "really awkward, and really bad for the pacing";
  a plain pause instead.
- **One idea per GitHub issue:** issues went stale as the design moved; this file replaces them.
