import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'supabase/functions/**', '.claude/**', 'e2e-report/**', 'Skills/**', 'android/**', 'ios/**', 'scripts/**', 'e2e/**', 'node_modules/**', 'docs/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // react-hooks v7 bundles React Compiler rules that only apply when the
      // React Compiler transform is active. This project uses React 19 + Vite
      // WITHOUT the Compiler — these rules generate false positives for every
      // hook call and inline component. Disabled until the Compiler is adopted.
      'react-hooks/static-components':           'off',
      'react-hooks/purity':                      'off',
      'react-hooks/immutability':                'off',
      'react-hooks/set-state-in-effect':         'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
])
