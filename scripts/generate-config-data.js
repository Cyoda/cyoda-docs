import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function err(cls, message) {
  return new Error(`${cls}: ${message}`);
}

/**
 * Validate + normalize the raw `cyoda help config all --format=json` payload
 * into the slim data module the docs render from.
 *
 * `type` and `default` are intentionally optional: real cyoda-go output leaves
 * `type` empty for some vars and omits `default` for many. Those render blank.
 *
 * @param {any} raw
 * @returns {{schema:number, version:string, vars:Array<{name:string,topic:string,type:string,default:string,description:string}>}}
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw err('ConfigMalformed', `expected an object, got ${Array.isArray(raw) ? 'array' : typeof raw}`);
  }
  if (raw.schema !== 1) {
    throw err('ConfigSchemaUnsupported', `expected schema 1, got ${JSON.stringify(raw.schema)}`);
  }
  if (!Array.isArray(raw.vars) || raw.vars.length === 0) {
    throw err('ConfigMalformed', `expected a non-empty "vars" array`);
  }
  const vars = raw.vars.map((v, i) => {
    if (!v || typeof v !== 'object' || typeof v.name !== 'string' || !v.name) {
      throw err('ConfigVarMalformed', `vars[${i}] missing string "name": ${JSON.stringify(v)}`);
    }
    if (typeof v.topic !== 'string' || !v.topic) {
      throw err('ConfigVarMalformed', `vars[${i}] (${v.name}) missing string "topic"`);
    }
    return {
      name: v.name,
      topic: v.topic,
      type: typeof v.type === 'string' ? v.type : '',
      default: v.default === undefined || v.default === null ? '' : String(v.default),
      description: typeof v.description === 'string' ? v.description : '',
    };
  });
  vars.sort((a, b) =>
    a.topic < b.topic ? -1
    : a.topic > b.topic ? 1
    : a.name < b.name ? -1
    : a.name > b.name ? 1
    : 0
  );
  return {
    schema: 1,
    version: typeof raw.version === 'string' && raw.version ? raw.version : 'unknown',
    vars,
  };
}

export function run({ sourcePath, outputPath }) {
  let rawText;
  try {
    rawText = fs.readFileSync(sourcePath, 'utf8');
  } catch (cause) {
    throw err('ConfigSourceMissing', `cannot read ${sourcePath}: ${cause.message}`);
  }
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch (cause) {
    throw err('ConfigMalformed', `${sourcePath}: not valid JSON: ${cause.message}`);
  }
  const normalized = normalizeConfig(raw);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(normalized, null, 2) + '\n');
  const topics = new Set(normalized.vars.map((v) => v.topic)).size;
  console.log(`⚙️  wrote ${outputPath} (${normalized.vars.length} vars, ${topics} topics)`);
}

// CLI entry point
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  const projectRoot = path.resolve(__dirname, '..');
  const sourcePath = path.join(projectRoot, 'src', 'data', 'cyoda-config-all.source.json');
  const outputPath = path.join(projectRoot, 'src', 'data', 'cyoda-config-all.json');
  try {
    run({ sourcePath, outputPath });
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}
