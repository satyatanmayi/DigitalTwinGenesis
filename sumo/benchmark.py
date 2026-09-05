"""
sumo/benchmark.py - the number you quote on stage.

Runs the same traffic three times and reports what each controller did with it:

    fixed        SUMO's own fixed-time programme, 30 s each way. The baseline
                 every junction in the country runs by default.
    max-pressure a classical adaptive rule: serve whichever side has the longer
                 queue. No training, and a genuinely strong opponent.
    model        the trained network from sumo/train_dqn.py

Identical seeds, identical arrivals, identical ambulance. The only thing that
changes between runs is who decides the signal, so any difference in the result
is the control and nothing else.

WHAT IT REPORTS
    ambulance waiting   seconds the emergency vehicle spent stopped
    ambulance travel    seconds from entering the network to leaving it
    network waiting     vehicle-seconds of waiting for everybody else

The last one matters as much as the first. A controller that gets the ambulance
through by freezing the whole city is not a good controller, and this table
makes that visible rather than hiding it behind one headline number.

RUN
    python sumo/benchmark.py                     # three scenarios
    python sumo/benchmark.py --scenarios 5
    python sumo/benchmark.py --gui               # watch the model drive one run
"""

import argparse
import json
import os
import statistics
import sys
import tempfile

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import env as ENV                    # noqa: E402
import build_routes                  # noqa: E402
from train_dqn import QNet           # noqa: E402

MODEL_PATH = os.path.join(HERE, "models", "dqn.pt")

# Held-out scenarios: none of these seeds appear in training.
SCENARIOS = [
    {"name": "east-west peak",   "seed": 90001, "ns": 400, "ew": 900, "ev_at": 200, "ev_axis": "ew"},
    {"name": "north-south peak", "seed": 90002, "ns": 900, "ew": 400, "ev_at": 240, "ev_axis": "ns"},
    {"name": "ambulance against the flow", "seed": 90003, "ns": 350, "ew": 950, "ev_at": 220, "ev_axis": "ns"},
    {"name": "both busy",        "seed": 90004, "ns": 700, "ew": 750, "ev_at": 260, "ev_axis": "ew"},
    {"name": "quiet hour",       "seed": 90005, "ns": 250, "ew": 300, "ev_at": 180, "ev_axis": "ew"},
]


def scenario_file(scn, seconds):
    path = os.path.join(tempfile.gettempdir(), "dtg_bench.rou.xml")
    build_routes.build(seed=scn["seed"], ns_veh_per_hour=scn["ns"],
                       ew_veh_per_hour=scn["ew"], duration=seconds,
                       ev_at=scn["ev_at"], ev_axis=scn["ev_axis"], out=path)
    return path


# ------------------------------------------------------------------ policies
def policy_fixed(state, step):
    """SUMO's own plan: 30 s each way, which is 6 decisions at 5 s each."""
    return 0 if (step // 6) % 2 == 0 else 1


def policy_max_pressure(state, step):
    """Serve the axis with the longer queue. State slots 0-3 are N, S, E, W."""
    ns = state[0] + state[1]
    ew = state[2] + state[3]
    return 0 if ns >= ew else 1


def make_model_policy(model):
    def policy(state, step):
        with torch.no_grad():
            q = model(torch.tensor(state, dtype=torch.float32))
            return int(torch.argmax(q).item())
    return policy


def run(policy, scn, seconds, gui=False):
    route = scenario_file(scn, seconds)
    environment = ENV.JunctionEnv(route_file=route, seconds=seconds,
                                  seed=scn["seed"], gui=gui)
    state = environment.reset()
    done, step = False, 0
    while not done:
        action = policy(state, step)
        state, _, done, _ = environment.step(action)
        step += 1
    summary = environment.summary()
    environment.close()
    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenarios", type=int, default=3)
    ap.add_argument("--seconds", type=int, default=700)
    ap.add_argument("--gui", action="store_true",
                    help="show the model driving the first scenario")
    args = ap.parse_args()

    if not os.path.exists(MODEL_PATH):
        sys.exit("No trained model at %s - run: python sumo/train_dqn.py" % MODEL_PATH)

    model = QNet()
    model.load_state_dict(torch.load(MODEL_PATH))
    model.eval()

    controllers = [
        ("fixed 30s/30s", policy_fixed, False),
        ("max-pressure", policy_max_pressure, False),
        ("trained model", make_model_policy(model), True),
    ]

    rows = []
    print("Identical traffic per scenario. Only the controller changes.\n")
    for scn in SCENARIOS[:args.scenarios]:
        print("%s  (NS %d/h, EW %d/h, ambulance on %s at t=%ds)"
              % (scn["name"], scn["ns"], scn["ew"], scn["ev_axis"].upper(), scn["ev_at"]))
        print("  %-16s %14s %14s %16s" %
              ("controller", "amb. waiting", "amb. travel", "network waiting"))
        result = {"scenario": scn["name"]}
        for label, policy, is_model in controllers:
            summary = run(policy, scn, args.seconds,
                          gui=args.gui and is_model and scn is SCENARIOS[0])
            result[label] = summary
            print("  %-16s %13.1fs %13s %15.0f" % (
                label,
                summary["ambulanceWaitingSec"],
                ("%.0fs" % summary["ambulanceTravelSec"]) if summary["ambulanceTravelSec"] else "n/a",
                summary["networkWaitingSec"]))
        rows.append(result)
        print()

    # ------------------------------------------------------------- the verdict
    def mean(label, field):
        vals = [r[label][field] for r in rows if r[label][field] is not None]
        return statistics.mean(vals) if vals else 0.0

    print("=" * 66)
    print("MEANS ACROSS %d SCENARIOS" % len(rows))
    print("  %-16s %14s %14s %16s" %
          ("controller", "amb. waiting", "amb. travel", "network waiting"))
    for label, _, _ in controllers:
        print("  %-16s %13.1fs %13.0fs %15.0f" % (
            label, mean(label, "ambulanceWaitingSec"),
            mean(label, "ambulanceTravelSec"), mean(label, "networkWaitingSec")))

    fixed_wait = mean("fixed 30s/30s", "ambulanceWaitingSec")
    model_wait = mean("trained model", "ambulanceWaitingSec")
    fixed_net = mean("fixed 30s/30s", "networkWaitingSec")
    model_net = mean("trained model", "networkWaitingSec")

    print()
    if fixed_wait > 0:
        change = (fixed_wait - model_wait) / fixed_wait * 100
        print("  Ambulance waiting: %.1fs -> %.1fs  (%.0f%% %s)"
              % (fixed_wait, model_wait, abs(change),
                 "better" if change > 0 else "WORSE"))
    else:
        print("  Ambulance waiting: the fixed plan already got it through without "
              "stopping in these scenarios - a harder scenario is needed to "
              "separate the controllers.")
    net_change = (fixed_net - model_net) / fixed_net * 100 if fixed_net else 0
    print("  Everyone else:     %.0f -> %.0f vehicle-seconds  (%.0f%% %s)"
          % (fixed_net, model_net, abs(net_change),
             "better" if net_change > 0 else "worse"))
    print("\n  Both numbers matter. Getting the ambulance through by freezing the "
          "rest\n  of the network is not a result worth having.")

    out = os.path.join(HERE, "models", "benchmark.json")
    with open(out, "w") as fh:
        json.dump(rows, fh, indent=1)
    print("\nWrote %s" % os.path.relpath(out, HERE))


if __name__ == "__main__":
    main()
