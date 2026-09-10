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
post a representative sample and Cyoda records the fields, their types, and the
shape of nested arrays and objects. The body may be one JSON object — one
sample document — or a JSON array of objects, read as several sample documents
and merged exactly as successive imports would be. Anything else, a scalar or
an array holding a non-object, is `400 VALIDATION_FAILED` naming the offending
element. New samples **widen** the schema: a field seen as `INTEGER` once and
as `STRING` later declares both. Use discover mode when you are prototyping,
exploring a dataset, or have not yet fixed the contract with upstream
producers.

An array's **length** is not part of the model. A field declared as an array of
strings holds an array of any length, at every change level; there is no
"widest array seen" statistic and no path spelling that addresses a count.

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

A field declares a **set of kinds** — scalar, object, array — and, for a scalar,
a set of types. Every kind the field declares is admissible at every change
level, and every one of them is enforced: a field declared `STRING` accepts a
string and rejects an array or an object with `400 VALIDATION_FAILED`, naming
each kind it does declare. A field declares more than one kind by being
observed in each, either while the model is `UNLOCKED` or through a
`STRUCTURAL` change on a locked one.

A field admits a **value** when the value's kind matches one the field declares
*and* that declared type's own admission test accepts the value. This is a
direct, per-value test rather than a widening lattice over a classified label,
and the difference is visible:

- A field declared `DOUBLE` accepts `1000`, `1000.0`, `1e3` and `2147483648`
  with no schema change at all, because each value's own precision and scale
  fit `DOUBLE`.
- The same field needs a `TYPE` change for `9007199254740993`, which wants
  sixteen significant digits — past what `DOUBLE` holds exactly — and at `TYPE`
  it widens to `UNBOUND_DECIMAL`, the narrowest type holding both.
- A field declared `STRING` holds `"2026-03-01"` with no schema change, because
  `STRING` admits every string. A field acquires a temporal type such as
  `LOCAL_DATE` at **registration**, from sample data that shows a date-shaped
  value; an ordinary write to an already-`STRING` field does not grow that
  declaration on its own.

`null` follows the declaration like any other value: a scalar field always
accepts it, a container field accepts it where the model observed one, and it
never widens the model.

## Field names must be addressable

A field name is accepted only if it is a valid path segment: one or more ASCII
letters, digits, `_` or `-`. Spaces, dots, quotes, brackets, `$`, `@`, `:`, the
evaluator's metacharacters and any non-ASCII character are rejected with
`400 VALIDATION_FAILED`, naming the offending key and the object that declares
it.

The reason is queryability. Search addresses a field through a `jsonPath` built
from exactly this charset and offers no escape hatch, so a field named `a.b`
could be written and then never found — worse, `$.a.b` would resolve as a
nested `a` → `b` instead. It is refused at the door.

This applies to both paths that establish a model's field set: sample-data
import, and the change-level-driven extension an entity write performs. Strict
validation (a model with no change level, and `PATCH`) establishes no fields,
so the rule does not apply there. A model that already carries a non-conforming
field is **not migrated** and there is no compatibility path: rename the key in
the source data and re-establish the model.

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

`ARRAY_LENGTH` reads oddly now that an array's length is not part of the model,
and that is the point: it is the level that permits nothing, and a longer array
is held there exactly as it is at every other level.

Two rules decide which level a write needs. Giving a path a **kind** it does
not declare — an object into a field declared `STRING` — is a `STRUCTURAL`
change. Giving it a **value** no declared type admits is a `TYPE` change. A
path that declares no kind at all is the exception worth knowing: a field
observed only as `null`, or an array observed with no content, has nothing to
conflict with, so it learns its first kind at `TYPE` (or `ARRAY_ELEMENTS` for
an array's element) rather than at `STRUCTURAL`.

This governs data returned by a **workflow processor** exactly as it governs
data sent by a client. A processor that writes a field the model does not
declare needs the change level set, or the transition fails with
`WORKFLOW_FAILED` and rolls back.

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
- **Unspellable field names.** A key outside the addressable charset is
  rejected on the way in and never establishes a field, so plan renames in the
  source data rather than expecting a migration.

## Who validates what

Cyoda validates **structure** and **types** against the model: the kinds each
field declares, the types its scalars declare, and the shape of nested objects
and array elements. That is free; you do not write those validators.

It also refuses a payload that is valid JSON but not storable, on every backend
and both transports: a NUL character, unpaired UTF-16 surrogates or invalid
UTF-8, a name repeated within one object, trailing content after the JSON
value, and a number outside PostgreSQL's `numeric` range. Each of these used to
be accepted by some backends and rejected by others.

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
