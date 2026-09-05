"""
tools/train.py - trains the signal-control policy.

WHAT THIS IS
------------
A Deep Q-Network, written with NumPy so every line is readable, trained against
the SAME simulator the browser runs. It never re-implements the traffic physics:
it talks to tools/env-server.js over a JSON line protocol, sends actions, and
gets back states and rewards.

WHAT IT LEARNS
--------------
One shared policy used by every junction (parameter sharing, the standard
approach in the traffic RL literature - it learns faster because every junction
contributes experience to the same network).

  Input, 8 numbers describing one junction, all relative to the phase that is
  green right now, so the policy never has to work out which way round it is:
      0  queue on the green phase                  (PCU / 12)
      1  queue on the red phase                    (PCU / 12)
      2  red queue minus green queue               - what the decision turns on
      3  longest wait on the green phase           (s / 60)
      4  longest wait on the red phase             (s / 60)
      5  red wait minus green wait
      6  green already served                      (s / 60)
      7  1 if minimum green has been served, so switching is allowed

  Output, 3 Q-values, one per action:
      0  hold        do nothing; the underlying timing plan runs
      1  switch      end the running phase now and serve the other one

WHAT IT DOES NOT LEARN
----------------------
Safety. Minimum green, maximum green, yellow and all-red are enforced inside
sim.js, underneath the single function every controller writes through. The
network proposes; the safety layer disposes. A bad action costs delay, never
safety.

RUN
---
    python tools/train.py                  # train, evaluate, write weights.json
    python tools/train.py --episodes 40    # shorter run
    python tools/train.py --eval-only      # score the existing weights.json
"""

import argparse
import json
import os
import random
import subprocess
import sys
import time
from collections import deque

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_SERVER = os.path.join(ROOT, "tools", "env-server.js")
WEIGHTS_OUT = os.path.join(ROOT, "weights.json")

STATE_PER_JUNCTION = 8
N_ACTIONS = 2            # 0 = keep the current phase, 1 = switch
HIDDEN = (64, 48)

GAMMA = 0.95
LR = 0.0015
BATCH = 64
REPLAY = 20000
TARGET_SYNC = 250          # gradient steps between target-network copies
EPS_START, EPS_END = 1.0, 0.05
DECISION_SEC = 5.0        # seconds between decisions - the literature uses 5-10s,
                          # and it makes credit assignment far easier than 1s


# --------------------------------------------------------------------------- env
class Env:
    """One Node process running the real simulator, spoken to in JSON lines."""

    def __init__(self):
        self.proc = subprocess.Popen(
            ["node", ENV_SERVER],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, bufsize=1, cwd=ROOT,
        )

    def send(self, msg):
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError("env-server closed unexpectedly")
        return json.loads(line)

    def reset(self, seed, load=1.0, warmup=20, profile=None):
        msg = {"cmd": "reset", "seed": seed, "load": load, "warmup": warmup}
        msg.update(profile or {})
        return self.send(msg)

    def step(self, actions, seconds=DECISION_SEC):
        return self.send({"cmd": "step", "actions": actions, "seconds": seconds})

    def baseline(self, seed, load=1.0, seconds=300, profile=None):
        msg = {"cmd": "baseline", "seed": seed, "load": load, "seconds": seconds}
        msg.update(profile or {})
        return self.send(msg)

    def reference(self, seed, load=1.0, seconds=300, profile=None):
        """Max-Pressure on the same traffic - the classical opponent."""
        msg = {"cmd": "reference", "seed": seed, "load": load, "seconds": seconds}
        msg.update(profile or {})
        return self.send(msg)

    def close(self):
        try:
            self.send({"cmd": "close"})
        except Exception:
            pass
        self.proc.terminate()


# ------------------------------------------------------------------------ network
class MLP:
    """Two hidden layers, ReLU, linear output. Hand-written forward and backward
    pass - about thirty lines, and no framework to explain away."""

    def __init__(self, sizes, rng):
        self.W, self.b = [], []
        for i in range(len(sizes) - 1):
            fan_in = sizes[i]
            # He initialisation: keeps activations from vanishing through ReLU.
            self.W.append(rng.normal(0, np.sqrt(2.0 / fan_in), (sizes[i], sizes[i + 1])))
            self.b.append(np.zeros(sizes[i + 1]))

    def forward(self, x, cache=False):
        acts = [x]
        h = x
        for i in range(len(self.W) - 1):
            h = np.maximum(0.0, h @ self.W[i] + self.b[i])      # ReLU
            acts.append(h)
        out = h @ self.W[-1] + self.b[-1]                        # linear head
        return (out, acts) if cache else out

    def backward(self, acts, dout, lr):
        """Plain stochastic gradient descent. dout is dLoss/dOutput."""
        grads_W, grads_b = [None] * len(self.W), [None] * len(self.b)
        d = dout
        for i in range(len(self.W) - 1, -1, -1):
            a = acts[i]
            grads_W[i] = a.T @ d / len(a)
            grads_b[i] = d.mean(axis=0)
            if i > 0:
                d = (d @ self.W[i].T) * (acts[i] > 0)            # ReLU derivative
        for i in range(len(self.W)):
            self.W[i] -= lr * grads_W[i]
            self.b[i] -= lr * grads_b[i]

    def copy_from(self, other):
        self.W = [w.copy() for w in other.W]
        self.b = [b.copy() for b in other.b]

    def to_json(self):
        return {
            "layers": [{"W": w.tolist(), "b": b.tolist()} for w, b in zip(self.W, self.b)],
            "inputSize": self.W[0].shape[0],
            "actions": ["hold", "switch"],
        }

    @staticmethod
    def from_json(data, rng):
        sizes = [len(data["layers"][0]["W"])] + [len(l["b"]) for l in data["layers"]]
        net = MLP(sizes, rng)
        net.W = [np.array(l["W"]) for l in data["layers"]]
        net.b = [np.array(l["b"]) for l in data["layers"]]
        return net


def split_state(flat):
    """The env returns one flat vector; the shared policy wants one row per junction."""
    arr = np.array(flat, dtype=float)
    return arr.reshape(-1, STATE_PER_JUNCTION)


# ------------------------------------------------------------ Monte-Carlo mode
def train_mc(episodes, steps, seed_pool, load, profile, horizon=12, explore=0.5, quiet=False):
    """Learn the value of each action from what actually happened afterwards.

    Instead of bootstrapping off its own estimates the way DQN does, this
    collects experience with a mostly-random policy and labels each decision
    with the discounted reward that genuinely followed it over the next
    `horizon` steps (60 simulated seconds). Then it fits the network to those
    labels by plain regression.

    Slower per sample, far more stable at this scale, and much easier to
    explain: the number the network predicts is a measured outcome, not a
    guess about a guess.
    """
    rng = np.random.default_rng(7)
    net = MLP([STATE_PER_JUNCTION, HIDDEN[0], HIDDEN[1], N_ACTIONS], rng)
    env = Env()
    samples = []
    started = time.time()

    try:
        # ---- collect -------------------------------------------------------
        for ep in range(episodes):
            seed = seed_pool[ep % len(seed_pool)]
            obs = split_state(env.reset(seed, load, profile=profile)["state"])
            traj = []
            for _ in range(steps):
                if random.random() < explore or not samples:
                    actions = [random.randrange(N_ACTIONS) for _ in obs]
                else:
                    actions = [int(np.argmax(row)) for row in net.forward(obs)]
                res = env.step(actions)
                rews = res.get("rewards") or [res["reward"]] * len(obs)
                traj.append((obs, actions, rews))
                obs = split_state(res["state"])

            # ---- label with the discounted return that actually followed ----
            for t in range(len(traj) - horizon):
                st, ac, _ = traj[t]
                for i in range(len(st)):
                    g, discount = 0.0, 1.0
                    for k in range(horizon):
                        g += discount * traj[t + k][2][i]
                        discount *= GAMMA
                    samples.append((st[i], ac[i], g))

            if not quiet and (ep + 1) % 10 == 0:
                print("  collected %d episodes, %d samples" % (ep + 1, len(samples)), flush=True)
    finally:
        env.close()

    # ---- fit ---------------------------------------------------------------
    S = np.array([s[0] for s in samples])
    A = np.array([s[1] for s in samples])
    G = np.array([s[2] for s in samples])
    # Normalise the targets so the learning rate is not fighting their scale.
    g_mean, g_std = G.mean(), G.std() + 1e-6
    Gn = (G - g_mean) / g_std

    order = np.arange(len(S))
    history = []
    for epoch in range(60):
        rng.shuffle(order)
        losses = []
        for start in range(0, len(order) - BATCH, BATCH):
            idx = order[start:start + BATCH]
            s_b, a_b, g_b = S[idx], A[idx], Gn[idx]
            pred, acts = net.forward(s_b, cache=True)
            chosen = pred[np.arange(len(idx)), a_b]
            err = chosen - g_b
            dout = np.zeros_like(pred)
            dout[np.arange(len(idx)), a_b] = 2.0 * err / len(idx)
            net.backward(acts, dout, 0.01)
            losses.append(float(np.mean(err ** 2)))
        history.append({"epoch": epoch + 1, "loss": float(np.mean(losses))})
        if not quiet and (epoch + 1) % 15 == 0:
            print("  epoch %2d  regression loss %.4f" % (epoch + 1, np.mean(losses)), flush=True)

    if not quiet:
        print("  %d samples, fitted in %.1fs" % (len(samples), time.time() - started))
    return net, history


# ----------------------------------------------------------------------- training
def train(episodes, steps, seed_pool, load, profile, quiet=False):
    rng = np.random.default_rng(7)
    online = MLP([STATE_PER_JUNCTION, HIDDEN[0], HIDDEN[1], N_ACTIONS], rng)
    target = MLP([STATE_PER_JUNCTION, HIDDEN[0], HIDDEN[1], N_ACTIONS], rng)
    target.copy_from(online)

    replay = deque(maxlen=REPLAY)
    env = Env()
    updates = 0
    history = []
    started = time.time()

    try:
        for ep in range(episodes):
            frac = ep / max(1, episodes - 1)
            eps = EPS_START + (EPS_END - EPS_START) * frac      # linear decay
            seed = seed_pool[ep % len(seed_pool)]
            obs = split_state(env.reset(seed, load, profile=profile)["state"])
            ep_reward = 0.0

            for _ in range(steps):
                q = online.forward(obs)                          # (junctions, 3)
                actions = []
                for row in q:
                    if random.random() < eps:
                        actions.append(random.randrange(N_ACTIONS))
                    else:
                        actions.append(int(np.argmax(row)))

                res = env.step(actions)
                nxt = split_state(res["state"])
                rews = res.get("rewards") or [res["reward"]] * len(obs)
                ep_reward += float(np.mean(rews))

                for i in range(len(obs)):
                    replay.append((obs[i], actions[i], rews[i], nxt[i]))
                obs = nxt

                if len(replay) >= BATCH * 4:
                    batch = random.sample(replay, BATCH)
                    s = np.array([b[0] for b in batch])
                    a = np.array([b[1] for b in batch])
                    r = np.array([b[2] for b in batch])
                    s2 = np.array([b[3] for b in batch])

                    # Q-learning target: reward now plus the discounted best
                    # value the target network thinks is available next.
                    q_next = target.forward(s2).max(axis=1)
                    y = r + GAMMA * q_next

                    pred, acts = online.forward(s, cache=True)
                    dout = np.zeros_like(pred)
                    chosen = pred[np.arange(BATCH), a]
                    dout[np.arange(BATCH), a] = 2.0 * (chosen - y) / BATCH   # MSE gradient
                    online.backward(acts, dout, LR)

                    updates += 1
                    if updates % TARGET_SYNC == 0:
                        target.copy_from(online)

            delay = env.step([0] * len(obs))["info"]["delay"]
            history.append({"episode": ep + 1, "reward": ep_reward, "epsilon": eps, "delay": delay})
            if not quiet:
                print("  episode %3d/%d  eps %.2f  reward %8.1f  delay %5.2fs"
                      % (ep + 1, episodes, eps, ep_reward, delay), flush=True)
    finally:
        env.close()

    if not quiet:
        print("  trained in %.1fs over %d gradient steps" % (time.time() - started, updates))
    return online, history


# --------------------------------------------------------------------- evaluation
def evaluate(net, seeds, load, profile, seconds=240):
    """Held-out seeds, never trained on. Fixed plan versus the policy, same traffic."""
    env = Env()
    rows = []
    try:
        for seed in seeds:
            base = env.baseline(seed, load, seconds, profile)
            ref = env.reference(seed, load, seconds, profile)

            start = env.reset(seed, load, profile=profile)
            obs = split_state(start["state"])
            mark = start["info"]          # after warm-up, same point the baseline uses
            for _ in range(int(seconds / DECISION_SEC)):
                q = net.forward(obs)
                actions = [int(np.argmax(row)) for row in q]
                res = env.step(actions)
                obs = split_state(res["state"])

            # Windowed control delay, measured exactly like the baseline:
            # total delay accumulated in the window / vehicles completed in it.
            end = res["info"]
            done = end["processed"] - mark["processed"]
            trained = (end["delaySum"] - mark["delaySum"]) / done if done else 0.0

            rows.append({"seed": seed, "fixed": base["delay"], "maxpressure": ref["delay"],
                         "model": trained, "completed": done})
    finally:
        env.close()
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", type=int, default=45)
    ap.add_argument("--steps", type=int, default=180)
    ap.add_argument("--load", type=float, default=0.7)
    ap.add_argument("--bias", type=float, default=2.0,
                    help="how much heavier the busy axis is")
    ap.add_argument("--flip", type=float, default=0,
                    help="seconds between peak-direction reversals, 0 for none")
    ap.add_argument("--eval-only", action="store_true")
    ap.add_argument("--eval-seconds", type=int, default=360,
                    help="length of the measured comparison window")
    ap.add_argument("--method", choices=["mc", "dqn"], default="mc",
                    help="mc = Monte-Carlo regression (stable), dqn = bootstrapped")
    args = ap.parse_args()

    profile = {"bias": args.bias, "biasAxis": "EW", "flipEvery": args.flip}
    rng = np.random.default_rng(1)
    train_seeds = [11, 23, 37, 51, 68, 79, 84, 97]
    eval_seeds = [101, 202, 303]        # never seen during training

    if args.eval_only:
        with open(WEIGHTS_OUT) as fh:
            net = MLP.from_json(json.load(fh), rng)
        history = []
    else:
        print("Training against the live simulator (tools/env-server.js)")
        print("  %d episodes x %d steps, load %.1fx, busy axis %.1fx%s"
              % (args.episodes, args.steps, args.load, args.bias,
                 ", peak reverses every %ds" % args.flip if args.flip else ""))
        if args.method == 'mc':
            net, history = train_mc(args.episodes, args.steps, train_seeds, args.load, profile)
        else:
            net, history = train(args.episodes, args.steps, train_seeds, args.load, profile)

    print("\nEvaluating on held-out seeds, identical traffic per comparison:")
    rows = evaluate(net, eval_seeds, args.load, profile, args.eval_seconds)
    fixed = float(np.mean([r["fixed"] for r in rows]))
    mp = float(np.mean([r["maxpressure"] for r in rows]))
    model = float(np.mean([r["model"] for r in rows]))
    for r in rows:
        print("  seed %-4d fixed %6.2fs   max-pressure %6.2fs   model %6.2fs   (%d vehicles)"
              % (r["seed"], r["fixed"], r["maxpressure"], r["model"], r["completed"]))
    change = (fixed - model) / fixed * 100 if fixed else 0.0
    verdict = "better" if model < fixed else "WORSE"
    print("  mean      fixed %6.2fs   max-pressure %6.2fs   model %6.2fs   -> %.1f%% %s than fixed"
          % (fixed, mp, model, abs(change), verdict))

    if not args.eval_only:
        payload = net.to_json()
        payload["meta"] = {
            "trainedAt": time.strftime("%Y-%m-%d %H:%M"),
            "method": args.method,
            "episodes": args.episodes,
            "steps": args.steps,
            "load": args.load,
            "demandBias": args.bias,
            "flipEvery": args.flip,
            "trainSeeds": train_seeds,
            "evalSeeds": eval_seeds,
            "evaluation": {"fixedDelay": fixed, "maxPressureDelay": mp,
                           "modelDelay": model, "changePct": change},
            "stateLayout": ["greenQueue/12", "redQueue/12", "queueDiff/12",
                            "greenWait/60", "redWait/60", "waitDiff/60",
                            "greenElapsed/60", "minGreenServed"],
            "note": "Trained by tools/train.py against tools/env-server.js, which runs "
                    "the same sim.js the browser runs.",
        }
        with open(WEIGHTS_OUT, "w") as fh:
            json.dump(payload, fh)
        print("\nWrote %s (%d layers)" % (WEIGHTS_OUT, len(payload["layers"])))
        if history:
            with open(os.path.join(ROOT, "tools", "training-history.json"), "w") as fh:
                json.dump(history, fh, indent=1)


if __name__ == "__main__":
    main()
