/**
 * Shared helper for locating / downloading the pinned cyoda binary.
 *
 * Exports:
 *   parsePinFile(versionFilePath)         — read + validate cyoda-go-version.json
 *   detectPlatform({platform, arch})      — map Node process.platform/arch to
 *                                           release-asset OS/arch strings
 *   ensureBinary({version, cacheDir,      — return absolute path to a usable
 *                 fetch, spawnSync})         cyoda binary (fast-path, download, or cache)
 *
 * All injectable dependencies (fetch, spawnSync) so tests can exercise without
 * touching the real network / filesystem.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync as _spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

const TARBALL_NAME = (version, os, arch) => `cyoda_${version}_${os}_${arch}.tar.gz`;
const TARBALL_URL = (version, os, arch) =>
  `https://github.com/Cyoda/cyoda-go/releases/download/v${version}/${TARBALL_NAME(version, os, arch)}`;
const SUMS_URL = (version) =>
  `https://github.com/Cyoda/cyoda-go/releases/download/v${version}/SHA256SUMS`;

// ---------------------------------------------------------------------------
// Error factory
// ---------------------------------------------------------------------------

export function err(cls, message) {
  return new Error(`${cls}: ${message}`);
}

// ---------------------------------------------------------------------------
// parsePinFile
// ---------------------------------------------------------------------------

/**
 * Read and validate the cyoda-go-version.json pin file.
 * Returns the bare semver string (e.g. "0.6.2").
 * Throws InvalidVersionPin on any problem.
 */
export function parsePinFile(versionFilePath) {
  let raw;
  try {
    raw = fs.readFileSync(versionFilePath, 'utf8');
  } catch (cause) {
    throw err('InvalidVersionPin', `cannot read ${versionFilePath}: ${cause.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw err(
      'InvalidVersionPin',
      `${versionFilePath}: not valid JSON: ${cause.message}. Expected { "version": "<semver>" }.`
    );
  }
  if (!parsed || typeof parsed.version !== 'string' || !parsed.version) {
    throw err(
      'InvalidVersionPin',
      `${versionFilePath}: missing string "version". Expected { "version": "<semver>" }.`
    );
  }
  if (parsed.version.startsWith('v')) {
    throw err(
      'InvalidVersionPin',
      `${versionFilePath}: version must not start with "v" (e.g. '0.6.1', not 'v0.6.1'). Got: ${parsed.version}`
    );
  }
  return parsed.version;
}

// ---------------------------------------------------------------------------
// detectPlatform
// ---------------------------------------------------------------------------

/**
 * Map Node process.platform / process.arch to the asset OS/arch strings used
 * in the cyoda-go release tarball names.
 *
 * @param {{platform: string, arch: string}} hint
 * @returns {{os: string, arch: string}}
 */
export function detectPlatform({ platform, arch }) {
  let os, archStr;
  if (platform === 'darwin') {
    os = 'darwin';
  } else if (platform === 'linux') {
    os = 'linux';
  } else {
    throw err(
      'UnsupportedPlatform',
      `platform "${platform}" (arch "${arch}") is not supported. Only darwin and linux are supported. ` +
        `Windows users can install cyoda manually from https://github.com/Cyoda/cyoda-go/releases.`
    );
  }
  if (arch === 'arm64') {
    archStr = 'arm64';
  } else if (arch === 'x64') {
    archStr = 'amd64';
  } else {
    throw err(
      'UnsupportedPlatform',
      `arch "${arch}" on platform "${platform}" is not supported. Expected arm64 or x64.`
    );
  }
  return { os, arch: archStr };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findChecksum(sumsText, filename) {
  for (const line of sumsText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[parts.length - 1] === filename) {
      return parts[0];
    }
  }
  return null;
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fetchBytes(fetchFn, url, errorClass) {
  let resp;
  try {
    resp = await fetchFn(url);
  } catch (cause) {
    throw err('FetchFailed', `${url}: ${cause.message}.`);
  }
  if (!resp.ok) {
    throw err(
      errorClass,
      `HTTP ${resp.status} on ${url}. Check cyoda-go-version.json: does the tagged release include a build for this platform?`
    );
  }
  const buf = await resp.arrayBuffer();
  return Buffer.from(buf);
}

async function fetchText(fetchFn, url, errorClass) {
  const buf = await fetchBytes(fetchFn, url, errorClass);
  return buf.toString('utf8');
}

// ---------------------------------------------------------------------------
// ensureBinary
// ---------------------------------------------------------------------------

/**
 * Return an absolute path to a usable cyoda binary at the requested version.
 *
 * Strategy:
 *   1. If the cache directory already contains an executable `cyoda`, return it.
 *   2. If a system `cyoda` is on PATH and reports the right version, return "cyoda".
 *   3. Otherwise download the tarball from GitHub releases, verify SHA256, extract,
 *      cache, and return the extracted path.
 *
 * @param {object} opts
 * @param {string}           opts.version    — bare semver, e.g. "0.6.2"
 * @param {string}           opts.cacheDir   — version-scoped cache directory
 * @param {typeof fetch}     opts.fetch      — injectable fetch (default: globalThis.fetch)
 * @param {typeof spawnSync} opts.spawnSync  — injectable spawnSync (default: node child_process)
 * @returns {Promise<string>} absolute path (or "cyoda" for the system binary fast-path)
 */
export async function ensureBinary({
  version,
  cacheDir,
  fetch: fetchFn = globalThis.fetch,
  spawnSync = _spawnSync,
  platformHint,
}) {
  const binaryPath = path.join(cacheDir, 'cyoda');

  // 1. Already cached and executable?
  if (fs.existsSync(binaryPath)) {
    try {
      fs.accessSync(binaryPath, fs.constants.X_OK);
      return binaryPath;
    } catch {
      // not executable — re-download
    }
  }

  // 2. System binary fast-path: version matches?
  const sysResult = spawnSync('cyoda', ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (sysResult.status === 0 && sysResult.stdout && sysResult.stdout.includes(`${version} `)) {
    return 'cyoda';
  }

  // 3. Download from GitHub releases.
  const platformSrc = platformHint || { platform: process.platform, arch: process.arch };
  const { os, arch } = detectPlatform(platformSrc);
  const tarballName = TARBALL_NAME(version, os, arch);
  const tarballUrl = TARBALL_URL(version, os, arch);
  const sumsUrl = SUMS_URL(version);

  console.log(`  downloading ${tarballUrl}...`);

  const [tarballBuf, sumsText] = await Promise.all([
    fetchBytes(fetchFn, tarballUrl, 'BinaryNotFound'),
    fetchText(fetchFn, sumsUrl, 'FetchFailed'),
  ]);

  const expected = findChecksum(sumsText, tarballName);
  if (!expected) {
    throw err('IntegrityCheckFailed', `SHA256SUMS for v${version} has no entry for ${tarballName}.`);
  }
  const actual = sha256Hex(tarballBuf);
  if (actual !== expected) {
    throw err('IntegrityCheckFailed', `expected sha256 ${expected}, got ${actual} for ${tarballName}.`);
  }

  // Extract with tar
  fs.mkdirSync(cacheDir, { recursive: true });
  const tarPath = path.join(cacheDir, tarballName);
  fs.writeFileSync(tarPath, tarballBuf);

  const tarResult = spawnSync('tar', ['-xzf', tarPath, '-C', cacheDir, 'cyoda'], {
    encoding: 'utf8',
  });
  if (tarResult.status !== 0) {
    throw err(
      'BinaryExecutionFailed',
      `tar extraction failed: ${tarResult.stderr || tarResult.error}`
    );
  }
  fs.rmSync(tarPath);

  // Make executable
  fs.chmodSync(binaryPath, 0o755);
  return binaryPath;
}
