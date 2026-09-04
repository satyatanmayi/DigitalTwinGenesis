# Jury Brief — what to say, what to show, what to hold back

*Read this before the jury arrives. Everything here is true of the code as it
stands, so nothing in it can be contradicted by a judge who opens the repo.*

---

## 1. What you are trying to do — say this first, in these words

> "Badly timed signals cause congestion, but a traffic control room has no safe
> way to try a timing before putting it on the street. We built a digital twin
> of a four-junction network where you change the signal timings and the traffic
> volume and watch queues and waiting time respond immediately — and then test
> whether your plan actually beats the standard algorithms on identical traffic.
>
> The second half is what makes it more than a sandbox: it also simulates the
> bad day. A collision blocking an approach, waterlogging that bars heavy
> vehicles, a demand surge, a signal failure, an emergency priority request.
> Those are exactly the situations that fall out of an automatic system and get
> handled manually over radio — and they are the situations nobody can rehearse."

**Never open with technology.** No "we used Gemini", no "p5.js", no "our
architecture" until they have heard the problem. If a judge hears a library name
before they hear "congestion", the pitch has already lost altitude.

One-line version if they are in a hurry:
> "Adaptive traffic control optimises the average day. We simulate the bad day —
> and give the operator a preview, a reason, and a receipt."

---

## 2. The demo, in order — 5 minutes

Have the page already open and running before they arrive. Traffic load 1.0×,
fixed plan, nothing broken yet.

| # | Time | Do this | Say this |
| --- | --- | --- | --- |
| 0 | 0:30 | Nothing. Let it run | The problem, in the words above. Point at queues forming and clearing |
| 1 | 0:30 | Point at the HUD | "Average delay per vehicle is the number we are trying to reduce. Everything else supports it" |
| 2 | 0:45 | Junction = ALL. Drag **E–W GREEN** from 18 to 30 | "That is the whole product in one gesture. East–west drains, north–south starts backing up, and the delay number moves within seconds" |
| 3 | 0:60 | Click **TEST THIS PLAN**. Wait ~12 s. Change greens, test again | "Both tests replay identical traffic — same random seed, same arrivals. So the difference is the plan, not luck. The table keeps every attempt and marks the best" |
| 4 | 0:30 | Click **APPLY WEBSTER OPTIMUM**, then test | "That is Webster's 1958 minimum-delay cycle, computed from the flows we actually measured. It is what a traffic engineer would do by hand" |
| 5 | 0:30 | Switch to **MAX-PRESSURE**, test | "Max-Pressure is the standard baseline in the research literature — provably throughput-maximising, no training needed. Now the user finds out whether their hand-tuned plan beat it" |
| 6 | 0:30 | Click **ACCIDENT** | "One approach cannot discharge. Watch the queue spill back upstream, and the insight line names the junction and tells you what to do about it" |
| 7 | 0:20 | Click **FLOOD** | "Waterlogged link: speeds drop and buses and trucks are barred by weight restriction. That is why we model five vehicle types, not one" |
| 8 | 0:45 | Click **PRIORITY REQUEST**, watch the ledger. Then **SURGE**, request again | "Granted: the vehicle saved this many seconds, and cross traffic paid this many vehicle-seconds for it. Now the network is congested — the same request is refused, with the reason stated. No existing system shows an operator that trade at the moment of the decision" |
| 9 | 0:20 | Stop and say the limits | Section 6 below |

**If the wifi is dead:** everything above still works. Only the Gemini
controller needs the network, and it falls back to a local rule-based controller
automatically. Say so rather than hiding it.

---

## 3. The features, explained

| Feature | What it is | Why it is there |
| --- | --- | --- |
| Green sliders per junction (or all) | Live edit of north–south and east–west green; the running signal picks up the change at its next phase change | The literal deliverable in the problem statement |
| Traffic load slider | Scales arrival rate 0.2× to 3× | The second deliverable: change vehicle inflow |
| Delay and queue charts | Per-second series, last 180 seconds | Congestion forming and clearing is a shape over time; one number cannot show it |
| Per-approach queue bars | Vehicles queued on N, S, E, W at each junction | Where the pain is, not just how much |
| Test-this-plan | Seeded replay, 20 s warm-up discarded, 100 s measured, at 8× speed | Answers "can users actually find better timings" with evidence rather than feel |
| Results table | Every attempt, its delay and throughput, best marked | Improvement is a sequence, not a feeling |
| Webster button | Classical minimum-delay cycle from measured flows | Gives a sensible starting plan and shows traffic-engineering literacy |
| Max-Pressure controller | Serves the phase with greatest queued PCU | A strong, citable opponent for the user and for the AI |
| Gemini controller | Per-junction decision every 5 s with a one-sentence reason shown on the canvas | Explainability — the documented number-one barrier to deploying learned control |
| Insight line | One sentence, always visible, naming the number that drives the current state | The difference between a dashboard and a tool |
| Scenarios | Accident, flood, surge, signal failure | The bad day, which is the unique selling point |
| Priority corridor + ledger | Admission control, green hold, and both sides of the cost measured live | Nobody shows the operator what priority costs |

---

## 4. Tech stack and logic — the part they will dig into

### 4.1 Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Vanilla JavaScript (ES6), no framework | Opens by double-clicking a file. No build step to fail on demo morning |
| Rendering | p5.js 1.9.4 from CDN, plus the raw Canvas 2D API for the charts | One dependency, loaded from a script tag |
| AI layer | Google Gemini (`gemini-2.0-flash`) called with `fetch`, structured JSON output via `responseSchema` | Optional. The tool is fully functional without it |
| Serving | `python -m http.server` via `run.bat` | Avoids `file://` restrictions on `fetch` |
| Testing | Node's `vm` module driving the simulation headless at a fixed time step | The simulation has no dependency on the renderer, so it can be tested without a browser |
| Version control | Git | — |

**No React, no bundler, no npm, no backend, no database.** That is a deliberate
engineering decision, not a shortcut: the whole tool is eight files a judge can
read.

### 4.2 Architecture — the one rule

Simulation state and rendering never mix.

```
sim.js          world state, physics, signal state machines, statistics, the clock
sensorFeed.js   mock sensor gateway — the seam where real sensors plug in
controllers.js  Webster, Max-Pressure
scenarios.js    accident, flood, surge, failure, priority corridor + ledger
bench.js        seeded plan evaluation, insight text
agent.js        Gemini decisions + local heuristic fallback
coordinator.js  stub for a corridor-level coordinator (not implemented)
render.js       THE ONLY FILE THAT DRAWS
```

Two properties worth stating out loud, because they are the engineering answer
to two obvious jury questions:

- **"Can this become 3D?"** Vehicle positions are plain `{x, y}` numbers in a
  fixed world coordinate space, and `render.js` is the only file that draws.
  A Three.js renderer reading the same data replaces it. Nothing else changes.
- **"How do I know the AI can't do something dangerous?"** Every controller —
  fixed plan, Webster, Max-Pressure, Gemini — writes signals through exactly one
  function, `SIM.applyAction()`. Minimum green, maximum green, yellow and all-red
  are enforced inside the state machine, below that function. They are
  hard-coded rules that are never learned, so no model output can produce an
  unsafe or starving signal.

### 4.3 The logic, in CS terms they will recognise

This framing lands well with a computer-science jury, and it is accurate.

**The junction is a scheduler. The approaches are the processes. Green time is
the CPU.**

| Traffic concept | Scheduling equivalent | In the code |
| --- | --- | --- |
| Fixed-time plan | Round-robin with a fixed quantum | `greenNS` / `greenEW` from the plan |
| Yellow + all-red | Context-switch cost — real time that serves nobody | 3 s + 1 s, unskippable |
| Minimum green | Minimum quantum, so switching overhead cannot dominate | 5 s |
| Maximum green | **Starvation prevention / aging** — no approach waits forever | 60 s hard ceiling |
| Max-Pressure | Greedy priority scheduling by queue weight | Serve the phase with the most queued PCU |
| Gemini controller | Advisory scheduler that proposes, within hard bounds | Returns extend / switch / hold |
| Priority corridor | **Preemption** — a high-priority job seizes the resource | Green hold across the route |
| Admission control | Preventing a preemption storm; refuse when the system cannot afford it | Refused above the queue budget |
| The ledger | Accounting for the cost preemption imposes on everyone else | Cross-traffic vehicle-seconds |
| Single-writer `applyAction` | One critical section, so no conflicting writes | Enforced by design |

If a judge asks "is this just an animation?", that table is the answer: it is a
scheduler under safety constraints, with the physics chosen so that the schedule
has visible consequences.

### 4.4 The algorithms, named

1. **Car-following (gap-based, Newell-style).** Each vehicle picks a target
   speed from the distance to whatever is ahead — the lead vehicle or a red stop
   line — and moves toward it under finite acceleration and braking limits. That
   is what produces queues that form, discharge as a wave, and spill back.
   Constants are calibrated: 4 px per metre, 40 km/h free flow, 1.5 m/s²
   acceleration, 3 m/s² braking, 2 m standstill gap, 2 s following headway.

2. **Start-up lost time.** The head of a stopped queue does not move for 2
   seconds after green. Without it, capacity is overstated.

3. **Finite state machine per junction.** Phase pairs `NS` and `EW`, states
   green → yellow → all-red → opposite green. Opposing approaches move together,
   so conflicting movements are impossible by construction rather than by
   checking.

4. **Webster (1958).** `C = (1.5L + 5) / (1 − Y)` where `L` is lost time per
   cycle and `Y` the sum of critical flow ratios `q/s`. Effective green is split
   in proportion to those ratios. Flows are measured in PCU from actual
   arrivals. Known limitation stated: it overestimates the cycle above a
   volume-to-capacity ratio of about 0.5, and it assumes lane-disciplined
   homogeneous traffic.

5. **Max-Pressure.** Phase pressure = queued PCU on the approaches it serves;
   switch when the other phase leads by more than a margin. Stated
   simplification: the textbook version subtracts downstream queue, which is
   zero at our network boundary, so the upstream term is used alone.

6. **LLM decision agent.** Every 5 simulated seconds each junction sends its own
   snapshot; the response is constrained by a JSON schema to
   `{ junctionId, action, reason }`, validated against an allow-list of four
   actions, and applied through the same single writer. Four junctions are
   queried in parallel. On timeout, error or an invalid action, the signal keeps
   its previous state and the simulation carries on — it never blocks on the
   network.

7. **Heterogeneous traffic with PCU.** Five vehicle types with real lengths,
   passenger-car-unit values and weight classes. PCU is what makes queue
   comparison meaningful when a bus and a two-wheeler are both "one vehicle".

8. **Seeded pseudo-random demand (mulberry32).** All arrivals come from one
   seeded generator, so resetting with the same seed replays identical traffic.
   This is what turns "I think this plan is better" into a controlled
   experiment. Verified: two runs from the same seed produce identical spawn and
   completion counts.

9. **Measurement.** The headline metric is **control delay** — actual travel
   time minus free-flow travel time for that vehicle's own top speed — which is
   what the profession uses for level of service. Stopped delay is reported
   separately and is always smaller. Nothing is estimated; everything is
   measured from vehicle state.

### 4.5 Numbers you can quote

- Seeded A/B: 18 s / 18 s plan gives about **16.7 s** average control delay;
  skewing the same junctions to 25 s / 8 s on **identical traffic** raises it to
  about **21 s**.
- Webster on measured flows returned **12 s / 14 s with a 38 s cycle**.
- Priority corridor, measured: the priority vehicle **saved 2.9 s** against the
  **6.3 s** ordinary vehicles were losing in the same window, and cross traffic
  **paid 334 vehicle-seconds**.
- Determinism check: two runs from seed 12345 produced identical counts.

The priority number is the one to dwell on. Under light traffic, priority is a
**bad trade** — and the tool says so instead of flattering itself. That is the
argument for measuring it at all.

---

## 5. How much to say — the boundary

### Say freely
Everything in this document: the simulator, the algorithms, the measurements,
the scenarios, the architecture, the priority arbitration, the admission control
and the cost ledger. Cite the prior art loudly — Bengaluru's B-ATCS on CoSiCoSt,
SCATS, SCOOT, NTCIP 1211 for priority, the RESCO benchmark for reinforcement
learning. Naming what already exists and saying precisely how you differ is what
makes the claim credible.

### Do not say
There is a separate, related project with a patent filing pending. Until that
provisional is filed, public disclosure can destroy novelty in India, and a
hackathon presentation is public disclosure.

So do **not** describe: the dashboard device, the secure element, the hardware
usage counter, or a priority request that carries its own attested usage record.

**If asked where verified priority requests come from, say exactly this:**
> "They arrive from an external verified source. Verification is separate work
> and out of scope for this tool. What we solve here is what the network does
> with a request once it believes it — whether to grant it, and what granting it
> costs everyone else."

That answer is true, complete on its own terms, and protects the filing.

### Never claim
- That this is deployed, piloted, or validated against field data. It is not.
- That the model is calibrated to a specific real junction. It is calibrated to
  standard traffic-engineering values, which is a different and weaker claim —
  make the weaker one.
- That "AI timing traffic signals" is novel. It is deployed in Bengaluru today.
  Your contribution is the preview, the reason, and the receipt.
- Any legal right of way for any vehicle.

---

## 6. Limitations — say these before they are found

Volunteering these raises your score. Being caught by them lowers it.

- **No route choice.** Demand is independent random arrivals per entry, not an
  origin–destination matrix. In the flood scenario, barred heavy vehicles are
  removed from that entry rather than rerouted, and the count is reported.
- **Vehicles travel straight through and never turn.** No turning conflicts, no
  gap acceptance.
- **No pedestrians, no pedestrian phases, no cyclists.**
- **No lane changing or lateral movement.** Real Indian traffic is non-lane-based;
  PCU weighting is the standard approximation, not a substitute for modelling it.
- **Offsets are in the data model but green-wave progression is not implemented
  yet.** Say "next", not "done".
- **Not validated against field data.** The physics uses standard values; it has
  not been compared against a surveyed junction.

Closing line for this section:
> "Every one of those is written down in `docs/LOGIC.md` with the rest of the
> model specification. We would rather hand you the limitations than have you
> find them."

---

## 7. Questions they will ask, and the answers

**"Is the traffic realistic?"**
Gap-based car following with calibrated acceleration and braking, five vehicle
types with real lengths and PCU values, start-up lost time at every green.
Queues form, discharge as a wave, and spill back into the upstream junction.
What is missing is turning, lane changing and route choice, and those are listed
in the spec.

**"How do I know a better plan is actually better and not luck?"**
Every test replays identical seeded traffic with the warm-up period discarded.
Same arrivals, same vehicle types, same order. The only difference is the plan.

**"What does the AI add over the classical methods?"**
Two things, and neither is "better numbers". First, a stated reason for every
change, in plain language citing the queue numbers, which is the documented
barrier to deploying learned control in real agencies. Second, it handles
conditions no fixed formula covers — an incident flag, a blocked approach. If
Max-Pressure beats it in a given run, we report that; the results table is not
curated.

**"What if the API is down?"**
The controller falls back to a local rule-based policy and the simulation keeps
running. Signals hold their previous state on any timeout or error. Nothing
freezes.

**"Could this control real signals?"**
Not as it stands, and we would not claim it. The path is the sensor layer:
`sensorFeed.js` publishes exactly the shape a roadside gateway delivers, so
replacing one function connects real detectors. Output would go through
NTCIP 1211 to a real controller, which needs a traffic authority partnership.

**"What is genuinely new here?"**
Not adaptive control — that is deployed. Three things: a control room can
preview a timing before it reaches the street; every automatic change carries a
reason a human can audit; and granting priority has a measured price shown at
the moment of the decision instead of being invisible.

**"Why not SUMO?"**
SUMO is the right tool for a calibrated study and we would use it for one. It is
the wrong tool for something a control room operator opens in a browser and
drags a slider on. This is an operator-facing instrument, not a research
microsimulator.

**"Can I see the code?"**
Yes. Eight JavaScript files, no build step, and the model specification is in
`docs/LOGIC.md`. Hand them the repo.
