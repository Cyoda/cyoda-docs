# Cyoda-Go v0.8.2 Documentation Update — Design

**Date:** 2026-07-09
**Status:** Approved (design); pending implementation plan
**Branch:** `docs/release-v0-8-2` (existing)
**Scope:** Bring the docs site into line with **everything** delivered in the
cyoda-go v0.8.2 milestone (10 issues), and stand up an auto-built
Configuration Reference driven by a committed `cyoda help config all` JSON —
structured so the v0.8.3 release can swap the manual file for live binary
output with a one-line source change.

## Background

v0.8.2 is released. The release-notes page (`releases/v0-8-2.mdx`), the
version pin, the workflow-schema 1.1→1.2 correctness pass in
`workflows-and-processors.mdx`, and the auto-generated `help/messages.md`
edge-messages mirror all shipped in commit `7bd3cbd`. But the **substantive
guide pages** were not updated, and two now state things that are outright
false. A cross-check of the release notes against the GitHub milestone
(`milestone:v0.8.2`, **10 closed issues**) drives this update.

Separately, Paul has manually provided the output of the forthcoming (v0.8.3)
`cyoda help config all --format=json` command at `dist/cyoda-help-config-all.json`
(git-ignored build dir). It lists **80 env vars across 10 topics**. We use it
now to auto-build the Configuration Reference; v0.8.3 will replace the manual
file with live `cyoda help` output.

## Goals

1. Every v0.8.2 milestone issue is reflected in the relevant guide/reference
   page — no false statements, no missing capability a reader would look for.
2. A Configuration Reference section on `reference/configuration.mdx` renders
   all 80 env vars (per topic, responsive tables) from committed JSON, with a
   single swap-seam for v0.8.3.
3. New env vars also appear in-context on their feature pages (search,
   compute nodes), cross-linked to the reference.
4. Release-notes issue count reconciled with the milestone.

## Non-goals

- No change to the auto-generated `help/**` mirror (edge messages already
  landed via the build); we only add a hand-authored *link* to it.
- No re-fetch/re-pin of schemas, OpenAPI, or help index — already at v0.8.2.
- No automation of the config *fetch* now — that is the v0.8.3 follow-up. This
  change only prepares the swap-seam and consumes a committed file.
- No restructure of existing pages beyond the sections named below.

## Milestone cross-check (verified 2026-07-09)

`gh issue list --repo Cyoda/cyoda-go --milestone v0.8.2 --state all` → 10 issues,
all CLOSED:

| # | Title | Labels |
|---|---|---|
| #37 | Search: push predicate evaluation down to SQL | performance, important |
| #124 | DeleteEntities handler ignores params.PointInTime | bug, important |
| #287 | Transaction-bound callback CRUD not wired | bug, important |
| #341 | Entity partial-update (PATCH / RFC 7386 merge patch) | documentation, enhancement |
| #347 | Sorting search results by field paths | enhancement |
| #349 | Point-in-time read semantics inconsistent across engines | bug, ha-safety, important |
| #352 | Composite unique keys (scalar fields) | enhancement, test-coverage, ha-safety |
| #369 | OpenAPI contract conformance & evolution (ADR 0003) | enhancement |
| #384 | Renderer annotations on processors & criteria | — |
| #386 | `cyoda help` topic for edge messages | documentation |

Note: the release-notes page says "14 issues delivered"; the milestone shows
10 (the extra likely counts PRs). **Reconcile in `releases/v0-8-2.mdx`.**

## Current state of touched pages (verified 2026-07-09)

- `build/working-with-entities.mdx:81` — states *"There is no `PATCH`
  endpoint — all writes are full-payload PUTs."* **False after #341.** Page has
  a "Temporal queries" section (lines 122–135) but **no Delete section**.
- `build/searching-entities.mdx:152–160` — "Paging and sort (async)" says
  *"Sort is not documented on the REST async surface at this release; results
  are returned in insertion order."* **False after #347.** Point-in-time
  section at 127–150; performance notes at 162–171 (no PG-pushdown note).
- `build/modeling-entities.md` — no uniqueness-constraint coverage. Natural
  insertion after "Who validates what" (line 111–121), before "Anti-patterns".
  Ties to the existing "Two modes: discover or lock" section (UNLOCKED-only).
- `build/workflows-and-processors.mdx:72–102` — "Annotations" section covers
  **workflow / state / transition only**. Schema already documented as 1.2.
- `build/client-compute-nodes.md` — §9.2 Processor Configuration Fields
  (567–577), §9.3 Execution Modes (581–585). The `ASYNC_SAME_TX`/`ASYNC_NEW_TX`
  rows describe tx behavior as already true; #287 is the fix that makes it so,
  plus tx-token routing + 3 env vars, none currently documented.
- `reference/configuration.mdx` — hand-written conceptual page (sources/
  precedence, profiles, `_FILE` secrets). Already imports
  `cyoda-help-index.json` and `.map()`s `configTopics` — precedent for
  JSON-driven rendering on this page. Explicitly delegates the key list to the
  binary; that gap is what we now fill.
- `reference/api.mdx` — to be audited for prose contradicting #369 contract
  changes (read during implementation).

## Config JSON shape (verified 2026-07-09)

`dist/cyoda-help-config-all.json`: `{ schema: 1, version: "dev", vars: [...] }`,
80 vars. Each var: `name`, `topic`, `type`, `description`, optional `default`.
Topics (count): admin(5), auth(25), cluster(14), cors(2), database(10),
grpc(4), schema(2), search(4), server(11), tx(3).

**Data-quality facts the generator/renderer MUST tolerate (not fail on):**
- **13 vars have an empty `type`** (all in `database`/`schema`/`server`, e.g.
  `CYODA_POSTGRES_URL`, `CYODA_DEBUG`). Render blank; do not error.
- **16 vars have no `default`** key. Render blank.
- `type` values seen: `bool`, `csv`, `duration`, `int`, `string`, and `""`.

The five v0.8.2 feature vars are present:
- `CYODA_TX_TOKEN_TTL` (cluster, `1m30s`), `CYODA_GRPC_NODE_ADDR` (cluster),
  `CYODA_COMPUTE_HTTP_BASE` (grpc) — for #287.
- `CYODA_SEARCH_MAX_SORT_KEYS` (search, `16`) — for #347.
- `CYODA_STATS_GROUP_MAX` (search, `10000`) — already documented at
  `searching-entities.mdx:219`.

## Design

### Part 1 — Config Reference pipeline

Mirrors the existing `fetch-cyoda-help-index.js` → `src/data/*.json` →
MDX-import pattern.

**Data module (source tracked now).** Commit the provided JSON as the tracked
**source** `src/data/cyoda-config-all.source.json` (the raw file currently
lives in git-ignored `dist/`, wiped each build — the source of truth must be
tracked so the site builds without the binary). The generator emits the
normalized `src/data/cyoda-config-all.json`, which is **git-ignored** (a build
artifact, present at build time, like the generated schema pages). At v0.8.3
the generator's source changes from "read the committed
`cyoda-config-all.source.json`" to "run `cyoda help config all`", and the
tracked source file is retired.

**Generator `scripts/generate-config-data.js`** (+ `.test.js`), wired into the
`build` script before `astro build` and into `predev`:
- Reads a **source** JSON (now: a committed raw copy; v0.8.3: `cyoda help
  config all --format=json`).
- **Validates**: `schema === 1`, `vars` non-empty array, each var has a
  non-empty `name` and a `topic`. Empty `type`/absent `default` are
  **allowed** (see data-quality facts). Fails the build on structural drift.
- **Normalizes**: sort by `topic` then `name`; strip unknown fields; carry
  `version` through.
- Writes the slim `src/data/cyoda-config-all.json`.
- This script is the **single swap-seam** for v0.8.3.

**Decision — source vs consumed file.** For now the committed source and the
consumed data module are the same shape, so the generator is effectively a
validator+normalizer. It still earns its place: it (a) fails the build on
schema drift, (b) is where the v0.8.3 `cyoda help` invocation slots in, and
(c) keeps the pattern identical to the other fetch/generate scripts. We commit
the **source** copy at `src/data/cyoda-config-all.source.json` and emit the
normalized `src/data/cyoda-config-all.json`; the emitted file is git-ignored
(build artifact), the source is tracked. (Alternative considered: commit only
one file and have the MDX import it raw with no script — rejected because it
loses the validator and the v0.8.3 swap-seam that Paul asked for.)

**Rendering.** `reference/configuration.mdx` keeps all existing conceptual
prose untouched and gains a new **"## All variables"** section:
- `import configData from '../../../data/cyoda-config-all.json'`.
- Group vars by `topic`; render one `<h3>` per topic (10 anchors) and one
  table each: columns `Variable` · `Type` · `Default` · `Description`.
- Each table wrapped in an `overflow-x: auto` container (repo responsive-table
  rule); empty `type`/`default` render as an em-dash or blank.
- Update the page's lead-in prose: it currently says the key list "lives in
  the binary" — soften to "…and is mirrored below," keeping the
  `cyoda help config` pointer.

**Build-pipeline note.** Update `CLAUDE.md`'s build-pipeline list and the
`package.json` `build`/`predev` chains to include the new step.

### Part 2 — Feature-doc updates (one per issue)

**#341 PATCH — `build/working-with-entities.mdx`.** Replace the false
line-81 sentence and add a **"Partial update (PATCH)"** subsection under
"Update":
- `PATCH /api/entity/{format}/{entityId}` and `.../{transition}`.
- RFC 7386 merge-patch (`application/merge-patch+json`): non-null key
  overwrites, explicit `null` deletes, omitted key untouched.
- **`If-Match` required** (the `meta.transactionId` from your last GET);
  missing → `428 PRECONDITION_REQUIRED`, stale → `412`.
- JSON-only (XML → `415`); RFC 6902 JSON Patch recognized but `501` for now.
- Merged result validated strictly against the model — PATCH never extends the
  model even in extend-permitting mode.
- Contrast with PUT's wholesale-replace (the data-loss footgun it closes).

**#347 Search sort — `build/searching-entities.mdx`.** Replace the stale
"Paging and sort (async)" block:
- Sorting applies to **both** direct and async search.
- HTTP `sort` query param, grammar `[@]path[:asc|desc]` — bare dotted path =
  scalar data field; `@`-prefix = meta field (`state`, `creationDate`,
  `lastUpdateTime`, `transitionForLatestSave`, `transactionId`, `id`). gRPC:
  structured `orderBy` array.
- Canonical cross-backend ordering: Text=byte order, Numeric=IEEE-754 double,
  Bool `false < true`, Temporal chronological; nulls/absent sort last;
  `entity_id` final tiebreaker.
- Unsortable/array/unknown path → `400 INVALID_FIELD_PATH`. Sort-key count
  capped by `CYODA_SEARCH_MAX_SORT_KEYS` (default 16). Cross-link to config
  reference.

**#124 Selective delete — `build/working-with-entities.mdx`.** New **"Delete"**
section:
- `DELETE /api/entity/{entityName}/{modelVersion}` honours an
  `AbstractConditionDto` request body — deletes only matching entities; empty
  body still means all.
- `verbose=true` returns deleted ids; matched-vs-removed counts reported
  separately. `400 INVALID_CONDITION`.
- Note this closed a data-loss defect (condition was previously ignored and
  the whole model wiped).

**#352 Composite unique keys — `build/modeling-entities.md`.** New
**"Uniqueness constraints"** section (after "Who validates what"):
- `PUT /model/{entityName}/{modelVersion}/unique-keys` — **UNLOCKED models
  only**. Each key = ordered set of scalar field paths; uniqueness scoped to
  `(tenant, model, version)` over live entities.
- Null rule: all fields null/absent ⇒ exempt; partial ⇒ `422
  INVALID_UNIQUE_KEY`; all present ⇒ enforced on create & update. String
  compare byte-exact; soft-delete frees the value-set.
- Backend support: memory, sqlite, postgres. Commercial backend returns
  `422 COMPOSITE_KEY_UNSUPPORTED` until its support lands.
- New error codes: `UNIQUE_VIOLATION` (409), `INVALID_UNIQUE_KEY` (422),
  `COMPOSITE_KEY_UNSUPPORTED` (422), `INVALID_UNIQUE_KEY_DEFINITION` (422).

**#287 Tx-joined callbacks — `build/client-compute-nodes.md`.** Extend §9.3 (or
add §9.3.1) explaining that processor/criteria callbacks now **join the
originating workflow transaction `T`**:
- Engine mints a signed HMAC tx-token per dispatch, attached to the outbound
  CloudEvent as `cyodatxtoken`; compute nodes echo it on callbacks
  (`X-Tx-Token` HTTP header / `tx-token` gRPC metadata); receiver verifies HMAC
  and routes to the tx owner (local join or reverse-proxy/forward).
- Callbacks see the cascade's uncommitted writes; acks provisional until `T`
  commits. `ASYNC_NEW_TX` joins `T` via a savepoint (a processor failure
  discards its writes without aborting the cascade). Absent token ⇒ standalone
  fallback.
- Document env vars `CYODA_TX_TOKEN_TTL` (default 90s), `CYODA_GRPC_NODE_ADDR`,
  `CYODA_COMPUTE_HTTP_BASE`; cross-link to config reference.
- **Confirm during implementation** whether `startNewTxOnDispatch` /
  `COMMIT_BEFORE_DISPATCH` are user-facing config (they appear in release-note
  prose but are not in the §9.2 table) — only document them if they are.

**#349 Point-in-time canonical rule — `searching-entities.mdx` +
`working-with-entities.mdx`.** Add a short note (in each page's existing
point-in-time/temporal section) that PIT reads now apply a single canonical
inclusive `<=` rule across every backend and read path (native precision, no
millisecond round-up), and that the model list read (`getAllEntities`) now
honours `pointInTime` and stamps `meta.pointInTime`.

**#384 Processor/criteria annotations — `workflows-and-processors.mdx`.**
Extend the "Annotations" section (72–102):
- **Processors** carry an embedded `annotations` object.
- **Criteria** carry a sibling `criterionAnnotations` object on the workflow
  and on each transition (the criterion tree itself round-trips verbatim and is
  never parsed to attach metadata).
- Document the two well-known optional keys `displayName` and `description`
  uniformly across all **five** element types.
- Note processor annotations are stripped before dispatch and never reach
  compute members. Reiterate: object-only, ≤64 KB, engine-ignored, additive
  1.2 change (existing 1.1 payloads valid).

**#37 PostgreSQL pushdown — `searching-entities.mdx`.** Add to "Performance
notes": PostgreSQL search now pushes supported predicates into SQL (JSONB
extraction + numeric/range/string comparisons), with `LIMIT`/`OFFSET`
pushed down when no residual filtering remains; non-pushable operators (regex,
case-insensitive) are post-filtered as rows stream. Constant-factor win, not a
JSON-path index (indexing queried paths is a separate operational step).
SQLite already did this; the memory backend filters in memory by design.

**#369 OpenAPI reconciliation — `reference/api.mdx` (+ `working-with-entities.mdx`).**
The OpenAPI spec is auto-fetched at v0.8.2, so this is a **prose-consistency
audit**: grep the guides/reference prose and fix anything that contradicts the
reconciled contract —
- `previousTransition` removed from entity meta;
- search responds `application/x-ndjson` only (drop any `application/json`
  claim);
- `changeType` values are `CREATE`/`UPDATE`/`DELETE` (not `CREATED`/… );
- `searchEntities` `limit > 10000` → `400` (enforced, not clamped);
- `DELETE /model/...` on a LOCKED model → `409 MODEL_ALREADY_LOCKED`;
- removed fictional params (`pointInTime` on `getAsyncSearchResults`,
  `timeoutMillis`/`408` on `searchEntities`, UUID `400` on
  `getStateMachineFinishedEvent`).
Most of these are also captured in the release-notes breaking-changes Aside;
the job here is only to ensure no guide prose still asserts the old behavior.

**#386 Edge messages.** The `help/messages.md` mirror already generates. Add a
hand-authored **link** to it from an appropriate surface (e.g. the APIs/
surfaces overview or the search/entities "where to go next"), so it is
discoverable outside the raw help mirror. Verify current linkage first.

### Part 3 — Release-notes correctness

In `releases/v0-8-2.mdx`, change "14 issues delivered" to the milestone's
actual count (10) — or footnote that the higher number counts merged PRs.
Confirm the intended figure with Paul during review.

## File-by-file change list

**New:**
- `src/data/cyoda-config-all.source.json` (tracked — committed manual copy)
- `scripts/generate-config-data.js`
- `scripts/generate-config-data.test.js`

**Modified:**
- `package.json` — add `generate:config-data` step to `build` + `predev`.
- `.gitignore` — ignore the emitted `src/data/cyoda-config-all.json`.
- `CLAUDE.md` — document the new build step + tracked source file.
- `src/content/docs/reference/configuration.mdx` — "All variables" section.
- `src/content/docs/build/working-with-entities.mdx` — PATCH (#341), Delete
  (#124), PIT note (#349), any #369 prose fixes.
- `src/content/docs/build/searching-entities.mdx` — sort (#347), PG pushdown
  (#37), PIT canonical note (#349).
- `src/content/docs/build/modeling-entities.md` — uniqueness constraints (#352).
- `src/content/docs/build/workflows-and-processors.mdx` — proc/criteria
  annotations (#384).
- `src/content/docs/build/client-compute-nodes.md` — tx-joined callbacks +
  env vars (#287).
- `src/content/docs/reference/api.mdx` — #369 prose audit.
- `src/content/docs/releases/v0-8-2.mdx` — issue-count fix.
- One surface page — edge-messages link (#386).

## Testing / verification

- `pnpm test` for `generate-config-data.js` (valid input → normalized output;
  empty `type`/absent `default` tolerated; `schema !== 1` / empty `vars` →
  throws) alongside the existing script tests.
- Full `pnpm build` — generator runs in-pipeline; no stale artifacts; Astro
  builds the config tables.
- Manual: config tables render responsively (horizontal scroll on narrow
  viewport, no page-body overflow); all 80 vars present; feature-page
  cross-links resolve.
- Grep sweep: no guide prose still contradicts the v0.8.2 contract
  (`PATCH`, sort, `changeType`, `previousTransition`, delete semantics).

## Open questions (confirm during implementation)

1. Exact "issues delivered" figure for the release page (10 vs 14-as-PRs).
2. Whether `startNewTxOnDispatch` / `COMMIT_BEFORE_DISPATCH` are user-facing
   (document only if so).
3. Best host page for the edge-messages link (#386).
