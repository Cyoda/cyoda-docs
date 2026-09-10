# Cyoda-Go v0.8.4 Documentation Update — Design

**Date:** 2026-09-09
**Status:** Implemented (2026-09-09) on `docs/release-v0-8-4`
**Branch:** `docs/release-v0-8-4`
**Scope:** Bring the docs site into line with everything delivered in the
cyoda-go v0.8.4 milestone (40 issues), pin the site to v0.8.4, and publish the
v0.8.4 release-notes page.

## Background

cyoda-go v0.8.4 was tagged **9 September 2026** and every release asset is
published, including `cyoda_help_0.8.4.json` (verified via
`gh release view v0.8.4 --repo Cyoda/cyoda-go`). The site was pinned to
`0.8.3`.

This is a consolidation release, and it changes more caller-visible behaviour
than any before it. Where cyoda-go carried two implementations of one idea it
now carries one: a single path grammar, a single resolver, a single
type-admission test, a single search execution path. Each of those
convergences makes a statement currently on the docs site outright false —
not merely incomplete.

Four areas are hit hardest:

1. **Search.** A field path must now be JSON Path; the whole-model fallback is
   deleted; `NOT` exists; `LIKE` is a glob matched directly; `function` is
   rejected in search bodies; `SCAN_BUDGET_EXHAUSTED` is retired.
2. **The model.** Array width is no longer part of the model; a field declares
   a *set* of kinds and every branch is enforced and exported; field names must
   be addressable; type admission is a per-value test.
3. **Entity writes.** Three transaction-control parameters that were accepted
   and ignored now work; `waitForConsistencyAfter` is retired; a family of
   unstorable payloads is rejected at the boundary.
4. **Operations.** PostgreSQL ceilings, an async-search worker pool with a
   per-tenant cap, a SQLite reader pool that raises the memory ceiling, panic
   containment that withdraws a node from service, and a migration that blocks
   writers.

The v0.8.2 and v0.8.3 updates established the standard this follows: every
milestone issue reflected in the relevant guide/reference page, no false
statements, no missing capability a reader would look for.

## Goals

1. Site pinned to v0.8.4; release-notes page published and linked.
2. Every v0.8.4 milestone issue reflected in the relevant page — no false
   statements, no missing capability a reader would look for.
3. `reference/entity-model-export.mdx` rewritten against **captured output from
   a local v0.8.4 build**, not from prose. The page is a wire-format
   specification and most of its examples are now wrong.
4. Pre-existing falsehoods on pages this release touches are corrected, not
   worked around.

## Non-goals

- **SPI breaking changes** (`EntityStore.Search`/`Iterate` required,
  `GetAll`/`GetAllAsAt` removed, `Filter.Prepare`/`PreparedFilter.Match`,
  `ModelNode` branch sets, `spitest` conformance cases). Plugin-author material
  with no audience surface in this repo. Release notes only.
- **Internal throughput work** (schema caching alongside the descriptor, the
  leaf evaluator preparing once per query). Release notes only.
- No restructure of existing pages beyond the sections named below.
- No change to the auto-generated `help/**` mirror or `reference/schemas/**`
  beyond what re-pinning regenerates.

## Milestone cross-check (verified 2026-09-09)

`gh issue list --repo Cyoda/cyoda-go --milestone v0.8.4 --state all` → **40
issues, all CLOSED**, matching the "40 issues delivered" line in the release
notes. No reconciliation needed.

| # | Title (abbreviated) | Doc impact |
|---|---|---|
| 555 | Type admission on ingestion and the query side | Part 3 |
| 544 | Write-side type check refuses whole numbers on DOUBLE | Part 3 |
| 542 | Add `NOT`, and the two defects it amplifies | Part 2, Part 4 |
| 534 | `ModelNode` holds a set of branches | Part 3, Part 5 |
| 530 | Path resolution implemented twice | Part 2 |
| 529 | Polymorphic fields are not treated as unions | Part 2, Part 3, Part 5 |
| 528 | Model derivation and reporting from sample data | Part 3, Part 5 |
| 527 | A `STRING` field accepts an array or object | Part 3 |
| 526 | Positional array conditions match on memory, miss on SQL | Part 2 |
| 524 | Search skips field-path validation when schema unloadable | Part 2 |
| 516 | Tracking: v0.8.4 search remediation | umbrella |
| 510 | memory/sqlite `Iterate` over-records the read set | Non-goal (SPI) |
| 509 | Async search: re-execute orphaned jobs | Part 2, Part 6 |
| 501 | Honor `waitForConsistencyAfter`; gRPC delete-all inert fields | Part 4 |
| 491 | Explicit empty `OR` diverges by backend | Part 2 |
| 484 | OIDC provider cache never converges | Part 7 |
| 483 | Auth caches never reconcile | Part 7 |
| 479 | `MATCHES_PATTERN` accept/reject skew | Part 2 |
| 478 | Consume the SPI array-wildcard quantifier | Part 2 |
| 477 | Delete the whole-model search fallback | Part 2 |
| 476 | A field named `a.b`; query-path allowlist too strict | Part 3 |
| 475 | Search bounding contract: no server-imposed time guards | Part 2, Part 6 |
| 474 | Async search cancel is a silent no-op | Part 2 |
| 473 | Server-boundary resilience | Part 6 |
| 472 | Stream, don't materialise | Part 6 |
| 471 | Transaction lifecycle safety | Part 6 |
| 468 | gRPC entity ingress decodes before validation | Part 4 |
| 465 | Wrong workflow definition on multi-workflow models | Part 4 (workflows) |
| 464 | Delegate search filter translation to the SPI | Non-goal (SPI) |
| 460 | flaky point-in-time tests | None |
| 458 | Reject `function` conditions in search | Part 2 |
| 455 | help(workflows): CRITERIA section understates lifecycle fields | Re-pin (auto) |
| 434 | Federated OIDC reload does not re-warm JWKS | Part 7 |
| 379 | Honor transaction-control params uniformly | Part 4 |
| 364 | Cluster-mode reliability | Part 7 |
| 360 | Serialize `ExtendSchema` per (tenant, model) | Release notes only |
| 296 | `GetSubmitTime` cross-tenant timestamp leak | Part 7 |
| 546, 25 | Test-tier and E2E infrastructure | None |

## Current state of touched pages (verified 2026-09-09)

Verified against the v0.8.4 binary's own help content
(`~/go-projects/cyoda-light/cyoda-go/cmd/cyoda/help/content/`) and against
**captured HTTP responses from a locally built v0.8.4 server** (memory backend,
`CYODA_IAM_MODE=mock`), which per `reference_docs_source_of_truth` outranks the
OpenAPI spec.

### `build/searching-entities.mdx`

- **:182** — "`operator` is `AND` or `OR`; these are the only two, and `NOT` is
  not supported." **False.** `NOT` is implemented end to end.
- **:203–233** — documents `function` as a search condition type, with an Aside
  explaining that it post-filters with in-memory entity loading. **False.**
  A search, async-search, grouped-stats or conditional-delete body carrying a
  `function` clause at any depth is now `400 INVALID_CONDITION`. The Aside
  describes the in-memory fallback that no longer exists.
- **:195–201** — the `array` clause example uses `"jsonPath": "$.laureates"`.
  **False.** The path must now carry a trailing `[*]`.
- **:285–289** — "`\` escapes a literal `%`, `_` or `\`". **Understated.** `\`
  now escapes *any* character to its literal form, `%` and `_` match newlines,
  and an unpaired trailing `\` is rejected.
- **:301–306** — the `INVALID_FIELD_PATH` description covers an unknown path
  and a pure container, but not the grammar. There is no path grammar on the
  page at all.
- **:310–311** — "There is no operator-versus-type rejection: `CONTAINS` on a
  numeric field is a valid request that simply evaluates to a non-match."
  **True, and kept.** The `predicates` help topic says otherwise; the binary
  does not. See the divergence recorded below.
- **:280–283** — "Absent and null fields never match a binary operator —
  including negatives." Still true, but silent on the `NOT` asymmetry and on
  unsatisfiable-comparison polarity, both of which change results.
- **:427–430** — the whole performance list describes the fallback:
  "A condition the plugin cannot translate falls back to in-memory filtering
  after a full scan… `400 SCAN_BUDGET_EXHAUSTED`." **False on both counts.**
- **:141–143** — async search: nothing on the worker pool, `SEARCH_QUEUE_FULL`,
  the per-tenant cap, heartbeats or orphaned-job re-execution.
- **:156–157** — "Cancellation is cooperative". True, but cancel was a silent
  no-op before this release and cancelled jobs accumulated.
- Nothing anywhere on `timeoutMillis` / `408 SEARCH_TIMEOUT`, on the
  no-server-imposed-time-budget contract, or on the `500` when a model schema
  cannot be loaded.
- **:466–478** — grouped statistics: `groupBy` example uses `"state"` and
  `"$.country"` correctly, but the page does not say subscripts are rejected
  there, nor that paths are validated against the model, nor that
  `501 NOT_IMPLEMENTED_BY_BACKEND` is retired.

### `build/modeling-entities.md`

- **:34–35, :62** — "array widths grow to fit observed data". **False.** An
  array's length is not part of the model; the "widest array seen" statistic is
  gone.
- **:77–81** — "type hierarchy (e.g. `BYTE → SHORT → INT → LONG`)". **False.**
  Those DataTypes do not exist in cyoda-go; and admission is a per-value test,
  not a widening lattice.
- **:113–114** — "array constraints" among what Cyoda validates. **False.**
- No mention of the `changeLevel` ladder, of kind enforcement, or of the
  field-name grammar — all three are now caller-visible failure modes.

### `reference/entity-model-export.mdx`

The page is a wire-format specification and the wire format changed. Verified
by capture against a local v0.8.4 build:

- **:38–48** — "exactly two top-level keys". **False.** A model with composite
  unique keys exports a third, `uniqueKeys`.
- **:60–66, :143–178, :459–570** — "three kinds of node descriptors" (object,
  array, mixed). **False.** Every node descriptor is now an object descriptor.
  Detached array nodes and the two-element mixed-node array are gone.
- **:110–118, :240–280** — the `(TYPE x N)` UniTypeArray and the MultiTypeArray
  JSON array. **Both gone.** An array field is `".name[*]": "<type>"`, one
  `[*]` per level, and heterogeneous elements merge into a type set.
- **:202–228** — the DataType table lists `BYTE`, `SHORT` and `FLOAT`.
  **False.** The enum has 20 members and none of those three
  (`cyoda-go-spi/datatype.go`).
- **:230–238** — structural DataTypes list `ARRAY`, `TYPE_REFERENCE` and
  `POLYMORPHIC`. **False.** The exporter emits only `OBJECT` and
  `ARRAY_ELEMENT`.
- **:319–352 (Example 2)** — "Plain nested objects are **inlined** into the
  parent node using dot-path notation". **False.** Captured output gives
  `"#.address": "OBJECT"` plus a `$.address` bucket of its own.
- **Examples 1, 2, 3, 5, 6** — all produce different output on v0.8.4.
  (Example 1 additionally mis-types `"2020"`: it classifies as `YEAR`.)
- **:626–634 (key behaviour 7)** — "The SIMPLE_VIEW is round-trippable… can be
  re-imported". **False.** Captured: `400 BAD_REQUEST: unsupported import
  converter`. `SAMPLE_DATA` is the only import converter.
- **:606–610 (key behaviour 3)** — "array widths may increase". **False.**
- The page documents SIMPLE_VIEW only; `JSON_SCHEMA` is the other export
  converter and its `anyOf` union rule is a v0.8.4 change with no home.

### `build/working-with-entities.mdx`

- **:148–150** — the conditional delete section is silent on `transactionSize`
  batching, on `deleteResult.idToError`, on `409 DELETE_NOT_CONVERGED`, and on
  `pointInTime`/`verbose` on the whole-model form.
- No mention anywhere of `transactionTimeoutMillis` / `408
  TRANSACTION_TIMEOUT`, of the payload-integrity guards, of
  `503 STORAGE_UNAVAILABLE`, or of the write-visibility contract.

### `build/workflows-and-processors.mdx`

- **:45, :58, :84, :137, :634, :648, :733, :836** — workflow schema version
  `"1.3"` throughout, and ":58" states the server accepts `"1.1"` through
  `"1.3"`. **Now 1.4**, with 1.1–1.4 accepted.
- **:66, :71** — workflow selection described as happening "when an entity is
  created". **False.** Selection is re-evaluated on **every** door, with
  re-binding and security consequences.
- **:397, :451** — criteria section already lists `NOT` as a group operator
  (previously aspirational, now correct) but says nothing about the
  exactly-one-child rule or the universal-quantifier semantics.
- Nothing on import-time criterion validation (`400 VALIDATION_FAILED`), on a
  criterion naming an undeclared field aborting the save, or on a processor's
  returned data being governed by the model.

### `build/client-compute-nodes.md`

- **:302–315** — `CYODA_KEEPALIVE_INTERVAL` / `CYODA_KEEPALIVE_TIMEOUT`
  documented as effective. They were parsed and ignored until v0.8.4; and
  eviction now also fires on a stalled *write*, not only inbound silence.
- Nothing on a processor's returned data being governed by the model, nor on
  the PostgreSQL `pointInTime`-inside-a-transaction change, which breaks a
  callback that read its own uncommitted write that way.

### `run/storage-engines.mdx`, `run/kubernetes.md`, `run/docker.md`

- Nothing on the SQLite reader pool's `(readers + 1) × cache` memory ceiling,
  the five PostgreSQL ceilings, migration `000008`'s write-blocking window, the
  `cyoda_storage_pool_*` metrics, or the panic-withdrawal health behaviour.

### `concepts/entities-and-lifecycle.md`

- **:56** — "array widths grow". **False**, same as `modeling-entities.md`.

## Decisions

1. **One PR**, matching v0.8.3. The pin bump and the prose land together so the
   site is never internally inconsistent.
2. **Pin bump included.** Confirmed with the user. Regenerating moves the help
   mirror from 103 → 115 topics, the OpenAPI spec, 66 CloudEvent schemas and
   the configuration reference (101 vars, 10 topics) to v0.8.4.
3. **`entity-model-export.mdx` is rewritten from captured output.** Confirmed
   with the user. Every example on the page is replaced with a response
   captured from a locally built v0.8.4 server, and the page gains a
   `JSON_SCHEMA` section because that converter's union rule changed too.
4. **The path grammar gets a section on `searching-entities.mdx`**, not a new
   reference page. It is the same call the v0.8.3 design made for predicate
   semantics, and for the same reason: a new page would compete with the
   `/help/search/` mirror rather than add to it.
5. **The release-notes page reproduces the notes as authored**, adapted to the
   v0.8.2/v0.8.3 page conventions. Guide pages follow the binary's own help
   where the two differ.
6. **`function`-in-search is corrected as part of this update.** The Aside
   describing its in-memory post-filtering is not merely stale, it describes
   the deleted fallback, so leaving it would be worse than a version lag.

## Design

### Part 1 — Version pin and regeneration

Bump `cyoda-go-version.json` to `0.8.4`, then run the full `pnpm build` so the
help mirror, OpenAPI spec, CloudEvent schemas, configuration reference, markdown
export, `llms.txt` and `schemas.zip` are all rebuilt from the pinned release.

### Part 2 — Search → `build/searching-entities.mdx`

- New **"How a field path is written"** section carrying the grammar, the
  wildcard/positional addressing rules, the multi-branch and vacuity rules, and
  the rejected spellings.
- `NOT` added to the group-condition section: exactly one child, universal
  quantifier over a wildcard, true over empty/null/absent, residual-only.
- `array` clause corrected to require a trailing `[*]`.
- `function` moved out of the search DSL: documented as criteria-only, with the
  rejection code. The pushdown Aside is deleted.
- Predicate-semantics section: `LIKE` grammar corrected; operator-versus-type
  rejection corrected; unsatisfiable-comparison polarity added; the `NOT`
  null-guard asymmetry added.
- New **"One execution path"** subsection replacing the fallback bullets: no
  in-memory fallback, `400` instead, no scan budget, no server-imposed time
  budget, `timeoutMillis`/`408 SEARCH_TIMEOUT` as the caller's lever, and the
  `500` on an unloadable schema.
- Async section: worker pool, `503 SEARCH_QUEUE_FULL`, the per-tenant cap and
  its single-tenant consequence, heartbeats, and orphaned-job re-execution.
- Grouped statistics: subscripts rejected, paths validated against the model,
  `501` retired.
- The v0.8.3 "your existing queries may return different results" Aside is
  re-pointed at v0.8.4's larger set.

### Part 3 — The model → `build/modeling-entities.md`

- Delete every array-width claim.
- Replace the `BYTE → SHORT → INT → LONG` lattice with the real rule: a field
  admits a value when a declared type's own admission test accepts it, per
  value, on both the write and the query side.
- New **"What a field declares"** subsection: a field holds a *set* of kinds,
  every declared kind is admissible at every `changeLevel`, and a value of an
  undeclared kind is rejected.
- New **"The change-level ladder"** subsection: the four levels, with
  `ARRAY_LENGTH` as the no-change floor.
- New **"Field names must be addressable"** subsection with the charset and the
  no-migration consequence.
- Sample-data import: an array body is a collection of documents.

### Part 4 — Entity writes → `build/working-with-entities.mdx`

- New **"Bounding a write"** section: `transactionTimeoutMillis`,
  `transactionSize`, and their rejection inside a joined transaction.
- Delete section extended: batching, `idToError`, `409 DELETE_NOT_CONVERGED`,
  `pointInTime` and `verbose` on the whole-model form.
- New **"What the platform will not store"** section: the five payload guards.
- New **"When a write is visible"** section: the contract, and
  `waitForConsistencyAfter`'s retirement.
- `503 STORAGE_UNAVAILABLE` noted as retryable, and the
  storage-outage-is-not-404 correction.

### Part 5 — Model export → `reference/entity-model-export.mdx`

Rewritten around the captured output. Node descriptors reduce to one kind;
array descriptors are removed; the DataType and structural-DataType tables are
corrected; every example is replaced; the response JSON Schema is rewritten to
match; a `JSON_SCHEMA` converter section is added with the `anyOf` rule; the
round-trip claim is replaced with the real import contract.

### Part 6 — Operations → `run/storage-engines.mdx`, `run/kubernetes.md`

- SQLite: reader pool, the per-connection cache multiplier, the memory ceiling
  and the `GOMAXPROCS` caveat.
- PostgreSQL: the five ceilings, pool-acquire failure as
  `503 STORAGE_UNAVAILABLE`, the `cyoda_storage_pool_*` metrics, and migration
  `000008`'s maintenance window.
- Kubernetes: panic withdrawal — `/health` and `/readyz` report `503` while
  `/livez` is unchanged, so the pod leaves the Service but is not restarted.

### Part 7 — Workflows, compute nodes, auth, concepts

- `workflows-and-processors.mdx`: schema version 1.4 throughout; per-call
  workflow selection with the two design consequences; `NOT` semantics in
  criteria; import-time criterion validation; undeclared-field criterion aborts
  the save; processor-returned data governed by the model.
- `client-compute-nodes.md`: keep-alive vars now honored and write-stall
  eviction; processor data governed by the model; the PostgreSQL
  `pointInTime`-in-transaction change.
- `concepts/authentication-and-identity.md`: OIDC reload no longer destroys the
  JWKS cache; failed warm-ups retry; trusted-key revocation propagates.
- `concepts/entities-and-lifecycle.md`: array-width claim removed.

### Part 8 — Release notes and index

`src/content/docs/releases/v0-8-4.mdx` adapted from
`cyoda-go/docs/release-notes/v0-8-4.md`, following the v0.8.3 page conventions:
frontmatter title + description, negative-date sidebar order (`-20260909`),
breaking changes lifted into a caution Aside, CHANGELOG linked with the
`#084--2026-09-09` anchor, versioning rationale demoted to a closing note.
Newest-first LinkCard added to `releases/index.mdx`.

## Testing / verification

- `pnpm build` completes; no broken internal links.
- `pnpm test` passes (node:test fetch/build integration + Playwright GDPR, GA,
  navigator suites).
- Every code sample and error code on a touched page traced to either the
  v0.8.4 binary's help content or a captured response from the local build.
- `grep` sweep for the retired identifiers: `SCAN_BUDGET_EXHAUSTED`,
  `POLYMORPHIC_SLOT`, `waitForConsistencyAfter`, `CYODA_TX_TTL`,
  `CYODA_SQLITE_SEARCH_SCAN_LIMIT`, `NOT_IMPLEMENTED_BY_BACKEND`, `(TYPE x N)`,
  "array width".

## Capture log (2026-09-09)

Built `cmd/cyoda` at tag `cyoda-0.8.4` (`0021e97`) and ran it with
`CYODA_IAM_MODE=mock CYODA_STORAGE=memory`. Captured SIMPLE_VIEW and
JSON_SCHEMA exports for nine model shapes: flat object with an object array,
nested object plus primitive array, array of arrays, polymorphic scalar,
scalar-and-array union, heterogeneous array, scalar-and-object union, empty
array, and two-level nested object arrays. Also captured the `uniqueKeys`
envelope, the `404 MODEL_NOT_FOUND` body, the SIMPLE_VIEW-import rejection, the
non-addressable-field-name rejection and the non-document sample-body
rejection.

## Implementation notes (2026-09-09)

### File-by-file

| File | Change |
|---|---|
| `cyoda-go-version.json` | `0.8.3` → `0.8.4`. Regenerates the help mirror (103 → 115 topics), OpenAPI spec, 66 CloudEvent schemas, the configuration reference (101 vars, 10 topics) and every rendered version string. |
| `src/content/docs/releases/v0-8-4.mdx` | New. Adapted from the cyoda-go notes; breaking changes lifted into a caution Aside; CHANGELOG anchored at `#084--2026-09-09`; versioning rationale demoted to a closing footnote. Two site cross-links added where a docs page now covers the topic (path grammar, model export). |
| `src/content/docs/releases/index.mdx` | Newest-first LinkCard. |
| `src/content/docs/build/searching-entities.mdx` | `NOT` in the group DSL; `array` clause requires a trailing `[*]`; `function` documented as criteria-only and its pushdown Aside deleted; unknown operator is `INVALID_CONDITION`; new **How a field path is written**; new **Negation with `NOT`**; predicate semantics corrected for operator polarity, `LIKE`-as-glob, operator-versus-type rejection and the `500` on an unloadable schema; new **One execution path** (no fallback, no scan budget, no server time budget, `timeoutMillis`); async admission, backpressure and node-loss recovery; cancel terminal-state behaviour; grouped-stats path rules; sort-key grammar. |
| `src/content/docs/build/modeling-entities.md` | Array-width claims deleted; sample data as document-or-collection; new **What a field declares**; new **Field names must be addressable**; new **The change-level ladder**; type lattice replaced with per-value admission; payload guards added to *Who validates what*. |
| `src/content/docs/reference/entity-model-export.mdx` | Rewritten. Retitled to cover both converters; three-key envelope; one node-descriptor kind; array and mixed descriptors removed; DataType table corrected to the real 20; structural values corrected to `OBJECT`/`ARRAY_ELEMENT`; kind unions; all examples replaced with captured output; response JSON Schema rewritten; new `JSON_SCHEMA` section with the `anyOf` rule; round-trip claim replaced with the real import contract. |
| `src/content/docs/build/working-with-entities.mdx` | New **Bounding a write**, **When a write is visible**, **What the platform will not store**; delete section extended with batching, `idToError`, `DELETE_NOT_CONVERGED` and `pointInTime`. |
| `src/content/docs/build/workflows-and-processors.mdx` | Schema version 1.4 (6 code blocks + 2 prose ranges); per-call workflow selection with the two design consequences; `NOT` semantics; `array` criteria corrected to positional `values` on a `[*]` path; new **A criterion is validated at import, and fails the save at evaluation**; processor-returned-data Aside. |
| `src/content/docs/build/client-compute-nodes.md` | Keep-alive vars now honored, write-stall eviction, single-writer outbox; four new transaction-join consequences including the PostgreSQL `pointInTime` change. |
| `src/content/docs/run/storage-engines.mdx` | Backend-conformance and write-visibility paragraphs; SQLite reader pool and memory ceiling; PostgreSQL ceilings, `503 STORAGE_UNAVAILABLE`, pool metrics, migration `000008` window. |
| `src/content/docs/run/kubernetes.md` | Panic-withdrawal probe behaviour. |
| `src/content/docs/run/docker.md` | Panic-withdrawal note; the three HTTP receive-side timeouts. |
| `src/content/docs/concepts/authentication-and-identity.md` | Three OIDC/trusted-key cache-convergence fixes. |
| `src/content/docs/concepts/entities-and-lifecycle.md` | Array-width claim removed. |
| `src/content/docs/reference/index.mdx` | Export-page description covers both converters. |

### Verification performed

- `pnpm build` completes — 239 pages, no content warnings. (Run with
  `ASTRO_TELEMETRY_DISABLED=1`: the sandbox denies Astro's telemetry write to
  `~/Library/Preferences`, which is an environment artefact, not a build
  failure.)
- `CI=true pnpm test` passes: node:test 63/63, Playwright 60 passed / 2
  skipped, exit 0. `CI=true` is what the workflows set, and
  `playwright.config.js` narrows to the chromium project under it — the same
  gate `ci.yml` and `deploy.yml` run. A plain local `pnpm test` additionally
  spins up the firefox, webkit and mobile projects, whose browser binaries are
  not installed on a machine that has only ever run the CI path.
- Every cross-page anchor introduced resolves in the built HTML:
  `#how-a-field-path-is-written`, `#negation-with-not`, `#predicate-semantics`,
  `#the-change-level-ladder`.
- The two JSON Schema `pattern` regexes on the export page were run against the
  real captured node paths and descriptor keys.
- `grep` sweep for retired identifiers: every surviving mention is a deliberate
  "this is retired" statement.

### Known pre-existing issues, not addressed

- **`reference/trino.mdx`** documents `BYTE`, `SHORT` and `FLOAT` DataTypes and
  a `BYTE → SHORT → INT → LONG` widening lattice. cyoda-go's `DataType` enum
  has 20 members and none of those three
  (`cyoda-go-spi/datatype.go`). The page describes the Trino/analytical
  surface, which v0.8.4 did not touch, so correcting it is out of scope here —
  but it should be reconciled against the real enum in its own change.

### One deliberate divergence from the notes as authored

Decision 5 says the release-notes page reproduces the cyoda-go notes as
authored. It does, with one addition: a breaking-changes bullet for the
`function`-condition rejection in search bodies (issue #458). The source notes
do not mention it anywhere — `grep -n 'function'` over
`cyoda-go/docs/release-notes/v0-8-4.md` returns nothing — yet it is a closed
milestone issue, a genuine breaking change, and the reason the search page's
`function` section had to be rewritten. Leaving it off the release page while
correcting the guide page would have been the worse inconsistency.

### Divergence: the `predicates` help topic vs. the binary's behaviour

`cmd/cyoda/help/content/predicates.md` (VALIDATION section) states that
`400 CONDITION_TYPE_MISMATCH` is raised when "the operator does not apply to
the field's type: string and pattern operators require a text field; ordering
and range operators require an ordered type".

The v0.8.4 binary does not do this. Probed against a locally built server on a
field declared `INTEGER`:

| Request | Observed |
|---|---|
| `$.amount CONTAINS "12"` | `200`, empty result |
| `$.amount CONTAINS "abc"` | `200`, empty result |
| `$.amount LIKE "1%"` | `200`, empty result |
| `$.amount EQUALS "abc"` | `400 CONDITION_TYPE_MISMATCH` |
| `$.amount GREATER_THAN "abc"` | `400 CONDITION_TYPE_MISMATCH` |
| `$.amount BETWEEN ["a","b"]` | `400 CONDITION_TYPE_MISMATCH` |

So `CONDITION_TYPE_MISMATCH` fires on the **operand-parse** rule for comparison
and range operators only, exactly as the page already described it. There is no
operator-versus-type rejection on a data path. The one real
operator-versus-type rejection is on the temporal meta fields, and it uses a
different code — verified: `creationDate CONTAINS "2026"` →
`400 INVALID_CONDITION`, "operator \"CONTAINS\" is not valid on temporal meta
field".

**Resolution:** the guide follows the binary. The page keeps its existing
statement that there is no operator-versus-type rejection, and gains the
temporal-meta-field exception. Worth raising upstream as a help-content fix.
