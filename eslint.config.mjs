import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Next.js flat config (node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler advisories (eslint-plugin-react-hooks v7). They flag patterns this codebase uses on purpose and that work
    // without the compiler: resetting local state when a prop changes, and "latest value" refs read during render.
    // Kept visible as warnings for a later refactor (DECISIONS #11); every other rule stays an error.
    rules: { 'react-hooks/set-state-in-effect': 'warn', 'react-hooks/refs': 'warn' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', '.local/**', 'test-results/**', 'playwright-report/**', 'design/**']),
]);
