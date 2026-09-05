# Code guide

What every file does, and which one to open when you want to change something.

This is written to be read in the ten minutes before a demo, or by someone who
has never seen the project. If you only read one section, read
[I want to change X](#i-want-to-change-x) at the bottom.

---

## The one rule the whole project is built on

**No file except `render.js` and `render3d.js` is allowed to draw anything.**

`sim.js`, `agent.js`, `sensorFeed.js`, `priority.js`, `controllers.js`,
`quantum.js`, `nn.js` contain zero p5 calls, zero Three.js calls and zero DOM
access. They compute state. The renderers read that state and paint it.

That is why the same simulation drives a 2D top-down view and a 3D isometric
view with no changes to the simulation at all — `render3d.js` was added late in
the project and touched nothing below it. It is also why the Python trainer can
run `sim.js` headless inside a Node sandbox: there is no browser to fake.

If you are ever tempted to write `fill(255)` in `sim.js`, that is the moment the
project stops being portable. Put a number on the state object instead and let
the renderer decide what colour it is.

---

## Running it

| What | How |
|---|---|
| The twin | Open `index.html` in a browser. No build step, no server needed. |
| The control room | Open `console.html`, or click **CONTROL ROOM →** in the twin. Keep both tabs open — they talk to each other. |
| Both at once | `run.bat` |
| Simulation tests | `node tests/run.js` — 21 assertions, no browser |
| Browser tests | `node tools/browser-check/check.js` — 41 checks in real Chromium |
| Screenshots | `node tools/browser-check/check.js --shots` |
| SUMO work | see `sumo/README.md` |

The API key lives in `config.js`, which is git-ignored. Copy
`config.example.js` to `config.js` and paste a key in. **With no key everything
still works** — the language-model layer falls back to a local rule and labels
its decisions `HEURISTIC`.

---

## The layers, bottom to top

```
config.js          your API key (git-ignored)
link.js            the channel between the two browser tabs
  |
sim.js             THE WORLD. vehicles, roads, signals, physics, statistics
features.js        the 8 numbers the trained model sees (shared with Python)
sensorFeed.js      what a camera or loop detector would report, with noise
  |
controllers.js     Webster's fixed plan, and Max-Pressure
nn.js + weights.js the trained model, running in the browser
agent.js           the language-model stack
quantum.js         the whole network as a QUBO
priority.js        who gets a green corridor, and who is refused
scenarios.js       accident, flood, surge, signal failure, misuse attack
bench.js           replays the same traffic under different plans
  |
publish.js         pushes state to the control room
render.js          the 2D view and the entire sidebar
render3d.js        the 3D view
```

Everything above `sim.js` writes to the signals through exactly one function,
`SIM.applyAction()`. That is deliberate — see [Safety](#safety-and-why-no-controller-can-break-it).

---

## File by file

### `sim.js` — the world (676 lines)

The only file that owns state. Everything else asks it questions.

- **Scale**: 4 pixels = 1 metre. Free-flow speed 40 km/h. Acceleration
  1.5 m/s², braking 3 m/s², 2 m standstill gap, 2 s desired headway, 2 s
  start-up lost time at the head of a queue. These are ordinary urban traffic
  engineering numbers, not invented ones.
- **Car following**: gap-based, in the style of Newell. A vehicle takes the
  smaller of "the speed my headway allows" and "the speed the signal allows".
- **Signals**: a finite state machine per junction. `green → yellow → all-red →
  green on the other phase`. Yellow 3 s, all-red 1 s, minimum green 10 s,
  maximum green 60 s.
- **Statistics**: control delay (the honest measure — time lost against a free
  run) and stopped delay, PCU-weighted so a bus is not counted as a scooter.
- **Randomness**: a seeded mulberry32 generator. Two runs with the same seed
  produce byte-identical traffic, which is the only reason the A/B comparison
  in `bench.js` means anything.
- **The clock**: `sim.js` owns `requestAnimationFrame` and calls every
  registered `SIM.onTick(fn)`. `SIM.advance(dt)` is the same step exposed so the
  Python trainer can drive it with no browser.

**Change this file when**: you want different road geometry, different vehicle
behaviour, different signal safety limits, or a new statistic.

### `features.js` — the model's eyes (68 lines)

Eight numbers per junction, all measured *relative to whichever phase is
currently green*, so the model learns "serve the busy side" rather than
"J3 likes north". Loaded by both the browser and the Python trainer, so the
two can never drift apart. If you change this file you must retrain.

### `sensorFeed.js` — the pretend camera (109 lines)

Everything the twin knows about the street passes through here. It reads truth
from `sim.js` and degrades it: counting noise, a refresh interval, an occasional
dropped frame, and a `blockedApproach` flag for when a camera cannot see.

**This is the file you replace to make the project real.** Swap the body of
`SENSOR_FEED.get()` for a `fetch()` against a real detector API and nothing
above it changes. That is the whole point of it being a separate file.

### `controllers.js` — the two classical baselines (149 lines)

- **Webster (1958)**: the minimum-delay cycle length, computed from the flows
  measured so far. This is what most Indian junctions actually run.
- **Max-Pressure**: serve the phase with the greatest pressure (upstream queue
  minus downstream queue). Proven to maximise throughput; genuinely good.

Both exist so the trained model has something honest to beat. `MARGIN = 2.5`,
`MIN_SERVICE = 10` and `DECIDE_EVERY = 2.0` are the hysteresis constants that
stop Max-Pressure thrashing between phases every physics tick.

### `nn.js` + `weights.js` — the trained model (142 lines + weights)

Three matrix multiplies. That is all inference is. It reads the 8 features,
outputs two numbers (the value of holding, the value of switching), and takes
the larger every 5 simulated seconds. The reason string it prints is the two
numbers themselves, so the audience sees the actual decision, not a summary.

Trained by `tools/train.py` against `sim.js` running headless. The weights are
baked into `weights.js` so the page needs no server.

### `agent.js` — the language-model stack (431 lines)

Three layers:

1. **Propose** — one model call returns an action and a one-sentence reason.
2. **Review** — a *second* call, different prompt, shown the same snapshot and
   the proposal, which may overrule it. A model marking its own homework is
   worth little; marking someone else's is worth something.
3. **Fall back** — a local rule decides when the API is slow, down, rate
   limited, or out of budget, and the log says so.

Two hard-won constants:

- `REQUEST_TIMEOUT_MS = 20000`. It was 5000, and a measured round trip is
  8.7–13.6 s, so *every* call was being aborted and the whole thing was quietly
  running on the rule. If model decisions stop appearing, check this first.
- `MIN_CALL_SPACING_MS = 9000`. Four junctions deciding every 5 s at two calls
  each is ~96 requests a minute, which the free tier answers with HTTP 429. The
  API is now a scarce resource spent on the busiest junction; the rest run on
  the rule. A 429 backs the whole stack off for 30 s.

`MODEL_CHAIN` is tried in order and a model that returns 404 is struck off for
the session — `gemini-2.0-flash` was retired mid-project and this is why.

**Change this file when**: you want different prompts, a different model, a
different fallback order, or a different call budget.

### `quantum.js` — the network as one optimisation problem (268 lines)

Every other controller decides one junction at a time, which is myopic: a
junction can clear its own queue straight into a red next door. This decides all
four at once.

One binary variable per junction per phase, and an energy with three terms:
serve long queues, exactly one phase per junction, and neighbours on the same
phase get a discount so a platoon meets green. Expand it and it is a QUBO —
the exact input format a quantum annealer takes.

It is solved here by **simulated annealing on a normal CPU**, with 12 restarts.
And because four junctions is only 2⁸ = 256 states, the file *also* brute-forces
the exact optimum and prints whether the annealer found it. That check is the
honest part: it proves the solver works, and it shows why you would ever want
different hardware — 256 states here, 2¹⁰⁰ for a fifty-junction corridor.

**Nothing in this file is quantum.** The formulation is quantum-ready; the
solving is classical. Say it exactly that way to a judge.

### `priority.js` — the ambulance, and the abuse (496 lines)

Handles concurrent priority requests: two ambulances wanting opposite phases at
the same junction, a fire engine arriving mid-corridor. Scores each request by
severity, verification, people on board and distance, then either grants a
corridor, queues it, or refuses it with a printed reason.

The abuse controls are checked **first, before anything the requester claims
about itself**:

```js
perSourceGrants: 2,        // grants one source may hold
perSourceWindowSec: 240,   // ...in this window
perSourceRequests: 5,      // requests one source may even make in that window
```

So a device that fires ten requests gets two, and the rest are refused and
logged against it. This is the answer to "what if a terrorist presses the
button" — see the pitch document.

Every refusal carries `req.workings`, the actual score arithmetic, so nobody has
to trust the system's judgement.

### `scenarios.js` — the bad day (181 lines)

`accident`, `flood`, `surge`, `signalFailure`, `twoAmbulances`, and
`misuseAttack(count)` which raises traffic first and then fires a burst from one
source so the refusals happen against real congestion, not an empty street.

### `bench.js` — is it actually better? (155 lines)

Replays the identical seeded traffic under different plans and reports average
delay and throughput. Without this the project would be a nice animation with
no evidence behind it.

### `link.js` + `publish.js` — the two windows (80 + 163 lines)

`link.js` is a thin channel: `BroadcastChannel` where available, `localStorage`
events as a fallback. `publish.js` decides what the twin tells the control room
and how often. Neither knows anything about traffic.

### `render.js` — the 2D view and the whole sidebar (901 lines)

Everything visual for the main page: the roads, the vehicles, the signal heads,
the HUD, all three sidebar tabs, the charts, the buttons, the tab wiring, and
the 2D/3D handover at the top of `draw()`.

`DRAW_SCALE = 1.9` makes vehicles visible on a projector. It scales *drawing
only* — the physics is untouched.

### `render3d.js` — the 3D view (321 lines)

Three.js reading the same `SIM.vehicles` and `SIM.junctions`. `SCALE = 0.1`
converts simulation pixels to world units, `MAX_VEHICLES = 240` sizes the
InstancedMesh (one draw call for every car). Orbit with drag, zoom with the
wheel, double-click to reset.

Public API: `enable()`, `disable()`, `isActive()`, `isAvailable()`, `frame()`,
`resize()`, `focus(junctionId)`. If Three.js fails to load from the CDN,
`isAvailable()` returns false and the 3D button politely refuses instead of
throwing.

### `console.html` / `console.js` / `console.css` — the control room (125 + 325 + 202)

The operator's screen, deliberately a different job from the twin. It predicts
conflicts before they happen, prices three options *including doing nothing*,
shows a benefit-to-cost ratio, and logs which option the operator chose.

The "do nothing" option matters: a tool that only ever offers you actions is a
tool that talks you into acting.

---

## The Python side

### `tools/env-server.js` + `tools/train.py`

The trainer is Python; the environment is `sim.js`. `env-server.js` runs the
browser simulation headless inside Node's `vm` sandbox and speaks JSON-lines
over stdin/stdout. So the *exact same physics* trains the model and runs in the
demo — no second implementation to drift.

`train.py` supports DQN and `train_mc` (Monte-Carlo returns). **The DQN never
beat the fixed plan; Monte-Carlo returns did.** That is worth saying out loud to
a judge — it is a real result, and pretending the first thing worked would be a
lie that a good judge will find.

### `sumo/` — the real city

SUMO is the standard open-source traffic simulator, used by actual transport
authorities. The browser twin is ours; SUMO is the independent check.

- `build_network.py`, `build_routes.py` — the synthetic four-junction grid
- `build_city.py`, `city_corridor.py` — a real Vijayawada corridor imported
  from OpenStreetMap, 1.71 km, 19 signalised junctions
- `env.py`, `train_dqn.py` — RL against SUMO
- `benchmark.py` — held-out scenarios
- `interface.py` — the boundary; the only file that imports `traci`

Note for the Q&A: OpenStreetMap tags exactly **two** traffic signals across
516 km of Vijayawada road. The data to run a city like this mostly does not
exist yet, and that is part of the problem.

---

## Safety, and why no controller can break it

There are five things that can command a signal: the fixed plan, Max-Pressure,
the trained model, the language-model stack, and the QUBO solver. All five go
through `SIM.applyAction(junctionId, action)` and nothing else.

Inside that one function, `sim.js` enforces:

- minimum green 10 s — no phase can be cut short
- yellow 3 s and all-red 1 s — never skipped, never shortened
- maximum green 60 s — no approach can be starved forever

So the worst a broken model, a hallucinating LLM, or a malicious priority
request can do is produce a *slightly worse cycle*. It cannot produce an unsafe
one. If a judge asks "what if the AI goes wrong", this is the answer, and you
can show them the single function it all funnels through.

---

## I want to change X

| I want to… | Open | Look for |
|---|---|---|
| use a real camera or detector feed instead of the mock | `sensorFeed.js` | `SENSOR_FEED.get()` — replace the body with a `fetch()` |
| change how long the greens are | `render.js` sliders, or `SIM.setPlanAll()` | the PLAN tab |
| change the yellow, all-red, min or max green | `sim.js` | `SIM.SIGNAL` |
| make cars accelerate or brake differently | `sim.js` | the acceleration / braking constants near the top |
| make vehicles bigger on a projector | `render.js` | `DRAW_SCALE` |
| change what the LLM is told | `agent.js` | `PROPOSER_PROMPT`, `VALIDATOR_PROMPT` |
| use a different model, or add a spare | `agent.js` | `MODEL_CHAIN` |
| stop hitting rate limits | `agent.js` | `MIN_CALL_SPACING_MS`, `RATE_LIMIT_COOLDOWN_MS` |
| fix "the LLM never decides anything" | `agent.js` | `REQUEST_TIMEOUT_MS` — almost always this |
| change who wins when two ambulances collide | `priority.js` | the score formula in `decide()` |
| change the abuse limits | `priority.js` | `perSourceGrants`, `perSourceRequests`, `perSourceWindowSec` |
| add a new emergency scenario | `scenarios.js` | copy the shape of `accident` |
| change the network-wide optimisation | `quantum.js` | `LAMBDA` (one phase per junction), `MU` (neighbour agreement) |
| retrain the model | `tools/train.py` | run against `tools/env-server.js`; then rebuild `weights.js` |
| change what the model can see | `features.js` | **and then retrain — the browser and the trainer share this file** |
| change the 3D look | `render3d.js` | `SCALE`, `MAX_VEHICLES`, the material definitions |
| change the control room's options | `console.js` | the option-pricing function |
| add a test | `tests/run.js` (no browser) or `tools/browser-check/check.js` (real browser) | |

---

## Things that will bite you

- **`config.js` must never be committed.** It is in `.gitignore`. Check before
  every push.
- **Changing `features.js` without retraining** silently feeds the model
  garbage. It will still run. It will just be wrong.
- **The `sumo/` folder shadows the installed `sumo` Python package.** That is
  why the SUMO scripts use path-based sibling imports instead of plain ones.
- **SUMO silently drops vehicles inserted out of order.** The ambulance has to
  be spliced into the route file in sorted departure order or it never appears.
- **`traci.getWaitingTime()` is not cumulative.** Use
  `getAccumulatedWaitingTime()` deltas or your numbers will be nonsense.
- **OneDrive locks generated files.** The SUMO scripts write to the system temp
  directory for this reason.
- **The demo needs no internet.** If the venue wifi dies, everything works
  except the LLM layer, which will say so in plain words on screen. Do not
  apologise for it — point at it. That is the fallback doing its job.
