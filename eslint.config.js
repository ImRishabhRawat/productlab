import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const hooksRules = Object.fromEntries(
  Object.keys(reactHooks.configs.recommended.rules).map((rule) => [rule, rule === 'react-hooks/rules-of-hooks' ? 'error' : 'warn']),
);

export default [
  { ignores: ['**/node_modules/**', 'frontend/dist/**', 'backend/.data/**', '.agents/**'] },
  js.configs.recommended,
  {
    files: ['backend/**/*.js', 'shared/**/*.js', '*.js', 'frontend/vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: globals.browser,
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...hooksRules,
      'react/prop-types': 'off',
    },
  },
  {
    files: ['frontend/src/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];
