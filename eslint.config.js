import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const deterministic =
  'Moteur déterministe : utilise le RNG à graine et l’horloge simulée (CLAUDE.md, règle 2).';
const pureEngine =
  'Le moteur ne dépend ni du DOM, ni de React, ni des API de Node (CLAUDE.md, règle 1).';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    'coverage/**',
    'data/raw/**',
    'data/build/**',
    'results/**',
  ]),
  js.configs.recommended,
  tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Règles d'architecture : moteur et paquet partagé tournent à l'identique en Worker et en CLI.
  {
    files: ['packages/engine/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: deterministic },
        { object: 'Date', property: 'now', message: deterministic },
        { object: 'performance', property: 'now', message: deterministic },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: deterministic },
      ],
      'no-restricted-globals': [
        'error',
        ...['performance', 'setTimeout', 'setInterval', 'requestAnimationFrame'].map((name) => ({
          name,
          message: deterministic,
        })),
        ...[
          'window',
          'document',
          'navigator',
          'self',
          'localStorage',
          'fetch',
          'process',
          'Buffer',
          'require',
          '__dirname',
        ].map((name) => ({ name, message: pureEngine })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'path',
                'os',
                'worker_threads',
                'react',
                'react-dom',
                'react/*',
              ],
              message: pureEngine,
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'apps/cli/**/*.ts',
      'scripts/**/*.{ts,mjs}',
      'apps/web/scripts/**/*.mjs',
      'apps/web/server/**/*.ts',
      '**/*.config.{ts,js}',
    ],
    languageOptions: { globals: globals.node },
  },
]);
