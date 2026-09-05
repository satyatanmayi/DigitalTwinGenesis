"""
sumo/build_city.py - import a real city's roads and turn them into a network.

Downloads OpenStreetMap data for a bounding box through the Overpass API and
compiles it with netconvert. No browser, no osmWebWizard, no clicking - so the
whole thing is reproducible and can be re-run with one command.

    python sumo/build_city.py                        # Vijayawada city centre
    python sumo/build_city.py --place benz           # a smaller area
    python sumo/build_city.py --bbox 16.49,80.63,16.52,80.66 --name mycity

WHAT COMES OUT, in sumo/city/
    <name>.osm.xml     the raw OpenStreetMap extract
    <name>.net.xml     the compiled SUMO network
    and a printed summary: how many junctions, how many of them signalised,
    and the ids you need for the next step

WHY THE ROAD FILTER MATTERS
    OpenStreetMap contains footpaths, driveways, tracks and service roads. Import
    all of it and you get a network that is enormous, slow, and full of junctions
    no traffic engineer cares about. The filter below keeps the roads a city
    actually signalises.
"""

import argparse
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CITY_DIR = os.path.join(HERE, "city")

# Bounding boxes as (south, west, north, east).
PLACES = {
    "vijayawada": (16.4930, 80.6250, 16.5230, 80.6650),   # city centre
    "benz": (16.4920, 80.6440, 16.5060, 80.6620),          # Benz Circle area
    "tiny": (16.4980, 80.6480, 16.5040, 80.6560),          # a few junctions only
}

# Roads worth simulating. Everything smaller is noise for signal control.
HIGHWAYS = ("motorway|trunk|primary|secondary|tertiary|unclassified|residential"
            "|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link")

OVERPASS = "https://overpass-api.de/api/interpreter"


def sumo_bin(name):
    try:
        import sumo
        p = os.path.join(os.path.dirname(sumo.__file__), "bin", name + ".exe")
        if os.path.exists(p):
            return p
        p = os.path.join(os.path.dirname(sumo.__file__), "bin", name)
        if os.path.exists(p):
            return p
    except ImportError:
        pass
    return name


def download(bbox, out_path):
    south, west, north, east = bbox
    box = "%f,%f,%f,%f" % (south, west, north, east)
    query = """
    [out:xml][timeout:180];
    (
      way[highway~"^(%s)$"](%s);
      node(w);
      node[highway=traffic_signals](%s);
      relation[type=restriction](%s);
    );
    out body;
    """ % (HIGHWAYS, box, box, box)

    print("downloading OpenStreetMap data for %s ..." % box)
    req = urllib.request.Request(OVERPASS, data=query.encode("utf-8"),
                                 headers={"User-Agent": "digital-twin-genesis/1.0 (student project)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    with open(out_path, "wb") as fh:
        fh.write(data)
    print("  %.1f MB written to %s" % (len(data) / 1e6, os.path.relpath(out_path, HERE)))
    return out_path


def count_tagged_signals(osm_path):
    """How many signals does OpenStreetMap actually claim exist here?"""
    import re
    with open(osm_path, encoding="utf-8", errors="ignore") as fh:
        return len(re.findall(r'v="traffic_signals"', fh.read()))


def compile_network(osm_path, net_path, guess_signals=True, threshold=25.0):
    cmd = [
        sumo_bin("netconvert"),
        "--osm-files", osm_path,
        "--output-file", net_path,
        # Real OSM data is messy. These are the standard clean-up options, and
        # each one exists because the raw import is otherwise unusable:
        "--geometry.remove", "true",          # drop redundant shape points
        "--roundabouts.guess", "true",        # recognise roundabouts
        "--ramps.guess", "true",              # build on/off ramps properly
        "--junctions.join", "true",           # merge the cluster of nodes that
                                              # OSM uses for one real junction
        "--junctions.join-dist", "20",
        "--tls.guess-signals", "true",        # signals tagged on nodes become
                                              # signals on the junction
        "--tls.discard-simple", "true",       # drop signals on trivial junctions
        "--tls.join", "true",                 # one controller per real junction
        "--tls.default-type", "static",
        "--tls.green.time", "30",
        "--tls.yellow.time", "4",
        "--tls.allred.time", "2",
        "--remove-edges.isolated", "true",
        "--keep-edges.by-vclass", "passenger",
        "--no-turnarounds", "true",
        "--offset.disable-normalization", "false",
    ]
    if guess_signals:
        # Indian cities are barely signal-tagged in OpenStreetMap - Vijayawada
        # centre has two tagged signals across 516 km of road, and the real
        # number is in the hundreds. So we ask netconvert to infer a signal at
        # any junction big enough to warrant one. This is standard practice for
        # OSM imports, and it is an assumption that must be declared rather
        # than hidden: the geometry is real, the signal placement is inferred.
        cmd += ["--tls.guess", "true", "--tls.guess.threshold", str(threshold)]
    print("\ncompiling with netconvert ...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    warnings = [l for l in (res.stderr or "").splitlines() if "Warning" in l]
    if res.returncode != 0:
        print(res.stdout[-3000:])
        print(res.stderr[-3000:], file=sys.stderr)
        sys.exit("netconvert failed")
    print("  built %s  (%d warnings, which is normal for real map data)"
          % (os.path.relpath(net_path, HERE), len(warnings)))
    return net_path


def summarise(net_path, tagged=None):
    """What did we actually get? Read it with sumolib rather than guessing."""
    import sumolib
    net = sumolib.net.readNet(net_path)
    nodes = net.getNodes()
    signalised = [n for n in nodes if n.getType() == "traffic_light"]
    edges = [e for e in net.getEdges() if e.getFunction() != "internal"]
    total_km = sum(e.getLength() for e in edges) / 1000.0

    print("\nWhat came back:")
    print("  %5d junctions, of which %d are signalised" % (len(nodes), len(signalised)))
    print("  %5d road segments, %.1f km of road in total" % (len(edges), total_km))

    if signalised:
        print("\n  Signalised junctions, busiest first (by number of arms):")
        ranked = sorted(signalised, key=lambda n: -len(n.getIncoming()))
        for n in ranked[:8]:
            names = set()
            for e in n.getIncoming():
                nm = e.getName()
                if nm:
                    names.add(nm)
            label = ", ".join(sorted(names)[:2]) or "unnamed"
            print("    %-22s %d arms   %s" % (n.getID(), len(n.getIncoming()), label))
    else:
        print("\n  No signalised junctions in this box. Either the area genuinely has")
        print("  none tagged in OpenStreetMap, or the box is too small. Try a bigger")
        print("  --bbox, or --place vijayawada.")
    return len(signalised), len(edges)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--place", choices=sorted(PLACES), default="vijayawada")
    ap.add_argument("--bbox", help="south,west,north,east")
    ap.add_argument("--name", default=None)
    ap.add_argument("--no-guess", action="store_true",
                    help="only use signals OpenStreetMap actually tagged")
    ap.add_argument("--reuse", action="store_true",
                    help="skip the download if the .osm.xml is already there")
    args = ap.parse_args()

    bbox = tuple(float(x) for x in args.bbox.split(",")) if args.bbox else PLACES[args.place]
    name = args.name or args.place

    os.makedirs(CITY_DIR, exist_ok=True)
    osm_path = os.path.join(CITY_DIR, name + ".osm.xml")
    net_path = os.path.join(CITY_DIR, name + ".net.xml")

    if not (args.reuse and os.path.exists(osm_path)):
        download(bbox, osm_path)
    else:
        print("reusing %s" % os.path.relpath(osm_path, HERE))

    tagged = count_tagged_signals(osm_path)
    compile_network(osm_path, net_path, guess_signals=not args.no_guess)
    summarise(net_path, tagged=tagged)

    print("\nNext:  python sumo/city_corridor.py --net %s"
          % os.path.relpath(net_path, HERE).replace("\\", "/"))


if __name__ == "__main__":
    main()
