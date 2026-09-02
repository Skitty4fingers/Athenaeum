import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * Flat config (ESLint 9+). The `lint` script referenced `eslint` for a long
 * time with no config file present, so it always failed and nothing in this
 * client had ever been linted — this is that gap closed.
 *
 * Deliberately type-unaware (`tseslint.configs.recommended`, not
 * `recommendedTypeChecked`): the type-aware rules need a second full TS
 * program on every run, and `npm run typecheck` already covers what they'd
 * add for this codebase.
 */
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Vendored shadcn/Kibo files export variants and helpers alongside their
      // components by design; warn rather than fail on the fast-refresh rule.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // `_`-prefixed args are the established way to mark an intentionally
      // unused parameter (a required signature position, a catch binding).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // react-hooks v6 ships the React Compiler's diagnostics. These two flag
      // the "sync a draft from a prop" effect used by most edit forms here.
      // It is a pattern React docs discourage, but converting 13 of them to
      // derive-during-render or `key`-remount is a behavioural refactor, not a
      // lint fix — kept visible as warnings to be paid down deliberately
      // rather than errored out or silently disabled.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn'
    }
  },
  {
    // Node scripts and config files, not browser code.
    files: ['*.config.{js,ts}', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node }
  }
)
