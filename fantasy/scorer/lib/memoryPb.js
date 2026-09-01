// An in-memory stand-in for {@link PbClient}, used by the unit tests.
//
// It implements the same surface the pipeline uses (findOne / listAll / create
// / update / delete / upsert / stats) over plain Maps, and understands the
// small subset of PocketBase's filter grammar the scorer actually emits:
// `field=value` joined by `&&` / `||`, optionally parenthesised.
//
// Shipping it beside the client (rather than inside a test file) means the
// integration harness and any future workstream can drive the pipeline without
// a database.

import { diffFields } from './pb.js';

/**
 * Evaluate one of the scorer's filter strings against a record.
 * @param {object} rec
 * @param {string} filter
 * @returns {boolean}
 */
export function matchesFilter(rec, filter) {
  const f = String(filter || '').trim();
  if (!f) return true;
  const inner = f.replace(/^\((.*)\)$/s, '$1');
  if (inner.includes('||')) return inner.split('||').some(part => matchesFilter(rec, part));
  if (inner.includes('&&')) return inner.split('&&').every(part => matchesFilter(rec, part));
  const m = inner.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
  if (!m) return true;
  const value = m[2].replace(/^"(.*)"$/s, '$1');
  return String(rec[m[1]] ?? '') === value;
}

export class MemoryPb {
  constructor(seed = {}) {
    /** @type {Map<string, Map<string, object>>} collection → id → record */
    this.data = new Map();
    this.stats = { created: 0, updated: 0, deleted: 0, unchanged: 0, requests: 0 };
    this.planned = [];
    this.dryRun = false;
    this._id = 0;
    for (const [collection, rows] of Object.entries(seed)) {
      for (const row of rows) this._put(collection, row);
    }
  }

  _table(collection) {
    if (!this.data.has(collection)) this.data.set(collection, new Map());
    return this.data.get(collection);
  }

  _put(collection, row) {
    const id = row.id || `${collection}_${++this._id}`;
    const rec = { ...row, id };
    this._table(collection).set(id, rec);
    return rec;
  }

  /** Total writes since the counter was last reset — the idempotency assertion. */
  get writes() {
    return this.stats.created + this.stats.updated + this.stats.deleted;
  }

  resetStats() {
    this.stats = { created: 0, updated: 0, deleted: 0, unchanged: 0, requests: 0 };
    this.planned = [];
  }

  async listAll(collection, { filter = '' } = {}) {
    this.stats.requests++;
    return [...this._table(collection).values()].filter(r => matchesFilter(r, filter)).map(r => ({ ...r }));
  }

  async findOne(collection, filter) {
    const all = await this.listAll(collection, { filter });
    return all[0] || null;
  }

  async create(collection, data) {
    this.stats.created++;
    return { ...this._put(collection, data) };
  }

  async update(collection, id, data) {
    this.stats.updated++;
    const table = this._table(collection);
    const rec = { ...(table.get(id) || { id }), ...data };
    table.set(id, rec);
    return { ...rec };
  }

  async delete(collection, id) {
    this.stats.deleted++;
    this._table(collection).delete(id);
  }

  async upsert(collection, existing, data) {
    if (!existing) return { record: await this.create(collection, data), action: 'create' };
    const changed = diffFields(existing, data);
    if (!changed) {
      this.stats.unchanged++;
      return { record: existing, action: 'noop' };
    }
    return { record: await this.update(collection, existing.id, changed), action: 'update' };
  }
}
