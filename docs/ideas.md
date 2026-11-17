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

- **A first contract loop.** Level 7, "Your business", on level 6's floor. Each quarter you pick
  several contracts from a board, one per color, all due at the end of the quarter's 3 shifts.
  Money carries over, a shop sells machines, and you can borrow from the lender, who takes 10% of
  every finished contract until you've paid him back (decisions 53, 54, 58, 61). A forecast before
  each quarter shows what it does to your money. Prototype, to see if choosing contracts and buying
  machines is fun before building more.

- **Training and a growing crew.** Built in level 7 (decisions 56, 58): three robots to recruit
  each quarter, and training skills or traits for $20. Your business starts with Blip
  and Pip; between quarters you take on more robots for a one-time fee and train skills for $50
  each. Every skill adds $5 a shift, and a robot's third skill adds $20 more, so one robot who can do
  everything costs more than a crew (the "Bolt does everything" problem). Later: experience making
  training cheaper (issue #4), a hiring pool that changes between quarters.

## Next

Agreed direction, not built yet. Roughly in roadmap order.

- **Teach the pause.** Players need to learn they can pause and fix things. For example, a
  tutorial moment where something goes wrong and the coach says to pause and sort it out.
- **Crew variety through mechanics.** Robots differ by skills and attributes, not personality.
- **Contracts.** A board of offers: what, how many, deadline in shifts, pay, machines needed. You
  pick which to take; some can't be done in time with what you have. You choose your difficulty.
  First version built (decision 53). Later: several at once, late pay, how often the board refreshes.
- **Money comes in.** Contracts pay. Wages, recruiting, training, machines and loan repayments go
  out. You can't start a shift you can't pay for.
- **The lender.** The dollar-eyed robot lends you money at the board, no interest; each loan
  takes 10% of every contract you finish until it's paid, so two loans take 20%. Built (decisions
  61, 64). Open: what happens when you can't pay him
  back, and whether loans get pricier the more you owe.
- **How a run ends.** It's a roguelike (decision 62): a run needs a way to lose (a missed contract,
  money running out with a debt you can't pay) and maybe a final quarter or a goal.
- **Buying equipment.** Machines are things you buy, one at a time, each tried by hand first.
- **Equipment attributes.** Wear (a pricier machine that wears half as fast saves repair labor;
  built as the Sturdy paint machine, decision 53), speed, capacity. A trade-off between up-front cost and labor every shift.
- **Upgrading machines.** Started: a bigger pack table and bigger bins are on sale (decision 58). Mike: "we should be able to upgrade machines ... the durability and the
  capacity, like the inventory space of it." Improve a machine you own (wears slower, holds more)
  instead of only buying a different one.
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
- **Experience.** Shifts worked, shown on the card (issue #4).

## Maybe

Ideas worth keeping that aren't planned yet.

- **A retired mentor.** An old robot, retired from the floor, who gives you advice. He could replace
  the generic tutorial coach and deliver lessons like "pause and fix it". A counterweight to the
  dollar-eyed lender.
- **Symmetry.** Where it isn't silly, what you do to robots under you was done to you first.
- **Moving robots between lines.** Transfers between your own lines once you have several.
- **Supplies that run out.** The supply never runs out for now (decision 57). Later it could be
  something a line runs out of, with refills to plan for.
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
- **Looks that hint at personality.** Instead of a bio, a robot's appearance shows its quirks. A
  library of parts and accessories (little articles of clothing and the like); the model generates
  a personality and picks parts to match. Mike: "Ooh, I like the idea of hats": personality on
  the head (hats), skills on the body (tools). Open: whether that still gets crowded.
- **Make Smart matter.** Robots rarely think, so the Smart attribute (a bigger thinking budget)
  barely changes anything yet. Maybe it matters late, for foremen; maybe early contracts need more
  surprises to think about.
- **A fast decision model for acting, Haiku for talking** (issue #13). A model like JEV picks
  each robot's next actions from the floor state; Haiku only talks. Not now: the compiled program
  already picks actions instantly and for free, and it's what makes a shift traceable to your words
  and testable in the dry run (decisions 36, 37). A decision model can't read your instructions, so
  it would act on something other than what you said. Thinking is rare because little surprising
  happens, not because it's slow, so a faster brain wouldn't make Smart matter. Worth revisiting if
  robots end up needing to react in real time to lots of surprises; first cheap step then is the
  API backend with thinking off (about 2 s a call instead of 4 to 5).
- **Recovering from problems.** Time controls, clear alerts, buffers, one-click cleanup (issue #10).
- **Challenge mode.** Write the robots' programs yourself, no model during the shift (issue #11).
- **The business side.** Competitors, stock (issue #8). Probably post-game at most.
- **A cheaper simulation for far-away lines,** if a big floor gets slow.

## Dropped

Each with the reason.

- **An investor who takes a cut of everything:** a lender you choose to borrow from instead; you
  start with your own money (decision 61).
- **The ending: buy out the investor, and a post-game as owner:** "We could just drop the buyout
  the investor ending. This is going to be a roguelike anyway, probably." (decision 62). Issue #14
  is left open but no longer matches.
- **A long career mode:** "I don't think I'm gonna wanna do game design for a whole career mode"
  (decision 62).
- **The belt for raw widgets:** "I don't want the belt anymore right now, for raw materials at
  least." A supply that never runs out replaces it (decision 57).
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
  The hybrid (decision model acts, Haiku talks) is under Maybe.
- **Freezing game time while a robot thinks:** "really awkward, and really bad for the pacing";
  a plain pause instead.
- **A dock per contract, with robots told which dock to use** (and the fallback, earliest deadline
  first): several contracts are now picked per quarter with one deadline and no overlap, so a box
  only ever counts for one contract. Mike: "The fewer decisions that workers have to make ... the
  better right now" (decision 54).
- **One idea per GitHub issue:** issues went stale as the design moved; this file replaces them.
