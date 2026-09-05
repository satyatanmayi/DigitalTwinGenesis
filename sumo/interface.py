"""
sumo/interface.py - the one function the rest of the world calls.

Everything else in this folder exists to produce this: a function that takes the
state of a junction and returns which phase to serve. Whoever calls it needs to
know nothing about SUMO, PyTorch, replay buffers or reward shaping.

    from interface import get_signal_action

    action = get_signal_action(
        queue_n=4, queue_s=2, queue_e=11, queue_w=9,
        wait_n=12, wait_s=5, wait_e=48, wait_w=40,
        ambulance_present=True, ambulance_closeness=0.6, ambulance_axis="ew",
    )
    # -> 1   meaning: serve east-west

RETURNS
    0  serve north-south
    1  serve east-west

The caller is still responsible for safety. This function says what it would
prefer; the signal controller decides whether that is allowed right now -
minimum green, yellow and all-red belong to the controller, not to the model.

RUN
    python sumo/interface.py         # a few worked examples
"""

import os
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from train_dqn import QNet          # noqa: E402

MODEL_PATH = os.path.join(HERE, "models", "dqn.pt")

_model = None


def _load():
    global _model
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                "No trained model at %s. Run: python sumo/train_dqn.py" % MODEL_PATH)
        _model = QNet()
        _model.load_state_dict(torch.load(MODEL_PATH))
        _model.eval()
    return _model


def build_state(queue_n, queue_s, queue_e, queue_w,
                wait_n=0.0, wait_s=0.0, wait_e=0.0, wait_w=0.0,
                ambulance_present=False, ambulance_closeness=0.0,
                ambulance_axis=None):
    """Turn readable numbers into the 12 the network was trained on.

    Queues are counts of stopped vehicles; waits are seconds. The scaling here
    must match sumo/env.py exactly - if the two ever disagree, the model is
    being fed something it has never seen, and it will behave strangely for
    reasons that are very hard to find later.
    """
    axis = (ambulance_axis or "").lower()
    return [
        queue_n / 20.0, queue_s / 20.0, queue_e / 20.0, queue_w / 20.0,
        min(wait_n, 600.0) / 120.0, min(wait_s, 600.0) / 120.0,
        min(wait_e, 600.0) / 120.0, min(wait_w, 600.0) / 120.0,
        1.0 if ambulance_present else 0.0,
        float(ambulance_closeness) if ambulance_present else 0.0,
        1.0 if (ambulance_present and axis == "ns") else 0.0,
        1.0 if (ambulance_present and axis == "ew") else 0.0,
    ]


def get_signal_action(**kwargs):
    """Which phase to serve: 0 = north-south, 1 = east-west."""
    state = build_state(**kwargs)
    model = _load()
    with torch.no_grad():
        q = model(torch.tensor(state, dtype=torch.float32))
        return int(torch.argmax(q).item())


def explain(**kwargs):
    """The same decision, with the numbers behind it - for an operator screen."""
    state = build_state(**kwargs)
    model = _load()
    with torch.no_grad():
        q = model(torch.tensor(state, dtype=torch.float32)).tolist()
    action = 0 if q[0] >= q[1] else 1
    return {
        "action": action,
        "serve": "north-south" if action == 0 else "east-west",
        "valueNS": round(q[0], 3),
        "valueEW": round(q[1], 3),
        "margin": round(abs(q[0] - q[1]), 3),
    }


if __name__ == "__main__":
    cases = [
        ("east-west jammed, no ambulance",
         dict(queue_n=2, queue_s=1, queue_e=14, queue_w=12,
              wait_n=8, wait_s=4, wait_e=70, wait_w=60)),
        ("north-south jammed, no ambulance",
         dict(queue_n=13, queue_s=15, queue_e=2, queue_w=1,
              wait_n=65, wait_s=72, wait_e=6, wait_w=3)),
        ("east-west jammed, ambulance approaching on north-south",
         dict(queue_n=3, queue_s=2, queue_e=14, queue_w=12,
              wait_n=10, wait_s=6, wait_e=70, wait_w=60,
              ambulance_present=True, ambulance_closeness=0.7,
              ambulance_axis="ns")),
        ("quiet, ambulance approaching on east-west",
         dict(queue_n=1, queue_s=0, queue_e=2, queue_w=1,
              ambulance_present=True, ambulance_closeness=0.5,
              ambulance_axis="ew")),
    ]
    print("What the trained model would do:\n")
    for name, kw in cases:
        out = explain(**kw)
        print("  %-52s -> serve %-13s (NS %.2f, EW %.2f)"
              % (name, out["serve"], out["valueNS"], out["valueEW"]))
    print("\nThe third case is the interesting one: east-west has the longer"
          "\nqueue, but the ambulance is on north-south, and the model serves it.")
