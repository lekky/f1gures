import { describe, it, expect } from 'vitest';
import { isPublishedGuide, sortGuides, resolveRelated, prevNext, publishedGuidesSorted } from './guide.ts';

const mk = (slug, order, related = [], draft = false) => ({
  slug,
  data: { title: slug.toUpperCase(), order, summary: 'x'.repeat(40), related, draft },
});

const PAGES = [
  mk('drs', 7, ['overtaking', 'nope']),
  mk('overtaking', 6, ['drs', 'tyres']),
  mk('tyres', 5),
  mk('secret', 99, [], true),
];

describe('isPublishedGuide', () => {
  it('keeps non-draft pages', () => {
    expect(isPublishedGuide(mk('drs', 7))).toBe(true);
  });
  it('keeps draft pages in non-production env (PROD is false under vitest)', () => {
    expect(isPublishedGuide(mk('secret', 99, [], true))).toBe(true);
  });
});

describe('sortGuides', () => {
  it('sorts ascending by order', () => {
    const sorted = sortGuides([mk('b', 5), mk('a', 1), mk('c', 9)]);
    expect(sorted.map((p) => p.slug)).toEqual(['a', 'b', 'c']);
  });
  it('does not mutate the input array', () => {
    const input = [mk('b', 5), mk('a', 1)];
    sortGuides(input);
    expect(input.map((p) => p.slug)).toEqual(['b', 'a']);
  });
});

describe('resolveRelated', () => {
  it('resolves known slugs in related order', () => {
    const rel = resolveRelated(PAGES[0], PAGES); // drs -> ['overtaking','nope']
    expect(rel.map((p) => p.slug)).toEqual(['overtaking']); // 'nope' dropped
  });
  it('keeps draft targets in non-production env (PROD is false under vitest)', () => {
    const page = mk('x', 2, ['secret']);
    expect(resolveRelated(page, PAGES).map((p) => p.slug)).toEqual(['secret']);
  });
  it('returns [] when related is missing', () => {
    expect(resolveRelated(mk('y', 3), PAGES)).toEqual([]);
  });
  it('drops the page itself if listed in related', () => {
    const page = mk('drs', 7, ['drs', 'overtaking']);
    const rel = resolveRelated(page, PAGES);
    expect(rel.map((p) => p.slug)).toEqual(['overtaking']);
  });
});

describe('publishedGuidesSorted', () => {
  it('filters drafts (in PROD) by composing isPublishedGuide, then sorts by order', () => {
    // In vitest PROD is false, so drafts are kept; assert sort order across all pages.
    const sorted = publishedGuidesSorted(PAGES);
    expect(sorted.map((p) => p.slug)).toEqual(['tyres', 'overtaking', 'drs', 'secret']);
  });
});

describe('prevNext', () => {
  it('returns neighbours by order', () => {
    const sorted = sortGuides(PAGES.filter((p) => !p.data.draft)); // tyres(5), overtaking(6), drs(7)
    const { prev, next } = prevNext(sorted, 'overtaking');
    expect(prev.slug).toBe('tyres');
    expect(next.slug).toBe('drs');
  });
  it('returns null at the ends', () => {
    const sorted = sortGuides(PAGES.filter((p) => !p.data.draft));
    expect(prevNext(sorted, 'tyres').prev).toBeNull();
    expect(prevNext(sorted, 'drs').next).toBeNull();
  });
});
