import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['apps/web/**/*.{js,jsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'off', // JSX React components frequently import React/components
    },
  },
  {
    files: ['apps/worker/**/*.{js,mjs}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Direct fetch is strictly forbidden in worker code. All outbound HTTP monitoring requests must route exclusively through @apiwatch/ssrf-guard safeRequest.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message:
                'Direct axios is strictly forbidden in worker code. All outbound HTTP monitoring requests must route exclusively through @apiwatch/ssrf-guard safeRequest.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      'packages/db/generated/**',
      'apps/web/dist/**',
    ],
  },
];
