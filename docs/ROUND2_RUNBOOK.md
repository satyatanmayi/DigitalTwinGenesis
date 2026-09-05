# Round 2 Runbook — one page, in order

*Print this or keep it open. Everything below has been run and verified.*

---

## Before they arrive — 5 minutes

```bash
run.bat                       # serves on http://localhost:8000
```

Open **three** things:

1. **http://localhost:8000/index.html** — the street. Left half of the screen.
2. **http://localhost:8000/console.html** — the control room. Right half.
   (Or press `OPEN THE CONTROL ROOM WINDOW` in the street's sidebar.)
3. **A terminal** in the project folder. You will run two commands from it.

Then press **guided demo step 1** on the street and let it run. Walk in with
traffic already moving.

**Check the top-right of the control room reads `live via BroadcastChannel`.**
If it says anything else, close both tabs and reopen them from the same
`localhost` address — the two windows must share an origin to talk.

---

## The demo — 6 minutes, five moves

### Move 1 — what you are looking at (30 s)

> "Left window is the street: a digital twin of four junctions, with real
> vehicles — two-wheelers, autos, cars, buses, trucks. Right window is the
> control room. It has no simulation in it at all; it watches the street and
> decides. The number top-left is average delay per vehicle. That is what we are
> trying to reduce."

### Move 2 — the deliverable (60 s) · **guided demo step 2**

The step drags east–west green to 30 s and north–south to 12 s for you.

> "I have just given east–west more green. Watch east–west drain and
> north–south build, because I took those seconds from somewhere. But that is a
> feeling, not evidence."

Press **TEST THIS PLAN**. While it runs, say the important sentence:

> "This is replaying exactly the same traffic — the same vehicles, arriving at
> the same moments, in the same order — under the new plan. Same cars, different
> plan. It is a controlled experiment, which a real road can never be."

### Move 3 — the bad day (45 s) · **guided demo step 3**

> "A collision blocks one approach. Watch the queue grow backwards into the
> junction behind — one incident, three streets. And now waterlogging: speeds
> drop and buses and trucks are barred by weight limit. That is why we model
> five vehicle types and not one."

### Move 4 — the centrepiece (90 s) · **guided demo step 4**

Two ambulances, crossing roads, same junction.

**Point at the right-hand window, not the left.**

> "The control room warned *before* either vehicle arrived — there is the
> countdown. Two priority requests need opposite phases at the same junction, so
> only one can be served.
>
> It has priced all three choices, including doing nothing, and marked the best
> benefit-to-cost ratio. Every decision shows its arithmetic — severity, trust,
> people on board, seconds saved, against vehicle-seconds it costs everyone
> else."

Click **CHOOSE** on the recommended option.

> "The other request is not thrown away — it waits, and it climbs while it
> waits, so nothing starves. And a corridor is never taken from a vehicle
> already inside it."

### Move 5 — the model (60 s) · **guided demo step 5**

> "That was rules. This is the trained model, and it was trained inside this
> simulator — you cannot train a controller on a real city, because there the
> failures are real."

Then, in the terminal:

```bash
node tests/run.js
```

> "Twenty-one assertions. Reproducibility, safety under a hostile controller,
> arbitration, and the physics checked against Webster's closed-form delay
> model from 1958."

---

## The numbers, if asked

**Browser twin** — held-out seeds, identical traffic, 360 s window, demand
biased 2× toward one axis:

| Controller | Average control delay |
| --- | --- |
| Fixed plan | 35.28 s |
| Max-Pressure | 31.95 s |
| Trained model | **32.58 s — 11.6% better than fixed** |

**SUMO track** — five held-out scenarios, one ambulance each:

| Controller | Ambulance waiting | Ambulance travel | Everyone else |
| --- | --- | --- | --- |
| Fixed 30 s / 30 s | 12.0 s | 47 s | 4,680 veh-s |
| Max-Pressure | 13.2 s | 50 s | 6,746 veh-s |
| Trained model | **0.0 s** | **32 s** | 4,830 veh-s |

> "The ambulance never stopped once. Travel time down 32%, and everyone else
> paid 3%."

**Real Vijayawada map** — 1.71 km trip crossing 19 signalised junctions,
imported from OpenStreetMap:

| | Ambulance waiting | Ambulance trip |
| --- | --- | --- |
| Signals ignore it | 160 s | 369 s |
| Green corridor | **0 s** | **177 s — 192 s saved, 52% faster** |

> "That is a real Vijayawada road network. The geometry is from OpenStreetMap.
> The signal placement is inferred, because the map does not record it — and
> that gap is itself worth knowing about."

**Verification:** 21 simulation assertions, 25 browser checks, both green.

```bash
node tests/run.js                      # 21 passed
node tools/browser-check/check.js      # 25 passed, real headless Chromium
python sumo/benchmark.py --scenarios 5 # the SUMO table
python sumo/city_corridor.py           # the real Vijayawada corridor
```

---

## If something goes wrong

| Problem | Do this |
| --- | --- |
| Control room says "no channel" | Reopen both tabs from the same `localhost` address |
| The street looks frozen | Press `PAUSE` then `PAUSE` again; or `REPLAY SAME TRAFFIC` |
| A scenario misbehaves | Press `NORMAL`, then carry on talking |
| The whole page dies | Switch to the deck's diagram slides — they show the same workflow |
| Anything at all | **Never open the console. Never explain a bug.** Move forward |

---

## The three sentences that carry the pitch

1. **"Every test replays identical traffic, so the difference is the plan, not luck."**
2. **"The control room warned before either ambulance arrived, and priced every option — including doing nothing."**
3. **"Adaptive control is not free: under symmetric demand nothing beats an even split, because every phase change costs four seconds that serve nobody. We measured where it pays."**

---

## If they open the code

Point them at `docs/CODE_TOUR.md`. It has a table of the ten most likely
questions with the file and function that answers each. The two to know cold:

- **"What stops the AI doing something dangerous?"** → `sim.js`, `applyAction()`.
  Every controller writes through that one function, and minimum green, maximum
  green and the yellow interval are enforced beneath it. Hard-coded, never
  learned.
- **"How was the model trained?"** → `tools/train.py` talks to
  `tools/env-server.js`, which runs the *same* `sim.js` the browser runs, over a
  JSON protocol. `features.js` is loaded by both, so training and deployment
  cannot drift apart.

---

## What to admit before you are asked

No route choice. No turning movements. No pedestrians. The sensor feed is mocked
at one documented function. The SUMO model is trained on one junction shape and
will not transfer to a real Vijayawada junction without a relative state vector.
Not validated against field data.

Say these plainly. Volunteering them scores; being caught by them does not.
