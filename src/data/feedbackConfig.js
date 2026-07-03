// Feedback feature config.
// -----------------------------------------------------------------------------
// Both values below are PUBLIC and safe to commit — fill them in after you've
// deployed the Cloudflare Worker and created a Turnstile widget. See
// feedback-worker/README.md for the exact steps.
//
// While either value is empty, the /feedback/ page renders but shows a
// "not configured yet" notice instead of a live form, so the build never breaks.

// The deployed Worker URL, e.g. 'https://f1gures-feedback.yourname.workers.dev'
export const FEEDBACK_WORKER_URL = '';

// The Turnstile *site* key (the public one), e.g. '0x4AAAAAAA...'
export const TURNSTILE_SITE_KEY = '';

export const feedbackConfigured = () =>
  Boolean(FEEDBACK_WORKER_URL) && Boolean(TURNSTILE_SITE_KEY);
