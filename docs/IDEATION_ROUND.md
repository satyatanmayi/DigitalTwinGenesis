# Ideation Round — Deck Layout, Diagrams and Speech

*Round 1 is scored on four things: problem understanding and relevance,
innovation and originality, feasibility, and potential impact. This document is
built backwards from those four, and every slide states which one it is earning.*

Target: **10 minutes of speech, 15 slides.** Speech text is written the way you
would actually say it out loud — short words, short sentences, no jargon unless
the slide explains it.

---

## 0. Read this first

### 0.1 The disclosure boundary

Presenting in public is public disclosure. Your standing rule is: file the
provisional patent before showing.

| Safe to say | Not safe to say |
| --- | --- |
| The personal story — a family driving a patient, stuck at signals | The dashboard device |
| Families drive patients themselves in India | The secure element or any hardware |
| Emergency vehicles lose time at junctions, not on open road | The usage counter |
| You are working on emergency priority as a separate project | **A request that carries its own attested usage record** |
| Everything the *network* does: rank, grant, refuse, price the cost | How a request is proven genuine |

If someone asks how you tell a real emergency from a fake one, say:

> "That's a separate piece of work we're not presenting today. What I can show
> you is what the network does with a request once it believes it."

That sentence is true, it is not evasive, and it protects the filing.

### 0.2 Your time-balance worry, solved

You asked whether you have time for both the twin and the bigger picture. Yes,
if you use this split:

| Share | Content |
| --- | --- |
| **60%** | The digital twin — the actual deliverable. Problem, product, demo, evidence |
| **20%** | The motivation and the future use case (the emergency-priority story) |
| **20%** | Feasibility, benchmarks, impact, roadmap |

The trick is that **the story is the opening, not a second pitch.** You spend
sixty seconds on it at the start, where it earns "problem understanding", and
one slide on it at slide 11, where it earns "potential impact". You never stop
and give a second presentation. If you feel time slipping, slide 11 shrinks to
two sentences and nothing breaks.

### 0.3 Scoring map

| Metric | Slides that earn it |
| --- | --- |
| Problem understanding & relevance | 2, 3, 4, 5 |
| Innovation & originality | 5, 6, 9, 10, 11 |
| Feasibility | 7, 8, 12, 13 |
| Potential impact | 11, 14, 15 |

---

## 1. Slide-by-slide

Each slide gives: what appears on it, the diagram to draw, the words to say, and
the seconds it takes.

---

### Slide 1 — Title · 15 s

**On the slide**
> **Digital Twin Genesis**
> A safe place to test traffic signal timings before they reach the road
> Problem Statement 4 — Digital Twin of a Traffic Intersection
> Team · names · date

**Visual:** one screenshot of the running twin, dark, filling the lower half.

**Say:**
> "Good morning. We're team [name], and we picked problem statement four — the
> digital twin of a traffic intersection."

---

### Slide 2 — The story · 60 s · *problem understanding*

**On the slide**
> One line only:
> **"The ambulance was not slow. The signals were."**

**Visual (D1):** a simple road line with four junction dots. A small car icon at
the left, a hospital at the right. Above each dot, a red light and a number: 60 s,
90 s, 75 s, 80 s. A total at the end: **≈ 5 minutes lost, standing still.**

**Say:**
> "I want to start with why we chose this problem.
>
> In India, when there is a medical emergency, most families do not wait for an
> ambulance. They put the patient in their own car and drive.
>
> That happened in my family. And the car was not slow. The driver was not slow.
> The patient lost time standing at red lights, one junction after another.
>
> A ten kilometre drive in a city crosses eight to twelve signalled junctions.
> Each one can hold you for a minute or more. That is where the time goes — not
> on the open road, at the junctions.
>
> So we started looking at traffic signals. And the more we looked, the more we
> found that this is not only an emergency problem. It is everybody's problem,
> every single day."

---

### Slide 3 — The everyday problem · 45 s · *relevance*

**On the slide**
> Badly timed signals cost:
> **Time** · **Fuel** · **Air** · **Patience**
> And every city has thousands of them.

**Visual (D2):** four flat icons in a row — clock, fuel pump, cloud, angry face —
each with a one-line caption. Keep it plain; no clip-art.

**Say:**
> "Every city runs thousands of signals. When they are timed badly, everybody
> pays. You wait longer. Your engine burns fuel while standing still. The air
> gets worse. And people get angry and start jumping signals, which makes it
> less safe as well.
>
> This is exactly what the problem statement says: badly timed signals create
> congestion, wasted fuel and frustration."

---

### Slide 4 — Why cities can't just fix it · 45 s · *problem understanding*

**On the slide**
> To improve a signal, you must change it.
> To know if the change is good, you must watch real traffic.
> **So today, the road is the test environment.**
> Get it wrong and the queue is real.

**Visual (D3):** two panels side by side.
*Left, labelled "Today":* an engineer icon → arrow → a real junction with a long
queue, red warning triangle.
*Right, labelled "What's missing":* the same engineer → arrow → a laptop showing
the same junction → arrow → the real junction, green tick.

**Say:**
> "Now here is the part that surprised us.
>
> If a traffic engineer wants to improve a junction, they have to change the
> timing on the actual signal and then watch what happens on the actual road.
>
> There is no rehearsal. The road is the test environment. If the change is
> wrong, the traffic jam is real, and the people sitting in it are real.
>
> That is the gap the problem statement is pointing at, and that is what we
> built for."

---

### Slide 5 — What already exists, and where it stops · 75 s · *originality*

**On the slide**
Left column, heading **"Adaptive Traffic Control already exists"**:
> Bengaluru — B-ATCS on CoSiCoSt, ~165 junctions, ~33% travel time cut at Hudson Circle
> Pittsburgh — Surtrac: travel time −25%, waiting −40%
> SCOOT ~15% better than fixed timing · SCATS, InSync worldwide

Right column, heading **"Where it stops"**:
> **Cost** — sensors, cameras, communications across a whole city is a huge bill
> **Sensor failure** — one blocked camera and performance drops until it is fixed
> **Transition trouble** — switching plans or talking to old controllers wastes time
> **Rare events** — accidents, closures, manual diversions are exactly what learned models have not seen
> **Mixed traffic** — two-wheelers, autos, no lane discipline: detection and queue counting get much harder

**Visual (D4):** two-column comparison card. Left column in cool grey (what
exists), right column in amber (the gaps). Sources as tiny footnotes.

**Say:**
> "Before building anything, we checked what already exists. And a lot exists.
>
> Bengaluru already runs an adaptive traffic control system. It is Indian-made,
> called CoSiCoSt, from C-DAC, and it covers around a hundred and sixty-five
> junctions. At one junction they report about a third less travel time. In
> Pittsburgh a system called Surtrac cut travel time by a quarter.
>
> So let me be very clear: adaptive signal control is not a new idea, and we are
> not claiming it. Anybody who tells you 'AI will time your signals' is
> describing something that is already running in Bengaluru.
>
> But those systems stop at five places. They are expensive to install
> everywhere. They break when a sensor breaks. They struggle when switching
> plans or talking to older controllers. They do badly at rare events —
> accidents, closures, diversions — because those are exactly what they have
> never seen. And they struggle with our kind of traffic, where two-wheelers and
> autos do not stay in lanes, so counting the queue is hard.
>
> Those five gaps are what we designed for."

*Footnote sources for the slide:*
`sciencedirect.com/science/article/abs/pii/S2405896324004129` ·
`btp.karnataka.gov.in/214/adaptive-traffic-control-system-(atcs)/en` ·
`researchgate.net/publication/382675720` ·
`journals.sagepub.com/doi/10.1177/03611981251322489` ·
`meadhunt.com/adaptive-traffic-signals/`

---

### Slide 6 — Our solution · 60 s · *originality*

**On the slide**
> **A digital twin of a signalised network, in the browser.**
> Change the timings. Change the traffic. Watch what happens. Test if you were right.
>
> **Adaptive control optimises the average day.**
> **We let you rehearse the bad day — with a preview, a reason, and a receipt.**

**Visual (D5):** the tagline as the biggest text on the slide, with three small
icons under it: an eye (preview), a speech bubble (reason), a receipt (receipt).

**Say:**
> "So this is what we built.
>
> A digital twin of a road network that runs in a web browser. You open a link,
> and you get a working copy of the junctions. You drag a slider to change how
> long the green light stays on. You turn traffic up or down. And you watch the
> queues grow or clear, live.
>
> Three words describe what makes ours different, and I'll show you each one.
>
> **Preview** — you try the timing here before it touches the road.
> **Reason** — every automatic decision tells you why, in a sentence.
> **Receipt** — when you give someone priority, we show you what it cost
> everybody else."

---

### Slide 7 — The product, part one: the planner · 75 s · *feasibility, deliverable*

**On the slide**
> **PLAN mode** — find a better timing
> Target · your best · the gap
> Drag a green. Test it. Race the algorithm.

**Visual:** real screenshot of PLAN mode with the slider and the results table.
Circle three things in the same accent colour: the slider, the delay number, the
results table.

**Say:**
> "This is the first half of the tool: the planner's side. It answers the
> problem statement directly.
>
> You pick a junction. You drag the north–south green from eighteen seconds to
> thirty. Immediately the queue on that side starts draining, and the big number
> at the top — average delay per vehicle — starts moving.
>
> Then you press one button: **test this plan**. And this is the part we're
> proud of. Every test replays exactly the same traffic — the same cars,
> arriving at the same moments, in the same order. So when the number changes,
> it is because your plan changed, not because you got lucky.
>
> Then you can press **beat Max-Pressure**, and a published algorithm plays the
> same round on the same traffic. If the algorithm beats you, the table says so.
> We do not hide that."

---

### Slide 8 — The product, part two: the operator · 60 s · *originality*

**On the slide**
> **OPERATE mode** — survive the day nobody planned for
> Accident · Waterlogging with weight limit · Sudden crowd surge · Signal failure

**Visual:** screenshot of OPERATE mode with the accident active and the queue
spilling back; small icons for the four scenarios along the bottom.

**Say:**
> "This is the second half: the control room's side. This is the bad day.
>
> I press accident. One approach at this junction now cannot move — there is a
> crashed vehicle on it. Watch the queue grow backwards until it reaches the
> junction behind it. That is called spillback, and it is how one small incident
> becomes a jam three streets away.
>
> I press flood. This road is waterlogged. Speeds drop, and buses and trucks are
> not allowed through it any more. That is why our simulation has two-wheelers,
> autos, cars, buses and trucks as separate things, not just identical cars —
> because Indian traffic is mixed, and a weight limit only makes sense if you
> know what kind of vehicle it is.
>
> The operator can now try a different timing here, in the twin, before touching
> the real junction."

---

### Slide 9 — How we answer the five gaps · 45 s · *originality*

**On the slide** — a two-column mapping table:

| What ATCS lacks | What the twin does |
| --- | --- |
| Costly city-wide hardware | Runs on any laptop, no sensors needed to *test* a plan |
| Breaks when a sensor breaks | Sensor failure is a scenario you can rehearse |
| Bad plan transitions | Test the new plan on identical traffic before switching |
| Fails at rare events | Rare events are the main feature, not the exception |
| Mixed traffic is hard | Five vehicle types with PCU weighting, built in |

**Visual (D6):** the table itself, left column amber, right column cyan, arrows
between rows.

**Say:**
> "Here is the same list of gaps from earlier, with our answer next to each one.
>
> We are not replacing adaptive control. We are the thing that should sit next
> to it: the place where you try the plan, rehearse the failure, and see the
> consequences — before any of it is real."

---

### Slide 10 — How it works · 60 s · *feasibility*

**On the slide**
> **A junction is a scheduler.**
> Approaches are processes · Green time is the CPU
> Fixed plan = round robin · Yellow = context-switch cost
> Max green = **starvation prevention** · Priority = **preemption**
>
> Physics: gap-based car-following, calibrated · Webster 1958 · Max-Pressure · seeded replay

**Visual (D7 — block diagram):** five stacked boxes with arrows.
`Sensor layer (mock — swap for real)` → `Simulation core: physics + signal state machines` → `Controllers: fixed / Webster / Max-Pressure / AI` → `Safety layer: min green, max green, yellow — hard-coded` → `Display`.
Draw the Safety layer box in red, straddling the arrow from Controllers to the
core, with a label: **"every controller writes through here."**

**Say:**
> "Very quickly, how it works, in words a computer science person will like.
>
> A junction is a scheduler. The four approaches are processes waiting for the
> CPU, and green time is the CPU. A fixed timing plan is round robin. The yellow
> light is context-switch cost. Maximum green time is starvation prevention. And
> an emergency corridor is preemption.
>
> The important box on this diagram is the red one. Every controller we have —
> the fixed plan, the classical formulas, and the AI — writes through one single
> function. The safety limits sit under that function. So no matter what the AI
> says, it cannot make a light stay red forever, and it cannot skip a yellow.
> Those rules are written by hand and never learned, because a traffic
> department has to be able to ask why something happened."

---

### Slide 11 — The bigger picture · 75 s · *impact, originality*

**On the slide**
> Give an emergency vehicle a green corridor, and somebody pays for it.
>
> Measured in our twin:
> **Saved: 2.9 s** for the priority vehicle
> **Paid: 334 vehicle-seconds** by cross traffic
> Second request during congestion: **REFUSED — network queue above budget**
>
> *Nobody shows the operator this trade at the moment of the decision.*

**Visual (D8 — the receipt infographic):** a balance-scale or two-column
"receipt": left side green with the saved figure, right side amber with the paid
figure, and a stamp underneath reading GRANTED or REFUSED with the reason.

**Say:**
> "Now back to where I started.
>
> Giving an emergency vehicle a green corridor is not free. Everybody else on
> the crossing roads pays for it in waiting time. That is measured in research
> papers, and it is invisible in every control room screen we could find.
>
> Our twin measures both sides. In this run, the priority vehicle saved about
> three seconds, and cross traffic paid three hundred and thirty-four
> vehicle-seconds for it. When the network was already congested, the next
> request was refused — and it told us why.
>
> That matters, because if you ever want to open priority beyond a handful of
> official ambulances — and India needs that, because most patients travel in
> private cars — then the first question a traffic department will ask is 'what
> will this cost my network?'.
>
> We are building that answer. And this twin is the safe place to find it before
> anything goes on a real road."

*(If running late: cut this to the first two sentences plus the numbers. Do not
cut the numbers — they are the strongest thing in the deck.)*

---

### Slide 12 — Feasibility · 45 s · *feasibility*

**On the slide**
> **Already working today**
> Runs in any browser · no install, no licence, no build step
> ~2,000 lines of JavaScript · p5.js for drawing · optional AI layer
> Tested headless: same seed → same result, every time
> Python stays offline for validation and training
>
> **Cost to run: zero.** Cost to try in a city: a laptop.

**Visual (D9 — workflow strip):** five boxes left to right —
`Open link` → `Pick preset` → `Drag timing` → `Test on same traffic` → `Compare and keep the best`.

**Say:**
> "On feasibility — this is not a plan. It runs today.
>
> It is about two thousand lines of plain JavaScript. There is no install, no
> licence, no server, and no build step. You open a link and it works, which
> matters because the people who need it are traffic staff, not developers.
>
> We test it without a browser as well: run the same seed twice and you get
> exactly the same result, which is how we know a comparison is honest and not
> luck.
>
> The AI part is optional. If the internet is down, the tool still works
> completely — it falls back to a rule-based controller."

---

### Slide 13 — Benchmarks · 45 s · *feasibility*

**On the slide** — small bar chart plus a note:
> Same junction, same traffic, same seed:
> Balanced 18 s / 18 s → **16.7 s** average delay
> Skewed 25 s / 8 s → **21.0 s**
> Webster's formula → 12 s / 14 s, 38 s cycle
>
> Yardstick: HCM level of service — A ≤10 s · B 10–20 · C 20–35 · D 35–55 · E 55–80 · F >80

**Visual (D10 — bar chart):** four horizontal bars (Balanced, Skewed, Webster,
Max-Pressure), x-axis "average delay per vehicle, seconds", with LOS bands shaded
behind them.

**Say:**
> "Some numbers, so this is not just a claim.
>
> On identical traffic, a balanced plan gives about sixteen point seven seconds
> of delay per vehicle. Deliberately skew the same junction and it goes to
> twenty-one. So the tool actually shows that timing matters, which is the whole
> premise.
>
> And we do not grade ourselves. We use the standard traffic engineering
> yardstick — level of service — where under twenty seconds is a B and over
> eighty seconds is an F. Our targets are set in those terms."

---

### Slide 14 — Impact · 30 s · *impact*

**On the slide**
> One junction. 2,000 vehicles an hour. Save **5 seconds** each.
> = **2.8 vehicle-hours saved every hour**
> = about **33 vehicle-hours a day**, at one junction
>
> Bengaluru's adaptive system covers ~165 junctions.
>
> *Illustrative arithmetic, not a measured claim.*

**Visual (D11):** a simple multiplication infographic: one junction icon → ×2000
→ ×5 s → equals clock icon. Then a faded row of 165 junction icons.

**Say:**
> "On impact, let me do one honest sum out loud.
>
> Take one busy junction, two thousand vehicles an hour. Save five seconds each.
> That is nearly three vehicle-hours saved every single hour, about thirty-three
> vehicle-hours in a day, at one junction.
>
> Bengaluru's system covers a hundred and sixty-five junctions. I am not
> claiming we deliver that — I am showing you why finding five seconds is worth
> the effort."

---

### Slide 15 — Roadmap and close · 30 s · *impact*

**On the slide**
> **Done:** timing control · seeded testing · five vehicle types · incidents · priority receipt · full model documentation
> **Next:** many competing priority requests at once → green-wave coordination → import a real junction from OpenStreetMap → cross-check against SUMO
> **Later:** quantum-ready phase selection · learned controller · 3D view
>
> *"Signal timing decisions are made every day with no way to try them first.
> This is the place to try them."*

**Visual (D12 — roadmap timeline):** a horizontal arrow, three bands — Done
(solid cyan), Next (outlined), Later (dotted).

**Say:**
> "What is done is what I just showed you. Next is many emergency requests
> competing at the same junction, then coordinating the junctions into a green
> wave, then importing a real Indian junction from OpenStreetMap so the twin is
> a twin of somewhere real. Later, we want to cross-check our numbers against
> SUMO, the standard research simulator.
>
> To finish: signal timing decisions get made every day, and nobody gets to try
> them first. This is the place to try them. Thank you."

---

## 2. Diagram list — what to actually draw

| ID | Slide | Type | Contents |
| --- | --- | --- | --- |
| D1 | 2 | Journey infographic | Road with 4 junctions, car → hospital, red waits, total 5 min lost |
| D2 | 3 | Icon row | Time, fuel, air, patience |
| D3 | 4 | Two-panel comparison | "Today: road is the test" vs "What's missing: try it on a laptop first" |
| D4 | 5 | Two-column card | ATCS strengths vs its five gaps |
| D5 | 6 | Tagline + 3 icons | Preview, reason, receipt |
| D6 | 9 | Mapping table | Five gaps → five answers |
| D7 | 10 | **Block diagram** | Sensor layer → simulation core → controllers → safety layer (red) → display |
| D8 | 11 | Receipt / balance | Saved vs paid, with GRANTED / REFUSED stamp |
| D9 | 12 | Workflow strip | Open → preset → drag → test → compare |
| D10 | 13 | Bar chart | Delay by plan, with LOS bands behind |
| D11 | 14 | Multiplication infographic | 1 junction × 2000 veh × 5 s = 2.8 veh-h/hour |
| D12 | 15 | Roadmap timeline | Done / Next / Later |

**Visual rules:** dark background, one accent colour (cyan) for "ours", amber for
"the problem", red only for danger. Nothing below 18 pt. Every colour-coded thing
also carries a word — a projector will wash out your colours and a colourblind
judge will not see them at all.

---

## 3. Time budget

| Slides | Content | Seconds |
| --- | --- | --- |
| 1–2 | Title and the story | 75 |
| 3–4 | Everyday problem, why cities can't test | 90 |
| 5 | What exists and where it stops | 75 |
| 6 | Our solution | 60 |
| 7–8 | Demo: planner, then operator | 135 |
| 9–10 | Gap mapping and how it works | 105 |
| 11 | The bigger picture | 75 |
| 12–13 | Feasibility and benchmarks | 90 |
| 14–15 | Impact, roadmap, close | 60 |
| | **Total** | **~765 s (12.7 min)** |

That is over ten minutes, deliberately — you will speak faster on the day than
you do in rehearsal, and something always goes wrong. **Cut in this order** if
you need to reach 10:00 flat:

1. Slide 14 impact arithmetic — say one line instead of three (−20 s)
2. Slide 11 — first two sentences plus the numbers only (−40 s)
3. Slide 9 — read only the table heading and two rows (−25 s)
4. Slide 3 — merge into slide 2 as one sentence (−35 s)

**Never cut:** slide 2 (the story), slide 7 (the deliverable demo), slide 11's
numbers, slide 12 (feasibility).

---

## 4. Questions to expect, with answers

| Question | Answer |
| --- | --- |
| "Isn't this just a simulation?" | "A simulation with a real junction's geometry, a documented place where real sensors plug in, and a named control path back out. We call it a partial twin, and the app says exactly that on screen." |
| "Why not use SUMO?" | "SUMO is the right tool for a calibrated research study, and we plan to cross-check our numbers against it. It is the wrong tool for something a traffic operator opens and drags a slider on." |
| "Is the AI actually needed?" | "No, and that is deliberate. Everything works without it. The AI adds a stated reason for each change — and explainability is the documented number one barrier to deploying learned control in real agencies." |
| "How is this different from what Bengaluru already runs?" | "Bengaluru's system controls live signals. It cannot let you try a plan first, it does not explain itself, and it does not tell you what priority costs. Those three things are ours." |
| "How do you know your traffic is realistic?" | "Calibrated car following — forty km/h free speed, one point five metres per second squared acceleration, two second following gap, two seconds of start-up lost time — five vehicle types with PCU weighting, and every constant written down in our model specification." |
| "Where do verified emergency requests come from?" | "That is separate work we're not presenting today. What I can show is what the network does with a request once it believes it." |
| "What's your business model / who pays?" | "A city traffic department, or the agency that already bought an ATCS. It costs them a laptop, not a hardware rollout — which is exactly the barrier we listed on slide five." |

**Never claim:** deployed, piloted, validated against field data, calibrated to a
specific real junction, or that AI signal timing is a new idea.

---

## 5. Rehearsal checklist

- [ ] App open and running before you walk in, traffic load 1.0×, nothing broken
- [ ] A second browser tab already on OPERATE mode, in case a live switch fails
- [ ] Screenshots of every demo slide embedded in the deck as a fallback
- [ ] `docs/LOGIC.md` open on a second device, in case someone asks for the model
- [ ] One rehearsal with a timer, out loud, standing up
- [ ] Decide in advance which of the four cuts you will make if the timer moves fast
