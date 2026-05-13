import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { BLOG_CATEGORY_LABELS } from '../../content/config';
import { isPublic, sortPosts } from '../../lib/blog';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = sortPosts((await getCollection('blog')).filter(isPublic));
  return rss({
    title: 'f1gures Blog',
    description:
      'Race recaps, technical explainers, driver focus pieces and historic season retrospectives from f1gures.',
    site: context.site!.toString(),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: `/blog/${post.slug}/`,
      categories: [BLOG_CATEGORY_LABELS[post.data.category]],
    })),
    customData: '<language>en-GB</language>',
  });
}
