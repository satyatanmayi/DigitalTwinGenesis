# Positioning, Unique Selling Point, and Build Plan

*Working document for the hackathon submission. Written September 2026.*

Problem statement chosen: **Digital Twin of a Traffic Intersection** — build a virtual model of a
road intersection where users change signal timings and vehicle inflow, then watch congestion form
or clear, so they can find timings that reduce waiting time.

Judged on three things, in the organisers' own words:

1. Does traffic behave believably as conditions change?
2. Can users actually find better timings using the tool?
3. Quality of the visualisation and the insight it delivers.

Everything below is arranged around those three sentences. Anything that does not serve one of
them is a distraction, however clever it is.

---

## 1. The honest state of the current build

`DigitalTwinGenesis` (this repository) is a working four-junction simulator with car-following
vehicle physics, a real signal state machine, live queue and wait statistics, a mock sensor feed,
and per-junction LLM decisions displayed on screen with their reasoning.

Measured against the problem statement, it has one serious hole and several smaller ones.

| Requirement in the statement | Status |
| --- | --- |
| User can adjust **signal timing** | **Missing.** There is no control for green time, cycle length or offset. This is the single most important gap — it is the primary verb in the problem statement |
| User can adjust traffic volume | Present (traffic load slider) |
| Watch queue lengths respond in real time | Present (per-approach bars) |
| Watch waiting times respond in real time | Partial — one aggregate number, no history, no per-approach breakdown |
| Users can find *better* timings | **Missing.** No before/after comparison, no target metric, no record of what the user tried |
| Believable traffic | Partial — car-following is real, but every vehicle is an identical car. Indian traffic is not |
| Insight | **Weak.** The tool shows numbers; it does not yet tell the user what the numbers mean |

Fixing the four bold rows is worth more than any amount of extra AI.

---

## 2. The unique selling point

### 2.1 What is already solved — do not compete here

Adaptive signal control is deployed and works. Bengaluru runs **B-ATCS** on **CoSiCoSt**
(Coordinated Signal Control Strategy), developed by C-DAC and built specifically for India's
non-lane-based heterogeneous traffic. It covered roughly **165 junctions by January 2025**, and
Bengaluru Traffic Police report about a **33% reduction in vehicle travel time** at Hudson Circle.
SCATS, SCOOT, InSync and Surtrac occupy the same space internationally.

Any pitch that amounts to "we use AI to time traffic signals better" is competing directly with a
deployed government system, and will lose.

### 2.2 What is genuinely not solved

Four gaps, each supported by the literature or by the products' own scope:

**a. No preview before a decision.** ATCS closes the loop on live signals. Professional what-if
tools — PTV Vistro, Synchro Studio — do offer scenario management, but they are paid desktop
packages used by consultants during design studies, not by a control room operator at 6 p.m. on a
Friday. The published guidance on those tools is blunt that their optimisation output is a
starting point requiring manual adjustment, not a one-click answer. There is nothing an operator
can open, try a timing on, and see the consequence of, before touching the real junction.

**b. No explanation.** The documented number-one barrier to deploying reinforcement learning
signal control in the real world is not performance — it is trust and explainability. The
literature is explicit that the opaque, black-box nature of deep RL blocks agency acceptance,
regulatory compliance, operational trust, troubleshooting and tuning, and that compliance
assessment is impossible if the decision cannot be understood. Explainable-RL papers for signal
control exist precisely because of this.

**c. Exceptional events fall out of the system.** ATCS optimises the ordinary day from detector
data. Accidents, waterlogging, VIP movement and festival surges are handled by police override and
radio. Research on this is very recent — adaptive signal control under pluvial flooding, and
resilience-based adaptive signal strategy against disruption at a single intersection, are 2022 to
2026 publications, not deployed practice.

**d. The cost of priority is invisible.** Emergency vehicle preemption is standardised
(NTCIP 1211) and deployed, and the research is clear that it **hurts** cross-street traffic: cross
streets get reduced green or longer red, vehicles that yield miss their green phase, and the
choice of exit strategy determines how badly arterial coordination is damaged afterwards. Studies
now propose traffic-status recovery algorithms to claw back the extra waiting time imposed on
non-priority vehicles. No operator-facing tool shows this trade-off live, at the moment the
decision is made.

### 2.3 The positioning sentence

> **Adaptive traffic control optimises the average day. We simulate the bad day — and give the
> operator a preview, a reason, and a receipt.**

Three pillars follow from it, and every feature in the build plan serves one of them.

| Pillar | What it means | What it answers |
| --- | --- | --- |
| **Preview** | Disruption-first digital twin: accident, flooding, weight restriction, priority corridor, demand surge. The operator tests the response before it reaches the street | Gaps (a) and (c) |
| **Reason** | Every signal change carries one sentence citing the actual queue numbers, and is logged | Gap (b) — the documented deployment blocker |
| **Receipt** | Granting priority has a measured price in cross-traffic vehicle-seconds, shown at the moment of granting and recorded afterwards | Gap (d) |

The "receipt" pillar is the one nobody else has, and it is also the clean, safe bridge to
Kalavathi.

---

## 3. How this connects to Kalavathi — and the disclosure limit

### 3.1 The two halves

Kalavathi answers: *is this priority request genuine?* — a trust and verification problem, solved
in hardware and at the hospital.

This simulator answers: *given a request the network believes, should the network grant it, and
what does granting it cost everyone else?* — an arbitration and impact problem, solved on the
network side.

They are the two halves of the same system and neither is complete alone. Kalavathi's own
documents already name this: `scheduler.py` is rule-based and its stated future is a learned
scheduler whose novelty is *the state vector, not the technique* — trustworthiness as an input
feature. This simulator is where that state vector can be evaluated, because it is where
network-wide delay under competing requests can actually be measured.

### 3.2 The hard limit on what may be shown

`KALAVATHI_PROJECT_CONTEXT.md` §12, standing rule 1: **file before you show.** Provisional patent
first, then demo, then GitHub, then paper — because public disclosure before filing can destroy
novelty in India. A hackathon presentation, its slide deck, and a public repository are all public
disclosure.

Therefore, at the hackathon:

**Safe to show and say** — priority requests arriving at the network; arbitration between
competing requests; admission control that refuses the third concurrent corridor because the
network delay budget is exceeded; the measured cost of a granted corridor; green-wave progression;
NTCIP 1211 as the standard this follows. All of this is documented prior art.

**Do not show or describe** — the dashboard device, the secure element, the monotonic counter, the
reflash demonstration, and above all *the request that carries its own attested usage record*.
That last item is the actual patent claim.

**The line to use if asked where requests come from:** "Requests arrive from an external verified
source. Verification is a separate piece of work and out of scope for this tool — what we solve
here is what the network does with a request once it believes it."

That answer is true, it is not evasive, and it protects the filing.

---

## 4. Use cases — what the thing is actually *for*

A simulator with no scenario is a toy. These five scenarios are the product. Each one is a preset
the user loads in one click, and each one has a defensible real-world owner.

### 4.1 Accident blocks an approach

One approach at a junction loses capacity — a lane is blocked by a collision and a recovery
vehicle. Queue spillback propagates upstream into the next junction.

*Operator question:* do I hold the blocked approach short and give the green to the others, or does
that starve the queue that is already spilling back into the upstream junction?

*What the twin shows:* spillback reaching the upstream junction; the retiming that clears it; the
delay it costs the other approaches. Grounded in the resilience-under-disruption literature —
dynamic phase selection during the incident stage, queue-length-dissipation green timing during
recovery.

### 4.2 Flooding with a weight restriction

A link floods. Light vehicles can still pass; buses and trucks cannot, or must not. This is the
Indian monsoon case, and it is why **vehicle classes matter** — two-wheeler, auto-rickshaw, car,
bus, truck, each with its own PCU value, footprint and weight class.

*Operator question:* which junctions absorb the diverted heavy traffic, and what timing keeps the
diversion route from locking up?

*Grounded in:* adaptive signal control for urban traffic resilience under pluvial flooding, which
proposes exactly two mechanisms — yellow-phase control triggered by critical water depth, and
green-ratio optimisation driven by real-time traffic feedback. Both are implementable here.

### 4.3 Verified emergency corridor — the Kalavathi bridge

A verified priority request arrives with a route. The twin reserves junction slots along it and
holds greens in sequence.

*Operator question:* what did that cost, and can I grant the next one?

*What the twin shows, and this is the differentiator:* a live ledger — seconds saved for the
priority vehicle against vehicle-seconds paid by cross traffic, per junction, plus how long the
corridor takes to recover its coordination afterwards. Then admission control: a second concurrent
corridor is granted, a third is refused with a stated reason, because the network delay budget is
exceeded.

Nobody shows this. The preemption literature measures the cross-street damage in papers; no
operator tool puts it on screen at the moment of the decision.

### 4.4 Demand surge

Stadium, festival, temple, market day. Demand goes sharply asymmetric for 40 minutes.

*Operator question:* is a fixed plan good enough here, or does the asymmetry need adaptive
control? This is the scenario where the AI controller most visibly beats the fixed timer, so it is
the best scenario to demonstrate the comparison in.

### 4.5 Signal or detector failure

A junction loses power, or its detectors go blind. Adaptive control degrades to fixed time, or to
nothing.

*Operator question:* how far does the damage spread, and which neighbouring junction should absorb
it? Directly relevant because detector dependence is a real weakness of every adaptive system, and
detection is harder in heterogeneous non-lane-based traffic.

---

## 5. Believability — the first judging criterion

The physics has to survive an engineer's question, so the numbers must come from somewhere
citable.

| Element | What to implement | Why it is defensible |
| --- | --- | --- |
| Vehicle mix | Two-wheeler, auto-rickshaw, car, bus, truck with PCU values | Indian traffic is heterogeneous and non-lane-based; a simulation of identical cars is a simulation of Europe |
| Saturation flow | Discharge at roughly 1800 PCU per hour per lane, tunable | Standard signalised-intersection design value; state it and let the user change it |
| Startup lost time | 2 to 3 seconds at the start of green | Every signal design method includes it; leaving it out makes queues clear unrealistically fast |
| Car following | Gap-based target speed under finite acceleration (already built) | Produces real queue formation and discharge waves rather than teleporting vehicles |
| Reference timing | **Webster's optimal cycle length** shown as a reference line | The classical method every traffic engineer knows. Also state its known limitation — it overestimates cycle length once the volume-to-capacity ratio exceeds about 0.5, and it was derived for homogeneous lane-disciplined traffic, so Indian-calibrated variants exist. Saying this out loud is worth more marks than hiding it |
| Delay measurement | Report control delay per approach and per vehicle, not just "average wait" | Matches how the profession measures level of service |

**Say the limitations before the jury finds them.** The model is macroscopic-ish, single mode, no
pedestrians, no right-turn conflicts, no lane changing, PCU-based rather than true mixed-traffic
lateral behaviour. A stated limitation is engineering. A hidden one is a hole.

---

## 6. "Can users find better timings" — the second criterion

This criterion is not about the simulation at all. It is about the loop the user is put in. Build
it explicitly:

1. **Tuning controls.** Per-approach green time, cycle length, and offset between junctions —
   sliders, live, no restart.
2. **A target.** One headline number: network average delay per vehicle. Everything else is
   supporting detail.
3. **A baseline.** Freeze the current plan as "Plan A" with one click.
4. **A comparison.** Run "Plan B" against the identical demand — same random seed, same arrivals —
   and show the delta. Same-seed comparison is what makes the result honest rather than noise.
5. **A record.** A small table of every plan the user has tried and what it scored, so improvement
   is visible as a sequence, not a feeling.
6. **An opponent.** One button that runs Webster, one that runs Max-Pressure, one that runs the AI
   controller, on the same demand. The user finds out whether their hand-tuned plan beat the
   algorithms. This is the single most engaging thing in the whole tool.

Point 6 is the answer to the criterion, in one screen: the user tunes, the algorithms tune, both
scores sit side by side on identical traffic.

---

## 7. Technical depth — what to add, in order of return

Ordered by value delivered per hour spent. Do them top-down and stop when time runs out.

### Tier 1 — do these

**Webster's cycle-length formula.** A closed-form reference cycle from the flow ratios. Twenty
lines. Gives the jury an instant signal that this is traffic engineering, not just animation, and
gives the user a sensible starting plan instead of a blank slider.

**Max-Pressure control.** Choose the phase maximising the pressure — upstream queue minus
downstream queue, summed over the movements the phase serves. It is a real, citable, provably
throughput-maximising policy, it needs no training, and it is the standard baseline in the RL
signal-control literature. In the RESCO benchmark, learned methods such as MPLight beat
Max-Pressure by roughly 11 to 13 percent — which means Max-Pressure is a strong baseline, and
quoting that gap honestly is far more impressive than claiming an unmeasured win.

**Vehicle classes with PCU and weight class.** Believability plus the entire flooding scenario,
from one data structure change.

**Real city data.** Import a real junction layout and real signal timings so the word "twin" is
earned. Sources:
- `data.opencity.in` — Bengaluru City Traffic Signal Data, published from Bengaluru Traffic Police,
  including signal timings, plus jurisdiction maps, violation and crash datasets.
- OpenStreetMap `highway=traffic_signals`, extracted for any city via the Overpass API — junction
  geometry, approach counts, road classes.
- For flow profiles, UTD19 (multi-city loop-detector dataset) or Caltrans PeMS if a
  well-known open flow dataset is wanted for calibration.

### Tier 2 — do if time remains

**Reinforcement learning, honestly scoped.** Train a small DQN offline against this simulator (or
SUMO with `sumo-rl`), export the policy weights as JSON, and ship inference only in the browser.
The story is strong: RL sets the timing, the LLM explains it in plain language, and the
explanation directly addresses the documented trust-and-explainability barrier that keeps RL out
of real deployments. Do not attempt live in-browser training under hackathon time pressure.

**Quantum-ready phase selection.** Formulate one-step phase selection as a QUBO — binary variable
per phase per junction, penalty terms for conflicting phases and for starving an approach, linear
terms from queue pressure — and solve it with simulated annealing in the browser. Label it exactly
as it is: *the formulation is quantum-ready and could be submitted to a quantum annealer; today it
is solved classically.* That is honest, and the literature backs the framing — QUBO formulations
of traffic signal optimisation on real-world maps including T-junctions and multi-forked roads,
Ising-model adaptive-predictive signal controllers for large networks, and D-Wave hardware runs on
100 to 500 vehicle instances. A clearly-labelled experimental panel earns credit; an unlabelled
buzzword loses it.

### Tier 3 — skip

Short-horizon queue prediction with an LSTM, computer-vision vehicle detection, and anything
requiring a GPU at the venue. Cost is high, visible benefit is low, and none of them touch the
three judging criteria.

---

## 8. Visualisation and insight — the third criterion

The tool currently shows state. It must show **change** and **meaning**.

| Add | Why |
| --- | --- |
| Time-series strip: queue length and average delay over the last 3 minutes, per approach | Congestion forming and clearing is a shape over time. A single number cannot show it |
| Cumulative arrival/departure curves per approach | The classical way to read delay off a chart. Area between the curves *is* the total delay — visually unarguable |
| Level-of-service colouring by control delay | Speaks the profession's language |
| Plain-language insight line, updated live | "East–west is oversaturated: v/c 1.08. Six more seconds of east–west green cuts average delay about 18%." One sentence, always visible |
| Priority ledger | Seconds saved against vehicle-seconds paid, per junction, live |
| Plan comparison table | Every plan tried, its score, the winner highlighted |

**Design constraints, inherited from the Kalavathi interface rules, which were written for exactly
this kind of room:** colour never carries meaning alone — every state gets a colour *and* a word;
nothing below 16 px anywhere; high contrast assumed on a bad projector; one screen with no tabs
and no scrolling for the primary view.

---

## 9. Build order

Sequenced so that at every checkpoint there is something demonstrable, and the highest-risk items
are not last.

**Phase 1 — satisfy the problem statement literally.** Signal timing controls (green, cycle,
offset). Delay and queue time-series. Freeze-plan and compare-plan with a fixed random seed. Plan
history table. *Without this phase there is no submission, however good the rest is.*

**Phase 2 — believability.** Vehicle classes with PCU and weight class. Startup lost time.
Saturation-flow parameter exposed. Webster reference cycle. Stated model limitations.

**Phase 3 — the unique selling point.** Scenario presets: accident, flood with weight
restriction, priority corridor, surge, signal failure. Priority ledger and admission control.
Insight line.

**Phase 4 — depth.** Max-Pressure controller. Real Bengaluru junction and timing import. LLM
explanation retained throughout as the "reason" layer.

**Phase 5 — optional.** Offline-trained RL policy. QUBO panel.

**Always parallel:** `docs/LOGIC.md`, the model specification — written as you build, not the night
before.

---

## 10. The three-minute pitch

Adapted from the Kalavathi expo discipline, which is sound: never explain the technology before
the problem.

| Time | Content |
| --- | --- |
| 0:00–0:30 | The problem. A control room decides signal timings and has no way to try one first. No technology mentioned |
| 0:30–1:15 | The tool. Drag the east–west green from 12 s to 20 s. Watch the queue drain and the average delay number fall. That is the whole product in one gesture |
| 1:15–2:00 | The bad day. Load the accident preset. Show spillback. Show the fix. Load the flood preset: heavy vehicles cannot pass, watch them divert |
| 2:00–2:40 | The receipt. Grant a priority corridor. Show the seconds saved and the vehicle-seconds paid. Refuse the third corridor with a stated reason |
| 2:40–3:00 | The comparison. User plan against Webster against Max-Pressure against the AI controller, same traffic, same seed. Concede where the tool is limited |

Two rules carried over from Kalavathi and worth keeping: **report negative results honestly** — if
the AI controller loses to Max-Pressure on some scenario, say so, because a fabricated win is the
one thing that sinks a project; and **cite the prior art loudly** — naming CoSiCoSt, SCATS,
NTCIP 1211 and the RESCO benchmark, then stating precisely how this differs, is what makes the
claim credible rather than naive.

---

## 11. Sources

**Deployed adaptive control in India**
- Bengaluru Traffic Police — Adaptive Traffic Control System: <https://btp.karnataka.gov.in/214/adaptive-traffic-control-system-(atcs)/en>
- Smart Mobility: a case study of the Bengaluru Adaptive Traffic Control System, *Indian Infrastructure*: <https://indianinfrastructure.com/2026/04/06/smart-mobility-a-case-study-of-the-bengaluru-adaptive-traffic-control-system/>
- Advanced Traffic Signal Control System in Indian Cities, Urban Mobility India: <https://www.urbanmobilityindia.in/Upload/Conference/d310787c-310e-498a-99db-362bc8402596.pdf>
- ATCS Systems: Capabilities, Challenges, Opportunities, *TrafficInfraTech*: <https://trafficinfratech.com/atcs-systems-capabilities-challenges-opportunities/>

**Reinforcement learning for signal control, and why it is not deployed**
- RESCO — Reinforcement Learning Benchmarks for Traffic Signal Control: <https://github.com/Pi-Star-Lab/RESCO> and <https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/file/f0935e4cd5920aa6c7c996a5ee53a70f-Paper-round1.pdf>
- The Real Deal: challenges in moving RL-based signal control towards reality: <https://arxiv.org/pdf/2206.11996>
- Explainable Reinforcement Learning for Adaptive Traffic Signal Control: <https://arxiv.org/abs/2607.03703>
- Explainable reinforcement learning for improved traffic signal control, *Computer-Aided Civil and Infrastructure Engineering*: <https://onlinelibrary.wiley.com/doi/10.1111/mice.70037>
- Intelligent traffic signal control based on reinforcement learning: a survey: <https://link.springer.com/article/10.1007/s10462-026-11530-9>

**Emergency vehicle priority and its cost**
- An emergency vehicle traffic signal preemption system considering queue spillbacks and negative impacts on non-priority traffic, *IET ITS* 2024: <https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/itr2.12518>
- Evaluating the impacts of different exit strategies of emergency vehicle preemption on arterial signal coordination, ASCE: <https://ascelibrary.org/doi/abs/10.1061/JTEPBS.TEENG-7819>
- Development of Emergency Vehicle Preemption Strategies on Smart Corridors in a Digital Twin Environment: <https://www.osti.gov/biblio/2538276>

**Disruption and flooding**
- Enhancing Urban Traffic Resilience Under Pluvial Flooding Through Adaptive Signal Control, *IJDRS*: <https://link.springer.com/article/10.1007/s13753-026-00747-5>
- Resilience-Based Adaptive Traffic Signal Strategy against Disruption at Single Intersection, ASCE: <https://ascelibrary.org/doi/10.1061/JTEPBS.0000671>

**Digital twin framing**
- Digital Twins for Intelligent Intersections: A Literature Review: <https://arxiv.org/html/2510.05374v1>
- Digital twin intelligent transportation system — a systematic review, *IET ITS* 2024: <https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/itr2.12539>
- A Digital Twin Platform for Real-Time Intersection Traffic Monitoring, Performance Evaluation, and Calibration, *Infrastructures*: <https://www.mdpi.com/2412-3811/10/8/204>

**Quantum formulations**
- Quadratic Unconstrained Binary Formulation for Traffic Signal Optimization on Real-World Maps, *JPSJ* 2025: <https://journals.jps.jp/doi/10.7566/JPSJ.94.024001>
- Traffic signal optimization in large-scale urban road networks: an adaptive-predictive controller using Ising models: <https://arxiv.org/pdf/2406.03690>
- Mini-scale traffic flow optimization: iterative QUBOs from hybrid solver to pure QPU, *Scientific Reports* 2025: <https://www.nature.com/articles/s41598-025-04568-2>

**Signal timing theory and Indian calibration**
- Development of a Theoretical Delay Model for Heterogeneous and Less Lane-Disciplined Traffic Conditions, *Journal of Advanced Transportation*: <https://onlinelibrary.wiley.com/doi/10.1155/2022/3260945>
- Modelling Delay at Signalized Intersections under Heterogeneous Traffic Conditions: <https://www.sciencedirect.com/science/article/pii/S2352146516307220>
- Modification of Webster's Minimum Delay Cycle Length Equation Based on HCM 2000: <https://www.semanticscholar.org/paper/b0c2cbc8286d237ebc3d184885725476e39ad3bd>

**Professional what-if tools**
- PTV Vistro: <https://www.ptvgroup.com/en-us/products/traffic-engineering-software-ptv-vistro>
- Synchro Studio: <https://www.cubic.com/transportation/products/intelligent-transportation-solutions/intelligent-systems/synchro-studio>

**Open data**
- Bengaluru City Traffic Signal Data, OpenCity: <https://data.opencity.in/dataset/bengaluru-city-traffic-signal-data>
- Bengaluru Traffic Police datasets, OpenCity: <https://data.opencity.in/dataset?organization=bengaluru-traffic-police>
- OpenStreetMap `Key:traffic_signals`: <https://wiki.openstreetmap.org/wiki/Key:traffic_signals>
