/**
 * Content-correctness lint.
 *
 * Locks in the cross-cutting sweeps from the 2026-04-22 correctness
 * review. Each pattern here was a real bug fixed during that pass;
 * this test ensures none of them silently regresses.
 *
 * If a new legitimate case ever needs to include one of these
 * patterns (e.g. quoting a broken example to contrast with the
 * correct form), either allow-list the specific file or restructure
 * the content to not reproduce the bad form verbatim.
 */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Project is ESM, so __dirname isn't defined. Derive it from import.meta.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Rule {
  pattern: RegExp;
  description: string;
  remedy: string;
  /** Extra globs this rule does not apply to (e.g. release notes, which
   *  legitimately name what a release removed). */
  ignore?: string[];
}

// Release notes record what each release removed, so rules that guard
// against removed surfaces do not apply to them.
const RELEASE_NOTES = ['src/content/docs/releases/**'];

const RULES: Rule[] = [
  {
    pattern: /\/api\/models\//,
    description: 'non-existent /api/models/... path scheme',
    remedy:
      'use /api/entity/{format}/{entityName}/{modelVersion} for entities, ' +
      'or /api/search/{direct|async}/{entityName}/{modelVersion} for search',
  },
  {
    // CYODA_STORAGE without the _BACKEND suffix. Negative lookahead.
    pattern: /\bCYODA_STORAGE(?!_BACKEND)(?!_[A-Z])/,
    description: 'bare CYODA_STORAGE — silently ignored at runtime',
    remedy: 'use CYODA_STORAGE_BACKEND (see app/config.go in cyoda-go)',
  },
  {
    pattern: /CYODA_BOOTSTRAP_|CYODA_OIDC_/,
    description: 'removed bootstrap-client or OIDC setting (cyoda-go v0.9.0)',
    remedy:
      'the first admin token comes from `cyoda token`; OIDC federation is ' +
      'gone — see `cyoda help auth integration`',
    ignore: RELEASE_NOTES,
  },
  {
    // The token endpoint is tenant-scoped since v0.9.0.
    pattern: /(?<!\/tenants\/\S*)\/oauth\/token\b/,
    description: 'untenanted /oauth/token endpoint (removed in cyoda-go v0.9.0)',
    remedy: 'use POST /api/tenants/{tenant}/oauth/token',
    ignore: RELEASE_NOTES,
  },
  {
    pattern:
      /CYODA_TX_TOKEN_TTL|CYODA_DISPATCH_FORWARD_TIMEOUT|CYODA_SCHEDULER_(?:DISTRIBUTION|COORDINATOR|REDISPATCH_BACKOFF|BATCH_SIZE|EXPIRY_GRACE)\b/,
    description: 'setting removed in cyoda-go v0.9.0',
    remedy: 'see `cyoda help config scheduler` and `cyoda help config grpc`',
    ignore: RELEASE_NOTES,
  },
  {
    pattern: /\{searchId\}/,
    description: '{searchId} path parameter on async search',
    remedy: 'async search uses {jobId} per api/openapi.yaml',
  },
];

const CONTENT_GLOB = 'src/content/docs/**/*.{md,mdx}';
// Auto-generated pages are regenerated at build time from sources we
// don't control: schemas come from src/schemas/ JSON, and the help
// mirror under src/content/docs/help/<seg>/.../<leaf>.md is verbatim
// from the pinned cyoda-go release. The drift patterns this test
// guards are about hand-authored content; if the binary's prose ever
// uses one of these phrases, that's an upstream concern, not a
// regression in this repo. The two hand-authored entry pages
// (index.mdx, topic-tree.mdx) at the root of help/ stay in scope.
const IGNORED_GLOBS = [
  'src/content/docs/reference/schemas/**',
  'src/content/docs/help/**/*.md',
];

test.describe('Content correctness — cross-cutting sweep regression guards', () => {
  for (const rule of RULES) {
    test(`no "${rule.description}" in any content page`, async () => {
      const root = path.resolve(__dirname, '..');
      const files = await glob(CONTENT_GLOB, {
        cwd: root,
        absolute: true,
        ignore: [...IGNORED_GLOBS, ...(rule.ignore ?? [])],
      });

      const offenders: { file: string; line: number; text: string }[] = [];
      for (const file of files) {
        const body = await readFile(file, 'utf-8');
        body.split('\n').forEach((line, idx) => {
          if (rule.pattern.test(line)) {
            offenders.push({
              file: path.relative(root, file),
              line: idx + 1,
              text: line.trim(),
            });
          }
        });
      }

      const message = offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.text}`)
        .join('\n');
      expect(
        offenders,
        `Found ${offenders.length} occurrence(s) of the "${rule.description}" pattern.\n\n${message}\n\nRemedy: ${rule.remedy}`,
      ).toHaveLength(0);
    });
  }
});
