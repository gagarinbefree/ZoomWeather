import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier/flat';

const sourceFiles = ['src/**/*.ts', 'src/**/*.vue', '*.config.ts'];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.cache/**',
      'dist/**',
      'dist-e2e/**',
      'dist-android/**',
      'dist-fdroid/**',
      'android/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.agents/**',
    ],
  },
  js.configs.recommended,
  { files: sourceFiles, extends: [tseslint.configs.strictTypeChecked] },
  ...vue.configs['flat/recommended'],
  {
    files: sourceFiles,
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      'vue/multi-word-component-names': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**'],
              message: 'Use public slice aliases for imports across directories.',
            },
          ],
        },
      ],
    },
  },
  ...[
    ['shared', ['app', 'pages', 'widgets', 'features', 'entities']],
    ['entities', ['app', 'pages', 'widgets', 'features']],
    ['features', ['app', 'pages', 'widgets']],
    ['widgets', ['app', 'pages']],
    ['pages', ['app']],
  ].map(([layer, forbidden]) => ({
    files: [`src/${layer}/**/*.{ts,vue}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['../**'], message: 'Import other slices through their public aliases.' },
            {
              group: forbidden.map((name) => `@/${name}/**`),
              message: 'FSD layers may only depend on lower layers.',
            },
          ],
        },
      ],
    },
  })),
  prettier,
);
