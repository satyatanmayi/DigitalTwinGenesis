/* =============================================================================
 * sensorFeed.js — Digital twin data layer (MOCK).
 *
 * This module is the seam between the simulation and the outside world. It
 * publishes a sensor snapshot per junction every SAMPLE_INTERVAL seconds, in
 * exactly the shape a real roadside sensor gateway would deliver:
 *
 *   { junctionId, ts, queueLengths: {N,S,E,W}, avgSpeed, incidentFlag }
 *
 * SWAPPING IN REAL SENSORS
 * ------------------------
 * Nothing downstream of this file knows where the numbers come from. To go
 * live, replace the body of sample() with a fetch() against the real sensor
 * API (or a WebSocket / MQTT subscription) that fills the same fields, and
 * delete the simulation reads. sim.js, agent.js and render.js do not change.
 *
 * The extra fields (longestWait, phase, greenElapsed) are marked as
 * simulation-only context for the AI prompt; a real deployment would take
 * them from the signal controller's own status feed, not from the sensors.
 *
 * NO drawing code, NO p5.js, NO DOM access in this file.
 * ========================================================================== */

const SENSOR_FEED = (function () {
  'use strict';

  const SAMPLE_INTERVAL = 1.0;      // seconds between published snapshots
  const INCIDENT_DEFAULT_SEC = 25;  // how long an injected incident stays raised

  const snapshots = {};             // junctionId -> latest snapshot
  const incidentUntil = {};         // junctionId -> sim time the incident clears
  const subscribers = [];
  let acc = 0;

  /* Reads the current simulated world and emits a sensor-shaped snapshot.
   * REPLACE THIS FUNCTION to talk to a real sensor API. */
  function sample(now) {
    for (const j of SIM.junctions) {
      const speeds = [];
      for (const v of SIM.vehicles) {
        const near = Math.abs(v.x - j.x) < SIM.GEOM.queueZone && Math.abs(v.y - j.y) < SIM.GEOM.queueZone;
        if (near) speeds.push(v.speed * SIM.PX_TO_KMH);
      }
      const avgSpeed = speeds.length
        ? speeds.reduce(function (a, b) { return a + b; }, 0) / speeds.length
        : 0;

      snapshots[j.id] = {
        junctionId: j.id,
        ts: Math.round(now * 1000) / 1000,
        queueLengths: { N: j.queues.N, S: j.queues.S, E: j.queues.E, W: j.queues.W },
        avgSpeed: Math.round(avgSpeed * 10) / 10,          // km/h
        incidentFlag: (incidentUntil[j.id] || 0) > now,

        // --- simulation-only context, see header note ---
        longestWaitSec: {
          N: Math.round(j.longestWait.N),
          S: Math.round(j.longestWait.S),
          E: Math.round(j.longestWait.E),
          W: Math.round(j.longestWait.W)
        },
        phase: j.phase,
        phaseState: j.state,
        greenElapsedSec: Math.round(j.greenElapsed * 10) / 10
      };
    }
    for (const fn of subscribers) fn(snapshots);
  }

  SIM.onTick(function (dt, now) {
    acc += dt;
    if (acc >= SAMPLE_INTERVAL) {
      acc = 0;
      sample(now);
    }
  });

  return {
    SAMPLE_INTERVAL: SAMPLE_INTERVAL,

    /** Latest snapshot for one junction, or null before the first sample. */
    get: function (junctionId) { return snapshots[junctionId] || null; },

    /** All latest snapshots, keyed by junction id. */
    all: function () { return snapshots; },

    /** Register a callback fired on every published sample. */
    subscribe: function (fn) { subscribers.push(fn); },

    /** Demo hook: raise incidentFlag on a junction for a while. */
    injectIncident: function (junctionId, seconds) {
      incidentUntil[junctionId] = SIM.time() + (seconds || INCIDENT_DEFAULT_SEC);
    },

    incidentActive: function (junctionId) {
      return (incidentUntil[junctionId] || 0) > SIM.time();
    }
  };
})();
