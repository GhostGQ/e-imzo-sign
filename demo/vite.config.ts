import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The demo imports the library via its PUBLIC entry points, but aliases them to the
// TypeScript source so it always reflects the current code without a publish/build step.
// `base: './'` keeps asset paths relative, so it works on GitHub Pages under any subpath.
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'e-imzo-web/react', replacement: resolve(__dirname, '../src/react/index.ts') },
      { find: 'e-imzo-web/mock', replacement: resolve(__dirname, '../src/mock/index.ts') },
      { find: /^e-imzo-web$/, replacement: resolve(__dirname, '../src/core/index.ts') },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
