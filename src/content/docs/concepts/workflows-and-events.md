---
title: "Workflows and events"
description: "State machines as a first-class concept — triggers, processors, and audit trails."
sidebar:
  order: 20
---

A **workflow** is the state machine an entity lives inside. It declares the
states an entity can be in, the transitions between them, the criteria that
gate whether a transition is allowed, and the processors that run along the
way. This page explains the concept; the
[Build guide for workflows and processors](/build/workflows-and-processors/)
covers how to configure one.

## State machines define allowed change

Every entity type has a workflow, and every write of an entity runs it: the
write's transitions, with their processors, run in the write's transaction, and
the write commits a new, durable revision of the entity. The write either
succeeds or has no effect; the one exception is a processor in
`COMMIT_BEFORE_DISPATCH` mode, which commits the entity's pre-callout state
before it calls out.

Workflows are general state machines, not pipelines. Transitions can be
automatic (fire as soon as their source state is entered and any criteria are
satisfied), manual (fire only when invoked by an actor) or scheduled (fire on a
timer). A workflow can contain cycles, branches, and multiple
terminal-looking states that are actually re-entered later — it does not need
to terminate at all.

## Triggers

Transitions fire in one of three ways:

- **Manual** — an actor (a user acting through your application, a service, a
  batch job) names the transition on a save through the API.
- **Automatic** — after every write, the first automated transition of the
  current state whose criterion matches fires within the same transaction,
  recursing until no further automated transition applies.
- **Scheduled** — a transition with a `schedule` fires on a timer: a fixed
  delay after the entity enters the state, or a time a function computes per
  entity. A background scheduler runs it, independently of any API call. See
  [Scheduled transitions](/build/scheduled-transitions/).

## Processors

A **processor** is code that runs as part of a transition. It can read the
entity, compute new data, call an external service, create or update other
entities, or fail the transition.

Every processor is **externalized**: your code, running in a compute node
that connects to Cyoda over gRPC. Cyoda sends the processor request to a
compute node that matches its tags, with the entity and the identity the
transition runs for, and records each processor's outcome against the
transition. For how to implement one, see
[Build → client compute nodes](/build/client-compute-nodes/).

Processors run in one of four modes. None of them runs in the background:
every mode completes before the operation answers.

- **SYNC** (also an empty mode) — inline, in the transition's transaction; a
  failure fails the operation.
- **ASYNC_SAME_TX** — behaves exactly as `SYNC`.
- **ASYNC_NEW_TX** — inline, inside a savepoint of the same transaction; a
  failure undoes the savepoint, is logged, and the transition still succeeds.
- **COMMIT_BEFORE_DISPATCH** — commits the entity's pre-callout state, calls
  the processor without holding a storage connection, and applies its result
  in a second transaction. The mode for slow external work; the pre-callout
  state is visible to other readers.

Choose the mode based on how atomically the side effect must compose with the
state change.

Two rules shape how processors are written. First, **a processor changes its
own entity only by returning data**: no processor, function criterion or
schedule function writes or deletes the entity it runs for through the API.
Second, **a repeat is the author's call**. When a compute node that was given
the work goes quiet, its work — inside Cyoda or in other systems — may already
have happened, so Cyoda hands the callout to another node only for a processor
whose author declared it `idempotent`. See
[repeating a processor](/build/workflows-and-processors/#repeating-a-processor).

## Audit trail is the storage model

Because every write commits a revision, the history of an entity is not a
separate log — it is a view of the storage. You can read the transitions an
entity has been through, the workflow selected, the criteria that refused an
automated transition and why, and the processors that ran and whether each
succeeded. The entity's revisions hold its data as each transaction committed
it. Point-in-time reads use the same store.

## Why this matters

State machines plus durable transitions plus a queryable audit trail are the
native ingredients for **regulated**, **auditable**, and **replayable**
systems. Replaying a workflow from history does not require an event-sourcing
framework on the side — it is the default behavior of the store.

## Where to go next

- [Entities and lifecycle](/concepts/entities-and-lifecycle/) — the entity
  side of the machine, with a state-machine diagram.
- [Build → workflows and processors](/build/workflows-and-processors/) — how
  to declare a workflow in practice.
- [Build → scheduled transitions](/build/scheduled-transitions/) — timers,
  retries and the scheduler.
- [Build → client compute nodes](/build/client-compute-nodes/) — how to
  implement a processor over gRPC.
