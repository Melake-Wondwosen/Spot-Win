import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `--mode demo` builds a preview with made-up data and no server. Everything is
// bundled into one chunk with images inlined, so scripts/build-preview.mjs can
// fold it into a single HTML file.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: mode === 'demo' ? './' : '/',
  build:
    mode === 'demo'
      ? { outDir: 'dist-demo', assetsInlineLimit: 100_000_000, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } }
      : {
          target: 'es2020',
          rollupOptions: {
            output: {
              // React and the router change rarely, so phones keep them cached across app updates
              manualChunks: { vendor: ['react', 'react-dom', 'react-dom/client', 'react-router'] },
            },
          },
        },
}))
