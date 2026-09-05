"""
sumo/city_corridor.py - a green corridor across a real city map.

The scenario you actually described: a family drives a patient from home to the
nearest hospital. The route crosses several signalised junctions. Ordinary
traffic is in the way. Either the signals help, or they do not.

This runs that trip twice on the SAME traffic and reports the difference:

    baseline    the signals run their fixed programme and ignore the ambulance
    corridor    each junction on the route is held green as the ambulance nears,
                then released back to its plan

WHAT THE CORRIDOR CONTROLLER ACTUALLY DOES
    Every second it asks where the ambulance is, finds the next signalised
    junction on its route, works out which signal links serve the lane it is
    approaching on, and picks the phase that gives those links green. When the
    ambulance has passed, the junction goes back to its own programme.

    That is emergency vehicle preemption - the thing NTCIP 1211 standardises.
    Nothing here is novel; what is worth measuring is the cost, which is why
    the ordinary traffic's waiting time is reported next to the ambulance's.

RUN
    python sumo/build_city.py --place benz          # once, to make the network
    python sumo/city_corridor.py                    # the comparison
    python sumo/city_corridor.py --gui              # watch the corridor run
"""

import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CITY_DIR = os.path.join(HERE, "city")

try:
    import sumo as _sumo_pkg
    SUMO_HOME = os.path.dirname(_sumo_pkg.__file__)
    os.environ.setdefault("SUMO_HOME", SUMO_HOME)
    _tools = os.path.join(SUMO_HOME, "tools")
    if _tools not in sys.path:
        sys.path.append(_tools)
except ImportError:
    SUMO_HOME = os.environ.get("SUMO_HOME", "")

import sumolib  # noqa: E402


def sumo_binary(gui=False):
    name = "sumo-gui" if gui else "sumo"
    exe = os.path.join(SUMO_HOME, "bin", name + (".exe" if os.name == "nt" else ""))
    return exe if os.path.exists(exe) else name


# ------------------------------------------------------------------ the route
def pick_trip(net, min_signals=3, target_km=(1.2, 3.2)):
    """Choose a home and a hospital that give a trip worth simulating.

    'Worth simulating' means the route crosses several signalised junctions -
    otherwise there is nothing for a corridor to do. We try the longest
    diagonals first and stop at the first route that clears the bar.
    """
    edges = [e for e in net.getEdges()
             if e.getFunction() != "internal" and e.allows("passenger")
             and e.getLength() > 40]
    if not edges:
        sys.exit("no drivable edges in this network")

    def centre(e):
        x, y = e.getShape()[len(e.getShape()) // 2]
        return x, y

    xs = [centre(e)[0] for e in edges]
    ys = [centre(e)[1] for e in edges]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)

    def nearest_to(px, py):
        return min(edges, key=lambda e: (centre(e)[0] - px) ** 2 + (centre(e)[1] - py) ** 2)

    # A corner-to-corner trip is the longest possible, which sounds impressive
    # and simulates badly: the ambulance spends the whole run in transit and
    # never arrives inside the window. What we want is the trip a family
    # actually makes - a couple of kilometres, several signals - so we sample
    # candidate pairs and keep the best one in that band.
    import random
    rng = random.Random(7)
    cx, cy = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    lo_km, hi_km = target_km

    best, best_score = None, -1e9
    candidates = [nearest_to(cx, cy)] + rng.sample(edges, min(60, len(edges)))
    for home in candidates[:24]:
        for hospital in rng.sample(edges, min(24, len(edges))):
            if home.getID() == hospital.getID():
                continue
            path, _ = net.getShortestPath(home, hospital)
            if not path:
                continue
            km = sum(e.getLength() for e in path) / 1000.0
            if km < lo_km or km > hi_km:
                continue
            signals = signalised_on(net, path)
            # Prefer many signals, and a trip in the middle of the band.
            score = len(signals) * 10 - abs(km - (lo_km + hi_km) / 2)
            if score > best_score:
                best, best_score = (home, hospital, path, signals, km), score
            if len(signals) >= min_signals + 2:
                return best

    if best is None:
        sys.exit("could not find a suitable route - try a bigger --bbox")
    return best


def signalised_on(net, path):
    """The signalised junctions the route passes through, in order."""
    out = []
    for e in path:
        node = e.getToNode()
        if node.getType() == "traffic_light" and node.getID() not in out:
            out.append(node.getID())
    return out


# ----------------------------------------------------------------- the demand
def build_traffic(net_path, out_path, seconds, vehicles_per_second, seed):
    """Background traffic, made with SUMO's own randomTrips tool."""
    tool = os.path.join(SUMO_HOME, "tools", "randomTrips.py")
    trips = out_path.replace(".rou.xml", ".trips.xml")
    cmd = [sys.executable, tool,
           "-n", net_path, "-o", trips, "-r", out_path,
           "-b", "0", "-e", str(seconds),
           "-p", str(round(1.0 / vehicles_per_second, 3)),
           "--seed", str(seed),
           "--validate", "--vehicle-class", "passenger",
           "--min-distance", "300",
           "--fringe-factor", "5"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not os.path.exists(out_path):
        print(res.stdout[-1500:])
        print(res.stderr[-1500:], file=sys.stderr)
        sys.exit("randomTrips failed")
    return out_path


def add_ambulance(route_file, path_edges, depart):
    """Insert the ambulance, in departure order, into the generated routes."""
    import re
    with open(route_file, encoding="utf-8") as fh:
        text = fh.read()

    vtype = ('    <vType id="ambulance" vClass="emergency" accel="3.0" decel="5.0"'
             ' sigma="0.2" length="6.5" minGap="2.5" maxSpeed="16.7"'
             ' guiShape="emergency" color="1,0,0"/>\n')
    veh = ('    <vehicle id="ambulance" type="ambulance" depart="%.1f"'
           ' departLane="best" departSpeed="max">\n'
           '        <route edges="%s"/>\n'
           '    </vehicle>\n' % (depart, " ".join(e.getID() for e in path_edges)))

    # SUMO wants vehicles sorted by departure time, so splice it in at the right
    # place rather than appending - the same trap as in build_routes.py.
    lines = text.splitlines(keepends=True)
    out, inserted = [], False
    for line in lines:
        m = re.search(r'depart="([\d.]+)"', line)
        if not inserted and m and float(m.group(1)) > depart and "<vehicle" in line:
            out.append(veh)
            inserted = True
        out.append(line)
    text = "".join(out)
    if not inserted:
        text = text.replace("</routes>", veh + "</routes>")
    text = text.replace("<routes", "<routes", 1)
    # vType must come before any vehicle that uses it
    idx = text.find("<routes")
    end = text.find(">", idx) + 1
    text = text[:end] + "\n" + vtype + text[end:]

    with open(route_file, "w", encoding="utf-8") as fh:
        fh.write(text)


# ------------------------------------------------------------------- the runs
def run(net_path, route_file, corridor, route_ids, seconds, gui=False, seed=1):
    import traci

    cmd = [sumo_binary(gui), "-n", net_path, "-r", route_file,
           "--step-length", "1", "--seed", str(seed),
           "--time-to-teleport", "-1", "--waiting-time-memory", "10000",
           "--no-step-log", "true", "--no-warnings", "true",
           "--ignore-route-errors", "true"]
    if gui:
        cmd += ["--start", "true", "--quit-on-end", "true", "--delay", "40"]
    traci.start(cmd)

    held = {}                    # tls id -> the programme we interrupted
    amb_departed = amb_arrived = None
    amb_wait = 0.0
    all_wait_prev, all_wait = 0.0, 0.0
    banked = 0.0
    preemptions = 0

    try:
        while traci.simulation.getTime() < seconds:
            if traci.simulation.getMinExpectedNumber() <= 0:
                break
            traci.simulationStep()
            now = traci.simulation.getTime()

            ids = traci.vehicle.getIDList()
            if "ambulance" in ids:
                if amb_departed is None:
                    amb_departed = now
                amb_wait = traci.vehicle.getAccumulatedWaitingTime("ambulance")
                if corridor:
                    preemptions += hold_green_ahead(traci, held, route_ids)
            elif amb_departed is not None and amb_arrived is None:
                if "ambulance" in traci.simulation.getArrivedIDList():
                    amb_arrived = now
                release_all(traci, held)

            # Everyone's waiting, counted the honest way (see sumo/env.py).
            total = 0.0
            for vid in ids:
                if vid == "ambulance":
                    continue
                total += traci.vehicle.getAccumulatedWaitingTime(vid)
            for vid in traci.simulation.getArrivedIDList():
                if vid != "ambulance":
                    banked += all_wait_prev_by.get(vid, 0.0)
            all_wait = total + banked
            all_wait_prev = all_wait
            all_wait_prev_by.clear()
            for vid in ids:
                if vid != "ambulance":
                    all_wait_prev_by[vid] = traci.vehicle.getAccumulatedWaitingTime(vid)
    finally:
        try:
            traci.close()
        except Exception:
            pass

    travel = (amb_arrived - amb_departed) if (amb_arrived and amb_departed) else None
    return {
        "ambulanceWaitingSec": round(amb_wait, 1),
        "ambulanceTravelSec": round(travel, 1) if travel else None,
        "networkWaitingSec": round(all_wait, 1),
        "preemptions": preemptions,
    }


all_wait_prev_by = {}


def hold_green_ahead(traci, held, route_ids, lookahead=220.0):
    """Give the ambulance green at the next signal it is approaching."""
    try:
        lane = traci.vehicle.getLaneID("ambulance")
    except Exception:
        return 0
    if not lane or lane.startswith(":"):
        return 0

    changed = 0
    for tls in route_ids:
        try:
            links = traci.trafficlight.getControlledLinks(tls)
        except Exception:
            continue
        indices = [i for i, group in enumerate(links)
                   for link in group if link and link[0] == lane]
        if not indices:
            continue

        # How far is the ambulance from this junction's stop line?
        try:
            pos = traci.vehicle.getLanePosition("ambulance")
            length = traci.lane.getLength(lane)
        except Exception:
            continue
        if length - pos > lookahead:
            continue

        # Find a phase that gives all of those links green, and hold it.
        logic = traci.trafficlight.getAllProgramLogics(tls)[0]
        for pi, phase in enumerate(logic.phases):
            state = phase.state
            if all(pi_ok(state, i) for i in indices):
                if held.get(tls) != pi:
                    traci.trafficlight.setPhase(tls, pi)
                    held[tls] = pi
                    changed += 1
                traci.trafficlight.setPhaseDuration(tls, 15)
                break
    return changed


def pi_ok(state, index):
    return index < len(state) and state[index] in "Gg"


def release_all(traci, held):
    """Give every junction back to its own programme."""
    for tls in list(held):
        try:
            traci.trafficlight.setProgram(tls, "0")
        except Exception:
            pass
        del held[tls]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--net", default=os.path.join(CITY_DIR, "benz.net.xml"))
    ap.add_argument("--seconds", type=int, default=1500)
    ap.add_argument("--depart", type=float, default=200)
    ap.add_argument("--rate", type=float, default=0.6,
                    help="background vehicles inserted per second")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--gui", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.net):
        sys.exit("No network at %s - run: python sumo/build_city.py --place benz" % args.net)

    print("Reading %s ..." % os.path.relpath(args.net, HERE))
    net = sumolib.net.readNet(args.net)
    home, hospital, path, signals, km = pick_trip(net)

    print("\nThe trip")
    print("  from  %s" % home.getID())
    print("  to    %s" % hospital.getID())
    print("  %.2f km, %d road segments, crossing %d signalised junctions"
          % (km, len(path), len(signals)))
    if len(signals) < 2:
        print("  (few signals on this route - the corridor has little to do here)")

    route_file = os.path.join(CITY_DIR, "corridor.rou.xml")
    print("\nGenerating background traffic ...")
    build_traffic(args.net, route_file, args.seconds, args.rate, args.seed)
    add_ambulance(route_file, path, args.depart)

    print("\nRunning the same traffic twice.\n")
    print("  %-28s %14s %14s %16s" %
          ("", "amb. waiting", "amb. travel", "network waiting"))

    base = run(args.net, route_file, False, signals, args.seconds, seed=args.seed)
    print("  %-28s %13.1fs %13s %15.0f" %
          ("signals ignore it", base["ambulanceWaitingSec"],
           fmt(base["ambulanceTravelSec"]), base["networkWaitingSec"]))

    corr = run(args.net, route_file, True, signals, args.seconds,
               gui=args.gui, seed=args.seed)
    print("  %-28s %13.1fs %13s %15.0f" %
          ("green corridor", corr["ambulanceWaitingSec"],
           fmt(corr["ambulanceTravelSec"]), corr["networkWaitingSec"]))

    print("\n" + "=" * 74)
    if base["ambulanceTravelSec"] and corr["ambulanceTravelSec"]:
        saved = base["ambulanceTravelSec"] - corr["ambulanceTravelSec"]
        pct = saved / base["ambulanceTravelSec"] * 100
        print("  Ambulance trip: %.0fs -> %.0fs   (%.0fs saved, %.0f%%)"
              % (base["ambulanceTravelSec"], corr["ambulanceTravelSec"], saved, pct))
    cost = corr["networkWaitingSec"] - base["networkWaitingSec"]
    print("  Everyone else:  %.0f -> %.0f vehicle-seconds   (%+.0f)"
          % (base["networkWaitingSec"], corr["networkWaitingSec"], cost))
    print("  %d junction preemptions along the route" % corr["preemptions"])
    print("\n  Real Vijayawada geometry from OpenStreetMap. Signal placement is")
    print("  inferred, because the map does not record it - say so.")


def fmt(v):
    return ("%.0fs" % v) if v else "did not arrive"


if __name__ == "__main__":
    main()
