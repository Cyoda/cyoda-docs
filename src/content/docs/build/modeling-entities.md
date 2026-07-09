---
title: "Modeling entities"
description: "Design patterns for entity schemas — boundaries, evolution, and validation."
sidebar:
  order: 10
---

Modeling well in Cyoda comes down to drawing the right boundaries between
entities, letting the schema grow with the data, and treating validation as
the job of the platform rather than the application layer. This page covers
the patterns worth knowing before you ship a first model.

## One entity per noun

The simplest rule: every domain noun that has an independent lifecycle is its
own entity. An `Order` has its own states, its own history, and its own audit
trail; so does a `Customer`. They relate via references, not by embedding.

A useful test: *does this thing change on its own clock?* If yes, it's an
entity. Line items on an order often do not — they live inside the order's
state transitions — so they stay embedded. Fulfilment events on an order do —
they have their own lifecycle — so they become their own entity, referenced
by the order.

## Two modes: discover or lock

Cyoda gives you two structural contracts for an entity model. The right
choice depends on how exposed the model is to outside producers.

**Discover (loose).** For a new model you do not write a schema file; you
post a representative sample (or a batch) and Cyoda records the fields,
their types, and the shape of nested arrays and objects. New samples
**widen** the schema — a field seen as `INTEGER` once and as
`[INTEGER, STRING]` later becomes polymorphic, and array widths grow to
fit observed data. Use discover mode when you are prototyping, exploring
a dataset, or have not yet fixed the contract with upstream producers.

**Lock (strict).** Once the shape is stable, lock the model. After
locking, any incoming entity that does not structurally match the current
schema is **rejected**. This is the right default for production systems
with external interface contracts — a trading system receiving FpML
confirmations, a payments pipeline consuming an agreed message format, a
regulated workflow whose processor logic is tailored to a specific
shape. In those contexts a silently widened schema is a latent bug at
best and a compliance failure at worst: if an upstream does an
uncoordinated FpML version upgrade, you want the new-shape messages
rejected at the door, not accepted and fed into processors that were
built against the old shape.

These two modes together cover the spectrum. Cyoda deliberately does
**not** layer a Confluent-style forward/backward/full compatibility
taxonomy on top: "compatible" is not a platform-generic concept when the
workflow (your app code) is part of the contract. Only the application
can judge whether adding an optional field, widening an integer to a
string, or dropping a field leaves its transition logic valid. The
platform contract is the simpler and stricter pair: loose discovery, or
lock-and-reject.

## Evolving a model

You evolve during discover mode by sending data: fields appear, types
widen, array widths grow. None of this is surprising until you lock.

After lock, evolution is **application-controlled**. The model has a
`modelVersion` that the application increments when it wants a new
structural contract. Each revision of each entity is tagged at write
time with the model version in force. Revisions are immutable: old
revisions are **not** re-validated, re-cast, or rewritten when a new
model version appears. A consumer reading an old revision reads it
under its original version; interpretation across versions is
application logic.

Concretely:

- **Add fields (pre-lock).** Send a sample that includes them; the
  schema widens automatically.
- **Widen types (pre-lock).** Cyoda handles polymorphic fields via a
  type hierarchy (e.g. `BYTE → SHORT → INT → LONG`;
  `FLOAT → DOUBLE → BIG_DECIMAL`). See the
  [Trino SQL reference](/reference/trino/) for the complete primitive
  lattice, including the temporal-type resolution hierarchy.
- **Lock.** Freeze evolution once the shape is stable. The default
  stance for anything with external producers.
- **Bump `modelVersion` and register the new schema (post-lock).** A
  locked model is a frozen contract; to accommodate a changed
  structure the application bumps `modelVersion` and **registers the
  new schema** for that version. Registration uses the same mechanism
  as initial discovery: submit a comprehensive set of representative
  samples that span the intended shape, and Cyoda infers the schema
  from them. The samples themselves are **not stored** — they exist
  only to define the shape of the new version. Once registered, lock
  the new version so it too is a hard contract. If data written under
  an older version needs to appear under the new shape, migrate it
  explicitly via app code; the platform takes no stance on whether
  the new shape is "compatible" with the old — that judgment belongs
  to the workflow that consumes the data.

Things to plan explicitly:

- **Renames.** Cyoda does not rename a field for you; if you rename
  in the source, you get a new field alongside the old one. Migrate
  existing data deliberately.
- **Deletes and deprecations.** Same story — Cyoda will not silently
  drop or re-interpret a field across a version boundary. The
  application owns the migration.
- **Narrowing types.** Once the schema has observed `STRING` in a
  field, you cannot narrow it to `INTEGER` within the same version.
  To narrow, introduce a new `modelVersion` with the stricter type
  and migrate the data.

## Who validates what

Cyoda validates **structure** and **types** against the model: required
shapes, element types, array constraints, polymorphic compatibility. That is
free; you do not write those validators.

Your application is responsible for **semantic** validation that lives inside
transitions: "the order total must equal the sum of line items", "the
payment currency must match the customer's currency". Those belong in
workflow criteria and processors where they can fail a transition and leave
the old revision intact.

## Uniqueness constraints

Beyond structure and types, a model can declare **composite unique keys** — multi-field uniqueness the engine enforces on create and update. Register them on an **UNLOCKED** model:

```
PUT /model/{entityName}/{modelVersion}/unique-keys
```

Each key is an ordered set of scalar field paths, and uniqueness is scoped to `(tenant, model, version)` over live (non-deleted) entities. The null rule is all-or-nothing: if every field in a key is null or absent the entity is exempt; a partial key is rejected with `422 INVALID_UNIQUE_KEY`; a fully-present key is enforced. String comparison is byte-exact, and soft-deleting an entity frees its value-set for reuse.

Composite unique keys are supported by the memory, SQLite, and PostgreSQL backends; the commercial backend returns `422 COMPOSITE_KEY_UNSUPPORTED` until its own support lands. Relevant error codes: `UNIQUE_VIOLATION` (409), `INVALID_UNIQUE_KEY` (422), `COMPOSITE_KEY_UNSUPPORTED` (422), and `INVALID_UNIQUE_KEY_DEFINITION` (422).

## Anti-patterns

- **The god-entity.** One model that tries to represent everything. Split it
  along lifecycle boundaries; lifecycles that evolve independently want
  separate entities.
- **Premature generalisation.** A model that tries to anticipate every future
  field. Let the schema discover itself and lock when you are ready.
- **Shadow workflows.** Implementing state transitions as boolean flags on
  the entity. Put states in a workflow; that's what workflows are for.

## Where to go next

- [Entities and lifecycle](/concepts/entities-and-lifecycle/) — the
  conceptual model behind an entity.
- [Entity model export](/reference/entity-model-export/) — the wire
  format of a SIMPLE_VIEW export, node descriptors, type descriptors,
  and the JSON Schema for the response.
- [JSON schema reference](/reference/schemas/) — the REST-API message
  schemas generated from cyoda-go.
- [Workflows and events](/concepts/workflows-and-events/) — how state
  and transitions are configured.
