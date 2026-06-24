import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { run } from './fetch-cyoda-help-index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '..', 'tests', 'fixtures', 'help');

function tmpVersionFile(version) {
  const file = path.join(os.tmpdir(), `cyoda-go-version-${Date.now()}-${Math.random()}.json`);
  if (version !== undefined) fs.writeFileSync(file, JSON.stringify({ version }));
  return file;
}

function tmpOutputFile() {
  return path.join(os.tmpdir(), `help-index-${Date.now()}-${Math.random()}.json`);
}

function tmpFullOutputFile() {
  return path.join(os.tmpdir(), `help-full-${Date.now()}-${Math.random()}.json`);
}

function makeFetch(responses) {
  // responses: { [url]: { status, text, throw? } }
  return async (url) => {
    const r = responses[url];
    if (!r) throw new Error(`unexpected fetch: ${url}`);
    if (r.throw) throw r.throw;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => r.text,
    };
  };
}

// Tests use a real-looking semver because parsePinFile now requires
// a strict semver shape. The actual upstream isn't hit — the fetch is
// stubbed via makeFetch().
const TEST_VERSION = '0.0.1-test';
const JSON_URL = `https://github.com/Cyoda/cyoda-go/releases/download/v${TEST_VERSION}/cyoda_help_${TEST_VERSION}.json`;
const SUMS_URL = `https://github.com/Cyoda/cyoda-go/releases/download/v${TEST_VERSION}/SHA256SUMS`;

const validJson = fs.readFileSync(path.join(fixtureDir, 'help.valid.json'), 'utf8');
const malformedJson = fs.readFileSync(path.join(fixtureDir, 'help.malformed.json'), 'utf8');
const sumsValid = fs.readFileSync(path.join(fixtureDir, 'SHA256SUMS.valid'), 'utf8');
const sumsWrong = fs.readFileSync(path.join(fixtureDir, 'SHA256SUMS.wrong'), 'utf8');
const sumsMissing = fs.readFileSync(path.join(fixtureDir, 'SHA256SUMS.missing-entry'), 'utf8');

test('happy path: writes sorted slim index AND full bundle', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const outputFile = tmpOutputFile();
  const fullOutputFile = tmpFullOutputFile();
  await run({
    fetch: makeFetch({
      [JSON_URL]: { status: 200, text: validJson },
      [SUMS_URL]: { status: 200, text: sumsValid },
    }),
    versionFilePath: versionFile,
    outputPath: outputFile,
    fullOutputPath: fullOutputFile,
  });

  // --- slim file: unchanged shape ---
  const slim = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.equal(slim.pinnedVersion, TEST_VERSION);
  assert.equal(slim.schema, 1);
  assert.equal(slim.topics.length, 3);
  // sort order pinned by stripAndSort: by path.join('/') ascending
  assert.deepEqual(slim.topics.map(t => t.path.join('/')), ['cli', 'search', 'search/async']);
  for (const t of slim.topics) {
    assert.ok(!('body' in t), `slim topic ${t.path.join('/')} still has body`);
    assert.ok(t.synopsis);
  }

  // --- full file: new ---
  const full = JSON.parse(fs.readFileSync(fullOutputFile, 'utf8'));
  assert.equal(full.pinnedVersion, TEST_VERSION);
  assert.equal(full.schema, 1);
  assert.equal(full.topics.length, 3);
  for (const t of full.topics) {
    assert.ok(typeof t.body === 'string' && t.body.length > 0,
      `full topic ${t.path.join('/')} missing body`);
    assert.ok(Array.isArray(t.path));
    assert.ok(t.title);
  }

  fs.rmSync(versionFile);
  fs.rmSync(outputFile);
  fs.rmSync(fullOutputFile);
});

test('InvalidVersionPin: missing pin file', async () => {
  const err = await run({
    fetch: makeFetch({}),
    versionFilePath: '/nonexistent/cyoda-go-version.json',
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.ok(err instanceof Error);
  assert.match(err.message, /InvalidVersionPin/);
});

test('InvalidVersionPin: malformed pin file', async () => {
  const versionFile = path.join(os.tmpdir(), `pin-bad-${Date.now()}.json`);
  fs.writeFileSync(versionFile, '{ not json }');
  const err = await run({
    fetch: makeFetch({}),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /InvalidVersionPin/);
  fs.rmSync(versionFile);
});

test('InvalidVersionPin: parse-error message includes pin-file path', async () => {
  const versionFile = path.join(os.tmpdir(), `pin-path-check-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(versionFile, '{ not json }');
  const err = await run({
    fetch: makeFetch({}),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /InvalidVersionPin/);
  assert.ok(err.message.includes(versionFile), `expected pin-file path in message; got: ${err.message}`);
  fs.rmSync(versionFile);
});

test('InvalidVersionPin: version starts with "v"', async () => {
  const versionFile = tmpVersionFile('v0.6.1');
  const err = await run({
    fetch: makeFetch({}),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /InvalidVersionPin/);
  assert.match(err.message, /must not start with "v"/);
  assert.ok(err.message.includes(versionFile), `expected pin-file path in message; got: ${err.message}`);
  fs.rmSync(versionFile);
});

test('InvalidVersionPin: non-semver version is rejected (defense in depth)', async () => {
  // The version flows into outbound URLs and rendered HTML. Reject anything
  // that isn't a strict MAJOR.MINOR.PATCH (with optional -prerelease/+build).
  const cases = [
    'test',                           // bare word
    '0.6',                            // no patch
    '0.6.2"><script>alert(1)</script>', // attribute-injection attempt
    '0.6.2/../evil',                  // path traversal
    '0.6.2 0.6.2',                    // whitespace
  ];
  for (const bad of cases) {
    const versionFile = tmpVersionFile(bad);
    const err = await run({
      fetch: makeFetch({}),
      versionFilePath: versionFile,
      outputPath: tmpOutputFile(),
    }).catch(e => e);
    assert.match(err.message, /InvalidVersionPin/, `expected InvalidVersionPin for ${JSON.stringify(bad)}, got: ${err.message}`);
    assert.match(err.message, /strict semver/, `expected "strict semver" hint for ${JSON.stringify(bad)}; got: ${err.message}`);
    fs.rmSync(versionFile);
  }
});

test('InvalidVersionPin accepts semver variants', async () => {
  // Sanity: prerelease and build metadata are accepted.
  for (const good of ['0.6.2', '1.0.0-alpha', '1.0.0-rc.1', '1.0.0+build.5']) {
    const versionFile = tmpVersionFile(good);
    // Stub fetch with a 404 — we just want to get past parsePinFile.
    const err = await run({
      fetch: makeFetch({}),
      versionFilePath: versionFile,
      outputPath: tmpOutputFile(),
    }).catch(e => e);
    assert.doesNotMatch(err.message, /InvalidVersionPin/, `${JSON.stringify(good)} should pass parsePinFile, got: ${err.message}`);
    fs.rmSync(versionFile);
  }
});

test('FetchFailed: network error on help asset', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const err = await run({
    fetch: makeFetch({
      [JSON_URL]: { throw: new Error('ECONNREFUSED') },
    }),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /FetchFailed/);
  fs.rmSync(versionFile);
});

test('ReleaseNotFound: 404 on help asset', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const err = await run({
    fetch: makeFetch({
      [JSON_URL]: { status: 404, text: 'Not Found' },
    }),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /ReleaseNotFound/);
  fs.rmSync(versionFile);
});

test('IntegrityManifestMissing: 404 on SHA256SUMS', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const err = await run({
    fetch: makeFetch({
      [JSON_URL]: { status: 200, text: validJson },
      [SUMS_URL]: { status: 404, text: 'Not Found' },
    }),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /IntegrityManifestMissing/);
  fs.rmSync(versionFile);
});

test('IntegrityManifestIncomplete: SHA256SUMS lacks the filename', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const err = await run({
    fetch: makeFetch({
      [JSON_URL]: { status: 200, text: validJson },
      [SUMS_URL]: { status: 200, text: sumsMissing },
    }),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /IntegrityManifestIncomplete/);
  fs.rmSync(versionFile);
});

test('IntegrityCheckFailed: wrong checksum', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const err = await run({
    fetch: makeFetch({
      [JSON_URL]: { status: 200, text: validJson },
      [SUMS_URL]: { status: 200, text: sumsWrong },
    }),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /IntegrityCheckFailed/);
  fs.rmSync(versionFile);
});

test('HelpJsonMalformed: missing topics array', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  // checksum must validate, so regenerate SHA256SUMS line for the malformed fixture
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update(malformedJson).digest('hex');
  const err = await run({
    fetch: makeFetch({
      [JSON_URL]: { status: 200, text: malformedJson },
      [SUMS_URL]: { status: 200, text: `${sha}  cyoda_help_${TEST_VERSION}.json\n` },
    }),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /HelpJsonMalformed/);
  fs.rmSync(versionFile);
});

test('HelpJsonMalformed: topic with empty path array', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const malformed = JSON.stringify({
    schema: 1,
    version: 'x',
    topics: [{ path: [], title: 'no path', synopsis: 's' }],
  });
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update(malformed).digest('hex');
  const err = await run({
    fetch: makeFetch({
      [JSON_URL]: { status: 200, text: malformed },
      [SUMS_URL]: { status: 200, text: `${sha}  cyoda_help_${TEST_VERSION}.json\n` },
    }),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /HelpJsonMalformed/);
  fs.rmSync(versionFile);
});

test('HelpJsonBodyMissing: full output requested, but a topic lacks body', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const noBodyJson = JSON.stringify({
    schema: 1,
    version: 'x',
    topics: [
      { topic: 'a', path: ['a'], title: 'A', synopsis: 's' },  // no body
    ],
  });
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update(noBodyJson).digest('hex');
  const err = await run({
    fetch: makeFetch({
      [JSON_URL]: { status: 200, text: noBodyJson },
      [SUMS_URL]: { status: 200, text: `${sha}  cyoda_help_${TEST_VERSION}.json\n` },
    }),
    versionFilePath: versionFile,
    outputPath: tmpOutputFile(),
    fullOutputPath: tmpFullOutputFile(),
  }).catch(e => e);
  assert.match(err.message, /HelpJsonBodyMissing/);
  assert.match(err.message, /\btopic a\b/);
  fs.rmSync(versionFile);
});

test('--if-missing: short-circuits when output exists', async () => {
  const versionFile = tmpVersionFile(TEST_VERSION);
  const outputFile = tmpOutputFile();
  fs.writeFileSync(outputFile, '{"pinnedVersion":"already-here","topics":[]}');
  let fetchCalled = false;
  await run({
    fetch: async () => { fetchCalled = true; throw new Error('should not be called'); },
    versionFilePath: versionFile,
    outputPath: outputFile,
    ifMissing: true,
  });
  assert.equal(fetchCalled, false);
  // File left untouched
  assert.equal(JSON.parse(fs.readFileSync(outputFile, 'utf8')).pinnedVersion, 'already-here');
  fs.rmSync(versionFile);
  fs.rmSync(outputFile);
});
