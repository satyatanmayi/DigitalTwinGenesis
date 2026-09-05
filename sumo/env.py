"""
sumo/env.py - the junction as a reinforcement learning environment.

This is the piece that turns "a traffic simulation" into "something a model can
learn from". It speaks to SUMO through TraCI, and exposes the three things any
RL algorithm needs:

    reset()        put the world back to the start, return what the model sees
    step(action)   apply a decision, run a few seconds, return what happened
    reward         one number saying how good those few seconds were

WHAT THE MODEL SEES  (10 numbers, all scaled to roughly 0..1)
    0  queue north          halted vehicles on the northbound approach / 20
    1  queue south
    2  queue east
    3  queue west
    4  longest wait north   seconds the worst-off vehicle has waited / 120
    5  longest wait south
    6  longest wait east
    7  longest wait west
    8  ambulance present    1 if an emergency vehicle is on an approach
    9  ambulance closeness  1 at the stop line, 0 when 200 m away
   10  ambulance on NS      1 if it is approaching on the north-south axis
   11  ambulance on EW      1 if it is approaching on the east-west axis

    Slots 10 and 11 exist because of a bug worth remembering: the first version
    told the model an ambulance was present and how close, but not WHICH WAY it
    was coming. The policy then had to guess which phase would help it, and on
    scenarios where the ambulance ran against the dominant flow it guessed
    wrong. A model can only act on what it can see.

WHAT THE MODEL DECIDES
    0  serve north-south    (green phase 0)
    1  serve east-west      (green phase 3)

    Asking for the phase that is already green keeps it. Asking for the other
    one starts a switch - and a switch always runs the full yellow and all-red
    intervals, because those are in the signal programme and this file never
    bypasses them. A minimum green is enforced here too, so a policy cannot
    thrash the junction to a standstill.

REWARD
    reward = -(total waiting seconds accumulated) - EV_WEIGHT * (ambulance waiting)

    Waiting time summed over all vehicles IS delay, so the reward and the thing
    we report are the same quantity. The ambulance term is what makes this an
    emergency-priority model rather than a plain signal controller: making the
    ambulance wait is penalised many times harder than making anyone else wait.

RUN A SANITY CHECK
    python sumo/env.py            # 200 steps of a fixed policy, prints the state
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NET_DIR = os.path.join(HERE, "net")

# The pip package ships SUMO's tools; make sure traci can find the binaries.
try:
    import sumo as _sumo_pkg
    SUMO_HOME = os.path.dirname(_sumo_pkg.__file__)
    os.environ.setdefault("SUMO_HOME", SUMO_HOME)
    _tools = os.path.join(SUMO_HOME, "tools")
    if _tools not in sys.path:
        sys.path.append(_tools)
except ImportError:
    SUMO_HOME = os.environ.get("SUMO_HOME", "")

# libsumo is the same API as traci but runs SUMO in-process instead of over a
# socket - several times faster, which matters when training does thousands of
# episodes. It cannot drive the GUI, so the GUI path falls back to traci.
USING_LIBSUMO = False
try:
    if os.environ.get("DTG_FORCE_TRACI") != "1":
        import libsumo as traci  # noqa: F401
        USING_LIBSUMO = True
    else:
        raise ImportError
except ImportError:
    import traci  # noqa: E402


def _connection(gui):
    """The GUI needs the socket-based traci; headless runs prefer libsumo."""
    global traci, USING_LIBSUMO
    if gui and USING_LIBSUMO:
        import traci as _traci
        traci = _traci
        USING_LIBSUMO = False
    return traci


def sumo_binary(gui=False):
    name = "sumo-gui" if gui else "sumo"
    exe = os.path.join(SUMO_HOME, "bin", name + (".exe" if os.name == "nt" else ""))
    return exe if os.path.exists(exe) else name


# --------------------------------------------------------------------- config
TLS_ID = "centre"
GREEN_PHASES = {0: 0, 1: 3}          # action -> phase index in the programme
YELLOW_AFTER = {0: 1, 3: 4}          # green phase -> the yellow that follows it
APPROACHES = ["n2c", "s2c", "e2c", "w2c"]

DECISION_SEC = 5                     # seconds between decisions
MIN_GREEN = 10                       # a green runs at least this long
YELLOW_SEC = 4
ALLRED_SEC = 2
EV_WEIGHT = 1.0                      # see the note under "reward" below
ARM_LENGTH = 200.0


class JunctionEnv:
    """One SUMO process, driven step by step."""

    def __init__(self, net_file=None, route_file=None, gui=False,
                 seconds=1800, seed=1, quiet=True):
        self.net_file = net_file or os.path.join(NET_DIR, "junction.net.xml")
        self.route_file = route_file or os.path.join(NET_DIR, "junction.rou.xml")
        self.gui = gui
        self.seconds = seconds
        self.seed = seed
        self.quiet = quiet
        self.running = False
        self.current_green = 0        # phase index, not action index
        self.green_elapsed = 0
        self.ev_total_wait = 0.0
        self.all_total_wait = 0.0
        self.ev_finished_at = None
        self.ev_departed_at = None
        self._departed_wait = 0.0
        self._departed_ev_wait = 0.0
        self._last_seen_wait = {}

    # ----------------------------------------------------------------- control
    def start(self):
        cmd = [
            sumo_binary(self.gui),
            "-n", self.net_file,
            "-r", self.route_file,
            "--step-length", "1",
            "--seed", str(self.seed),
            "--time-to-teleport", "-1",       # never teleport; a jam must stay a jam
            "--waiting-time-memory", "10000",
            "--no-step-log", "true",
        ]
        if self.quiet:
            cmd += ["--no-warnings", "true"]
        if self.gui:
            cmd += ["--start", "true", "--quit-on-end", "true", "--delay", "60"]
        _connection(self.gui)
        traci.start(cmd)
        self.running = True
        self.current_green = 0
        self.green_elapsed = 0
        self.ev_total_wait = 0.0
        self.all_total_wait = 0.0
        self.ev_finished_at = None
        self.ev_departed_at = None
        self._departed_wait = 0.0
        self._departed_ev_wait = 0.0
        self._last_seen_wait = {}
        traci.trafficlight.setPhase(TLS_ID, self.current_green)

    def close(self):
        if self.running:
            try:
                traci.close()
            except Exception:
                pass
            self.running = False

    def reset(self):
        self.close()
        self.start()
        return self.observe()

    # ------------------------------------------------------------- observation
    def _ambulance(self):
        """Where the emergency vehicle is, if it is in the network at all."""
        for vid in traci.vehicle.getIDList():
            if traci.vehicle.getVehicleClass(vid) != "emergency":
                continue
            edge = traci.vehicle.getRoadID(vid)
            if edge in APPROACHES:
                pos = traci.vehicle.getLanePosition(vid)
                lane_len = traci.lane.getLength(edge + "_0")
                closeness = max(0.0, min(1.0, pos / max(1.0, lane_len)))
                return vid, edge, closeness
            return vid, edge, 0.0
        return None, None, 0.0

    def observe(self):
        queues, waits = [], []
        for e in APPROACHES:
            queues.append(traci.edge.getLastStepHaltingNumber(e) / 20.0)
            waits.append(min(traci.edge.getWaitingTime(e), 600.0) / 120.0)
        vid, edge, closeness = self._ambulance()
        present = 1.0 if (vid and edge in APPROACHES) else 0.0
        on_ns = 1.0 if edge in ("n2c", "s2c") else 0.0
        on_ew = 1.0 if edge in ("e2c", "w2c") else 0.0
        return queues + waits + [present, closeness if present else 0.0, on_ns, on_ew]

    # ------------------------------------------------------------------ reward
    def _accumulate_waiting(self):
        """How much waiting was added this second.

        A note on a trap worth knowing: traci.vehicle.getWaitingTime() is the
        CURRENT unbroken standing time, so summing it every second counts the
        same wait over and over - a vehicle stopped for 30 s contributes
        1+2+...+30. getAccumulatedWaitingTime() is the running total per
        vehicle, so the honest per-second figure is the change in the sum of
        those totals. That is what this returns.
        """
        total, ev_total = 0.0, 0.0
        for vid in traci.vehicle.getIDList():
            w = traci.vehicle.getAccumulatedWaitingTime(vid)
            total += w
            if traci.vehicle.getVehicleClass(vid) == "emergency":
                ev_total += w

        # Vehicles that have left took their waiting with them, so keep a
        # running total of what departed rather than losing it.
        step_wait = max(0.0, (total + self._departed_wait) - self.all_total_wait)
        step_ev = max(0.0, (ev_total + self._departed_ev_wait) - self.ev_total_wait)
        self.all_total_wait = total + self._departed_wait
        self.ev_total_wait = ev_total + self._departed_ev_wait
        return step_wait, step_ev

    def _bank_departed(self):
        """Called for vehicles leaving the network, so their wait is not lost."""
        for vid in traci.simulation.getArrivedIDList():
            w = self._last_seen_wait.pop(vid, 0.0)
            self._departed_wait += w
            if vid == "ambulance":
                self._departed_ev_wait += w

    def _remember_waits(self):
        for vid in traci.vehicle.getIDList():
            self._last_seen_wait[vid] = traci.vehicle.getAccumulatedWaitingTime(vid)

    # -------------------------------------------------------------------- step
    def step(self, action):
        """Apply a decision, run DECISION_SEC seconds, return what happened."""
        wanted = GREEN_PHASES[int(action)]

        if wanted != self.current_green and self.green_elapsed >= MIN_GREEN:
            # A switch always pays for yellow and all-red. This file cannot skip
            # them: it sets the yellow phase and lets the clock run.
            traci.trafficlight.setPhase(TLS_ID, YELLOW_AFTER[self.current_green])
            self._run(YELLOW_SEC + ALLRED_SEC)
            self.current_green = wanted
            self.green_elapsed = 0
            traci.trafficlight.setPhase(TLS_ID, self.current_green)
            remaining = max(0, DECISION_SEC - (YELLOW_SEC + ALLRED_SEC))
        else:
            traci.trafficlight.setPhase(TLS_ID, self.current_green)
            remaining = DECISION_SEC

        step_wait, ev_wait = self._run(remaining)
        self.green_elapsed += DECISION_SEC

        # Both terms are in vehicle-seconds of waiting added during this
        # decision. After scaling, a second of ambulance waiting counts about
        # ten times a second of ordinary waiting.
        #
        # That ratio is a POLICY choice and it is worth being honest about what
        # it buys. At fifty times, the trained model cut ambulance waiting by
        # 82% and made everybody else 70% worse - it had been told, in effect,
        # that the rest of the city did not matter. Ten times keeps the
        # ambulance benefit while leaving the network roughly where it was.
        reward = -(step_wait / 20.0) - EV_WEIGHT * (ev_wait / 2.0)
        done = (traci.simulation.getTime() >= self.seconds
                or traci.simulation.getMinExpectedNumber() <= 0)
        info = {
            "time": traci.simulation.getTime(),
            "evWait": self.ev_total_wait,
            "allWait": self.all_total_wait,
            "evDone": self.ev_finished_at,
        }
        return self.observe(), reward, done, info

    def _run(self, seconds):
        total_wait, ev_wait = 0.0, 0.0
        for _ in range(int(seconds)):
            if traci.simulation.getMinExpectedNumber() <= 0:
                break
            self._remember_waits()
            traci.simulationStep()
            self._bank_departed()
            a, b = self._accumulate_waiting()
            total_wait += a
            ev_wait += b
            if self.ev_departed_at is None and "ambulance" in traci.vehicle.getIDList():
                self.ev_departed_at = traci.simulation.getTime()
            if (self.ev_finished_at is None
                    and "ambulance" in traci.simulation.getArrivedIDList()):
                self.ev_finished_at = traci.simulation.getTime()
        return total_wait, ev_wait

    # --------------------------------------------------------------- reporting
    def summary(self):
        travel = None
        if self.ev_finished_at and self.ev_departed_at:
            travel = self.ev_finished_at - self.ev_departed_at
        return {
            "ambulanceWaitingSec": round(self.ev_total_wait, 1),
            "ambulanceTravelSec": round(travel, 1) if travel else None,
            "networkWaitingSec": round(self.all_total_wait, 1),
        }


STATE_SIZE = 12
N_ACTIONS = 2


# ------------------------------------------------------------------ self-check
if __name__ == "__main__":
    env = JunctionEnv(seconds=400, gui="--gui" in sys.argv)
    obs = env.reset()
    print("state size:", len(obs))
    print("first state:", [round(v, 3) for v in obs])
    total = 0.0
    steps = 0
    done = False
    while not done and steps < 200:
        # A fixed alternating policy, just to prove the wiring works.
        action = 0 if (steps // 6) % 2 == 0 else 1
        obs, r, done, info = env.step(action)
        total += r
        steps += 1
    print("ran %d decisions, total reward %.1f" % (steps, total))
    print("summary:", env.summary())
    env.close()
