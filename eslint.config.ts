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
    ],
  },
  {
    files: scriptFiles,
    languageOptions: {
      globals: sharedGlobals,
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
  },
  {
    files: ['tests/e2e/screenshot-stable.css'],
    rules: {
      'css/no-important': 'off',
    },
  },
  prettierConfig,
])
