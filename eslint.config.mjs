// Config única do monorepo (ESLint flat config). Os workspaces rodam `eslint .`
// e herdam este arquivo por busca ascendente. Checagem de tipos fica no `typecheck`.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/prisma/migrations/**',
      '.data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: {
      next: { rootDir: `${import.meta.dirname}/apps/web/` },
    },
    rules: {
      ...nextPlugin.configs['core-web-vitals'].rules,
      // Imagens vêm de blob:/data:/API autenticada; next/image não se aplica.
      '@next/next/no-img-element': 'off',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
);
