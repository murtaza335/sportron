import { fileURLToPath } from 'node:url';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// The service_role key must never reach a browser bundle: fail the build if one is configured.
function forbidServiceRole(env: Record<string, string>): Plugin {
  return {
    name: 'forbid-service-role',
    buildStart() {
      const bad = Object.keys({ ...process.env, ...env }).filter((k) => k.startsWith('VITE_') && k.toUpperCase().includes('SERVICE_ROLE'));
      if (bad.length > 0) throw new Error(`Refusing to build: ${bad.join(', ')} must never be exposed to the browser.`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      // Venue PCs are often old: build for ≈ Chrome 64 / Firefox 60 / Safari 12 with polyfills.
      legacy({ targets: ['chrome >= 64', 'firefox >= 60', 'safari >= 12', 'edge >= 79'] }),
      forbidServiceRole(env),
    ],
    resolve: {
      // The scoring engine is pure TypeScript shared with the app (src/lib/live).
      alias: { '@live-engine': fileURLToPath(new URL('../src/lib/live/index.ts', import.meta.url)) },
    },
    server: { port: 5175, fs: { allow: ['..'] } },
  };
});
