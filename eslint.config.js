import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'supabase/functions/**', '.claude/**', 'e2e-report/**', 'Skills/**', 'android/**', 'ios/**', 'scripts/**', 'e2e/**', 'node_modules/**', 'docs/**']),
  // Node.js globals for test harness scripts (B2 — TEST-1)
  {
    files: ['tests/**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
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
  {
    // Vercel Edge Middleware — runs on Vercel's edge runtime, not the browser.
    files: ['middleware.js'],
    languageOptions: {
      globals: { ...globals.node, Response: 'readonly', Request: 'readonly', URL: 'readonly' },
    },
  },
  // Design-token guardrails (B4 — design audit P1). 'warn', not 'error': the
  // codebase still has ~156 raw white-alpha values (B1) and ~474 raw font-size
  // declarations (B2) that haven't been swept onto tokens yet, so an 'error'
  // severity here would fail every PR's lint step today. Flip each rule to
  // 'error' once its corresponding sweep (B1 for the rgba rule, B2 for the
  // font-size rules) lands and the codebase is actually clean, or CI won't
  // catch new violations and this becomes a stale warning nobody reads.
  {
    files: ['src/**/*.{js,jsx}'],
    rules: {
      'no-restricted-syntax': ['warn',
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/]",
          message: 'Raw hex color — use a CSS variable from src/index.css instead.',
        },
        {
          selector: "Property[key.name='fontSize'] > Literal[value=/^-?\\d+(\\.\\d+)?px$/]",
          message: 'Raw pixel fontSize — use the type-ramp step from src/index.css instead (B2).',
        },
        {
          selector: "Property[key.name='fontSize'] > Literal[raw=/^-?\\d+(\\.\\d+)?$/]",
          message: 'Raw unitless fontSize (implicit px) — use the type-ramp step from src/index.css instead (B2).',
        },
        {
          selector: "Literal[value=/text-\\[\\d+(\\.\\d+)?px\\]/]",
          message: 'Raw pixel Tailwind arbitrary text size — use the type-ramp step from src/index.css instead (B2).',
        },
        {
          selector: "Literal[value=/rgba\\(\\s*255\\s*,\\s*255\\s*,\\s*255\\s*,/]",
          message: "White-alpha rgba() — use a real token (--rule, --elev, --card, --on-shell, --on-shell-dim) instead (B1).",
        },
      ],
    },
  },
])
