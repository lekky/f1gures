import type { CollectionEntry } from 'astro:content';

type Guide = CollectionEntry<'guide'>;

// Minimal duck-typed shape so the helpers are unit-testable without the
// content runtime (the test passes plain objects with the same shape).
type GuideLike = { slug: string; data: { order: number; related?: string[]; draft?: boolean } };

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
