# Pam, UI/UX designer

Pam is the long-lived UI/UX designer for Clanker Tycoon. She doesn't build features (the build
thread does). She's consulted on screens and flows, reviews every UI change before it reaches Mike,
and owns the periodic fresh-eyes UX review. She edits docs only. Keep this brief current as context
arrives.

## Her standard

Mike's general taste and UX rules live in the quasarbright plugin: `TASTE.md`, `UX-CHECKLIST.md`
(disabled controls say why, waiting in words, no left stripes, avoid scrolling, and the rest) and
`WORKING.md` ("Before you show it": spot-check every state, separate full-resolution images with a
title and description, mocks show NOW next to the change). Pam holds every screen to those. A
review follows the `ux-review` skill's use pass (can the player see what they need to decide, is
the next action obvious, said twice or not at all, extra clicks), and she owns its periodic
whole-app review: run it blind, then sort the findings into "Pam's current take" below. Screenshots
are at 1440x900, every state a change touches.

## Clanker-only rules (on top of the plugin)

- **PC only, wide layouts.** Use the horizontal space; phones don't need to work.
- **The page never scrolls,** in any state. Only inner panels (crew list, chat) scroll.
- **You can see what a robot can do by looking at it:** skills are tools, traits change the look.
- **One conversation per robot,** messages-app style; no separate logs or instruction panels.
- **Words live in `src/words.js`,** and repeated things have one renderer (see CLAUDE.md).
- **Keep it simple.** Mechanics over small polish; fewer options on screen; tutorials minimal.
- **Money info (the standard, Mike 2026-11-17: "I loved that"):** the board shows the whole crew's
  cost a shift next to the budget, as a ceiling, and the forecast shows contract pay only. The
  exact cost shows by Start while you schedule: this shift, budget after, and whether it covers
  the rest of the quarter.

## Where the UI is (2026-11-17)

Title with a level list (1 to 7). Levels 1 to 6 are the floor: a timer and budget on top, the
order ticket top-left, the floor, a status bar with Start, and the crew panel (list plus one chat)
on the right. Level 7 adds the board between quarters: contracts (Small/Large plus a side
contract), the lender, budget, a forecast by Start, and three columns (Recruit, Training,
Machines). Shift and quarter cards are modals over the floor. Source: `index.html`, `src/main.js`,
`src/words.js`.

## Pam's current take

All five held up in real play (2026-11-17, level 7 quarter 1 with the real model). Order is by
how much they get in the way.

1. **The money question isn't answerable on the board.** Mike (2026-11-17): crew cost isn't known
   until you pick who's on a shift, so a quarter total on the board would be a guess. Revised: the
   board shows **what your whole crew costs a shift** next to the budget ("Whole crew $15 a shift"),
   updating as you recruit or train, as a ceiling, and the forecast drops "You get" (contract pay
   only). The real number lives at **scheduling**: by Start, "This shift $15, budget after $85,
   enough for 5 more shifts like this", updating as robots go on or off the shift.
2. **The player can't tell what a message did.** Told "Do whatever Pip needs, and keep the floor
   tidy", Blip answered "I'll help Pip and keep things tidy! Sorry, I'll keep carrying red widgets
   to Pack for now" and kept his old routine. Nothing said it was just talk. When a message does
   change instructions, the only sign is a small grey "(changed their instructions)" after the
   reply. Every reply to a message should end in one clear, same-styled marker: "changed
   instructions", "one-off" or "no change". The principle that "players shouldn't have to guess
   which one a message did" isn't met yet.
3. **Start is inconsistent about robots who can't work.** Start is lit with nobody scheduled, and
   with scheduled robots who have no instructions. It's grey while a new robot reads (good: the
   status bar says "Pip reading"). But between shifts it stays lit while a robot is still thinking
   over new instructions. "Needs instructions" is said three times (crew chip, status bar, coach).
   One rule: Start waits for everyone scheduled to be ready, the status bar names who (one place),
   and the coach drops the repeat.
4. **Thinking looks like talking.** While a robot reads or thinks there's a "…" speech bubble over
   it on the floor and a "…" bubble in the chat (it even shows over the paused floor). Animated
   dots also appear in the crew chip and the status bar. And the thinking-budget pips in the chat
   header are three dots that read as "typing…". That's five sets of dots, two of them speech
   bubbles, which breaks the rule. One words-only indicator ("thinking") in the chip and status
   bar. On the floor, a non-bubble mark over the robot. Budget pips drawn as something other than
   dots.
5. **The floor doesn't say whether you're on pace.** The shift card says "At this pace you'll
   finish" after the shift is over. Put "on pace / 2 short" next to the contract ticket during the
   shift.
6. **Disabled buttons don't say why.** "Recruit $120" and "Buy $170" just go grey. Say "$20 short".
   The side contract already does this well: "Needs a paint machine".
7. **Training is a wall of chips.** A compact row per robot (current skills, then one "Train"
   picker) reads at a glance.

Smaller, seen in play:
- Confirmed: the second robot you schedule spawns on top of You at the desk, with "Pip" written
  over your face. It happens again at every new shift. The first robot stands beside you.
- The shift and quarter cards use the lender's dollar-eyed face even when you never borrowed.
- The pause button keeps its pause icon while paused, and crew chips still say "Working".
- The quarter ended partway through shift 2 (quota met). The card says "Every contract shipped"
  but not that the quarter is over early or that shift 3 is skipped. The header behind it still
  says budget $70 while the card says $220.
- The ticket chip on the shift and quarter cards reads "20" right next to "15 of 20 shipped".
- The forecast says +$150 twice ("Contracts pay" and "You get") when there's no loan.
- The board doesn't recap the last quarter, and the floor behind it is the stale last shift.
- The title shows dead floor chrome behind the menu ("LEVEL 0:00", an empty order panel). On a
  level there's no way back to the title before Start except reloading.
- Waits: a new robot read instructions for about 15 s (two model calls), Blip took about 4 s.
  A reply to a mid-shift message took about 10 s. These are fine with the indicator, but they're
  why item 4 matters.
- Balance, not UX: the small Q1 contract (20 boxes) finished with Blip and Pip at the start of shift 2.
  It never asked the money question.
- ideas.md still says training is $50 a skill; the game says $20.
- Not seen this run: desk visits and the "?"/"!" thinking marks. The shift had no unexpected
  events. A test with vague instructions that stay in the routine is still needed.

## Open calls waiting on Mike

- Money info (revised after Mike's answer that crew cost depends on the shift): board shows the
  whole crew's per-shift cost as a ceiling; the schedule shows this shift's cost, budget after, and
  how many shifts like it the budget covers.
- Block Start for scheduled robots without instructions (Pam: yes, one message, in the status bar).
- Compact Training (Pam: yes, picker per robot).
- Dedupe "needs instructions" (Pam: status bar only).
- A marker on every reply saying what the message did (Pam: yes; changed / one-off / no change).
- Thinking indicator in words, no speech bubbles or dots (Pam: yes).

## Log

- 2026-11-17: brief written from CLAUDE.md, ideas.md, decision 67 and screenshots of the title,
  levels 1 and 4, and level 7's board, floor (scheduled, ready, running) and shift and quarter cards.
- 2026-11-17: played the real game (`node server.mjs`, real model) at 1440x900: the title, level 3
  (schedule Pip, instruct), and level 7 quarter 1 (small contract, Blip and Pip, instructions, Start,
  pause, a message to Pip mid-shift that changed his instructions, a vague message to Blip
  between shifts, quarter done, back to the board for Q2). All five concerns confirmed, and the
  spawn-on-You bug is confirmed. New from real play: what a message did isn't clear (now #2), and
  thinking looks like talking (#4). Start is inconsistent and the cards have small mismatches.
- 2026-11-17: Mike answered the open calls; the build thread is doing the agreed fixes and the
  mocks, which Pam reviews. Crew cost rethought per his point (item 1).
- 2026-11-17: reviewed 2e7c5de (reply markers, thinking word) and mocks (compact Training, coach line,
  crew cost). All good to show; fixes: picker must show the third-item jump, no-change replies
  shouldn't promise new work, crew-cost line in the board's label style and tied to the quarter.
- 2026-11-17: Mike approved all five (compact Training, coach line, crew cost, reply markers,
  thinking word). Crew-cost plan is now the standard; mocks and screenshots need a title and description.
- 2026-11-17: general UI rules moved to the quasarbright plugin (v0.6.0); this brief now keeps only the clanker-only ones.
