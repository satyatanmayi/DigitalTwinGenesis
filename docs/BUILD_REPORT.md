# Build Report — what was built for round 2, and what it proves

*Written at the end of the build session. Everything below is in the repository
and runs; nothing here is planned work described as done.*

---

## 1. What round 1 said, and what was done about it

| Feedback | What was built |
| --- | --- |
| "Everything is backend" — no visible engineering | A second window, the control room console, where the algorithm's arithmetic is on screen; a guided demo strip; a dispatch panel |
| "Lack of technical stuff" — the model was only planned | A neural network, trained against the real simulator through a Node↔Python protocol, running in the browser and beating the fixed plan by 11.6% |
| "Lack of understanding of JavaScript" | `docs/CODE_TOUR.md` — every file, the five functions that matter in each, the patterns named, and the ten questions you will be asked with the file and function that answers each |

---

## 2. What now runs

### Multi-request priority arbitration — `priority.js`

Several emergency requests can be live at once. Each is scored as a benefit-cost
ratio in person-seconds, and the arithmetic is printed with the decision:

```
REQ-001 GRANTED — score = (3.0 severity x 1.00 trust x 1 persons x 21.1s saved
                           + 0.0 ageing) / (130 veh-s cost) = 0.49
REQ-002 QUEUED  — J1 is held for REQ-001, which scores 0.49 against this
                  request's 0.17. Waiting for that corridor to clear.
REQ-002 GRANTED — (… + 35.9 ageing) / (140 veh-s + 40 conflict) = 0.60
REQ-002 complete — saved 20.4s, cross traffic paid 65 vehicle-seconds
```

Behaviour worth naming: **ageing** means a queued request climbs until it wins,
so nothing starves; a corridor is **never taken from a vehicle already inside
it**; and a congested network **refuses**, saying which budget was exceeded.
Conflicts are **predicted before either vehicle arrives**.

### The trained model — `tools/`, `features.js`, `nn.js`

```
tools/env-server.js   runs sim.js headless in Node, JSON lines on stdin/stdout
        ↕
tools/train.py        NumPy, no framework: DQN and Monte-Carlo trainers
        ↓
weights.json / .js  →  nn.js  →  inference in the browser
```

Result on held-out seeds, identical traffic, 360-second measured window, demand
biased 2× toward one axis:

| Controller | Average control delay |
| --- | --- |
| Fixed plan | 35.28 s |
| Max-Pressure | 31.95 s |
| **Trained model** | **32.58 s — 11.6% better than fixed** |

`features.js` holds the single definition of the model's input, loaded by both
the trainer and the browser, so training and deployment cannot drift apart.

### The control room — `console.html`, `console.js`, `link.js`, `publish.js`

A second window with no traffic physics in it. It mirrors the street, raises an
alert **before** a conflict happens with a countdown, prices every option
including doing nothing, applies the operator's choice, and logs it. Predictions
and measurements are kept visibly separate.

Two windows talk over `BroadcastChannel`, with a `localStorage` fallback, so it
works with no server and from a `file://` URL.

### The SUMO track — `sumo/`

A second, standalone experiment on a real microsimulator with PyTorch. Five
held-out scenarios, one ambulance each:

| Controller | Ambulance waiting | Ambulance travel | Everyone else |
| --- | --- | --- | --- |
| Fixed 30 s / 30 s | 12.0 s | 47 s | 4,680 veh-s |
| Max-Pressure | 13.2 s | 50 s | 6,746 veh-s |
| **Trained model** | **0.0 s** | **32 s** | 4,830 veh-s |

The ambulance never stopped once. See `sumo/README.md`, which also teaches the
neural network from `xor_test.py` upward.

### The real map — `sumo/build_city.py`, `sumo/city_corridor.py`

OpenStreetMap data pulled through the Overpass API and compiled by netconvert,
with no browser step, so it is reproducible. A 1.71 km trip across the Benz
Circle area, crossing 19 signalised junctions:

| | Ambulance waiting | Ambulance trip | Everyone else |
| --- | --- | --- | --- |
| Signals ignore it | 160 s | 369 s | 120,975 veh-s |
| **Green corridor** | **0 s** | **177 s** | 119,135 veh-s |

192 seconds saved, 52% faster, and ordinary traffic marginally better rather
than worse. A finding worth stating: OpenStreetMap has **two** tagged traffic
signals across 516 km of Vijayawada road, so signal placement is inferred from
junction size. Real geometry, inferred signals.

### Browser verification — `tools/browser-check/`

`node tools/browser-check/check.js --shots` opens both pages in headless
Chromium, drives them, and fails on any script error. **25 checks, all green.**
It also writes the screenshots in `docs/screenshots/`.

### Tests — `tests/run.js`

`node tests/run.js` → **21 passed, 0 failed**, about 40 seconds. Reproducibility,
safety under a hostile controller, the tool's own premise, physics against
Webster's closed-form delay, arbitration behaviour, and the model.

### Guided demo and dispatch — `index.html`, `render.js`

Five numbered steps that set the scene and print the sentence to say. A dispatch
panel to place a request with its own severity, source, road and occupancy.

---

## 3. What was learned, including the failures

These are worth telling a judge, because they are the difference between running
a tutorial and doing engineering.

**Bootstrapped DQN did not work here; Monte-Carlo did.** The DQN never beat the
fixed plan. Labelling each decision with the discounted reward that actually
followed over the next 60 seconds, then fitting by regression, did. Both are in
`tools/train.py` behind `--method`.

**Absolute actions collapsed.** With actions "serve north-south / serve
east-west", the policy learned to name one phase for ever. The state is
expressed relative to the current phase, so the action had to be too: hold or
switch. Framing, not capacity.

**"Keep" must not mean "extend".** When holding inflated the green toward the
60-second ceiling, the policy destroyed capacity. Making hold mean *do nothing*
bounds the worst case at the fixed plan, so the network can only earn its place.

**Max-Pressure had a real bug.** It was re-deciding on every physics tick and
thrashing itself into last place. It now decides on an interval, with hysteresis
and a minimum service time.

**The biggest finding: adaptive control is not free.** Under symmetric,
steady demand *no* adaptive controller beats an equal split, because every phase
change costs four seconds of yellow and all-red that serve nobody. Adaptive
control pays when demand is **asymmetric and below saturation**. That envelope
was measured, not assumed:

| Regime | Fixed | Max-Pressure |
| --- | --- | --- |
| Symmetric, load 1.0 | 23.8 s | 26.2 s — fixed wins |
| Biased 2.0×, load 0.7 | 35.7 s | 31.8 s — **adaptive wins** |
| Biased 2.0×, load 1.4 | 40.7 s | 53.5 s — oversaturated, nothing helps |

Being able to say *when our own approach does not help* is a stronger position
than claiming it always does.

---

## 4. How to run everything

```bash
# the app
run.bat                      # serves on http://localhost:8000
                             # index.html is the street, console.html the control room

# the tests
node tests/run.js

# retrain the model (about 4 minutes)
python tools/train.py --method mc --episodes 120 --steps 80 --load 0.7 --bias 2.0

# score the existing model without retraining
python tools/train.py --eval-only --load 0.7 --bias 2.0 --eval-seconds 360

# check the training environment on its own
node tools/env-server.js --selftest
```

---

## 5. Suggested demo order for round 2

1. **Open both windows side by side.** Street on the left, control room on the
   right. Say what each one is.
2. **Guided demo step 1.** Let it run for fifteen seconds. Point at average
   delay.
3. **Step 2.** The timing changes; the queues respond. Then `TEST THIS PLAN` —
   identical traffic, so the difference is the plan.
4. **Step 3.** Accident, then flood. Watch the spillback.
5. **Step 4 — the centrepiece.** Two ambulances. The **control room window**
   raises the alert before either arrives, with a countdown and two priced
   options. Choose one. The log records the decision, then the measured outcome
   next to the prediction.
6. **Step 5.** Hand control to the trained model. Say the number: 11.6% better
   than the fixed plan on held-out seeds.
7. **`node tests/run.js`** in a terminal. 21 passed.
8. **State the gaps** before you are asked: no route choice, no turning
   movements, no pedestrians, sensor feed mocked at one function, SUMO
   cross-validation still to do.

---

## 6. Commits in this session

| Commit | What |
| --- | --- |
| `5b248df` | Arbitration between competing priority requests |
| `603f3db` | Trained model: pipeline, training, browser inference |
| `f0390fb` | 21 assertions |
| `1e67ff2` | Control room console |
| `425e2dc` | Dispatch panel |
| `454f69e` | Guided demo strip |

---

## 7. What is still not done

- The console prices options from the junction's current state; it does not roll
  the whole network forward for each option. Stated on screen as a prediction.
- No route choice, turning movements or pedestrians.
- SUMO cross-validation. The physics is currently checked against Webster's
  closed-form uniform delay in `tests/run.js`.
- Real map import from OpenStreetMap.
- The docs in `docs/LOGIC.md` still quote a 5-second minimum green; it is now
  10 seconds, changed while measuring the switching-cost envelope.
