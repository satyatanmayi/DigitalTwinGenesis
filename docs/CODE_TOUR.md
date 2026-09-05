# Code Tour — so no file can be pointed at that you cannot explain

*Round 1 feedback was that the JavaScript was not understood. This document
fixes that. Read it once end to end, then read §7 twice — those are the
questions you will actually be asked.*

Total: about 4,500 lines across 17 files. No framework, no build step, no
dependencies except p5.js for drawing and NumPy for training.

---

## 1. The map

| File | Lines | What it does | Draws? |
| --- | --- | --- | --- |
| `sim.js` | 676 | The world. Vehicle physics, signal state machines, queues, statistics, the clock | No |
| `features.js` | 68 | The one definition of what the model sees | No |
| `sensorFeed.js` | 109 | Mock sensor gateway — the seam where real detectors plug in | No |
| `controllers.js` | 149 | Webster's formula and Max-Pressure | No |
| `priority.js` | 453 | Arbitration between competing emergency requests | No |
| `scenarios.js` | 150 | Accident, flood, surge, signal failure | No |
| `bench.js` | 155 | Seeded plan testing, the insight line | No |
| `nn.js` | 142 | The trained model, running in the browser | No |
| `agent.js` | 278 | Optional language-model controller | No |
| `link.js` | 80 | The wire between the two windows | No |
| `publish.js` | 163 | The street's side of that wire | No |
| `render.js` | 649 | **All drawing on the street** | Yes |
| `console.js` | 317 | **All drawing in the control room** | Yes |
| `coordinator.js` | 33 | Stub for a corridor-level coordinator | No |
| `tests/run.js` | 321 | 21 assertions | No |
| `tools/env-server.js` | 309 | Runs the sim headless for training | No |
| `tools/train.py` | 449 | The trainer, NumPy | No |

**The one rule to state out loud:** only `render.js` and `console.js` touch the
screen. Everything else is state and logic. That is why swapping the 2D view for
a 3D one changes one file.

---

## 2. How the whole thing fits together, in one paragraph

`sim.js` owns a `requestAnimationFrame` loop. Every frame it advances the world
by the elapsed time, then calls every function registered with `SIM.onTick()`.
`controllers.js`, `priority.js`, `nn.js`, `agent.js`, `bench.js` and
`publish.js` all register a tick listener — that is how they get their turn
without any of them knowing about each other. Any of them may call
`SIM.applyAction()`, which is the **only** way a signal can be changed, and the
safety limits sit inside it. `render.js` reads the resulting state and paints
it; it never writes anything except user input.

---

## 3. The JavaScript you are using, and what to call it

If a judge asks "explain this pattern", these are the names.

**The module pattern (an IIFE).** Every file looks like:

```js
const SIM = (function () {
  let vehicles = [];              // private — nothing outside can touch it
  function step(dt) { ... }       // private
  return { advance: step };       // the public surface
})();
```

An **Immediately Invoked Function Expression**: a function defined and called on
the spot. Everything inside is private; only what you `return` is visible. It is
how you get encapsulation without classes or modules, and it works from a
`file://` URL where ES modules do not.

**Closures.** `vehicles` above stays alive after the function returns, because
the returned functions still reference it. That is a closure. It is why the
state cannot be corrupted from outside.

**Getters.** In `sim.js` the exported object has `get junctions() { return junctions; }`.
Callers write `SIM.junctions` and get the live array, not a stale copy.

**Time-based physics.** Everything is `value += rate * dt`, never `value += rate`.
`dt` is the real seconds since the last frame, clamped to 50 ms. That is why the
simulation runs the same on a fast and a slow laptop.

**Array methods.** `filter`, `map`, `sort`, `reduce`, `indexOf`, `splice`. The
lead-vehicle search in `sim.js` sorts each lane by progress and looks one index
ahead — that is the whole car-following lookup.

**Promises and `async/await`.** `agent.js` uses `fetch(...).then(...)` with an
`AbortController` to time out a slow request. `nn.js` uses a promise to load
weights.

**`BroadcastChannel`.** In `link.js`: a browser API letting two tabs of the same
origin exchange messages with no server. `localStorage` plus the `storage` event
is the fallback when it is unavailable.

---

## 4. `sim.js` — the five functions that matter

Open the file and find these. They are the answer to almost every physics
question.

**`step(dt)`** — one tick of the world, in order: expire priority holds, update
signals, spawn arrivals, move vehicles, recount queues, sample the charts, then
call the tick listeners.

**`updateVehicles(dt)`** — buckets vehicles by lane, sorts each lane by progress,
and for each vehicle computes the gap to whatever is ahead — the vehicle in
front or a red stop line — then a target speed from that gap, then moves it
under acceleration and braking limits. This is the car-following model.

**`stopLineGap(v)`** — how far to the nearest stop line this vehicle must
respect. Green means no obstacle; yellow means stop unless already committed.

**`updateSignals(dt)`** — the finite state machine: green → yellow → all-red →
the other phase's green. Also where a priority hold freezes a phase and where
the post-hold recovery bias lives.

**`applyAction(junctionId, action)`** — the single writer. Every controller goes
through it. `cutGreenShort()` inside it refuses to go below minimum green, and
`updateSignals` refuses to go past maximum green. **This is the safety answer.**

---

## 5. `priority.js` — the four functions that matter

**`estimateSecondsSaved(route, axis)`** — for each junction on the route:
probability of arriving on red, times the average red wait, plus the time behind
the queue already there. Summed.

**`estimateCost(route, axis)`** — what the hold does to crossing traffic:
everything already queued waits the hold out, plus arrivals during it wait on
average half of it.

**`scoreOf(req)`** — the benefit-cost ratio, and it also builds the `workings`
string that gets printed on screen. If a judge asks "why did B beat A", this
function is the answer and its output is already visible.

**`decide(req)`** — the order matters and you should know it: give-up check,
feasibility, network budget, **conflict (queue, don't refuse)**, score
threshold, concurrency cap, then grant. Conflict is checked before the score
threshold on purpose — a request that loses a conflict waits, because the thing
it lost to will finish.

---

## 6. The model, end to end

**`features.js`** — 8 numbers per junction, all relative to the phase that is
green now: green queue, red queue, the difference, green wait, red wait, the
difference, green elapsed, and whether minimum green has been served. Loaded by
both the trainer and the browser so they cannot disagree.

**`tools/env-server.js`** — loads the real simulation files in Node's `vm`
module and speaks JSON lines on stdin/stdout. `{"cmd":"step","actions":[...]}`
in, `{"state":[...],"rewards":[...]}` out.

**`tools/train.py`** — `MLP.forward` is three matrix multiplies with ReLU in
between; `MLP.backward` is the chain rule written out. Two training methods:
`train()` is a bootstrapped DQN, `train_mc()` labels each decision with the
discounted reward that actually followed over the next 60 seconds and fits by
regression. **Monte-Carlo is the one that worked.**

**`nn.js`** — `predict(x)` is the same three matrix multiplies in JavaScript.
Every 5 seconds it scores hold against switch for each junction and takes the
better one, through `SIM.applyAction()` like everything else.

**Reward:** negative queue. Queue length integrated over time *is* total delay —
that is the definition, not an approximation, which is why the reward and the
metric are the same quantity.

---

## 7. The questions you will be asked, and where the answer lives

| Question | Answer | Where |
| --- | --- | --- |
| "Show me where a vehicle decides to slow down." | Gap to the thing ahead sets a target speed; acceleration is limited | `sim.js` → `updateVehicles` |
| "What stops the AI doing something dangerous?" | One writer, with minimum and maximum green enforced beneath it | `sim.js` → `applyAction`, `cutGreenShort`, `updateSignals` |
| "How do you know two runs are comparable?" | One seeded generator drives all arrivals; a reset with the same seed replays the same traffic | `sim.js` → `rng`, `reset`; proven in `tests/run.js` §1 |
| "Where does the model actually run?" | `predict()` — three matrix multiplies, no library | `nn.js` |
| "What is the model's input?" | 8 numbers per junction, defined once | `features.js` |
| "How was it trained?" | Monte-Carlo returns against the real simulator over a JSON protocol | `tools/train.py` → `train_mc`, `tools/env-server.js` |
| "Why did request B beat request A?" | The benefit-cost ratio, and the arithmetic is printed | `priority.js` → `scoreOf`, `.workings` |
| "How do the two windows talk?" | BroadcastChannel, with a localStorage fallback | `link.js` |
| "What does the control room actually send?" | Commands: setPlan, controller, grant, deny, scenario | `console.js` → the tool handlers, `publish.js` → `LINK.on` |
| "Is any of this tested?" | 21 assertions, run it in front of them | `node tests/run.js` |

---

## 8. If they ask you to change something live

Three safe live edits, all one line, all visible immediately:

1. **Make the yellow longer.** `sim.js`, `SIGNAL.yellow: 3.0` → `5.0`. Reload.
   Delay rises, because yellow is time that serves nobody. Good story.
2. **Change the vehicle mix.** `sim.js`, `VEHICLE_TYPES` — raise the bus share to
   0.30. Queues get longer in PCU terms immediately.
3. **Change the severity weighting.** `priority.js`, `POLICY.severityWeight` —
   make S3 equal to S1 and show that arbitration outcomes change. Then say the
   line: *the weights are a policy input, not an engineering result.*

Do **not** live-edit `updateVehicles` or `applyAction`. If asked to, say you
would rather walk through it than edit physics on stage — that is a reasonable
answer and it protects the demo.

---

## 9. Honest gaps, in your own words

- No route choice or turning movements — vehicles go straight through.
- No pedestrians.
- No lane changing; mixed traffic is approximated by PCU weighting.
- The sensor feed is mocked at one function, `sample()` in `sensorFeed.js`.
- The model is trained and validated only in this simulator; SUMO
  cross-validation is next, and the physics is currently checked against
  Webster's closed-form delay term in `tests/run.js`.
