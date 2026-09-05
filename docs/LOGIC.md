# Simulation Model Specification

*What the simulator actually computes, with every constant named and every
assumption stated. This is the document to answer a jury question from — "how
does it work" and "why should I believe it" are both answered here.*

Describes the code in `sim.js`, `sensorFeed.js`, `controllers.js`,
`scenarios.js`, `bench.js` and `agent.js`.

---

## 1. Structure

| Layer | File | Responsibility |
| --- | --- | --- |
| State and physics | `sim.js` | Vehicle motion, signal state machines, statistics. Owns the clock |
| Data | `sensorFeed.js` | Publishes a sensor-shaped snapshot once per simulated second |
| Classical control | `controllers.js` | Webster cycle computation, Max-Pressure control |
| Disruption | `scenarios.js` | Accident, flood, surge, signal failure, priority corridor and its ledger |
| Evaluation | `bench.js` | Seeded plan testing, plain-language insight |
| AI control | `agent.js` | Per-junction Gemini decisions, local heuristic fallback |
| View | `render.js` | Draws. Computes nothing |

Every controller — fixed plan, Webster, Max-Pressure, Gemini — writes signals
through **one** function, `SIM.applyAction()`. The safety guarantees in §4.3
therefore hold whatever any of them returns.

---

## 2. Calibration

**4 world pixels = 1 metre.** The world is 1200 × 800 px, so 300 m × 200 m.
Every physical constant is derived from a stated traffic-engineering value:

| Parameter | Real value | In model |
| --- | --- | --- |
| Free-flow speed | 40 km/h | 44.4 px/s |
| Acceleration | 1.5 m/s² | 6 px/s² |
| Braking | 3.0 m/s² | 12 px/s² |
| Standstill gap | 2.0 m | 8 px |
| Following headway | 2.0 s | `SAFE_GAP` = 89 px |
| Start-up lost time | 2.0 s | applied at the head of each queue |
| Saturation flow | 1800 PCU/h/lane | used by Webster |
| Queue detection zone | 60 m upstream | 240 px |
| Queued threshold | below 8 km/h | 8.9 px/s |

Junction spacing: 90 m between the vertical roads, 70 m between the horizontal
roads — a dense city-centre grid.

### 2.1 Geometry

Junctions J1 (top-left), J2 (top-right), J3 (bottom-left), J4 (bottom-right).
Right-hand traffic: eastbound at `roadY + 16`, westbound at `roadY − 16`,
southbound at `roadX − 16`, northbound at `roadX + 16`.

Each vehicle carries a scalar `s`, its distance along its own direction of
travel (`E: s = x`, `W: s = −x`, `S: s = y`, `N: s = −y`). `s` always increases
as the vehicle moves, so lead-vehicle and stop-line comparisons are one code
path for all four directions.

---

## 3. Vehicle mix

Heterogeneous, because Indian urban traffic is:

| Type | Share | Length | PCU | Weight class | Speed factor |
| --- | --- | --- | --- | --- | --- |
| Two-wheeler | 42% | 2.0 m | 0.25 | light | 1.05 |
| Auto-rickshaw | 16% | 2.8 m | 0.50 | light | 0.85 |
| Car | 30% | 4.5 m | 1.00 | light | 1.00 |
| Bus | 5% | 11.0 m | 3.00 | **heavy** | 0.80 |
| Truck | 7% | 8.0 m | 2.20 | **heavy** | 0.78 |

The weight class is what the flood scenario acts on: a waterlogged link bars
heavy vehicles. PCU is what Webster's flow ratios are computed in.

---

## 4. Physics

### 4.1 Car following

```
gapLead = s(lead) − s(self) − length(lead)        (∞ if nothing ahead)
gapStop = s(nearest non-green stop line) − s(self)  (∞ if none)
gap     = min(gapLead, gapStop)

target  = vmax × clamp((gap − MIN_GAP) / (SAFE_GAP − MIN_GAP), 0, 1)

if target > v:  v = min(target, v + ACCEL·dt)
else:           v = max(target, v − DECEL·dt)
s += v·dt
```

`vmax` is the vehicle type's own free-flow speed, reduced by a flood factor on
a waterlogged link and raised 15% for a priority vehicle.

`dt` is real frame time clamped to 50 ms, and a speed multiplier above 1×
sub-steps rather than taking one large step, so the physics stays stable when
the user fast-forwards.

### 4.2 Start-up lost time

A stopped vehicle at the head of a queue does not move for the first 2 seconds
of green. Without this, queues discharge unrealistically fast and every
computed capacity is optimistic.

### 4.3 Stop line and dilemma zone

The stop line is 38 px before the junction centre. Yellow is treated as red
**except** within 18 px of the stop line, where the vehicle is committed and
clears the junction rather than stopping inside it.

---

## 5. Signal control

### 5.1 Phase pairs

`NS` serves the north and south approaches; `EW` serves east and west. Only one
pair runs at a time, so conflicting movements are impossible by construction.
States within a phase: `green` → `yellow` → `allred` → other phase green.

| Constant | Value |
| --- | --- |
| Yellow | 3.0 s |
| All-red | 1.0 s |
| Minimum green | 10 s |
| Maximum green | 60 s |
| Default plan | 18 s NS / 18 s EW, giving a 40 s cycle |

### 5.2 The timing plan — the user's control

Each junction has a plan `{ greenNS, greenEW, offset }`. The sliders write into
it live; the running signal picks up the new duration at its next phase change.
This is the primary interaction the problem statement asks for.

### 5.3 Safety guarantees — true whatever any controller returns

1. **Minimum green.** A green is never cut below 10 s served.
2. **Maximum green.** Once 60 s of green have run, the timer is forced to zero.
   A controller that keeps saying "extend" cannot starve the opposing phase.
3. **Yellow and all-red are never skipped.** Every phase change passes through
   both intervals.
4. **Single writer.** `applyAction` is the only path into the signal timers.

Hard-coded rules, never learned. A traffic authority must be able to ask why
something happened and get an answer that does not depend on model weights.

### 5.4 Actions

| Action | Effect |
| --- | --- |
| `extend_green_NS` / `extend_green_EW` | Add 4 s to that phase, up to the ceiling; if that phase is not running, end the current green early |
| `switch` | End the running green now, subject to minimum green |
| `hold` | No change |

In fixed-plan mode `applyAction` does nothing, so the baseline is genuinely
uncontrolled and comparisons are fair.

---

## 6. Controllers

### 6.1 Fixed plan
Runs the user's greens. The baseline everything else is measured against.

### 6.2 Webster (1958)

```
L = 2·(yellow + all-red) + 2·start-up lost      = 12 s
y = critical flow ratio per phase = q(PCU/h) / 1800
Y = y(NS) + y(EW)
C = (1.5·L + 5) / (1 − Y)
green(phase) = (C − L) · y(phase) / Y
```

Flows are measured from actual arrivals at each approach since the run started.
The result is written into the plan, so the user can see, adjust and test it.

**Stated limitation:** Webster overestimates cycle length once the
volume-to-capacity ratio passes about 0.5, and it was derived for homogeneous
lane-disciplined traffic. Using PCU flows is the usual correction. Above
Y = 0.9 the formula diverges, so it is capped and reported as oversaturated —
no cycle length fixes a junction that is over capacity.

### 6.3 Max-Pressure

Pressure of a phase = total queued PCU on the approaches it serves. After
minimum green, if the other phase's pressure exceeds the running phase's by
more than 1.0 PCU, switch.

**Stated simplification:** the textbook formulation subtracts downstream queue
from upstream queue. Here vehicles leave at the network boundary, so the
downstream term is zero for edge movements; the upstream term is used alone.

Max-Pressure is the standard baseline in the RL signal-control literature —
learned methods in the RESCO benchmark beat it by roughly 11–13%, which makes
it a strong opponent, not a straw man.

### 6.4 Gemini AI

Every 5 simulated seconds each junction sends its own snapshot and receives
`{ junctionId, action, reason }` under a JSON response schema. The four
junctions are queried in parallel. The prompt carries the junction's queues and
longest waits, its phase state and green elapsed, the min/max green limits,
adjacent junctions' queue pressure, and its own last two decisions — the last
of these suppresses flip-flopping.

Failure behaviour:

| Situation | Behaviour |
| --- | --- |
| No API key | Local rule-based controller, labelled `HEURISTIC` |
| Timeout (4.5 s) or error | Signal keeps its previous state; the simulation never blocks |
| Schema rejected (HTTP 400) | Schema dropped, later calls run on the prompt with the same client-side validation |
| Invalid action returned | Rejected, previous state kept |

---

## 7. Measurement

| Quantity | Definition |
| --- | --- |
| **Control delay** (headline) | Actual travel time minus free-flow travel time for that vehicle's own top speed, accumulated on departure. The measure the profession uses for level of service |
| **Stopped delay** | Seconds accumulated below 1 px/s. Reported separately, always smaller |
| **Queue length** | Vehicles within 60 m upstream of the stop line moving below 8 km/h. "N approach" holds vehicles waiting north of the junction, travelling south |
| **Queue in PCU** | The same queue weighted by PCU — what Max-Pressure and Webster use |
| **Throughput** | Vehicles crossing a junction centre, counted once each; also reported network-wide per minute |
| **Cross-traffic cost** | Vehicle-seconds accumulated by queued vehicles on approaches *not* served, while a priority corridor holds |

Series for the charts are sampled once per simulated second and hold the last
180 samples.

---

## 8. Demand and determinism

Eight entry lanes, one per direction per road. Headways are drawn uniformly
from **4 to 12 seconds** and divided by the traffic-load multiplier, giving
about 450 veh/h per lane at 1.0× against roughly 670 veh/h of capacity under
the default plan — a volume-to-capacity ratio near 0.67. Busy but stable, with
the slider able to push it into oversaturation.

A spawn is suppressed if the entry is occupied or the 120-vehicle cap is
reached; suppressed arrivals are dropped, not queued.

**All randomness comes from one seeded generator.** Resetting with the same
seed replays exactly the same arrivals, which is what makes plan comparison
meaningful rather than noise. Verified: two runs from seed 12345 produce
identical spawn and completion counts.

### 8.1 Plan testing

`BENCH.run()` resets to the seed, applies the current plan and controller, runs
20 s of warm-up (discarded) plus 100 measured seconds at 8× speed, and records
average control delay, throughput, peak queue and completions. Results
accumulate in a table so the user can see their own tuning as a sequence of
attempts, and the best result is marked.

---

## 9. Scenarios

| Scenario | Model effect |
| --- | --- |
| **Accident** | One approach at one junction cannot discharge — its signal reads red regardless of phase. Queue spills back upstream |
| **Flood** | A link's speeds drop to 45% and heavy vehicles (bus, truck) are barred from it by weight restriction |
| **Surge** | Arrival rate on one axis multiplied by 2.6 |
| **Signal failure** | One junction forced to a 45 s / 45 s cycle, unresponsive |
| **Priority corridor** | Admission control, then a green hold on the requested phase across all junctions for 22 s, with a live cost ledger |

### 9.1 Priority admission control

A request is **refused** if a corridor is already running, or if the network
queue exceeds 34 vehicles — the stated delay budget. Refusals are logged with
the reason, which is the point: the tool shows *why* the network said no.

### 9.2 The ledger

- **Cost:** vehicle-seconds accumulated by cross-traffic queues while the hold
  is active. Measured directly.
- **Benefit:** the priority vehicle's own control delay, compared against the
  average control delay of ordinary vehicles that completed **during the same
  window** — same traffic, same conditions.

Measured example from a headless run: priority vehicle saved 2.9 s against the
6.3 s an ordinary vehicle was losing, and cross traffic paid 334
vehicle-seconds. Under light traffic the trade is poor, and the tool says so.
That honesty is the feature.

**What is deliberately not modelled:** whether the request is genuine.
Verification is a separate problem and out of scope here. This tool models what
the network does with a request once it believes it.

---

## 10. Assumptions and limitations

Stated first, so a judge does not have to find them.

**Network**
- Vehicles travel straight through and never turn. No turning conflicts, no
  gap acceptance, no permitted turns.
- Demand is independent random headways per entry, not an origin–destination
  matrix, so there is **no route choice**. In the flood scenario, barred heavy
  vehicles are removed from that entry rather than rerouted; the count is
  reported, not hidden.
- No pedestrians, no pedestrian phases, no cyclists.
- No lane changing or overtaking, and no lateral movement within a lane — real
  non-lane-based traffic does all three. PCU weighting is the standard
  approximation, not a substitute.

**Control**
- Offsets exist in the plan but only stagger the first cycle; full green-wave
  progression across the corridor is not yet implemented.
- Max-Pressure uses the upstream term only (§6.3).

**Measurement**
- Free-flow reference speed is per vehicle type and ignores the flood speed
  reduction, so delay on a flooded link includes the flooding itself.

**Comparison**
- Live mode switching compares cumulative averages across different periods.
  Use the plan test, which is seeded and warm-up-corrected, for any number that
  matters.

---

## 11. Reproducing the numbers

The simulation has no dependency on the renderer, so it runs headless. Drive
`SIM.onTick` from a fixed-step loop instead of `requestAnimationFrame` and read
`SIM.stats`. A 120-second run under the default plan at 1.0× load gives roughly
50 vehicles on the road, 16 queued, and 16.7 s average control delay; changing
the plan to 25 s NS / 8 s EW on the same seed raises delay to about 21 s, which
is the tool demonstrating its own premise.

---

## 12. Swapping to 3D

`render.js` is the only file that draws. It reads `SIM.junctions`,
`SIM.vehicles`, `SIM.series`, `SCENARIOS` state and `AGENT.decisions`, and
writes nothing back except user controls. A Three.js renderer reading the same
data is a complete replacement; no simulation file changes.
