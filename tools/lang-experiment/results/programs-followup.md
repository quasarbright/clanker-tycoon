# Programs, side by side

For hand grading. Each task: what a correct program does, then every program per language with its check.

## order-color

**Instructions:** Pack whatever color the order needs most, ship it, and keep going until the order is done.  
**Order:** 2 red boxes, 3 blue boxes  
**Coworkers:** {"Gary":"Bring widgets from the belt to Pack."}  
**Correct:** Pick the color with the larger needs(); pack that color when 3 are at PACK; ship; stop (or idle) when needsAny() is 0.

### js #0 (valid, 6087 ms)

```js
while (needsAny() > 0) {
  let target = "red";
  let most = needs("red");
  if (needs("blue") > most) {
    target = "blue";
    most = needs("blue");
  }
  if (needs("green") > most) {
    target = "green";
    most = needs("green");
  }
  move("PACK");
  if (count("PACK", target) >= 3) {
    pack(target);
    pickUpBox();
    move("DOCK");
    putDown();
  } else {
    wait(1);
  }
}
```

### js #1 (valid, 9007 ms)

```js
function bestColor() {
  let best = "";
  let bestNeed = 0;
  if (needs("red") > bestNeed && count("PACK", "red") >= 3) {
    best = "red";
    bestNeed = needs("red");
  }
  if (needs("blue") > bestNeed && count("PACK", "blue") >= 3) {
    best = "blue";
    bestNeed = needs("blue");
  }
  if (needs("green") > bestNeed && count("PACK", "green") >= 3) {
    best = "green";
    bestNeed = needs("green");
  }
  return best;
}

while (needsAny() > 0) {
  move("PACK");
  const c = bestColor();
  if (c !== "") {
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

### js #2 (valid, 5733 ms)

```js
while (needsAny() > 0) {
  move("PACK");
  let c = "blue";
  if (needs("red") > needs("blue") && needs("red") >= needs("green")) {
    c = "red";
  } else if (needs("green") > needs("blue") && needs("green") > needs("red")) {
    c = "green";
  }
  if (needs(c) > 0 && count("PACK", c) >= 3) {
    pack(c);
  }
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  }
}

```

### js #3 (valid, 6813 ms)

```js
while (true) {
  if (needsAny() > 0) {
    let color = "";
    let best = 0;
    for (const c of ["red", "blue", "green"]) {
      if (needs(c) > best) {
        best = needs(c);
        color = c;
      }
    }
    if (color !== "" && count("PACK", color) >= 3) {
      move("PACK");
      pack(color);
    }
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

### js #4 (valid, 6625 ms)

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
    wait(1);
  }
}
say("Order complete.");
```

### js #5 (valid, 8533 ms)

```js
while (needsAny() > 0) {
  let color = "red";
  if (needs("blue") > needs("red")) {
    color = "blue";
  }
  for (let i = 0; i < 3; i++) {
    move("BELT");
    pickUp(color);
    move("PACK");
    putDown();
  }
  pack(color);
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
  }
  move("BELT");
}
```

### js #6 (valid, 6226 ms)

```js
while (needsAny() > 0) {
  let color = "red";
  if (needs("blue") > needs(color)) {
    color = "blue";
  }
  if (needs("green") > needs(color)) {
    color = "green";
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
  }
  wait(1);
}
```

### js #7 (valid, 7808 ms)

```js
function pickColor() {
  let best = "";
  let most = 0;
  if (needs("red") > most) {
    most = needs("red");
    best = "red";
  }
  if (needs("blue") > most) {
    most = needs("blue");
    best = "blue";
  }
  if (needs("green") > most) {
    most = needs("green");
    best = "green";
  }
  return best;
}

while (needsAny() > 0) {
  const color = pickColor();
  move("PACK");
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  }
  if (color !== "" && count("PACK", color) >= 3) {
    pack(color);
  }
  wait(1);
}

move("PACK");
if (boxes("PACK") > 0) {
  pickUpBox();
  move("DOCK");
  putDown();
}
```

### js #8 (valid, 7194 ms)

```js
function pickColor() {
  let best = "";
  let bestN = 0;
  const colors = ["red", "blue", "green"];
  for (const c of colors) {
    if (needs(c) > bestN) {
      bestN = needs(c);
      best = c;
    }
  }
  return best;
}

while (needsAny() > 0) {
  const color = pickColor();
  move("PACK");
  if (color !== "" && count("PACK", color) >= 3) {
    pack(color);
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

### js #9 (valid, 5852 ms)

```js
while (needsAny() > 0) {
  let best = "red";
  if (needs("blue") > needs(best)) {
    best = "blue";
  }
  if (needs("green") > needs(best)) {
    best = "green";
  }
  move("PACK");
  if (count("PACK", best) >= 3 && needs(best) > 0) {
    pack(best);
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

### lisp #0 (valid, 6457 ms)

```lisp
(while (> (needs-any) 0)
  (let ((c (if (>= (needs blue) (needs red)) blue red)))
    (move PACK)
    (when (>= (count PACK c) 3)
      (pack c)
      (pick-up-box)
      (move DOCK)
      (put-down)
      (move PACK))))
```

### lisp #1 (valid, 6551 ms)

```lisp
(loop
  (when (> (needs-any) 0)
    (let ((c (if (>= (needs blue) (needs red)) blue red)))
      (move BELT)
      (pick-up c)
      (move PACK)
      (put-down)
      (when (>= (count PACK c) 3)
        (pack c)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK)))))
```

### lisp #2 (valid, 7653 ms)

```lisp
(loop
  (while (> (needs-any) 0)
    (let ((r (needs red)) (b (needs blue)) (g (needs green)))
      (let ((color (cond ((and (>= r b) (>= r g)) red) ((>= b g) blue) (else green))))
        (move PACK)
        (when (>= (count PACK color) 3)
          (pack color)
          (when (> (boxes PACK) 0)
            (pick-up-box)
            (move DOCK)
            (put-down)
            (move PACK))))))
  )
```

### lisp #3 (valid, 7669 ms)

```lisp
(while (> (needs-any) 0)
  (let ((c red))
    (when (> (needs blue) (needs c)) (set! c blue))
    (when (> (needs green) (needs c)) (set! c green))
    (when (> (needs c) 0)
      (move PACK)
      (when (>= (count PACK c) 3)
        (pack c)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK))))
  (wait 1))
```

### lisp #4 (valid, 6635 ms)

```lisp
(loop
  (cond
    ((and (> (needs blue) 0) (>= (needs blue) (needs red)))
     (move PACK)
     (when (>= (count PACK blue) 3)
       (pack blue)
       (pick-up-box)
       (move DOCK)
       (put-down)
       (move PACK)))
    ((> (needs red) 0)
     (move PACK)
     (when (>= (count PACK red) 3)
       (pack red)
       (pick-up-box)
       (move DOCK)
       (put-down)
       (move PACK)))
    (else (wait 1))))
```

### lisp #5 (valid, 6784 ms)

```lisp
(define (pick-color) (if (>= (needs red) (needs blue)) red blue)) (loop (when (> (needs-any) 0) (let ((c (pick-color))) (move PACK) (if (>= (count PACK c) 3) (begin (pack c) (pick-up-box) (move DOCK) (put-down) (move PACK)) (wait 1)))))
```

### lisp #6 (valid, 7028 ms)

```lisp
(loop
  (when (> (needs-any) 0)
    (let ((c (if (>= (needs red) (needs blue)) red blue)))
      (when (< (count PACK c) 3)
        (move BELT)
        (pick-up c)
        (move PACK)
        (put-down))
      (when (>= (count PACK c) 3)
        (move PACK)
        (pack c)
        (pick-up-box)
        (move DOCK)
        (put-down)))))
```

### lisp #7 (valid, 5563 ms)

```lisp
(loop
  (when (> (needs-any) 0)
    (move PACK)
    (cond ((and (> (needs red) 0) (>= (needs red) (needs blue))) (pack red))
          ((> (needs blue) 0) (pack blue))
          (else (pack)))
    (when (> (boxes PACK) 0)
      (pick-up-box)
      (move DOCK)
      (put-down)
      (move PACK))))
```

### lisp #8 (valid, 7236 ms)

```lisp
(define (top-color)
  (cond ((and (>= (needs red) (needs blue)) (>= (needs red) (needs green))) red)
        ((>= (needs blue) (needs green)) blue)
        (else green)))

(loop
  (when (> (needs-any) 0)
    (let ((c (top-color)))
      (move PACK)
      (when (>= (count PACK c) 3)
        (pack c))
      (when (> (boxes PACK) 0)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK)))))
```

### lisp #9 (valid, 5910 ms)

```lisp
(while (> (needs-any) 0)
  (let ((c (if (> (needs blue) (needs red)) blue red)))
    (move BELT)
    (pick-up c)
    (move PACK)
    (put-down)
    (when (>= (count PACK c) 3)
      (pack c)
      (pick-up-box)
      (move DOCK)
      (put-down)
      (move PACK))))
```

## switch-colors

**Instructions:** Ship red boxes until the red part of the order is done, then switch to blue.  
**Order:** 2 red boxes, 2 blue boxes  
**Coworkers:** {"Gary":"Bring red and blue widgets from the belt to Pack."}  
**Correct:** Color = needs(red) > 0 ? red : blue; pack that color at PACK, pick up box, ship at DOCK; stop when done.

### js #0 (valid, 5952 ms)

```js
while (true) {
  let color = "none";
  if (needs("red") > 0) {
    color = "red";
  } else if (needs("blue") > 0) {
    color = "blue";
  }
  if (color !== "none") {
    move("PACK");
    if (count("PACK", color) >= 3) {
      pack(color);
    }
  }
  if (boxes("PACK") > 0) {
    move("PACK");
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  }
  wait(1);
}
```

### js #1 (valid, 5514 ms)

```js
while (true) {
  let color = "red";
  if (needs("red") === 0) {
    color = "blue";
  }
  if (needs(color) > 0) {
    move("PACK");
    if (count("PACK", color) >= 3 && space("PACK") >= 0) {
      pack(color);
    }
    if (boxes("PACK") > 0) {
      pickUpBox();
      move("DOCK");
      putDown();
      move("PACK");
    }
  }
  wait(1);
}
```

### js #2 (valid, 7069 ms)

```js
while (true) {
  const color = needs("red") > 0 ? "red" : "blue";
  if (needs(color) > 0) {
    move("BELT");
    pickUp(color);
    if (holding() === color) {
      move("PACK");
      putDown();
    }
    if (count("PACK", color) >= 3) {
      move("PACK");
      pack(color);
      pickUpBox();
      move("DOCK");
      putDown();
    }
  } else {
    wait(1);
  }
}
```

### js #3 (valid, 5271 ms)

```js
while (true) {
  let color = "red";
  if (needs("red") === 0) {
    color = "blue";
  }
  move("PACK");
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  } else if (count("PACK", color) >= 3) {
    pack(color);
  }
}
```

### js #4 (valid, 5760 ms)

```js
while (true) {
  let color = "none";
  if (needs("red") > 0) {
    color = "red";
  } else {
    if (needs("blue") > 0) {
      color = "blue";
    }
  }
  if (color !== "none") {
    move("PACK");
    const before = boxes("PACK");
    pack(color);
    if (boxes("PACK") > before) {
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

### js #5 (valid, 5037 ms)

```js
while (true) {
  let color = "blue";
  if (needs("red") > 0) {
    color = "red";
  }
  move("PACK");
  if (boxes("PACK") > 0) {
    pickUpBox();
    move("DOCK");
    putDown();
    move("PACK");
  }
  if (needs(color) > 0 && count("PACK", color) >= 3) {
    pack(color);
  }
  wait(1);
}
```

### js #6 (valid, 6745 ms)

```js
while (true) {
  let color = "blue";
  if (needs("red") > 0) {
    color = "red";
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
  wait(1);
}
```

### js #7 (valid, 6599 ms)

```js
while (true) {
  let c = "";
  if (needs("red") > 0) {
    c = "red";
  } else if (needs("blue") > 0) {
    c = "blue";
  }
  if (c !== "") {
    move("PACK");
    if (count("PACK", c) >= 3) {
      pack(c);
    }
    if (boxes("PACK") > 0) {
      pickUpBox();
      move("DOCK");
      putDown();
      move("PACK");
    }
  }
  wait(1);
}
```

### js #8 (valid, 6240 ms)

```js
while (true) {
  let color = "blue";
  if (needs("red") > 0) {
    color = "red";
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

### js #9 (valid, 5620 ms)

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
  }
  wait(1);
}
```

### lisp #0 (valid, 6176 ms)

```lisp
(loop
  (cond
    ((> (needs red) 0)
     (move PACK)
     (when (>= (count PACK red) 3) (pack red))
     (when (> (boxes PACK) 0)
       (pick-up-box)
       (move DOCK)
       (put-down)
       (move PACK)))
    ((> (needs blue) 0)
     (move PACK)
     (when (>= (count PACK blue) 3) (pack blue))
     (when (> (boxes PACK) 0)
       (pick-up-box)
       (move DOCK)
       (put-down)
       (move PACK)))
    (else (wait 1))))
```

### lisp #1 (valid, 5655 ms)

```lisp
(loop
  (cond
    ((> (needs red) 0)
      (move PACK)
      (pack red)
      (when (> (boxes PACK) 0)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK)))
    ((> (needs blue) 0)
      (move PACK)
      (pack blue)
      (when (> (boxes PACK) 0)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK)))
    (else (wait 5))))
```

### lisp #2 (valid, 5301 ms)

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

### lisp #3 (valid, 5231 ms)

```lisp
(loop
  (let ((color (if (> (needs red) 0) red blue)))
    (when (> (needs-any) 0)
      (move PACK)
      (when (>= (count PACK color) 3)
        (pack color))
      (when (> (boxes PACK) 0)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK)))))
```

### lisp #4 (valid, 5755 ms)

```lisp
(define (ship)
  (move PACK)
  (when (> (boxes PACK) 0)
    (pick-up-box)
    (move DOCK)
    (put-down)))

(loop
  (cond ((> (needs red) 0) (ship))
        ((> (needs blue) 0) (ship))
        (else (wait 1))))
```

### lisp #5 (valid, 5454 ms)

```lisp
(define (ship color)
  (move PACK)
  (when (>= (count PACK color) 3)
    (pack color))
  (when (> (boxes PACK) 0)
    (pick-up-box)
    (move DOCK)
    (put-down)))

(loop
  (cond
    ((> (needs red) 0) (ship red))
    ((> (needs blue) 0) (ship blue))
    (else (wait 1))))
```

### lisp #6 (valid, 3943 ms)

```lisp
(loop
  (cond ((> (needs red) 0)
         (move PACK)
         (pick-up-box)
         (move DOCK)
         (put-down))
        ((> (needs blue) 0)
         (move PACK)
         (pick-up-box)
         (move DOCK)
         (put-down))
        (else (wait 1))))
```

### lisp #7 (valid, 7256 ms)

```lisp
(loop
  (cond
    ((> (needs red) 0)
      (move PACK)
      (when (>= (count PACK red) 3) (pack red))
      (when (> (boxes PACK) 0)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK)))
    ((> (needs blue) 0)
      (move PACK)
      (when (>= (count PACK blue) 3) (pack blue))
      (when (> (boxes PACK) 0)
        (pick-up-box)
        (move DOCK)
        (put-down)
        (move PACK)))
    (else (wait 1))))
```

### lisp #8 (valid, 5162 ms)

```lisp
(loop
  (cond ((> (needs red) 0)
         (move PACK)
         (when (> (boxes PACK) 0)
           (pick-up-box)
           (move DOCK)
           (put-down)))
        ((> (needs blue) 0)
         (move PACK)
         (when (> (boxes PACK) 0)
           (pick-up-box)
           (move DOCK)
           (put-down)))
        (else (wait 5))))
```

### lisp #9 (valid, 4703 ms)

```lisp
(loop
  (cond
    ((> (needs red) 0)
      (when (> (boxes PACK) 0)
        (move PACK)
        (pick-up-box)
        (move DOCK)
        (put-down)))
    (else
      (when (> (boxes PACK) 0)
        (move PACK)
        (pick-up-box)
        (move DOCK)
        (put-down)))))
```
