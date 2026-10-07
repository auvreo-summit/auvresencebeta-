import { build } from 'esbuild';

// Vercel's loader rejects jwks-rsa's require() of ESM-only jose. Bundle that
// unchanged dependency graph into CommonJS rather than weakening verification
// or downgrading the authentication SDK.
await build({
  entryPoints: ['server.ts'],
  outfile: '.vercel-backend/server.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['vite'],
  define: { 'import.meta.url': '__auvresence_module_url' },
  banner: {
    js: 'const __auvresence_module_url = require("node:url").pathToFileURL(__filename).href;',
  },
});
