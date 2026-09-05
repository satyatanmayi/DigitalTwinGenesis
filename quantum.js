/* =============================================================================
 * quantum.js — choosing every junction's phase at once, as a QUBO.
 *
 * WHY THIS EXISTS
 * Every controller in this project decides one junction at a time. That is fast
 * and it is myopic: a junction can clear its own queue and hand the platoon
 * straight to a red next door. Deciding the whole network in one shot fixes
 * that, and it turns the problem into combinatorial optimisation.
 *
 * THE FORMULATION
 * One binary variable per junction per phase:
 *
 *     x[j,p] = 1  means junction j serves phase p in the next interval
 *
 * and an energy to minimise:
 *
 *     E(x) = - SUM  served[j,p] · x[j,p]            serve long queues
 *            + LAMBDA · SUM_j ( SUM_p x[j,p] - 1 )²  exactly one phase each
 *            - MU · SUM  x[j,p]·x[k,p]               neighbours agree: a platoon
 *                    (j,k adjacent, same p)          released at j meets green at k
 *
 * Expand the squared constraint and every term is either linear (a diagonal
 * entry) or quadratic in two binary variables (an off-diagonal entry). That is
 * exactly a QUBO - Quadratic Unconstrained Binary Optimisation - which is the
 * form a quantum annealer takes as input. There is published work formulating
 * traffic signal control this way, including runs on D-Wave hardware.
 *
 * HOW IT IS SOLVED HERE
 * Simulated annealing, in this file, on a classical CPU. At four junctions the
 * whole space is 2^8 = 256 states, so we ALSO brute-force the exact optimum and
 * check the annealer found it. That check is the honest part: it shows the
 * solver works, and it shows why you would ever want different hardware -
 * brute force is 256 states here and 2^100 for a fifty-junction corridor.
 *
 * NOTHING IN THIS FILE IS QUANTUM. The formulation is quantum-ready; the
 * solving is classical. Say it that way.
 *
 * NO drawing code, NO p5.js, NO DOM access in this file.
 * ========================================================================== */

const QUANTUM = (function () {
  'use strict';

  const PHASES = ['NS', 'EW'];
  const LAMBDA = 40;      // weight on "exactly one phase per junction"
  const MU = 6;           // reward for neighbours running the same phase
  const SWEEPS = 4000;    // annealing sweeps

  /* ------------------------------------------------------------- the model */

  /** How much queue (in PCU) a phase would serve at this junction. */
  function served(j, phase) {
    const dirs = phase === 'NS' ? ['N', 'S'] : ['E', 'W'];
    let q = 0;
    for (const d of dirs) q += j.pcuQueues[d];
    // A phase that has already run a long time is worth less: serving it again
    // starves the other side, and the state machine will force a change anyway.
    const fatigue = (j.phase === phase) ? Math.min(1, j.greenElapsed / SIM.SIGNAL.maxGreen) : 0;
    return q * (1 - 0.5 * fatigue);
  }

  /** Junctions that share a road, so a platoon can actually travel between them. */
  function adjacent(a, b) {
    return (a.row === b.row) !== (a.col === b.col);   // same row or same column
  }

  /**
   * Build the QUBO matrix.
   * Returns { Q, index, labels } where Q is an n x n upper-triangular-ish
   * matrix of coefficients and index maps "J1:NS" to its variable number.
   */
  function build() {
    const junctions = SIM.junctions;
    const vars = [];
    const index = {};
    for (const j of junctions) {
      for (const p of PHASES) {
        index[j.id + ':' + p] = vars.length;
        vars.push({ junction: j, phase: p });
      }
    }
    const n = vars.length;
    const Q = [];
    for (let i = 0; i < n; i++) Q.push(new Array(n).fill(0));

    // Linear part: reward serving queue, and the -LAMBDA from expanding
    // (sum_p x - 1)^2 = sum_p x^2 - 2 sum_p x + 1, with x^2 = x for binaries.
    for (let i = 0; i < n; i++) {
      Q[i][i] += -served(vars[i].junction, vars[i].phase);
      Q[i][i] += LAMBDA * (1 - 2);          // = -LAMBDA
    }

    // Quadratic part of the same constraint: +2·LAMBDA for two phases at the
    // same junction both being chosen.
    for (const j of junctions) {
      const a = index[j.id + ':NS'], b = index[j.id + ':EW'];
      Q[a][b] += 2 * LAMBDA;
    }

    // Coordination: neighbours running the same phase get a discount.
    for (let a = 0; a < junctions.length; a++) {
      for (let b = a + 1; b < junctions.length; b++) {
        if (!adjacent(junctions[a], junctions[b])) continue;
        for (const p of PHASES) {
          const i = index[junctions[a].id + ':' + p];
          const k = index[junctions[b].id + ':' + p];
          Q[Math.min(i, k)][Math.max(i, k)] += -MU;
        }
      }
    }

    return { Q: Q, vars: vars, index: index, n: n };
  }

  /** E(x) = sum_i Q[i][i]x_i + sum_{i<k} Q[i][k] x_i x_k */
  function energy(Q, x) {
    let e = 0;
    for (let i = 0; i < x.length; i++) {
      if (!x[i]) continue;
      e += Q[i][i];
      for (let k = i + 1; k < x.length; k++) {
        if (x[k]) e += Q[i][k];
      }
    }
    return e;
  }

  /* ------------------------------------------------------------- the solver
   * Simulated annealing: start hot and accept bad moves, cool down and stop
   * accepting them. This is the classical stand-in for what an annealer does
   * with quantum tunnelling, and it takes the identical QUBO as input.
   */
  /* Annealing is stochastic: one run can settle in a local minimum. Restarting
   * from several random states and keeping the best is the standard fix, and
   * it is also what you would do on real annealing hardware - a D-Wave run is
   * a number of reads, not one. */
  function annealBest(Q, n, sweeps, restarts) {
    let best = null;
    for (let r = 0; r < (restarts || 8); r++) {
      const attempt = anneal(Q, n, sweeps);
      if (!best || attempt.energy < best.energy) best = attempt;
    }
    return best;
  }

  function anneal(Q, n, sweeps) {
    let x = new Array(n).fill(0).map(() => (Math.random() < 0.5 ? 1 : 0));
    let e = energy(Q, x);
    let bestX = x.slice(), bestE = e;

    const t0 = 8.0, t1 = 0.02;
    for (let s = 0; s < sweeps; s++) {
      const T = t0 * Math.pow(t1 / t0, s / sweeps);
      const i = (Math.random() * n) | 0;

      // Energy change from flipping one bit, computed locally.
      let delta = x[i] ? -Q[i][i] : Q[i][i];
      for (let k = 0; k < n; k++) {
        if (k === i || !x[k]) continue;
        const c = k < i ? Q[k][i] : Q[i][k];
        delta += x[i] ? -c : c;
      }

      if (delta <= 0 || Math.random() < Math.exp(-delta / T)) {
        x[i] ^= 1;
        e += delta;
        if (e < bestE) { bestE = e; bestX = x.slice(); }
      }
    }
    return { x: bestX, energy: bestE };
  }

  /** Every possible assignment. Only tractable because n is small - that is the point. */
  function bruteForce(Q, n) {
    if (n > 20) return null;                   // 2^20 is already a million
    const total = 1 << n;
    let bestE = Infinity, bestX = null;
    const x = new Array(n).fill(0);
    for (let m = 0; m < total; m++) {
      for (let i = 0; i < n; i++) x[i] = (m >> i) & 1;
      const e = energy(Q, x);
      if (e < bestE) { bestE = e; bestX = x.slice(); }
    }
    return { x: bestX, energy: bestE, states: total };
  }

  /** The obvious one-junction-at-a-time answer, for comparison. */
  function greedy() {
    const out = {};
    for (const j of SIM.junctions) {
      out[j.id] = served(j, 'NS') >= served(j, 'EW') ? 'NS' : 'EW';
    }
    return out;
  }

  function decode(vars, x) {
    const out = {};
    for (let i = 0; i < x.length; i++) {
      if (x[i]) out[vars[i].junction.id] = vars[i].phase;
    }
    // A well-formed solution assigns exactly one phase per junction; if the
    // penalty failed to bite, fall back to whatever is currently green.
    for (const j of SIM.junctions) if (!out[j.id]) out[j.id] = j.phase;
    return out;
  }

  /* ---------------------------------------------------------------- public */
  function solve(opts) {
    opts = opts || {};
    const model = build();
    const started = performance.now();
    const annealed = annealBest(model.Q, model.n, opts.sweeps || SWEEPS,
                                opts.restarts || 12);
    const annealMs = performance.now() - started;

    const bfStart = performance.now();
    const exact = bruteForce(model.Q, model.n);
    const bfMs = performance.now() - bfStart;

    const solution = decode(model.vars, annealed.x);
    const optimal = exact ? decode(model.vars, exact.x) : null;
    const matched = exact ? Math.abs(annealed.energy - exact.energy) < 1e-9 : null;

    return {
      variables: model.n,
      qubo: model.Q,
      labels: model.vars.map(v => v.junction.id + ':' + v.phase),
      solution: solution,
      energy: annealed.energy,
      annealMs: annealMs,
      exactEnergy: exact ? exact.energy : null,
      exactSolution: optimal,
      bruteForceStates: exact ? exact.states : null,
      bruteForceMs: bfMs,
      matchedOptimum: matched,
      greedy: greedy(),
      sweeps: opts.sweeps || SWEEPS,
      restarts: opts.restarts || 12
    };
  }

  /** Apply a solved assignment to the signals, through the usual single writer. */
  function apply(solution) {
    let changed = 0;
    for (const id in solution) {
      const j = SIM.junctionById(id);
      if (!j || j.phase === solution[id]) continue;
      if (SIM.applyAction(id, 'switch')) {
        j.lastAction = 'switch';
        j.lastSource = 'qubo';
        j.lastReason = 'QUBO solution asks for ' + solution[id] + ' across the network.';
        j.lastDecisionAt = SIM.time();
        changed++;
      }
    }
    return changed;
  }

  return {
    LAMBDA: LAMBDA,
    MU: MU,
    build: build,
    energy: energy,
    solve: solve,
    apply: apply,
    greedy: greedy
  };
})();
