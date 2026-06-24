import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { run } from './generate-help-pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '..', 'tests', 'fixtures', 'help-pages');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('MissingFullData: full bundle file does not exist', async () => {
  const err = await run({
    fullDataPath: '/nonexistent/cyoda-help-full.json',
    docsHelpDir: tmpDir('docs'),
    publicHelpDir: tmpDir('public'),
    prefix: '',
  }).catch(e => e);
  assert.match(err.message, /MissingFullData/);
});

function writeBundle(dir, bundle) {
  const file = path.join(dir, 'cyoda-help-full.json');
  fs.writeFileSync(file, JSON.stringify(bundle));
  return file;
}

test('MalformedTopic: topic field does not equal path.join(".")', async () => {
  const cacheDir = tmpDir('cache');
  const file = writeBundle(cacheDir, {
    pinnedVersion: 'test', schema: 1,
    topics: [{
      topic: 'wrong', path: ['config', 'database'],
      title: 'x', body: '# x\n', synopsis: '',
      sections: [], see_also: [], stability: 'stable', actions: [], children: [],
    }],
  });
  const err = await run({
    fullDataPath: file, docsHelpDir: tmpDir('docs'), publicHelpDir: tmpDir('public'), prefix: '',
  }).catch(e => e);
  assert.match(err.message, /MalformedTopic/);
  assert.match(err.message, /topic === path\.join/);
});

test('ReservedTopicSegment: first segment is a version pattern', async () => {
  const cacheDir = tmpDir('cache');
  const file = writeBundle(cacheDir, {
    pinnedVersion: 'test', schema: 1,
    topics: [{
      topic: 'v0.6', path: ['v0.6'],
      title: 'x', body: '# x\n', synopsis: '',
      sections: [], see_also: [], stability: 'stable', actions: [], children: [],
    }],
  });
  const err = await run({
    fullDataPath: file, docsHelpDir: tmpDir('docs'), publicHelpDir: tmpDir('public'), prefix: '',
  }).catch(e => e);
  assert.match(err.message, /ReservedTopicSegment/);
});

test('ReservedTopicSegment: first segment is "index"', async () => {
  const cacheDir = tmpDir('cache');
  const file = writeBundle(cacheDir, {
    pinnedVersion: 'test', schema: 1,
    topics: [{
      topic: 'index', path: ['index'],
      title: 'x', body: '# x\n', synopsis: '',
      sections: [], see_also: [], stability: 'stable', actions: [], children: [],
    }],
  });
  const err = await run({
    fullDataPath: file, docsHelpDir: tmpDir('docs'), publicHelpDir: tmpDir('public'), prefix: '',
  }).catch(e => e);
  assert.match(err.message, /ReservedTopicSegment/);
});

test('ReservedTopicSegment: first segment is "topic-tree"', async () => {
  const cacheDir = tmpDir('cache');
  const file = writeBundle(cacheDir, {
    pinnedVersion: 'test', schema: 1,
    topics: [{
      topic: 'topic-tree', path: ['topic-tree'],
      title: 'x', body: '# x\n', synopsis: '',
      sections: [], see_also: [], stability: 'stable', actions: [], children: [],
    }],
  });
  const err = await run({
    fullDataPath: file, docsHelpDir: tmpDir('docs'), publicHelpDir: tmpDir('public'), prefix: '',
  }).catch(e => e);
  assert.match(err.message, /ReservedTopicSegment/);
});

test('TopicSlugConflict: two distinct topics derive the same slug', async () => {
  const cacheDir = tmpDir('cache');
  // case-fold collision exercises slug normalization
  const file = writeBundle(cacheDir, {
    pinnedVersion: 'test', schema: 1,
    topics: [
      {
        topic: 'A.b', path: ['A', 'b'],
        title: 'first', body: '# first\n', synopsis: '',
        sections: [], see_also: [], stability: 'stable', actions: [], children: [],
      },
      {
        topic: 'a.B', path: ['a', 'B'],
        title: 'second', body: '# second\n', synopsis: '',
        sections: [], see_also: [], stability: 'stable', actions: [], children: [],
      },
    ],
  });
  const err = await run({
    fullDataPath: file, docsHelpDir: tmpDir('docs'), publicHelpDir: tmpDir('public'), prefix: '',
  }).catch(e => e);
  assert.match(err.message, /TopicSlugConflict/);
});

test('MalformedTopic: bundle.topics is not an array', async () => {
  const cacheDir = tmpDir('cache');
  const file = writeBundle(cacheDir, { pinnedVersion: 'test', schema: 1, topics: null });
  const err = await run({
    fullDataPath: file, docsHelpDir: tmpDir('docs'), publicHelpDir: tmpDir('public'), prefix: '',
  }).catch(e => e);
  assert.match(err.message, /MalformedTopic/);
  assert.match(err.message, /bundle\.topics is not an array/);
});

test('writes per-topic .md page with frontmatter, aside, body, and Raw formats', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.minimal.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '',
  });
  const pagePath = path.join(docsHelpDir, 'cli.md');
  const content = fs.readFileSync(pagePath, 'utf8');

  // frontmatter
  assert.match(content, /^---\n/);
  assert.match(content, /\ntitle: "cli — the cyoda command-line interface"\n/);
  assert.match(content, /\nsidebar:\n {2}hidden: true\n/);

  // subtle version indicator (single small italic line, not a Starlight aside)
  assert.match(content, /<p class="cyoda-help-pinned"><em>cyoda-go version <a href="https:\/\/github\.com\/Cyoda\/cyoda-go\/releases\/tag\/v[\d.]+">[\d.]+<\/a><\/em><\/p>/);
  // No prominent Starlight aside.
  assert.ok(!/:::note\[/.test(content), 'expected no Starlight :::note aside');

  // body verbatim
  assert.match(content, /## NAME/);
  assert.match(content, /cli — the cyoda command-line interface\./);

  // raw formats section
  assert.match(content, /## Raw formats/);
  assert.match(content, /\/help\/cli\.json/);
  assert.match(content, /\/help\/cli\.md/);
});

test('version indicator HTML-escapes the pinned version (defense in depth)', async () => {
  // parsePinFile rejects non-semver up front, but the generator
  // should still escape pinnedVersion when emitting it into HTML so a
  // weaker upstream can never inject attribute or element markup here.
  const cacheDir = tmpDir('cache');
  const file = writeBundle(cacheDir, {
    pinnedVersion: '0.6.2"><script>alert(1)</script>',
    schema: 1,
    topics: [{
      topic: 'cli', path: ['cli'],
      title: 'cli', body: '# cli\n', synopsis: 's',
      sections: [], see_also: [], stability: 'stable', actions: [], children: [],
    }],
  });
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: file, docsHelpDir, publicHelpDir, prefix: '',
  });
  const page = fs.readFileSync(path.join(docsHelpDir, 'cli.md'), 'utf8');
  // The dangerous characters must be entity-encoded.
  assert.ok(!page.includes('"><script>'), 'raw "><script> appears unescaped in the rendered page');
  assert.ok(!page.includes('alert(1)</script>'), 'raw </script> appears unescaped');
  // Verify positive escaping happened.
  assert.match(page, /&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('multi-segment topic produces nested .md page with Subtopics and See also', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.with-children.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '',
  });

  // Parent page has Subtopics
  const parent = fs.readFileSync(path.join(docsHelpDir, 'config.md'), 'utf8');
  assert.match(parent, /## Subtopics/);
  assert.match(parent, /cyoda help config database/);

  // Child page is at config/database.md and has See also
  const child = fs.readFileSync(path.join(docsHelpDir, 'config', 'database.md'), 'utf8');
  assert.match(child, /## See also/);
  assert.match(child, /cyoda help config/);
  assert.match(child, /cyoda help run/);
});

test('prefix without trailing slash is normalized', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.minimal.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: 'v0.6',  // missing trailing slash
  });
  const page = fs.readFileSync(path.join(docsHelpDir, 'cli.md'), 'utf8');
  // No malformed URL like /v0.6help/...
  assert.ok(!/\/v0\.6help\//.test(page), 'prefix without trailing slash produced malformed URL');
  // Normalized form appears.
  assert.match(page, /\/v0\.6\/help\/cli\.json/);
});

test('writes per-topic JSON descriptor with live-API shape', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.with-children.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '',
  });
  const desc = JSON.parse(fs.readFileSync(path.join(publicHelpDir, 'config', 'database.json'), 'utf8'));
  assert.equal(desc.topic, 'config.database');
  assert.deepEqual(desc.path, ['config', 'database']);
  assert.equal(desc.title, 'database configuration');
  assert.equal(typeof desc.body, 'string');
  assert.ok(desc.body.length > 0);
  assert.deepEqual(desc.see_also, ['config', 'run']);
  assert.equal(desc.stability, 'stable');
  assert.deepEqual(desc.children, []);
});

test('writes per-topic raw markdown body, no frontmatter, byte-equal to body', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.minimal.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '',
  });
  const raw = fs.readFileSync(path.join(publicHelpDir, 'cli.md'), 'utf8');
  const expected = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).topics[0].body;
  assert.equal(raw, expected.endsWith('\n') ? expected : expected + '\n');
  // No frontmatter.
  assert.ok(!raw.startsWith('---'));
});

test('writes manifest at public/help/index.json with live-API envelope', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.with-children.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '',
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(publicHelpDir, 'index.json'), 'utf8'));
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.version, '0.6.1');
  assert.ok(Array.isArray(manifest.topics));
  assert.equal(manifest.topics.length, 2);
  for (const t of manifest.topics) {
    assert.ok(t.topic);
    assert.ok(t.title);
    assert.ok(t.stability);
    assert.equal(typeof t.tagline, 'string');
    assert.ok(Array.isArray(t.see_also));
    assert.ok(!('body' in t), 'manifest must not include body');
  }
  // dotted topic IDs preserved
  assert.deepEqual(manifest.topics.map(t => t.topic).sort(), ['config', 'config.database']);
  // hint field
  assert.ok(typeof manifest._url_convention === 'string');
  assert.match(manifest._url_convention, /replace dots with slashes/i);
});

test('writes versions.json with single current entry today', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.minimal.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '',
  });
  const v = JSON.parse(fs.readFileSync(path.join(publicHelpDir, 'versions.json'), 'utf8'));
  assert.equal(v.current, '0.6');
  assert.equal(v.versions.length, 1);
  assert.equal(v.versions[0].majorMinor, '0.6');
  assert.equal(v.versions[0].pinnedPatch, '0.6.1');
  assert.equal(v.versions[0].current, true);
  assert.equal(v.versions[0].manifest, '/help/index.json');
  assert.equal(v.versions[0].root, '/help/');
});

test('writes /help/llms.txt advertising manifest, conventions, raw formats', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.minimal.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '',
  });
  const txt = fs.readFileSync(path.join(publicHelpDir, 'llms.txt'), 'utf8');
  assert.match(txt, /\/help\/index\.json/);
  assert.match(txt, /\/help\/<slug>\.json/);
  assert.match(txt, /\/help\/<slug>\.md/);
  assert.match(txt, /\/help\/versions\.json/);
  assert.match(txt, /replace dots with slashes/i);
  assert.match(txt, /Pinned: cyoda-go v/);
  assert.match(txt, /_url_convention/);  // strict-validator note
});

test('body containing literal {…} and <…> round-trips through .md without mangling', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.literals.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '',
  });
  const page = fs.readFileSync(path.join(docsHelpDir, 'openapi.md'), 'utf8');
  // Literals appear verbatim in the page (inside their original code fence).
  assert.match(page, /\{CYODA_CONTEXT_PATH\}\/help\/\{topic\}/);
  assert.match(page, /cyoda \[<subcommand>\] \[<flags>\]/);
  assert.match(page, /<topic>/);

  // Raw markdown sibling is byte-equal to body.
  const raw = fs.readFileSync(path.join(publicHelpDir, 'openapi.md'), 'utf8');
  const expected = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).topics[0].body;
  assert.equal(raw, expected.endsWith('\n') ? expected : expected + '\n');
});

test('idempotency: two consecutive runs over the same input produce identical outputs', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.with-children.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');

  await run({ fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '' });
  const after1 = readAllFiles(docsHelpDir).concat(readAllFiles(publicHelpDir));

  await run({ fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '' });
  const after2 = readAllFiles(docsHelpDir).concat(readAllFiles(publicHelpDir));

  assert.deepEqual(after2, after1);
});

test('orphan removal: topic absent from new bundle gets unlinked', async () => {
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  const cacheDir = tmpDir('cache');

  // First run: two-topic bundle.
  const file1 = writeBundle(cacheDir, JSON.parse(fs.readFileSync(path.join(fixtureDir, 'help-full.with-children.json'), 'utf8')));
  await run({ fullDataPath: file1, docsHelpDir, publicHelpDir, prefix: '' });
  assert.ok(fs.existsSync(path.join(docsHelpDir, 'config', 'database.md')));
  assert.ok(fs.existsSync(path.join(publicHelpDir, 'config', 'database.json')));

  // Second run: bundle without the child topic.
  const file2 = writeBundle(cacheDir, {
    pinnedVersion: '0.6.1', schema: 1,
    topics: [
      JSON.parse(fs.readFileSync(path.join(fixtureDir, 'help-full.with-children.json'), 'utf8')).topics[0],
    ],
  });
  await run({ fullDataPath: file2, docsHelpDir, publicHelpDir, prefix: '' });
  assert.ok(!fs.existsSync(path.join(docsHelpDir, 'config', 'database.md')), 'orphan page should be removed');
  assert.ok(!fs.existsSync(path.join(publicHelpDir, 'config', 'database.json')), 'orphan json should be removed');
  assert.ok(!fs.existsSync(path.join(publicHelpDir, 'config', 'database.md')), 'orphan raw md should be removed');
});

test('hand-authored files preserved across runs', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.minimal.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');

  // Pre-seed with hand-authored files at the docsHelpDir root.
  fs.writeFileSync(path.join(docsHelpDir, 'index.mdx'), '---\ntitle: Help\n---\n\nLanding.\n');
  fs.writeFileSync(path.join(docsHelpDir, 'topic-tree.mdx'), '---\ntitle: Topic tree\n---\n\nTree.\n');

  await run({ fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: '' });

  assert.equal(fs.readFileSync(path.join(docsHelpDir, 'index.mdx'), 'utf8'), '---\ntitle: Help\n---\n\nLanding.\n');
  assert.equal(fs.readFileSync(path.join(docsHelpDir, 'topic-tree.mdx'), 'utf8'), '---\ntitle: Topic tree\n---\n\nTree.\n');
});

test('--prefix=v0.6/ writes under that prefix in URLs and version registry root', async () => {
  const fixturePath = path.join(fixtureDir, 'help-full.minimal.json');
  const docsHelpDir = tmpDir('docs');
  const publicHelpDir = tmpDir('public');
  await run({
    fullDataPath: fixturePath, docsHelpDir, publicHelpDir, prefix: 'v0.6/',
  });
  // Files still land at the same disk paths — prefix only affects URLs in content.
  assert.ok(fs.existsSync(path.join(docsHelpDir, 'cli.md')));
  // The page links use the prefix.
  const page = fs.readFileSync(path.join(docsHelpDir, 'cli.md'), 'utf8');
  assert.match(page, /\/v0\.6\/help\/cli\.json/);
  // versions.json root reflects the prefix.
  const v = JSON.parse(fs.readFileSync(path.join(publicHelpDir, 'versions.json'), 'utf8'));
  assert.equal(v.versions[0].root, '/v0.6/help/');
  assert.equal(v.versions[0].manifest, '/v0.6/help/index.json');
});

// Helper used above.
function readAllFiles(dir) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push({ path: path.relative(dir, p), content: fs.readFileSync(p, 'utf8') });
    }
  }
  walk(dir);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
