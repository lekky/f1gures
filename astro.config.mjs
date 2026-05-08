import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://f1gures.app',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    assets: '_astro',
  },
  output: 'static',
  integrations: [
    react(),
    sitemap(),
  ],
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
});
