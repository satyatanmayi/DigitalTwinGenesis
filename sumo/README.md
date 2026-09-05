# SUMO track — a trained emergency-priority controller

A separate experiment from the browser twin. Same question, different tools: a
real microsimulator (SUMO), a real deep learning framework (PyTorch), and a
neural network that decides which way a junction should be green when an
ambulance is coming.

**Nothing here is wired into the browser app.** It stands alone so the two can
be compared and the better one kept.

---

## The result

Five held-out scenarios. None of these seeds appear in training. Identical
traffic per row — the only thing that changes is who decides the signal.

| Controller | Ambulance waiting | Ambulance travel | Everyone else |
| --- | --- | --- | --- |
| Fixed 30 s / 30 s | 12.0 s | 47 s | 4,680 veh-s |
| Max-Pressure | 13.2 s | 50 s | 6,746 veh-s |
| **Trained model** | **0.0 s** | **32 s** | 4,830 veh-s |

**The ambulance never stopped once, in any scenario.** Travel time fell by 32%,
and ordinary traffic paid 3% more waiting for it.

### What that number is, and what it is not

It **is** an emergency-priority result. The model was trained to weigh a second
of ambulance delay about ten times a second of anyone else's, and it does
exactly that.

It is **not** a claim to be a better general traffic controller. Probe it with
no ambulance present and its preference between the two phases is nearly a
coin-toss — see `python sumo/interface.py`. On ordinary traffic it is level
with the fixed plan, not ahead of it.

Being clear about which of those two things you are claiming is the difference
between a result that survives questioning and one that does not.

### An earlier version, kept because the lesson matters

The first trained model weighted ambulance delay **fifty** times instead of ten.
It cut ambulance waiting by 82% and made everyone else **70% worse**. It had
been told, in effect, that the rest of the city did not matter — and it
believed us. The weight is a policy choice, and the benchmark shows what each
choice buys.

---

## A green corridor across the real Vijayawada map

`build_city.py` downloads OpenStreetMap data through the Overpass API and
compiles it with netconvert - no browser, no clicking, one command. Then
`city_corridor.py` picks a home and a hospital, routes between them, and runs
the same traffic twice: once with the signals ignoring the ambulance, once
holding each junction green as it approaches.

```bash
python sumo/build_city.py --place benz      # 141 km of real road, 245 junctions
python sumo/city_corridor.py                # the comparison
python sumo/city_corridor.py --gui          # watch it
```

A 1.71 km trip crossing **19 signalised junctions**:

| | Ambulance waiting | Ambulance trip | Everyone else |
| --- | --- | --- | --- |
| Signals ignore it | 160 s | 369 s | 120,975 veh-s |
| **Green corridor** | **0 s** | **177 s** | 119,135 veh-s |

**192 seconds saved on a 1.7 km trip - 52% faster.** 19 junction preemptions.

Two honest notes to make out loud:

- Ordinary traffic came out *slightly better* here, not worse. Clearing the
  ambulance quickly stops it blocking a lane while it waits. The difference is
  1.5%, which is small enough to call noise rather than a benefit.
- **The signal placement is inferred, not real.** OpenStreetMap has only two
  tagged traffic signals across 516 km of Vijayawada road, so netconvert infers
  them from junction size. The geometry is real; where the signals are is an
  assumption. Say that before someone asks.

## Learning the neural network part

Do these in order. The first one takes ten minutes and everything after it is
the same idea with a harder question.

### 1. See what training actually is

```bash
python sumo/xor_test.py
```

A network with eight hidden units learns XOR — output 1 when exactly one input
is 1. You cannot separate that with a straight line, which is precisely why
hidden layers exist.

Watch the loss fall to zero and the outputs land on `[0, 1, 1, 0]`. The four
lines that did it:

```python
pred = model(X)             # 1. the guess
loss = loss_fn(pred, y)     # 2. how wrong it was
loss.backward()             # 3. which way to nudge every weight
opt.step()                  # 4. nudge them
```

**That is all training is.** Every network ever built uses those four steps.
When you can say what each line does in your own words, you understand the
traffic model too, because it uses the same four.

### 2. See what makes traffic control harder than XOR

In XOR somebody hands you the right answer (`y`). For a traffic signal nobody
can: there is no table of correct decisions. So the network builds its own
target out of what actually happened:

```python
y = reward_we_just_got + GAMMA * best_value_of_the_next_state
```

That is the **Bellman equation**, and it is the one line that turns supervised
learning into reinforcement learning. Find it in `train_dqn.py`, in `learn()`,
marked `# the Bellman target`.

Two supports keep it from wobbling:

- **Replay buffer** — train on a random mix of past experiences, not just the
  most recent, so the network does not chase whatever just happened.
- **Target network** — a frozen copy used for the "next state" half of `y`,
  resynced every few hundred steps, so the target is not moving while you aim
  at it.

### 3. The tech stack, and why each piece is there

| Piece | Why |
| --- | --- |
| **SUMO** | The microsimulator. Vehicles, lanes, signals, car-following — decades of traffic engineering you should not rewrite |
| **TraCI / libsumo** | The control interface. `libsumo` runs SUMO in-process and is several times faster; `traci` runs it over a socket and can drive the GUI |
| **PyTorch** | The learning framework. `nn.Linear`, `loss.backward()`, `opt.step()` |
| **NumPy** | Array maths under everything |

Not used, deliberately: `stable-baselines3` and `sumo-rl`. They would have made
`train_dqn.py` about fifteen lines — and left you unable to answer "what does
your loss function do?", which is the question you will actually be asked.

---

## Running it

Everything is installed already (`eclipse-sumo`, `libsumo`, `traci`, `torch`).

```bash
# 1. build the junction  (writes sumo/net/junction.net.xml)
python sumo/build_network.py

# 2. build a traffic scenario
python sumo/build_routes.py --seed 1 --ns 400 --ew 800 --ev-at 200

# 3. check the environment works  (a fixed policy, 200 decisions)
python sumo/env.py

# 4. train                       (about 5 minutes, 60 episodes)
python sumo/train_dqn.py --episodes 60 --seconds 600

# 5. benchmark against fixed-time and Max-Pressure
python sumo/benchmark.py --scenarios 5

# 6. see the model's decisions in isolation
python sumo/interface.py
```

### Watching it

```bash
python sumo/benchmark.py --scenarios 1 --gui
```

Opens `sumo-gui` with the model driving. The ambulance is the red vehicle. Press
play. Note that the GUI uses TraCI rather than libsumo, so it is slower —
that is expected.

---

## The files

| File | What it is |
| --- | --- |
| `build_network.py` | Writes the junction as XML and compiles it with `netconvert`. No hand-drawing in netedit, so the network is reproducible |
| `build_routes.py` | Generates traffic and places the ambulance. Seeded, so two controllers can be compared on identical arrivals |
| `env.py` | The junction as an RL environment: `reset()`, `step(action)`, reward. Talks to SUMO through libsumo/TraCI |
| `train_dqn.py` | The DQN. Network, replay buffer, target network, Bellman target, training loop |
| `benchmark.py` | Fixed-time vs Max-Pressure vs the model, on held-out scenarios |
| `interface.py` | `get_signal_action(...)` — the one function anything else calls |
| `xor_test.py` | The teaching example |
| `models/dqn.pt` | The trained weights |
| `models/benchmark.json` | The numbers in the table above |

### What the model sees — 12 numbers

```
 0-3   queues on N, S, E, W approaches      (stopped vehicles / 20)
 4-7   waiting time on each approach        (seconds / 120)
 8     ambulance present                    (1 or 0)
 9     ambulance closeness                  (1 at the stop line, 0 at 200 m)
10     ambulance on the north-south axis    (1 or 0)
11     ambulance on the east-west axis      (1 or 0)
```

Slots 10 and 11 were added after the first benchmark. Without them the model
knew an ambulance was coming but not **which way**, so on the scenario where the
ambulance ran against the dominant flow it guessed wrong and made things worse
— 21 s of waiting against the fixed plan's 3 s. A model can only act on what it
can see, and that is the cheapest lesson in this folder.

### Two things it cannot do

The model **proposes**; the signal controller **disposes**. `env.py` enforces a
minimum green, and every switch pays the full yellow and all-red from SUMO's own
programme. The network cannot skip either, so a bad decision costs delay and
never safety.

---

## Traps already hit, so you do not have to

**Vehicles must be sorted by departure time.** The ambulance was appended to the
end of the routes file with an earlier departure than its neighbours, and SUMO
silently dropped it. Every run looked fine and the ambulance simply never
existed.

**`getWaitingTime()` is not cumulative.** It is the current unbroken standing
time, so summing it every second counts the same wait repeatedly — a vehicle
stopped for 30 s contributes 1+2+…+30. Use `getAccumulatedWaitingTime()` and
take the difference.

**A folder called `sumo/` shadows the installed `sumo` package.** `import
sumo.env` silently resolves to site-packages. Scripts here add their own
directory to `sys.path` and import siblings directly.

**OneDrive will fight you for generated files.** Scenario files are rewritten
thousands of times during training; a synced folder grabs the handle mid-write
and the run dies with a permission error. They are written to the system temp
directory now.

---

## Next: a real map of Vijayawada

Only worth starting once the single junction above is understood, because
everything gets harder at once.

```bash
python -c "import sumo,os;print(os.path.join(os.path.dirname(sumo.__file__),'tools','osmWebWizard.py'))"
python <that path>
```

It opens a browser map. Draw a box around the area, generate, and SUMO downloads
real OpenStreetMap roads and builds a network from them.

Then the flow you described — home to nearest hospital, greens held along the
route, ordinary traffic in the way — becomes:

1. **Pick the route.** `duarouter` computes the shortest path between the edge
   your house sits on and the edge the hospital sits on.
2. **Find the junctions along it.** Every signalised node on that path is a
   decision point.
3. **Run the model at each one.** `get_signal_action()` per junction, per
   decision interval.
4. **Arbitrate when two requests collide.** Which is exactly what
   `priority.js` already does in the browser twin — the two halves meet here.

**One warning, and it is the real one.** This model was trained on *one* junction
shape: four arms, two lanes, two phases. Real Vijayawada junctions are five-arm,
skewed, with slip roads and four or five phases. The state vector as written
does not describe them, so the model will not transfer as-is.

Two honest ways forward, and you should say which you are taking:

- **Retrain per junction type.** Group the real junctions into a handful of
  shapes and train one model per shape.
- **Make the state relative instead of absolute.** Not "north queue" but
  "queue on the phase currently green", "queue on the phase with the longest
  wait", "is the ambulance on the phase currently green". A relative state
  describes any junction with any number of phases, and one model can then
  generalise. This is the same fix that made the browser twin's model work, for
  the same reason.

The second is more work and the right answer.
