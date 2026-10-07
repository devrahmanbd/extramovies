import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Markdown is canonical for review bodies. DB mirrors published reviews
 * (slug, rating, dates) for search/SSR; files are the authoring source.
 */
const reviews = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reviews' }),
  schema: z.object({
    title: z.string(),
    dek: z.string().optional(),
    movie: z.string(),
    year: z.number().optional(),
    rating100: z.number().min(0).max(100).optional(),
    verdict: z.string().optional(),
    author: z.string().default('Staff'),
    publishedAt: z.coerce.date().optional(),
    featured: z.boolean().default(false),
    noindex: z.boolean().default(false)
  })
});

export const collections = { reviews };
