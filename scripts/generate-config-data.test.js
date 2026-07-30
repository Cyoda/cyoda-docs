import { test } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeConfig, run } from './generate-config-data.js';

test('sorts vars by topic then name', () => {
  const out = normalizeConfig({
    schema: 1,
    version: 'dev',
    vars: [
      { name: 'CYODA_B', topic: 'server', type: 'int', default: '8080', description: 'b' },
      { name: 'CYODA_A', topic: 'admin', type: 'string', default: '127.0.0.1', description: 'a' },
      { name: 'CYODA_C', topic: 'admin', type: 'bool', default: 'false', description: 'c' },
    ],
  });
  assert.deepEqual(out.vars.map((v) => `${v.topic}/${v.name}`), [
    'admin/CYODA_A',
    'admin/CYODA_C',
    'server/CYODA_B',
  ]);
});

test('tolerates empty type and absent default (renders blank strings)', () => {
  const out = normalizeConfig({
    schema: 1,
    version: 'dev',
    vars: [{ name: 'CYODA_POSTGRES_URL', topic: 'database', description: 'x' }],
  });
  assert.equal(out.vars[0].type, '');
  assert.equal(out.vars[0].default, '');
  assert.equal(out.vars[0].description, 'x');
});

test('coerces non-string default to string', () => {
  const out = normalizeConfig({
    schema: 1,
    version: 'dev',
    vars: [{ name: 'CYODA_N', topic: 'search', type: 'int', default: 16, description: 'n' }],
  });
  assert.equal(out.vars[0].default, '16');
});

test('rejects unsupported schema', () => {
  assert.throws(() => normalizeConfig({ schema: 2, version: 'x', vars: [] }), /ConfigSchemaUnsupported/);
});

test('rejects empty vars array', () => {
  assert.throws(() => normalizeConfig({ schema: 1, version: 'x', vars: [] }), /ConfigMalformed/);
});

test('rejects a var missing name', () => {
  assert.throws(
    () => normalizeConfig({ schema: 1, version: 'x', vars: [{ topic: 'admin' }] }),
    /ConfigVarMalformed/
  );
});

test('rejects a var missing topic', () => {
  assert.throws(
    () => normalizeConfig({ schema: 1, version: 'x', vars: [{ name: 'CYODA_X' }] }),
    /ConfigVarMalformed/
  );
});

// ---------------------------------------------------------------------------
// run(): live binary output
// ---------------------------------------------------------------------------

function tmpVersionFile(version) {
  const file = path.join(os.tmpdir(), `cyoda-go-version-config-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify({ version }));
  return file;
}

const FAKE_CONFIG_ALL = JSON.stringify({
  schema: 1,
  version: 'test-pin',
  vars: [
    { name: 'CYODA_SCHEDULER_ENABLED', topic: 'scheduler', type: 'bool', default: 'true', description: 'kill switch' },
    { name: 'CYODA_ADMIN_PORT', topic: 'admin', type: 'int', default: '9091', description: 'admin port' },
  ],
});

/**
 * spawnSync stub:
 *  - ['--version'] → version string (ensureBinary system fast-path)
 *  - ['help','config','all','--format=json'] → FAKE_CONFIG_ALL
 */
function makeSpawnSync(version) {
  return (cmd, args) => {
    if (args && args.includes('--version')) {
      return { status: 0, stdout: `cyoda version ${version} (commit abc)`, stderr: '' };
    }
    if (args && args[0] === 'help' && args[1] === 'config' && args[2] === 'all') {
      return { status: 0, stdout: FAKE_CONFIG_ALL, stderr: '' };
    }
    return { status: 1, stdout: '', stderr: 'unexpected call' };
  };
}

test('run: emits normalized vars from live binary output', async () => {
  const versionFile = tmpVersionFile('test-pin');
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyoda-config-test-'));
  const outputPath = path.join(tmpdir, 'cyoda-config-all.json');

  await run({
    fetch: async () => { throw new Error('fetch should not be called in fast-path'); },
    spawnSync: makeSpawnSync('test-pin'),
    versionFilePath: versionFile,
    outputPath,
    cacheDir: path.join(tmpdir, 'cache'),
    platformHint: { platform: 'darwin', arch: 'arm64' },
  });

  const emitted = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(emitted.version, 'test-pin', 'version comes from the pinned binary');
  assert.deepEqual(
    emitted.vars.map((v) => v.name),
    ['CYODA_ADMIN_PORT', 'CYODA_SCHEDULER_ENABLED'],
    'vars are sorted by topic then name'
  );

  fs.rmSync(tmpdir, { recursive: true });
  fs.rmSync(versionFile);
});

test('run: a non-zero binary exit fails the build', async () => {
  const versionFile = tmpVersionFile('test-pin');
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyoda-config-test-'));

  await assert.rejects(
    run({
      fetch: async () => { throw new Error('fetch should not be called'); },
      spawnSync: (cmd, args) =>
        args && args.includes('--version')
          ? { status: 0, stdout: 'cyoda version test-pin (commit abc)', stderr: '' }
          : { status: 1, stdout: '', stderr: 'unknown command "all"' },
      versionFilePath: versionFile,
      outputPath: path.join(tmpdir, 'out.json'),
      cacheDir: path.join(tmpdir, 'cache'),
      platformHint: { platform: 'darwin', arch: 'arm64' },
    }),
    /BinaryExecutionFailed/
  );

  fs.rmSync(tmpdir, { recursive: true });
  fs.rmSync(versionFile);
});
