# Pitch — Round 2

**Team NEXUS · solo · IEEE Genesis 2026 · Problem statement 4: Digital Twin of a
Traffic Intersection**

Ten minutes. Elimination round. This document is the whole thing: what to say,
in what order, what the judges are scoring, and what to answer when they push.

Read Part 1 and Part 5 twice. Everything else you already know because you
built it.

---

# PART 0 — The one sentence

If you say nothing else, say this:

> **Before a city changes a signal, it should be able to try the change and see
> who pays for it. We built the place to try it.**

Everything in the demo is evidence for that sentence.

---

# PART 1 — The opening (0:00 – 1:15)

Do not open with architecture. Open with why you, specifically, chose this
problem out of eight.

> "Before I show you anything, one minute on where this came from.
>
> In India, when there is a medical emergency, most families do not wait for an
> ambulance. They put the patient in their own car and they drive. That happened
> in my family — with my grandmother.
>
> The car was not slow. The driver was not slow. The time was lost standing
> still, at one red light after another. A ten kilometre drive across this city
> crosses eight to twelve signalled junctions, and each one can hold you for a
> minute.
>
> So we started a project about getting signal priority to people in a genuine
> emergency — including people who are not in an official ambulance.
>
> And it ran into a wall. Not a technical wall. A trust wall. Because if you
> give one vehicle priority, somebody else pays for it in waiting time. And
> before any traffic department will even discuss it, they ask one question:
> *what will this cost my network?*
>
> Nobody could answer that, because there was nowhere to try it.
>
> So I built the place to try it. That is what I am showing you today."

**Timing discipline: 75 seconds, then move.** This is the emotional anchor, not
the content. If you are still on this slide at 2:00 you have lost two minutes of
demo time.

### Do not say

Do not describe the device, any hardware, the usage counter, or a request that
carries an attested usage record. That is a patent claim and this room is a
public disclosure.

If asked "how do you verify the emergency is real?":

> "That is a separate project and not what I am presenting. What I can show you
> is what the network does with a request *once it decides to believe it* — and
> what it does when it should not believe it."

That answer is not a dodge. It leads straight into the misuse demo, which is
your strongest thirty seconds.

---

# PART 2 — What it is (1:15 – 2:15)

One slide. Three claims, in this order:

1. **It is a digital twin of four signalised junctions.** Real traffic
   engineering constants, not animation: 40 km/h free flow, 1.5 m/s²
   acceleration, 2-second headway, 2-second start-up lost time, 1800 PCU per
   hour per lane of saturation flow. Control delay measured the way the Highway
   Capacity Manual measures it.

2. **You can change it and see what happens.** Move a green time, press test,
   and it replays *the same traffic* — same seed, same vehicles, same arrival
   times — under the old plan and the new one. The difference you see is the
   plan, not luck.

3. **It prices priority.** Every green corridor granted to an emergency vehicle
   is shown with what it saved *and what everyone else paid*, in vehicle-seconds.

Then say the line that separates you from a visualiser:

> "Most traffic dashboards tell you what is happening. This one tells you what
> would happen if you changed something — and what it would cost."

---

# PART 3 — The demo (2:15 – 7:00)

**Five moves. Four minutes forty-five. Do not improvise.**

The PLAN / OPERATE / MODEL tabs exist so you only ever have one job on screen.
Use them — do not scroll a wall of controls at a judge.

### Move 1 — It is a real simulation (45 s) · PLAN tab

Switch to **3D**. Let it run for five seconds in silence. Orbit once.

> "Same simulation, two views. Nothing in the physics knows which one you are
> looking at — the renderer is the only file that draws. That is why I could add
> the 3D view in an afternoon without touching the traffic model."

Switch back to 2D. Say plainly: *2D is the one you make decisions in; 3D is the
one you show a mayor.*

### Move 2 — The deliverable: is a change actually better? (60 s) · PLAN tab

Point at the seed number.

> "Every test replays the same traffic. Same seed."

Set north-south green to 30 s, east-west to 8 s. Press **TEST THIS PLAN**.
Let the result land. Then press **SUGGEST A PLAN (WEBSTER 1958)** and test that.

> "That is Webster's minimum-delay cycle from 1958. It is what most Indian
> junctions actually run. The tool is not pretending it invented signal timing —
> it is giving you a way to check whether your change beats the textbook."

**This is the single most important 60 seconds in the demo.** It is the literal
problem statement: a digital twin you can *use*.

### Move 3 — The bad day, and the price of priority (75 s) · OPERATE tab

Press **ACCIDENT**. Then **TWO AMBULANCES**.

> "Two ambulances, same junction, opposite roads. Both genuine. Something has to
> give, and the interesting question is not who wins — it is whether the system
> can tell you why."

Point at the refusal reason and the score arithmetic.

> "Every decision prints its own working. Nobody has to trust it."

Then point at **COST OF PRIORITY**:

> "It saved this ambulance eleven seconds. It cost everybody else this many
> vehicle-seconds. That number is the reason a traffic department would ever
> agree to any of this — and no ATCS I could find publishes it."

### Move 4 — The misuse attack (45 s) · OPERATE tab

**Say the setup out loud before you press it.** This lands because a judge
already asked it.

> "In my first review a judge asked me: what if a terrorist misuses the button?
> It was the best question I got, so I built the answer."

Press **MISUSE ATTACK**.

> "One source, eight requests, against real congestion. Watch."
>
> "Four refused. And the reason is not that the system judged the emergency —
> it never judges the emergency. The rate limit is checked *before* anything the
> requester claims about itself. You cannot talk your way past it by claiming to
> be more critical. And every attempt is logged against that source."

Full answer in [Part 5](#the-terrorist-question).

### Move 5 — The technical depth (75 s) · MODEL tab

Four things, fifteen to twenty seconds each. **Do not explain the maths.** Point
at the number.

1. **The trained model.**
   > "Reinforcement learning, trained against this exact simulator running
   > headless in Node — same physics, no second implementation to drift. Fixed
   > plan 35.3 seconds average delay. Max-Pressure, which is a genuinely good
   > published controller, 32.0. The trained model 29.8."
   >
   > "And I will tell you the part that did not work: a standard DQN never beat
   > the fixed plan. Monte-Carlo returns did. That is in the write-up."

   *Saying what failed is worth more marks than another feature. It is the
   difference between a student and an engineer.*

2. **The language-model stack.**
   > "One model proposes an action with a reason. A second call, different
   > prompt, reviews it and can overrule it. And underneath both, a local rule
   > decides whenever the API is slow or down — which it will be on venue wifi —
   > and the log says so honestly instead of freezing."

   Point at the three layers on screen.

3. **The QUBO.**
   > "Every controller so far decides one junction at a time, which is myopic —
   > you can clear your own queue straight into a red next door. This decides all
   > four at once, written as a QUBO, which is the exact form a quantum annealer
   > takes as input."
   >
   > Press **SOLVE THE NETWORK AS A QUBO**.
   >
   > "It is solved here classically, by simulated annealing on this laptop.
   > Nothing about it is quantum. But four junctions is 256 states, so I also
   > brute-forced the exact optimum and checked the annealer found it. It did.
   > That is why you would ever want different hardware — 256 states here,
   > 2¹⁰⁰ for a fifty-junction corridor."

   **Never claim you ran anything on a quantum computer.** "Quantum-ready
   formulation, classical solver, verified against brute force" is a strong,
   true, defensible sentence. The overclaim is what gets you eliminated.

4. **SUMO, the independent check.**
   > "Everything so far is my simulator marking its own homework. So I ran it
   > again in SUMO — the open-source simulator transport authorities actually
   > use — on a real 1.7 kilometre corridor of Vijayawada imported from
   > OpenStreetMap, 19 signalised junctions. Ambulance trip time 369 seconds to
   > 177. Waiting time 160 seconds to zero. Everyone else, 1.5 percent better,
   > not worse."

---

# PART 4 — Close (7:00 – 8:00)

Two slides, then stop talking and let them ask.

### The honest positioning slide

Say this before a judge says it for you:

> "Adaptive signal control is not new and I am not going to pretend it is.
> Bengaluru runs B-ATCS on about 165 junctions and reports around 33 percent
> improvement at Hudson Circle. Pittsburgh's Surtrac reports 25 percent.
>
> So my contribution is narrower than 'AI fixes traffic', and I would rather say
> the narrow true thing:
>
> — you can **preview** a change before deploying it, on the same traffic;
> — every decision states its **reason**, in numbers you can check;
> — and granting priority has a **published price**, not a hidden one.
>
> Those three things are what the deployed systems do not give you."

A judge who was about to catch you out has just been disarmed, and you gained
credibility instead of losing it.

### The scale slide

> "One more thing I found and did not expect. OpenStreetMap tags exactly **two**
> traffic signals across 516 kilometres of Vijayawada road.
>
> The data to run a city like this mostly does not exist yet. Which means the
> first useful thing is not a better algorithm — it is a place to test decisions
> before you can afford the sensors. That is what this is."

### Then stop

> "That is the tool. Ask me anything — including what does not work."

Inviting the hard question is a confidence signal, and you have real answers.

---

# PART 5 — The two questions you will be asked

## The terrorist question

*"What if a terrorist misuses the button?"*

This is the question that went badly in Round 1. It is now your best answer.
Give it in four beats, and press the button while you talk.

**Beat 1 — Concede the real point immediately.**

> "You are right, and it is the correct objection. Any system that grants
> priority on request is a system somebody will abuse. If I told you my
> verification was so good it could never be fooled, you should not believe me."

**Beat 2 — Reframe from detection to blast radius.**

> "So I did not try to build unfoolable verification. I built it so that a
> successful abuse is not worth much.
>
> The rate limit is checked **first** — before severity, before verification,
> before anything the requester claims about itself. Two grants per source per
> four minutes. Five requests before it stops listening at all. So the honest
> answer to 'what if they lie perfectly' is: then they get two greens, four
> minutes apart, and every attempt is on the record with the source attached."

**Beat 3 — Show it.** Press **MISUSE ATTACK**. Point at the refusals.

**Beat 4 — The floor underneath everything.**

> "And there is a hard limit underneath all of it that nothing can talk past.
> Every controller in this project — the fixed plan, Max-Pressure, the trained
> model, the language model, the optimiser — writes through exactly one
> function. Inside that function the simulation enforces minimum green, the full
> yellow, the all-red, and maximum green.
>
> So the worst that a malicious request, or a hallucinating language model, can
> do is give you a *slightly worse cycle*. It cannot produce an unsafe signal
> and it cannot starve an approach. I can show you the function — it is about
> fifteen lines."

**If they push further —** *"but they could coordinate ten devices"*:

> "Then you are describing an attack that needs ten verified sources acting
> together, and at that point the defence is not in my code, it is in whoever
> issues the credentials. What my system does is make that attack *expensive and
> visible* instead of free and silent. And the fallback if it ever happens is one
> line: the operator revokes priority network-wide and the junctions drop to
> fixed-time. Which is exactly what they run today."

**Do not say**: "it's just a simulation so it doesn't matter." That throws away
the whole pitch.

---

## The "you're CSE, why are you doing city planning?" question

You are not doing city planning. Say so, cleanly.

> "I am not a city planner and I am not claiming to be. A city planner decides
> *what the road should be*. I built the instrument they use to check a decision
> before they commit to it — and that instrument is entirely a computer science
> problem.
>
> Concretely, what I actually did is:
>
> — **Simulation and systems**: a discrete-time physics model with a
>   deterministic seeded generator, so two runs are byte-identical and an A/B
>   comparison is valid. That is reproducibility engineering, not traffic
>   engineering.
>
> — **Concurrency and scheduling**: multiple priority requests contending for
>   the same shared resource, with arbitration, starvation limits, rate limiting
>   and a single-writer invariant. That is an operating systems problem that
>   happens to be wearing an ambulance costume.
>
> — **Machine learning**: a reinforcement-learning controller trained against
>   the simulator running headless, with the environment shared between the
>   Python trainer and the browser so they cannot diverge.
>
> — **Optimisation**: the network-wide phase choice written as a QUBO and solved
>   by simulated annealing, verified against brute force.
>
> — **Distributed systems**: two independent clients kept consistent over a
>   message channel.
>
> The domain is traffic. The work is computer science. And I would argue that
> is the normal case — the interesting CS problems mostly live inside somebody
> else's domain."

**Then land it:**

> "The reason I chose the traffic domain is in my first slide. It is not an
> academic interest."

---

# PART 6 — The rest of the question bank

**"Why JavaScript? Isn't that a bit light?"** *(the Round 1 wound — answer it
with total calm)*

> "The twin is JavaScript because it has to open on any judge's laptop with no
> install and no build step, and because the browser is where a planner would
> actually use it. But the project is not one language.
>
> The reinforcement learning is Python and PyTorch. The independent validation
> is SUMO with TraCI, also Python. The trainer drives the JavaScript simulator
> headless inside Node's `vm` sandbox over a JSON-lines protocol — which means
> the model trains against *exactly* the physics it runs on, with no second
> implementation to drift.
>
> Choosing JavaScript for the client was a deployment decision. The hard parts
> are not in the client."

**"How do I know the model was actually trained, and not just hand-tuned?"**

This is a fair and common challenge, and there are four separate answers. Give
them in this order — each one is harder to fake than the last.

> "Four things, and you can check all of them.
>
> **One — the training curve.** `tools/training-history.json` has the regression
> loss for every epoch, and it falls monotonically. That is on the slide.
>
> **Two — and this is the one that matters — the held-out score.** Every five
> epochs during training, the half-finished network is scored on three seeds it
> has never been trained on, against both baselines on identical traffic. That
> curve comes down too. A hand-tuned set of numbers does not produce a *learning
> curve on data it has not seen*.
>
> **Three — the weights are the artefact.** `weights.json` carries its own
> metadata: when it was trained, by which method, on how many episodes, on which
> seeds, and its evaluation. The training seeds and the evaluation seeds are
> listed separately, so you can see they do not overlap.
>
> **Four — you can rerun it right now.** `python tools/train.py --probe-every 5`
> trains against the same simulator the browser runs and rewrites the weights.
> It takes a few minutes on this laptop."

**If they ask what the model actually sees:** eight numbers per junction, listed
in `features.js`, all measured relative to whichever phase is currently green —
so it learns "serve the busy side", not "J3 likes north". That file is loaded by
both the Python trainer and the browser, so the two cannot drift apart.

**If they ask why it is so small:** because it has to be honest. Three matrix
multiplies is a model whose every decision I can print on screen as two numbers.
A bigger network would score about the same on four junctions and would be
harder to explain — and explaining the decision is the point of the project.

**"Is this actually a digital twin, or just a simulation?"**

> "Fair distinction. Today it is a high-fidelity simulation with a sensor
> abstraction layer, and I would not call it a live twin because it is not bound
> to a live feed. Everything the model knows about the street comes through one
> file, `sensorFeed.js`, which mocks a detector with noise, a refresh interval
> and dropped frames. Replace the body of one function with a real API call and
> nothing above it changes. The twin-ness is an interface, and the interface is
> already there."

**"How do you know your simulator is right?"**

> "I do not, on its own — which is why I did not stop there. The results are
> reproduced in SUMO, which is maintained by the German Aerospace Center and
> used by real transport authorities, on a real imported corridor. And the
> constants are published traffic engineering values, not tuned to make my
> numbers look good. Plus 21 simulation assertions and 41 browser checks in real
> Chromium that run on every change."

**"What is the innovation? Adaptive control exists."**

Give the honest positioning slide from Part 4 verbatim. Then:

> "The innovation is not the controller. It is that the decision is previewable,
> the reason is stated, and the cost is published. A system that improves your
> traffic but cannot tell you what it did is a system a city cannot audit."

**"Will it scale?"**

> "Three honest answers. The browser twin runs four junctions at 60 fps, and the
> renderer uses instanced drawing, so a few hundred vehicles is fine and a few
> thousand is not — that is a rendering limit, not a model limit. The SUMO side
> already runs 19 junctions on a real corridor. And the optimiser is where scale
> actually bites: brute force is 256 states at four junctions and 2¹⁰⁰ at fifty,
> which is precisely why the QUBO formulation is the interesting part, because
> that is the form annealing hardware takes."

**"What does it cost a city?"**

> "The tool costs nothing to run — it is a static page. What costs money is the
> sensing, and my honest finding is that the sensing mostly is not there yet:
> two tagged signals in 516 kilometres of Vijayawada road. Which is the argument
> for this being the *first* step rather than the last one."

**"What would you build next?"**

> "Three things, in order. Bind `sensorFeed.js` to one real junction's detector
> feed. Push the trained model from four junctions to the full 19-junction
> corridor. And put the cost-of-priority ledger in front of an actual traffic
> department, because the whole thesis is that the number changes their answer —
> and I have not tested that on a human yet."

**"What does not work?"**

Answer it happily. It is a trust question, not a trap.

> "Four things. A standard DQN never beat the fixed plan; only Monte-Carlo
> returns did. No adaptive controller beats an even split when demand is
> symmetric — I had to measure the operating envelope and it is in the write-up.
> The language-model layer is rate limited to roughly one supervised junction
> every nine seconds, so most decisions are made by the local rule, and the
> screen says so. And it is not connected to a real sensor, so it is a twin in
> architecture, not yet in operation."

---

# PART 7 — Rubric map

## Round 2 (elimination, 10 minutes)

| Criterion | Where it is earned | The number to say |
|---|---|---|
| **Working prototype & functionality** | The live demo, all five moves, no crashes | 21 simulation assertions + 41 browser checks in real Chromium, all passing |
| **Technical implementation** | Move 5: RL, LLM stack, QUBO, SUMO | Fixed 35.3s → Max-Pressure 32.0s → trained model 29.8s |
| **Innovation & problem-solution fit** | Cost of priority + preview-before-deploy + the honest positioning slide | Priority ledger: seconds saved vs vehicle-seconds paid — no deployed ATCS publishes this |
| **User experience** | Three tabs, one job per screen; the 2D/3D toggle; every decision prints its reason | A judge can drive it themselves without you narrating |
| **Overall execution** | The story opening, the timing discipline, admitting what failed | 1.71 km real Vijayawada corridor, 19 junctions, ambulance 369s → 177s |

## Round 3 (final)

| Criterion | What to add |
|---|---|
| **Final product** | Both interfaces polished; the code guide as evidence it is maintainable, not a demo hack |
| **Technical excellence** | The single-writer safety invariant; the shared `features.js` so trainer and browser cannot drift; brute-force verification of the annealer |
| **Innovation & impact** | The two-signals-in-516-km finding — this is the slide that makes it about a real city |
| **Scalability** | 4 junctions in browser → 19 in SUMO → the QUBO as the honest answer to what breaks at 50 |
| **Presentation, demo & Q&A** | The prepared answers in Part 5. Rehearse the terrorist answer out loud until it is 60 seconds. |

---

# PART 8 — The numbers, one page

Memorise these six. Do not put more than these on a slide.

| | Before | After | |
|---|---|---|---|
| Browser twin, average delay | 35.3 s (fixed plan) | **29.8 s** (trained model) | 15.6% better than fixed, 6.8% better than Max-Pressure |
| Vijayawada corridor, ambulance trip | 369 s | **177 s** | 52% faster, 1.71 km, 19 junctions |
| Vijayawada corridor, ambulance waiting | 160 s | **0 s** | |
| Everyone else on that corridor | — | **1.5% better** | priority did not cost them |
| SUMO held-out scenarios, ambulance waiting | 12.0 s | **0.0 s** | 5 scenarios, trip 47 s → 32 s |
| Verification | — | **21 + 41 checks** | simulation assertions + real-browser checks |

Context numbers, for the positioning slide only:

- Bengaluru B-ATCS: ~165 junctions, ~33% improvement at Hudson Circle
- Pittsburgh Surtrac: ~25% travel-time reduction
- OpenStreetMap: **2** tagged traffic signals in 516 km of Vijayawada road

---

# PART 9 — Before you walk in

- [ ] `config.js` exists and has the key in it (`config.example.js` is the template)
- [ ] `node tests/run.js` → 21 passed
- [ ] `node tools/browser-check/check.js` → 41 passed
- [ ] `index.html` and `console.html` both open, both tabs left open
- [ ] 3D view loads (needs the Three.js CDN — **check the venue wifi**)
- [ ] If wifi is dead: 2D works, everything works, the LLM layer falls back and
      says so. **Point at that instead of apologising for it.**
- [ ] Browser zoom set so a judge four metres away can read the sidebar
- [ ] Rehearse Part 1 and the terrorist answer out loud. Twice. Time them.

**The two sentences to fall back on if you lose your place:**

> "Before a city changes a signal, it should be able to try the change and see
> who pays for it."

> "It never judges whether the emergency is real. It decides what the network
> does with a request, and it publishes what that cost."
