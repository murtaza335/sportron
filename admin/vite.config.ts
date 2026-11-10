import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The service_role key must never reach a browser bundle: fail the build if one is configured.
function forbidServiceRole(env: Record<string, string>): Plugin {
  return {
    name: 'forbid-service-role',
    buildStart() {
      const bad = Object.keys({ ...process.env, ...env }).filter(
        (k) => k.startsWith('VITE_') && k.toUpperCase().includes('SERVICE_ROLE'),
      );
      if (bad.length > 0) {
        throw new Error(`Refusing to build: ${bad.join(', ')} must never be exposed to the browser.`);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // App version of the mobile app (for the minimum-version form), read at build time.
  const appJson = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  return {
    plugins: [react(), forbidServiceRole(env)],
    define: { __APP_VERSION__: JSON.stringify(appJson?.expo?.version ?? appJson?.version ?? '') },
    server: { port: 5174 },
  };
});
