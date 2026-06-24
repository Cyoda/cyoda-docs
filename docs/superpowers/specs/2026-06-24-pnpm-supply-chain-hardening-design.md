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
- Packages with install (lifecycle) scripts, per the lockfile: **`esbuild`, `sharp`, `fsevents`** only. Playwright fetches browsers via its explicit `playwright install` command, not a lifecycle script.
- 4 workflows (`ci`, `deploy`, `preview-deploy`, `cleanup-preview`), all on npm: `npm ci --omit=dev`, `actions/setup-node` `cache: 'npm'`, `npx playwright install`, and **global installs** `npm install -g serve` / `npm install -g surge`.
- Actions referenced by **tag** (`@v6`, `@v5`), not SHA.
- Dependabot configured for `npm` + `github-actions`. No Node version pin file; no `packageManager` field.
- Local: pnpm 9.15.9 and corepack 0.34.6 available (pnpm 10 will be installed/pinned).

## Design

### 1. Package manager migration

- Add `packageManager: "pnpm@10.x.x+sha512.<hash>"` to `package.json` — exact version with integrity hash so corepack verifies the pnpm binary. Single source of truth for local + CI.
- Generate `pnpm-lock.yaml`: `pnpm import` (carry over resolutions from `package-lock.json`), then a clean `pnpm install` to materialize. Delete `package-lock.json`.
- Move npm `overrides` → `pnpm.overrides` in `package.json`.
- Rewrite `package.json` scripts: `npm run X` → `pnpm run X`; `npx Y` → `pnpm exec Y` (locked tools) or `pnpm dlx Y@<exact>` (one-off pinned tools).
- Pin Node: add `.node-version` = `22` and `engines.node` (e.g. `">=22 <23"`). Workflows use `node-version-file: .node-version`.

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
- `perf:audit` / `perf:check` scripts: `npx serve` → `pnpm exec serve`; `npx lighthouse` → `pnpm dlx lighthouse@<exact>`.

### 4. SHA-pin all GitHub Actions

Pin every `uses:` to a full 40-char commit SHA with a trailing `# vX.Y.Z` comment, in all 4 workflows:
`actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`, plus new `pnpm/action-setup` and `step-security/harden-runner`.
Dependabot's `github-actions` ecosystem keeps the pinned SHAs updated (it understands SHA + version-comment pins).

### 5. CI runner egress hardening

Add `step-security/harden-runner@<sha>` with `egress-policy: audit` as the **first step of every job** (including `cleanup-preview`). Establishes an egress baseline; tightenable to `block` in a follow-up once the baseline is known.

### 6. Workflow install pattern

Per job: `harden-runner` → `pnpm/action-setup` (version from `packageManager`) → `actions/setup-node` (`node-version-file: .node-version`, `cache: 'pnpm'`) → `pnpm install --frozen-lockfile`. Replaces `npm ci --omit=dev`.

### 7. Non-blocking audit + Dependabot cooldown

- New `.github/workflows/audit.yml`: weekly `schedule` (cron) + `workflow_dispatch`. Runs `pnpm audit`, writes the report to the job summary, **non-blocking** (`|| true` / no gating). First step is `harden-runner` (audit). No auto-issue creation (avoids adding another third-party action; can be added later).
- Add a `cooldown` block to `.github/dependabot.yml` (7-day floor) so Dependabot doesn't propose versions younger than the pnpm cooldown.

### 8. Docs

Update **live** docs only — leave archival `docs/superpowers/plans|specs/` and `.ai/plans/` untouched:
- `CLAUDE.md` — all `npm run …` → `pnpm …`, build-pipeline command list, and a short note on the pnpm/supply-chain config (cooldown, install-script allowlist, SHA pins).
- `README.md`, `playwright.config.js` (comment), `docs/SCHEMAS_IMPLEMENTATION.md`, `docs/TESTING_INTEGRATION.md`, `PERFORMANCE_REPORT.md` — swap `npm`/`npx` invocations for `pnpm` equivalents where they're live instructions.

### 9. Verification

1. Local: clean `pnpm install` (no errors, no unexpected build-script prompts beyond the allowlist), `pnpm run build` produces `dist/`, `pnpm test` green.
2. Confirm `pnpm-lock.yaml` committed and `package-lock.json` removed.
3. Confirm `pnpm install --frozen-lockfile` succeeds (lockfile in sync).
4. Open a PR to exercise `ci.yml` under pnpm + harden-runner (audit) before relying on the deploy/preview paths.
5. Sanity-check harden-runner audit output for unexpected egress.

## Risks & mitigations

- **`pnpm import` resolution drift** — the new lockfile may resolve some transitive versions differently than npm. Mitigation: build + full test suite must pass before merge; review `pnpm-lock.yaml` diff for major-version surprises.
- **Install-script allowlist too narrow** — if a dependency silently needs a build step, it'll be skipped. Mitigation: pnpm reports skipped builds; verify `sharp`/`esbuild` produce working binaries via a successful build.
- **7-day cooldown blocks an urgent security patch** — a freshly-published fix can't install for 7 days. Mitigation: `minimum-release-age` can be temporarily overridden (or the specific package excluded) when a known-good urgent patch is needed.
- **harden-runner false baseline** — audit mode only observes; no enforcement yet. Accepted for this change; `block` is a deliberate follow-up.
- **corepack future** — Node may unbundle corepack. Mitigation: `pnpm/action-setup` installs pnpm directly in CI from the `packageManager` field, independent of corepack.

## Reversibility

All changes land on a branch. Rollback = restore `package-lock.json`, revert workflow/`package.json`/config changes. No destructive operations outside the repo.
