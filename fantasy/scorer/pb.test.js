import { describe, it, expect } from 'vitest';
import { PbClient, canonical, diffFields, normalizeValue, pbDate, quote, indexBy } from './lib/pb.js';
import { MemoryPb, matchesFilter } from './lib/memoryPb.js';

describe('canonical', () => {
  it('is key-order independent', () => {
    expect(canonical({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe(canonical({ a: [2, { c: 3, d: 4 }], b: 1 }));
  });

  it('distinguishes real differences', () => {
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
  });
});

describe('normalizeValue', () => {
  it('treats PocketBase and ISO date formats as equal', () => {
    expect(normalizeValue('2026-09-05 14:00:00.000Z')).toBe(normalizeValue('2026-09-05T14:00:00Z'));
  });

  it('collapses null, undefined and empty string', () => {
    expect(normalizeValue(null)).toBe('');
    expect(normalizeValue(undefined)).toBe('');
    expect(normalizeValue('')).toBe('');
  });

  it('compares json structurally', () => {
    expect(normalizeValue({ a: 1, b: 2 })).toBe(normalizeValue({ b: 2, a: 1 }));
  });
});

describe('diffFields', () => {
  it('returns null when nothing changed', () => {
    const existing = { id: 'x', round: 12, name: 'Dutch', lockAt: '2026-08-21 14:30:00.000Z', scored: { a: 1 } };
    expect(diffFields(existing, { round: 12, name: 'Dutch', lockAt: '2026-08-21T14:30:00Z', scored: { a: 1 } })).toBeNull();
  });

  it('returns only the changed fields', () => {
    const existing = { id: 'x', round: 12, name: 'Dutch', status: 'locked' };
    expect(diffFields(existing, { round: 12, name: 'Dutch', status: 'provisional' })).toEqual({ status: 'provisional' });
  });

  it('treats a missing record as an all-fields create', () => {
    expect(diffFields(null, { a: 1 })).toEqual({ a: 1 });
  });
});

describe('pbDate + quote', () => {
  it('emits PocketBase\'s space-separated UTC form', () => {
    expect(pbDate('2026-09-05T14:00:00Z')).toBe('2026-09-05 14:00:00.000Z');
  });

  it('maps a missing date to the empty string PocketBase stores', () => {
    expect(pbDate(null)).toBe('');
    expect(pbDate('not a date')).toBe('');
  });

  it('escapes filter literals', () => {
    expect(quote('ab"c')).toBe('"ab\\"c"');
  });
});

describe('PbClient dry run', () => {
  it('records writes instead of issuing them', async () => {
    const pb = new PbClient({ url: 'http://x', dryRun: true, fetchImpl: () => { throw new Error('no network in dry run'); } });
    const created = await pb.create('fantasy_rounds', { round: 1 });
    await pb.upsert('fantasy_rounds', { id: 'r1', round: 1 }, { round: 2 });
    await pb.upsert('fantasy_rounds', { id: 'r1', round: 1 }, { round: 1 });
    expect(created.id).toMatch(/^dry_fantasy_rounds_/);
    expect(pb.stats).toMatchObject({ created: 1, updated: 1, unchanged: 1, requests: 0 });
    expect(pb.planned.map(p => p.op)).toEqual(['create', 'update']);
  });
});

describe('memory client filter grammar', () => {
  it('handles equality, && and ||', () => {
    const rec = { round: 'r1', user: 'u1' };
    expect(matchesFilter(rec, 'round="r1"')).toBe(true);
    expect(matchesFilter(rec, 'round="r1" && user="u2"')).toBe(false);
    expect(matchesFilter(rec, '(round="r0" || round="r1")')).toBe(true);
    expect(matchesFilter(rec, '')).toBe(true);
  });

  it('matches unquoted numbers', async () => {
    const pb = new MemoryPb({ fantasy_seasons: [{ id: 's1', year: 2026 }] });
    expect(await pb.findOne('fantasy_seasons', 'year=2026')).toMatchObject({ id: 's1' });
    expect(await pb.findOne('fantasy_seasons', 'year=2025')).toBeNull();
  });
});

describe('indexBy', () => {
  it('keys records by the derived key', () => {
    const map = indexBy([{ id: 'a', code: 'NOR' }, { id: 'b', code: 'VER' }], r => r.code);
    expect(map.get('VER').id).toBe('b');
  });
});
