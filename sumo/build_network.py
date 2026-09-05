"""
sumo/build_network.py - builds the junction, without touching netedit.

netedit is a drawing tool. Drawing a junction by hand is fine once, but it is
not reproducible: nobody else can rebuild your network, and you cannot change
one number and regenerate. So the network is described here in plain XML and
compiled by netconvert, which is the same program netedit calls when it saves.

WHAT IT BUILDS
    A single four-arm signalised junction. Each arm is 200 m long with two
    lanes in each direction, a 50 km/h limit, and a traffic light in the middle
    running a two-phase plan (north-south green, then east-west green).

    Four arms, eight approach lanes, one signal. That is the smallest thing
    that can still show priority conflicting with ordinary traffic.

RUN
    python sumo/build_network.py

    Produces, in sumo/net/:
        junction.nod.xml   the four corner points and the centre
        junction.edg.xml   the roads between them
        junction.con.xml   which lane connects to which
        junction.net.xml   the compiled network SUMO actually loads
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NET_DIR = os.path.join(HERE, "net")
ARM_LENGTH = 200          # metres from the junction to each map edge
SPEED = 13.9              # m/s, about 50 km/h
LANES = 2

# ---------------------------------------------------------------- SUMO binaries
def sumo_bin(name):
    """The pip package ships the binaries inside site-packages/sumo/bin."""
    try:
        import sumo
        candidate = os.path.join(os.path.dirname(sumo.__file__), "bin", name + ".exe")
        if os.path.exists(candidate):
            return candidate
        candidate = os.path.join(os.path.dirname(sumo.__file__), "bin", name)
        if os.path.exists(candidate):
            return candidate
    except ImportError:
        pass
    return name          # fall back to whatever is on PATH


NODES = """<?xml version="1.0" encoding="UTF-8"?>
<nodes>
    <!-- The centre is a traffic light. The four ends are plain map edges where
         vehicles enter and leave the world. -->
    <node id="centre" x="0"    y="0"    type="traffic_light" tlType="static"/>
    <node id="north"  x="0"    y="{L}"  type="priority"/>
    <node id="south"  x="0"    y="-{L}" type="priority"/>
    <node id="east"   x="{L}"  y="0"    type="priority"/>
    <node id="west"   x="-{L}" y="0"    type="priority"/>
</nodes>
""".format(L=ARM_LENGTH)

EDGES = """<?xml version="1.0" encoding="UTF-8"?>
<edges>
    <!-- Two edges per arm: one inbound, one outbound. The ids are readable on
         purpose - n2c means "north to centre", and it is what you will see in
         the logs and in the state vector. -->
    <edge id="n2c" from="north"  to="centre" numLanes="{n}" speed="{s}"/>
    <edge id="c2n" from="centre" to="north"  numLanes="{n}" speed="{s}"/>
    <edge id="s2c" from="south"  to="centre" numLanes="{n}" speed="{s}"/>
    <edge id="c2s" from="centre" to="south"  numLanes="{n}" speed="{s}"/>
    <edge id="e2c" from="east"   to="centre" numLanes="{n}" speed="{s}"/>
    <edge id="c2e" from="centre" to="east"   numLanes="{n}" speed="{s}"/>
    <edge id="w2c" from="west"   to="centre" numLanes="{n}" speed="{s}"/>
    <edge id="c2w" from="centre" to="west"   numLanes="{n}" speed="{s}"/>
</edges>
""".format(n=LANES, s=SPEED)

# Lane 0 is the right-hand lane (right turn plus straight), lane 1 is the left
# lane (straight plus left turn). Spelling the connections out keeps the signal
# plan predictable instead of leaving netconvert to guess.
CONNECTIONS = """<?xml version="1.0" encoding="UTF-8"?>
<connections>
    <connection from="n2c" to="c2s" fromLane="0" toLane="0"/>
    <connection from="n2c" to="c2s" fromLane="1" toLane="1"/>
    <connection from="n2c" to="c2w" fromLane="0" toLane="0"/>
    <connection from="n2c" to="c2e" fromLane="1" toLane="1"/>

    <connection from="s2c" to="c2n" fromLane="0" toLane="0"/>
    <connection from="s2c" to="c2n" fromLane="1" toLane="1"/>
    <connection from="s2c" to="c2e" fromLane="0" toLane="0"/>
    <connection from="s2c" to="c2w" fromLane="1" toLane="1"/>

    <connection from="e2c" to="c2w" fromLane="0" toLane="0"/>
    <connection from="e2c" to="c2w" fromLane="1" toLane="1"/>
    <connection from="e2c" to="c2n" fromLane="0" toLane="0"/>
    <connection from="e2c" to="c2s" fromLane="1" toLane="1"/>

    <connection from="w2c" to="c2e" fromLane="0" toLane="0"/>
    <connection from="w2c" to="c2e" fromLane="1" toLane="1"/>
    <connection from="w2c" to="c2s" fromLane="0" toLane="0"/>
    <connection from="w2c" to="c2n" fromLane="1" toLane="1"/>
</connections>
"""


def main():
    os.makedirs(NET_DIR, exist_ok=True)
    paths = {}
    for name, content in (("nod", NODES), ("edg", EDGES), ("con", CONNECTIONS)):
        p = os.path.join(NET_DIR, "junction." + name + ".xml")
        with open(p, "w") as fh:
            fh.write(content)
        paths[name] = p
        print("wrote", os.path.relpath(p, HERE))

    out = os.path.join(NET_DIR, "junction.net.xml")
    cmd = [
        sumo_bin("netconvert"),
        "--node-files", paths["nod"],
        "--edge-files", paths["edg"],
        "--connection-files", paths["con"],
        "--output-file", out,
        # A two-phase plan: north-south, then east-west. This is the fixed-time
        # baseline the model has to beat.
        "--tls.default-type", "static",
        "--tls.green.time", "30",
        "--tls.yellow.time", "4",
        "--tls.allred.time", "2",
        "--no-turnarounds", "true",
        "--default.lanenumber", str(LANES),
    ]
    print("\nrunning netconvert...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout)
        print(res.stderr, file=sys.stderr)
        sys.exit("netconvert failed")
    print("built", os.path.relpath(out, HERE))

    # Report the signal programme netconvert generated, because the phase
    # indices are what the model's actions refer to.
    import re
    with open(out) as fh:
        net = fh.read()
    phases = re.findall(r'<phase duration="(\d+)" state="([^"]+)"/>', net)
    print("\nsignal programme at 'centre':")
    for i, (dur, state) in enumerate(phases):
        kind = "green" if "G" in state else ("yellow" if "y" in state else "all-red")
        print("  phase %d  %2ss  %-24s %s" % (i, dur, state, kind))
    print("\nGreen phases (the ones the model chooses between): "
          + ", ".join(str(i) for i, (_, s) in enumerate(phases) if "G" in s))


if __name__ == "__main__":
    main()
