/* =============================================================================
 * coordinator.js — Corridor-level coordinator. STUB. NOT IMPLEMENTED.
 *
 * TODO: Sit a Claude API coordinator above the four per-junction Gemini agents.
 *
 * Intended shape:
 *   - Input:  every junction snapshot from SENSOR_FEED.all(), plus the recent
 *             decision log from AGENT.decisions, on a slower cadence than the
 *             per-junction loop (roughly every 20-30 simulated seconds).
 *   - Output: corridor policy hints, not direct signal commands, for example
 *             { J1: { bias: "EW", offsetSec: 4 }, J2: { bias: "EW", offsetSec: 0 } }
 *             so that a platoon leaving J1 eastbound meets a green at J2.
 *   - Applied by: agent.js appending the hint for a junction into that
 *             junction's prompt, so the local agent stays the only writer to
 *             SIM.applyAction() and the control path keeps a single owner.
 *
 * Deliberately empty tonight. See README.md for the design note.
 * ========================================================================== */

const COORDINATOR = (function () {
  'use strict';

  return {
    enabled: false,

    /* TODO: call the Claude API with the corridor state and return per-junction
     * policy hints. Must remain free of drawing code, exactly like the other
     * simulation-side modules. */
    plan: function (/* snapshots, decisionLog */) {
      return null;
    }
  };
})();
