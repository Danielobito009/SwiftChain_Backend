# SwiftChain Backend — Load Testing Suite

Load and stress testing for the SwiftChain backend's REST API (`/api/v1/...`) and
Socket.IO real-time gateway, built to validate the traffic levels expected in
Phase 2.

## Tooling

| Surface                     | Tool                                        | Why                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REST API (`/api/v1/...`)    | [k6](https://k6.io)                         | Purpose-built for HTTP load testing with first-class thresholds/stages.                                                                                              |
| WebSocket (Socket.IO)       | Custom Node/TypeScript harness (`socket-load/`) using the real `socket.io-client` | Neither k6 nor Artillery ship a maintained Socket.IO engine (Socket.IO runs its own handshake/protocol on top of WebSocket, which generic `ws` clients can't complete). Using the actual `socket.io-client` library exercises the real gateway exactly as the mobile driver app would, rather than approximating the wire protocol. |

## Layout

```
load-tests/
├── k6/
│   ├── lib/                  # config.js, authClient.js — shared "service" helpers for scenarios
│   └── scenarios/            # auth-load.js, deliveries-load.js — the k6 test entry points
├── socket-load/src/
│   ├── config/env.ts         # env parsing (mirrors src/config/env.ts)
│   ├── controllers/          # orchestrates a full WebSocket load run
│   ├── services/             # authTokenService (real login), socketConnectionService (per-driver socket lifecycle)
│   ├── models/types.ts       # payload/result shapes shared across the harness
│   └── index.ts              # CLI entry point
├── scripts/seedLoadTestData.ts  # seeds real Users + Deliveries via the app's own Mongoose models
├── .env.example
└── package.json
```

Both the k6 scenarios and the socket harness follow the same
controller → service → model layering used in the main backend: scenario /
controller files describe *what* traffic to generate, service files own the
actual HTTP/Socket.IO calls, and model files describe the data shapes moving
between them.

## Data source

No inline mocks or hardcoded responses are used. `scripts/seedLoadTestData.ts`
inserts real `User` and `Delivery` documents into MongoDB via the
application's own models, then every scenario drives traffic through the
real HTTP/WebSocket API against that data (login, list/read/update
deliveries, live location broadcasts).

## One-time fix required to run the WebSocket suite

While wiring this up we found that `src/sockets/connectionHandler.ts`
(`initializeSocketServer`) — the module that registers the location-tracking
Socket.IO gateway — was never attached to the HTTP server in
[`src/server.ts`](../src/server.ts); the app only ever called `app.listen(...)`
directly, so the WebSocket gateway was dead code. This PR wires it up
(`http.createServer(app)` + `initializeSocketServer(httpServer)`, with a
graceful shutdown call to `shutdownSocketServer`), since otherwise there is
no running WebSocket endpoint to load test at all. No behavior of the
gateway itself was changed.

## Prerequisites

- A running instance of the backend (`npm run dev` from the repo root) connected to a MongoDB instance.
- [k6](https://k6.io/docs/get-started/installation/) installed locally (or run via Docker: `docker run --rm -i --network=host -v "$PWD/k6:/scripts" grafana/k6 run /scripts/scenarios/auth-load.js`).
- Node.js (for the seed script and the WebSocket harness).

## Setup

```bash
cd load-tests
npm install
cp .env.example .env   # point LOAD_TEST_BASE_URL / LOAD_TEST_MONGODB_URI at your running instance
npm run seed            # creates real driver/customer accounts + deliveries
```

## Running the tests

```bash
# REST API
npm run test:api:auth
npm run test:api:deliveries

# WebSocket (Socket.IO)
npm run test:ws

# Everything, in order
npm run test:all
```

`npm run test:api:*` shells out to the `k6` binary — it must be on your
`PATH` (or invoked via Docker as shown above).

## Configuration

All target/load parameters are environment variables (see `.env.example`) —
nothing is hardcoded:

| Variable                        | Purpose                                          |
| -------------------------------- | ------------------------------------------------- |
| `LOAD_TEST_BASE_URL`            | Backend base URL                                 |
| `LOAD_TEST_MONGODB_URI`         | MongoDB URI used only by the seed script         |
| `LOAD_TEST_DRIVER_COUNT` / `LOAD_TEST_CUSTOMER_COUNT` / `LOAD_TEST_DELIVERY_COUNT` | Fixture sizes |
| `K6_VUS` / `K6_DURATION`        | k6 virtual users / sustained load duration        |
| `SOCKET_LOAD_CONNECTIONS`       | Number of concurrent simulated driver connections |
| `SOCKET_LOAD_DURATION_SEC`      | How long each connection stays open               |
| `SOCKET_LOAD_EMIT_INTERVAL_MS`  | Interval between `driver_location_update` emits   |
| `SOCKET_LOAD_RAMP_UP_MS`        | Time to stagger all connections in                |

## Thresholds

The k6 scenarios fail the run (non-zero exit code) if:

- more than 1% of HTTP requests error, or
- p95 latency exceeds 500ms / p99 exceeds 1000ms.

The WebSocket harness exits non-zero if fewer than 95% of the requested
connections completed a successful handshake.

## Scope note

`src/routes/deliveryRoutes.ts` (the `/eta` endpoint) and
`src/routes/stellar.routes.ts` are not mounted in `src/routes/index.ts` in
the current codebase, so they return 404 and are intentionally excluded from
these scenarios. `src/routes/adminRoutes.ts` is also excluded because its
`authenticate` middleware depends on a JWT payload shape (`decoded.id`) that
doesn't match what `authService` currently signs (`userId`), causing 401s
unrelated to load — both are pre-existing issues outside the scope of this
load-testing task.

## Proof of work

See the PR description for a summary of a completed run (k6 threshold
results and the WebSocket harness summary).
