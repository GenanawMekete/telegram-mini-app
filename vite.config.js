import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'public',  // Changed from 'dist' to 'public'
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  server: {
    port: 3000
  },
  define: {
    'process.env': {}
  }
});
