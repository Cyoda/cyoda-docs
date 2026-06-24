---
title: "Testing with digital twins"
description: "In-memory mode as a test harness; running simulations at volumes exceeding production."
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

- **Deterministic.** Same inputs, same state, same result.
- **Fast.** Sub-millisecond latencies mean you can run thousands of transitions
  per test.
- **Isolated.** Nothing survives the process; tests cannot leak state into
  each other.
- **API-identical.** Your application code calls the same REST and gRPC
  endpoints it will call in production.

This makes in-memory mode suitable for unit-level tests of your processors,
integration tests of your whole workflow, and smoke tests in CI.

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
application that runs against PostgreSQL or Cyoda Cloud. The **only**
things that differ between in-memory and durable tiers are non-functional:
persistence, latency profile, and scale ceiling. That's the property that
makes the in-memory run a useful twin of the durable one.

## What stays the same, what changes

Same:
- API contracts (REST, gRPC today; Trino upcoming — see the [Trino reference](/reference/trino/)).
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

Worked examples live in
[cyoda-go/examples](https://github.com/Cyoda/cyoda-go/tree/main/examples),
including scenario-simulation runners you can adapt as a template. When a
cyoda-go release ships a new example, this page links it.

## Where to go next

- [Digital twins and the growth path](/concepts/digital-twins-and-growth-path/)
  — the concept behind same-app-different-tier.
- [Run → overview](/run/) — choosing a tier for the other side of the twin.
