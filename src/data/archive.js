// Helpers for loading the build-archive output. Used by Astro routes at
// build time via getStaticPaths. The output lives in public/data/archive/
// so the redirect HTMLs can also fetch the code-map at runtime.
//
// Run scripts/build-archive.mjs (npm run prebuild) before astro build, or
// these reads will fail.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// process.cwd() is the project root during astro build/dev. Don't use
// import.meta.url + __dirname here — Vite bundles this module into dist/
// during the build, which throws the relative path off (looking for
// dist/public/data/archive instead of public/data/archive).
const ARCHIVE = resolve(process.cwd(), 'public', 'data', 'archive');

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

let _racesIdx = null;
export function getRacesIndex() {
  if (!_racesIdx) _racesIdx = readJson(join(ARCHIVE, '_races-index.json'));
  return _racesIdx;
}
export function getRace(year, round) {
  return readJson(join(ARCHIVE, 'races', String(year), `${round}.json`));
}

let _circuitsIdx = null;
export function getCircuitsIndex() {
  if (!_circuitsIdx) _circuitsIdx = readJson(join(ARCHIVE, '_circuits-index.json'));
  return _circuitsIdx;
}
export function getCircuit(circuitRef) {
  return readJson(join(ARCHIVE, 'circuits', `${circuitRef}.json`));
}
