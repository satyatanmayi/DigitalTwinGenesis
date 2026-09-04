# Digital Twin Genesis

A 2D digital twin of a four-junction city grid, with each junction's traffic
signal controlled live by a Gemini agent that reads a sensor feed and explains
its decisions on screen.

No build step, no npm, no framework. Vanilla JavaScript plus p5.js from a CDN.

---

## Run it

1. `copy config.example.js config.js` (or copy the file by hand).
2. Paste a Gemini API key into `config.js`. Get one at
   <https://aistudio.google.com/apikey>.
3. Open `index.html`, or run `run.bat` and browse to <http://localhost:8000>.

Running through `run.bat` (a plain `python -m http.server`) is recommended.
Some browsers restrict `fetch` from `file://` origins.

**Without a key the app still runs.** `agent.js` falls back to a local
rule-based controller and labels those decisions `HEURISTIC` in the log.

### A note on the API key

This app is entirely client-side, so any key in `config.js` is visible to
anyone who opens the page or its developer tools. `config.js` is git-ignored so
it never reaches the repository, but for anything beyond a demo the call must
be proxied through a server that holds the key.

---

## Controls

| Control | Effect |
| --- | --- |
| `GEMINI AI` / `FIXED TIMER` | Switches between AI control and a fixed 12-second-green baseline. Average wait is tracked separately for each, so the comparison panel shows whether the AI actually helps. |
| `PAUSE` (or spacebar) | Freezes the simulation clock. |
| `INJECT INCIDENT` | Raises `incidentFlag` on the selected junction for 25 seconds. The agent sees it in the next snapshot and reacts. |
| `TRAFFIC LOAD` | Scales the spawn rate from 0.2x to 3x. |

---

## What is real and what is mocked

**Mocked — `sensorFeed.js`**

The sensor layer is the only fake part. It samples the running simulation once
a second and publishes a snapshot per junction in the shape a roadside sensor
gateway would deliver:

```json
{
  "junctionId": "J1",
  "queueLengths": { "N": 3, "S": 1, "E": 6, "W": 5 },
  "avgSpeed": 18.4,
  "incidentFlag": false
}
```

To go live, replace the body of `sample()` with a `fetch` against a real sensor
API, a WebSocket, or an MQTT subscription that fills the same fields. Nothing
downstream knows or cares where the numbers came from, so `sim.js`, `agent.js`
and `render.js` do not change.

**Real logic — everything else**

- **Signal state machine** (`sim.js`). Opposing approaches run as phase pairs:
  `NS` serves the north and south approaches, `EW` serves east and west. Greens
  run down a timer, hand over to a 2.2-second yellow, then to the other phase.
  A minimum green of 5 seconds and a maximum green of 22 seconds are enforced
  in the state machine itself, so no AI decision can create an unsafe or
  starving signal.
- **Vehicle physics** (`sim.js`). Car-following: each vehicle picks a target
  speed from the gap to whatever is ahead of it — the lead vehicle or a red
  stop line — and approaches that target under finite acceleration and
  deceleration. Movement is per-frame and continuous, driven by
  `requestAnimationFrame`. Vehicles queue, creep, and pull away in a wave when
  the light turns green, because nothing teleports.
- **Statistics** (`sim.js`). Queue length per approach, longest wait per
  approach, per-junction throughput, and system-wide processed count and
  average wait — all measured from actual vehicle state, not estimated.
- **AI decisions** (`agent.js`). Real Gemini API calls with structured JSON
  output.

---

## Architecture

The hard rule of this codebase: **simulation state and rendering never mix.**

| File | Role | May draw? |
| --- | --- | --- |
| `sim.js` | World state, vehicle physics, signal state machines, statistics, the master clock | No |
| `sensorFeed.js` | Mock sensor gateway; publishes snapshots | No |
| `agent.js` | Per-junction Gemini calls; applies decisions via `SIM.applyAction()` | No |
| `coordinator.js` | Corridor-level coordinator. Stub only | No |
| `render.js` | All p5.js drawing and all sidebar DOM updates | Yes — only this file |

`sim.js`, `sensorFeed.js` and `agent.js` contain zero p5.js calls and zero DOM
access. Vehicle positions are plain `{x, y}` numbers in a fixed 1200x800 world
coordinate space; the renderer scales that space to whatever canvas it has.

`sim.js` also owns the `requestAnimationFrame` loop and calls subscribers
registered through `SIM.onTick(fn)`. The renderer does not drive the
simulation. **Swapping the 2D view for a Three.js scene therefore touches
`render.js` and nothing else** — the new renderer reads the same
`SIM.junctions`, `SIM.vehicles` and `AGENT.decisions` data.

### The AI control loop

Every 5 simulated seconds, each junction sends its own snapshot to Gemini. The
four junctions are queried in parallel, so one slow response never delays the
others. The prompt carries the junction's queues, longest waits, current phase
and green elapsed time, its adjacent junctions' total queue pressure, and its
own last two decisions (which suppresses flip-flopping). The response is
constrained by a `responseSchema` to:

```json
{ "junctionId": "J1", "action": "extend_green_EW", "reason": "EW queue 7 against NS queue 2, so serve EW." }
```

`action` is one of `extend_green_NS`, `extend_green_EW`, `hold`, `switch`. The
reason string is written onto the junction and drawn as a floating label next
to it on the canvas, so the reasoning is visible in real time rather than
buried in a console.

Calls abort after 4.5 seconds. On any error or timeout the signal keeps its
previous state and the state machine carries on — the simulation never freezes
waiting for the network.

---

## Where a Claude coordinator would sit

The current design is four independent agents, each optimising its own
junction, which is exactly the classic failure mode of decentralised signal
control: J1 can clear its eastbound queue perfectly and in doing so dump a
platoon straight into a red at J2. A Claude coordinator would sit one level
above these agents and run on a slower cadence — every 20 to 30 simulated
seconds instead of every 5. It would receive all four sensor snapshots plus the
recent decision log, reason about the corridor as a whole (where the platoons
are, which direction carries the dominant flow, which junction is the
bottleneck), and emit *policy hints* rather than direct commands: a preferred
phase bias and a green offset per junction, so that a platoon released at J1
arrives at J2 as its green begins — classic green-wave progression, but derived
from live conditions instead of a fixed offset table. Each per-junction Gemini
agent would then receive its hint as one extra field in its prompt and remain
free to override it for a local emergency such as a raised `incidentFlag`. That
split keeps the fast local loop responsive, gives the slow global loop the
corridor view that no single junction has, and keeps exactly one writer to the
signal state machine. `coordinator.js` is stubbed with this design in a TODO;
it is not implemented.

---

## Out of scope tonight

React, any build tool, SUMO/traci, and the emergency-vehicle green corridor.
