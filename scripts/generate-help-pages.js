import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function err(cls, message) {
  return new Error(`${cls}: ${message}`);
}

const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const VERSION_SEGMENT_RE = /^v\d+(\.\d+)?$/;
const RESERVED_FIRST_SEGMENTS = new Set(['index', 'topic-tree']);

function validateTopic(t) {
  if (!t || typeof t !== 'object') {
    throw err('MalformedTopic', `topic entry is not an object: ${JSON.stringify(t)}`);
  }
  if (!Array.isArray(t.path) || t.path.length === 0) {
    throw err('MalformedTopic', `topic missing non-empty path[]: ${JSON.stringify(t.path)}`);
  }
  for (const seg of t.path) {
    if (typeof seg !== 'string' || !SEGMENT_RE.test(seg)) {
      throw err('MalformedTopic', `path segment "${seg}" is not [A-Za-z0-9_-]+`);
    }
  }
  if (typeof t.topic !== 'string' || t.topic !== t.path.join('.')) {
    throw err(
      'MalformedTopic',
      `invariant violated: topic === path.join("."): topic=${JSON.stringify(t.topic)} path=${JSON.stringify(t.path)}`
    );
  }
  if (typeof t.title !== 'string' || t.title.length === 0) {
    throw err('MalformedTopic', `topic ${t.topic} missing title`);
  }
  if (typeof t.body !== 'string' || t.body.length === 0) {
    throw err('MalformedTopic', `topic ${t.topic} missing body`);
  }
}

function checkReservedSegment(t) {
  const first = t.path[0];
  if (VERSION_SEGMENT_RE.test(first) || RESERVED_FIRST_SEGMENTS.has(first)) {
    throw err(
      'ReservedTopicSegment',
      `topic ${t.topic} uses reserved first segment "${first}". Reserved: /^v\\d+(\\.\\d+)?$/, "index", "topic-tree".`
    );
  }
}

function slugFor(t) {
  return t.path.join('/').toLowerCase();
}

function yamlEscape(s) {
  // YAML double-quoted scalar: escape backslash, double-quote, and control chars.
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

function truncateForDescription(s, max = 155) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function findByTopic(topics, dottedId) {
  return topics.find(t => t.topic === dottedId);
}

// Defense-in-depth: even though parsePinFile constrains the version
// to a strict semver, anything we splice into HTML still gets escaped
// at the boundary. Cheap, eliminates a whole class of attribute-
// injection / element-injection issues if the upstream pin layer is
// ever weakened.
function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage(t, allTopics, pinnedPatch, urlPrefix) {
  // URL paths are always lowercased — Astro's content-collection slug
  // generation lowercases route segments, so an uppercase identifier
  // like errors.BAD_REQUEST routes to /help/errors/bad_request/, not
  // /help/errors/BAD_REQUEST/. We lowercase here so generated links
  // match the actual rendered routes (and the lowercased on-disk
  // public/help/ assets we write below).
  const slugPath = t.path.join('/').toLowerCase();
  const cliInvocation = ['cyoda', 'help', ...t.path].join(' ');
  const description = truncateForDescription(t.synopsis || t.title);

  const fm = [
    '---',
    `title: ${yamlEscape(t.title)}`,
    `description: ${yamlEscape(description)}`,
    'sidebar:',
    '  hidden: true',
    '---',
    '',
  ].join('\n');

  // Subtle one-line version indicator — names the cyoda-go release
  // this content was captured from, in plain English. Links to the
  // GitHub release tag for that version. Both the URL and the link
  // text are HTML-escaped: pinnedPatch is constrained upstream by
  // parsePinFile's semver guard, but escaping here is cheap defense
  // in depth.
  const releaseUrl = `https://github.com/Cyoda/cyoda-go/releases/tag/v${pinnedPatch}`;
  const aside = [
    `<p class="cyoda-help-pinned"><em>cyoda-go version <a href="${htmlEscape(releaseUrl)}">${htmlEscape(pinnedPatch)}</a></em></p>`,
    '',
  ].join('\n');

  const sections = [];

  // Subtopics
  if (Array.isArray(t.children) && t.children.length > 0) {
    const lines = ['## Subtopics', ''];
    for (const childId of t.children) {
      const child = findByTopic(allTopics, childId);
      if (!child) continue;
      const childCli = ['cyoda', 'help', ...child.path].join(' ');
      const childUrl = `/${urlPrefix}help/${child.path.join('/').toLowerCase()}/`.replace(/\/+/g, '/');
      lines.push(`- [\`${childCli}\`](${childUrl}) — ${child.synopsis || ''}`);
    }
    lines.push('');
    sections.push(lines.join('\n'));
  }

  // See also
  if (Array.isArray(t.see_also) && t.see_also.length > 0) {
    const lines = ['## See also', ''];
    for (const peerId of t.see_also) {
      const peer = findByTopic(allTopics, peerId);
      if (!peer) {
        // Reference to a topic that isn't in the bundle — render a non-link entry.
        lines.push(`- \`cyoda help ${peerId.replaceAll('.', ' ')}\``);
        continue;
      }
      const peerCli = ['cyoda', 'help', ...peer.path].join(' ');
      const peerUrl = `/${urlPrefix}help/${peer.path.join('/').toLowerCase()}/`.replace(/\/+/g, '/');
      lines.push(`- [\`${peerCli}\`](${peerUrl}) — ${peer.synopsis || ''}`);
    }
    lines.push('');
    sections.push(lines.join('\n'));
  }

  // Raw formats
  const rawJson = `/${urlPrefix}help/${slugPath}.json`.replace(/\/+/g, '/');
  const rawMd = `/${urlPrefix}help/${slugPath}.md`.replace(/\/+/g, '/');
  sections.push([
    '## Raw formats',
    '',
    `- [\`${rawJson}\`](${rawJson}) — full descriptor (matches \`GET /help/{topic}\` envelope)`,
    `- [\`${rawMd}\`](${rawMd}) — body only`,
    '',
  ].join('\n'));

  // Body — emit verbatim, then a single blank-line separator before sections.
  const body = t.body.endsWith('\n') ? t.body : t.body + '\n';

  return [fm, aside, body, sections.join('\n')].join('\n');
}

function writeFileEnsuringDir(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function buildManifest(bundle) {
  return {
    schema: bundle.schema ?? 1,
    version: bundle.pinnedVersion,
    topics: bundle.topics.map(t => ({
      topic: t.topic,
      title: t.title,
      stability: t.stability ?? 'stable',
      tagline: t.synopsis ?? '',
      see_also: Array.isArray(t.see_also) ? t.see_also : [],
    })),
    _url_convention:
      'topic IDs use dots and may contain uppercase (e.g. "config.database", "errors.BAD_REQUEST"); to build the URL, replace dots with slashes and lowercase the result, e.g. /help/config/database/ or /help/errors/bad_request/.',
  };
}

function majorMinor(version) {
  // Accept "0.6.2" → "0.6", or non-semver fixture strings like "test" → "test".
  const parts = String(version).split('.');
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return `${parts[0]}.${parts[1]}`;
  }
  return String(version);
}

export function buildHelpLlmsTxt(bundle) {
  const pinnedLine = bundle.pinnedVersion
    ? `Pinned: cyoda-go v${bundle.pinnedVersion}`
    : 'Pinned: (cyoda-go help cache not yet built)';
  return [
    '## cyoda-go binary help (mirror of CLI `cyoda help` and live HTTP API `/api/help`)',
    '',
    pinnedLine,
    '',
    'Manifest:        https://docs.cyoda.net/help/index.json',
    'Per topic:       https://docs.cyoda.net/help/<slug>.json   (full descriptor)',
    '                 https://docs.cyoda.net/help/<slug>.md     (markdown body only)',
    '                 https://docs.cyoda.net/help/<slug>/       (rendered HTML)',
    'Version tree:    https://docs.cyoda.net/help/versions.json',
    '',
    'URL convention:  cyoda help A B C  ↔  /help/a/b/c/  (or .md / .json)',
    '                 Manifest topic IDs use dots and may be mixed-case',
    '                 (e.g. "config.database", "errors.BAD_REQUEST");',
    '                 replace dots with slashes AND lowercase to build the URL.',
    '',
    'Note: the manifest contains a non-API `_url_convention` hint field.',
    'Strict validators against the live cyoda-go GET /help schema should ignore it.',
    '',
  ].join('\n');
}

function buildVersionsRegistry(bundle, urlPrefix) {
  const mm = majorMinor(bundle.pinnedVersion);
  const root = `/${urlPrefix}help/`.replace(/\/+/g, '/');
  const manifest = `${root}index.json`;
  return {
    current: mm,
    versions: [
      {
        majorMinor: mm,
        pinnedPatch: bundle.pinnedVersion,
        current: true,
        manifest,
        root,
      },
    ],
  };
}

function checkSlugConflicts(topics) {
  const seen = new Map();
  for (const t of topics) {
    const slug = slugFor(t);
    if (seen.has(slug)) {
      throw err(
        'TopicSlugConflict',
        `topics ${seen.get(slug)} and ${t.topic} both derive slug "${slug}"`
      );
    }
    seen.set(slug, t.topic);
  }
}

/**
 * Generate static help mirror artefacts from the cached full bundle.
 *
 * @param {object} opts
 * @param {string} opts.fullDataPath  path to .cyoda-cache/cyoda-help-full.json
 * @param {string} opts.docsHelpDir   src/content/docs/help/  (for per-topic .md pages)
 * @param {string} opts.publicHelpDir public/help/            (for .json/.md/manifest)
 * @param {string} [opts.prefix]      optional URL prefix segment, e.g. "v0.6/"
 *                                    (default empty for current frontline tree)
 */
export async function run({ fullDataPath, docsHelpDir, publicHelpDir, prefix = '' }) {
  // Self-enforce the contract: prefix is empty or ends with '/'.
  prefix = prefix && !prefix.endsWith('/') ? prefix + '/' : prefix;
  if (!fs.existsSync(fullDataPath)) {
    throw err(
      'MissingFullData',
      `${fullDataPath} not found. Run scripts/fetch-cyoda-help-index.js first to populate the cache.`
    );
  }
  const raw = fs.readFileSync(fullDataPath, 'utf8');
  const bundle = JSON.parse(raw);

  if (!Array.isArray(bundle.topics)) {
    throw err(
      'MalformedTopic',
      `bundle.topics is not an array (got ${typeof bundle.topics}). The cache file at ${fullDataPath} is malformed.`
    );
  }

  for (const t of bundle.topics) {
    // Check reserved segments first so a version-style segment (e.g. "v0.6")
    // gets ReservedTopicSegment rather than MalformedTopic (the dot fails SEGMENT_RE).
    if (Array.isArray(t.path) && t.path.length > 0) {
      checkReservedSegment(t);
    }
    validateTopic(t);
  }
  checkSlugConflicts(bundle.topics);

  const pinnedPatch = bundle.pinnedVersion;
  const urlPrefix = prefix; // empty by default

  // --- Stage all outputs into side temp dirs ---
  // Temp dirs are created as siblings of the destination dirs so the staged
  // files and final destinations live on the same filesystem; this keeps the
  // per-file `fs.renameSync` atomic (POSIX rename(2)). If a caller passes
  // destination paths whose parent is on a different filesystem from the
  // children, renameSync will throw EXDEV — that is not a supported
  // configuration today.
  const docsTmp = fs.mkdtempSync(path.join(path.dirname(docsHelpDir), `.help-tmp-docs-${process.pid}-`));
  const publicTmp = fs.mkdtempSync(path.join(path.dirname(publicHelpDir), `.help-tmp-public-${process.pid}-`));

  let stagedDocs = [];
  let stagedPublic = [];

  try {
    for (const t of bundle.topics) {
      // On-disk paths are lowercased so the rendered Starlight URL
      // (which lowercases route segments anyway) and the static-asset
      // URL agree. Without this, an uppercase topic ID like
      // errors.BAD_REQUEST writes BAD_REQUEST.md to disk but Astro
      // routes the page at /errors/bad_request/, breaking every
      // generated link to it.
      const lowerPath = t.path.map(s => s.toLowerCase());

      const pageRel = path.join(...lowerPath) + '.md';
      writeFileEnsuringDir(path.join(docsTmp, pageRel), renderPage(t, bundle.topics, pinnedPatch, urlPrefix));
      stagedDocs.push(pageRel);

      const descRel = path.join(...lowerPath) + '.json';
      writeFileEnsuringDir(path.join(publicTmp, descRel), JSON.stringify(t, null, 2) + '\n');
      stagedPublic.push(descRel);

      const rawMdRel = path.join(...lowerPath) + '.md';
      writeFileEnsuringDir(path.join(publicTmp, rawMdRel), t.body.endsWith('\n') ? t.body : t.body + '\n');
      stagedPublic.push(rawMdRel);
    }

    writeFileEnsuringDir(path.join(publicTmp, 'index.json'), JSON.stringify(buildManifest(bundle), null, 2) + '\n');
    stagedPublic.push('index.json');

    writeFileEnsuringDir(path.join(publicTmp, 'versions.json'), JSON.stringify(buildVersionsRegistry(bundle, urlPrefix), null, 2) + '\n');
    stagedPublic.push('versions.json');

    writeFileEnsuringDir(path.join(publicTmp, 'llms.txt'), buildHelpLlmsTxt(bundle));
    stagedPublic.push('llms.txt');
  } catch (e) {
    fs.rmSync(docsTmp, { recursive: true, force: true });
    fs.rmSync(publicTmp, { recursive: true, force: true });
    throw err('IOFailed', `staging failed: ${e.message}`);
  }

  // --- Promote staged files into final locations (per-file rename) ---
  fs.mkdirSync(docsHelpDir, { recursive: true });
  fs.mkdirSync(publicHelpDir, { recursive: true });

  function removeOrphans(dir, keep, skipTopLevel) {
    // baseRel === null means "we are at the top of `dir`"; otherwise it is
    // the path-relative-to-`dir` of the directory currently being walked.
    function walk(d, baseRel) {
      if (!fs.existsSync(d)) return;
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const rel = baseRel === null ? entry.name : path.join(baseRel, entry.name);
        const abs = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(abs, rel);
          // Remove now-empty directory.
          if (fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
        } else {
          if (skipTopLevel && baseRel === null && skipTopLevel.has(entry.name)) continue;
          if (!keep.has(path.normalize(rel))) fs.unlinkSync(abs);
        }
      }
    }
    walk(dir, null);
  }

  try {
    for (const rel of stagedDocs) {
      const dest = path.join(docsHelpDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(path.join(docsTmp, rel), dest);
    }
    for (const rel of stagedPublic) {
      const dest = path.join(publicHelpDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(path.join(publicTmp, rel), dest);
    }

    // --- Orphan removal in destination trees ---
    const docsKeep = new Set(stagedDocs.map(p => path.normalize(p)));
    const publicKeep = new Set(stagedPublic.map(p => path.normalize(p)));
    const HAND_AUTHORED_DOCS = new Set(['index.mdx', 'topic-tree.mdx']);

    removeOrphans(docsHelpDir, docsKeep, HAND_AUTHORED_DOCS);
    removeOrphans(publicHelpDir, publicKeep, null);
  } finally {
    // Cleanup temp dirs even if promotion or orphan removal threw.
    fs.rmSync(docsTmp, { recursive: true, force: true });
    fs.rmSync(publicTmp, { recursive: true, force: true });
  }

  return { topicCount: bundle.topics.length };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  const projectRoot = path.resolve(__dirname, '..');
  const fullDataPath = path.join(projectRoot, '.cyoda-cache', 'cyoda-help-full.json');
  const docsHelpDir = path.join(projectRoot, 'src', 'content', 'docs', 'help');
  const publicHelpDir = path.join(projectRoot, 'public', 'help');
  const prefix = (process.argv.find(a => a.startsWith('--prefix=')) || '--prefix=').slice('--prefix='.length);
  try {
    const result = await run({ fullDataPath, docsHelpDir, publicHelpDir, prefix });
    console.log(`✅ Generated help mirror (${result.topicCount} topics, prefix=${prefix || '<empty>'})`);
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}
