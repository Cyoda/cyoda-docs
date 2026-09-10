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

**Discover (loose).** For a new model you do not write a schema file. You post
a representative sample, and Cyoda records the fields, their types, and the
shape of nested arrays and objects.

The body is one JSON object, which is one sample document. It can also be a
JSON array of objects, which is several sample documents. Cyoda merges the
array elements in the same way as successive imports. Any other body, such as a
scalar or an array that holds a non-object, is `400 VALIDATION_FAILED`. The
message names the element that caused the failure.

New samples **widen** the schema. A field seen first as `INTEGER` and later as
`STRING` declares both types. Use discover mode when you prototype, when you
explore a dataset, or when the contract with upstream producers is not yet
fixed.

The **length** of an array is not part of the model. A field declared as an
array of strings holds an array of any length, at every change level. No path
addresses the count of elements.

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

## What a field declares

A field declares a **set of kinds**: scalar, object and array. For a scalar, it
also declares a set of types. Cyoda enforces every kind that the field
declares, and every declared kind is admissible at every change level. A field
declared `STRING` accepts a string. It rejects an array or an object with
`400 VALIDATION_FAILED`, and the message names each kind that the field
declares.

A field declares more than one kind when Cyoda observes it in each kind. This
happens while the model is `UNLOCKED`, or through a `STRUCTURAL` change on a
locked model.

A field admits a **value** when two conditions are true. The kind of the value
matches a kind that the field declares. The admission test of the declared type
accepts the value. Cyoda applies this test to each value:

- A field declared `DOUBLE` accepts `1000`, `1000.0`, `1e3` and `2147483648`
  with no schema change. The precision and scale of each value fit `DOUBLE`.
- The same field needs a `TYPE` change for `9007199254740993`. That value needs
  sixteen significant digits, which is more than `DOUBLE` holds exactly. At
  `TYPE`, the field widens to `UNBOUND_DECIMAL`, the narrowest type that holds
  both values.
- A field declared `STRING` holds `"2026-03-01"` with no schema change, because
  `STRING` admits every string. A field acquires a temporal type such as
  `LOCAL_DATE` at **registration**, from sample data that shows a date-shaped
  value. A write to a field already declared `STRING` does not add a temporal
  type.

`null` follows the declaration like any other value. A scalar field always
accepts `null`. A container field accepts `null` where the model observed it.
`null` does not widen the model.

## Field names must be addressable

A field name must be a valid path segment: one or more ASCII letters, digits,
`_` or `-`. Cyoda rejects any other name with `400 VALIDATION_FAILED`, and the
message names the key and the object that declares it. Rejected characters
include spaces, dots, quotes, brackets, `$`, `@`, `:`, the metacharacters
`*`, `?`, `#`, `|`, `!` and `\`, and any non-ASCII character. An empty name is
also rejected.

Search addresses a field through a `jsonPath` built from this charset, and
there is no escape form. A name outside the charset is therefore not
searchable. For example, `$.a.b` addresses a nested `a` → `b`, not a field
called `a.b`.

The rule applies to the two paths that establish the field set of a model:
sample-data import, and the change-level extension that an entity write
performs. It does not apply to strict validation, which is a model with no
change level, and `PATCH`. Strict validation establishes no fields.

Cyoda does not migrate a model that already carries a non-conforming field, and
there is no compatibility mode. Rename the key in the source data and establish
the model again.

## Evolving a model

You evolve during discover mode by sending data: fields appear, types widen,
new kinds are declared. None of this is surprising until you lock.

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
- **Widen types (pre-lock).** A field observed holding values of more than one
  type declares each of them, and a value is admitted when any declared type
  admits it. See the [Trino SQL reference](/reference/trino/) for how the
  primitive types map onto the analytical surface.
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

### The change-level ladder

A locked model can still be allowed to extend itself as entities are written,
by setting a `changeLevel` on it:

```
POST /model/{entityName}/{modelVersion}/changeLevel/{changeLevel}
```

The four levels are hierarchical, most restrictive first:

| Level | What a write may change |
|---|---|
| `ARRAY_LENGTH` | Nothing. The floor of the ladder — no schema change at all. |
| `ARRAY_ELEMENTS` | An array's element may learn its first scalar type, or widen the one it declares. Nothing outside an array. |
| `TYPE` | An existing field's declared types may widen. |
| `STRUCTURAL` | New fields, and giving a path a kind it does not yet declare. |

`ARRAY_LENGTH` permits no schema change. An array of any length is admissible
at this level, as it is at every other level.

Two rules decide which level a write needs:

- A write that gives a path a **kind** it does not declare is a `STRUCTURAL`
  change. An object written into a field declared `STRING` is an example.
- A write that gives a path a **value** that no declared type admits is a
  `TYPE` change.

There is one exception. A path that declares no kind has nothing to conflict
with. A field observed only as `null`, or an array observed with no content,
learns its first kind at `TYPE`. For the element of an array, it learns its
first kind at `ARRAY_ELEMENTS`.

The change level governs data returned by a **workflow processor** in the same
way as data sent by a client. A processor that writes a field that the model
does not declare needs the change level set. If the level does not permit the
change, the transition fails with `WORKFLOW_FAILED` and rolls back.

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
- **Field names outside the addressable charset.** Cyoda rejects such a key on
  the way in, and the key never establishes a field. Plan the rename in the
  source data. Cyoda provides no migration.

## Who validates what

Cyoda validates **structure** and **types** against the model: the kinds each
field declares, the types its scalars declare, and the shape of nested objects
and array elements. You do not write those validators.

Cyoda also refuses a payload that is valid JSON but not storable. This applies
on every backend and on both transports. See
[what the platform will not store](/build/working-with-entities/#what-the-platform-will-not-store).

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
  format of the SIMPLE_VIEW and JSON_SCHEMA exports: node descriptors,
  type descriptors, and the JSON Schema for the response.
- [JSON schema reference](/reference/schemas/) — the REST-API message
  schemas generated from cyoda-go.
- [Workflows and events](/concepts/workflows-and-events/) — how state
  and transitions are configured.
