import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Vite library mode — produces a single IIFE bundle with React/ReactDOM
// inlined, so the bundle can be embedded on any third-party site without
// requiring the host to provide React.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      name: 'PRSWidget',
      formats: ['iife'],
      fileName: () => 'prs-widget.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (info) => {
          if (info.name && info.name.endsWith('.css')) return 'prs-widget.css';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
    minify: 'esbuild',
  },
});
