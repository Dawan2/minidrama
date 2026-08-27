import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Platform constraints are enforced here, not in a review checklist.
 *
 * Everything in `docs/architecture/tech-stack.md` §6 that can be expressed as a lint rule is
 * expressed as one, so a prohibited construct fails `pnpm lint` rather than failing the platform
 * code scan a week later. The rules that cannot be seen in an AST — what actually lands in the
 * emitted bundle, what `index.html` loads — are covered by `app/tools/`.
 */

/** Constructs the TikTok Minis runtime rejects outright. */
const platformBannedSyntax = [
  {
    selector: "CallExpression[callee.name='eval']",
    message: 'eval is prohibited by the TikTok Minis runtime and fails the platform code scan.',
  },
  {
    selector: "NewExpression[callee.name='Function']",
    message: 'The Function constructor is prohibited by the TikTok Minis runtime.',
  },
  {
    selector: "CallExpression[callee.name=/^set(Timeout|Interval)$/][arguments.0.type='Literal']",
    message: 'String-form setTimeout/setInterval is prohibited; pass a function.',
  },
  {
    selector: 'JSXOpeningElement[name.name=/^(video|audio|iframe|object|embed)$/]',
    message:
      'Native media and frame elements are prohibited. Episode video plays through VePlayer ' +
      'via TTMinis.getPlayer(); TikTok replaces a <video> element with a blocked UI.',
  },
  {
    selector:
      "CallExpression[callee.property.name='createElement'][arguments.0.value=/^(video|audio|iframe|object|embed)$/]",
    message: 'Native media and frame elements are prohibited, including when created imperatively.',
  },
  {
    selector: "MemberExpression[object.object.name='navigator'][object.property.name='clipboard']",
    message: 'The clipboard API is blocked inside the TikTok WebView.',
  },
  {
    selector: "MemberExpression[object.name='navigator'][property.name=/^(geolocation|vibrate)$/]",
    message: 'Geolocation and vibration are blocked inside the TikTok WebView.',
  },
];

const bannedMediaPackages = [
  { name: 'hls.js', message: 'Third-party players are prohibited. Use VePlayer via the bridge.' },
  { name: 'video.js', message: 'Third-party players are prohibited. Use VePlayer via the bridge.' },
  {
    name: 'shaka-player',
    message: 'Third-party players are prohibited. Use VePlayer via the bridge.',
  },
  { name: 'dashjs', message: 'Third-party players are prohibited. Use VePlayer via the bridge.' },
  { name: 'plyr', message: 'Third-party players are prohibited. Use VePlayer via the bridge.' },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'app/minis.config.json',
      'docs/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-script-url': 'error',
      'no-restricted-syntax': ['error', ...platformBannedSyntax],
      'no-restricted-imports': ['error', { paths: bannedMediaPackages }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Client sources: browser globals, React rules, and the containment rule for the SDK global.
  {
    files: ['app/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-globals': [
        'error',
        {
          name: 'TTMinis',
          message: 'Reach the platform SDK through PlatformBridge, never directly.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...platformBannedSyntax,
        {
          selector: "MemberExpression[property.name='TTMinis']",
          message:
            'window.TTMinis may only be referenced inside app/src/platform/. Everything else ' +
            'goes through PlatformBridge so it stays testable off-device.',
        },
      ],
    },
  },

  // The bridge is the one module allowed to hold the SDK reference. That is its whole job.
  {
    files: ['app/src/platform/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...platformBannedSyntax],
      'no-restricted-globals': 'off',
    },
  },

  // Node-side code: build tools, the server, and the workspace packages.
  {
    files: [
      'server/**/*.ts',
      'app/tools/**/*.ts',
      'packages/**/*.ts',
      'app/vite.config.ts',
      'eslint.config.js',
    ],
    languageOptions: { globals: globals.node },
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
