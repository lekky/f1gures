// Public configuration for the f1gures fantasy game.
//
// Same shape and philosophy as `feedbackConfig.js`: everything here is
// public-by-design (a PocketBase URL and a boolean), and an EMPTY
// `pocketbaseUrl` is a first-class state — every `/fantasy/` page then renders
// a "not configured" notice instead of an island, so a build never breaks
// while the backend is still being stood up.
//
// The committed default is deliberately empty. Two ways to point a build at a
// server without editing this file:
//
//   PUBLIC_FANTASY_PB_URL=https://fantasy.f1gures.app npm run build
//   PUBLIC_FANTASY_GOOGLE_AUTH=1                        (once Google OAuth2 is
//                                                        enabled on the users
//                                                        collection)
//
// Vite exposes any `PUBLIC_`-prefixed env var to client code, so the override
// works in `astro dev` and in a production build alike. When the beta goes
// live for real, set `pocketbaseUrl` below and drop the env var.

const CONFIG = {
  pocketbaseUrl: '',
  googleAuth: false,
};

// import.meta.env is statically replaced by Vite; guard for plain-Node importers
// (vitest, scripts) where it may be undefined.
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};

function envStr(key) {
  const v = ENV[key];
  return typeof v === 'string' ? v.trim() : '';
}

function envBool(key) {
  const v = envStr(key).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Base URL of the PocketBase server, without a trailing slash. '' = not configured. */
export const FANTASY_PB_URL =
  (envStr('PUBLIC_FANTASY_PB_URL') || CONFIG.pocketbaseUrl).replace(/\/+$/, '');

/** Show the "Continue with Google" button? Only true once OAuth2 is set up in PocketBase. */
export const FANTASY_GOOGLE_AUTH = envBool('PUBLIC_FANTASY_GOOGLE_AUTH') || CONFIG.googleAuth === true;

/** The single gate every fantasy page and island checks first. */
export function fantasyConfigured() {
  return FANTASY_PB_URL.length > 0;
}

export default CONFIG;
