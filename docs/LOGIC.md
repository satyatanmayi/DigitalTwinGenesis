# Simulation Model Specification

*What the simulator actually computes, in full, with every constant named and every assumption
stated. This is the document to answer a jury question from — "how does it work" and "why should I
believe it" are both answered here.*

Everything below describes the code as it stands in `sim.js`, `sensorFeed.js` and `agent.js`.
Where a value is not yet calibrated to the real world, it says so.

---

## 1. Structure of the model

Three layers, deliberately separated:

| Layer | File | Responsibility |
| --- | --- | --- |
| State and physics | `sim.js` | Where every vehicle is, what every signal is doing, what the statistics are. Owns the clock |
| Data | `sensorFeed.js` | Publishes a sensor-shaped snapshot of that state once per second |
| Control | `agent.js` | Reads snapshots, decides signal actions, applies them through one public function |
| View | `render.js` | Draws. Computes nothing |

The control layer can only change signals through `SIM.applyAction(junctionId, action)`. There is
no other write path into the signal state machine. That single-writer property is what makes the
safety guarantees in §4.3 hold no matter what the AI returns.

---

## 2. Geometry and coordinates

A fixed world coordinate space of **1200 × 800 world pixels**, independent of screen size. The
renderer scales it to whatever canvas it has; the physics never sees screen pixels.

| Element | Value |
| --- | --- |
| Vertical roads at x | 420, 780 |
| Horizontal roads at y | 280, 560 |
| Junctions | J1 (420, 280), J2 (780, 280), J3 (420, 560), J4 (780, 560) |
| Road width | 64 px |
| Lane centre offset from road centreline | ±16 px |
| Junction box half-width | 36 px |
| Vehicle length × width | 20 × 12 px |

**Lane assignment is right-hand traffic.** Eastbound vehicles run at `y = roadY + 16`, westbound at
`y = roadY − 16`, southbound at `x = roadX − 16`, northbound at `x = roadX + 16`.

Vehicles travel in a straight line from one edge of the world to the opposite edge and never turn.
Every conflict at a junction is therefore resolved by the signal alone, and no gridlock can arise
from turning conflicts. This is a simplification, and it is listed as such in §8.

### 2.1 Progress coordinate

Each vehicle carries a scalar `s`, its distance along its own direction of travel, defined as the
dot product of its position with its direction unit vector:

```
E: s =  x      W: s = −x      S: s =  y      N: s = −y
```

`s` always increases as a vehicle moves, whichever way it faces. Every comparison in the physics —
lead vehicle, stop line, junction centre — is a comparison of `s` values, so there is one code path
for all four directions rather than four special cases.

---

## 3. Vehicle physics

A gap-based car-following model. Each vehicle picks a target speed from the distance to whatever is
ahead of it, then moves toward that target under a finite acceleration limit.

### 3.1 The gap

```
gapLead    = s(lead) − s(self) − VEHICLE_LEN        (∞ if no vehicle ahead in this lane)
gapStop    = s(nearest stop line that is not green) − s(self)     (∞ if none)
gap        = min(gapLead, gapStop)
```

### 3.2 Target speed

```
target = MAX_SPEED × clamp( (gap − MIN_GAP) / (SAFE_GAP − MIN_GAP), 0, 1 )
```

Linear between a full stop at `MIN_GAP` and free flow at `SAFE_GAP`.

### 3.3 Speed update, per frame

```
if target > v:  v = min(target, v + ACCEL × dt)
else:           v = max(target, v − DECEL × dt)
v = max(v, 0)
s = s + v × dt
```

`dt` is the real elapsed frame time, clamped to a maximum of 0.05 s so that a browser tab returning
from the background cannot teleport a vehicle through a red light.

### 3.4 Constants

| Constant | Value | Meaning |
| --- | --- | --- |
| `MAX_SPEED` | 135 px/s | Free-flow speed |
| `ACCEL` | 95 px/s² | Acceleration limit |
| `DECEL` | 280 px/s² | Braking limit — deliberately harsher than acceleration |
| `MIN_GAP` | 10 px | Standstill bumper gap |
| `SAFE_GAP` | 110 px | Gap at which free flow resumes |
| `VEHICLE_LEN` | 20 px | Occupied length |
| `MAX_VEHICLES` | 40 | Population cap |

### 3.5 Stop-line rule

For each junction ahead on a vehicle's path, the stop line sits at `junctionCentre − 38 px` in the
direction of travel. The vehicle treats it as an obstacle unless the signal for its approach is
green. **Yellow is treated as red, except within 18 px of the stop line**, where the vehicle is
committed and clears the junction instead of stopping on it. This is the dilemma-zone rule, and
without it vehicles brake to a halt inside the junction box.

### 3.6 Departure

A vehicle is removed once it passes 80 px beyond any world edge. Its accumulated wait time is
added to the statistics at that moment, so every completed trip is counted exactly once.

---

## 4. Signal state machine

### 4.1 Phases

Opposing approaches run together as a **phase pair**: `NS` serves the north and south approaches,
`EW` serves east and west. Only one pair is served at a time, so conflicting movements are
impossible by construction rather than by rule-checking.

A signal has exactly two states within a phase — `green` and `yellow` — and the approaches not
served by the current phase read `red`.

```
signalFor(junction, direction):
    group = (direction is N or S) ? "NS" : "EW"
    if junction.phase ≠ group: return "red"
    return junction.state
```

### 4.2 Transitions

```
green,  timer runs out  ->  yellow, timer = YELLOW
yellow, timer runs out  ->  swap phase, state = green, timer = GREEN
```

| Timing constant | Value | Meaning |
| --- | --- | --- |
| `baseGreen` | 9 s | Green length under AI control before any extension |
| `fixedGreen` | 12 s | Green length in the fixed-timer baseline mode |
| `yellow` | 2.2 s | Yellow interval |
| `minGreen` | 5 s | A green is never cut shorter than this |
| `maxGreen` | 22 s | A green is never extended beyond this |
| `extendStep` | 4 s | Seconds added by one `extend_green_*` action |

### 4.3 Safety guarantees — these hold whatever the AI returns

1. **Minimum green.** `cutGreenShort()` never reduces the remaining green below what is needed to
   reach `minGreen` elapsed. A decision to switch immediately after a change is honoured only after
   5 s of green have been served.
2. **Maximum green.** Once `greenElapsed` reaches `maxGreen`, the timer is forced to zero
   regardless of any extension. A model that repeatedly says "extend" cannot starve the opposing
   phase.
3. **Yellow is never skipped.** Every phase change passes through the yellow interval. No action
   can shorten or bypass it.
4. **Single writer.** `applyAction` is the only function that touches signal timers from outside.

These are hard-coded rules, never learned. The reasoning is the same as Kalavathi's: a traffic
authority must be able to ask why something happened and get an answer that does not depend on a
model's weights.

### 4.4 Action semantics

| Action | Effect |
| --- | --- |
| `extend_green_NS` | If NS is the running green, add 4 s up to the `maxGreen` ceiling. If NS is not running, cut the current green short (subject to `minGreen`) so NS arrives sooner |
| `extend_green_EW` | Mirror image |
| `switch` | Cut the running green short, subject to `minGreen` |
| `hold` | No change |

In fixed-timer baseline mode `applyAction` returns without doing anything, so the baseline is
genuinely uncontrolled and the comparison is fair.

---

## 5. Demand generation

Eight spawn points — one per direction per road — at the world edges.

- Each spawn point draws its next headway uniformly from **1.1 to 4.2 seconds**, divided by the
  traffic-load multiplier the user sets (0.2× to 3×).
- A spawn is suppressed if a vehicle is within 70 px of the entry point, or if the population is
  already at `MAX_VEHICLES`. Suppressed arrivals are dropped, not queued.

**Consequence to state openly:** at 1.0× load the population saturates at the 40-vehicle cap, so
the cap, rather than the headway distribution, becomes the binding constraint on demand. Raising
`MAX_VEHICLES` is the first thing to change when studying oversaturated conditions.

---

## 6. Measurements

Every number the tool reports is measured from vehicle state. None is estimated or assumed.

| Quantity | Definition |
| --- | --- |
| **Queue length**, per approach | Count of vehicles within 190 px upstream of the stop line whose speed is below 28 px/s. The "N approach" holds vehicles waiting north of the junction and travelling south — the queue a driver on the north arm would see |
| **Longest wait**, per approach | Maximum accumulated wait among the vehicles in that queue zone |
| **Wait time**, per vehicle | Seconds accumulated while speed is below 5 px/s. This is stopped delay, not control delay — see §8 |
| **Throughput**, per junction | Vehicles whose progress coordinate has passed the junction centre, counted once each |
| **Processed** | Vehicles that have left the world |
| **Average wait** | Total accumulated wait of departed vehicles ÷ number of departed vehicles |
| **Average wait by mode** | The same, tracked separately for AI control and fixed-timer control, so the two can be compared |

---

## 7. Sensor layer and the control loop

### 7.1 Snapshot

`sensorFeed.js` samples state **once per simulated second** and publishes, per junction:

```json
{
  "junctionId": "J1",
  "ts": 120.0,
  "queueLengths":   { "N": 3, "S": 1, "E": 6, "W": 5 },
  "avgSpeed": 18.4,
  "incidentFlag": false,

  "longestWaitSec": { "N": 4, "S": 1, "E": 22, "W": 19 },
  "phase": "NS",
  "phaseState": "green",
  "greenElapsedSec": 6.2
}
```

The first four fields are what a real roadside sensor gateway delivers. The remaining three are
simulation-side context for the controller's prompt; in a live deployment they come from the
signal controller's own status feed, not from the sensors.

`avgSpeed` is reported in km/h using a scale factor of 0.45 km/h per world px/s.

**Replacing the mock with real sensors touches exactly one function** — `sample()`. Every consumer
downstream reads the same shape, so `sim.js`, `agent.js` and `render.js` do not change.

### 7.2 Control loop

Every **5 simulated seconds** each junction requests a decision. The four junctions are queried in
parallel, so a slow response at one junction never delays another.

The prompt carries: the junction's own queues and longest waits, its current phase, state and green
elapsed, the min and max green limits, the total queue pressure at each adjacent junction, and its
own last two decisions with their reasons. The last item exists to suppress flip-flopping — without
decision history, a controller that sees a balanced junction oscillates.

The response is constrained by a JSON response schema to `{ junctionId, action, reason }`, and the
action is validated against the allowed set before it is applied. The reason string is written onto
the junction and drawn beside it on the canvas.

### 7.3 Failure behaviour

| Situation | Behaviour |
| --- | --- |
| No API key configured | A local rule-based controller runs instead, labelled `HEURISTIC` in the log |
| Request times out (4.5 s) or errors | The signal keeps its previous state; the state machine carries on. The simulation never blocks on the network |
| Endpoint rejects the response schema (HTTP 400) | The schema is dropped and later calls go through on the prompt alone, with the same client-side validation |
| Invalid action string returned | Rejected, treated as a failure, previous state kept |

The heuristic fallback: serve any approach whose longest wait exceeds 25 s; otherwise serve
whichever phase pair has more than 2 vehicles more in queue than the other; otherwise hold.

---

## 8. Assumptions and limitations

Stated deliberately. Every one of these is a question a knowledgeable judge could ask, and the
answer is better given first.

**Calibration**

- The spatial scale is currently a **visual** scale, not a surveyed one. At the stated 0.125 m per
  px, junction spacing works out to about 45 m, which is short for an urban arterial where 200–500 m
  is typical. Calibrating properly means choosing 0.5 m per px — giving 180 m spacing — and
  simultaneously reducing `MAX_SPEED` to about 28 px/s (50 km/h), `ACCEL` to about 3 px/s²
  (1.5 m/s²), `DECEL` to about 6 px/s² (3 m/s²) and `VEHICLE_LEN` to about 9 px (4.5 m). Until that
  pass is done, absolute speeds and distances are illustrative and only the *relative* comparisons
  between control strategies are meaningful.
- There is no startup lost time at the beginning of green, so queues discharge slightly faster than
  a real one would.
- Saturation flow is an emergent property of the car-following parameters rather than a stated
  design value. It should be measured and reported against the usual 1800 PCU/hour/lane figure.

**Traffic composition**

- All vehicles are identical. Real Indian traffic is heterogeneous and non-lane-based:
  two-wheelers, auto-rickshaws, cars, buses and trucks with different footprints, acceleration and
  PCU values. Adding vehicle classes is the highest-value realism improvement available.
- No lane changing, no overtaking, no lateral movement within a lane.

**Network behaviour**

- Vehicles travel straight through and never turn, so there are no turning conflicts and no
  permitted-turn gap acceptance.
- No pedestrians, no pedestrian phases, no cyclists.
- Demand is generated by independent random headways per entry, not from an origin–destination
  matrix, so there is no route choice and no diversion. This is the main thing to change before the
  flooding and accident scenarios can be fully honest.

**Measurement**

- Reported wait is **stopped delay** — time below 5 px/s — not **control delay**, which also counts
  the deceleration and acceleration time attributable to the signal. Control delay is the measure
  the profession uses for level of service, and it is strictly larger. The current figure is
  therefore an underestimate.

**Comparison**

- The AI-versus-fixed comparison runs sequentially on independently generated random demand, not on
  the same random seed. Some of any observed difference is sampling noise. Same-seed replay is the
  fix and it is the first item in the build plan.

---

## 9. Observed behaviour

A headless run of the simulation with the local heuristic controller, driven at a fixed 20 ms step
for 120 simulated seconds:

| Measure | Value |
| --- | --- |
| Vehicles generated | 235 |
| Vehicles completed | 195 |
| Population at end | 40 (at cap) |
| Average wait per completed vehicle | 5.82 s |
| Control decisions applied | 40 |
| Per-junction throughput | 96 to 111 vehicles |

The behaviour is stable — queues form on the red approach, discharge as a wave when green begins,
and the phase pairs alternate without any junction being starved. Throughput within 8% across four
junctions under symmetric demand is the expected result and a useful sanity check.

Reproduce it by driving `SIM.onTick` from a fixed-step loop rather than `requestAnimationFrame`;
no rendering is required, because the simulation has no dependency on the renderer.

---

## 10. What to swap for a 3D view

`render.js` is the only file that draws. It reads `SIM.junctions`, `SIM.vehicles`,
`SIM.stats` and `AGENT.decisions` and writes nothing back except the user controls. A Three.js
renderer that reads the same four things is a complete replacement; no simulation file changes.
Vehicle positions are already plain `{x, y}` numbers in a fixed world space, which is why the swap
is a substitution rather than a rewrite.
