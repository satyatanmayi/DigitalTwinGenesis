# Round 2 demo — click by click

Ten minutes. Two windows. Follow the numbers, do not improvise.

**Criteria being scored:** Technical Execution · Functionality & Completeness ·
UI/UX & User Experience · Feasibility & Scalability · Demo & Q&A · Remarks.

Every block below says which criterion it is earning. If you fall behind, cut
**§6 (QUBO)** first and **§3 (retiming)** last — §3 is the problem statement
itself and must not be cut.

---

## §0 — SETUP (before you are called in) · 60 s, not on the clock

1. **Run `run.bat`.** It serves the app and opens
   <http://localhost:8000/index.html> — this is **THE STREET**.

   > **Do NOT double-click `index.html`.** Opened straight from disk, the
   > browser gives each window its own origin and the two cannot talk, so the
   > control room never connects. The control room will now tell you this in a
   > yellow bar instead of waiting silently — but just use `run.bat`.
2. Click **CONTROL ROOM →** (top right). A second window opens — this is **THE
   CONTROL ROOM**. Click **Got it** on its help card.
3. Put them **side by side**: street on the left, control room on the right.
4. On the street: **PLAN** tab → click **clear all steps**.
5. Check the control room top-right says **live via BroadcastChannel** with a
   green dot.
   - Still "waiting"? Reload the control room.
   - Says **"not connected (opened from a file)"**? You skipped `run.bat`.
     Close both windows and start again from step 1.
6. Leave the street window **in front / focused** — a background tab throttles
   the animation.

**If the wifi is dead:** everything works except the LLM layer, which will say
so on screen. Point at it, do not apologise for it.

---

## §1 — OPEN: what the two windows are · 45 s

> **Criterion: UI/UX — you are establishing that this is one system, not two demos.**

**Do nothing. Just talk and point.**

Say:

> "Two screens, two different jobs.
>
> On the left is **the street** — the digital twin. Four signalised junctions,
> real traffic engineering constants: 40 km/h free flow, two-second headway,
> two-second start-up lost time, 1800 PCU per hour per lane. Five vehicle types,
> because Indian traffic is not all cars.
>
> On the right is **the control room** — what an operator sees. It has no
> physics in it at all. Everything it knows arrives as a message from the
> street, and everything it does leaves as a command. That separation is the
> point: the twin could be replaced with a real junction feed tomorrow and this
> screen would not change."

---

## §2 — THE STORY · 45 s

> **Criterion: Remarks / problem-solution fit.**

Still nothing to click.

> "In India most families do not wait for an ambulance. They drive. That
> happened in my family, with my grandmother. The car was not slow — the time
> was lost standing still, at one red light after another.
>
> So we looked at giving signal priority to people in a genuine emergency. And
> it hit a wall that was not technical. It was trust. If you give one vehicle a
> green, somebody else pays for it — and no traffic department will discuss it
> until you can tell them what it costs.
>
> Nobody could answer that, because there was nowhere to try it. So I built the
> place to try it."

**Move on at 1:30 on the clock. Do not linger.**

---

## §3 — THE DELIVERABLE: change a timing, prove it is better · 90 s

> **Criterion: Functionality & Completeness. This IS problem statement 4. Never cut it.**

On **THE STREET**, **PLAN** tab:

1. Point at **seed 20260905** under "IS IT ACTUALLY BETTER?".
   > "Every test replays identical traffic. Same seed, same vehicles, same
   > arrival times. So any difference you see is the plan, not luck."
2. Drag **N–S GREEN** to **30**, **E–W GREEN** to **8**.
3. Click **TEST THIS PLAN — 100s**. Wait for the row to appear.
   > "That is a deliberately bad plan. There is its average delay."
4. Click **SUGGEST A PLAN (WEBSTER 1958)** — the sliders move.
   > "That is Webster's minimum-delay cycle, from 1958. It is what most Indian
   > junctions actually run."
5. Click **TEST THIS PLAN — 100s** again. The better row is marked.
   > "The tool is not claiming to have invented signal timing. It gives a
   > planner a way to check whether their change beats the textbook — before it
   > goes on a real road."

**Land this line:**

> "Most traffic dashboards tell you what is happening. This one tells you what
> *would* happen if you changed something, and what it would cost."

---

## §4 — THE BAD DAY: the two windows are one system · 90 s

> **Criterion: Functionality & Completeness + UI/UX. Strongest proof the halves are connected.**

On **THE STREET**, click the **OPERATE** tab:

1. Click **ACCIDENT**.
   > "A collision at J2. That approach cannot discharge — watch the queue build
   > backwards."
   Point at the red **X** and the word **BLOCKED** on the canvas.
2. Click **FLOOD**.
   > "And a flooded road. Speeds drop and heavy vehicles are barred by weight
   > restriction — which is why five vehicle types are modelled and not one."
3. **Now turn to the control room.** It has changed on its own.

Point at the **CONDITIONS** panel:

> "The operator's screen did not need telling. It says **THE NETWORK IS
> DEGRADED**, two conditions, and — this is the part that matters — it says what
> each one *means*, not just what it is. 'A priority corridor routed along this
> road will not run at the speed the estimate assumes.'
>
> That is the difference between a dashboard and a control room."

4. Point at the **J2 card** in NETWORK — outlined red, with the note.

---

## §5 — TWO AMBULANCES: the decision, and the veto · 2 min

> **Criterion: Technical Execution + UI/UX. This is your centrepiece.**

On **THE STREET**, **OPERATE** tab:

1. Click **ALL CLEAR** first (clean slate).
2. Click **TWO AMBULANCES**.
3. Point at the canvas — **two white ambulances with red stripes**, coming from
   two different sides of the same junction.
   > "Two ambulances, converging on J1 from adjacent approaches, arriving within
   > a second of each other. Only one phase can be green. There is no version of
   > this where nobody waits."

4. **Turn to the control room.** The plan panel is up with a countdown.

Point at the two cards and read them out:

> "The system has already decided, and it shows its work in two separate
> columns, deliberately not merged.
>
> **The case** — severity, verification, people on board, seconds saved. That is
> about the patients, and it is arithmetic you can check line by line.
>
> **The network** — what the trained model values each junction state at if the
> green goes that way. That is about everybody else.
>
> The model's vote is a *modest adjustment*, not an equal term. I will not let a
> traffic model outvote a critical patient on raw magnitude."

5. Point at the countdown.
   > "And it runs on its own in eight seconds. The operator's job here is not to
   > decide — it is to **veto**."

6. **Click DO NOT PROCEED.**
   > "Stopped. Both ambulances stay queued, signals stay on their normal plan,
   > and the reason is in the log."

7. Click **TWO AMBULANCES** on the street again, and this time **let it run**.
   Watch one tag flip from **HELD** to **PRIORITY**.

**Land this line (it answers a judge's objection before they raise it):**

> "Default is to act. A system that waits for a human to click before an
> ambulance gets a green has moved the delay, not removed it. Acting while a
> person can still stop it keeps the human in charge without putting them in the
> critical path."

8. Point at **COST OF PRIORITY** on the street.
   > "Seconds saved for the ambulance. Vehicle-seconds paid by everybody else.
   > That second number is the reason a traffic department would ever agree to
   > any of this — and no deployed system I could find publishes it."

---

## §6 — UNDER THE BONNET · 2 min

> **Criterion: Technical Execution + Feasibility & Scalability.**

On **THE STREET**, click the **MODEL** tab.

**6a — The trained model (30 s)**

1. Click **TRAINED MODEL** under WHO IS DRIVING.
2. Point at THE TRAINED MODEL facts.
   > "Reinforcement learning, trained in Python against *this exact simulator*
   > running headless in Node — same physics, no second implementation to drift.
   > Fixed plan 36.9 seconds average delay. Max-Pressure — a genuinely good
   > published controller — 33.5. This model 32.6."
3. **Say the failure out loud:**
   > "And the part that did not work: a standard DQN never beat the fixed plan.
   > Monte-Carlo returns did. It is in the write-up."

**6b — The language-model stack (30 s)**

1. Click **LLM AGENT**.
2. Point at THE LANGUAGE-MODEL STACK — three layers on screen.
   > "One model proposes an action and a reason. A second call, different
   > prompt, reviews it and can overrule it — a model marking its own homework
   > is worth little, marking someone else's is worth something.
   >
   > Underneath both, a local rule decides whenever the API is slow or rate
   > limited, and the screen says which layer decided. On venue wifi that will
   > happen, and it is supposed to."

**6c — The QUBO (30 s) — CUT THIS FIRST IF BEHIND**

1. Click **SOLVE THE NETWORK AS A QUBO**.
   > "Every controller so far decides one junction at a time, which is myopic —
   > you can clear your own queue straight into a red next door. This decides all
   > four at once, written as a QUBO, which is the exact form a quantum annealer
   > takes as input.
   >
   > It is solved here **classically**, by simulated annealing, on this laptop.
   > Nothing about it is quantum. But four junctions is only 256 states, so I
   > also brute-forced the exact optimum and checked the annealer found it. It
   > did. That is why you would ever want different hardware — 256 states here,
   > 2¹⁰⁰ for a fifty-junction corridor."

**Never say you ran anything on a quantum computer.**

**6d — Scale (30 s)**

> "Everything so far is my simulator marking its own homework. So I re-ran it in
> **SUMO** — the open-source simulator transport authorities actually use — on a
> real 1.71 km corridor of Vijayawada imported from OpenStreetMap, 19 signalised
> junctions. Ambulance trip time 369 seconds to 177. Waiting time 160 to zero.
> Everyone else 1.5 percent *better*, not worse."

---

## §7 — 3D, briefly · 30 s

> **Criterion: UI/UX.**

1. Click **3D** in the top bar. Orbit once with the mouse.
   > "Same simulation, two views. Nothing in the physics knows which one you are
   > looking at — only the renderer draws. That is why the 3D view was an
   > afternoon's work and touched no traffic code."
2. Click back to **2D**.
   > "2D is the one you make decisions in. 3D is the one you show a mayor."

---

## §8 — CLOSE · 30 s

> **Criterion: Remarks.**

Say the honest positioning **before a judge says it for you**:

> "Adaptive signal control is not new and I will not pretend it is. Bengaluru
> runs B-ATCS on about 165 junctions, around 33 percent improvement at Hudson
> Circle. Pittsburgh's Surtrac reports 25.
>
> So my contribution is narrower, and I would rather say the narrow true thing:
> you can **preview** a change before deploying it, every decision states its
> **reason** in numbers you can check, and granting priority has a **published
> price**. Those three things the deployed systems do not give you.
>
> One thing I did not expect to find: OpenStreetMap tags exactly **two** traffic
> signals across 516 kilometres of Vijayawada road. The data to run a city like
> this mostly does not exist yet — which is the argument for a place to test
> decisions *before* you can afford the sensors.
>
> Before a city changes a signal, it should be able to try the change and see
> who pays for it. That is what this is. Ask me anything — including what does
> not work."

---

## §9 — Q&A cheat sheet

> **Criterion: Demo & Q&A.**

| If they ask | Answer with |
|---|---|
| "What if a terrorist misuses it?" | Press **MISUSE ATTACK**. Rate limit is checked **first**, before anything the requester claims. Two grants per source per four minutes. A perfect liar gets two greens, four minutes apart, on the record. |
| "What if the AI goes wrong?" | Every controller writes through **one function**, `SIM.applyAction()`. Min green, full yellow, all-red, max green are enforced inside it. Worst case is a slightly worse cycle, never an unsafe signal. |
| "You're CSE, why traffic?" | "I am not a city planner. I built the instrument they check a decision with — and that is simulation, concurrency and scheduling, RL, optimisation, distributed systems." |
| "Why JavaScript?" | The client is JS so it opens on any laptop with no install. The RL is Python/PyTorch, validation is SUMO/TraCI, and the trainer drives the JS simulator headless in Node so the model trains on exactly the physics it runs on. |
| "Is it really a digital twin?" | "Today it is a high-fidelity simulation with a sensor abstraction layer. Everything it knows comes through one file, `sensorFeed.js`. Replace one function body with a real API call and nothing above it changes." |
| "How do I know the model trained?" | MODEL tab → loss curve **and** the held-out curve on seeds it never trained on, plus a third seed set used only to pick the epoch. Then: "you can re-run it right now, it takes a few minutes." |
| **"What if an ambulance needs the blocked road?"** | **Be honest — this is not built.** "Right now the priority engine does not read the blocked-approach state, so it would grant a corridor into a road that cannot discharge. And rerouting is not possible in this model because vehicles do not turn — that is a physics change, not a feature. What I would do is refuse the request with the reason, and warn the operator before the ambulance is committed." |
| "Does it scale?" | Browser 4 junctions at 60 fps; SUMO already 19 on a real corridor; the QUBO is the honest answer to what breaks at 50. |

---

## §10 — Timing card (tape this to your laptop)

| Time | Section |
|---|---|
| 0:00 | §1 two windows |
| 0:45 | §2 story |
| 1:30 | §3 retime + test ← **never cut** |
| 3:00 | §4 bad day, both screens |
| 4:30 | §5 two ambulances + veto |
| 6:30 | §6 model / LLM / QUBO / SUMO |
| 8:30 | §7 3D |
| 9:00 | §8 close |
| 9:30 | Q&A |

**Three things not to do:** do not explain the maths, do not claim quantum
hardware, do not skip §3.
