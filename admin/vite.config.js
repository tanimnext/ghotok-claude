import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// In development, /api is proxied to the Express API so the auth cookies are
// first-party. In production, serve the built files and /api from the same
// origin with a reverse proxy (see docs/DEPLOYMENT.md).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxy = { '/api': { target: env.API_URL || 'http://localhost:4000', changeOrigin: false } };
  return {
    base: env.VITE_BASE || '/',
    plugins: [react(), tailwindcss()],
    server: { port: 5173, proxy: apiProxy },
    preview: { port: 5173, proxy: apiProxy },
    // Source maps are written for error tracking but not linked from the bundles.
    build: { sourcemap: 'hidden' },
  };
});
