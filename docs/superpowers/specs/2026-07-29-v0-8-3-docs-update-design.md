# Cyoda-Go v0.8.3 Documentation Update — Design

**Date:** 2026-07-29
**Status:** Implemented (2026-07-29) on `docs/release-v0-8-3`
**Branch:** `docs/release-v0-8-3`
**Scope:** Bring the docs site into line with everything delivered in the
cyoda-go v0.8.3 milestone (19 issues), pin the site to v0.8.3, and complete
the config-pipeline swap-seam that the v0.8.2 design deferred to this release.

## Background

cyoda-go v0.8.3 was tagged **27 July 2026** and every release asset is
published, including `cyoda_help_0.8.3.json` (verified via
`gh release view v0.8.3`). The site is still pinned to `0.8.2`.

The release adds time to the workflow engine (scheduled transitions), converges
two drifted predicate evaluators onto one type-directed kernel, makes direct
search bounded-or-fail, and separates attribution from authorization for
follow-on actions. Several of these are breaking, and several make statements
currently on the docs site outright false.

The v0.8.2 update (`docs/superpowers/specs/2026-07-09-v0-8-2-docs-update-design.md`)
established the standard this follows: every milestone issue reflected in the
relevant guide/reference page, no false statements, no missing capability a
reader would look for.

Separately, `CLAUDE.md` carries an explicit earmark:

> Until cyoda-go v0.8.3 ships `cyoda help config all`, the source file is a
> manually-provided copy; the v0.8.3 change repoints the generator at live
> binary output.

That command now exists and works. This design settles how.

## Goals

1. Site pinned to v0.8.3; release-notes page published and linked.
2. Every v0.8.3 milestone issue reflected in the relevant page — no false
   statements, no missing capability a reader would look for.
3. The config swap-seam closed: the configuration reference is built from the
   pinned binary's own output at build time, with no tracked source file that
   can drift.
4. Pre-existing falsehoods on pages this release touches are corrected, not
   worked around.

## Non-goals

- **SPI breaking changes** (`Searcher.Search` must fail rather than truncate;
  `MergePage` → `MergeBounded`; `SearchOptions.Offset` removed) — plugin-author
  material with no audience surface in this repo. Release notes only.
- **`help.RegisterOverlay(fs.FS)`** — likewise plugin-author material. Release
  notes only.
- No restructure of existing pages beyond the sections named below. In
  particular `workflows-and-processors.mdx` is extended in place rather than
  split (decided; see Decisions).
- No change to the auto-generated `help/**` mirror or `reference/schemas/**`
  beyond what re-pinning regenerates.

## Milestone cross-check (verified 2026-07-29)

`gh issue list --repo Cyoda/cyoda-go --milestone v0.8.3 --state all` → **19
issues, all CLOSED**, matching the "19 issues delivered" line in the release
notes. No reconciliation needed (unlike v0.8.2, which claimed 14 against a
milestone of 10).

| # | Title | Doc impact |
|---|---|---|
| 251 | feat(workflow): scheduled state transitions | Part 2 |
| 419 | Per-entity scheduled-transition firing time via a Function callout | Part 2, Part 4 |
| 431 | refactor(search): converge the two Go predicate evaluators onto one kernel | Part 3 |
| 423 | fix(search): temporal fields compared lexically, not chronologically | Part 3 |
| 137 | Polymorphic timestamp detection — LOCAL_DATE / YEAR_MONTH / ZONED_DATE_TIME | Part 3 |
| 432 | Direct search ignores the documented default limit (1000) on the pushdown path | Part 3 |
| 433 | Add `spi.ErrSearchResultLimitExceeded` + engine mapping | Part 3 |
| 437 | Align OSS search plugins to bounded-or-fail | Part 3 |
| 420 | feat(search): tx-aware search pushdown seam | Part 3 |
| 402 | fix(grpc): callback transaction-join not wired for search RPCs | Part 3, Part 4 |
| 399 | Postgres: boolean EQUALS/NOT_EQUALS search condition returns 500 | Part 3 |
| 430 | Attribute deferred & cascaded workflow actions to the user who caused them | Part 5 |
| 413 | feat(workflow): make criterion response reason live and client-observable | Part 4 |
| 421 | Default `ProcessorConfig.attachEntity` to true | Part 4 |
| 410 | Depth-2 nested join deadlocks the tx | Release notes only |
| 417 | gRPC streaming: keep-alive storm | Part 4 (brief) |
| 395 | config help: cluster subtopic + `config all` full listing | Part 1 |
| 401 | docs(grpc): entity PATCH missing from cyoda help | Re-pin (auto) |
| 439 | feat(help): external storage plugins contribute help topics | Non-goal |

## Current state of touched pages (verified 2026-07-29)

Verified against the v0.8.3 binary's own help content
(`~/go-projects/cyoda-light/cyoda-go/cmd/cyoda/help/content/`), which per
`reference_docs_source_of_truth` outranks the OpenAPI spec.

- **`build/workflows-and-processors.mdx:386–409`** — a
  **"Scheduled Transition Processors"** section documenting
  `"type": "scheduled"` with `config.{delayMs,transition,timeoutMs}`.
  `cmd/cyoda/help/content/workflows.md:156` lists `"scheduled"` among *legacy
  unknown* processor-type values that merely fall through to the
  `executionMode` dispatch path. `grep -rn '"scheduled"' --include='*.go'`
  over cyoda-go returns nothing. **The section documents a type the engine does
  not have.**
- **`build/workflows-and-processors.mdx:338`** — advertises
  `IS_UNCHANGED`/`IS_CHANGED` under "State Tracking". `cyoda help predicates`:
  *"change-generation operators, not search predicates — cyoda-go does not
  implement them."* **False.**
- **`build/workflows-and-processors.mdx:169–187`** — transition `Format` block
  has no `schedule`. Schema version stated as `1.2` at lines 44, 57, 83, 104,
  136, 435, 449, 534, 637.
- **`build/searching-entities.mdx:50–60, 71–78, 106–126, 138–146`** — the
  direct/async examples use a **fictional** `{"filter": {...}}` wrapper and a
  fictional `{"and":[{"field":…,"eq":…}]}` operator grammar, and place
  `pointInTime` in the request body. The real surface (`cyoda help search`) is
  a bare `Condition` document — `{"type":"simple","jsonPath":"$.x",
  "operatorType":"EQUALS","value":"y"}` — with `pointInTime` and `limit` as
  **query parameters**. The page's own grouped-statistics example at line 208
  already uses the correct DSL, so the page contradicts itself. Predates
  v0.8.3; in scope by decision (see Decisions).
- **`build/searching-entities.mdx:27–31`** — says direct result size is
  "**capped**" without saying what happens at the cap. v0.8.3 makes it fail.
- **`build/searching-entities.mdx:154–166`** — "Sorting results" asserts both
  endpoints accept sort keys, with no note that ordered top-N over a large
  model is gone from the sync path.
- **`build/client-compute-nodes.md:462, 466–473`** — `authtype` documented as
  one of `user`, `service_account`, `system`, `unauthenticated`, `unknown`.
  v0.8.3 emits exactly `user`/`service`/`system` and **fails the dispatch
  closed** on an unset or unrecognised kind. Knock-on at lines 482 (Java
  snippet), 509 (§8.5), 781 (§12 troubleshooting).
- **`build/client-compute-nodes.md:571`** — `config.attachEntity` default
  documented as `true` in the table but the surrounding prose and
  `workflows-and-processors.mdx:368` do not state that an omitted field now
  imports as `true`.
- **`build/client-compute-nodes.md:591–606`** — §9.3.1 covers tx-joined
  callbacks for write RPCs only.
- **`concepts/authentication-and-identity.md`** — no principal-kind concept; no
  attribution-vs-authorization distinction.
- **`reference/configuration.mdx:71–98`** — renders `varsByTopic` from
  `src/data/cyoda-config-all.json`. Lead-in says the table "is generated from
  the pinned cyoda-go configuration surface" — true only once Part 1 lands.

## Decisions

Settled with Paul on 2026-07-29 before this spec was written:

1. **Scope:** full mirror of the v0.8.2 standard — all 19 issues.
2. **Config seam:** run `cyoda help config all --format=json` against the
   pinned binary during the build, reusing `scripts/lib/cyoda-binary.js`
   (Part 1).

   *Corrected 2026-07-29.* This decision was first taken as "maintainer
   refresh + build-time version guard", on the stated rationale that fetching
   and executing the pinned binary would be a supply-chain escalation beyond
   the `#99` hardening work. **That rationale was factually wrong.**
   `fetch:openapi` and `fetch:schemas` already download and execute the pinned
   binary on every build, through a tested shared helper
   (`parsePinFile` → `ensureBinary` → run) with SHA256SUMS verification and a
   system-binary fast-path. Reusing it is the established repo pattern, not a
   new posture — and it is what the v0.8.2 spec already specified would happen
   at v0.8.3 ("the generator's source changes … to 'run `cyoda help config
   all`', and the tracked source file is retired").

   The corrected approach is strictly better: no manual step, no drift guard
   needed (the version is the pin by construction), and no tracked source file
   to go stale.
3. **Placement:** scheduled transitions extend `workflows-and-processors.mdx`
   in place. Rejected: a dedicated `build/scheduled-transitions.mdx`.
4. **Predicates:** a "Predicate semantics" section on `searching-entities.mdx`
   covering reader-visible rules, with `<FromTheBinary topic="predicates" />`
   for the exhaustive table. Rejected: a `reference/predicates.mdx` page (it
   would compete with the auto-generated `/help/predicates/` mirror).
5. **Delivery:** one PR on `docs/release-v0-8-3`; spec + plan committed under
   `docs/superpowers/`.
6. **Fictional search DSL:** fixed as part of this update.

### Release notes vs. binary help — divergence resolved upstream

The notes originally paired "surfaces a retryable `503`" for an unreachable
compute node with "the entity write still succeeds" two sentences earlier,
reading as though a `503` let the write commit.
`cmd/cyoda/help/content/workflows.md` is explicit that the callout runs
**synchronously inside the entity-write transaction**, so a callout failure
**fails that write**; only the *born-expired* case lets it succeed.

Fixed upstream in cyoda-go `14d2d06` on 2026-07-29, before this spec was
implemented. The notes now match the binary, so guide pages and the
release-notes page agree and no reconciliation is needed. Part 2's fail-closed
wording follows the corrected text.

## Design

### Part 1 — Config pipeline swap-seam

**`scripts/generate-config-data.js` becomes a fetch-style script**, structurally
identical to `fetch-cyoda-openapi.js`:

- `parsePinFile(cyoda-go-version.json)` → `ensureBinary({version, cacheDir,
  fetch, spawnSync, platformHint})` → `runBinaryCommand(binary, ['help',
  'config', 'all', '--format=json'])`.
- `ensureBinary` uses the cached binary, else a system `cyoda` whose
  `--version` matches the pin, else downloads the platform tarball from the
  release and verifies it against `SHA256SUMS`.
- Non-zero exit or non-JSON stdout throws `BinaryExecutionFailed`.
- `run()` gains `--if-missing` support so `predev` skips the work when the
  output already exists, matching steps 1–4.

**`src/data/cyoda-config-all.source.json` is deleted from tracking.** The
tracked source existed only because the binary had no `config all` command; the
version is now the pin by construction, so there is nothing to drift and no
guard is required.

`normalizeConfig()` is unchanged — same validation, same tolerance for empty
`type` and absent `default`, same topic-then-name sort. Its seven existing
tests still pass untouched; two `run()` tests are added with injected
`spawnSync`/`fetch` (happy path writes sorted vars at the pinned version;
non-zero binary exit fails the build).

**Output delta (verified against the v0.8.3 binary):**

| | v0.8.2 source | v0.8.3 binary |
|---|---|---|
| `version` | `dev` | `0.8.3` |
| vars | 80 | 88 |
| topics | 10 | 11 |

Added: `CYODA_SCHEDULER_{ENABLED,SCAN_INTERVAL,BATCH_SIZE,DISTRIBUTION,COORDINATOR,REDISPATCH_BACKOFF,EXPIRY_GRACE}`
and `CYODA_IAM_MOCK_KIND`. New topic: `scheduler`. **Nothing removed.**

**`CLAUDE.md`**: build-pipeline step 5 now describes the binary invocation, and
the "never hand-edit" bullet records that the tracked source file is retired.

### Part 2 — Scheduled transitions → `workflows-and-processors.mdx`

**Transition `Format`** (line 169) gains `schedule`, with an attribute note:
optional; mutually exclusive with `manual: true`; exactly one of `delayMs` /
`function` required when present.

**Replace** the "Scheduled Transition Processors" section (386–409) with
**"Scheduled transitions"**, covering:

- *Static timing* — `schedule.delayMs` (> 0) sets
  `scheduledTime = stateEntryTime + delayMs`; `timeoutMs` (≥ 0, optional) is
  an independent late-tolerance window, not a second delay.
- *Per-entity timing* — `schedule.function` with `name`, `resultKind:
  "Schedule"`, `calculationNodesTags`, `attachEntity` (default `true`),
  `context`, `responseTimeoutMs`. Returns exactly one of `fireAt` /
  `fireAfterMs`, optionally one of `expireAt` / `expireAfterMs` (relative to
  the *resolved fire time*, not arm time).
- *Arming and the settled-interval reset* — armed on **every** write that
  leaves the entity in the source state, including a routine data update or a
  self-loop. Called out as a trap: an entity written more often than its
  scheduled interval never fires, and in function mode makes a callout on each
  such write.
- *Firing* — criterion re-evaluated exactly **once**; `false` declines with no
  retry (`TRANSITION_NOT_MATCH_CRITERION`).
- *Lateness / expiry* — picked up more than `timeoutMs` late ⇒ dropped
  unfired. Born-expired (resolved expiry at or before fire time) ⇒ never armed,
  prior scheduling cancelled, `SCHEDULED_TRANSITION_EXPIRE` recorded, **entity
  write still succeeds**.
- *Fail-closed* — the callout runs inside the entity-write transaction; an
  unreachable/disconnected/timed-out compute node **fails the write**
  (`NO_COMPUTE_MEMBER_FOR_TAG`, `DISPATCH_TIMEOUT`,
  `COMPUTE_MEMBER_DISCONNECTED`, retryable `503`). Malformed or wrong-kind
  result ⇒ `500 SCHEDULE_FUNCTION_INVALID_RESULT`.
- *Audit* — `SCHEDULED_TRANSITION_ARM` / `FIRE` / `EXPIRE` / `CANCEL`; a
  loopback re-arming the same state emits only `ARM`.
- *Not manually fireable* — firing by name returns `400 TRANSITION_NOT_FOUND`;
  add an ordinary manual transition alongside to allow early firing.
- *One-shot vs polling* — the three modelled shapes (unconditional cycle;
  conditional one-shot deadline gate; poll-until-condition via an
  unconditional tick into a state with ordinary conditional exits), and
  `allowCycles: true` on the import body for cyclic scheduled workflows.
- *Operational config* — the seven `CYODA_SCHEDULER_*` vars, cross-linked to
  `/reference/configuration/#vars-scheduler`.

**Schema version** `1.2` → `1.3` at every occurrence (lines 44, 57, 83, 104,
136, 435, 449, 534, 637), with the accepted-range prose updated to `1.1`–`1.3`.

**Operator list** (338): drop the "State Tracking" line; note that
`IS_CHANGED`/`IS_UNCHANGED` are not implemented.

**`attachEntity`** (368): document the default as `true`.

### Part 3 — Search → `searching-entities.mdx`

**Condition DSL correction.** Rewrite the direct example (50–60), the async
example (71–78), the "Filter shape" section (106–126) and the `pointInTime`
example (138–146) onto the real surface: a bare `Condition` body
(`simple` / `lifecycle` / `group` / `array`), `operatorType` (aliases
`operator`, `operation`), `pointInTime` and `limit` as query parameters. Note
the empty-condition rule — `{}` is rejected `400 BAD_REQUEST`; an `AND` group
with an empty `conditions` array is the way to match everything.

**Bounded-or-fail.** Rewrite "Two query modes" (22–44): direct caps the
**matched set**, not the page. Default `limit` 1000 (now genuinely applied on
the pushdown path), maximum 10000, `limit < 1` rejected `400 BAD_REQUEST`. An
oversized matched set returns `400 SEARCH_RESULT_LIMIT`, never a truncated
prefix; an exact match at `limit` succeeds. Add `SCAN_BUDGET_EXHAUSTED`.
Update the decision tree accordingly.

**"Sorting results"** (154–166): keep the grammar; add that ordered top-N over
a large model (`sort` + small `limit`) no longer works on the sync path
because the matched set must fit the limit — that belongs on async, which
snapshots the full set and pages over it.

**New "Predicate semantics"** section with
`<FromTheBinary topic="predicates" />`:

- Same-type comparison — the operand is parse-tested against the field's
  declared type(s); `"30"` and `30` behave identically; no cross-type
  coincidental matching.
- Arbitrary-precision numeric comparison (correct beyond 2^53).
- `LIKE` is a whole-string anchored, case-sensitive glob (`%`, `_`,
  `\`-escape) on every backend.
- Negatives are null-guarded: an absent or `null` leaf never matches any
  binary operator, including `NOT_*` / `INOT_*`. `IS_NULL` / `NOT_NULL` are
  the only presence tests.
- Temporal fields compare chronologically across six subtypes;
  `creationDate` / `lastUpdateTime` accept a coarser operand (`"2024"`,
  `"2024-09"`) that upscales.
- Parse-based validation: `400 CONDITION_TYPE_MISMATCH` when the operand
  parses into none of the declared types; `400 INVALID_FIELD_PATH` for an
  unknown path or a scalar operator against a pure-container path;
  `400 INVALID_CONDITION` for a null operand, a malformed range, or an
  object operand.
- `BETWEEN_INCLUSIVE` is a real inclusive range check (previously fell through
  to regex evaluation on `Searcher`-backed stores).
- `IS_CHANGED`/`IS_UNCHANGED` unsupported.

**`trackingRead`.** New subsection: optional boolean (default `false`) on the
synchronous search endpoints, meaningful only inside an active transaction.
`true` records **returned** entities into the transaction's read-set, so a
concurrent commit touching one aborts at commit (`409`). Entity-level, same as
`GetAll`; no phantom protection either way. Async does not expose it.

**Performance notes** (173–183): tx-aware pushdown — an in-transaction search
no longer falls back to a full `GetAll` scan and is read-your-own-writes
correct against uncommitted writes (memory/sqlite overlay the tx buffer;
postgres runs natively on its own `pgx.Tx`). Note the boolean-condition `500`
fix on postgres.

### Part 4 — Compute nodes → `client-compute-nodes.md`

**Structural change — a new top-level section, with renumbering.** The page's
wire-contract sections are `# 6. Handling Processor Requests` and
`# 7. Handling Criteria Requests`. The Function callout is a peer of those two,
not a sub-case of either, so it lands as a new **`# 8. Handling Function
Requests`** and sections 8–13 shift to 9–14. This is cheap: only five internal
cross-references exist (lines 38, 67, 221, 338, 427, 780 — "Section 8" ×3 →
Section 9, "Section 11" ×2 → Section 12) and `grep -rn "client-compute-nodes/#"
src/content/docs/` returns **no external anchor links** to this page. Section
numbers below are given post-renumber, with names so they stay resolvable.

- **New `# 8. Handling Function Requests`** — the third callout shape beside
  Processor (mutates the entity) and Criterion (returns a bool): returns a
  declared typed value and mutates nothing. Request/response schemas
  (`EntityFunctionCalculationRequest` / `Response`), the `resultKind`
  discriminator, and `Schedule` as the only shape currently defined. Cross-link
  to the scheduled-transitions material in Part 2.
- **§7.2 Response Schema (Criteria)** — criterion `reason` is now live
  end-to-end. A manual explicit transition rejected by its criterion appends
  the reason to the `400 WORKFLOW_FAILED` detail; automated-cascade and
  workflow-selection paths additionally record it durably
  (`TRANSITION_NOT_MATCH_CRITERION` carrying
  `{workflowName, transition, criterion, reason}`; `WORKFLOW_SKIP` carrying
  `{workflowName, reason}`). Capped at 2 KiB; omitted defaults to
  `"criterion did not match"`.
- **§9.1/§9.2 Auth Context** (was §8.1/§8.2) — `authtype` is exactly
  `user` / `service` / `system`, driven by the principal's explicit kind rather
  than sniffed from `ROLE_M2M`. `service_account` retired; `unauthenticated`
  and `unknown` removed. Dispatch **fails closed** on an unset or unrecognised
  kind, so a bogus `authtype` never reaches a compute node. Add a migration
  note for nodes switching on the old string. Knock-on edits to the Java
  snippet (482), the use-cases subsection (509) and the §14 troubleshooting
  row (781).
- **§10.2 Processor Configuration Fields** (was §9.2) — `config.attachEntity`
  defaults to `true`; a processor omitting the field is imported with
  `attachEntity: true`, matching `schedule.function` and the criterion
  `function` callout. Existing workflows that omit it start attaching the
  payload on re-import; set `false` explicitly to opt out.
- **§10.3.1 Transaction-joined callbacks** (was §9.3.1) — tx-join now covers
  the gRPC search RPCs (`EntitySearch` / `EntitySearchCollection`). Previously
  a valid `tx-token` was silently ignored there, so a processor's writes joined
  the originating transaction while its searches ran unjoined against
  last-committed state — stale results, no error.
- **Compute-infrastructure error codes** — `NO_COMPUTE_MEMBER_FOR_TAG`,
  `DISPATCH_TIMEOUT`, `DISPATCH_FORWARD_FAILED`, `COMPUTE_MEMBER_DISCONNECTED`
  surface as retryable `503` uniformly across all three callout kinds
  (previously some fell through to a misleading `400 WORKFLOW_FAILED`).
- **`authctx` helper** — `api/grpc/authctx` exposes `Type`, `ID`, `Roles` and
  `Require(ce, role)`, a fail-closed role gate returning `false` for a nil
  event, absent/empty claims, or `authtype == system`.
- **§5.3 Keep-Alive** — an inbound keep-alive is liveness-only; the server no
  longer echoes it. Brief note that an echoing client previously produced a
  delay-free feedback loop.

### Part 5 — Attribution

**`concepts/authentication-and-identity.md`** — new section separating
attribution from authorization. Principals carry an explicit kind (`user`,
`service`, `system`). A follow-on action — a cascade write, a scheduled fire —
**executes** with system or service authority (nobody is impersonated, no user
permissions borrowed) but is **attributed** to the principal captured
server-side when the follow-on was created: the transaction's origin for a
cascade, propagated unchanged through every joined write including a
cross-node proxied join; the durable `ArmedBy` for a timer fire. Origin is
platform-set only — no request field or worker input can set it.

**`build/working-with-entities.mdx`** — the change-history read
(`GET /entity/{entityId}/changes`) gains `attributedKind` and
`executedBy: {id, kind}` per change. The existing `user` field is unchanged;
rows written before v0.8.3 **omit** both new fields rather than emitting
`null`.

### Part 6 — Consistency sweep

Grep pass for prose the release contradicts, across `reference/api.mdx`,
`concepts/workflows-and-events.md`, `concepts/apis-and-surfaces.md`,
`reference/entity-model-export.mdx` and `build/modeling-entities.md`. Terms:
`service_account`, `scheduled` (processor sense), `1.2` (schema version),
`IS_CHANGED`, `IS_UNCHANGED`, `filter` (search body sense), `limit`,
`previousTransition`.

### Part 7 — Release notes and pin

- `cyoda-go-version.json` → `0.8.3`.
- New `src/content/docs/releases/v0-8-3.mdx`, adapted from
  `~/go-projects/cyoda-light/cyoda-go/docs/release-notes/v0-8-3.md` following
  the v0.8.2 conventions: frontmatter `title` + `description`,
  `sidebar.order: -20260727`, breaking changes lifted into an
  `<Aside type="caution">`, CHANGELOG linked with the `#083` anchor, the
  "Versioning" rationale demoted to a closing footnote so highlights lead,
  `&amp;` escaping in headings.
- `src/content/docs/releases/index.mdx` — new `<LinkCard>` above v0.8.2.

## File-by-file change list

**New:**
- `src/content/docs/releases/v0-8-3.mdx`
- `docs/superpowers/specs/2026-07-29-v0-8-3-docs-update-design.md` (this file)
- `docs/superpowers/plans/2026-07-29-v0-8-3-docs-update.md`

**Modified:**
- `cyoda-go-version.json` — pin `0.8.3`
- `package.json` — `--if-missing` on the `predev` config step
- `CLAUDE.md` — build step 5 + retired-source note
- `scripts/generate-config-data.js` — runs the pinned binary via `ensureBinary`
- `scripts/generate-config-data.test.js` — `run()` tests

**Deleted:**
- `src/data/cyoda-config-all.source.json` — retired; the pinned binary is the
  source
- `src/content/docs/build/workflows-and-processors.mdx` — Parts 2, 6
- `src/content/docs/build/searching-entities.mdx` — Part 3
- `src/content/docs/build/client-compute-nodes.md` — Part 4
- `src/content/docs/concepts/authentication-and-identity.md` — Part 5
- `src/content/docs/build/working-with-entities.mdx` — Part 5
- `src/content/docs/releases/index.mdx` — Part 7
- Any page the Part 6 sweep turns up

## Testing / verification

- `pnpm test` — node:test (including the new drift-guard cases) plus the
  Playwright suites (GDPR, GA, navigators), which must stay green.
- `pnpm build` — full pipeline. Re-pinning to v0.8.3 regenerates the help
  mirror, `reference/schemas/**`, `dist/markdown/`, `llms.txt` and
  `schemas.zip`; the config generator must pass its own guard.
- Negative check: a non-zero binary exit fails `generate:config-data` with
  `BinaryExecutionFailed` (covered by the injected-`spawnSync` test).
- Manual: `/releases/v0-8-3/` renders (Aside, LinkCard, footnote);
  `/reference/configuration/#vars-scheduler` exists and lists seven vars;
  the config tables still scroll horizontally on a narrow viewport without the
  page body overflowing.
- Grep sweep confirms no remaining `service_account`, `"type": "scheduled"`,
  `IS_CHANGED`, schema-`1.2`-as-current, or `{"filter": …}` search-body claim.

## Open questions

None. All six decisions were settled before this spec was written; the one
source divergence (schedule-function failure semantics) is resolved in favour
of the binary, with the release-notes page reproducing the notes as authored.

## Implementation notes (2026-07-29)

Deviations from the design as written, all discovered during implementation:

1. **Config seam reversed** — see the correction under Decisions #2. The
   generator runs the pinned binary via the existing
   `scripts/lib/cyoda-binary.js`; no maintainer command, no drift guard, no
   tracked source file.

2. **`searching-entities.mdx` was wrong beyond the DSL.** The audit found three
   further contract errors that Part 3 also had to fix: async results are
   `GET /api/search/async/{jobId}` (the page said `/results`), cancellation is
   `PUT` (the page said `DELETE`), and direct search returns an
   `application/x-ndjson` stream (the page described a JSON list). The
   `#filter-shape` anchor was renamed to `#the-condition-dsl`, so the
   grouped-statistics cross-reference was repointed.

3. **`client-compute-nodes.md` renumbering went further than planned.** Adding
   `# 8. Handling Function Requests` shifted sections 8–13 to 9–14 as expected,
   but the *subsection* numbers had to be rebuilt too, since the new section's
   `8.x` collided with the auth context's existing `8.x`. Renumbered
   programmatically by order of appearance and all six cross-references fixed.

4. **Keep-alive prose was falsified by v0.8.3.** The page stated that the
   server responds to client-initiated keep-alives with an `EventAckResponse`.
   `TestStreaming_InboundKeepAliveUpdatesLivenessNoEcho` pins the opposite: an
   inbound keep-alive is liveness-only and draws no response. Corrected, with
   the storm rationale, since a node that waits for that ack will hang.

5. **Lifecycle criteria field list was incomplete** (`workflows-and-processors.mdx`).
   It listed three fields; the binary accepts six, with `previousTransition` as
   an alias for `transitionForLatestSave`. Corrected, plus the coarse-operand
   temporal rule.

6. **Predicate-semantics link** from `workflows-and-processors.mdx` initially
   pointed at `/build/searching-entities/#predicate-semantics` before Part 3
   existed; it was temporarily aimed at `/help/predicates/` and now points at
   the real section.

### Verification performed

- `pnpm build` clean at pin 0.8.3; config reference 88 vars / 11 topics.
- `pnpm run test:scripts` — 63/63.
- Playwright `--project=chromium` (the only project CI runs) — 60 passed,
  2 skipped, 0 failed.
- **Site-wide link audit**: every internal href and every `#anchor` across all
  219 built pages resolves — 0 broken. This caught the `#filter-shape` and
  `#predicate-semantics` breakages above.

### Known pre-existing issues, not addressed

- `tests/help-mirror.spec.ts:12` fails under the local-only `Mobile Chrome`
  project: `a[href^="/help/"]`.first() resolves to a sidebar link that is
  collapsed (and so not `visible`) on mobile viewports. Scoping the locator to
  the main content would fix it. Unrelated to v0.8.3 and outside CI's matrix.
- Local `firefox` / `webkit` / `Mobile Safari` projects need
  `pnpm exec playwright install`.
- Astro telemetry cannot write to `~/Library/Preferences/astro` under the local
  sandbox; builds need `ASTRO_TELEMETRY_DISABLED=1`.
