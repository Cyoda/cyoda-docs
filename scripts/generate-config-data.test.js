import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig } from './generate-config-data.js';

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
