import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = 'https://f1gures.app';

// @astrojs/sitemap 3.2.1 / Astro 4.16.x drops the last-processed dynamic
// route group from the sitemap. Teams are built correctly but never appear.
// Work around it by supplying team URLs explicitly via customPages.
const teamsIndexPath = resolve('./public/data/archive/_teams-index.json');
const teamPages = existsSync(teamsIndexPath)
  ? JSON.parse(readFileSync(teamsIndexPath, 'utf8')).map(t => `${ORIGIN}/teams/${t.constructorRef}/`)
  : [];

// https://astro.build/config
export default defineConfig({
  site: ORIGIN,
  trailingSlash: 'always',
  build: {
    format: 'directory',
    assets: '_astro',
  },
  output: 'static',
  integrations: [
    react(),
    mdx(),
    sitemap({ customPages: teamPages }),
  ],
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
});
