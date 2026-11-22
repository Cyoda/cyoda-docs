# Cyoda-Go v0.9.0 Documentation Update — Proposal

**Date:** 2026-11-22
**Status:** Implemented 2026-11-22 on `docs/release-v0-9-0` (decisions D1–D5
below). `pnpm build` passes (265 pages); `CI=1 pnpm test` passes (node:test
71/71, Playwright 71 passed / 2 skipped); no broken internal links or anchors.
**Scope:** Bring the docs site into line with cyoda-go v0.9.0, pin the site to
v0.9.0, and publish the v0.9.0 release-notes page.

## Background

cyoda-go v0.9.0 was tagged and published **22 November 2026**. Every asset is
present, including `cyoda_help_0.9.0.json` (`gh release view v0.9.0`). The site
is pinned to `0.8.4`.

The release notes say "41 issues delivered"; the v0.9.0 milestone holds 48
closed issues. The difference is the help-content, tracking and
ARCHITECTURE-audit issues (#651, #661, #677, #679–#684), which have no feature
surface of their own. No reconciliation is needed.

v0.9.0 is the largest breaking release to date. Four areas make statements on
the site **false**, not just incomplete:

1. **Access model.** Only M2M clients reach cyoda-go (`ROLE_M2M` on every data
   operation). End users are represented by on-behalf-of clients exchanging a
   user assertion signed with a tenant trusted key. OIDC federation, the
   bootstrap client, `CYODA_OIDC_*`, `CYODA_BOOTSTRAP_*` and `/oauth/token` are
   gone; the token endpoint is `POST /tenants/{tenant}/oauth/token`; the first
   admin token comes from `cyoda token`. Signing keys belong to a platform
   operator (`ROLE_ADMIN` in tenant `PLATFORM`).
2. **Workflows and compute.** Schema 1.5 (`idempotent`, `retryPolicy` on
   `schedule.function`, function conditions in groups) and stricter import;
   callout failover with a repeat rule; callback scopes
   (`TRANSACTION_ROLLBACK_ONLY`, `CALLOUT_SUPERSEDED`, serial callbacks);
   `authid` vs `authexecid`; a fully redesigned scheduler (claims, `FAILED`
   tasks, `GET /scheduled-tasks`, all settings replaced); a controllable
   platform clock for tests.
3. **Reads and conditions.** Writes dated at commit; the consistency time and
   `GET /entity/consistency-time` fence every `pointInTime` read; one version
   per entity per transaction; unique keys at commit; `CONDITION_TYPE_MISMATCH`
   for type-inapplicable operators; `operatorType` required on `array`
   clauses; strict JSON members and strict query parameters.
4. **Operations.** Loopback bind by default, unique `CYODA_NODE_ID`, no rolling
   upgrade, blocking PostgreSQL migrations, +19 PG connections per node, Helm
   chart 0.9.0, cluster status endpoint and node states, long shutdown drain.

### Sources and method

- Release notes: `cyoda-go/docs/release-notes/v0-9-0.md` at `v0.9.0`.
- v0.9.0 help content (`cmd/cyoda/help/content` at the tag) and the full
  v0.8.4→v0.9.0 help diff (117 files, +4892/−1817).
- `api/openapi.yaml`, `docs/cloud-parity/*.md`, `docs/plugins/POSTGRES.md`,
  `CHANGELOG.md`, Helm chart and compose files at the tag.
- The published `cyoda_help_0.9.0.json` and darwin_arm64 binary (both
  checksum-verified), run through the site's own generator validators; the
  getting-started walkthrough executed against a throwaway in-memory v0.9.0
  server.

Per `reference_docs_source_of_truth`, where the release notes and the help
differ, guide pages follow the help (see "Divergences" at the end).

## Goals

1. Site pinned to v0.9.0; release-notes page published and linked; build and
   `pnpm test` green.
2. No page states a v0.8.4 contract that v0.9.0 changed. Every workflow,
   condition and request example imports/runs on v0.9.0.
3. The new access model is explained in one place an application team can
   start from (mirroring `cyoda help auth integration`).
4. Pre-existing falsehoods on pages this release touches are corrected, not
   worked around (same rule as v0.8.4).
5. Guide/reference pages state the current contract only; "before vX…" framing
   moves to the release-notes page.

## Non-goals

- **SPI changes** (ScheduledTaskStore replaced, new required methods,
  `TransactionCoordinationCapable`, `spitest` groups, module path). Release
  notes only.
- **Internal Go module rename** beyond the one place a guide shows an import
  (`authctx` helper on the compute-node page).
- No change to `help/**` or `reference/schemas/**` beyond what re-pinning
  regenerates.
- No description of commercial-backend internals (confidentiality rule).

---

## Resolved decisions (2026-11-22)

- **D1 — Cyoda Cloud.** Cloud will be redesigned from the ground up. Cut the
  whole `cyoda-cloud/` section down to one short page saying that, and that
  information will follow. The section goes from four pages to one.
  `identity-and-entitlements`, `provisioning` and `status-and-roadmap` are
  deleted, with `astro.config.mjs` redirects to `/cyoda-cloud/`, and the two
  existing `/guides/iam-*` redirects are retargeted. Inbound links from other
  pages go. `tests/diagrams.spec.ts:22-39` (the OIDC swimlane) is removed or
  moved to another diagram. This supersedes the D1 options below.
- **D2 — New pages.** N1–N5 agreed, plus the release page.
- **D3 — Tools.**
  - The client templates are a convenience, not a necessity. Their pages say
    so, and note that the templates do not yet use the v0.9.0 token endpoint.
  - The env dashboard gets an upstream issue (draft at
    `scratchpad/env-dashboard-issue.md`; filing needs repo access). Its page
    is corrected: generic OIDC login, not Auth0; not yet compatible with
    JWT-mode v0.9.0; no Cloud framing.
  - `tools/cyoda-skills.mdx` is rebuilt from the redesigned plugin
    (`../cyoda-skills`, branch `feat/cyoda-go-0.9.0`, plugin 0.9.0). Skills:
    `setup`, `auth`, `design`, `build`, `compute`, `test`, `deploy`, `debug`,
    `docs`; versioning follows the cyoda-go line. The plugin reads only
    `/help/**`, `/openapi/openapi.json` and `/llms.txt` from the site, all
    generated, so restructuring pages here breaks nothing in the plugin.
- **D4 — Cloud/commercial wording.** Neutralise it wherever a page is edited.
- **D5 — Cloud mentions outside the Cloud section** (index, run/index,
  run/kubernetes, run/storage-engines, the concepts pages, working-with-entities,
  searching-entities, testing-with-digital-twins, client-compute-nodes,
  reference/index, tools/index, analytics-with-sql, trino).
  - Remove Cloud as a tier or option everywhere. Keep at most one sentence
    linking the placeholder page.
  - Present the commercial storage backends as "commercial backends, contact
    Cyoda", with no Cloud tie and no design detail.
  - Keep `analytics-with-sql` and `reference/trino` as they are, but reframe
    them: Trino support is not yet implemented in cyoda-go. Link
    [cyoda-go#382](https://github.com/Cyoda/cyoda-go/issues/382), which
    implements the `/sql/schema/*` API, and mention #83 for the query-side
    reference.
  - Add to the upstream errata: the `analytics` help topic says "Cloud-only …
    `cloud.cyoda.com`".

## Original decision notes

### D1 — Cyoda Cloud identity page (blocking for `cyoda-cloud/identity-and-entitlements.mdx`)

`cyoda-cloud/index.mdx` says the Cloud data plane is a managed cyoda-go core
with the same surface. The identity page promises OIDC federation, IdP
auto-enrolment, customer-managed signing keys with `audience`, RS512/ES256,
and a browser calling the API with an IdP token — all contradicted by v0.9.0
and by the v0.9.0 cloud-parity contract (`obo-only-user-identity.md`).
Open product questions:

- (a) Does the Cloud data plane use the v0.9.0 access model as-is?
- (b) Is human sign-in a control-plane-only concern (dashboard,
  `cyoda-cloud login`)?
- (c) Is Cyoda the platform operator (holds signing keys), with customers only
  ever tenant admins?
- (d) How does an environment map to a tenant id (needed for the token URL)?
- (e) Is trusted-key registration enabled on managed cores?

**Recommendation:** assume (a)–(c) = yes, and cut the identity half of the
page to ~40 lines: "data-plane access follows cyoda-go — M2M clients and
on-behalf-of; Cyoda operates the signing keys; you register trusted keys for
your user assertions", linking the new Build page. Leave (d) and (e) out until
decided. Entitlements section unchanged. This also drops the OIDC swimlane,
so `tests/diagrams.spec.ts:22-39` moves to another diagram or is removed.

### D2 — New pages (scope)

Candidate new pages, in priority order:

| # | Page | Why | Rec. |
|---|---|---|---|
| N1 | `build/authenticating-applications.mdx` | The release names `cyoda help auth integration` "the place for an application team to start"; concepts page must stay conceptual, reference page must stay endpoint/config. Client templates, compute-node page and Cloud page all need a link target. | **Yes** |
| N2 | `build/scheduled-transitions.mdx` (split out of workflows-and-processors) | v0.9.0 roughly doubles the section (ownership, retry/backoff, `FAILED` reasons, `GET /scheduled-tasks`, settings, shutdown); parent page is already ~1,080 lines. | **Yes** |
| N3 | `build/consistent-reads.mdx` (point-in-time & consistency time) | Headline read change; touches list, get, search, async, delete, stats, history. Clients sending "now" from their own clock start getting `400`. No page explains it. | **Yes** |
| N4 | `run/install.mdx` | New canonical `install` topic (signed installs, deb/rpm, image by digest, `go install`, upgrades); install facts are spread over three pages and partly wrong. | Yes |
| N5 | `run/cluster-operations.mdx` | Node ids, bind addresses, `GET /platform/cluster`, node states, readiness/health, shutdown timing, PG connection budget — applies beyond Kubernetes. | Yes |
| N6 | `build/audit-trail.mdx` | No guide covers the audit API; v0.9.0 changed cursor, identity and `data` shapes. | Optional |
| N7 | `build/callout-reliability.mdx` (failover, idempotency, callbacks) | Shared by workflow authors and compute-node authors; avoids duplicating the repeat rule on two pages. | Optional — can live as sections in N2/compute page |

**Recommendation:** N1–N5 in this update; N6 and N7 as follow-ups (N7's
content goes into the compute-node and workflows pages for now).

### D3 — Tools pages blocked on other repos

- `tools/java-client-template.mdx`, `tools/python-client-template.mdx`: both
  templates still call `{api}/oauth/token` (removed) and have no tenant
  setting — they will not authenticate against a v0.9.0 JWT-mode instance.
- `tools/env-dashboard.mdx`: says Auth0 (already stale: the dashboard moved to
  generic OIDC) and v0.9.0 refuses IdP tokens and browser-held credentials.
- `tools/cyoda-skills.mdx`: skill table is out of date (`/cyoda:app`,
  `/cyoda:migrate`, `/cyoda:status` don't exist; `/cyoda:deploy`,
  `/cyoda:debug`, `/cyoda:design`, `/cyoda:test`, `/cyoda:compute` missing;
  `/cyoda:auth` described as Cloud login).

**Recommendation:** fix the cyoda-skills table now (rebuild from the current
skill list). For the two templates and the env dashboard, add a short
"compatible with cyoda-go ≤ 0.8.4; v0.9.0 support pending" note now, and open
issues on those repos — rather than block this update.

### D4 — Pre-existing Cloud/commercial-backend wording

Found while reviewing, not caused by v0.9.0: `concepts/digital-twins-and-growth-path.mdx:35-38`,
`concepts/what-is-cyoda.mdx:52-54`, `build/searching-entities.mdx:37-40, 627-629`,
`build/working-with-entities.mdx:244-247`, `build/modeling-entities.mdx:243`
("commercial backend returns 422 … until its own support lands"),
`build/client-compute-nodes.mdx:701ff` ("Cyoda Cloud has historically sent…").
These read as the previous Cloud or describe unreleased commercial-backend
state. **Recommendation:** neutralise them in this update where the page is
being edited anyway (use the help's neutral wording, e.g. "a storage backend
that does not support composite keys answers `422
COMPOSITE_KEY_UNSUPPORTED`"); leave the two concepts pages for a separate
Cloud-wording pass unless you want them included.

---

## Part 0 — Re-pin and pipeline

Verified against the real v0.9.0 assets:

- **Works unchanged:** `fetch:help-index` / `generate:help-pages` (same
  envelope, 124 topics; 7 new topics + 17 new error topics appear, `auth/oidc`
  and 14 error topics are pruned by the existing orphan cleanup); all 17
  `<FromTheBinary>` topics still exist; `help openapi json|yaml`,
  `help cloudevents json`, `help config all --format=json` exit 0 and pass the
  validators (106 variables, new `clock` group); CloudEvent schemas 66 → 72
  with a new `platform/` folder, handled by the dynamic generator.
- **Must fix — `tests/content-correctness.spec.ts:42-48`:** bans `` `cyoda serve` ``
  as a "phantom subcommand" and lists subcommands as `--help, init, health,
  migrate`. In v0.9.0 `serve` is real and `token` is new; the release page and
  run pages will fail `pnpm test`. Replace the rule with guards for removed
  things (`CYODA_BOOTSTRAP_`, `CYODA_OIDC_`, bare `/oauth/token`,
  `CYODA_TX_TOKEN_TTL`, removed `CYODA_SCHEDULER_*`), with `releases/**`
  excluded.
- **Should fix — `predev` staleness:** `--if-missing` checks existence, not
  version, so `pnpm dev` keeps v0.8.4 data after the bump. Either compare the
  pinned version to the cached file's version or document a one-time clean.
- **Optional:** `generate-config-data.js` drops the new `required` field
  (`CYODA_POSTGRES_URL`) — keep and render it. `JsonSchemaViewer` renders
  neither `extends` nor `allOf`; v0.9.0 moved 47 event schemas to `allOf`, so
  `BaseEvent` fields still don't show (pre-existing) — could render
  `allOf[$ref]` as an "Extends BaseEvent" link.
- `cyoda-go-version.json` → `0.9.0`.

## Part 1 — Release notes

- **New `releases/v0-9-0.mdx`** adapted from upstream with the established
  conventions: frontmatter title/description, `order: -20261122`, breaking
  changes in a caution Aside, CHANGELOG anchor `#090--2026-11-22`, versioning
  rationale demoted to a footnote, emoji anchor replaced. Add an
  **"Upgrading from v0.8.4" checklist** (stop the cluster; bind addresses;
  unique node ids; migrations and their blocking windows; PG connections;
  Helm values; re-issue credentials via the new token endpoint; re-register
  trusted keys; `cyoda token` instead of bootstrap; declare `idempotent`;
  `operatorType` on array clauses; schedule-function `delayMs` removal;
  `authexecid` in compute nodes; take `pointInTime` from consistency-time).
  The "moving from OIDC / forwarded IdP tokens" material lives here, not on
  guide pages.
- **`releases/index.mdx`:** new v0.9.0 LinkCard at the top.

## Part 2 — Access model

| Page | Verdict | Change |
|---|---|---|
| `concepts/authentication-and-identity.md` | **Rewrite** (~70% replaced, ~120 lines) | Open with the access model (only M2M clients; app authorizes its users; cyoda records the stated user; operator's `cyoda token` the one exception). Three client kinds and the grant each uses; roles (`ROLE_M2M`, `ROLE_ADMIN`, platform operator). On-behalf-of: Basic-auth client + app-signed assertion (`aud` = issuer, ≤300 s), token carries client's roles. Principal kinds and two-part attribution (attributed + executor). Delete the OIDC/external-key-trust section and the "before v0.8.3" paragraph. Keep anchors `#machine-to-machine-credentials` and `#attribution-is-not-authorization` (linked from other pages). |
| `reference/identity-and-iam.mdx` | **Rewrite** (~180 lines) | Delete OIDC section/table. Two authorization tiers (tenant admin vs platform operator). New sections: token endpoint (`/tenants/{tenant}/oauth/token`, Basic only, two grants, 300 s, `429 slow_down`, `503 temporarily_unavailable`, ingress rate-limit advice); first admin token (`cyoda token`). Signing key pairs: operator-only, RS256, no audience, grace ≤3600 s, shared/persisted by the cluster, rotation keeps the env key. Trusted keys: verify only the exchange subject token; per-tenant ids; RSA 2048–4096; no private members; no grace, invalidate has no body. M2M clients: `clientId`, `withAdminRole`, `onBehalfOf`; `409 M2M_CLIENT_EXISTS`, `400 M2M_CLIENT_CAP_REACHED`; correct response JSON (no `client_id_issued_at`). Id grammars (tenant, client, user; reserved `SYSTEM`/`system`). Config table: drop `CYODA_OIDC_ROLES_CLAIM`, add `CYODA_IAM_MODE`, `CYODA_IAM_MOCK_KIND`, `CYODA_JWT_ISSUER`, `CYODA_JWT_EXPIRY_SECONDS`, client cap, token rate. Drop the "Defaults changed in v0.8.1" aside. Add `<FromTheBinary topic="auth" />`. |
| `cyoda-cloud/identity-and-entitlements.mdx` | **Substantial edit**, per D1 | Identity half ~190 → ~40–60 lines; entitlements unchanged. |
| `cyoda-cloud/provisioning.mdx` | Small edit | `member token mint` hands a compute node a token; v0.9.0 needs a plain M2M client's own credentials → "M2M client credentials for a compute node"; login is control-plane identity. Command naming is a product call. |
| `cyoda-cloud/index.mdx`, `status-and-roadmap.md` | Optional one sentence / none | |
| `concepts/apis-and-surfaces.md` | Small edit (~5 sentences) | REST is for your backend/jobs/admin tooling, not a front-end; every data op needs a cyoda-signed token with `ROLE_M2M`; compute nodes need their own M2M client (the "platform brokers credentials" claim is false); callouts carry `authid`/`authexecid`. |
| `reference/cli.mdx` | Small–substantial edit (~20 lines) | Actual commands: `serve`, `init`, `health`, `migrate`, `token`, `help`; unknown argument exits 2; no server flags; dotted ids (`cyoda help auth.tokens`); `auto` format; replace examples `cyoda help search async` / `grpc compute` (exit 2). |
| `build/analytics-with-sql.mdx:49-51`, `reference/trino.mdx:20-21` | Tiny edit | "technical user / OAuth client credentials" → M2M client + tenant-scoped token endpoint. |
| **N1** `build/authenticating-applications.mdx` | **New** (~150–200 lines) | From `cyoda help auth integration`: four parts of an application (backend on an on-behalf-of client, jobs on plain clients, compute nodes on a plain client each, tenant admin); steps 1–6 with one exchange example; token caching/renewal; reading `authid`/`authexecid` and separation of duties; rotation; local recipe (mock mode cannot exercise on-behalf-of). Link `/help/auth/integration/` for full curl/error tables. Optionally redraw the scenario diagrams from `docs/access-to-the-cyoda-api.html` with `SequenceFlow`. |

## Part 3 — Workflows, compute nodes, scheduler, clock

**Examples that fail on v0.9.0** (fix all):
`getting-started/install-and-first-entity.mdx:107` and
`build/client-compute-nodes.mdx:723` (`"version": "1"` →
`WORKFLOW_SCHEMA_VERSION_UNSUPPORTED`, pre-existing);
`build/workflows-and-processors.mdx:593-597` (array criterion without
`operatorType` → `400 VALIDATION_FAILED`); `:424-429` (`REPLACE` with
`"workflows": []` → `400`, pre-existing). All `"1.4"` examples still import
but move to `"1.5"`.

| Page | Verdict | Change |
|---|---|---|
| `build/workflows-and-processors.mdx` | **Substantial edit** (~350–450 lines; less once N2 takes the scheduler) | Schema 1.5 (range 1.1–1.5; refusals apply under any declared version). Rewrite "Strict validation" as current rules (strict body, `manual` required, processor `type`, no `delayMs` beside `function`, `retryPolicy` NONE/FIXED, `responseTimeoutMs` ≤ max, operand rules, 10,000 entries/depth 50, `MODEL_ADMIN_IN_JOINED_TRANSACTION`, retryable `409` racing the scheduler, export not re-importable unchanged). Processors: `config.idempotent`, tries and time limit (155 s at defaults), repeat rule, what each mode leaves behind on failure, `TRANSACTION_ROLLBACK_ONLY`, client-visible codes incl. `CALLOUT_FAILED`, rule "a callout never writes its own entity". **Pre-existing fixes:** empty `executionMode` = `SYNC` (not `ASYNC_NEW_TX`); `ASYNC_SAME_TX` blocks inline; `ASYNC_NEW_TX` is a savepoint in the same tx; `COMMIT_BEFORE_DISPATCH` missing; `asyncResult`/`crossoverToAsyncMs` are refused. Criteria: function conditions in groups (declaration order, short-circuit, pre-check now evaluated and local-only), `matches` required, `success:false` fails the operation, type-mismatch fails the save with `WORKFLOW_FAILED`, `operatorType` on arrays. `manual` vs what a client can name; available-transitions list. Tags: any-overlap, empty = all, round robin. Best practices: `COMMIT_BEFORE_DISPATCH` for slow external work; link `/help/design/`. Scheduled-transitions section moves to N2 (leave a summary + link). |
| `build/client-compute-nodes.mdx` | **Rewrite** (keep structure; ~50–60% changes) | Token: own `client_credentials` token from `/tenants/{t}/oauth/token` with `ROLE_M2M`; OBO token or `cyoda token` → `PermissionDenied`; stream closes within 60 s of client delete/reset; mock needs `MOCK_KIND=service` (default). Port/plaintext/loopback. Tags are any-overlap (not superset; pre-existing). Answer semantics: omitted `success` = success, `error` without `success:false` is a success, `null`/wrong-case/undeclared members → `400 WORKFLOW_FAILED`; `success:false` never tried elsewhere, `retryable` passes to the client; criteria `matches` required. Error table: `CALLOUT_FAILED`, `WORKFLOW_FAILED`, `TRANSACTION_ROLLBACK_ONLY`, `NO_COMPUTE_MEMBER_FOR_TAG` after `CYODA_DISPATCH_WAIT_TIMEOUT`. §9 identity: `authid`/`authtype` = attributed, `authexecid`/`authexectype` = executor, `authclaims` = executor roles; per-path table (OBO, write-back, scheduled fire with executor `system`); `authctx` helper fields and `github.com/cyoda/...` path; drop the `ROLE_USER,ROLE_SUPER_USER` example and the Cloud `legalEntityId` note. §10 callbacks: token per try, `CYODA_TX_TOKEN_TTL` → `CYODA_CALLOUT_PASS_ALLOWANCE`, all-or-nothing scopes, `410 CALLOUT_SUPERSEDED`, serial callbacks + `503 TRANSACTION_BUSY`, `TOO_MANY_JOINED_REQUESTS`, `JOINED_RESPONSE_TOO_LARGE`, `COMMIT_IN_JOINED_TRANSACTION`, `transactionWindow` refused, callback read sees the workflow's entity. Retries are tries, not delays; `requestId` shared across one callout's tries only; schedule functions may run twice, use the CloudEvent `time` (platform clock). Pre-existing: `EventAckResponse` direction in table/diagram; `PROCESSOR` target row. Troubleshooting table: drop Cloud-isms, add `PermissionDenied`, `Unauthenticated` after reset, loopback refusal, `CALLOUT_SUPERSEDED`, `TRANSACTION_BUSY`. |
| **N2** `build/scheduled-transitions.mdx` | **New** (split + extend) | Existing section content corrected (task removed by the re-binding write, `SCHEDULED_TRANSITION_CANCEL`; `timeoutMs` deadline semantics; `schedule.function` `retryPolicy`, timeout default/bound, repeat-safe; invalid-result `500`; full failure codes) plus: one owner per run (claims, heartbeats, `STALE_AFTER`), one task per entity, retry backoff 30 s→15 m, `FAILED` with reasons, how a `FAILED` task ends, retryable `409` for racing writes, `GET /scheduled-tasks`, `SCHEDULED_TRANSITION_FAIL`, attribution (`authid` = armer, executor `system`), settings table (new set; removed ones not mentioned), shutdown drain/390 s grace. |
| `concepts/workflows-and-events.md` | Small–substantial edit (~30 lines) | Scheduled transitions as a third trigger; internal processors don't exist (`externalized` only); execution modes corrected incl. `COMMIT_BEFORE_DISPATCH`; one paragraph on the repeat rule and "never write your own entity"; audit overclaim on processor I/O. |
| `build/testing-with-digital-twins.md` | Small edit + **new section "Controlling time"** (~50 lines) | `CYODA_CLOCK_CONTROL_ENABLED`, `POST /platform/clock` (`time` on a fresh store, `advanceByMs`, `rate`), assert via `GET /scheduled-tasks` and audit, error codes, platform-operator only, not for production. Test tips: `CYODA_DISPATCH_WAIT_TIMEOUT=0`, `MOCK_KIND=service`, bind `0.0.0.0` for containerised compute nodes. Qualify "deterministic". |
| `build/edge-messages.mdx` | Small edit (~10 lines) | Attribution from the token (no `X-User-ID`), `ROLE_M2M`, a message saved under a tx token is not part of that tx; idempotent saves from processors. |
| `concepts/design-principles.mdx` | Small edit | Stale "(Coming…)" link; link `/help/design/`. |
| `tools/workflow-editor.mdx` | None / one-line note | Editor targets 1.4; note 1.5 fields if the published package doesn't model them. |

## Part 4 — Entities, reads, search, models

| Page | Verdict | Change |
|---|---|---|
| `build/searching-entities.mdx` | **Substantial edit** (~130 lines + link to N3) | Array example refused → help example with `operatorType`; array rules. `operatorType` written once. `{}`/no `type` → `INVALID_CONDITION`. **Delete** "no operator-versus-type rejection" (now `CONDITION_TYPE_MISMATCH`); rewrite type-applicability bullet (string/pattern need text; boolean/UUID equality only; dates use range/ordering). Rewrite `INVALID_CONDITION` list. Add the fixed check order. Async: drop `NOT_FOUND` status, add `failureReason`, `expirationDate` = finish + `CYODA_SEARCH_SNAPSHOT_TTL`, default instant = fresh consistency time. Historical reads → N3. Stats: GET stats honour `pointInTime`; **pre-existing** wrong `groupKey`/alias in the example. Remove history framing (`limit=0` "once", "as of v0.8.3"). PG point-in-time cost note. |
| `build/working-with-entities.mdx` | **Substantial edit** (~80 changed + ~40 new) | **Pre-existing:** "first post discovers the schema" (create needs a LOCKED model); create response shape; named-transition example body. New: dates assigned at commit, data must be a JSON object; list paging params + consistent-paging recipe; `?transactionId=` reads committed only; concurrency block (`If-Match` checked once, empty → `428`, lost race → retryable `409`); conditional delete (`QueryConditionDto`, atomic, 10 MiB, `409`); `DELETE /entity/{id}` takes no `pointInTime` (undeclared → `400`); batched delete semantics; change history one entry per transaction; request rules (strict members/params, `Cyoda-Warning`). Remove history framing. |
| `build/modeling-entities.mdx` | Small–moderate edit (~25 lines) | Schema extension commits on its own; unique keys at commit (`uniqueKeys` required, `[]` removes); entity model fixed for the life of its id; data is a JSON object; D4 wording on `COMPOSITE_KEY_UNSUPPORTED`. |
| `concepts/entities-and-lifecycle.md` | Small edit (~12 lines) | One revision per entity per transaction (not per transition); discovery is by sample import before lock; revisions dated at commit; point-in-time bounded by consistency time → N3. |
| `reference/api.mdx` | Small edit (~12 lines) | "Contract rules": grows by addition only (ignore unknown fields/discriminators), discriminator mappings, `QueryConditionDto`, strict members/params, `Cyoda-Warning`, `ProblemDetail.ticket`. |
| `reference/entity-model-export.mdx` | **No change** | Export format unchanged (exporter diff is only the module path). |
| **N3** `build/consistent-reads.mdx` | **New** (~120 lines) | Commit-instant dating; consistency time and its guarantees; `GET /entity/consistency-time`; `400 POINT_IN_TIME_AFTER_CONSISTENCY_TIME` / `503 CONSISTENCY_TIME_UNAVAILABLE`; RFC 3339 strictness; consistent paging recipe; async default instant; reads inside a transaction; one version per transaction; `?transactionId=`. |
| N6 `build/audit-trail.mdx` | Optional new | Cursor = sort key (old cursors `400`), `version`/`eventId`, `actor.kind`, `executedBy`, typed `data` per event, `SCHEDULED_TRANSITION_FAIL`. |

## Part 5 — Getting started, run, reference

| Page | Verdict | Change |
|---|---|---|
| `getting-started/install-and-first-entity.mdx` | **Rewrite hands-on half** (~80 of 205 lines) | Walkthrough fails on v0.9.0 at every step (mostly pre-existing). Tested working order: sample import → workflow import (`"1.5"`) → lock → create → transition via `PATCH` merge-patch with `If-Match` (or `PUT` with full data). History at `/entity/{id}/changes`. Install: `cyoda init` after brew; signed installs; `<FromTheBinary topic="install" />` → N4. Mock principal (`mock-tenant`, kind `service`, `ROLE_ADMIN,ROLE_M2M`); JWT-mode first token via `cyoda token`; loopback on 127.0.0.1:8080; `cyoda serve` equivalent. |
| `run/desktop.mdx` | Substantial edit (~25 lines) | Packaged installers don't all run `cyoda init`; loopback + bind vars + admin port; no CLI flags; upgrade = same route, read release notes. |
| `run/docker.mdx` | Substantial edit (~40 lines) | All three bind addresses `0.0.0.0` in a container; bundled compose is SQLite + mock (PostgreSQL only in the observability example; pre-existing); image `ghcr.io/cyoda/cyoda`, signed, run by digest; first admin token via `compose exec … /cyoda token`; admin endpoints need platform operator; `/readyz` on shutdown; gRPC health check. |
| `run/kubernetes.mdx` | **Rewrite** (~100 of 155 lines) | Chart objects (StatefulSet, headless gossip Service, migration Job, NetworkPolicy, PDB, Gateway routes); repo URL; `gateway.parentRefs` required; first admin token via `kubectl exec … /cyoda token`; `CYODA_NODE_ID` from pod name; 390 s grace; `GET /platform/cluster?waitForNodes=N`; PG connections per node. **Remove** rolling/blue-green/canary claims (unsafe; no rolling upgrade in 0.9.0) — state "rolling only when release notes allow; else scale to 0 and upgrade". Pre-existing: SERIALIZABLE → REPEATABLE READ + commit-time validation; no quorum; no Prometheus annotation (ServiceMonitor + metrics bearer). |
| `run/storage-engines.mdx` | Substantial edit (~30 lines) | Migration caution → PG 000011–000018 (000011–000013 block writers, 000011 briefly readers; 000014 locks `scheduled_tasks`), SQLite 000008–000014; `responseTimeoutMs` capped to fit idle-in-tx ceiling; scheduler/model pools and connection budget; `pool` metric label; commit-dated writes, one version per tx, unique keys at commit, atomic conditional delete, consistency time. |
| **N4** `run/install.mdx` | **New** (~120 lines) | Mirrors `cyoda help install`: install script with signature verification, deb/rpm, Homebrew, image by digest, Windows, `go install` (Go 1.27.4), upgrades. |
| **N5** `run/cluster-operations.mdx` | **New** (~150 lines) | Node ids (unique, 406-byte identity limit), bind addresses, `GET /platform/cluster`, node states, readiness/health, shutdown timing, HMAC rotation needs a full stop, PG connection budget, upgrade rule. |
| `reference/configuration.mdx` | Small edit (~10 lines) | Config file locations per OS; `_FILE` list without bootstrap secret; loopback binding; startup refuses bad values. Table regenerates itself. |
| `reference/helm.mdx` | Substantial edit (~25 lines) | Chart objects; values are few (`logLevel`, `jwt.issuer`, `jwt.expirySeconds`) + `extraEnv`; `jwt.expirySeconds` 300 (1–3600); 390 s grace; `gateway.parentRefs`; `bootstrap.*` gone (silently ignored). |
| `help/index.mdx` | Small edit | Manifest is a slimmed copy, live path `/api/help`; dotted ids. Topic cards regenerate. |
| `help/topic-tree.mdx` | Small edit | `cyoda help search async` example exits 2 → replace; dotted-id and `<topic> <action>` forms. |
| `reference/index.mdx`, `run/index.mdx`, `index.mdx`, `concepts/what-is-cyoda.mdx` | None (D4 aside) | |

## Part 6 — Tools

Per D3: `tools/cyoda-skills.mdx` rebuilt from the current skill list;
`java-client-template.mdx`, `python-client-template.mdx`, `env-dashboard.mdx`
get a compatibility note pending upstream changes; `dev-console.mdx`,
`workflow-editor.mdx`, `tools/index.mdx` unchanged.

---

## Size summary

| Verdict | Pages |
|---|---|
| Rewrite | authentication-and-identity, identity-and-iam, client-compute-nodes, kubernetes, getting-started (hands-on half) |
| Substantial edit | workflows-and-processors, searching-entities, working-with-entities, cyoda-cloud/identity-and-entitlements (D1), desktop, docker, storage-engines, helm, cli |
| Small edit | concepts/workflows-and-events, entities-and-lifecycle, apis-and-surfaces, modeling-entities, testing-with-digital-twins (+ section), edge-messages, design-principles, api, configuration, help/index, help/topic-tree, provisioning, analytics-with-sql, trino, tools (4) |
| New | releases/v0-9-0, N1 authenticating-applications, N2 scheduled-transitions, N3 consistent-reads, N4 install, N5 cluster-operations (N6, N7 optional) |
| No change | entity-model-export, reference/index, run/index, index, what-is-cyoda, cyoda-cloud/index, status-and-roadmap, dev-console, workflow-editor |

Roughly 30 existing pages touched plus 6 new pages — larger than the v0.8.4
update (17 files).

## Divergences: release notes vs v0.9.0 help

Guide pages follow the help; the release page reproduces the notes.

1. **Scheduled-task deadline.** Notes: a failing run retries until
   `timeoutMs` passes, then `FAILED`. Help: a task never attempted and first
   claimed after its deadline is **expired** (`SCHEDULED_TRANSITION_EXPIRE`);
   only a task with a failed attempt ends `FAILED`
   (`EXPIRED_AFTER_FAILED_ATTEMPTS`).
2. **`startNewTxOnDispatch` inside `config`** is listed among import refusals
   without a code; under the strict-body rule it is `400 BAD_REQUEST`, not
   `VALIDATION_FAILED`.
3. **Schema 1.5 gating.** Notes imply the new constructs come with 1.5; the
   schema-version topic says the rules apply under any declared version. Docs
   should not imply a bump is required (skimmed, not fully traced).
4. **Condition check order.** Notes: unknown model is `404` before the
   condition is checked. Help: body parse first (`INVALID_CONDITION`), then
   `404`, then structure. Follow the help.
5. **Conditional delete "empty body".** Help says "absent or empty"; CHANGELOG
   and notes: zero-length or JSON white space only. Use the stricter wording.
6. **Conditional delete races.** Notes say a lost race is retried internally;
   also that the request can answer retryable `409`. Document both.
7. **Trusted keys must be re-registered** (help) — not in the notes' breaking
   list. Nor is "trusted-key JWTs are no longer accepted as bearer tokens", nor
   the bootstrap key losing its 365-day expiry/WARN.
8. **`CYODA_OIDC_*` / `CYODA_BOOTSTRAP_*` "removed"** (notes) vs **silently
   ignored** (help). Operators should not expect a startup error.
9. **`ROLE_M2M` exceptions.** Notes omit the endpoints that take no bearer at
   all (token endpoint, JWKS, `/api/health`); the help lists them. Minor
   internal help inconsistency: in mock mode the token endpoint checks
   `ROLE_M2M` first.
10. **Bind addresses.** Notes name HTTP and gRPC; help and compose also set
    `CYODA_ADMIN_BIND_ADDRESS`. Docs name all three.
11. **PG migration 000011** also blocks readers briefly (POSTGRES.md).
12. **`clock` topic** is summarised as "content pending" in the help index but
    has full content; notes present it as shipped.

Items 7–8 and 10–11 are worth raising upstream as release-note errata.

### Upstream errata found while verifying against the v0.9.0 binary

Pages follow the observed server behaviour; these belong in the cyoda-go help
or code.

13. `If-Match: "<transactionId>"` (quoted, as `cyoda help crud` writes it)
    answers `412 ENTITY_MODIFIED` on PUT and PATCH even when nothing changed;
    only the bare id works. `PUT` with `If-Match: *` is also `412`.
14. An empty `CYODA_JWT_ISSUER` or out-of-range `CYODA_JWT_EXPIRY_SECONDS`
    makes `cyoda serve` panic (exit 2); `cli serve` help says config failures
    exit 1 with a `startup failure` line (true for `CYODA_IAM_MODE`).
15. The default `CYODA_NODE_ADDR` (`http://localhost:8080`) is unusable in
    cluster mode: peers refuse to forward to a loopback/link-local address,
    and such a node is listed DOWN. Help mentions the guard only in passing.
16. PostgreSQL migration `000014` blocks `scheduled_tasks` readers and writers
    for the whole rewrite and five index builds (POSTGRES.md), not "briefly"
    as the notes say.
17. The default-workflow fallback warning arrives as a `Cyoda-Warning` header;
    `cyoda help workflows` ("Engine execution") says response body.
18. `GET /entity/{id}?pointInTime=` does not return `meta.pointInTime`; the
    list read does. Consistency time on the memory backend has microsecond,
    not nanosecond, precision; `/scheduled-tasks` returns milliseconds where
    the help example shows nanoseconds.
19. `cyoda help cli help` says actions take no `--format`, but
    `cyoda help config all --format=json` honours it (and this site relies on
    it).
20. Trusted-key register response gives `validFrom`/`validTo` in the server's
    local offset; the list gives UTC.
21. `cyoda help grpc` says the client echoes keep-alives; the server treats
    inbound keep-alives as liveness only and never answers.
22. The `analytics` help topic says "Cloud-only … `cloud.cyoda.com`".
23. The `cyoda help` index summarises `clock` as "content pending" although
    the topic is complete.

### Implementation notes

- `scripts/generate-schema-pages.js` now escapes `<`, `{`, `}` in schema prose
  for MDX: a v0.9.0 CloudEvent description contains `[ticket: <uuid>]`, which
  broke the build.
- `tests/content-correctness.spec.ts`: the phantom-`cyoda serve` rule is gone;
  new guards for removed settings and the untenanted `/oauth/token`, not
  applied to `releases/**`.
- Follow-ups done in the same branch:
  - `--if-missing` (the `predev` fast path) now checks that generated data
    matches the pinned version, via `scripts/lib/pinned-output.js`. The help
    files are checked against `pinnedVersion`, OpenAPI against `info.version`,
    the config data against `version`, and `src/schemas/` against a
    `.pinned-version` stamp. Previously a re-pin left `pnpm dev` serving the
    old release.
  - The configuration table shows **required** for variables the binary flags
    as required (`CYODA_POSTGRES_URL`).
  - Schema pages resolve `allOf: [{ $ref }]`. Every event page now shows the
    fields it inherits from `BaseEvent`, in both the viewer and the static
    list (new `tests/schema-pages.spec.ts`).
  - `SequenceFlow` now draws the on-behalf-of exchange on
    `/build/authenticating-applications/`, and its swimlane tests point
    there. `StepFlow.astro` had no users and is deleted.
- Env-dashboard issue filed upstream (2026-11-22).

## Verification plan

- Re-capture every changed request/response example against a local v0.9.0
  server (memory backend; mock IAM for data examples, JWT mode for the
  auth/token examples, including one full on-behalf-of exchange).
- Import every workflow example on the site against v0.9.0.
- `pnpm build` (full pipeline) and `CI=1 pnpm test`, with
  `ASTRO_TELEMETRY_DISABLED=1`.
- Grep guard (the replacement content-correctness rule) for removed variables
  and endpoints outside `releases/**`.

## Delivery

One branch `docs/release-v0-9-0`, one PR, with commits staged as: (1) re-pin +
test fix + release page; (2) access model + N1; (3) workflows/compute + N2 +
clock; (4) reads/search + N3; (5) run/reference + N4 + N5; (6) tools.
