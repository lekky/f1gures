import type { CollectionEntry } from 'astro:content';

type Post = CollectionEntry<'blog'>;

export function isPublic(post: Post): boolean {
  if (post.data.draft && import.meta.env.PROD) return false;
  return post.data.publishedAt.getTime() <= Date.now();
}

export function sortPosts(posts: Post[]): Post[] {
  return [...posts].sort(
    (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
  );
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function fmtPostDate(d: Date): string {
  return DATE_FMT.format(d);
}
