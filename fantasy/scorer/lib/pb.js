// A very small PocketBase REST client, purpose-built for the scorer.
//
// Deliberately not the `pocketbase` npm SDK: the scorer must run as a bare
// `node run.mjs` on a Coolify scheduled task with zero `npm install`, so this
// is Node 20 built-ins only (global `fetch`).
//
// What it adds over raw fetch:
//   - superuser auth (token, or email+password exchanged per run)
//   - `listAll` that follows PocketBase's pagination to the end
//   - `upsert` that DIFFS before writing, which is what makes the whole scorer
//     idempotent: a second run over unchanged data issues zero writes
//   - a dry-run mode that records the writes it *would* have made
//
// Nothing here knows anything about fantasy; the rules live in the sibling
// modules and in `src/lib/fantasyScoring.mjs`.

/** ISO-ish timestamp, in either PocketBase's `2026-09-05 14:00:00.000Z` form or a real ISO string. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;

/**
 * Deterministic JSON: object keys sorted, so two structurally equal values
 * always stringify identically and the diff below can compare them.
 *
 * @param {*} value
 * @returns {string}
 */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/**
 * Flatten a field value to something comparable across the wire.
 *
 * PocketBase normalises on write (empty date → `""`, unset json → `null`,
 * dates to its own space-separated format), so a naive `===` would report a
 * change on every run and the scorer would never be idempotent.
 *
 * @param {*} v
 * @returns {string|number|boolean}
 */
export function normalizeValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    if (DATE_RE.test(v)) {
      const t = Date.parse(v.replace(' ', 'T'));
      if (Number.isFinite(t)) return new Date(t).toISOString();
    }
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return canonical(v);
}

/**
 * The subset of `data` that differs from the stored record.
 *
 * @param {object|null} existing record as PocketBase returned it
 * @param {object} data fields we want to be true
 * @returns {object|null} changed fields, or null when the record is already correct
 */
export function diffFields(existing, data) {
  if (!existing) return { ...data };
  const changed = {};
  for (const [key, value] of Object.entries(data)) {
    if (normalizeValue(existing[key]) !== normalizeValue(value)) changed[key] = value;
  }
  return Object.keys(changed).length ? changed : null;
}

/** Escape a value for a PocketBase filter string literal. */
export function quote(value) {
  return `"${String(value).replace(/["\\]/g, m => `\\${m}`)}"`;
}

/**
 * PocketBase wants `2026-09-05 14:00:00.000Z`; it accepts ISO too, but writing
 * its own format keeps the diff stable and the admin UI readable.
 *
 * @param {Date|string|number|null} value
 * @returns {string} '' for a missing value (PocketBase's empty date)
 */
export function pbDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value).replace(' ', 'T'));
  if (!Number.isFinite(t)) return '';
  return new Date(t).toISOString().replace('T', ' ');
}

export class PbError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'PbError';
    this.status = status;
    this.body = body;
  }
}

/**
 * @typedef {object} PbOptions
 * @property {string} url base URL, e.g. https://fantasy.f1gures.app
 * @property {string} [token] superuser token; otherwise call {@link PbClient#authWithPassword}
 * @property {boolean} [dryRun] record writes instead of performing them
 * @property {(msg: string) => void} [log]
 * @property {typeof fetch} [fetchImpl] injectable for tests
 */

export class PbClient {
  /** @param {PbOptions} opts */
  constructor({ url, token = '', dryRun = false, log = () => {}, fetchImpl = globalThis.fetch } = {}) {
    this.url = String(url || '').replace(/\/+$/, '');
    this.token = token;
    this.dryRun = !!dryRun;
    this.log = log;
    this.fetchImpl = fetchImpl;
    /** Write counters, surfaced in the run summary and asserted by the tests. */
    this.stats = { created: 0, updated: 0, deleted: 0, unchanged: 0, requests: 0 };
    /** In dry-run, the writes that were skipped. */
    this.planned = [];
    this._dryId = 0;
  }

  /**
   * @param {string} method
   * @param {string} path path from `/api/...`
   * @param {object} [body]
   * @returns {Promise<any>}
   */
  async request(method, path, body) {
    this.stats.requests++;
    const res = await this.fetchImpl(this.url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: this.token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    if (!res.ok) {
      throw new PbError(`${method} ${path} → ${res.status} ${json ? JSON.stringify(json) : text}`, res.status, json);
    }
    return json;
  }

  /**
   * Exchange superuser credentials for a token. Tokens expire, so the scorer
   * does this once per run rather than caching one in an env var.
   */
  async authWithPassword(identity, password) {
    const out = await this.request('POST', '/api/collections/_superusers/auth-with-password', { identity, password });
    this.token = out.token;
    return out;
  }

  /**
   * Every record matching `filter`, following pagination.
   *
   * @param {string} collection
   * @param {string|{filter?: string, sort?: string, expand?: string, perPage?: number}} [opts]
   *   a bare filter string is accepted as shorthand
   * @returns {Promise<object[]>}
   */
  async listAll(collection, opts = {}) {
    const { filter = '', sort = '', expand = '', perPage = 500 } = typeof opts === 'string' ? { filter: opts } : opts;
    const out = [];
    for (let page = 1; ; page++) {
      const params = new URLSearchParams({ page: String(page), perPage: String(perPage), skipTotal: 'true' });
      if (filter) params.set('filter', filter);
      if (sort) params.set('sort', sort);
      if (expand) params.set('expand', expand);
      const res = await this.request('GET', `/api/collections/${collection}/records?${params}`);
      const items = (res && res.items) || [];
      out.push(...items);
      if (items.length < perPage) return out;
    }
  }

  /** @returns {Promise<object|null>} */
  async findOne(collection, filter) {
    const params = new URLSearchParams({ filter, perPage: '1', skipTotal: 'true' });
    const res = await this.request('GET', `/api/collections/${collection}/records?${params}`);
    return (res && res.items && res.items[0]) || null;
  }

  async create(collection, data) {
    if (this.dryRun) {
      this.planned.push({ op: 'create', collection, data });
      this.stats.created++;
      return { ...data, id: `dry_${collection}_${++this._dryId}` };
    }
    const rec = await this.request('POST', `/api/collections/${collection}/records`, data);
    this.stats.created++;
    return rec;
  }

  async update(collection, id, data) {
    if (this.dryRun) {
      this.planned.push({ op: 'update', collection, id, data });
      this.stats.updated++;
      return { id, ...data };
    }
    const rec = await this.request('PATCH', `/api/collections/${collection}/records/${id}`, data);
    this.stats.updated++;
    return rec;
  }

  async delete(collection, id) {
    if (this.dryRun) {
      this.planned.push({ op: 'delete', collection, id });
      this.stats.deleted++;
      return;
    }
    await this.request('DELETE', `/api/collections/${collection}/records/${id}`);
    this.stats.deleted++;
  }

  /**
   * Create the record, patch only the fields that actually differ, or do
   * nothing at all. The third case is the common one on a re-run and is what
   * "idempotent" means in the README.
   *
   * @param {string} collection
   * @param {object|null} existing already-loaded record, or null
   * @param {object} data desired field values
   * @returns {Promise<{record: object, action: 'create'|'update'|'noop'}>}
   */
  async upsert(collection, existing, data) {
    if (!existing) return { record: await this.create(collection, data), action: 'create' };
    const changed = diffFields(existing, data);
    if (!changed) {
      this.stats.unchanged++;
      return { record: existing, action: 'noop' };
    }
    const record = await this.update(collection, existing.id, changed);
    // In dry-run the PATCH response is synthetic, so fold it onto the original.
    return { record: this.dryRun ? { ...existing, ...changed } : record, action: 'update' };
  }
}

/**
 * An index over already-loaded records, so the scorer does one `listAll` per
 * collection instead of a `findOne` per row.
 *
 * @param {object[]} records
 * @param {(r: object) => string} keyFn
 * @returns {Map<string, object>}
 */
export function indexBy(records, keyFn) {
  const map = new Map();
  for (const r of records) map.set(keyFn(r), r);
  return map;
}
