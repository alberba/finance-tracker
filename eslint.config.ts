import css from '@eslint/css'
import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import astro from 'eslint-plugin-astro'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import { defineConfig } from 'eslint/config'
import { tailwind4 } from 'tailwind-csstree'
import tseslint from 'typescript-eslint'

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
}

const scriptFiles = ['**/*.{js,mjs,cjs,ts,mts,cts}', '**/*.astro/*.js', '**/*.astro/*.ts']
const vueFiles = ['**/*.vue']

const scopedTsConfigs = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: scriptFiles,
}))
const scopedVueConfigs = vue.configs['flat/recommended'].map((config) => ({
  ...config,
  files: vueFiles,
}))

export default defineConfig([
  {
    ignores: [
      'dist/**',
      'coverage/**',
      '.astro/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      // Nested git worktrees under `.claude/worktrees/**` each carry their
      // own `tsconfig.json`, which confuses typescript-eslint's automatic
      // project-root detection (it sees two candidate `tsconfigRootDir`s and
      // refuses to guess) once one exists alongside this repo. They're
      // scratch checkouts, not part of this project's source tree.
      '.claude/worktrees/**',
    ],
  },
  {
    files: scriptFiles,
    languageOptions: {
      globals: sharedGlobals,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: scriptFiles,
    ...js.configs.recommended,
  },
  ...scopedTsConfigs,
  ...astro.configs['flat/recommended'],
  ...scopedVueConfigs,
  {
    files: vueFiles,
    languageOptions: {
      globals: sharedGlobals,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.css'],
    plugins: {
      css,
    },
    language: 'css/css',
    languageOptions: {
      customSyntax: tailwind4,
    },
    extends: ['css/recommended'],
    rules: {
      // Design tokens (var(--primary), --line, …) live in legacy.css :root and
      // are consumed across files; the rule can't resolve them cross-file.
      'css/no-invalid-properties': ['error', { allowUnknownVariables: true }],
    },
  },
  {
    files: ['tests/e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='page'][callee.property.name='reload']",
          message:
            'Usa `tracker.reload()`: espera a `html[data-finance-ready]` antes de navegar. Un `page.reload()` a pelo da fallos que parecen lentitud de compilación.',
        },
      ],
    },
  },
  {
    files: ['tests/e2e/screenshot-stable.css'],
    rules: {
      'css/no-important': 'off',
    },
  },
  prettierConfig,
])
