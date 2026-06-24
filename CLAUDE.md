# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static documentation site for the Cyoda platform, deployed to https://docs.cyoda.net via GitHub Pages. Built with Astro + Starlight, with embedded interactive API reference (Scalar / Stoplight Elements) and auto-generated JSON Schema documentation.

## Commands

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

### Build pipeline (`pnpm build`)

Order matters — several steps read the outputs of earlier ones. The
authoritative chain is in `package.json` (the `build` script); this list
mirrors it:

1. `fetch:help-index` (`scripts/fetch-cyoda-help-index.js`) — reads
   `cyoda-go-version.json`, fetches `cyoda_help_<v>.json` + `SHA256SUMS`
   from the pinned cyoda-go release, verifies the checksum, writes a
   slim, body-stripped index to `src/data/cyoda-help-index.json`
   (consumed by `<FromTheBinary>` and the navigator MDX), and the full
   bundle (bodies preserved) to `.cyoda-cache/cyoda-help-full.json`.
2. `generate:help-pages` (`scripts/generate-help-pages.js`) — reads
   `.cyoda-cache/cyoda-help-full.json` and emits per-topic Starlight
   `.md` pages into `src/content/docs/help/<seg>/.../<leaf>.md`, plus
   `public/help/<seg>/.../<leaf>.{json,md}` raw payloads, plus
   `public/help/{index.json, versions.json, llms.txt}`. Astro needs the
   per-topic pages present at build time. Writes are atomic per file
   (sibling temp dir + rename) and orphan pages from removed topics are
   pruned automatically.
3. `fetch:openapi` (`scripts/fetch-cyoda-openapi.js`) — fetches the
   OpenAPI spec into `public/openapi/openapi.{json,yaml}`.
4. `fetch:schemas` (`scripts/fetch-cyoda-schemas.js`) — fetches JSON
   schemas into `src/schemas/`.
5. `generate:schema-pages` (`scripts/generate-schema-pages.js`) — scans
   `src/schemas/**/*.json` and writes MDX viewer pages into
   `src/content/docs/reference/schemas/**/*.mdx` (git-ignored; Astro
   needs them present at build time).
6. `astro build` — produces `dist/`.
7. `export:markdown` (`scripts/export-markdown.js`) — exports cleaned
   markdown copies of each doc into `dist/markdown/` (used by the
   in-page "Copy page" button).
8. `generate:llms` (`scripts/generate-llms-txt.js`) — writes
   `dist/llms.txt` for LLM consumers, including a section that points
   agents at the static help mirror.
9. `generate:llms-full` (`scripts/generate-llms-full.js`) — writes a
   longer LLM-consumer artefact.
10. `generate:md-sitemap` (`scripts/generate-markdown-sitemap.js`).
11. `package:schemas` (`scripts/package-schemas.js`) — produces
    `dist/schemas.zip` containing all raw schemas.

If you change `src/schemas/` or any script, run the full `pnpm build`
— `build:only` will leave the schema pages, help mirror, markdown
export, llms.txt, and zip stale.

## Architecture

### Content authoring

- `src/content/docs/` — all human-written docs (MDX/MD), organized by sidebar section: `getting-started/`, `guides/`, `concepts/`, `architecture/`, `cloud/`, `schemas/`.
- Sidebar sections auto-generate from those directories (see `astro.config.mjs` → `starlight.sidebar`). Adding a new top-level section requires both a directory and a sidebar entry.
- `src/content/docs/schemas/**/*.mdx` is **auto-generated and git-ignored** — do not edit by hand; change the JSON source under `src/schemas/` or the generator script.

### JSON Schemas

- Source of truth: `src/schemas/{common,entity,model,processing,search}/*.json`.
- `scripts/generate-schema-pages.js` preserves directory structure and builds one MDX per schema plus category/subcategory index pages, wrapping each in the React `JsonSchemaViewer` component (`src/components/JsonSchemaViewer.tsx`, Stoplight-based, `client:load`).
- See `docs/SCHEMAS_IMPLEMENTATION.md` for the full scheme.

### API reference (OpenAPI)

- Rendered in an iframe to isolate its CSS/JS from Starlight.
- Renderer is switched via the `API_RENDERER` constant in `src/pages/api-reference.astro` (`'scalar'` | `'stoplight'`). Direct routes also exist at `/api-reference-scalar/` and `/api-reference-stoplight/`.
- The spec lives at `dist/openapi/openapi.json` (served as a static asset). See `docs/API_REFERENCE_CONFIGURATION.md`.

### Starlight customization

Component overrides in `astro.config.mjs` → `starlight.components`: `Head`, `Footer`, `Header`, `SiteTitle`, `TableOfContents`. When changing chrome/layout, edit these in `src/components/` rather than adding wrappers.

### Cookie consent + Google Analytics

- EU/UK-compliant consent is configured in `astro.config.mjs` via `@jop-software/astro-cookieconsent`. GA is loaded by `src/components/Analytics.astro` only after consent.
- `GA_MEASUREMENT_ID` is read from env (`.env` locally, GitHub Secret in CI). Compliance behavior is covered by Playwright tests — changes to consent/analytics logic must keep those passing. See `docs/TESTING_INTEGRATION.md`.

### Deployment

- `.github/workflows/static.yml` — production deploy to GitHub Pages on push to `main`. Runs `pnpm test` with `GA_MEASUREMENT_ID` injected before deploy.
- `.github/workflows/preview-deploy.yml` / `cleanup-preview.yml` — Surge.sh branch previews.

## Conventions for AI assistants

- **pnpm only.** This repo uses pnpm 10 (pinned via `packageManager`). Never run `npm`/`npx`/global installs. Install scripts are blocked except `esbuild`/`sharp`/`fsevents` (`pnpm.onlyBuiltDependencies`); a 7-day `minimum-release-age` cooldown is set in `.npmrc`. CI uses `pnpm install --frozen-lockfile` and SHA-pinned actions.
- **`.augment/rules/` is off-limits.** Per `.augment/rules/README.md`, no AI may modify files in that folder under any circumstances.
- **`.sandbox/` is local-only.** Never stage, commit, or push anything under `.sandbox/` (also git-ignored).
- **Never hand-edit `src/content/docs/schemas/**/*.mdx`** — they are regenerated by the build. Modify the source JSON under `src/schemas/` or `scripts/generate-schema-pages.js`.
- **Never hand-edit `src/data/cyoda-help-index.json`** — it is regenerated by `scripts/fetch-cyoda-help-index.js` from the pinned cyoda-go release asset. Bump `cyoda-go-version.json` at repo root to change which release the build targets.
- **Never hand-edit `src/content/docs/help/<seg>/.../<leaf>.md` or anything under `public/help/`.** They are regenerated each build by `scripts/generate-help-pages.js` from the pinned cyoda-go release asset. The two files at the root of `src/content/docs/help/` (`index.mdx` landing page and `topic-tree.mdx` navigator) are hand-authored and tracked.
- `dist/` is a build artifact and also git-ignored; don't commit changes there.
