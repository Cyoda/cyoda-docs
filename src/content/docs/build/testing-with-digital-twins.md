---
title: "Testing with digital twins"
description: "In-memory mode as a test harness; running simulations at volumes exceeding production; controlling the platform clock in tests."
sidebar:
  order: 50
---

In Cyoda, a "digital twin" means the same application code — workflows,
criteria, processors — runs identically on every storage tier. Non-functional
properties (persistence, latency, concurrency model) differ; business logic
does not.

cyoda-go's **in-memory mode** is the built-in test harness. It runs the entire
platform — entity store, workflow engine, API surfaces — in a single process
with no external dependencies and no disk writes. It is the fastest way to
exercise workflow behaviour in CI, and the cheapest way to run large
scenario simulations against your application logic.

## In-memory mode as a test harness

Start cyoda-go with the in-memory profile (or `go run ./cmd/cyoda` against the
default in-memory config). Concretely: set `CYODA_STORAGE_BACKEND=memory`, or
leave it unconfigured — memory is the application default until `cyoda init`
is run. Point your tests at it; tear it down between cases; no database to
seed, no files to clean up.

Properties that matter for testing:

- **Repeatable.** The same requests in the same order take entities through
  the same states with the same data. Ids, timestamps and the interleaving of
  concurrent requests still vary from run to run; pin the clock (see
  [Controlling time](#controlling-time)) when a test asserts on business
  times, and do not assert on generated ids.
- **Fast.** Sub-millisecond latencies mean you can run thousands of transitions
  per test.
- **Isolated.** Nothing survives the process; tests cannot leak state into
  each other.
- **API-identical.** Your application code calls the same REST and gRPC
  endpoints it will call in production.

This makes in-memory mode suitable for unit-level tests of your processors,
integration tests of your whole workflow, and smoke tests in CI.

### Test settings worth knowing

- **Mock IAM.** `CYODA_IAM_MODE=mock` accepts every request without a token, as
  one principal of kind `CYODA_IAM_MOCK_KIND`. Keep the default, `service`:
  a compute node can then open its stream without a token. With `user` or
  `system` the stream is refused with `PermissionDenied`.
- **Fail fast on a missing compute node.** A callout whose compute node is not
  connected waits `CYODA_DISPATCH_WAIT_TIMEOUT` (default `5s`) for one to
  appear before it fails with `503 NO_COMPUTE_MEMBER_FOR_TAG`. Set
  `CYODA_DISPATCH_WAIT_TIMEOUT=0` in a suite that tests that failure, so it
  fails at once.
- **Containers.** Every listener binds `127.0.0.1` by default. When cyoda runs
  in a container, set `CYODA_HTTP_BIND_ADDRESS`, `CYODA_GRPC_BIND_ADDRESS` and
  `CYODA_ADMIN_BIND_ADDRESS` to `0.0.0.0` so that the port mapping, and
  compute nodes in other containers, can reach it.

## Digital-twin simulations

Beyond unit tests, in-memory mode is a **digital-twin runtime**: a
behavioural clone of production that you can drive at volumes and rates your
real system could never sustain. Because there is no durable backend, no
rate-limited external API, and no shared-state concern, you can:

- Replay a year of historical transactions in minutes.
- Fan out thousands of concurrent scenario runs across CPUs.
- Stress the workflow with injected event streams that exceed production
  peak by multiples.

The application logic — workflows, criteria, processors — is the same
application that runs against SQLite or PostgreSQL. The **only** things that
differ between in-memory and durable tiers are non-functional: persistence,
latency profile, and scale ceiling. That's the property that makes the
in-memory run a useful twin of the durable one.

## Controlling time

Scheduled transitions, retention and point-in-time reads all depend on the
time. A test that waits a day for a transition to fire is not practical, so
cyoda has a **controllable platform clock**: a test can set it to a start in
the past and move it forward, and scheduled transitions fire on the way.

The platform clock is the time cyoda records as **business time**: entity
creation and update dates, audit event times, consistency times, scheduled
due times, the "now" of a point-in-time read, and the `time` attribute of the
callouts sent to compute nodes. Token and key validity, timeouts, leases,
heartbeats and keep-alives stay on real time.

**Turn it on** with `CYODA_CLOCK_CONTROL_ENABLED=true`. It is a test feature,
not for production: the node logs a WARN at startup, and one setting applies
to every tenant of the instance. Without it, `POST /api/platform/clock`
answers `403 CLOCK_CONTROL_DISABLED`, and `GET /api/platform/clock` answers
real time at rate `1` with `controllable: false`.

**Who may change it.** `POST /api/platform/clock` needs a platform operator:
in JWT mode a `cyoda token --tenant PLATFORM` (which carries `ROLE_ADMIN`); in
mock IAM mode the mock principal, an admin, passes. `GET` answers any
authenticated caller.

### Set a start, then move forward

Set the start **first, on a fresh store**, before you import models or write
anything:

```bash
curl -s -X POST http://localhost:8080/api/platform/clock \
  -H 'Content-Type: application/json' \
  -d '{"time": "2024-01-02T09:00:00Z"}'
```

```json
{"now":"2024-01-02T09:00:00.000003Z","rate":1,"controllable":true,"nodes":["local"]}
```

`nodes` lists the nodes that hold the new setting (`["local"]` without
clustering). A start earlier than a time the store has already recorded is
refused, naming the latest recorded time:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "CLOCK_BEFORE_RECORDED_TIME: the store has recorded a time later than the requested time; latest recorded time 2024-01-02T09:00:00.000002Z",
  "instance": "/platform/clock",
  "properties": {
    "errorCode": "CLOCK_BEFORE_RECORDED_TIME",
    "latestRecordedTime": "2024-01-02T09:00:00.000002Z"
  }
}
```

Then import your models and workflows and create the entities under test. To
move the clock forward, send `advanceByMs`, or a `time` later than now:

```bash
curl -s -X POST http://localhost:8080/api/platform/clock \
  -H 'Content-Type: application/json' \
  -d '{"advanceByMs": 90000000}'
```

```json
{"now":"2024-01-03T10:00:04.202188Z","rate":1,"controllable":true,"nodes":["local"]}
```

A move does not jump. It steps through the scheduled transitions that come due
on the way, and each fires at its own due time; the answer comes once the move
is complete. A request carries `time` or `advanceByMs`, not both
(`400 BAD_REQUEST`). An optional `rate`, from 0.1 to 100, makes the clock run
faster or slower than real time; keep it at `1` unless you need otherwise.

### Assert on the outcome

A [scheduled transition](/build/scheduled-transitions/) arms a task when the
entity enters the transition's source state. Before the move,
`GET /api/scheduled-tasks?entityId=<id>` shows it `WAITING` with its due time
on the platform clock:

```json
{
  "items": [
    {
      "taskId": "141762c051926d10df0723997979a8bd",
      "entityId": "d82b5c32-e6c0-11f1-a29a-ae468cd3ed16",
      "modelName": "order",
      "modelVersion": 1,
      "sourceState": "OPEN",
      "transition": "AutoClose",
      "status": "WAITING",
      "scheduledTime": "2024-01-03T09:00:00.047Z",
      "armedTime": "2024-01-02T09:00:00.047Z",
      "nextAttemptTime": "2024-01-03T09:00:00.047Z",
      "attempts": 0,
      "lostOwners": 0,
      "armedBy": { "id": "mock-user-001", "kind": "service" }
    }
  ],
  "pagination": { "hasNext": false }
}
```

After the move, the task is gone (a task that fired is removed), the entity is
in the target state, and its audit trail
(`GET /api/audit/entity/<id>`) holds a `SCHEDULED_TRANSITION_FIRE` event and a
`TRANSITION_MAKE` event stamped at the due time, give or take one scheduler
scan interval (`2024-01-03T09:00:00.920707Z` in this run).

### Rules for a reliable run

- **Keep the system idle while the clock changes**, and send one change at a
  time: the next only after the previous call has returned. Nothing enforces
  this.
- **A move needs a running scheduler and the compute nodes its scheduled
  tasks call.** Without them it waits.
- **In a cluster**, every node needs the same `CYODA_CLOCK_CONTROL_ENABLED`
  and synchronised real clocks, and no node may start, stop or join during a
  change. A change answers only once every node holds it; otherwise
  `503 CLOCK_NOT_CONFIRMED`, naming the nodes. Nothing is rolled back: restart
  the cluster with a fresh store.
- **A full restart returns the clock to real time**, and that startup fails if
  the store holds times more than 1 s later than real time. The memory backend
  starts fresh every time; with SQLite or PostgreSQL, start from an empty
  database.
- Retention follows platform time: after a move, async search jobs past their
  expiry are refused at once.

The full contract is in [`cyoda help clock`](/help/clock/) and
[`cyoda help config clock`](/help/config/clock/).

## What stays the same, what changes

Same:
- API contracts: REST and gRPC. (SQL analytics through Trino is not yet
  implemented in cyoda-go; see
  [cyoda-go#382](https://github.com/Cyoda/cyoda-go/issues/382).)
- Workflow semantics: states, transitions, criteria, processors.
- Event ordering within a transition.
- Audit-trail shape.

Different:
- Durability (none in-memory).
- Concurrency model (no multi-node contention).
- Performance envelope (faster, lower variance).

If your test depends on *durable* behaviour — restart recovery, cross-node
consensus, cross-process replay — graduate it to a SQLite or PostgreSQL run
for that suite. For everything else, in-memory is the default.

## Examples

The [cyoda-go examples directory](https://github.com/Cyoda/cyoda-go/tree/main/examples)
currently holds one example, `compose-with-observability`: a Docker Compose
development stack with Grafana, Prometheus and Tempo. No scenario-simulation runner ships with
cyoda-go yet. When a cyoda-go release ships a new example, this page links it.

## Where to go next

- [Digital twins and the growth path](/concepts/digital-twins-and-growth-path/)
  — the concept behind same-app-different-tier.
- [Scheduled transitions](/build/scheduled-transitions/) — the transitions a
  clock move fires.
- [Run → overview](/run/) — choosing a tier for the other side of the twin.
