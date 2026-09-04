# Pitch Outline — Ideation Review

*Slide-by-slide with speaker notes. Build these in your team's template. Text in
the "On the slide" column is what appears; the notes are what you say.*

Target length: 12 slides, 7–8 minutes of speaking, leaving room for questions.
Rule carried over from the Kalavathi discipline: **never explain the technology
before the problem.**

---

## Slide 1 — Title

**On the slide**
> **Digital Twin Genesis**
> A control-room rehearsal for traffic signals
> *Problem statement 4 — Digital Twin of a Traffic Intersection*
> Team name · names · date

**Say:** Nothing about technology. Just introduce the team and read the subtitle.

---

## Slide 2 — The problem

**On the slide**
> A traffic control room changes signal timings on live roads.
> There is no way to try a timing first.
>
> Get it wrong and the queue is real, the fuel is real, the ambulance stuck in it
> is real.

**Say:** Every city times its signals. Every city gets some of them wrong. The
person responsible has no safe place to try a change — the road *is* the test
environment. That is the gap we are working in. *(Do not mention any technology
on this slide.)*

---

## Slide 3 — Who this is for

**On the slide**
> **Traffic planner** — designs the timings
> **Control room operator** — survives the day they were not designed for
>
> Two users. Two modes. One twin.

**Say:** These are two different jobs with two different tempos. The planner has
hours and wants the best plan. The operator has ninety seconds and a blocked
junction. Most tools serve one and ignore the other; we built for both, and the
tool has a mode for each.

---

## Slide 4 — What already exists (say this before they ask)

**On the slide**
> Bengaluru: B-ATCS on CoSiCoSt — ~165 junctions, ~33% travel-time cut at Hudson Circle
> Pittsburgh: Surtrac — travel time −25%, wait −40%
> SCOOT: ~15% over fixed-time · SCATS, InSync deployed worldwide
> Priority signalling is a standard: **NTCIP 1211**
>
> **Adaptive traffic control is solved. We are not competing with it.**

**Say:** We looked hard for what exists before deciding what to build, and we
will name it before you do. Adaptive signal control works and is deployed in
Indian cities today. Anyone who tells you "AI will time your signals better" is
describing something Bengaluru already runs.

---

## Slide 5 — So what is actually missing

**On the slide**
> 1. **No preview.** Adaptive systems act on live signals. Professional what-if
>    tools are consultant desktop software, not control-room instruments.
> 2. **No reason.** The documented number-one barrier to deploying learned
>    control is not accuracy — it is trust and explainability.
> 3. **No rehearsal for the bad day.** Floods, collisions, surges: handled by
>    manual override and radio. Research from 2022–2026, not deployed practice.
> 4. **No receipt.** Preemption measurably hurts cross traffic. No operator
>    interface shows that cost at the moment of the decision.

**Say:** Four gaps, each of which we can cite. The fourth is the one nobody is
working on: when you give an ambulance a green corridor, somebody pays for it,
and right now that bill is invisible.

---

## Slide 6 — What we built

**On the slide**
> **Adaptive control optimises the average day.**
> **We simulate the bad day — with a preview, a reason, and a receipt.**
>
> A browser-based digital twin of a signalised network.
> No install. No licence. Open a link.

**Say:** One sentence to remember us by. Then: it runs in a browser because the
people who need it — an operator, an official, a judge — should not have to
install anything.

---

## Slide 7 — Demo 1: the planner (live, not a screenshot)

**On the slide**
> *Screenshot of PLAN mode, single-junction focus*
> Target · your best · gap
> Drag a green. Test it. Race the algorithm.

**Say and do:** Drag the east–west green from 18 to 30 seconds. Point at the
queue draining and the delay number moving. Then press **TEST THIS PLAN** —
every test replays *identical* traffic from the same random seed, so the
difference is the plan, not luck. Then press **BEAT MAX-PRESSURE** and let the
algorithm take its turn. If it beats us, we show that.

---

## Slide 8 — Demo 2: the operator

**On the slide**
> *Screenshot of OPERATE mode with an incident*
> Accident · flood with weight restriction · surge · signal failure · priority request

**Say and do:** Trigger the accident — one approach cannot discharge, and you
watch the queue spill back into the next junction. Trigger the flood: speeds
drop and heavy vehicles are barred, which is why we model two-wheelers,
auto-rickshaws, cars, buses and trucks separately rather than pretending Indian
traffic is a row of identical cars.

---

## Slide 9 — The receipt (the part that is ours)

**On the slide**
> Priority granted: vehicle saved **2.9 s**
> Cross traffic paid **334 vehicle-seconds**
> Second request during congestion: **REFUSED — network queue above budget**

**Say:** This is the measurement nobody shows. Granting a green corridor helps
one vehicle and costs everyone else, and until you put both numbers on one
screen, nobody can make that trade deliberately. Note that under light traffic
priority is a *bad* trade — and our tool says so instead of flattering itself.
Note also the refusal: the network can say no, and it says why.

---

## Slide 10 — How it works

**On the slide**
> **A junction is a scheduler. Approaches are processes. Green time is the CPU.**
>
> Fixed plan = round-robin · Yellow + all-red = context-switch cost
> Minimum green = minimum quantum · Maximum green = **starvation prevention**
> Max-Pressure = greedy priority scheduling · Priority corridor = **preemption**
> Admission control = preventing preemption storms
>
> Physics: gap-based car following, calibrated · Webster 1958 · seeded replay

**Say:** For a computer science audience this is the clearest framing, and it is
literally what the code does. Every controller — including the language model —
writes through one function, and the safety limits sit *below* that function, so
no model output can starve an approach or skip a yellow. Those rules are
hard-coded and never learned, because a traffic authority has to be able to ask
why something happened.

---

## Slide 11 — Roadmap

**On the slide**
> **Done:** timing control · seeded A/B testing · five vehicle classes · charts ·
> incidents · priority ledger · model specification
> **Next:** multi-request arbitration → green-wave coordination → real map import
> from OpenStreetMap → SUMO cross-validation
> **Then:** quantum-ready phase selection (QUBO) · learned controller

**Say:** What is done is demonstrable today. What is next is ordered by how much
it deepens the core, not by how impressive it sounds. Multi-request arbitration
comes first because competing emergency requests at one junction is the real
version of the problem.

---

## Slide 12 — What we are honest about

**On the slide**
> No route choice · no turning movements · no pedestrians · no lane changing
> Not validated against field data · sensor feed is mocked at a documented seam
>
> Every limitation is written down in `docs/LOGIC.md`.

**Say:** We would rather hand you the limitations than have you find them. The
model specification lists every constant and every assumption, and the sensor
layer is deliberately one function so a real feed can replace it without
touching anything else.

---

## Closing line

> "Signal timing decisions are made every day with no way to try them first.
> This is the place to try them."

---

## If asked in Q&A

| Question | Answer |
| --- | --- |
| "Where do the verified priority requests come from?" | "From an external verified source. Verification is separate work, out of scope for this tool. What we solve is what the network does with a request once it believes it." |
| "Is it a digital twin or a simulator?" | "Partial twin, and the app says so on screen: real geometry, mocked sensor feed at a named seam, control path identified but not connected." |
| "Why JavaScript?" | "So the user opens a link and it runs. Python sits offline for validation, training and data prep." |
| "Why not SUMO?" | "SUMO is right for a calibrated study and we will use it to cross-check our numbers. It is wrong for something an operator opens and drags a slider on." |
| "Is the AI necessary?" | "No — and that is deliberate. Everything works without it. The AI adds a stated reason for each change, which is the documented barrier to deploying learned control." |

**Never claim:** deployed, piloted, validated against field data, calibrated to a
specific real junction, or that AI signal timing is novel.
