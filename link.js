/* =============================================================================
 * link.js — the wire between the street and the control room.
 *
 * index.html is the street: the twin of what is happening out there. It
 * publishes what it sees. console.html is the control room: it subscribes,
 * decides, and sends actions back.
 *
 * Two browser windows, no server, nothing to install. BroadcastChannel carries
 * the traffic when it is available; localStorage carries it when it is not, so
 * the pair still works from a file:// URL or in a browser with the channel
 * disabled. If neither works, the console falls back to running its own copy of
 * the twin inside itself, so a demo can never be dead in the water.
 *
 * MESSAGES
 *   street -> console   {type:'state',   payload:{...}}   about twice a second
 *   street -> console   {type:'event',   payload:{...}}   incidents, requests
 *   console -> street   {type:'command', payload:{...}}   apply, test, inject
 *
 * NO drawing code and no simulation in this file. It is a postbox.
 * ========================================================================== */

const LINK = (function () {
  'use strict';

  const CHANNEL = 'digital-twin-genesis';
  const STORAGE_KEY = 'dtg-link-message';

  let channel = null;
  let usingStorage = false;
  const handlers = [];

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = function (e) { deliver(e.data); };
    }
  } catch (e) {
    channel = null;
  }

  if (!channel && typeof window !== 'undefined') {
    // Fallback: localStorage fires a 'storage' event in other tabs of the same
    // origin. Slower and lossier than a channel, but it works from file://.
    usingStorage = true;
    window.addEventListener('storage', function (e) {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try { deliver(JSON.parse(e.newValue).message); } catch (err) { /* ignore */ }
    });
  }

  function deliver(msg) {
    if (!msg || !msg.type) return;
    for (const fn of handlers) {
      try { fn(msg); } catch (e) { /* one bad listener must not stop the rest */ }
    }
  }

  function send(type, payload) {
    const msg = { type: type, payload: payload, at: Date.now() };
    if (channel) {
      channel.postMessage(msg);
    } else if (usingStorage) {
      try {
        // The wrapper makes the value unique so repeated identical states still
        // fire a storage event.
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ n: Math.random(), message: msg }));
      } catch (e) { /* private mode, quota, etc. */ }
    }
  }

  return {
    /** How the two windows are talking, for display. */
    transport: function () {
      return channel ? 'BroadcastChannel' : (usingStorage ? 'localStorage' : 'none');
    },
    available: function () { return !!(channel || usingStorage); },
    on: function (fn) { handlers.push(fn); },
    send: send
  };
})();
