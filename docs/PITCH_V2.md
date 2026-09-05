# Pitch v2 — corrections, rubric map, and the speech

*Built against the six-criterion rubric. Read Part 1 before you rehearse: four
things in your current explanation would not survive a knowledgeable question.*

---

# PART 1 — Do's and don'ts in your own explanation

## ❌ Correction 1 — the sensor claim. This is the important one.

**What you said:** "there are blocked sensors which degrade the system, but this
does not really matter here, because we use a laptop and a GPS module in the car."

**Why that fails:** GPS in the emergency vehicle tells you where *that one
vehicle* is. It tells you nothing about the queue on the north approach. A twin
that does not know the queues cannot decide anything — it would be guessing.

**What is actually true, and it is still a good answer:**

| Claim | Verdict |
| --- | --- |
| "GPS removes the hardware needed to *detect the priority vehicle*" | **True and valuable.** Systems like Opticom need an emitter in the vehicle and a receiver at every junction. A phone or a small GPS module replaces both |
| "So we don't need sensors at all" | **False.** You still need traffic-state data to know the queues |
| "A blocked camera doesn't matter to us" | **False as stated** |

**Say this instead:**

> "GPS removes one kind of hardware — the special detector at every junction that
> spots an approaching emergency vehicle. That hardware is gone; the phone
> replaces it.
>
> We still need traffic data. But a twin needs *less* of it and *cheaper* kinds
> of it, because it is a model rather than a detector — it can run from periodic
> counts, or from probe data the way Google's Green Light does, instead of
> continuous video at every junction.
>
> And because the twin is always predicting what the junction should look like,
> a feed that stops matching the prediction becomes an alarm that something has
> broken — instead of a silent failure nobody notices for a week."

That last paragraph is a genuinely strong point. Do not throw it away by
overclaiming the first one.

## ❌ Correction 2 — "the neural network will make it an actual simulation"

**What you said:** "For now I am simulating using JavaScript, it is not accurate
yet; after integrating the model it will be an actual simulation."

**Why that fails:** a neural network does not make a simulation accurate. What
makes a simulation accurate is **calibration against real data and validation
against a trusted simulator**. A neural network is a *controller* — it decides
what the signals do. Those are two different things, and mixing them up is the
kind of mistake a judge in this field notices immediately.

**Say this instead:**

> "Accuracy and intelligence are two separate problems here.
>
> Accuracy comes from calibration — our vehicle physics uses real values, and
> the next step is cross-checking our numbers against SUMO, the standard open
> research simulator, on the same scenario.
>
> The neural network is not there to make it accurate. It is there to decide
> *ranking* — which of two competing emergency requests gets the junction. And it
> gets trained inside this simulator, because you cannot train a controller on a
> real city where the failures are real."

## ❌ Correction 3 — what ATCS actually does about emergency vehicles

**What you said:** ATCS "takes emergency vehicles and converts arriving signals
to green before their arrival."

**Careful.** Adaptive control and emergency preemption are **two different
functions**. Adaptive control (SCATS, SCOOT, CoSiCoSt) optimises cycle, split
and offset from detector data. Emergency preemption is a separate capability,
standardised as **NTCIP 1211**, with a *priority request generator* in the
vehicle and a *priority request server* at the junction — and the standard
already covers triaging multiple requests from different vehicle classes.

**Why this matters to you:** if you say "ATCS can't handle two ambulances", a
judge who knows NTCIP 1211 will say the standard covers exactly that. Your claim
must be narrower and it is still true:

> "The standard already defines how a junction triages competing requests. What
> it does not define — and what no deployed interface shows — is *what the grant
> costs everybody else*, and how you would decide when the requesters are
> thousands of ordinary cars rather than fifty authorised ambulances."

## ❌ Correction 4 — quantum

**What you said:** "maybe quantum can be integrated because priority scheduling
is not easily determined."

**Say it precisely, or leave it out.** The honest version:

> "Choosing which phase to serve across several junctions at once, under conflict
> constraints, is a combinatorial optimisation problem. That maps to a QUBO —
> the standard form quantum annealers accept, and there is published work
> formulating traffic signal optimisation exactly this way and running it on
> D-Wave hardware. We would formulate it that way and solve it classically for
> now. Calling it quantum-ready is honest; calling it quantum today would not be."

## ✅ What in your explanation is already strong — keep it

- The personal story and why families drive patients themselves. Keep it, 45 s.
- "It costs a laptop instead of a hardware rollout." True and powerful.
- **The two-ambulances-adjacent example.** This is your best single idea. It is
  concrete, everyone understands it instantly, and it is where existing practice
  is genuinely thin. Build the pitch around it.
- The 2,000 vehicles × 5 seconds arithmetic. Your numbers were right: 2.8
  vehicle-hours per hour, about 33 a day. Keep calling it illustrative.
- "Act first and find out later" as the description of today's practice. That is
  exactly the problem and it is well put.

## The four sentences you should never say

1. "ATCS is just rule-based." *(It is model-based; Surtrac is predictive; Google's Green Light is ML.)*
2. "We don't need sensors." *(You need fewer and cheaper ones.)*
3. "The neural network makes the simulation accurate." *(Calibration does.)*
4. "We use quantum computing." *(Say quantum-ready formulation, solved classically.)*

---

# PART 2 — Your two technical questions

## 2.1 "Why round robin?"

Round robin is not our algorithm. It is the **analogy for the baseline**, and it
is there because it is exactly what a fixed-time signal plan is.

A fixed-time signal gives north–south a fixed slice of time, then east–west a
fixed slice, then back — regardless of who is actually waiting. In operating
system terms, that is round robin with a fixed quantum. The analogy is useful
because it immediately tells a computer science audience what is wrong with it:
round robin is fair but blind. It gives an empty approach the same slice as one
with fourteen vehicles queued.

Then the rest of the analogy writes itself:

| Signal concept | Scheduling concept | What it does |
| --- | --- | --- |
| Fixed plan | Round robin, fixed quantum | Fair, blind, the baseline |
| Yellow + all-red | Context-switch cost | Real time that serves nobody — 4 s per change here |
| Minimum green (5 s) | Minimum quantum | Stops thrashing between phases |
| Maximum green (60 s) | Ageing / starvation prevention | No approach waits forever |
| Max-Pressure | Greedy priority by queue weight | Serves the biggest queue — better, still myopic |
| Emergency corridor | Preemption | High-priority job seizes the resource |
| Admission control | Preventing a preemption storm | Refuse when the system cannot afford it |

**Say it like this:**
> "A fixed signal plan is round robin — it hands out equal slices whether or not
> anybody is waiting. That is what every junction in the country does by default,
> and it is why the baseline is beatable."

## 2.2 "How is the queue stacked?"

Physically, in the simulation, this is what happens:

1. **Arrival.** A vehicle enters the road at the edge with a random gap after the
   previous one — about one every eight seconds per lane at normal load.
2. **Following.** Each vehicle looks at whatever is directly ahead — the vehicle
   in front, or the stop line if the signal is not green — and picks a target
   speed from that gap. Big gap, free speed. Small gap, slow. No gap, stop.
   That is a car-following model, and it is why the queue *forms backwards* from
   the stop line rather than appearing all at once.
3. **Standing.** A stopped vehicle sits at its own length plus a two-metre gap
   behind the one in front. So a queue of twenty two-wheelers is much shorter
   than twenty buses — which is why vehicle type matters.
4. **Discharge.** When the light turns green, the first vehicle waits **two
   seconds** — start-up lost time, a real measured phenomenon — then accelerates,
   then the second, then the third. The queue clears as a *wave*, not all at
   once. At full flow this settles to roughly one vehicle every two seconds per
   lane, which is the standard saturation flow of about 1,800 per hour.
5. **Counting.** We count a vehicle as queued if it is within 60 metres upstream
   of the stop line and moving below 8 km/h. We report that count two ways: as a
   number of vehicles, and weighted by **PCU** — passenger car units — where a
   two-wheeler counts 0.25 and a bus counts 3.0, because "twelve vehicles" means
   something completely different in each case.
6. **Delay.** For each vehicle we compare how long the trip actually took against
   how long it would have taken at free-flow speed. The difference is **control
   delay**, and that is the number at the top of the screen.

**The one-line version:**
> "Vehicles queue backwards from the stop line, they discharge in a wave two
> seconds after green with one vehicle roughly every two seconds, and we count
> the queue both in vehicles and in passenger car units — because twelve
> two-wheelers and twelve buses are not the same junction."

---

# PART 3 — The rubric, and where each mark comes from

| Criterion | Marks | Where you earn it | What loses it |
| --- | --- | --- | --- |
| **Problem Understanding** | 15 | Slides 2–5: the story, why priority matters, what ATCS is and its real limits — cited, not invented | Vague "traffic is bad" framing; getting ATCS wrong |
| **Innovation** | 15 | Slides 6–8: two ambulances adjacent, benefit-cost ranking, rehearsal before the decision | Claiming AI signal timing is new; claiming NTCIP-covered things are new |
| **Technical Execution** | 20 | Slides 12–15: architecture, safety layer, calibrated physics, seeded replay, validation plan | Hand-waving. Not knowing your own constants |
| **Functionality & Completeness** | **25 — the biggest** | Slides 9–11: what works *today*, demonstrated live, plus tests and stated limitations | A slide deck with no working artefact. Hiding what is not done |
| **Real World Impact** | 15 | Slides 16–17: who uses it, the arithmetic, the deployment path | Unbounded claims with no arithmetic |
| **Presentation & Demo** | 10 | Delivery, timing, recovering from failure | Reading slides; a demo that dies |

**The single most important consequence:** Functionality & Completeness is worth
25 — more than Innovation and Problem Understanding put together. **The working
tool must be shown, and what is missing must be said out loud.** A team that
demos honestly and lists its gaps beats a team with a beautiful idea and nothing
running.

---

# PART 4 — The speech, slide by slide

Written the way you speak — explaining, then landing the point. Timings assume a
ten-minute slot; there is a cut list at the end.

### Slide 1 — Title · 10 s
> "Good morning. I'm [name], and our problem statement is the digital twin of a
> traffic intersection."

### Slide 2 — The bigger project · 50 s
> "Before I get into the product, I want to explain the bigger project it came
> from, because that's what makes it matter.
>
> The project is called Kalavathi. The idea is this: in India, when there's a
> medical emergency at home — someone has a heart attack — the family's first
> instinct is not to wait for an ambulance. They put the patient in their own car
> and they drive. That's what happened in my family.
>
> So Kalavathi lets a private vehicle become a recognised emergency vehicle for
> the length of one trip — through a token the hospital authorises. The point of
> that token is signal priority: so that car gets treated like an ambulance while
> it's carrying a patient.
>
> And the car isn't slow. The driver isn't slow. The time is lost standing at red
> lights — eight to twelve junctions on a ten kilometre drive, a minute at each."

### Slide 3 — Where that project hit a wall · 40 s
> "Now, the technology to hold a signal green already exists. That's not the hard
> part. The hard part is this: the moment you give a vehicle priority, somebody
> else pays for it in waiting time.
>
> So before any traffic department will even discuss letting ordinary cars
> request priority, they ask one question: what will this cost my network?
>
> Nobody could answer that, because there was nowhere to try it. You can't
> experiment on a live city.
>
> So we built the place to try it. That's the simulator I'm showing you today —
> and it's a part of Kalavathi, not a separate thing."

### Slide 4 — What already exists · 45 s
> "Let me be clear about what exists, because I don't want to claim something
> that's already deployed.
>
> Adaptive traffic control is real. Bengaluru runs it across about a hundred and
> sixty-five junctions, using an Indian system called CoSiCoSt from C-DAC.
> Pittsburgh's Surtrac cut travel time by a quarter. Emergency preemption is an
> international standard — NTCIP 1211 — and it even covers triaging more than one
> request.
>
> So adaptive signal control is not my idea and I'm not claiming it. What I found
> is five places where these systems stop — and every one of them is a place
> where a decision gets made with no way to test it first."

### Slide 5 — The five limits · 55 s
> "One. The hardware costs a fortune. Sensors and cameras at every junction
> across a city is a huge bill, and that's the reason most Indian cities don't
> have it.
>
> Two. When a sensor fails or a camera gets blocked, that junction degrades until
> someone repairs it.
>
> Three. Switching between timing plans, or talking to older controllers, wastes
> time in itself.
>
> Four — and this is the important one — rare events. Accidents, road closures,
> waterlogging, a diversion done by hand. These systems are tuned on the ordinary
> day, and the unusual day gets handed back to a human on a radio. We call that
> the bad day.
>
> Five. Mixed traffic. Two-wheelers and autos that don't stay in lanes make queue
> counting genuinely hard, and every one of these systems was designed somewhere
> that doesn't have that problem."

### Slide 6 — The hard case · 60 s *(innovation starts here)*
> "Let me give you the exact case that started this.
>
> Two ambulances. Different roads. Same junction. Arriving within seconds of each
> other, and they need opposite green phases — so only one of them can go.
>
> Somebody has to choose. Right now, that choice is either made by a fixed rule —
> whoever asked first — or by a human on a radio with no information.
>
> Now make it harder. Kalavathi means the requesters aren't fifty authorised
> ambulances any more. They could be thousands of ordinary cars. Conflicts stop
> being rare and become constant.
>
> That is a scheduling problem with priority and concurrency, and it's the
> problem we're solving."

### Slide 7 — How we choose · 60 s
> "So what do we decide on?
>
> Existing systems assign a class in advance — ambulance beats bus beats car —
> and serve the highest class. That works when conflicts are rare.
>
> We score each request live, as a benefit-to-cost ratio. Some things come in
> from outside and we never guess them: how severe the case is — that's from the
> hospital, never from us, because a traffic system should not be making medical
> judgments — whether the request is verified, the vehicle type, and how many
> people are on board.
>
> And then the things we calculate ourselves, which is the actual work: we run
> the twin forward twice — grant it, and don't grant it — and we measure how many
> seconds that vehicle saves, and how many vehicle-seconds everybody else pays.
> Plus how long this request has already waited, so nothing starves, and whether
> we can even hold the phase in time.
>
> So the same ambulance can be granted at three in the afternoon and refused at
> six in the evening — and the system tells you why."

### Slide 8 — What the twin is for · 35 s
> "And that's the shift. Today, in traffic, the action is taken first and you
> find out afterwards whether it worked. If it didn't, that's a gridlock and lost
> time, and it already happened.
>
> Here, we simulate the decision before we make it."

### Slide 9 — What works today · 45 s *(functionality — the biggest criterion)*
> "So let me show you what actually runs, because this isn't a concept.
>
> Four junctions. Five vehicle types — two-wheelers, autos, cars, buses, trucks —
> each with its own length and weight class. Real signal state machines with
> yellow and all-red intervals. Timing controls. Seeded testing. Four scenarios
> for the bad day. A priority corridor with a cost ledger. And a written model
> specification with every constant in it."

### Slide 10 — Demo, part one · 60 s
> "This is average delay per vehicle — the one number that matters.
>
> I'll drag east–west green from eighteen seconds to thirty. Watch east–west
> drain, and watch north–south start building, because I took those seconds from
> somewhere.
>
> Now, I could stop there and say it looks better. But that would be a guess. So
> I press test — and this replays exactly the same traffic, the same vehicles
> arriving at the same moments, under the new plan. Same cars, different plan.
> That's the only way to know it was the plan and not the minute.
>
> The table keeps every attempt and marks the best one. That's a planner finding
> a better timing with evidence, in one minute."

### Slide 11 — Demo, part two · 60 s
> "Now the bad day. Accident — one approach can't discharge. Watch the queue grow
> backwards until it reaches the junction behind. One incident, three streets.
>
> Flood — this road is waterlogged, speeds drop, and buses and trucks are barred
> by weight limit. That's why we model five vehicle types and not one.
>
> And now a priority request. Granted — corridor held. Look at the ledger: the
> vehicle saved this much, cross traffic paid this much. Both sides, measured.
>
> Now I'll push traffic up… and request again. Refused. And it tells me why —
> the network queue is over budget. A system that can only say yes can't be
> opened to thousands of cars."

### Slide 12 — Architecture · 50 s *(technical execution)*
> "Under the hood: a junction is a scheduler. The four approaches are processes,
> green time is the CPU. A fixed plan is round robin — equal slices whether or not
> anyone's waiting, which is exactly why it's beatable. Maximum green is
> starvation prevention. An emergency corridor is preemption.
>
> The important box is the red one. We have four controllers — a fixed plan,
> Webster's formula, Max-Pressure, and an AI layer — and every one of them writes
> through a single function, with the safety limits underneath it. Minimum green,
> maximum green, yellow never skipped. Those are hard-coded and never learned. So
> whatever the AI says, it cannot make a light stay red forever."

### Slide 13 — The model · 45 s
> "The physics: every vehicle follows the one in front, at forty kilometres an
> hour free speed, one and a half metres per second squared acceleration, a two
> second following gap, and two seconds of start-up lost time before a stopped
> queue moves — which is a real measured effect, and leaving it out makes every
> capacity number too optimistic.
>
> Queues form backwards from the stop line and discharge in a wave at about one
> vehicle every two seconds — that's the standard saturation flow of eighteen
> hundred an hour. And we count them in passenger car units, because twelve
> two-wheelers and twelve buses are not the same junction."

### Slide 14 — How we know it's right · 40 s
> "Two things make the numbers trustworthy.
>
> One, everything is seeded. Run the same seed twice, you get identical results —
> we test that without a browser at all. So a comparison between two plans is a
> controlled experiment, which the real road can never be.
>
> Two, validation. Our constants come from standard traffic engineering values,
> and the next step is cross-checking against SUMO — the standard open research
> simulator — on the same scenario. I chose to build our own model first because
> SUMO can't be opened by a control room operator. But SUMO is the right thing to
> check ourselves against."

### Slide 15 — Evidence · 35 s
> "Some numbers. Balanced plan, eighteen and eighteen: sixteen point seven
> seconds of delay per vehicle. Skew the same junction on the same traffic:
> twenty-one seconds. So timing matters, and the tool proves its own premise.
>
> And we grade on level of service, which is the profession's own scale — not one
> we invented."

### Slide 16 — Who uses it · 45 s *(impact)*
> "Two users, both inside a traffic department.
>
> The planner sits at a desk and decides what normal should look like — thinks in
> weeks.
>
> The operator is in the control room right now, dealing with the day that isn't
> normal — thinks in minutes, and today acts by radio.
>
> The next piece of work is their interface: the twin runs alongside real
> conditions, and when it predicts two priority vehicles converging on one
> junction, it raises an alert before it happens, offers the operator the options
> with the cost of each, lets them test one, and logs what was chosen and why.
> That's the piece we build next, and we'd want to sit in a real control room
> before designing it."

### Slide 17 — Impact · 35 s
> "One honest sum. A busy junction, two thousand vehicles an hour, five seconds
> saved each. That's two point eight vehicle-hours saved every hour — about
> thirty-three vehicle-hours a day, at one junction. Bengaluru's system covers a
> hundred and sixty-five.
>
> I'm not claiming we deliver that. I'm showing why five seconds is worth chasing.
>
> And the cost side: this runs in a browser. For a city that can't afford sensors
> at every junction, evaluating a timing costs a laptop."

### Slide 18 — Roadmap · 35 s
> "What's next, in order. Many priority requests competing at once. Green-wave
> coordination between junctions. Importing a real junction from OpenStreetMap.
> Cross-validation against SUMO.
>
> After that, the neural network — and to be precise about it, it doesn't drive
> the signals and it doesn't make the simulation accurate. It learns the ranking:
> which request wins. It gets trained inside this simulator, because you can't
> train a controller on a real city where the failures are real. And the safety
> limits stay hard-coded underneath it.
>
> And choosing phases across several junctions under conflict constraints is a
> combinatorial problem that maps to a QUBO — the form quantum annealers take.
> There's published work doing exactly that. So the formulation is quantum-ready;
> we solve it classically today. I'd rather say that than call it quantum."

### Slide 19 — Close · 20 s
> "What we're honest about: no route choice, no turning movements, no
> pedestrians, and it hasn't been validated against field data yet. All of it is
> written down in our model specification rather than left for you to find.
>
> Traffic decisions get made every day with no way to try them first. This is the
> place to try them. Thank you."

**Total ≈ 12 minutes.** Cut in this order to reach 10:00 — slide 17 down to one
sentence (−20 s), slide 13 down to the queue explanation only (−25 s), slide 5
down to three of the five limits (−25 s), slide 15 to the two numbers only (−20 s).

**Never cut:** slides 2, 6, 7, 10, 11. Those carry Problem Understanding,
Innovation and Functionality — 55 of the 100 marks.
