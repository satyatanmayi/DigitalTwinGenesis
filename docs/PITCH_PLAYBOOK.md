# Pitch Playbook — everything you need to be ready

*Answers to every doubt you raised, the demo taught step by step, and the words
to say. Read this once end to end, then rehearse from Part 2.*

---

# PART 1 — The opening

## 1.1 Yes, put Kalavathi on the ambulance slide

That slide is the right and only place for it. It earns "problem understanding"
because it explains *why you personally chose this problem*, and it sets up the
priority-cost slide later. But it must be **45 seconds, not three minutes**, and
it must describe a problem, never a mechanism.

### The speech — say this, roughly word for word

> "Before I show you the tool, one minute on where this came from.
>
> In India, when there is a medical emergency, most families do not wait for an
> ambulance. They put the patient in their own car and they drive. That happened
> in my family.
>
> And the car was not slow. The driver was not slow. The time was lost standing
> still — at one red light after another. A ten kilometre city drive crosses
> eight to twelve signalled junctions, and each one can hold you for a minute.
>
> So we started a project called Kalavathi, about getting signal priority to
> people in a genuine emergency, including people who are not in an official
> ambulance.
>
> And that project ran into a wall. Not a technical wall — a trust wall. If you
> give priority to a vehicle, somebody else pays for it in waiting time. Before
> any traffic department will even discuss opening this up, they will ask one
> question: *what will this cost my network?*
>
> Nobody could answer that question, because there was nowhere to try it.
>
> So we built the place to try it. That is what I am showing you today."

That last line is your bridge, and it is a good one: the twin is not a side
project from Kalavathi, it is **the thing Kalavathi needed and did not have**.

### What you must not say

Do not describe the device, any hardware, the usage counter, or a request that
carries its own attested usage record. That is the patent claim, and a public
presentation is public disclosure.

If asked "how do you know the emergency is real?", say:

> "That is the separate project, and it is not what I am presenting today. What
> I can show you is what the network does with a request once it believes it."

## 1.2 The transition into ATCS — your line, tightened

You had the right instinct. Use this:

> "Now, to actually do this, you need a traffic system that can be told what to
> do. And that already exists. Adaptive traffic control is real, it is deployed,
> and it works — Bengaluru runs one across about a hundred and sixty-five
> junctions today.
>
> So I am not here to tell you I have invented adaptive signal control. I am
> here because when we studied those systems, we found five places where they
> stop. And every one of them is a place where a decision gets made with no way
> to test it first."

Then go to the five gaps. This ordering is strong: prior art first, gaps second,
your tool third. It makes you sound like someone who did the reading.

---

# PART 2 — How to demonstrate the simulator

You said you don't know how to demo it. Here is the fix: **you do not demo the
whole tool. You demo six controls in one fixed order and never improvise.**

## 2.1 What each control actually does

| Control | Where | What it does | The one sentence to say |
| --- | --- | --- | --- |
| **N–S GREEN slider** | Signal timing panel | How many seconds north–south gets a green each cycle | "This is the timing plan — the thing a traffic engineer actually sets." |
| **E–W GREEN slider** | Signal timing panel | Same for east–west | "The two together are the cycle. Give one more, the other gets less." |
| **TRAFFIC LOAD slider** | Demand panel | Scales how many vehicles arrive, 0.2× to 3× | "This is rush hour arriving." |
| **TEST THIS PLAN** | Find a better plan panel | Replays identical traffic and scores this plan | "Same cars, same arrival times, every test. So the difference is the plan, not luck." |
| **Scenario buttons** | The bad day panel | Accident, flood, surge, signal failure | "One click and the day goes wrong." |
| **PRIORITY REQUEST** | The bad day panel | An emergency request arrives; the network grants or refuses it | "And this is the part nobody shows you." |

Everything else on screen — Webster, Max-Pressure, the AI toggle, sim speed,
the charts — is **for answering questions, not for demonstrating.** Leave them
alone unless a judge asks.

## 2.2 The demo, in order, with the words

Rehearse exactly this. It takes about three minutes.

**Step 0 — before they arrive.** App open, running, traffic load 1.0×, fixed
plan, nothing broken. Never open it in front of them.

**Step 1 — orient them (15 s).**
> "This is four junctions of a city grid. Those are real vehicles — two-wheelers,
> autos, cars, buses — each one following the vehicle in front of it. And this
> number up here is the only one that matters: average delay per vehicle."

Point at the number. Do not move anything yet. Let them watch one cycle.

**Step 2 — the deliverable (40 s).**
Drag **E–W GREEN** from 18 up to about 30.
> "I have just given east–west twelve more seconds of green. Watch the east–west
> queue drain… and watch north–south start to build, because I took those
> seconds from somewhere."

Point at the delay number as it moves.
> "That is the whole product in one gesture. A traffic engineer can do this
> today only by changing a real signal on a real road."

**Step 3 — the proof (45 s).**
Press **TEST THIS PLAN**. Wait the ~12 seconds — *fill the silence*:
> "This is replaying exactly the same traffic — the same vehicles arriving at
> the same moments in the same order — under my new plan. That is the whole
> point. If I just watched the screen and felt it got better, I would be
> guessing."

When the row appears:
> "There it is, scored. Now I change the plan again and test again, and the
> table keeps every attempt and marks the best one. This is a planner finding a
> better timing, with evidence, in one minute instead of one month."

**Step 4 — the bad day (40 s).**
Press **ACCIDENT**.
> "A collision just blocked one approach. Nothing can discharge from it. Watch
> the queue grow backwards — and there, it has reached the junction behind. One
> incident becomes a jam three streets away. This is exactly the situation
> adaptive systems hand back to a human on a radio."

Press **FLOOD**.
> "And this road is now waterlogged. Speeds drop, and buses and trucks are
> barred from it by weight limit. That is why our traffic has five vehicle types
> and not one — a weight restriction is meaningless if every vehicle is the same."

**Step 5 — the receipt (40 s).**
Press **PRIORITY REQUEST**.
> "An emergency request just arrived, and the network granted it — the corridor
> is held green. Now look at the ledger. The priority vehicle saved this many
> seconds. Cross traffic paid this many vehicle-seconds for it. Both sides,
> measured, at the moment of the decision."

Now push **TRAFFIC LOAD** up to about 2.5×, wait a few seconds, and press
**PRIORITY REQUEST** again.
> "Now the network is congested. Same request… refused. And it says why: the
> network queue is above the budget. A system that can only say yes cannot be
> opened to more than a handful of vehicles."

**Step 6 — stop.** Do not keep clicking. Say:
> "Everything else on this screen is there to answer questions, and I am happy
> to go into any of it."

## 2.3 Rules for demoing under pressure

- **One hand on one control.** Never drag two sliders while talking.
- **Say what will happen before you click.** People see what they are told to
  look for. If you click first and narrate after, they miss it.
- **Silence is fine.** During the 12-second test, keep talking about *why* the
  seed matters — that is your strongest technical point and it needs the time.
- **If something breaks:** press REPLAY SAME TRAFFIC and carry on talking. If
  the whole page dies, switch to the deck's diagram slides — they show the same
  workflow and you lose nothing but the animation.
- **Never open the browser console.** Never explain a bug. Move forward.

---

# PART 3 — Your doubts, answered

## 3.1 Who is the "planner" and who is the "controller"? (plain language)

**The planner** is the traffic engineer. They work office hours, at a desk, with
a map. Their job is: *what should the timings be?* They set a plan for the
morning peak, another for the evening peak, another for Sunday. They think in
weeks. When they get it wrong, thousands of people lose a few minutes each, every
day, until someone notices.

**The controller** — the control room operator — sits in front of a wall of
screens right now. Their job is: *what do we do about what is happening?* An
accident on the ring road. A procession. Waterlogging. A VIP movement. An
ambulance that needs to get through. They think in minutes, and they mostly act
by phone and radio.

**The one-line version for the stage:**
> "The planner decides what normal should look like. The operator deals with the
> day that isn't normal. Our tool has a mode for each — and today, neither of
> them has a place to try a decision before making it."

Both are your users, and both sit inside a city traffic department. That is the
answer to "who is this for?".

## 3.2 How exactly do users find better timings?

Say it as a loop of five things:

1. **The tool tells them the target.** "Average delay under 20 seconds" — which
   is level of service B on the standard traffic engineering scale, not a number
   we invented.
2. **They change a green time** and immediately see queues respond. This builds
   intuition — it is not the measurement.
3. **They press test.** The tool replays *identical traffic* under the new plan
   and scores it. Warm-up is discarded so the number is not polluted by the
   network filling up.
4. **The tool tells them what to try next**, by name and number: "east–west is
   the critical phase at 91% of capacity; its green is 18 seconds; try 24."
5. **They race the algorithms.** Webster's 1958 formula and Max-Pressure play the
   same round on the same traffic. If the algorithms win, the table says so.

**Why this beats the traditional method:** today the equivalent loop is *change
the real signal → wait a week → look at complaints and travel-time data → change
it again*. That loop takes months and cannot isolate cause from weather,
holidays, or a lorry breaking down on Tuesday. Ours takes twelve seconds and
holds everything else constant.

That last sentence — **"we can hold everything else constant, and the real road
never can"** — is the strongest single argument you have. Use it.

## 3.3 Deciding *before* the ambulance arrives

This is your best idea and it needs precise words, because there are two things
here and only one of them is safe to claim.

**What the tool does (safe, demonstrable, and genuinely the novel part):**

When a priority request arrives, the network does not just say yes. It:

1. **Estimates when that vehicle reaches each junction on its route**, from the
   current speeds and queues in the twin.
2. **Simulates both futures** — grant it, or don't — and measures the difference
   in delay for the priority vehicle and for everyone else.
3. **Ranks it against any other request already in the system**, using inputs it
   is given: severity class, how long this request has already waited, route
   length, and how loaded the network is right now.
4. **Presents the operator with the decision and the arithmetic**, then either
   grants, queues, or refuses — each with a stated reason.

That is "analyse before deciding", and it is real.

**The part to be careful with: patient vitals.**

Your own Kalavathi decisions already settled this, and the decision was right:
**severity comes from the hospital, never from a model.** Automated medical
triage from symptoms or vitals is out of scope on safety grounds — a wrong
automated triage is a wrong medical decision, and no traffic system should be
making one.

So the correct phrasing is:

> "The severity of the case is an input, and it comes from a hospital, not from
> us. What we decide is a traffic question: given a case of this severity, and
> this much waiting, and this much congestion — should the network grant the
> corridor, and what will it cost?"

That is defensible, safer, and actually sounds *more* expert than claiming your
traffic system reads vitals.

## 3.4 "Is traffic really only rule-based?" — No, and you must know this

**This is the question most likely to catch you out. Learn this section.**

| System | What it does | Predictive? |
| --- | --- | --- |
| Fixed-time plans | Timings set from historical counts | No |
| **SCATS / SCOOT** | Centralised; compute plans from detector data and historical patterns; adjust cycle, split and offset continuously | Model-based optimisation — more than rules |
| **Surtrac** (Pittsburgh) | Decentralised, schedule-driven; treats platoons as indivisible, solves a scheduling problem per junction and passes intentions to neighbours | **Yes — genuinely predictive over a short horizon** |
| **Google Project Green Light** | Uses Google Maps driving data and ML to model traffic and *recommend* timing plan changes to city engineers. Live in 14 cities; needs no fixed sensors | Yes — ML-based, and it is your closest competitor |
| Deep RL | Very heavily researched, benchmarked (RESCO, CityFlow) | Yes — but essentially not deployed |
| Model predictive control | Studied in traffic for over two decades | Yes — and per the literature, **none has been tested in real-world deployment** |

**So never say "traffic control is just rules".** Say this instead:

> "Signal control is already model-based and in places genuinely predictive.
> Surtrac schedules platoons ahead of time. Google's Project Green Light uses
> Maps data to recommend better plans to city engineers. What none of them gives
> the person responsible is a place to *try* a change before it goes live — and
> that gap is not theoretical. Seattle's transport department reversed one of
> Google's recommended changes because, in the field, it did not produce a net
> benefit. Somebody found that out on a real street with real drivers. That is
> exactly what a rehearsal is for."

**That Seattle fact is the single most useful thing in this playbook.** It is a
real, citable case where a state-of-the-art AI recommendation had to be undone
after deployment — which is the precise argument for your tool's existence.

## 3.5 The neural network — what is real and what is planned

Be exact here, because "we use AI" invites a hard question.

**Today, in the running tool:** there is no neural network in the control loop.
There are four controllers — a fixed plan, Webster's formula, Max-Pressure, and
a large language model that produces a decision *and a written reason*. The
safety limits are hard-coded beneath all of them.

**What is planned, and how it would actually work:**

1. **The simulator is the training ground.** You cannot train a controller on a
   real city, because the failures are real. You train it in the twin, where you
   can generate thousands of labelled bad days overnight — collisions, floods,
   surges, competing priority requests.
2. **What the network learns is the ranking, not the safety.** Minimum green,
   maximum green, yellow, conflict prevention stay hard-coded rules for ever,
   because a traffic authority must be able to ask why something happened. The
   learned part is where a hand-written rule would be arbitrary anyway — how to
   weigh severity against waiting time against network cost.
3. **The novelty is the state vector, not the technique.** Existing traffic RL
   assumes every priority requester is a genuine, authorised ambulance, so no
   published model has *how much we trust this request* or *what this grant will
   cost the network* as input features. Ours would.
4. **Concurrency is handled by arbitration, not by the network.** Two requests
   that conflict at one junction are resolved by a scoring rule you can read,
   with the loser queued and told what it is waiting for. That stays auditable.

**The sentence for the stage:**
> "The neural network doesn't drive the signals. It learns how to *rank competing
> demands*, it is trained inside this simulator on bad days we can generate by
> the thousand, and every safety limit sits underneath it in hard-coded rules it
> cannot touch."

## 3.6 "One blocked camera degrades the junction" — what we honestly solve

Be careful: **we do not fix broken hardware.** Claiming that gets you caught.
Three honest answers, in increasing strength:

1. **Rehearsal.** You can practise the degraded day — the tool has a
   signal-failure scenario — and decide in advance which fallback plan to switch
   to when detection dies. Today that decision gets made in a panic.
2. **Lower dependence.** A twin is a *model*, not a detector. It can run from
   periodic counts rather than continuous video, so a planner can evaluate a
   timing for a junction that has no adaptive hardware at all. That is the same
   insight Google's Green Light exploits — no fixed sensors needed to recommend
   a plan.
3. **Divergence as an alarm — the strongest one.** A twin runs alongside the
   real junction, predicting what the queues should be. When the reported data
   stops matching the prediction, either the world changed or the sensor broke.
   That is a genuine digital-twin capability, it is how twins are used in other
   industries, and it turns a silent failure into an alert.

**The sentence:**
> "We can't repair a camera. But we can rehearse the day it fails, we can
> evaluate junctions that never had one, and because the twin is always
> predicting what the junction should look like, a sensor that stops matching the
> prediction becomes an alarm instead of a silent failure."

Point 3 is future work — say so.

## 3.7 Is the twin used by the control room? And is it usable by them?

Yes — and be honest about the state of it.

> "The twin runs in a browser, which is deliberate: a control room can open it on
> a machine they already have, with no install and no licence. Today the
> interface is built for someone who understands traffic engineering. Making it
> usable by an operator under pressure — bigger targets, fewer numbers, one
> recommended action at a time — is the next piece of work, and we would want to
> sit in an actual control room for a day before designing it."

Saying "we would want to watch them work first" scores better than claiming you
already designed for them. It shows you know that usability is researched, not
guessed.

## 3.8 Slides 11, 12 and 14 explained

### Slide 11 — "Priority has a price"

**What is on it:** two numbers side by side — 2.9 seconds saved by the priority
vehicle, 334 vehicle-seconds paid by cross traffic — plus a refusal stamp, and
the decision flowchart.

**What it means:** we ran a real priority corridor in the twin and measured both
sides. The vehicle that got priority saved about three seconds against what an
ordinary vehicle was losing on the same network at the same time. Everyone
crossing paid a combined 334 seconds of extra waiting.

**Why it is on the slide:** because that is a *bad trade*, and we show it anyway.
Under light traffic, giving priority costs more than it saves. That honesty is
the argument for measuring it at all — and it is the reason a traffic department
would trust the tool. A tool that always flatters your decision is not a tool.

**What to say if asked "so priority is bad?":**
> "Under light traffic, yes — and that is worth knowing. The trade gets better as
> congestion rises and the vehicle would otherwise be stuck for minutes. The
> point is that right now nobody measures it at all, so nobody can tell you which
> case they are in."

### Slide 12 — "A junction is a scheduler"

**What is on it:** the scheduling analogy plus the block diagram, with one box in
red.

**What it means:** the four approaches are like processes waiting for a CPU, and
green time is the CPU. A fixed plan is round-robin. The yellow light is
context-switch cost. Maximum green is starvation prevention. An emergency
corridor is preemption, and admission control is what stops preemption storms.

**Why it is on the slide:** it tells a computer science audience, in ten seconds,
that this is a scheduler under safety constraints and not an animation. It also
sets up the red box.

**The red box is the point of the slide.** Every controller — fixed, Webster,
Max-Pressure, the language model — writes signals through one function, and the
safety limits live underneath it. So no model output can starve an approach or
skip a yellow. Say exactly that; it is the answer to "how do we know your AI is
safe?" before anyone asks.

### Slide 14 — "Same junction, same traffic, only the plan changed"

**What is on it:** two bars — 16.7 seconds for a balanced 18/18 plan, 21.0
seconds for a skewed 25/8 plan — drawn against level of service bands.

**What it means:** we took one junction, one fixed random seed, and ran the same
traffic twice under two plans. Skewing the plan cost 4.3 seconds per vehicle and
dropped the junction a whole grade on the standard scale.

**Why it is on the slide:** it is the tool proving its own premise. If timing did
not matter, the two bars would be the same and the entire project would be
pointless. It also demonstrates the seeded comparison — the thing that makes
every other number in the deck trustworthy.

**What to say:**
> "This is the tool demonstrating its own premise. Same junction, same traffic,
> same measurement window. The only thing I changed was the plan, and it cost
> four seconds per vehicle — which is a whole grade on the scale traffic
> engineers actually use."

---

# PART 4 — Prompt for the operator-facing website

You described the right thing: the simulator shows *the world*, and a separate
interface shows *the decision the operator has to make about it*. Hand the block
below back to me when you want it built.

```
Build an operator decision console as a companion to the traffic twin. Single
page, vanilla JS, no build step, dark, projector-legible. It does NOT simulate
traffic itself — it subscribes to the twin's state and turns it into decisions.

THE CORE LOOP
1. WATCH — the console monitors the twin's live state and looks ahead for
   conflicts that are about to happen, not ones that already did.
2. ALERT — when it predicts one, it raises a card at the top of the screen with
   a countdown: "In 40 s: two priority requests will need opposite phases at J2."
3. OPTIONS — it presents 2-4 concrete actions, each with predicted consequences
   measured by running the twin forward: who gets through, how much delay each
   option costs the rest of the network, and which approach absorbs it.
4. RECOMMEND — one option is marked recommended, with the arithmetic shown.
5. TEST — the operator can run any option forward in the twin before committing.
6. COMMIT / LOG — the chosen action is applied and written to an append-only
   log with the reason, the alternatives, and what it was predicted to cost.

EVENT TYPES TO DETECT
- Two priority requests converging on a shared junction (the headline demo)
- Queue spillback about to reach an upstream junction
- An approach exceeding its capacity for more than N cycles
- A priority request arriving while the network is already over budget
- Sensor divergence: reported data no longer matching the twin's prediction

SCREEN LAYOUT
- Top third: the active alert with its countdown and severity
- Middle: option cards side by side, each with predicted metrics and a TEST button
- Right rail: network summary — total queue, average delay, active priorities
- Bottom: decision log, newest first, each entry showing what was chosen and why

DESIGN RULES (an operator under pressure, not an analyst)
- One decision on screen at a time. Never two competing alerts.
- Every option states its cost in plain language: "adds about 20 seconds of
  waiting for 14 vehicles on the north approach"
- Colour never alone; every state has a word
- Nothing below 18 px; readable from two metres
- A visible DO NOTHING option, with its consequences also predicted — because
  doing nothing is a real choice and it should be priced too

EXPLICITLY OUT OF SCOPE
- Deciding whether an emergency is genuine. Severity and verification arrive as
  inputs from outside; the console never infers them.
- Any medical inference of any kind.
```

---

# PART 5 — Hard questions, with answers

| They ask | You say |
| --- | --- |
| "Google already does this." | "Green Light recommends plans from Maps data, offline, to engineers — and Seattle reversed one of its recommendations because it didn't work in the field. That is our case, not theirs: nobody could try it first." |
| "Isn't this just SUMO in a browser?" | "SUMO is the right tool for a calibrated research study and we will validate against it. It is the wrong tool for someone who has to make a decision in the next five minutes." |
| "Where is the AI?" | "Optional, and by design. The tool works fully without it. Its job is to give a written reason for each change — explainability is the documented number one barrier to deploying learned control." |
| "How do you know your traffic is realistic?" | "Calibrated constants, five vehicle types with PCU weighting, start-up lost time, and every value written down in the model spec. And we state what is missing: no turning, no route choice, no pedestrians." |
| "What is actually new?" | "Three things. A rehearsal before a change goes live. A stated reason for every automatic decision. And a measured price on granting priority. None of the deployed systems give an operator any of the three." |
| "Who pays for it?" | "A traffic department that already owns an adaptive system, or one that cannot afford one. It costs them a laptop." |
| "How do you validate it?" | "Next step is cross-checking our numbers against SUMO on the same scenario. After that, a real junction's counts from a city." |
| "What if the AI hallucinates?" | "It cannot do damage. Its output is one of four actions, validated against a list, applied through one function with the safety limits beneath it. A bad answer becomes a slightly worse cycle, never an unsafe one." |
```
```

---

# PART 6 — Rehearsal plan for the next few hours

1. Read Part 1 aloud twice. The opening is the only part that must be
   near-verbatim.
2. Run the demo in Part 2 three times with a timer. Do it once with the screen
   turned away from you, narrating from memory — that is how you find out which
   step you don't actually know.
3. Read Part 3.4 twice. That is the section that saves you if a judge knows the
   field.
4. Decide your two cut points in advance: the impact arithmetic and half of the
   priority slide.
5. Have the deck open in one tab, the twin in another, and the project page in a
   third. If any one of them fails, you can present from either of the other two.
