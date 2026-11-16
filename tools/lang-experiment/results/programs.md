# Programs, side by side

For hand grading. Each task: what a correct program does, then every program per language with its check.

## haul

**Instructions:** Bring widgets from the belt to Pack.  
**Order:** 4 red boxes  
**Coworkers:** {"Pip":"Pack boxes at Pack and ship them from the dock."}  
**Correct:** Loop: BELT → pick up (red, or any) → PACK → put down. Nothing else.

### js #0 (valid, 2962 ms)

```js
while (true) {
  move("BELT");
  pickUp();
  move("PACK");
  putDown();
}
```

### js #1 (valid, 3563 ms)

```js
while (true) {
  move("BELT");
  pickUp();
  if (holding() !== "nothing") {
    move("PACK");
    putDown();
  }
}
```

### js #2 (valid, 3119 ms)

```js
while (true) {
  move("BELT");
  pickUp();
  move("PACK");
  putDown();
}
```

### lisp #0 (valid, 3434 ms)

```lisp
(loop
  (move BELT)
  (pick-up)
  (move PACK)
  (put-down))
```

### lisp #1 (valid, 2873 ms)

```lisp
(loop
  (move BELT)
  (pick-up)
  (move PACK)
  (put-down))
```

### lisp #2 (valid, 2958 ms)

```lisp
(loop
  (move BELT)
  (when (> (count BELT) 0)
    (pick-up)
    (move PACK)
    (put-down)))
```

## packer

**Instructions:** Pack boxes at Pack and ship them from the dock.  
**Order:** 4 red boxes  
**Coworkers:** {"Gary":"Bring widgets from the belt to Pack.","Rusty":"Bring widgets from the belt to Pack."}  
**Correct:** Only PACK and DOCK: pack (red) when 3 are there, pick up the box, ship at DOCK. Must NOT fetch from the belt.

### js #0 (valid, 5014 ms)

```js
while (true) {
  if (needs("red") > 0 && count("PACK", "red") >= 3) {
    move("PACK");
    pack("red");
  }
  if (boxes("PACK") > 0) {
    move("PACK");
    if (holding() === "nothing") {
      pickUpBox();
      move("DOCK");
      putDown();
    }
  }
  wait(1);
}
```

### js #1 (valid, 4719 ms)

```js
while (true) {
  if (needs("red") > 0 && count("PACK", "red") >= 3 && space("PACK") >= 0) {
    move("PACK");
    pack("red");
  }
  if (boxes("PACK") > 0) {
    move("PACK");
    pickUpBox();
    move("DOCK");
    putDown();
  }
  wait(1);
}
```

### js #2 (valid, 4663 ms)

```js
while (true) {
  move("PACK");
  if (needs("red") > 0 && count("PACK", "red") >= 3) {
    pack("red");
  }
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  }
  wait(1);
}
```

### lisp #0 (valid, 4670 ms)

```lisp
(loop
  (move PACK)
  (when (and (>= (count PACK red) 3) (> (needs red) 0))
    (pack red))
  (when (> (boxes PACK) 0)
    (pick-up-box)
    (move DOCK)
    (put-down)
    (move PACK)))
```

### lisp #1 (valid, 5303 ms)

```lisp
(loop
  (when (> (needs red) 0)
    (move PACK)
    (when (>= (count PACK red) 3)
      (pack red)))
  (move PACK)
  (when (> (boxes PACK) 0)
    (pick-up-box)
    (move DOCK)
    (put-down)
    (move PACK)))
```

### lisp #2 (valid, 5018 ms)

```lisp
(loop
  (move PACK)
  (when (and (> (needs red) 0) (>= (count PACK red) 3))
    (pack red))
  (when (> (boxes PACK) 0)
    (pick-up-box)
    (move DOCK)
    (put-down)
    (move PACK)))
```

## order-color

**Instructions:** Pack whatever color the order needs most, ship it, and keep going until the order is done.  
**Order:** 2 red boxes, 3 blue boxes  
**Coworkers:** {"Gary":"Bring widgets from the belt to Pack."}  
**Correct:** Pick the color with the larger needs(); pack that color when 3 are at PACK; ship; stop (or idle) when needsAny() is 0.

### js #0 (valid, 6151 ms)

```js
while (needsAny() > 0) {
  let c = "red";
  if (needs("blue") > needs(c)) { c = "blue"; }
  if (needs("green") > needs(c)) { c = "green"; }
  move("PACK");
  if (count("PACK", c) >= 3) { pack(c); }
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  }
  wait(2);
}
```

### js #1 (valid, 6470 ms)

```js
while (needsAny() > 0) {
  let color = "red";
  if (needs("blue") > needs("red")) {
    color = "blue";
  }
  move("PACK");
  if (count("PACK", color) >= 3) {
    pack(color);
  }
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  } else {
    wait(2);
  }
}
say("Order complete.");
```

### js #2 (valid, 7532 ms)

```js
function mostNeeded() {
  let best = "";
  let bestNeed = 0;
  for (const c of ["red", "blue", "green"]) {
    if (needs(c) > bestNeed) {
      bestNeed = needs(c);
      best = c;
    }
  }
  return best;
}

while (needsAny() > 0) {
  const c = mostNeeded();
  move("PACK");
  if (c !== "" && count("PACK", c) >= 3) {
    pack(c);
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  } else {
    wait(2);
  }
}
```

### lisp #0 (valid, 8008 ms)

```lisp
(loop
  (when (> (needs-any) 0)
    (let ((c (if (>= (needs blue) (needs red)) blue red)))
      (while (and (< (count PACK c) 3) (> (count BELT c) 0))
        (move BELT)
        (pick-up c)
        (move PACK)
        (put-down))
      (when (>= (count PACK c) 3)
        (pack c)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK)))))
```

### lisp #1 (valid, 8663 ms)

```lisp
(loop
  (while (> (needs-any) 0)
    (let ((color red))
      (cond ((and (> (needs red) 0) (>= (needs red) (needs blue))) (set! color red))
            ((> (needs blue) 0) (set! color blue))
            (else (set! color red)))
      (while (< (count PACK color) 3)
        (move BELT)
        (if (> (count BELT color) 0)
            (begin (pick-up color) (move PACK) (put-down))
            (wait 1)))
      (move PACK)
      (pack color)
      (pick-up-box)
      (move DOCK)
      (put-down))))
```

### lisp #2 (valid, 8373 ms)

```lisp
(loop
  (when (> (needs-any) 0)
    (let ((c (if (>= (needs blue) (needs red)) blue red)))
      (while (< (count PACK c) 3)
        (move BELT)
        (pick-up c)
        (move PACK)
        (put-down))
      (pack c)
      (pick-up-box)
      (move DOCK)
      (put-down)
      (move PACK))))
```

## paint-to-order

**Instructions:** Paint red widgets blue and ship them, but only as many as the order still needs.  
**Order:** 2 blue widgets (loose widgets ship)  
**Coworkers:** {}  
**Correct:** While needs(blue) > 0: BELT → pick up red → PAINT → paint blue → DOCK → put down. Stop after.

### js #0 (valid, 6336 ms)

```js
while (true) {
  if (needs("blue") > 0) {
    move("BELT");
    pickUp("red");
    if (holding() === "red") {
      move("PAINT");
      if (jammed()) {
        fix();
      }
      paint("blue");
      move("DOCK");
      putDown();
    }
  }
  wait(1);
}
```

### js #1 (valid, 7624 ms)

```js
while (true) {
  if (holding() === "nothing" && needs("blue") > 0) {
    move("BELT");
    pickUp("red");
  }
  if (holding() === "red" && needs("blue") > 0) {
    move("PAINT");
    if (jammed()) {
      fix();
    }
    paint("blue");
  }
  if (holding() === "blue") {
    move("DOCK");
    putDown();
  }
  wait(1);
}
```

### js #2 (valid, 9089 ms)

```js
let shipped = 0;
while (true) {
  if (shipped < 2) {
    if (holding() === "nothing") {
      move("BELT");
      pickUp("red");
    }
    if (holding() === "red") {
      move("PAINT");
      if (jammed()) {
        fix();
      }
      paint("blue");
    }
    if (holding() === "blue") {
      move("DOCK");
      putDown();
      shipped = shipped + 1;
    }
  }
  wait(1);
}
```

### lisp #0 (valid, 5719 ms)

```lisp
(loop
  (when (> (needs-any) 0)
    (move BELT)
    (pick-up red)
    (when (= (holding) red)
      (move PAINT)
      (when (jammed?) (fix))
      (paint blue)
      (move DOCK)
      (put-down))))
```

### lisp #1 (valid, 4731 ms)

```lisp
(loop
  (when (> (needs-any) 0)
    (move BELT)
    (pick-up red)
    (move PAINT)
    (when (jammed?) (fix))
    (paint blue)
    (move DOCK)
    (put-down)))
```

### lisp #2 (valid, 4729 ms)

```lisp
(loop
  (when (> (needs blue) 0)
    (move BELT)
    (pick-up red)
    (move PAINT)
    (when (jammed?)
      (fix))
    (paint blue)
    (move DOCK)
    (put-down)))
```

## overflow

**Instructions:** Haul widgets from the belt to Pack. If Pack is full, put them in bin 1 instead.  
**Order:** 4 red boxes  
**Coworkers:** {"Pip":"Pack boxes at Pack and ship them from the dock."}  
**Correct:** BELT → pick up → if space(PACK) > 0 go PACK else BIN_1 → put down.

### js #0 (valid, 3450 ms)

```js
while (true) {
  move("BELT");
  pickUp();
  if (holding() !== "nothing") {
    move("PACK");
    if (space("PACK") > 0) {
      putDown();
    } else {
      move("BIN_1");
      putDown();
    }
  }
}
```

### js #1 (valid, 3662 ms)

```js
while (true) {
  move("BELT");
  pickUp();
  if (holding() !== "nothing") {
    move("PACK");
    if (space("PACK") > 0) {
      putDown();
    } else {
      move("BIN_1");
      putDown();
    }
  }
}
```

### js #2 (valid, 3979 ms)

```js
while (true) {
  move("BELT");
  pickUp();
  if (holding() !== "nothing") {
    move("PACK");
    if (space("PACK") > 0) {
      putDown();
    } else {
      move("BIN_1");
      putDown();
    }
  }
}
```

### lisp #0 (valid, 3483 ms)

```lisp
(loop
  (move BELT)
  (pick-up)
  (unless (= (holding) nothing)
    (if (= (space PACK) 0)
        (begin (move BIN_1) (put-down))
        (begin (move PACK) (put-down)))))
```

### lisp #1 (valid, 3402 ms)

```lisp
(loop
  (move BELT)
  (pick-up)
  (unless (= (holding) nothing)
    (move PACK)
    (if (> (space PACK) 0)
        (put-down)
        (begin
          (move BIN_1)
          (put-down)))))
```

### lisp #2 (valid, 3559 ms)

```lisp
(loop
  (move BELT)
  (pick-up)
  (when (not (= (holding) nothing))
    (if (> (space PACK) 0)
        (begin
          (move PACK)
          (put-down))
        (begin
          (move BIN_1)
          (put-down)))))
```

## jam-keeper

**Instructions:** Stay at the paint machine. Whenever it jams, fix it right away. Otherwise grab a widget from the belt, paint it green, and drop it at Pack.  
**Order:** 3 green boxes  
**Coworkers:** {"Pip":"Pack green boxes and ship them."}  
**Correct:** Check jammed() before painting (and fix); BELT → pick up → PAINT → (fix if jammed) → paint green → PACK → put down.

### js #0 (valid, 4872 ms)

```js
while (true) {
  move("PAINT");
  if (jammed()) {
    fix();
  } else {
    move("BELT");
    pickUp();
    if (holding() !== "nothing") {
      move("PAINT");
      paint("green");
      move("PACK");
      putDown();
    }
  }
}
```

### js #1 (valid, 4947 ms)

```js
while (true) {
  move("PAINT");
  if (jammed()) {
    fix();
  } else {
    move("BELT");
    pickUp();
    if (holding() !== "nothing") {
      move("PAINT");
      paint("green");
      move("PACK");
      putDown();
    }
  }
}
```

### js #2 (valid, 4247 ms)

```js
while (true) {
  if (jammed()) {
    move("PAINT");
    fix();
  } else {
    move("BELT");
    pickUp();
    move("PAINT");
    paint("green");
    move("PACK");
    putDown();
    move("PAINT");
  }
}
```

### lisp #0 (valid, 4100 ms)

```lisp
(loop
  (if (jammed?)
    (begin
      (move PAINT)
      (fix))
    (begin
      (move BELT)
      (pick-up)
      (move PAINT)
      (paint green)
      (move PACK)
      (put-down))))
```

### lisp #1 (valid, 4775 ms)

```lisp
(loop
  (move PAINT)
  (when (jammed?) (fix))
  (move BELT)
  (pick-up)
  (move PAINT)
  (when (jammed?) (fix))
  (paint green)
  (move PACK)
  (put-down))
```

### lisp #2 (valid, 5326 ms)

```lisp
(loop
  (when (jammed?) (fix))
  (if (> (count BELT) 0)
    (begin
      (move BELT)
      (pick-up)
      (move PAINT)
      (when (jammed?) (fix))
      (paint green)
      (move PACK)
      (put-down)
      (move PAINT))
    (wait 1)))
```

## switch-colors

**Instructions:** Ship red boxes until the red part of the order is done, then switch to blue.  
**Order:** 2 red boxes, 2 blue boxes  
**Coworkers:** {"Gary":"Bring red and blue widgets from the belt to Pack."}  
**Correct:** Color = needs(red) > 0 ? red : blue; pack that color at PACK, pick up box, ship at DOCK; stop when done.

### js #0 (valid, 4640 ms)

```js
while (true) {
  let color = "red";
  if (needs("red") === 0) {
    color = "blue";
  }
  if (needs(color) > 0) {
    move("PACK");
    if (count("PACK", color) >= 3) {
      pack(color);
    }
    if (boxes("PACK") > 0) {
      pickUpBox();
      move("DOCK");
      putDown();
      move("PACK");
    }
  } else {
    wait(1);
  }
}
```

### js #1 (valid, 7248 ms)

```js
while (true) {
  let color = "blue";
  if (needs("red") > 0) {
    color = "red";
  }
  if (needs(color) > 0) {
    if (boxes("PACK") > 0) {
      move("PACK");
      pickUpBox();
      move("DOCK");
      putDown();
    } else if (count("PACK", color) >= 3) {
      move("PACK");
      pack(color);
    }
  }
  wait(1);
}
```

### js #2 (valid, 6414 ms)

```js
while (true) {
  let color = "red";
  if (needs("red") === 0) {
    color = "blue";
  }
  move("PACK");
  if (needs(color) > 0 && count("PACK", color) >= 3) {
    pack(color);
  }
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  }
}
```

### lisp #0 (valid, 5627 ms)

```lisp
(define (ship-one)
  (move PACK)
  (when (> (boxes PACK) 0)
    (pick-up-box)
    (move DOCK)
    (put-down)
    (move PACK)))

(loop
  (cond
    ((> (needs red) 0) (ship-one))
    ((> (needs blue) 0) (ship-one))
    (else (wait 1))))
```

### lisp #1 (valid, 4893 ms)

```lisp
(loop
  (cond
    ((> (needs red) 0)
      (move PACK)
      (pack red)
      (when (> (boxes PACK) 0)
        (pick-up-box)
        (move DOCK)
        (put-down)))
    ((> (needs blue) 0)
      (move PACK)
      (pack blue)
      (when (> (boxes PACK) 0)
        (pick-up-box)
        (move DOCK)
        (put-down)))
    (else (wait 1))))
```

### lisp #2 (valid, 6093 ms)

```lisp
(loop
  (cond ((> (needs red) 0)
         (when (> (boxes PACK) 0)
           (move PACK)
           (pick-up-box)
           (move DOCK)
           (put-down)))
        ((> (needs blue) 0)
         (when (> (boxes PACK) 0)
           (move PACK)
           (pick-up-box)
           (move DOCK)
           (put-down)))
        (else (wait 1))))
```

## sorter

**Instructions:** Sort the belt: blue widgets go to bin 2, red widgets go to bin 1. Leave the greens on the belt.  
**Order:** none (sorting job)  
**Coworkers:** {}  
**Correct:** At BELT pick up red or blue (not green); red → BIN_1, blue → BIN_2. Must not pick up green.

### js #0 (valid, 3981 ms)

```js
while (true) {
  move("BELT");
  if (count("BELT", "blue") > 0 && space("BIN_2") > 0) {
    pickUp("blue");
    move("BIN_2");
    putDown();
    move("BELT");
  }
  if (count("BELT", "red") > 0 && space("BIN_1") > 0) {
    pickUp("red");
    move("BIN_1");
    putDown();
    move("BELT");
  }
  wait(1);
}
```

### js #1 (valid, 3440 ms)

```js
while (true) {
  if (count("BELT", "red") > 0) {
    move("BELT");
    pickUp("red");
    move("BIN_1");
    putDown();
  } else if (count("BELT", "blue") > 0) {
    move("BELT");
    pickUp("blue");
    move("BIN_2");
    putDown();
  } else {
    wait(1);
  }
}
```

### js #2 (valid, 4773 ms)

```js
while (true) {
  move("BELT");
  if (count("BELT", "red") > 0) {
    pickUp("red");
    move("BIN_1");
    putDown();
    move("BELT");
  }
  if (count("BELT", "blue") > 0) {
    pickUp("blue");
    move("BIN_2");
    putDown();
    move("BELT");
  }
  wait(1);
}
```

### lisp #0 (valid, 4035 ms)

```lisp
(loop
  (move BELT)
  (when (> (count BELT blue) 0)
    (pick-up blue)
    (move BIN_2)
    (put-down))
  (move BELT)
  (when (> (count BELT red) 0)
    (pick-up red)
    (move BIN_1)
    (put-down)))
```

### lisp #1 (valid, 4395 ms)

```lisp
(loop
  (move BELT)
  (cond ((> (count BELT red) 0)
         (pick-up red)
         (move BIN_1)
         (put-down))
        ((> (count BELT blue) 0)
         (pick-up blue)
         (move BIN_2)
         (put-down))
        (else (wait 1))))
```

### lisp #2 (valid, 4773 ms)

```lisp
(loop
  (move BELT)
  (pick-up blue)
  (when (= (holding) blue)
    (move BIN_2)
    (put-down))
  (move BELT)
  (pick-up red)
  (when (= (holding) red)
    (move BIN_1)
    (put-down)))
```
