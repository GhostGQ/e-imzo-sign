import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'core/index': 'src/core/index.ts',
    'react/index': 'src/react/index.ts',
    'mock/index': 'src/mock/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  treeshake: true,
  clean: true,
  sourcemap: true,
  external: ['react'],
})
