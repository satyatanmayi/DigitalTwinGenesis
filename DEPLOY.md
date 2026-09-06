# Hosting this

The whole thing is static — HTML, CSS and vanilla JavaScript, with p5.js and
three.js from a CDN. There is no server, no build step and no database, so any
static host will serve it.

## It is live

| | |
|---|---|
| The street (the twin) | <https://satyatanmayi.github.io/DigitalTwinGenesis/> |
| The control room | <https://satyatanmayi.github.io/DigitalTwinGenesis/console.html> |

Served by GitHub Pages from `main` at the repository root. To rebuild it,
push to `main`; a deploy takes about a minute.

If it ever needs setting up again: **Settings** → **Pages** → source
`Deploy from a branch`, branch `main`, folder `/ (root)`.

Verified on the deployed copy: p5 canvas created, weights loaded, clock
advancing, and the control room reporting **live via BroadcastChannel** with
all four junctions mirrored.

Old instructions, kept for reference:

| | |
|---|---|
| The street (the twin) | `https://satyatanmayi.github.io/DigitalTwinGenesis/` |
| The control room | `https://satyatanmayi.github.io/DigitalTwinGenesis/console.html` |

Open the street first and click **CONTROL ROOM →**, so the second window is a
child of the first.

## How the two interfaces are linked

They are two separate pages with **no server between them**. The link is
`link.js`, a postbox:

```
street (index.html)  --  state, twice a second  -->  control room (console.html)
street (index.html)  <--  commands              --   control room (console.html)
```

- **Transport:** `BroadcastChannel`, a browser API for messaging between windows
  of the **same origin**. `localStorage` events are the fallback.
- **What crosses:** the street publishes a small snapshot — junction phases,
  queues, requests, conditions, the standing priority plan. The control room
  sends back commands: set a timing, change controller, grant a request, stop
  the plan.
- **Why it is built this way:** the control room contains **no traffic physics
  at all**. Everything it knows arrives as a message. Replace the twin with a
  real junction feed and the control room does not change — which is the whole
  argument for it being a separate screen.

**Both pages must be served from the same origin.** Two `file://` pages each get
their own opaque origin and cannot talk — see below.

## Why you cannot just double-click the HTML files

`BroadcastChannel` is scoped to an origin. Every `file://` document is given its
own opaque origin, so the constructor succeeds and no message ever crosses. The
control room detects this and says **"not connected (opened from a file)"** with
the fix, rather than waiting silently.

Locally, run `run.bat` and use <http://localhost:8000>.

## The API key

`config.js` holds the Gemini key and is **git-ignored**, so it is not in this
repo and will not exist on the hosted copy. That is intentional — a key in
client-side JavaScript is a key you have given away.

Without it the language-model layer falls back to its local rule and labels
those decisions on screen. Everything else — the twin, the timing tests, the
scenarios, the trained model, the priority engine, the QUBO solver — is
unaffected, because none of it needs the network.

To run it with a key locally: copy `config.example.js` to `config.js` and paste
a key in.
