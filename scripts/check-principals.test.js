// scripts/check-principals.test.js
// Offline tests for the watchdog's parsing/matching helpers. The live
// Wikipedia fetch path is exercised by the workflow itself (and by running
// `node scripts/check-principals.mjs` locally), not from vitest.
import { describe, it, expect } from 'vitest';
import { extractPrincipalValues, cleanWikiValue, nameMatches, WIKI_ARTICLES } from './check-principals.mjs';
import { PRINCIPALS } from './principals.mjs';

describe('extractPrincipalValues', () => {
  it('finds principal-ish infobox params regardless of exact label', () => {
    const wikitext = [
      '{{Infobox F1 team',
      '| Team Principal = [[Laurent Mekies]] (Team Principal and CEO)',
      '| Base = Milton Keynes',
      '}}',
    ].join('\n');
    expect(extractPrincipalValues(wikitext)).toEqual(['Laurent Mekies (Team Principal and CEO)']);
  });

  it('folds continuation lines until the next param or closing braces', () => {
    const wikitext = [
      '{{Infobox F1 team',
      '| Team Principal(s) = {{unbulleted list|',
      '  [[Flavio Briatore]] (Executive Advisor)',
      '  [[Steve Nielsen]] (Managing Director)}}',
      '| Website = example.com',
      '}}',
    ].join('\n');
    const [value] = extractPrincipalValues(wikitext);
    expect(value).toContain('Flavio Briatore');
    expect(value).toContain('Steve Nielsen');
  });

  it('returns empty for wikitext without a principal param', () => {
    expect(extractPrincipalValues('{{Infobox\n| Base = Brackley\n}}')).toEqual([]);
  });
});

describe('cleanWikiValue', () => {
  it('strips refs, comments, links and templates', () => {
    const raw = '[[Adrian Newey]] (Team Principal)<ref name="a">news</ref><!-- note --> {{efn|caveat}}';
    expect(cleanWikiValue(raw)).toBe('Adrian Newey (Team Principal)');
  });

  it('keeps the label side of piped links', () => {
    expect(cleanWikiValue('[[Frédéric Vasseur|Fred Vasseur]]')).toBe('Fred Vasseur');
  });
});

describe('nameMatches', () => {
  it('matches on surname, diacritic-insensitively', () => {
    expect(nameMatches('Frédéric Vasseur (Team Principal)', 'Fred Vasseur')).toBe(true);
    expect(nameMatches('Laurent Mekiès', 'Laurent Mekies')).toBe(true);
  });

  it('rejects a value listing someone else', () => {
    expect(nameMatches('Marcin Budkowski (Team Principal)', 'Graeme Lowdon')).toBe(false);
  });
});

describe('watchdog coverage', () => {
  it('every open-ended tenure has a Wikipedia article mapped', () => {
    for (const [ref, tenures] of Object.entries(PRINCIPALS)) {
      if (tenures.some(t => t.to == null)) {
        expect(WIKI_ARTICLES[ref], `WIKI_ARTICLES missing "${ref}"`).toBeTruthy();
      }
    }
  });

  it('every mapped article belongs to a ref with an open-ended tenure', () => {
    for (const ref of Object.keys(WIKI_ARTICLES)) {
      const open = (PRINCIPALS[ref] || []).some(t => t.to == null);
      expect(open, `WIKI_ARTICLES has stale entry "${ref}"`).toBe(true);
    }
  });
});
