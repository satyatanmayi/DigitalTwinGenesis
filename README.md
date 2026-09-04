# Digital Twin Genesis

A browser-based digital twin of a signalised road network. Change the signal
timings and the traffic volume, watch queues and delay respond in real time, and
test whether your plan actually beats the algorithms on identical traffic.

Then break it on purpose — a collision, waterlogging, a demand surge, a signal
failure, a priority request — because that is the part no adaptive traffic
control system lets an operator rehearse.

No build step, no framework, no npm. Vanilla JavaScript plus p5.js from a CDN.

---

## Run it

1. Copy `config.example.js` to `config.js`.
2. Optionally paste a Gemini API key into it (<https://aistudio.google.com/apikey>).
3. Run `run.bat` and open <http://localhost:8000>, or open `index.html` directly.

**Without a key everything still works.** The AI controller falls back to a
local rule-based controller and labels those decisions `HEURISTIC`. The fixed
plan, Webster, Max-Pressure, all scenarios and all measurement are unaffected.

Any key in `config.js` is visible to anyone who opens the page, so use a
throwaway key. `config.js` is git-ignored.

---

## What you can do with it

### Tune the timings
Pick a junction (or all four), drag the north–south and east–west green sliders,
and watch the queue bars and the delay chart respond. The cycle length updates
as you drag.

### Find out whether your plan is any good
`TEST THIS PLAN` replays **identical traffic** — same seed, same arrivals — for
100 measured seconds at 8× speed, and records the average control delay and
throughput. Switch the controller to Max-Pressure or Gemini, test again, and the
results table shows whether the algorithms beat you. The best result is marked.

`APPLY WEBSTER OPTIMUM` computes the classical minimum-delay cycle from the
flows actually measured so far and writes it into the sliders, so there is a
sensible starting point rather than a blank slate.

### Break it
| Button | What happens |
| --- | --- |
| `ACCIDENT` | One approach at J2 cannot discharge. Watch the queue spill back |
| `FLOOD` | A link is waterlogged: speeds drop to 45% and buses and trucks are barred by weight restriction |
| `SURGE` | East–west arrivals jump to 2.6× — a stadium emptying |
| `SIGNAL FAIL` | J3 drops to a stuck 45 s / 45 s cycle. Watch the damage spread to its neighbours |
| `PRIORITY REQUEST` | A verified priority request arrives. The network decides whether to grant it |

### See what priority costs
When a corridor is granted, the ledger measures both sides live: the seconds the
priority vehicle saved against the delay ordinary vehicles took on the same
network in the same window, and the vehicle-seconds cross traffic paid for it.

When the network is already congested, the request is **refused**, with the
reason stated. That is the point — the tool shows why the network said no.

---

## What is real and what is mocked

**Mocked — `sensorFeed.js` only.** The sensor layer samples the running
simulation once a second and publishes a snapshot per junction in the shape a
roadside sensor gateway delivers:

```json
{ "junctionId": "J1", "queueLengths": {"N":3,"S":1,"E":6,"W":5},
  "avgSpeed": 18.4, "incidentFlag": false }
```

Going live replaces the body of one function, `sample()`. Nothing downstream
knows where the numbers came from.

**Real — everything else.**

- **Vehicle physics.** Gap-based car following under finite acceleration,
  calibrated at 4 px per metre from stated values: 40 km/h free flow, 1.5 m/s²
  acceleration, 3 m/s² braking, 2 m standstill gap, 2 s following headway, and
  2 s of start-up lost time at every green.
- **Heterogeneous traffic.** Two-wheelers, auto-rickshaws, cars, buses and
  trucks, each with its own length, PCU value, speed and weight class.
- **Signal state machines.** NS/EW phase pairs with yellow and all-red
  intervals, and minimum and maximum green enforced in the state machine itself,
  so no controller — including the AI — can produce an unsafe or starving
  signal.
- **Webster and Max-Pressure**, implemented as published, with their known
  limitations stated in `docs/LOGIC.md`.
- **Measurement.** Control delay, stopped delay, per-approach queues in vehicles
  and in PCU, throughput, and the priority ledger — all measured from vehicle
  state, none estimated.
- **Seeded demand**, so any two plans can be compared on exactly the same
  traffic.

Full specification, including every constant and every limitation:
[`docs/LOGIC.md`](docs/LOGIC.md). Positioning, prior art and the build plan:
[`docs/STRATEGY.md`](docs/STRATEGY.md).

---

## Architecture

The hard rule: **simulation state and rendering never mix.**

| File | Role | May draw? |
| --- | --- | --- |
| `sim.js` | World state, physics, signal state machines, statistics, the clock | No |
| `sensorFeed.js` | Mock sensor gateway | No |
| `controllers.js` | Webster, Max-Pressure | No |
| `scenarios.js` | Accident, flood, surge, failure, priority corridor, ledger | No |
| `bench.js` | Seeded plan evaluation, insight text | No |
| `agent.js` | Gemini decisions, heuristic fallback | No |
| `coordinator.js` | Corridor-level coordinator. Stub only | No |
| `render.js` | All p5.js drawing and all sidebar DOM | Yes — only this file |

Vehicle positions are plain `{x, y}` numbers in a fixed 1200 × 800 world space.
`sim.js` owns the `requestAnimationFrame` loop and calls subscribers registered
with `SIM.onTick(fn)`, so the renderer does not drive the simulation. **Swapping
the 2D view for Three.js touches `render.js` and nothing else.**

Every controller writes signals through one function, `SIM.applyAction()`. That
single-writer property is what makes the safety guarantees hold no matter what
any controller — including a language model — returns.

---

## Prior art, cited loudly

Adaptive signal control is deployed and works. Bengaluru runs **B-ATCS** on
**CoSiCoSt** (C-DAC), built for non-lane-based heterogeneous traffic, across
roughly 165 junctions, with about a 33% travel-time reduction reported at Hudson
Circle. SCATS, SCOOT, InSync and Surtrac occupy the same space internationally.
Emergency vehicle preemption is standardised as **NTCIP 1211**.

"AI times traffic signals better" is not a new claim. What these systems do not
give an operator is a preview before a decision, a stated reason for a decision,
a rehearsal of the abnormal day, or an account of what granting priority costs
everyone else. That is what this tool is for.

Sources are listed in [`docs/STRATEGY.md`](docs/STRATEGY.md).

---

## Where a Claude coordinator would sit

Four independent per-junction agents have the classic failure mode of
decentralised control: J1 clears its eastbound queue perfectly and dumps a
platoon into a red at J2. A Claude coordinator would sit above them on a slower
cadence — every 20 to 30 simulated seconds rather than every 5 — take all four
snapshots plus the recent decision log, reason about the corridor as a whole,
and emit *policy hints* rather than commands: a preferred phase bias and a green
offset per junction, so a platoon released at J1 meets green at J2. Each local
agent would receive its hint as one more prompt field and stay free to override
it for a local emergency. The fast loop stays responsive, the slow loop gets the
corridor view no single junction has, and there is still exactly one writer to
the signal state machine. `coordinator.js` carries this as a TODO; it is not
implemented.

---

## Not in this build

React, any build tool, SUMO/traci, route choice and origin–destination demand,
turning movements, pedestrians, and real-map import. The limitations are listed
in full in `docs/LOGIC.md` rather than left for someone to discover.
