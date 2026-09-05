# Design Specification — Digital Twin of a Traffic Intersection

*The approved design. Hand this file back to me and I build from it. Research
backing every claim is in [`RESEARCH.md`](RESEARCH.md); the model as currently
implemented is in [`LOGIC.md`](LOGIC.md).*

Status: approved 2026-09-05. Supersedes the roadmap section of
[`STRATEGY.md`](STRATEGY.md).

---

## 1. What we are building, in one paragraph

A browser-based digital twin of a signalised road network that a **traffic
planner** uses to find better signal timings, and a **control room operator**
uses to survive the abnormal day. The planner tunes green times against a stated
target and tests every attempt on identical replayed traffic, racing the
classical algorithms. The operator watches the same network under a collision,
waterlogging, a demand surge, a signal failure, or competing emergency priority
requests — and sees, at the moment of each decision, what it costs.

**The positioning sentence:** *Adaptive traffic control optimises the average
day. We simulate the bad day — and give the operator a preview, a reason, and a
receipt.*

---

## 2. What the hackathon asks, and where each requirement is met

| Requirement in the problem statement | Where it is met |
| --- | --- |
| A virtual model of a road intersection | PLAN mode opens in single-junction focus: one intersection, four approaches, drawn large (§3) |
| Users can change signal timings | Per-approach green sliders, live, no restart (§4) |
| Users can change vehicle inflow | Traffic load slider, 0.2×–3× (§4) |
| Watch congestion form or clear | Canvas queues, per-approach bars, delay and queue time-series (§4, §7) |
| Watch queue lengths and waiting times respond in real time | Live per-approach queues; control delay as the headline metric (§7) |
| Help users find timings that reduce waiting | The tuning loop with objectives, seeded testing, and algorithmic opponents (§4) |
| Believable traffic behaviour | Calibrated car-following, five vehicle classes with PCU, start-up lost time (already implemented, `LOGIC.md`) |
| Quality of visualisation and insight | Focus mode, charts, insight line, cost ledger, twin-sync panel (§3, §7, §8) |

**Non-negotiable:** every one of these must work before anything in §10 is
started. If the clock kills the roadmap, the submission is still complete.

---

## 3. Product shape — two modes

One application, two named modes, switched in the header. The same simulation
underneath; each mode is a framing of it. The mode names are also the pitch
structure: *the planner finds the timing, the operator survives the day.*

### 3.1 PLAN mode — the planner's workbench

Opens in **single-junction focus**: one intersection drawn large, all four
approaches labelled N / S / E / W with live queue counts, large signal heads, and
every control aimed at that junction. A `NETWORK` toggle zooms out to all four
junctions when the user wants to see spillback between them.

Contains: objective card, timing sliders, test button, results table,
algorithmic opponents, insight line, revert-to-best.

### 3.2 OPERATE mode — the control room

Network view by default. Contains: incident controls, incoming priority request
queue with arbitration decisions, cost ledger, event and decision log with the
AI reasoning drawn beside each junction, twin-sync panel.

### 3.3 Objectives

Every scenario preset carries a stated goal and a number, shown as a card in
PLAN mode: target, current best, gap.

| Preset | Objective |
| --- | --- |
| Morning peak | Average control delay below 20 s |
| Evening peak (E–W dominant) | Average control delay below 25 s |
| Off-peak | Average control delay below 12 s |
| Monsoon (flood on one link) | Keep average control delay below 35 s with the link degraded |
| Accident at J2 | Clear the blocked-approach backlog within 4 minutes of the block clearing |

Meeting an objective is a visible event, not a feeling. Targets are calibrated
against HCM level of service (LOS C is 20–35 s of control delay), so the numbers
mean something outside our own tool.

---

## 4. The tuning loop — the centrepiece

This is what the second judging criterion asks for, so it gets the most design
attention.

**The loop as the user experiences it:**

1. **See the target.** Objective card: *Target 15.0 s · your best 21.4 s · gap 6.4 s*.
2. **Change something.** Drag a green slider; the canvas responds immediately.
   This builds intuition; it is not the measurement.
3. **Test it.** One button. Identical seeded traffic, 20 s warm-up discarded,
   100 s measured, run at 8× — about 12 seconds of real time.
4. **Be told what to try next.** After every test the insight line names the
   binding constraint and the specific change: *"E–W is the critical phase at
   v/c 0.91. Its green is 18 s. Try 24 s."* It reads the same numbers the
   algorithms read; it is not a scripted hint.
5. **Compare.** Results table with the best row marked. Selecting two rows shows
   the delta and which approach the time came from.
6. **Race the algorithms.** `BEAT WEBSTER` and `BEAT MAX-PRESSURE` each run that
   controller on the same seed and insert it into the table as a reference row
   the user must beat. If the user loses, the table says so.
7. **Keep the win.** `REVERT TO BEST` restores the best-scoring plan, so
   experimenting is never punished.

**Why it is honest:** the seed makes rows comparable, the warm-up discard
removes the network-filling artefact, and the opponents are published methods.
A judge can point at any row and ask "how do you know?" and get the same
sentence every time.

**Acceptance criteria**
- Two tests of the same plan on the same seed produce the same score.
- A deliberately bad plan (for example 25 s / 8 s under balanced demand) scores
  measurably worse than a balanced one.
- Webster and Max-Pressure rows appear in the table with the controller named.
- The insight line names a junction, a number, and a specific action.

---

## 5. Multi-request priority arbitration — the Kalavathi bridge

The highest-ranked roadmap item, because it deepens the unique selling point and
builds the network-side half that Kalavathi eventually needs.

### 5.1 The request object

```js
{
  id: "REQ-014",
  severityClass: "S1" | "S2" | "S3",       // S1 most severe
  verificationStatus: "verified" | "unverified",
  route: ["J1", "J2"],                      // junctions to be held
  axis: "NS" | "EW",
  requestedAt: <sim seconds>,
  etaSec: <estimate to first junction>
}
```

`severityClass` and `verificationStatus` are **inputs**. Where they come from is
out of scope, and the panel says so on screen:

> *Verification source: external. Out of scope for this tool.*

That one line is what lets us demonstrate the whole network-side mechanism
without disclosing anything protected (§12).

### 5.2 Ranking — a live benefit-cost ratio, not a fixed class

Existing priority systems assign a **class** in advance — ambulance outranks
bus outranks car — and serve the highest class present. That is what NTCIP 1211
standardises, and it is adequate when a city has around fifty authorised
vehicles and conflicts are rare.

This system scores each request **live, from what the grant is actually worth
against what it will cost**, which means the same vehicle can be granted at
15:00 and refused at 18:00, with the reason stated either way.

**Inputs supplied from outside, never inferred here:**

| Input | Source | Note |
| --- | --- | --- |
| Severity class (S1 / S2 / S3) | Hospital or dispatcher | Medical judgment stays medical. Nothing in this system infers severity from symptoms or vitals |
| Verification status | External | Out of scope for this tool |
| Vehicle type | The request | Ambulance, fire, police, transit |
| Persons on board | The request | A bus carrying forty people is not one vehicle |

**Values computed here — the actual work:**

| Metric | How it is obtained |
| --- | --- |
| Predicted seconds saved | Run the twin forward under both futures — granted and not granted — and take the difference for that vehicle |
| Predicted cost to others | The same two runs: vehicle-seconds added to cross traffic |
| Time already lost | Seconds since the request was raised. The ageing term |
| Feasibility | Whether the phase can still be held in time given minimum green. A grant that lands late is pure cost |
| Conflict depth | Junctions shared with a corridor already running |

**The score:**

```
        severity × persons × predicted_seconds_saved  +  ageing_bonus
score = ─────────────────────────────────────────────────────────────
             predicted_cross_traffic_cost  +  conflict_penalty
```

Measured in **person-seconds** on both sides, which is standard transportation
practice and is what allows a full bus to legitimately outrank a car.

A request is granted only if the score clears a threshold, the network delay
budget allows it, and it is still feasible. Otherwise it is queued or refused,
with the reason named. The **arithmetic is printed beside the decision**, so an
operator can audit it and a judge can ask why request B beat request A and
receive numbers rather than a shrug.

The ageing term is the same guard as maximum green: a request that keeps losing
climbs until it wins, so nothing starves indefinitely.

### 5.3 Arbitration, including conflict

- **Grant** if admission control passes and no higher-scoring request needs a
  conflicting phase at a shared junction.
- **Queue** if a higher-scoring request holds a junction on the route. The
  queued request states what it is waiting on and is re-evaluated each cycle —
  never silently dropped.
- **Refuse** if a budget is exceeded, naming the budget: concurrent-corridor
  cap, or network queue above the delay budget.

The conflict case — two requests whose routes cross at one junction needing
opposite phases — is the demonstration centrepiece. NTCIP 1211 defines a
priority request server that triages multiple requests, so this is a faithful
implementation of a standard concept, not an invention; the addition is that the
triage is *visible and priced*.

### 5.4 Recovery after a hold

When a hold ends the junction returns to its plan with a temporary bias toward
the phase that was starved. The preemption literature is explicit that the exit
strategy determines how much arterial coordination the corridor destroys, so
recovering deliberately is a defensible detail rather than a flourish.

### 5.5 The ledger

Per request and cumulative for the session:
- seconds saved by the priority vehicle, measured against the average control
  delay of ordinary vehicles completing in the **same window**;
- vehicle-seconds paid by cross traffic while the hold was active;
- outcome and reason.

**Acceptance criteria**
- Three requests arriving within 10 s produce three distinct, reasoned outcomes.
- A conflict resolves in favour of the higher score, and the loser shows what it
  is waiting on.
- The ledger reports both sides for every granted request.
- Under light traffic the ledger may show priority as a bad trade. That result
  is displayed, not suppressed.

---

## 6. Green-wave offsets

Currently `offset` exists in the plan but only nudges the first cycle.

**Fix:** anchor every junction's cycle to a global clock, so junction *k* begins
its NS green at `(t + offset_k) mod cycle`.

**Add:** an `AUTO GREEN WAVE` button computing `offset = distance / progression
speed` along a chosen corridor — the textbook calculation, with progression
speed exposed as a control.

**Demonstration payoff:** with the wave on, platoons run junction to junction
without stopping; with it off, they stop at every one. If time allows, a
**time–space diagram** showing the green band is the chart traffic engineers
actually use and signals domain literacy immediately.

**Acceptance criteria**
- With coordination on, corridor travel time measurably drops on the same seed.
- Offsets are visible and editable per junction.

---

## 7. Measurement and visualisation

Already implemented and retained: control delay as the headline metric, stopped
delay reported separately, per-approach queues in vehicles and PCU, throughput,
per-second series for the delay and queue charts.

**Added:**
- **Per-approach delay**, not just per-approach queue, so the user can see which
  movement is paying.
- **Level-of-service badge** beside the headline number (A–F from the HCM
  thresholds), so the metric means something outside this tool.
- **Cumulative arrival/departure curves** for the focused junction if time
  allows — the area between the curves *is* total delay, which is the most
  visually unarguable way to show it.

**Design rules, inherited and non-negotiable:** colour never carries meaning
alone — every state has a colour *and* a word; nothing below 16 px anywhere;
high contrast for a poor projector; one screen per mode, no tabs, no scrolling
for the primary view.

---

## 8. Twin fidelity — saying exactly what we are

The literature defines a digital twin by bidirectional synchronisation with a
real counterpart. We are partial, and we say so on screen rather than being
caught. A **TWIN SYNC** panel states:

| Field | Value shown |
| --- | --- |
| Network source | `Synthetic grid` or `OSM: <road names>, <city>` |
| Data feed | `Mock sensor gateway, 1 Hz` — with the swap point named |
| Last sync | Simulated clock time of the last snapshot |
| Control path | `Simulation only — NTCIP 1211 adapter not connected` |
| Calibration | Saturation flow, free-flow speed, PCU set, and whether these are defaults or fitted |

This pre-empts the sharpest question — *is this a twin or just a simulator?* — by
answering it before it is asked.

**OSM import, honestly scoped.** Query the Overpass API for a bounding box, take
nodes tagged `highway=traffic_signals` and the ways joining them, and map the
four nearest signalised junctions onto our grid using **real spacing and real
road names**. The topology stays a simplified 2×2, and the panel says *"real
geometry and spacing, simplified topology"*.

Two safeguards: preset bounding boxes for a few Indian cities so nobody types
coordinates on stage, and the fetched network cached to a JSON file in the repo
so the demo survives dead venue wifi.

---

## 9. Usability — the tool must be operable by someone who has never seen it

- **First-run coach:** three dismissible steps — *here is the target · drag this
  · press test*. Shown once, skippable, reopenable from a `?` button.
- **Plain language everywhere.** No jargon without a gloss: "v/c 0.91" always
  appears as "v/c 0.91 — demand is 91% of capacity".
- **Presets over parameters.** Named starting points (Morning peak, Evening
  peak, Off-peak, Monsoon) so nobody faces a wall of sliders cold.
- **Nothing hidden behind a menu.** One screen per mode.
- **Every destructive-feeling action is reversible.** `REVERT TO BEST` and
  `REPLAY SAME TRAFFIC` mean experimenting costs nothing.

---

## 10. Module structure

`render.js` is doing two jobs and splits. Only `render.js` and `ui.js` touch the
screen; nothing else does.

| File | Status | Role |
| --- | --- | --- |
| `sim.js` | modify | Global-clock offsets, recovery bias after a hold, per-approach delay |
| `sensorFeed.js` | keep | Mock sensor gateway — the documented swap seam |
| `controllers.js` | modify | Webster, Max-Pressure, plus green-wave offset calculation |
| `priority.js` | **new** | Request objects, ranking, conflict arbitration, queueing, ledger — moved out of `scenarios.js` |
| `scenarios.js` | modify | Disruptions and objective definitions only |
| `twin.js` | **new** | Network source, sync status, calibration record |
| `osm.js` | **new** | Overpass fetch, cache to JSON, map onto the grid |
| `bench.js` | modify | Opponent runs, row-to-row comparison, revert-to-best |
| `agent.js` | keep | Gemini decisions, heuristic fallback |
| `coordinator.js` | keep | Stub |
| `render.js` | modify | Canvas drawing only |
| `ui.js` | **new** | All DOM: panels, controls, charts, coach |
| `tools/` (Python) | **new, later** | Offline only: SUMO validation, RL training, QUBO, Overpass fetch |

**The single-writer rule stands:** every controller — fixed plan, Webster,
Max-Pressure, Gemini, priority holds — writes signals through
`SIM.applyAction()`. Minimum green, maximum green, yellow and all-red are
enforced below that function and are never learned.

---

## 11. Testing

The headless harness becomes `tests/run.js` with real assertions, no
dependencies, run with `node tests/run.js`:

1. **Determinism** — two runs from the same seed produce identical spawn and
   completion counts.
2. **Capacity sanity** — the network is stable at 1.0× load and oversaturates at
   3×.
3. **Tuning works** — a skewed plan scores worse than a balanced one on
   identical traffic.
4. **Safety invariants** — no green shorter than the minimum, none longer than
   the maximum, and yellow is never skipped, under every controller including a
   deliberately hostile mocked AI response.
5. **Arbitration** — the higher-scoring request wins a conflict; the loser is
   queued with a reason; a request over budget is refused.
6. **Coordination** — green-wave offsets reduce corridor travel time on the same
   seed.

This is also the answer when a judge asks whether any of it is verified.

---

## 12. Disclosure boundary

A related project has a patent filing pending, and public disclosure before
filing can destroy novelty in India. A hackathon presentation and a public
repository are both public disclosure.

**Show and say freely:** this simulator, its algorithms, its measurements, the
scenarios, priority arbitration, admission control, the cost ledger, and all the
prior art in `RESEARCH.md`.

**Do not describe:** the dashboard device, the secure element, the hardware
usage counter, or a priority request carrying its own attested usage record.

**If asked where verified requests come from:** *"They arrive from an external
verified source. Verification is separate work and out of scope for this tool.
What we solve here is what the network does with a request once it believes
it — whether to grant it, and what granting it costs everyone else."*

---

## 13. Build order

Phase 0 is the submission. Everything after it is upside, and each phase lands
as its own commit so the project is always in a shippable state.

| Phase | Contents | Gate |
| --- | --- | --- |
| **0. Baseline** | Already built: timing sliders, seeded testing, vehicle classes, charts, scenarios, ledger, docs | Verified in a browser |
| **1. Modes and focus** | PLAN / OPERATE split, single-junction focus view, objective cards, `ui.js` extraction | Ideation review |
| **2. Tuning loop completion** | Opponent buttons, row comparison, revert-to-best, LOS badge, first-run coach | — |
| **3. Priority arbitration** | `priority.js`: multi-request ranking, conflict, queueing, recovery, per-request ledger | — |
| **4. Coordination** | Global-clock offsets, auto green wave, time–space diagram if time | — |
| **5. Real map** | `osm.js` + `twin.js`: Overpass import, cached networks, twin-sync panel | — |
| **6. Validation** | `tools/` SUMO cross-check, validation report committed | — |
| **7. Depth** | QUBO panel, then RL policy | Only if Phases 0–5 are done |
| **8. Extras** | CSV/PDF export of the comparison table | — |
| **Parked** | Three.js 3D view; policy-sandbox framing (Approach C) | Decide after Phase 5 |

**Cut order if behind:** 8 → 7 → 6 → 5 → 4. Never cut 1, 2 or 3.

---

## 14. Explicitly out of scope

React or any framework, any build step, a backend, a database, user accounts,
SUMO at runtime, route choice and origin–destination demand, turning movements,
pedestrians, lane changing, and the emergency-vehicle green corridor as a
*verification* feature. The limitations are listed in full in
[`LOGIC.md`](LOGIC.md) rather than left to be discovered.
