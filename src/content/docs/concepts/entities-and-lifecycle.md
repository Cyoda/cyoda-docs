---
title: "Entities and lifecycle"
description: "Entities are durable state machines — schemas, states, transitions, and history."
sidebar:
  order: 10
---

In Cyoda, an **entity** is a durable state machine. It is a JSON document that belongs
to a typed model, sits in a named lifecycle state, and carries a complete audit trail
of every transition it has ever undergone. The entity is not a row to be updated in
place; the entity *is* the state machine.

## The entity IS the state machine

A Cyoda workflow is close in spirit to a BPM process, but the two are not the same.
A BPM flow tends to be linear — it has a start, a sequence of activities, and an end.
A Cyoda entity workflow is a state machine in the strict sense: there is no
requirement for a terminating state, transitions need not follow a linear path, and
an entity can move between states in any topology the model calls for, including
cycles and branches.

That distinction matters in day-to-day modeling. You do not design "the process" and
then attach entities to it; you design the states and transitions of a piece of
business reality, and the entity lives inside that machine for as long as the
business cares about it.

![Example entity state machine: four states connected by auto and manual
transitions. One transition runs a `validate` processor; another runs `notify`;
a third is gated by an `age > 30d` criterion. A loopback from `archived` back to
`active` shows that workflows are not linear and need not
terminate.](/img/entity-state-machine.svg)

The picture above sketches the building blocks:

- **States** (teal rectangles) — the named stages of the entity's life.
- **Transitions** — the atomic units of change. Auto transitions (solid, teal)
  fire as soon as their source state is entered; manual transitions (dashed,
  orange) fire only when an actor invokes them.
- **Processors** (green pills on a transition) — code that runs as part of the
  transition, under the platform's event contract.
- **Criteria** (purple diamonds on a transition) — predicates that gate whether
  the transition is allowed to fire.

Every transition produces a new, durable revision of the entity. Nothing is
overwritten.

## Schema

Every entity belongs to a named **model** identified by `modelName` and
`modelVersion`. Cyoda auto-discovers the model schema from ingested samples
rather than requiring it up front: as records flow in, Cyoda observes the
fields that appear, the types they take, and the shape of nested arrays
and objects. That observed shape is the schema.

A model has two structural modes. While **unlocked**, it evolves by merging
— new fields appear, types widen, a field comes to declare more than one
shape. An array's length is never part of that schema. When **locked**, the
structural contract is frozen and any incoming entity that does not match
is rejected. Lock is the right default for production systems with external
producers, where silently accepting a widened shape would be a compliance
or correctness failure. `modelVersion` is application-controlled; to change
the contract after lock, the application bumps the version and **registers
the new schema** for it — by submitting a comprehensive set of
representative samples (the same mechanism as initial discovery; the
samples themselves are not stored). Old revisions are never re-validated
or re-cast; each remains valid under the model version active at write
time. See [Modeling entities](/build/modeling-entities/) for when to choose
each mode and how to plan evolutions.

The wire format and field conventions for exported models (type
descriptors, array representations, structural markers) are in the
[entity-model export reference](/reference/entity-model-export/).

## History and temporal queries

Because transitions produce revisions rather than overwriting state, the full history
of an entity is always retrievable. You can ask:

- "What did this entity look like at timestamp T?" — point-in-time reconstruction.
- "What transitions has this entity been through, and when?" — transition log.
- "Which version of the model was this revision validated against?" — schema lineage.

This is not an add-on audit layer bolted onto a mutable store; it is the storage model.
See the [API reference](/reference/api/) for the temporal-query grammar.
