// ESLint flat config for the whole monorepo.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**', 'server/uploads/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'no-param-reassign': ['error', { props: false }],
    },
  },
  // Node.js code: the API, the shared package, scripts and config files.
  {
    files: ['server/**/*.js', 'shared/**/*.js', '**/*.config.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  // The shared API client runs in the browser (website and admin panel).
  {
    files: ['shared/src/api-client.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['server/src/scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },
  // React code: the Next.js website, the Vite admin panel and the shared UI kit.
  {
    files: ['web/src/**/*.{js,jsx}', 'admin/src/**/*.{js,jsx}', 'ui/src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['web/src/**/*.{js,jsx}'],
    plugins: { '@next/next': nextPlugin },
    languageOptions: { globals: { ...globals.node } },
    settings: { next: { rootDir: 'web/' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  // Keep formatting concerns with Prettier.
  prettier,
];
