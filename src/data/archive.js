// Helpers for loading the build-archive output. Used by Astro routes at
// build time via getStaticPaths. The output lives in public/data/archive/
// so the redirect HTMLs can also fetch the code-map at runtime.
//
// Run scripts/build-archive.mjs (npm run prebuild) before astro build, or
// these reads will fail.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(__dirname, '..', '..', 'public', 'data', 'archive');

function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(
      `Archive file missing: ${path}\nRun \`npm run prebuild\` (scripts/build-archive.mjs) before \`astro build\`.`
    );
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

let _index = null;
export function getDriversIndex() {
  if (!_index) _index = readJson(join(ARCHIVE, '_drivers-index.json'));
  return _index;
}

export function getDriver(driverRef) {
  return readJson(join(ARCHIVE, 'drivers', `${driverRef}.json`));
}

let _codes = null;
export function getDriverCodes() {
  if (!_codes) _codes = readJson(join(ARCHIVE, '_driver-codes.json'));
  return _codes;
}
