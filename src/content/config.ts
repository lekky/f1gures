import { defineCollection, z } from 'astro:content';

export const BLOG_CATEGORIES = [
  'race-recap',
  'technical',
  'driver-focus',
  'historic-season',
] as const;

export const BLOG_CATEGORY_LABELS: Record<(typeof BLOG_CATEGORIES)[number], string> = {
  'race-recap': 'Race Recap',
  technical: 'Technical',
  'driver-focus': 'Driver Focus',
  'historic-season': 'Historic Season',
};

export const BLOG_CATEGORY_DESCRIPTIONS: Record<(typeof BLOG_CATEGORIES)[number], string> = {
  'race-recap': 'Race-by-race recaps and weekend analysis.',
  technical: 'How F1 cars and regulations work, explained.',
  'driver-focus': 'Profiles, form analysis and career deep-dives.',
  'historic-season': 'Looking back at the seasons that shaped F1.',
};

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().max(120),
    description: z.string().min(40).max(200),
    category: z.enum(BLOG_CATEGORIES),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: z.string().default('f1gures'),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
