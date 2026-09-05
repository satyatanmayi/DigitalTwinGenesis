"""
sumo/build_routes.py - who drives where, and when the ambulance appears.

Two kinds of traffic:

  background   ordinary cars arriving at random on all four arms. The rate on
               each axis is a parameter, because a junction where both axes are
               equally busy is the one case where no clever controller can beat
               an even split - the same result we measured in the browser twin.

  ambulance    one emergency vehicle, released at a stated second, on a stated
               axis. It is a normal vehicle to SUMO except for its vClass, so
               nothing gets out of its way by magic: if the signal does not help
               it, it queues like everybody else. That is the point.

RUN
    python sumo/build_routes.py                       # default scenario
    python sumo/build_routes.py --seed 7 --ns 400 --ew 900 --ev-at 180

WHY A SEED MATTERS
    Every comparison between two controllers has to run the same traffic. The
    seed fixes the arrival pattern, so a difference in the result is a
    difference in the control, not in the luck of the draw.
"""

import argparse
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
NET_DIR = os.path.join(HERE, "net")

# Every straight-through movement, by the edge ids build_network.py created.
ROUTES = {
    "ns": ("n2c", "c2s"),
    "sn": ("s2c", "c2n"),
    "ew": ("e2c", "c2w"),
    "we": ("w2c", "c2e"),
}


def build(seed=1, ns_veh_per_hour=500, ew_veh_per_hour=500,
          duration=1800, ev_at=200, ev_axis="ew", out=None):
    rng = random.Random(seed)
    out = out or os.path.join(NET_DIR, "junction.rou.xml")

    lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<routes>"]
    lines.append(
        '    <vType id="car" accel="2.6" decel="4.5" sigma="0.5" length="5"'
        ' minGap="2.5" maxSpeed="13.9" guiShape="passenger"/>'
    )
    lines.append(
        '    <vType id="ambulance" vClass="emergency" accel="3.0" decel="5.0"'
        ' sigma="0.2" length="6.5" minGap="2.5" maxSpeed="16.7"'
        ' guiShape="emergency" color="1,0,0"/>'
    )
    for name, (a, b) in ROUTES.items():
        lines.append('    <route id="r_%s" edges="%s %s"/>' % (name, a, b))

    # Poisson-ish arrivals: draw each vehicle's departure time independently
    # and sort. Simple, seeded, and easy to explain.
    departures = []
    for name in ROUTES:
        rate = ns_veh_per_hour if name in ("ns", "sn") else ew_veh_per_hour
        expected = rate * duration / 3600.0
        n = int(expected)
        for _ in range(n):
            departures.append((rng.uniform(0, duration), name))
    departures.sort()

    # SUMO requires vehicles in a routes file to be sorted by departure time.
    # The ambulance therefore goes INTO the sorted list, not on the end of the
    # file - appending it silently drops it, which cost an hour to find.
    ev_route = "ew" if ev_axis == "ew" else "ns"
    fleet = [(t, '<vehicle id="c%d" type="car" route="r_%s" depart="%.1f"'
                 ' departLane="random" departSpeed="max"/>' % (i, name, t))
             for i, (t, name) in enumerate(departures)]
    fleet.append((float(ev_at),
                  '<vehicle id="ambulance" type="ambulance" route="r_%s"'
                  ' depart="%.1f" departLane="best" departSpeed="max"/>'
                  % (ev_route, ev_at)))
    fleet.sort(key=lambda row: row[0])
    for _, xml in fleet:
        lines.append("    " + xml)

    lines.append("</routes>")
    with open(out, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    return out, len(departures)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--ns", type=int, default=500, help="north-south veh/hour")
    ap.add_argument("--ew", type=int, default=900, help="east-west veh/hour")
    ap.add_argument("--duration", type=int, default=1800)
    ap.add_argument("--ev-at", type=float, default=200)
    ap.add_argument("--ev-axis", choices=["ew", "ns"], default="ew")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    path, n = build(args.seed, args.ns, args.ew, args.duration,
                    args.ev_at, args.ev_axis, args.out)
    print("wrote %s" % os.path.relpath(path, HERE))
    print("  %d ordinary vehicles, %d/h north-south, %d/h east-west"
          % (n, args.ns, args.ew))
    print("  one ambulance on the %s axis at t=%ds" % (args.ev_axis, args.ev_at))


if __name__ == "__main__":
    main()
