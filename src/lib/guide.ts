import type { CollectionEntry } from 'astro:content';
import {
  GUIDE_CATEGORIES,
  GUIDE_CATEGORY_LABELS,
  GUIDE_CATEGORY_DESCRIPTIONS,
  type GuideCategory,
} from './guideCategories';

type Guide = CollectionEntry<'guide'>;

export type { GuideCategory };

export function categoryLabel(id: GuideCategory): string {
  return GUIDE_CATEGORY_LABELS[id];
}
export function categoryBlurb(id: GuideCategory): string {
  return GUIDE_CATEGORY_DESCRIPTIONS[id];
}

// Per-topic accent colours: a vibrant spectrum indexed by reading order
// (order 1 to 10). Used inline as --card-accent on the hub step cards and
// on cross-link "Related" cards, so each topic keeps a consistent colour
// identity wherever it appears. Mid-tone hues stay legible on dark + light.
export const GUIDE_COLORS = [
  '#E8002D', '#F2660A', '#E59400', '#C9A100', '#1FB257',
  '#11B8A4', '#2E8FE6', '#3F5BD6', '#9333EA', '#E0277E',
];

// Colour for a guide topic, keyed off its `order` (1-based).
export function guideColor(order: number): string {
  return GUIDE_COLORS[(order - 1) % GUIDE_COLORS.length];
}

// Minimal duck-typed shape so the helpers are unit-testable without the
// content runtime (the test passes plain objects with the same shape).
type GuideLike = {
  slug: string;
  data: { order: number; category?: GuideCategory; related?: string[]; draft?: boolean };
};

export function isPublishedGuide<T extends GuideLike>(page: T): boolean {
  if (page.data.draft && import.meta.env.PROD) return false;
  return true;
}

export function sortGuides<T extends GuideLike>(pages: T[]): T[] {
  return [...pages].sort((a, b) => a.data.order - b.data.order);
}

export function resolveRelated<T extends GuideLike>(page: T, all: T[]): T[] {
  const bySlug = new Map(all.filter(isPublishedGuide).map((p) => [p.slug, p]));
  return (page.data.related ?? [])
    .map((slug) => bySlug.get(slug))
    .filter((p): p is T => p != null && p.slug !== page.slug);
}

export function prevNext<T extends GuideLike>(sorted: T[], slug: string): { prev: T | null; next: T | null } {
  const i = sorted.findIndex((p) => p.slug === slug);
  if (i < 0) return { prev: null, next: null };
  return {
    prev: i > 0 ? sorted[i - 1] : null,
    next: i < sorted.length - 1 ? sorted[i + 1] : null,
  };
}

// Convenience for pages: filter + sort in one call.
export function publishedGuidesSorted(all: Guide[]): Guide[] {
  return sortGuides(all.filter(isPublishedGuide));
}

// Group sorted guides under the canonical category order, dropping any
// category with no articles. Each group keeps its label + blurb so the
// index can render category heads without re-reading config. Articles stay
// in their incoming (reading) order within each group.
export type GuideGroup<T> = {
  id: GuideCategory;
  label: string;
  blurb: string;
  items: T[];
};
export function guidesByCategory<T extends GuideLike>(sorted: T[]): GuideGroup<T>[] {
  return GUIDE_CATEGORIES
    .map((id) => ({
      id,
      label: GUIDE_CATEGORY_LABELS[id],
      blurb: GUIDE_CATEGORY_DESCRIPTIONS[id],
      items: sorted.filter((p) => p.data.category === id),
    }))
    .filter((g) => g.items.length > 0);
}
