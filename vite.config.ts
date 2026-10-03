import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './server/api';

// VITE_STATIC=1 builds the server-less version that GitHub Pages hosts under /<repo>/.
export default defineConfig({
  base: process.env.VITE_STATIC ? './' : '/',
  define: { __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA ?? String(Date.now())) },
  plugins: [react(), apiPlugin()],
  server: { port: 5191 },
  test: { globals: true, environment: 'node' },
});
