import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

// https://astro.build/config
export default defineConfig({
    // Config for Server Side Rendering (uncomment to change from Static Site Generation (SSG) to SSR)
    // output: 'server',
    // adapter: vercel(),
});
