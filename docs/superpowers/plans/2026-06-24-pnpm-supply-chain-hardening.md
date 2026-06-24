# pnpm Migration + Supply-Chain Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `cyoda-docs` from npm to pnpm 10 and harden it against supply-chain attacks (blocked install scripts, version cooldown, frozen lockfile, SHA-pinned actions, runner egress monitoring, non-blocking audit).

**Architecture:** Local migration first (lockfile + config + scripts), verified by a green `pnpm run build` + `pnpm test`. Then the 4 GitHub workflows are converted one at a time (CI first, since it's the cheapest to exercise), each gaining `harden-runner` (audit) and SHA-pinned actions. Finally a scheduled non-blocking audit workflow + Dependabot cooldown, then docs.

**Tech Stack:** pnpm 10, corepack, GitHub Actions, Astro + Starlight, Playwright, `step-security/harden-runner`, `pnpm/action-setup`.

**Design spec:** `docs/superpowers/specs/2026-06-24-pnpm-supply-chain-hardening-design.md`

## Global Constraints

- **Package manager:** pnpm 10.x (exact, pinned via `packageManager` field with corepack integrity hash). Never re-introduce `npm install`/`npm ci`/`npx`/`-g` global installs anywhere.
- **Cooldown:** `minimum-release-age=10080` (7 days) in `.npmrc`.
- **Install-script allowlist:** `pnpm.onlyBuiltDependencies = ["esbuild", "sharp", "fsevents"]` — exactly these three; pnpm blocks all other lifecycle scripts by default.
- **overrides:** `lodash: ^4.17.21`, `@astrojs/sitemap: ~3.6.0` — preserved verbatim, moved to `pnpm.overrides`.
- **Node:** `.node-version` = `22`; workflows use `node-version-file: .node-version`.
- **CI install:** always `pnpm install --frozen-lockfile`.
- **Actions:** every `uses:` pinned to a full 40-char commit SHA with a trailing `# vX.Y.Z` comment. `pnpm/action-setup` must be **v4+**.
- **harden-runner:** `egress-policy: audit` (observe-only) as the first step of every job.
- **Surge:** invoked via `pnpm dlx surge@<exact>` (deploy-only; version-pinned).
- **No-edit zones:** do not touch archival records under `docs/superpowers/plans|specs/` (other than this plan/its spec) or `.ai/plans/`. Do not hand-edit generated content (`src/content/docs/schemas/`, `src/content/docs/help/`, `public/help/`, `dist/`).
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Local pnpm migration

Convert the repo to pnpm locally and prove it builds + tests green. This is the foundational, atomic change — package.json, lockfile, and config must move together. **Most likely failure mode: phantom dependencies** (see Step 11).

**Files:**
- Modify: `package.json` (scripts, `overrides`→`pnpm.overrides`, add `pnpm.onlyBuiltDependencies`, add `serve` devDependency, add `engines`, `packageManager`)
- Modify: `playwright.config.js:86,92`
- Create: `.npmrc`
- Create: `.node-version`
- Create: `pnpm-lock.yaml` (generated)
- Delete: `package-lock.json`

**Interfaces:**
- Produces: a working pnpm project. Later tasks rely on: `packageManager` field (read by `pnpm/action-setup`), `pnpm-lock.yaml` (read by `pnpm install --frozen-lockfile`), `.node-version` (read by `setup-node`), and `serve` resolvable via `pnpm exec serve`.

- [ ] **Step 1: Enable corepack and pin pnpm 10**

```bash
cd /Users/paul/dev/cyoda-docs
corepack enable
corepack use pnpm@10   # resolves latest 10.x, writes packageManager (with sha512 hash) into package.json
```

Verify the field was written exactly (a real version + hash, NOT `10.x.x`):

```bash
node -p "require('./package.json').packageManager"
# Expected e.g.: pnpm@10.18.2+sha512.<64+ hex chars>
```

If `corepack use pnpm@10` resolves to an 11.x or errors, run `corepack use pnpm@10.18.2` (or the current latest 10.x from `npm view pnpm dist-tags`) instead.

- [ ] **Step 2: Move `overrides` → `pnpm.overrides` and add the install-script allowlist**

In `package.json`, delete the top-level `overrides` block:

```json
  "overrides": {
    "lodash": "^4.17.21",
    "@astrojs/sitemap": "~3.6.0"
  }
```

and add a `pnpm` block (place it next to `packageManager`):

```json
  "pnpm": {
    "overrides": {
      "lodash": "^4.17.21",
      "@astrojs/sitemap": "~3.6.0"
    },
    "onlyBuiltDependencies": [
      "esbuild",
      "sharp",
      "fsevents"
    ]
  }
```

- [ ] **Step 3: Add `serve` as a pinned devDependency and add `engines`**

Add to `package.json` (`devDependencies` is currently absent — create the block):

```json
  "devDependencies": {
    "serve": "^14.2.4"
  },
  "engines": {
    "node": ">=22"
  }
```

(`>=22` is the floor — it documents the requirement without warning on the author's local Node 25; CI exactness comes from `.node-version`. Confirm the latest `serve` major with `npm view serve version` and use `^<major>.<minor>.x`.)

- [ ] **Step 4: Rewrite `package.json` scripts (npm→pnpm)**

Replace these three scripts exactly. Leave every `node scripts/...` script (including `predev` and all `fetch:`/`generate:` scripts) unchanged — they call `node` directly.

```json
    "build": "pnpm run fetch:help-index && pnpm run generate:help-pages && pnpm run fetch:openapi && pnpm run fetch:schemas && pnpm run generate:schema-pages && astro build && pnpm run export:markdown && pnpm run generate:llms && pnpm run generate:llms-full && pnpm run generate:md-sitemap && pnpm run package:schemas",
    "test": "pnpm run test:scripts && playwright test",
    "perf:audit": "pnpm run build && pnpm exec serve dist -l 3000 & sleep 3 && pnpm dlx lighthouse@12 http://localhost:3000 --budget-path=performance-budget.json --view && pkill -f 'serve dist'",
    "perf:check": "pnpm run build && pnpm dlx lighthouse@12 http://localhost:3000 --budget-path=performance-budget.json --output=json --output-path=lighthouse-report.json"
```

(Pin lighthouse to the current major from `npm view lighthouse version`; `@12` shown as example.)

- [ ] **Step 5: Fix `playwright.config.js` runtime commands**

These run at test time — not comments.

`playwright.config.js:86`:
```js
    command: 'npx serve dist -l 4321',
```
→
```js
    command: 'pnpm exec serve dist -l 4321',
```

`playwright.config.js:92`:
```js
    command: 'npm run dev',
```
→
```js
    command: 'pnpm run dev',
```

- [ ] **Step 6: Create `.npmrc` with the 7-day cooldown**

Create `.npmrc` at repo root:

```ini
# Supply-chain: refuse to install any version published less than 7 days ago.
# minutes; 10080 = 7 days. See docs/superpowers/specs/2026-06-24-pnpm-supply-chain-hardening-design.md
minimum-release-age=10080
```

- [ ] **Step 7: Create `.node-version`**

Create `.node-version` at repo root with a single line:

```
22
```

- [ ] **Step 8: Generate the pnpm lockfile from the existing npm lockfile**

```bash
pnpm import        # reads package-lock.json, writes pnpm-lock.yaml preserving resolutions
rm package-lock.json
```

- [ ] **Step 9: Install with pnpm**

```bash
pnpm install
```

Expected: completes; pnpm prints which build scripts ran (`esbuild`, `sharp`, and `fsevents` on macOS) and may note that other packages' build scripts were ignored — that's the allowlist working. If pnpm reports a package whose build was skipped but is actually needed (build fails later), revisit the allowlist.

- [ ] **Step 10: Verify the cooldown setting is honored**

```bash
pnpm config get minimum-release-age
# Expected: 10080
```

If this prints `undefined` or pnpm warns the key is unknown/deprecated, your pnpm minor doesn't read it from `.npmrc`. Fallback: create `pnpm-workspace.yaml` with `minimumReleaseAge: 10080` and re-verify. (Either location satisfies the spec; `.npmrc` is preferred.)

- [ ] **Step 11: Build the site (catches phantom dependencies)**

```bash
pnpm run build
```

Expected: full pipeline runs and `dist/` is produced. **If it fails with `Cannot find module 'X'` / `X is not exported`** for a package you didn't import directly, that's a phantom dependency exposed by pnpm's strict `node_modules`. Fix by adding the missing package to `dependencies` (`pnpm add X`), NOT by enabling `shamefully-hoist`/`node-linker=hoisted`. Re-run until green. Record any additions in the commit message.

- [ ] **Step 12: Run the test suite**

```bash
pnpm test
```

Expected: `test:scripts` (node:test) passes, then Playwright runs against `pnpm exec serve` and passes (GDPR/GA/navigators/build-integration). Playwright auto-downloads its browser if missing; if it complains, run `pnpm exec playwright install chromium` first.

- [ ] **Step 13: Verify the lockfile is in sync (frozen install)**

```bash
pnpm install --frozen-lockfile
```

Expected: `Lockfile is up to date` / no changes. If it errors that the lockfile is out of date, run `pnpm install` once more and commit the updated `pnpm-lock.yaml`.

- [ ] **Step 14: Commit**

```bash
git add package.json pnpm-lock.yaml .npmrc .node-version playwright.config.js
git rm --cached package-lock.json 2>/dev/null; git add -u
git commit -m "build: migrate from npm to pnpm 10 with supply-chain config

- pin pnpm via packageManager (corepack integrity hash)
- 7-day minimum-release-age cooldown (.npmrc)
- block install scripts except esbuild/sharp/fsevents
- move overrides to pnpm.overrides; add serve devDependency
- pin Node 22 (.node-version); rewrite scripts + playwright.config to pnpm
- replace package-lock.json with pnpm-lock.yaml

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Convert `ci.yml` to pnpm + harden-runner + SHA pins

The PR CI workflow — cheapest to exercise, so it goes first. After this lands, the PR carrying these changes will itself run the new CI.

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `packageManager`, `pnpm-lock.yaml`, `.node-version` from Task 1.
- Produces: the SHA values you resolve here are reused (re-resolved) in Tasks 3–5.

- [ ] **Step 1: Resolve action commit SHAs**

```bash
for ref in actions/checkout:v6 actions/setup-node:v6 pnpm/action-setup:v4 step-security/harden-runner:v2; do
  repo=${ref%:*}; tag=${ref#*:}
  printf '%s -> %s # %s\n' "$repo" "$(gh api repos/$repo/commits/$tag --jq .sha)" "$tag"
done
```

Record each `<sha>` and its `# vTAG` comment. Use the full 40-char SHA in the file. (If `gh` is unavailable, fetch from `https://github.com/<repo>/commits/<tag>` and copy the latest commit SHA.)

- [ ] **Step 2: Rewrite `ci.yml`**

Replace the `steps:` of the `build` job with the following (note: the global `serve` install step is **removed** — `serve` is now a devDependency used by `playwright.config.js`). Substitute the SHAs from Step 1.

```yaml
    steps:
      - name: Harden the runner (audit mode)
        uses: step-security/harden-runner@<sha> # v2
        with:
          egress-policy: audit
      - name: Checkout
        uses: actions/checkout@<sha> # v6
      - name: Install pnpm
        uses: pnpm/action-setup@<sha> # v4
      - name: Setup Node.js
        uses: actions/setup-node@<sha> # v6
        with:
          node-version-file: .node-version
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Install Playwright browsers for Mermaid rendering and testing
        run: pnpm exec playwright install --with-deps chromium
        env:
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: false
          CI: true
      - name: Build site
        run: pnpm run build
        env:
          NODE_ENV: production
          GA_MEASUREMENT_ID: ${{ secrets.GA_MEASUREMENT_ID }}
          CI: true
      - name: Run node:test + Playwright (GDPR, GA, navigators, build integration)
        run: pnpm test
        env:
          NODE_ENV: production
          GA_MEASUREMENT_ID: ${{ secrets.GA_MEASUREMENT_ID }}
          CI: true
```

- [ ] **Step 3: Validate the YAML locally**

```bash
node -e "require('js-yaml')" 2>/dev/null && pnpm dlx js-yaml .github/workflows/ci.yml >/dev/null && echo "valid" || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('valid')"
```

Expected: `valid`. Also confirm no `npm`/`npx` remain: `grep -nE 'npm |npx |-g ' .github/workflows/ci.yml` → no output.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run CI on pnpm with harden-runner and SHA-pinned actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Convert `deploy.yml` to pnpm + harden-runner + SHA pins

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: same Task 1 outputs. Adds Pages actions not used in Task 2.

- [ ] **Step 1: Resolve the additional action SHAs**

```bash
for ref in actions/checkout:v6 actions/setup-node:v6 pnpm/action-setup:v4 step-security/harden-runner:v2 \
           actions/configure-pages:v6 actions/upload-pages-artifact:v5 actions/deploy-pages:v5; do
  repo=${ref%:*}; tag=${ref#*:}
  printf '%s -> %s # %s\n' "$repo" "$(gh api repos/$repo/commits/$tag --jq .sha)" "$tag"
done
```

- [ ] **Step 2: Rewrite the `build` job steps**

Replace the `build` job's `steps:` with the block below (same install pattern as Task 2; global `serve` step removed; Pages steps SHA-pinned):

```yaml
    steps:
      - name: Harden the runner (audit mode)
        uses: step-security/harden-runner@<sha> # v2
        with:
          egress-policy: audit
      - name: Checkout
        uses: actions/checkout@<sha> # v6
      - name: Install pnpm
        uses: pnpm/action-setup@<sha> # v4
      - name: Setup Node.js
        uses: actions/setup-node@<sha> # v6
        with:
          node-version-file: .node-version
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Install Playwright browsers for Mermaid rendering and testing
        run: pnpm exec playwright install --with-deps chromium
        env:
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: false
          CI: true
      - name: Build site
        run: pnpm run build
        env:
          NODE_ENV: production
          GA_MEASUREMENT_ID: ${{ secrets.GA_MEASUREMENT_ID }}
          CI: true
      - name: Run node:test + Playwright (GDPR, GA, navigators, build integration)
        run: pnpm test
        env:
          NODE_ENV: production
          GA_MEASUREMENT_ID: ${{ secrets.GA_MEASUREMENT_ID }}
          CI: true
      - name: Setup Pages
        uses: actions/configure-pages@<sha> # v6
      - name: Upload artifact
        uses: actions/upload-pages-artifact@<sha> # v5
        with:
          path: dist/
```

- [ ] **Step 3: Harden + pin the `deploy` job**

The `deploy` job has no checkout. Add harden-runner as its first step and pin `deploy-pages`:

```yaml
    steps:
      - name: Harden the runner (audit mode)
        uses: step-security/harden-runner@<sha> # v2
        with:
          egress-policy: audit
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@<sha> # v5
```

- [ ] **Step 4: Validate + check for leftover npm**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('valid')"
grep -nE 'npm |npx |-g ' .github/workflows/deploy.yml   # expect no output
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy on pnpm with harden-runner and SHA-pinned actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Convert `preview-deploy.yml` + `cleanup-preview.yml` (surge via pnpm dlx)

**Files:**
- Modify: `.github/workflows/preview-deploy.yml`
- Modify: `.github/workflows/cleanup-preview.yml`

**Interfaces:**
- Consumes: Task 1 outputs. Replaces `npm install -g surge` with `pnpm dlx surge@<exact>`.

- [ ] **Step 1: Resolve SHAs and pin the surge version**

```bash
for ref in actions/checkout:v6 actions/setup-node:v6 pnpm/action-setup:v4 step-security/harden-runner:v2; do
  repo=${ref%:*}; tag=${ref#*:}
  printf '%s -> %s # %s\n' "$repo" "$(gh api repos/$repo/commits/$tag --jq .sha)" "$tag"
done
echo "surge latest: $(npm view surge version)"   # pin this exact version below as surge@<x.y.z>
```

- [ ] **Step 2: `preview-deploy.yml` — pin checkout/setup, switch install to pnpm**

In the `deploy-preview` job, update the existing steps:

`Checkout` step → `uses: actions/checkout@<sha> # v6` (keep the existing `with: ref:` block).

Insert harden-runner as the **first** step of the job:

```yaml
      - name: Harden the runner (audit mode)
        uses: step-security/harden-runner@<sha> # v2
        with:
          egress-policy: audit
```

Replace the `Setup Node.js` step and the `Install dependencies` step with:

```yaml
      - name: Install pnpm
        uses: pnpm/action-setup@<sha> # v4
      - name: Setup Node.js
        uses: actions/setup-node@<sha> # v6
        with:
          node-version-file: .node-version
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
```

Replace the `Install Playwright browsers` run with `pnpm exec playwright install --with-deps chromium`, the `Build site with Astro` run's `npm run build` with `pnpm run build`, and the test step's `npm test` with `pnpm test`.

- [ ] **Step 3: `preview-deploy.yml` — surge via pnpm dlx**

Delete the `Install Surge` step (`npm install -g surge`). In the `Deploy to Surge` step, change the run command from `surge ./dist ...` to (substitute the pinned version):

```yaml
        run: |
          SURGE_DOMAIN="cyoda-docs-${ENV_NAME}.surge.sh"
          echo "🚀 Deploying to: ${SURGE_URL}"
          pnpm dlx surge@<x.y.z> ./dist "$SURGE_DOMAIN" --token "$SURGE_TOKEN"
```

- [ ] **Step 4: `cleanup-preview.yml` — harden + pnpm dlx surge**

This job has no Node setup today. Replace its `steps:` with:

```yaml
    steps:
      - name: Harden the runner (audit mode)
        uses: step-security/harden-runner@<sha> # v2
        with:
          egress-policy: audit
      - name: Checkout
        uses: actions/checkout@<sha> # v6
      - name: Install pnpm
        uses: pnpm/action-setup@<sha> # v4
      - name: Remove Surge deployment
        env:
          INPUT_ENV_NAME: ${{ github.event.inputs.environment_name }}
          SURGE_TOKEN: ${{ secrets.SURGE_TOKEN }}
        run: |
          # Sanitize input to allow only safe domain characters
          CLEAN_ENV=$(printf '%s' "$INPUT_ENV_NAME" | tr -cd 'a-zA-Z0-9-' )
          if [ -z "$CLEAN_ENV" ]; then
            echo "❌ environment_name is empty after sanitization"; exit 1
          fi
          SURGE_DOMAIN="cyoda-docs-${CLEAN_ENV}.surge.sh"
          echo "🗑️ Removing deployment: https://$SURGE_DOMAIN"
          pnpm dlx surge@<x.y.z> teardown "$SURGE_DOMAIN" --token "$SURGE_TOKEN" || echo "Domain may not exist or already removed"
          echo "CLEAN_ENV=$CLEAN_ENV" >> "$GITHUB_ENV"
      - name: Confirm cleanup
        run: |
          echo "✅ Cleanup completed for environment: ${CLEAN_ENV}"
          echo "🗑️ Removed: https://cyoda-docs-${CLEAN_ENV}.surge.sh"
```

(`pnpm/action-setup` needs `package.json` present, hence the checkout, to read the pinned pnpm version. No `pnpm install` is needed — `dlx` fetches surge to a temp store.)

- [ ] **Step 5: Validate both files**

```bash
for f in preview-deploy cleanup-preview; do
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/$f.yml')); print('$f valid')"
done
grep -nE 'npm install -g|npm ci|npx ' .github/workflows/preview-deploy.yml .github/workflows/cleanup-preview.yml   # expect no output
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/preview-deploy.yml .github/workflows/cleanup-preview.yml
git commit -m "ci: preview/cleanup on pnpm; surge via pnpm dlx; harden-runner + SHA pins

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Scheduled non-blocking audit + Dependabot cooldown

**Files:**
- Create: `.github/workflows/audit.yml`
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Consumes: Task 1 outputs (`pnpm-lock.yaml`, `.node-version`, `packageManager`).

- [ ] **Step 1: Resolve SHAs for the audit workflow**

```bash
for ref in actions/checkout:v6 pnpm/action-setup:v4 step-security/harden-runner:v2; do
  repo=${ref%:*}; tag=${ref#*:}
  printf '%s -> %s # %s\n' "$repo" "$(gh api repos/$repo/commits/$tag --jq .sha)" "$tag"
done
```

- [ ] **Step 2: Create `.github/workflows/audit.yml`**

```yaml
# Weekly dependency audit. Reports to the job summary; never blocks PRs or deploys.
name: Dependency Audit

on:
  schedule:
    - cron: '0 6 * * 1' # Mondays 06:00 UTC
  workflow_dispatch:

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Harden the runner (audit mode)
        uses: step-security/harden-runner@<sha> # v2
        with:
          egress-policy: audit
      - name: Checkout
        uses: actions/checkout@<sha> # v6
      - name: Install pnpm
        uses: pnpm/action-setup@<sha> # v4
      - name: Run pnpm audit (non-blocking)
        run: |
          echo '## pnpm audit' >> "$GITHUB_STEP_SUMMARY"
          echo '```' >> "$GITHUB_STEP_SUMMARY"
          pnpm audit 2>&1 | tee -a "$GITHUB_STEP_SUMMARY" || true
          echo '```' >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 3: Add the cooldown to `.github/dependabot.yml`**

Under the npm update entry (the one with `package-ecosystem: "npm"`), add a `cooldown` key (keep `package-ecosystem: "npm"` — it covers `pnpm-lock.yaml`; there is no `pnpm` ecosystem). Insert after the `schedule:` block:

```yaml
    cooldown:
      default-days: 7
```

- [ ] **Step 4: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/audit.yml')); print('audit valid')"
python3 -c "import yaml; yaml.safe_load(open('.github/dependabot.yml')); print('dependabot valid')"
```

Expected: both `valid`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/audit.yml .github/dependabot.yml
git commit -m "ci: add weekly non-blocking pnpm audit; Dependabot 7-day cooldown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Update live documentation

Update only live, instructional docs. Leave archival `docs/superpowers/plans|specs/` (except this plan/spec) and `.ai/plans/` untouched.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md:84,88,91,94,100`
- Modify: `docs/TESTING_INTEGRATION.md:113,116,119,122,125`
- Modify: `docs/SCHEMAS_IMPLEMENTATION.md:129,130,233,243`
- Modify: `PERFORMANCE_REPORT.md:77,84,95,108,113,141,148,159,172,177,201`

- [ ] **Step 1: `CLAUDE.md` — Commands block**

Replace the command block under `## Commands` with the pnpm equivalents:

```bash
pnpm dev              # Astro dev server on http://localhost:4321
pnpm build            # Full production build (see pipeline below)
pnpm build:only       # Astro build without the generate/export/package steps
pnpm preview          # Preview the built site
pnpm test             # node:test (fetch script + build integration) + Playwright (GDPR, GA, navigators)
pnpm test:ui          # Playwright interactive runner
pnpm exec playwright test tests/cookie-consent-test.spec.ts   # run a single test file
pnpm exec playwright test -g "Modal Display"                   # run a single test by name
```

Then update the build-pipeline prose: change `npm run build` → `pnpm build` and `build:only` references to pnpm. Add a short bullet to the "Conventions for AI assistants" section:

```markdown
- **pnpm only.** This repo uses pnpm 10 (pinned via `packageManager`). Never run `npm`/`npx`/global installs. Install scripts are blocked except `esbuild`/`sharp`/`fsevents` (`pnpm.onlyBuiltDependencies`); a 7-day `minimum-release-age` cooldown is set in `.npmrc`. CI uses `pnpm install --frozen-lockfile` and SHA-pinned actions.
```

- [ ] **Step 2: `README.md` — Development section**

`README.md:84-94` → replace `npm install`/`npm run dev`/`npm run build`/`npm run preview` with:

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

`README.md:97-103` "Legacy Development (http-server)" uses `npm install --global http-server` — replace with `pnpm dlx http-server dist` and drop the separate install line:

```bash
# Serve the built site
pnpm dlx http-server dist
```

- [ ] **Step 3: `docs/TESTING_INTEGRATION.md`**

Replace: `npm test`→`pnpm test` (lines 35, 45, 113), `npm run test:ui`→`pnpm test:ui` (116), `npm run test:headed`→`pnpm test:headed` (119), and the two `npx playwright test ...` (122, 125) → `pnpm exec playwright test ...`.

- [ ] **Step 4: `docs/SCHEMAS_IMPLEMENTATION.md`**

Replace `npm run generate:schema-pages`→`pnpm generate:schema-pages` (129, 233), `npm run build`→`pnpm build` (130), `npm run package:schemas`→`pnpm package:schemas` (243). Leave the JSON snippet at line 82 (it documents an old `build` string) as-is or update its `npm run`→`pnpm run` to match the new package.json — match the new style.

- [ ] **Step 5: `PERFORMANCE_REPORT.md`**

Replace `npm install -g lighthouse serve` (77, 141) → `# tools run via pnpm dlx / devDependency — no global install needed`; `npm run perf:audit`→`pnpm perf:audit` (84, 148, 201); `npm run perf:check`→`pnpm perf:check` (95, 159); `npm run build`→`pnpm build` (108, 172); `npx serve dist -l 3000`→`pnpm exec serve dist -l 3000` (113, 177).

- [ ] **Step 6: Confirm no stale npm instructions remain in live docs**

```bash
grep -nE 'npm (install|run|ci|test)|npm -g|npx ' CLAUDE.md README.md docs/TESTING_INTEGRATION.md docs/SCHEMAS_IMPLEMENTATION.md PERFORMANCE_REPORT.md
```

Expected: no output (a remaining `pnpm dlx`/`pnpm exec` is fine; the grep above only matches `npm`/`npx`).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md docs/TESTING_INTEGRATION.md docs/SCHEMAS_IMPLEMENTATION.md PERFORMANCE_REPORT.md
git commit -m "docs: update commands from npm to pnpm

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Open the PR and verify the new CI end-to-end

**Files:** none (verification only).

- [ ] **Step 1: Push the branch and open a PR**

```bash
git push -u origin HEAD
gh pr create --fill --base main
```

- [ ] **Step 2: Confirm `ci.yml` runs green under pnpm**

```bash
gh pr checks --watch
```

Expected: the CI job passes — `pnpm install --frozen-lockfile`, `pnpm run build`, and `pnpm test` all succeed on the runner.

- [ ] **Step 3: Inspect the harden-runner audit output**

Open the CI run's harden-runner step in the GitHub UI (or `gh run view`). Confirm the observed egress endpoints are expected (npm registry, pnpm download host, Playwright CDN, GitHub). Note anything surprising for the future `block`-mode follow-up. **Do not** flip to block mode in this PR.

- [ ] **Step 4: Verify Dependabot config parses**

In the PR, check the repo's **Insights → Dependency graph → Dependabot** tab (or wait for the next scheduled run) to confirm no config error is reported on `dependabot.yml`.

---

## Notes for the implementer

- **Sequencing safety:** Tasks 1–6 are all on a feature branch; `main`'s deploy is untouched until merge. The one cross-task hazard is already handled — the global `serve` install is removed in the same workflow tasks that rely on `playwright.config.js`'s `pnpm exec serve` (fixed in Task 1).
- **If the first build fails on a phantom dependency** (Task 1, Step 11): add the package to `dependencies`, never `shamefully-hoist`. This is expected, not a sign the migration is wrong.
- **SHAs are environment-resolved**, not fabricated — always resolve them with the provided `gh api` commands at implementation time, and keep the `# vTAG` comment so Dependabot can update them.
