# Research File — Digital Twin of a Traffic Intersection

*Everything we found, organised so it can be used. Section 1 is the quick
reference for live questions. Sections 2 onward are the actual review.*

Compiled September 2026. Every claim carries its source; where a source was not
verified directly, it says so.

---

## 1. Quick reference — if they ask X, say Y

| If a judge asks | Answer with | Source |
| --- | --- | --- |
| "Doesn't this already exist?" | Yes, and we name it: Bengaluru runs B-ATCS on CoSiCoSt across ~165 junctions. We are not competing with adaptive control; we are giving the operator a preview, a reason and a receipt | §2.1 |
| "How much do adaptive systems actually help?" | Surtrac's Pittsburgh pilot: travel time −25%, wait time −40%, emissions −21%. SCOOT: roughly 15% over fixed time | §2.2 |
| "Why not just use AI / RL?" | Because RL's blocker is not accuracy, it is trust. The literature names explainability, the sim-to-real gap and partial observability as the deployment barriers | §3.1 |
| "Isn't an LLM controlling signals a gimmick?" | It is published work — LLMLight, KDD 2025, LLMs as traffic signal control agents, benchmarked against nine baselines, with interpretability as the stated advantage. We are applying a known method, not claiming to have invented it | §3.2 |
| "Is your physics real?" | Gap-based car following with calibrated constants, PCU-weighted heterogeneous traffic, start-up lost time, Webster and Max-Pressure implemented as published. Limitations listed in `docs/LOGIC.md` | §4 |
| "What is a good delay number?" | HCM level of service for a signalised intersection, in seconds of control delay per vehicle: A ≤10, B 10–20, C 20–35, D 35–55, E 55–80, F >80 | §4.3 |
| "Priority for emergency vehicles is solved, isn't it?" | The signalling is — NTCIP 1211, standardised, with a priority request generator and a priority request server that triages requests. What is not solved is arbitration among many requesters and accounting for the cost | §5 |
| "Does preemption hurt anyone?" | Yes, measurably. Cross streets lose green, yielding vehicles miss their phase, and the exit strategy determines how much arterial coordination is destroyed. Recovery algorithms are an active research topic | §5.2 |
| "Why does the bad day matter?" | Because adaptive control optimises the ordinary day. Flood-adaptive signal control and disruption-resilient signal strategy are 2022–2026 research papers, not deployed practice | §6 |
| "Is this really a digital twin?" | We state exactly where we stand: real geometry, mocked sensor feed at a documented seam, control path named but not connected. The DT literature defines the twin by bidirectional synchronisation, and we do not overclaim it | §7 |
| "Where would quantum fit?" | Signal phase selection maps to a QUBO. There are published QUBO formulations for real-world maps, Ising-model predictive controllers, and D-Wave runs on 100–500 vehicle instances. Ours is solved classically and labelled as quantum-ready | §8 |
| "What data would you use for a real city?" | OpenStreetMap `highway=traffic_signals` for geometry, Bengaluru Traffic Police signal timings on OpenCity, the IIT-R Indian traffic dataset for turning movement counts, UTD19 or PeMS for flow profiles | §9 |
| "Why JavaScript?" | Because the user opens a link and it runs — no install, no licence, no build. Python sits offline for validation, training and data prep | §10 |

---

## 2. The deployed landscape — what already exists

### 2.1 India

**Bengaluru — B-ATCS on CoSiCoSt.** CoSiCoSt (Coordinated Signal Control
Strategy) was developed by C-DAC and is explicitly designed for India's
non-lane-based heterogeneous traffic, which is why it matters here: it is not a
Western system retrofitted. Reported coverage is roughly 165 junctions by
January 2025 (136 existing signals upgraded plus 29 new), and Bengaluru Traffic
Police report about a 33% reduction in vehicle travel time at Hudson Circle.

One field observation is worth remembering because it is a usability finding,
not a technical one: most adaptive systems worldwide avoid countdown timers
because they constrain flexibility, but Bengaluru commuters wanted a visual cue
for the transition. That is a real-world reminder that the interface matters as
much as the optimiser.

Deployments also exist in Hyderabad and Pune. Commentary in the Indian traffic
engineering press is consistent that ATCS alone is not sufficient — road
condition and enforcement have to improve alongside it for the full benefit.

- <https://btp.karnataka.gov.in/214/adaptive-traffic-control-system-(atcs)/en>
- <https://indianinfrastructure.com/2026/04/06/smart-mobility-a-case-study-of-the-bengaluru-adaptive-traffic-control-system/>
- <https://www.urbanmobilityindia.in/Upload/Conference/d310787c-310e-498a-99db-362bc8402596.pdf>
- <https://trafficinfratech.com/atcs-systems-capabilities-challenges-opportunities/>

### 2.2 International systems and their reported gains

| System | Architecture | Reported effect |
| --- | --- | --- |
| **SCATS** (Sydney) | Centralised; timing plans computed from detector data and historical patterns | Widely deployed; the reference adaptive system |
| **SCOOT** (UK) | Centralised, continuously adjusts splits, offsets and cycle | Roughly **15%** improvement over fixed-time control |
| **Surtrac** (CMU / Pittsburgh) | **Decentralised**, schedule-driven, peer-to-peer between junctions | East Liberty pilot: travel time **−25%** (range 17–33%), wait time **−40%** (range 28–50%), emissions **−21%**, braking −30%, idling −40% |
| **InSync** | Commercial adaptive system | Widely deployed in the US |
| **CoSiCoSt / B-ATCS** | Indian, heterogeneous-traffic oriented | ~33% travel-time reduction at one Bengaluru junction |

The Surtrac architecture is the most interesting precedent for us: decentralised
per-junction scheduling with communication to neighbours is structurally what
our per-junction agents plus a corridor coordinator would be.

- <https://www.smartcitiesdive.com/news/this-ai-traffic-system-in-pittsburgh-has-reduced-travel-time-by-25/447494/>
- <https://publications.ri.cmu.edu/storage/publications/pub_files/2013/1/13-0315.pdf>
- <https://www.researchgate.net/publication/274137098_SCOOT_and_SCATS_A_Closer_Look_into_Their_Operations>
- <https://mtc.ca.gov/sites/default/files/4-Adaptive_Signal_Control_-_How_Does_It_Work.pdf>

### 2.3 The professional what-if tools

**PTV Vistro** and **Synchro Studio** both support scenario management —
existing, future and mitigated conditions in one file. They are paid desktop
packages used by consultants during design studies. Practitioner guidance is
explicit that their optimisation output is a *starting point* needing manual
adjustment, not a one-click answer.

The gap this leaves is not "nobody can model signal timing". It is that the
person who models it is a consultant with a licence and a study timeline, not
the operator on shift.

- <https://www.ptvgroup.com/en-us/products/traffic-engineering-software-ptv-vistro>
- <https://www.cubic.com/transportation/products/intelligent-transportation-solutions/intelligent-systems/synchro-studio>
- <http://www.mikeontraffic.com/signal-timing-optimization/>

---

## 3. Learned control — the state of the art and why it is not deployed

### 3.1 The barriers, named in the literature

Three, consistently:

1. **The sim-to-real gap.** Models trained in simulators degrade on deployment
   because simulator dynamics differ from the street. Mitigations under active
   research: domain randomisation, model-agnostic meta-learning, grounded action
   transformation, and LLM-assisted action transformation.
2. **Trust and explainability.** The blocker most relevant to us. The opaque
   nature of deep RL obstructs agency acceptance, regulatory compliance,
   operational trust, troubleshooting and tuning — and compliance assessment is
   impossible if a decision cannot be understood or verified. Explainable-RL
   work for signal control exists specifically to address this.
3. **Partial observability and data cost.** Real states are partially observed
   or sensor-noisy; real-world data collection is expensive.

- The Real Deal — challenges moving RL-based signal control toward reality: <https://arxiv.org/pdf/2206.11996>
- Explainable RL for adaptive traffic signal control: <https://arxiv.org/abs/2607.03703>
- Explainable RL for improved traffic signal control (CACAIE, 2025): <https://onlinelibrary.wiley.com/doi/10.1111/mice.70037>
- Intelligent traffic signal control based on RL — survey: <https://link.springer.com/article/10.1007/s10462-026-11530-9>
- Prompt to Transfer — sim-to-real with prompt learning (AAAI): <https://arxiv.org/abs/2308.14284>
- Bridging the reality gap with domain randomisation and meta learning (IEEE): <https://ieeexplore.ieee.org/document/10421987/>

### 3.2 LLMs as signal controllers — this is published work

**LLMLight** (KDD 2025, Lai et al.) uses large language models as decision
agents for traffic signal control, with a knowledgeable prompt describing
real-time traffic conditions, and adds **LightGPT**, a backbone specialised for
the task. Evaluated on nine real-world and synthetic datasets against nine
transportation-based and RL-based baselines. The stated advantages are
generalisation across scenarios and **interpretability** — precisely the
argument we make for our reasoning layer.

**What this means for our honesty:** "we use an LLM to control traffic signals"
is *not* a novel claim, and saying so before a judge finds the paper is worth
more than the claim would have been. Our reasoning layer is an application of a
known method; the contribution is what surrounds it.

- <https://arxiv.org/abs/2312.16044> · KDD version: <https://dl.acm.org/doi/10.1145/3690624.3709379>
- Code: <https://github.com/usail-hkust/LLMTSCS>

### 3.3 Benchmarks and baselines

- **RESCO** — the standard RL signal-control testbed, with real scenarios from
  Cologne, Luxembourg and Salt Lake City. <https://github.com/Pi-Star-Lab/RESCO>
  · paper: <https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/file/f0935e4cd5920aa6c7c996a5ee53a70f-Paper-round1.pdf>
- **CityFlow** — large-scale multi-agent RL traffic environment; common datasets
  Jinan, Hangzhou, Manhattan. <https://github.com/cityflow-project/CityFlow>
- **LibSignal** — cross-simulator library covering SUMO, CityFlow and CBEngine
  with traditional and RL models. <https://github.com/DaRL-LibSignal/LibSignal>
- **sumo-rl** — RL environments for signal control on SUMO, Gymnasium and
  PettingZoo compatible. <https://github.com/LucasAlegre/sumo-rl>
- **Max-Pressure as baseline:** learned methods such as MPLight beat
  Max-Pressure by roughly **11–13%** in the reported comparisons. Max-Pressure
  is therefore a serious opponent, not a strawman — which is exactly why we ship
  it as the thing the user has to beat.
- Survey of traffic signal control methods: <https://arxiv.org/pdf/1904.08117>
- Generalised phase pressure control enhanced RL: <https://arxiv.org/pdf/2503.20205>

---

## 4. Traffic engineering fundamentals we implement

### 4.1 Webster (1958)

Minimum-delay cycle length `C = (1.5·L + 5) / (1 − Y)`, where `L` is lost time
per cycle and `Y` the sum of critical flow ratios `y = q/s`; effective green is
split in proportion to `y`.

**Documented weaknesses, which we state rather than hide:**
- Overestimates cycle length once the volume-to-capacity ratio exceeds about
  0.5, producing unrealistically long cycles.
- Derived for homogeneous, lane-disciplined traffic. Direct application to
  non-lane-based heterogeneous traffic gives erroneous delay estimates.
- Indian-calibrated variants exist: the semi-empirical adjustment term has been
  re-fitted from field delay observations at Indian signalised intersections
  using videographic and GPS survey data.

- Delay model for heterogeneous, less lane-disciplined traffic: <https://onlinelibrary.wiley.com/doi/10.1155/2022/3260945>
- Modelling delay under heterogeneous traffic: <https://www.sciencedirect.com/science/article/pii/S2352146516307220>
- Modification of Webster's minimum delay cycle based on HCM 2000: <https://www.semanticscholar.org/paper/b0c2cbc8286d237ebc3d184885725476e39ad3bd>

### 4.2 Max-Pressure

Serve the phase maximising pressure — upstream queue minus downstream queue over
the movements served. Throughput-maximising, training-free, and the standard
comparison point in the RL literature (§3.3).

### 4.3 Level of service — the yardstick to quote

HCM criteria for a signalised intersection, in **average control delay per
vehicle**:

| LOS | Control delay (s/veh) |
| --- | --- |
| A | ≤ 10 |
| B | > 10 – 20 |
| C | > 20 – 35 |
| D | > 35 – 55 |
| E | > 55 – 80 |
| F | > 80 |

The searches directly confirmed the A (<10), E (55–80) and F (>80) boundaries;
the intermediate bands are the standard HCM values. Control delay — not stopped
delay — is the measure, which is why our headline metric is control delay.

- <https://www.researchgate.net/figure/HCM-Delay-LOS-Criteria-for-Signalized-Intersections_tbl1_242673589>
- <https://content.civicplus.com/api/assets/9dde62aa-3f60-417a-b2cb-a5fcd50ccc82>

---

## 5. Priority and preemption — the standard, and what it leaves open

### 5.1 NTCIP 1211

The joint AASHTO / ITE / NEMA standard for Signal Control and Prioritisation.
Two functional entities: a **priority request generator** in the vehicle and a
**priority request server** at the junction, which **triages** requests. The
standard explicitly covers management of multiple requests from different
vehicle classes (transit, emergency, commercial fleet), and v02 defines a method
of granting priority at one signal while maintaining coordination with adjacent
intersections.

**Read this carefully before claiming novelty anywhere near priority.** Multiple
competing requests and their triage are *in the standard*. What the standard
does not address is a requester population that might be lying, or making the
cost of a grant visible to an operator.

- v01 PDF: <https://www.ntcip.org/file/2025/03/1211v0138p-2008b_Final.pdf>
- v02 PDF: <https://www.ntcip.org/file/2018/11/NTCIP1211-v0224j.pdf>
- Overview: <https://www.ntcip.org/signal-control-and-prioritization/>

### 5.2 The cost of preemption — measured, and mostly ignored by tools

- Preemption worsens arterial and intersection operations across all studied
  exit strategies: cross streets get reduced green or longer red; vehicles
  yielding in the opposite direction miss their green phase and incur extra
  delay; vehicles yielding in the same direction are delayed too.
- Choice of exit strategy matters: *return to coordinated operations* is
  recommended when restoring arterial progression is the objective; *return to
  free operations* when avoiding queue spillover matters more.
- Recovery algorithms that claw back the extra waiting imposed on non-priority
  vehicles are an active research topic, alongside preemption systems that
  explicitly consider queue spillback and negative impact on non-priority
  traffic.
- Digital-twin environments are already being used to develop preemption
  strategies on smart corridors — the closest published work to what we are
  doing.

- <https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/itr2.12518>
- <https://ascelibrary.org/doi/abs/10.1061/JTEPBS.TEENG-7819>
- <https://oasis.library.unlv.edu/cgi/viewcontent.cgi?article=1301&context=fac_articles>
- <https://www.osti.gov/biblio/2538276>
- <https://dl.acm.org/doi/fullHtml/10.1145/3453417.3453434>

---

## 6. Disruption and the bad day

- **Flooding.** Pluvial flooding disrupts road transport and rescue; existing
  systems are described as *insufficiently adaptive* to rapidly changing
  inundation and traffic conditions. A recent framework couples hydrodynamic,
  traffic and rescue models and proposes two mechanisms: **yellow-light phase
  control** triggered by a critical water depth, and **green-ratio
  optimisation** driven by real-time traffic feedback. Both are implementable in
  our model.
- **Generic disruption.** Resilience-based adaptive signal strategy for a single
  intersection covers both the incident stage (dynamic phase selection) and the
  recovery stage (queue-length dissipation green timing).
- **Evacuation.** Dynamic route optimisation for urban flooding evacuation using
  cellular automata.

The date range matters for positioning: these are 2021–2026 publications. The
bad day is a research frontier, not deployed practice — which is why building
for it is defensible as a contribution rather than a re-implementation.

- <https://link.springer.com/article/10.1007/s13753-026-00747-5>
- <https://ascelibrary.org/doi/10.1061/JTEPBS.0000671>
- <https://www.ugpti.org/resources/reports/details.php?id=1138>

---

## 7. What "digital twin" actually means

The literature defines a transportation digital twin by more than fidelity:

- Dynamic virtual counterparts of physical mobility networks, integrating
  sensing, communication and computational modelling to support monitoring and
  decision making.
- **Bidirectional synchronisation** between virtual and real is the premise for
  automatic generation and dynamic modification of the model — the twin reflects
  real-time behaviour and synchronises vehicle behaviour and signal states with
  the physical world.
- Working platforms combine high-resolution sensing (for example roadside LiDAR)
  with microsimulation for monitoring, performance evaluation and **calibration**.

**Consequence for our claim.** We have real geometry (once OSM import lands), a
mocked sensor feed at a documented seam, and no control path back to a real
controller. That is a *partial* twin, and the honest formulation is: monitoring
and evaluation are twin functions we perform; synchronisation and actuation are
named but not connected. Saying that on screen is stronger than claiming more.

- Digital Twins for Intelligent Intersections — literature review: <https://arxiv.org/html/2510.05374v1>
- DT intelligent transportation system — systematic review (IET ITS 2024): <https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/itr2.12539>
- DT platform for real-time intersection monitoring, evaluation and calibration: <https://www.mdpi.com/2412-3811/10/8/204>
- Systematic mapping study of digital twins for diagnosis in transportation: <https://arxiv.org/pdf/2402.01686>
- V2X-enabled connected vehicle corridor DT framework: <https://arxiv.org/pdf/2410.00356>

---

## 8. Quantum formulations — what is real here

- **QUBO for traffic signal optimisation on real-world maps** (JPSJ, published
  January 2025) handles T-junctions and multi-forked roads, extending earlier
  work limited to simple grids.
- **Ising-model adaptive-predictive controller** for signal timing in
  large-scale urban road networks.
- **Hardware runs exist:** experiments with 100–500 vehicles on a complex map of
  Almaty executed on the D-Wave Advantage QPU (Pegasus topology), reported in
  Scientific Reports, July 2025.
- D-Wave and Volkswagen have collaborated on traffic flow optimisation since
  2017.

**Honest framing for us:** phase selection under conflict constraints is a
natural QUBO — binary variable per phase, penalties for conflicting phases and
for starving an approach, linear terms from queue pressure. Formulating it is
real work; solving it by simulated annealing in the browser is the same
formulation on classical hardware. Label it exactly that way.

- <https://journals.jps.jp/doi/10.7566/JPSJ.94.024001>
- <https://arxiv.org/pdf/2406.03690>
- <https://www.nature.com/articles/s41598-025-04568-2>
- <https://arxiv.org/pdf/2510.06053>
- <https://www.dwavequantum.com/resources/application/traffic-flow-optimization-using-the-d-wave-quantum-annealer/>

---

## 9. Data sources

| Source | What it gives | Notes |
| --- | --- | --- |
| **OpenStreetMap**, `highway=traffic_signals` | Signalised junction locations, road geometry, road names, for any city | Free, queryable via the Overpass API. Our chosen import path |
| **OpenCity — Bengaluru City Traffic Signal Data** | Actual BTP signal timings for named junctions | Some resources are PDF; needs manual extraction. <https://data.opencity.in/dataset/bengaluru-city-traffic-signal-data> |
| **OpenCity — Bengaluru Traffic Police** | Violations, road crashes, jurisdiction maps (CSV, KML, PDF) | <https://data.opencity.in/dataset?organization=bengaluru-traffic-police> |
| **ITD — Indian Traffic Dataset (IIT Roorkee)** | Indian traffic data including **turning movement counts** at intersections, vehicle trajectories classified by type | Directly relevant to heterogeneous calibration. <https://github.com/teg-iitr/ITD-Indian-traffic-dataset> |
| **data.gov.in** | Government open data, transport sector, API access | Broad but variable granularity. <https://www.data.gov.in/sector/transport> |
| **IUDX** | Open-source data exchange platform for Indian city data | <https://iudx.org.in/> |
| **UTD19** | Multi-city loop-detector flow dataset | Useful for realistic flow profiles |
| **Caltrans PeMS** | Long-run freeway detector data | US, freeway-oriented; use only for flow-profile shape |

---

## 10. Platform assessment — should we use anything besides the browser?

| Platform | Verdict | Reasoning |
| --- | --- | --- |
| **Vanilla JS in the browser** | **Yes — the live tool** | The user opens a link and it runs. No install, no licence, no build step. Nothing else satisfies "usable by a control room, demonstrable to a jury, inspectable by an examiner" |
| **Python (offline `tools/`)** | **Yes — validation, training, data prep** | SUMO/TraCI cross-validation, RL training, QUBO solving, Overpass fetching. Produces JSON the browser app reads. Also matches Kalavathi's existing FastAPI/Python stack |
| **SUMO** | **Later, for validation only** | The standard open microsimulator; TraCI for programmatic control. The right tool for a calibrated study, the wrong tool for an operator-facing instrument. Running our scenario in SUMO and showing agreement is the strongest possible answer to "is your physics real?" |
| **CityFlow / LibSignal / sumo-rl** | Reference, not adoption | Cite as the benchmark ecosystem; borrow method, not code |
| **Unity** | Only for a 3D showcase, later | Real 3D twin is a P2 story. Our state/render split already makes the swap cheap; Three.js is lighter than Unity for a web deliverable |
| **MATLAB / Simulink** | **No** | SimEvents could model queues, but it is licence-bound, not demonstrable on a venue laptop, and adds nothing the browser model lacks |
| **ANSYS** | **No** | CFD and FEA. Wrong domain entirely |
| **PTV Vissim / Aimsun** | No | Commercial microsimulators. Cite as prior art; cannot ship |

---

## 11. Where our contribution sits, stated narrowly

Everything below is *not* claimed as novel, and we say so out loud: adaptive
signal control, RL for signal control, LLMs for signal control, emergency
vehicle preemption, priority request triage, Webster, Max-Pressure, digital
twins of intersections.

What we could not find, and what the tool therefore contributes as an
engineering artifact rather than a research claim:

1. **An operator-facing preview.** A tool where the person responsible for the
   junction changes a timing and sees the consequence on identical, replayable
   traffic before it reaches the street. What-if analysis exists in consultant
   desktop tools; live rehearsal for the control room does not.
2. **The cost of priority, shown at the moment of the decision.** The damage
   preemption does to cross traffic is well measured in papers (§5.2) and
   invisible in every operational interface we found.
3. **Disruption as a first-class mode.** Flooding and incident-adaptive signal
   control are recent research (§6); no operational tool lets an operator
   rehearse them.

The claim to make is "no operator-facing tool does this", supported by §2.3 and
§5.2. The claim to avoid is "nobody has thought of this" — several of these
ideas exist in papers, and citing them is what makes the position credible.
