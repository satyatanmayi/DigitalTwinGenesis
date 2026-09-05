"""
sumo/train_dqn.py - trains the emergency-priority signal controller.

This is a Deep Q-Network in PyTorch. It is deliberately written out rather than
pulled from a library, because you have to be able to explain it.

THE FOUR LINES THAT ARE THE WHOLE OF DEEP LEARNING
--------------------------------------------------
Every network, everywhere, trains with these four steps:

    pred = model(x)            # the network makes a guess
    loss = loss_fn(pred, y)    # how wrong the guess was
    loss.backward()            # work out which way to nudge every weight
    opt.step()                 # nudge them

Everything else - layers, replay buffers, target networks - is about producing
good `x` and `y`. The learning itself is those four lines. They appear once,
below, in `learn()`.

WHAT MAKES THIS Q-LEARNING RATHER THAN PLAIN SUPERVISED LEARNING
----------------------------------------------------------------
Nobody can tell us the right answer for "should the light switch now?", so
there is no `y` to copy. Instead the network predicts the total future reward
of each action - its Q-value - and we build `y` from what actually happened:

    y = reward_we_just_got + GAMMA * best_Q_value_of_the_next_state

That is the Bellman equation. The network is trained to agree with its own
future self, plus the real reward it observed. Two tricks keep that stable:

    replay buffer   train on a random mix of old experiences, not just the last
                    one, so the network does not chase whatever just happened
    target network  a frozen copy used for the "next state" half of y, resynced
                    occasionally, so the target does not move every step

RUN
    python sumo/train_dqn.py                       # about 6-10 minutes
    python sumo/train_dqn.py --episodes 60         # longer
    python sumo/train_dqn.py --gui                 # watch one episode (slow)

OUTPUT
    sumo/models/dqn.pt          the trained weights
    sumo/models/dqn_meta.json   what it was trained on, and its scores
"""

import argparse
import json
import os
import random
import sys
import tempfile
import time
from collections import deque

import numpy as np
import torch
import torch.nn as nn

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)                 # so `import env` finds our file, not the
                                         # installed `sumo` package of the same name
import env as ENV                        # noqa: E402
import build_routes                      # noqa: E402

MODEL_DIR = os.path.join(HERE, "models")
STATE_SIZE = ENV.STATE_SIZE
N_ACTIONS = ENV.N_ACTIONS

GAMMA = 0.95
LR = 1e-3
BATCH = 64
REPLAY_SIZE = 50_000
TARGET_SYNC = 400
EPS_START, EPS_END = 1.0, 0.05
WARMUP = 200                             # transitions before learning starts


# --------------------------------------------------------------------- network
class QNet(nn.Module):
    """Ten numbers in, one value per action out."""

    def __init__(self, state_size=STATE_SIZE, actions=N_ACTIONS):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_size, 64), nn.ReLU(),
            nn.Linear(64, 64), nn.ReLU(),
            nn.Linear(64, actions),
        )

    def forward(self, x):
        return self.net(x)


# -------------------------------------------------------------------- training
def make_scenario(rng):
    """A different junction day each episode, so the policy cannot memorise one.

    The demand is deliberately lopsided most of the time: an even split is the
    one case where no controller beats a fixed plan, so training only on that
    teaches nothing.
    """
    heavy = rng.choice(["ew", "ns"])
    heavy_rate = rng.choice([700, 800, 900, 1000])
    light_rate = rng.choice([300, 400, 500])
    ns = light_rate if heavy == "ew" else heavy_rate
    ew = heavy_rate if heavy == "ew" else light_rate
    return {
        "seed": rng.randint(1, 100000),
        "ns": ns,
        "ew": ew,
        "ev_at": None,          # filled in once the episode length is known
        "ev_axis": rng.choice(["ew", "ns"]),
    }


def build_scenario_file(scn, duration, path):
    # The ambulance must appear inside the episode, with enough time left to
    # finish its trip - otherwise the episode teaches nothing about priority.
    if scn.get("ev_at") is None:
        scn["ev_at"] = random.randint(90, max(120, int(duration * 0.6)))
    build_routes.build(seed=scn["seed"], ns_veh_per_hour=scn["ns"],
                       ew_veh_per_hour=scn["ew"], duration=duration,
                       ev_at=scn["ev_at"], ev_axis=scn["ev_axis"], out=path)
    return path


def learn(online, target, opt, loss_fn, replay):
    """The four lines, plus the Bellman target that feeds them."""
    batch = random.sample(replay, BATCH)
    s = torch.tensor(np.array([b[0] for b in batch]), dtype=torch.float32)
    a = torch.tensor([b[1] for b in batch], dtype=torch.int64)
    r = torch.tensor([b[2] for b in batch], dtype=torch.float32)
    s2 = torch.tensor(np.array([b[3] for b in batch]), dtype=torch.float32)
    done = torch.tensor([b[4] for b in batch], dtype=torch.float32)

    with torch.no_grad():
        best_next = target(s2).max(dim=1).values
        y = r + GAMMA * best_next * (1.0 - done)      # the Bellman target

    pred = online(s).gather(1, a.unsqueeze(1)).squeeze(1)   # 1. the guess
    loss = loss_fn(pred, y)                                  # 2. how wrong
    opt.zero_grad()
    loss.backward()                                          # 3. which way
    opt.step()                                               # 4. nudge
    return float(loss.item())


def train(episodes, seconds, gui=False, quiet=False):
    os.makedirs(MODEL_DIR, exist_ok=True)
    rng = random.Random(11)
    torch.manual_seed(11)

    online = QNet()
    target = QNet()
    target.load_state_dict(online.state_dict())
    opt = torch.optim.Adam(online.parameters(), lr=LR)
    loss_fn = nn.MSELoss()

    replay = deque(maxlen=REPLAY_SIZE)
    # Written thousands of times during training. Keep it out of any synced
    # folder - OneDrive will grab the handle mid-write and the run dies.
    route_path = os.path.join(tempfile.gettempdir(), "dtg_train.rou.xml")
    history = []
    updates = 0
    started = time.time()

    for ep in range(episodes):
        frac = ep / max(1, episodes - 1)
        eps = EPS_START + (EPS_END - EPS_START) * frac

        scn = make_scenario(rng)
        build_scenario_file(scn, seconds, route_path)
        environment = ENV.JunctionEnv(route_file=route_path, seconds=seconds,
                                      seed=scn["seed"], gui=gui and ep == 0)
        state = environment.reset()
        ep_reward, steps, done = 0.0, 0, False

        while not done:
            if random.random() < eps:
                action = random.randrange(N_ACTIONS)
            else:
                with torch.no_grad():
                    q = online(torch.tensor(state, dtype=torch.float32))
                    action = int(torch.argmax(q).item())

            nxt, reward, done, _ = environment.step(action)
            replay.append((state, action, reward, nxt, 1.0 if done else 0.0))
            state = nxt
            ep_reward += reward
            steps += 1

            if len(replay) >= max(WARMUP, BATCH):
                learn(online, target, opt, loss_fn, replay)
                updates += 1
                if updates % TARGET_SYNC == 0:
                    target.load_state_dict(online.state_dict())

        summary = environment.summary()
        environment.close()
        history.append({"episode": ep + 1, "reward": ep_reward, "epsilon": eps,
                        "scenario": scn, **summary})
        if not quiet:
            print("  ep %2d/%d  eps %.2f  reward %8.1f  ambulance waited %5.1fs  "
                  "network waited %7.0f veh-s  (%s heavy)"
                  % (ep + 1, episodes, eps, ep_reward,
                     summary["ambulanceWaitingSec"], summary["networkWaitingSec"],
                     "EW" if scn["ew"] > scn["ns"] else "NS"), flush=True)

    if not quiet:
        print("  trained in %.0fs over %d gradient steps" % (time.time() - started, updates))

    torch.save(online.state_dict(), os.path.join(MODEL_DIR, "dqn.pt"))
    return online, history


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", type=int, default=40)
    ap.add_argument("--seconds", type=int, default=600,
                    help="simulated seconds per episode")
    ap.add_argument("--gui", action="store_true", help="watch the first episode")
    args = ap.parse_args()

    print("Training the emergency-priority controller against SUMO")
    print("  %d episodes x %ds, decisions every %ds"
          % (args.episodes, args.seconds, ENV.DECISION_SEC))
    print("  state %d numbers, actions %d, reward weights ambulance x%.0f"
          % (STATE_SIZE, N_ACTIONS, ENV.EV_WEIGHT))

    model, history = train(args.episodes, args.seconds, gui=args.gui)

    meta = {
        "trainedAt": time.strftime("%Y-%m-%d %H:%M"),
        "episodes": args.episodes,
        "secondsPerEpisode": args.seconds,
        "stateSize": STATE_SIZE,
        "actions": ["serve north-south", "serve east-west"],
        "decisionSec": ENV.DECISION_SEC,
        "minGreen": ENV.MIN_GREEN,
        "evWeight": ENV.EV_WEIGHT,
        "stateLayout": [
            "queueN/20", "queueS/20", "queueE/20", "queueW/20",
            "waitN/120", "waitS/120", "waitE/120", "waitW/120",
            "ambulancePresent", "ambulanceCloseness",
            "ambulanceOnNS", "ambulanceOnEW",
        ],
        "history": history[-10:],
    }
    with open(os.path.join(MODEL_DIR, "dqn_meta.json"), "w") as fh:
        json.dump(meta, fh, indent=1)

    print("\nSaved sumo/models/dqn.pt")
    print("Now run:  python sumo/benchmark.py")


if __name__ == "__main__":
    main()
