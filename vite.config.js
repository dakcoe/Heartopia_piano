import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures relative assets paths are generated for simple hosting
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('tone') || id.includes('@tonejs/midi')) {
              return 'tone-audio';
            }
            return 'vendor';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
