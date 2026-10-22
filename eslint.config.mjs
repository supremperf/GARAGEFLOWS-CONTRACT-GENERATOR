// Configuration ESLint (flat config) — contrôle qualité minimal mais réel :
// erreurs bloquantes sur les problèmes avérés, avertissements assumés et comptés.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'dist-renderer/**', 'dist-electron/**', 'captures/**', 'examples/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Scripts Node en CommonJS assumé (outillage de build Windows).
    files: ['scripts/**/*.cjs'],
    languageOptions: { globals: { require: 'readonly', module: 'writable', console: 'readonly', process: 'readonly', __dirname: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', Buffer: 'readonly', __dirname: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        window: 'readonly', document: 'readonly', fetch: 'readonly', URL: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
);
