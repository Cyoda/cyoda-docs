# pnpm Migration + Supply-Chain Hardening — Design

**Date:** 2026-06-24
**Status:** Approved (design); pending implementation plan
**Scope:** Migrate `cyoda-docs` from npm to pnpm and establish a robust posture against supply-chain attacks (malicious package versions, compromised maintainer accounts, CI/runner compromise, unpinned action/tooling fetches).

## Goals

1. Replace npm with pnpm 10 as the package manager, with a reproducible, locked, verifiable install.
2. Reduce the supply-chain attack surface across three layers:
   - **Dependency resolution** — block lifecycle scripts by default, delay freshly-published versions, freeze the lockfile.
   - **CI/CD** — pin GitHub Actions to commit SHAs, monitor runner egress, remove unpinned/global tool fetches.
   - **Process** — non-blocking scheduled audit, Dependabot aligned to the same cooldown.

## Non-goals

- No rewrite of historical records under `docs/superpowers/plans|specs/` or `.ai/plans/` (archival; left as-is).
- No change to application/runtime behavior of the site itself.
- No move to `block` egress policy in this change (audit mode first; tighten later).
- No blocking audit gate on PRs/deploys (explicitly chosen non-blocking).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Scope | Comprehensive hardening |
| Cooldown (`minimum-release-age`) | **7 days** (`10080` minutes) |
| Audit gate | Separate **scheduled, non-blocking** workflow |
| Runner hardening | `step-security/harden-runner` in **audit** mode |
| Node version | Pin **22** (matches current CI; ends 25-vs-22 local drift) |
| `surge` tooling | `pnpm dlx surge@<exact>` (deploy-only, version-pinned; not lockfile-locked) |

## Current state (verified 2026-06-24)

- npm + `package-lock.json` (~565 KB). `devDependencies` is **empty** — all build/test/runtime deps live in `dependencies`, so the existing `npm ci --omit=dev` installs everything (the `--omit=dev` is effectively a no-op).
- `package.json` uses npm `overrides` (`lodash`, `@astrojs/sitemap`).
- Packages with install (lifecycle) scripts, per the lockfile: **3 distinct packages — `esbuild`, `sharp`, `fsevents`** (`fsevents` appears twice in the tree: top-level and under `vite`). Playwright fetches browsers via its explicit `playwright install` command, not a lifecycle script.
- `playwright.config.js` runs commands at test time via Playwright's `webServer`: `npx serve dist -l 4321` (CI, line 86) and `npm run dev` (local, line 92). These are **functional**, not comments — `npm test` drives Playwright on the CI/deploy/preview path.
- 4 workflows (`ci`, `deploy`, `preview-deploy`, `cleanup-preview`), all on npm: `npm ci --omit=dev`, `actions/setup-node` `cache: 'npm'`, `npx playwright install`, and **global installs** `npm install -g serve` / `npm install -g surge`.
- Actions referenced by **tag** (`@v6`, `@v5`), not SHA.
- Dependabot configured for `npm` + `github-actions`. No Node version pin file; no `packageManager` field.
- Local: pnpm 9.15.9 and corepack 0.34.6 available (pnpm 10 will be installed/pinned).

## Design

### 1. Package manager migration

- Add `packageManager: "pnpm@10.18.2+sha512.<hash>"` to `package.json` — an **exact** version (resolve the latest stable 10.x at implementation time; not `10.x.x`) with integrity hash, so corepack verifies the pnpm binary. corepack errors on a non-exact version or invalid hash. Single source of truth for local + CI.
- Generate `pnpm-lock.yaml`: `pnpm import` (carry over resolutions from `package-lock.json`), then a clean `pnpm install` to materialize. Delete `package-lock.json`.
- Move npm `overrides` → `pnpm.overrides` in `package.json`.
- Rewrite `package.json` scripts: `npm run X` → `pnpm run X`; `npx Y` → `pnpm exec Y` (locked tools) or `pnpm dlx Y@<exact>` (one-off pinned tools).
- Pin Node: add `.node-version` = `22` and `engines.node` (e.g. `">=22 <23"`). Workflows use `node-version-file: .node-version`. Note: the author's local Node is 25, which violates this range — pnpm only *warns* unless `engine-strict=true`. Leave `engine-strict` unset (warn-only) so local 25 still works; the pin governs CI reproducibility.
- `predev` and the per-script generators invoke `node scripts/...` directly (bare `node`, no npm/npx) — unaffected by the migration; no change needed.

### 2. pnpm supply-chain config

- **`.npmrc`** (repo root):
  - `minimum-release-age=10080` — 7-day cooldown; pnpm refuses to install a version published less than 7 days ago.
- **`package.json` → `pnpm` field**:
  - `onlyBuiltDependencies: ["esbuild", "sharp", "fsevents"]` — only these may run install scripts; pnpm 10 blocks all others by default.
  - `overrides: { "lodash": "^4.17.21", "@astrojs/sitemap": "~3.6.0" }` (moved from npm `overrides`).

### 3. Remove unpinned / global fetches from CI

- `npm install -g serve` → add **`serve` as a pinned `devDependency`**; invoke via `pnpm exec serve`. Now lockfile-locked and cooldown-protected.
- `npm install -g surge` (preview + cleanup) → `pnpm dlx surge@<exact-version>`. Deploy-only, off the production/test path; version-pinned. (Accepted residual: not lockfile-locked, to keep the minimal `cleanup-preview` job lightweight.)
- `npx playwright install` → `pnpm exec playwright install --with-deps chromium`.
- **`playwright.config.js` (functional, not a comment)**: line 86 `npx serve dist -l 4321` → `pnpm exec serve dist -l 4321`; line 92 `npm run dev` → `pnpm run dev`. Must land in the **same commit** that removes the global `serve` install, or the first PR exercising `ci.yml` fails at the test step (`npm test` drives Playwright's `webServer`).
- `perf:audit` / `perf:check` scripts (developer-local, not CI): `npx serve` → `pnpm exec serve` (now a locked devDependency — no stray `npx`); `npx lighthouse` → `pnpm dlx lighthouse@<exact>` (accepted unpinned-but-version-locked fetch, like surge; local-only).

### 4. SHA-pin all GitHub Actions

Pin every `uses:` to a full 40-char commit SHA with a trailing `# vX.Y.Z` comment, in all 4 workflows:
`actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`, plus new `pnpm/action-setup` and `step-security/harden-runner`.
Dependabot's `github-actions` ecosystem keeps the pinned SHAs updated (it understands SHA + version-comment pins).

### 5. CI runner egress hardening

Add `step-security/harden-runner@<sha>` with `egress-policy: audit` as the **first step of every job** (including `cleanup-preview`). Audit mode is **observe-only** — this change adds egress *observability*, not *enforcement* (the net-new protection in this PR is the baseline, not blocking). Concrete follow-up: after one week of audit data, open a PR flipping to `egress-policy: block` with an `allowed-endpoints` list covering the npm registry, the pnpm download host, the Playwright browser CDN, GitHub, and `surge.surge.sh` — verify each appears in the audit baseline first.

### 6. Workflow install pattern

Per job: `harden-runner` → `pnpm/action-setup` (**v4+**, with no `version:` input so it reads `packageManager`; older majors ignore that field) → `actions/setup-node` (`node-version-file: .node-version`, `cache: 'pnpm'`) → `pnpm install --frozen-lockfile`. Replaces `npm ci --omit=dev`. `pnpm/action-setup` must precede `setup-node` so the pnpm cache key resolves.

### 7. Non-blocking audit + Dependabot cooldown

- New `.github/workflows/audit.yml`: weekly `schedule` (cron) + `workflow_dispatch`, `permissions: { contents: read }`. Runs `pnpm audit`, writes the report to the job summary, **non-blocking** (`|| true` / no gating). First step is `harden-runner` (audit). No auto-issue creation (avoids adding another third-party action + `issues: write`; can be added later).
- Add a `cooldown` block to the existing npm update entry in `.github/dependabot.yml` using the real schema — `cooldown: { default-days: 7 }` — so Dependabot doesn't propose versions younger than 7 days. This is a **separate mechanism** from pnpm's `minimum-release-age` and must be kept in sync manually.
- **Keep `package-ecosystem: "npm"`** in `dependabot.yml` — there is no `pnpm` ecosystem; the `npm` ecosystem reads `pnpm-lock.yaml`. Do not change it.

### 8. Docs

Update **live** docs only — leave archival `docs/superpowers/plans|specs/` and `.ai/plans/` untouched:
- `CLAUDE.md` — all `npm run …` → `pnpm …`, build-pipeline command list, and a short note on the pnpm/supply-chain config (cooldown, install-script allowlist, SHA pins).
- `README.md`, `docs/SCHEMAS_IMPLEMENTATION.md`, `docs/TESTING_INTEGRATION.md`, `PERFORMANCE_REPORT.md` — swap `npm`/`npx` invocations for `pnpm` equivalents where they're live instructions. (`playwright.config.js` is a functional rewrite, handled in §3 — not a docs edit.)

### 9. Verification

1. Local: clean `pnpm install` (no errors, no unexpected build-script prompts beyond the allowlist), `pnpm run build` produces `dist/`, `pnpm test` green.
2. Confirm `pnpm-lock.yaml` committed and `package-lock.json` removed.
3. Confirm `pnpm install --frozen-lockfile` succeeds (lockfile in sync).
4. Open a PR to exercise `ci.yml` under pnpm + harden-runner (audit) before relying on the deploy/preview paths.
5. Sanity-check harden-runner audit output for unexpected egress.

## Risks & mitigations

- **Phantom dependencies under pnpm's strict `node_modules`** — *the most likely cause of a failed first build.* pnpm uses a symlinked, non-hoisted layout; any module that relied on npm's flat hoisting to import an undeclared (phantom) transitive dependency will fail at `astro build` or test time, not at install. The repo has large trees (Astro/Starlight/Vite/Stoplight/React) that historically assumed hoisting. Mitigation: when a phantom-dep error appears, **add the missing package to `dependencies`** rather than reaching for `node-linker=hoisted` / `shamefully-hoist` (which would undo most of pnpm's isolation benefit). Budget time for one or two such fixes during the first build.
- **`pnpm import` resolution drift** — the new lockfile may resolve some transitive versions differently than npm. Mitigation: build + full test suite must pass before merge; review `pnpm-lock.yaml` diff for major-version surprises.
- **Install-script allowlist too narrow** — if a dependency silently needs a build step, it'll be skipped. Mitigation: pnpm reports skipped builds; verify `sharp`/`esbuild` produce working binaries via a successful build.
- **Cooldown does NOT protect CI installs** — `minimum-release-age` is a *resolution-time* gate; it only affects choosing new versions (`pnpm add`/`update`/non-frozen install). `pnpm install --frozen-lockfile` (all CI jobs) installs the exact pinned versions regardless of their age — cooldown does not re-gate them. So the cooldown's protection lives entirely in the **lockfile-update path** (local `pnpm update` + Dependabot, which has its own separate `cooldown`). This is by design, but must be understood: CI safety comes from the frozen lockfile + reviewed lockfile diffs, not from cooldown.
- **7-day cooldown delays an urgent security patch (local-path only)** — a freshly-published fix can't be added via `pnpm update` for 7 days. This bites only during lockfile updates, not CI. Mitigation: override for a known-good urgent patch via pnpm's `--ignore-minimum-release-age` (or temporarily setting `minimum-release-age=0`); confirm the exact flag name against the installed pnpm 10.x at implementation time.
- **harden-runner false baseline** — audit mode only observes; no enforcement yet. Accepted for this change; `block` is a deliberate follow-up.
- **corepack future** — Node may unbundle corepack. Mitigation: `pnpm/action-setup` installs pnpm directly in CI from the `packageManager` field, independent of corepack.

## Reversibility

All changes land on a branch. Rollback = restore `package-lock.json`, revert workflow/`package.json`/config changes. No destructive operations outside the repo.
