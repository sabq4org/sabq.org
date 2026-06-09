// ESLint — "stop the bleeding" config.
//
// Deliberately NOT the recommended presets: with ~120k lines of legacy code,
// enabling them would produce thousands of findings nobody will fix in bulk.
// Instead, a handful of rules that block NEW technical debt:
//
//   1. no-console            → console.log doesn't ship (vite strips it in prod,
//                              but it shouldn't pile up in source either)
//   2. no-explicit-any       → warn-level visibility (885 legacy uses; new code
//                              should not add more)
//   3. raw fetch('/api') ban → breaks DIRECT mode (VITE_API_URL); use
//                              apiRequest/apiUrl from @/lib/queryClient
//   4. rules-of-hooks        → violating it is a runtime bug, always an error
//
// CI lints only the files changed in a PR (.github/workflows/lint.yml), so
// legacy debt never blocks a merge — but touched files must not add new debt.

import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "android/**",
      "ios/**",
      "cloudflare-worker/**",
      "functions/**",
      "attached_assets/**",
      "public/**",
      "scripts/**",
      "migrations/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    files: ["client/src/**/*.{ts,tsx}", "shared/**/*.ts", "server/**/*.ts", "e2e/**/*.ts", "*.config.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Client only: raw fetch('/api/...') works in PROXY mode but breaks in
    // DIRECT mode (VITE_API_URL set). 235 legacy callsites exist — do not add
    // more; use apiRequest()/apiUrl() from @/lib/queryClient instead.
    files: ["client/src/**/*.{ts,tsx}"],
    ignores: ["client/src/lib/queryClient.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch'][arguments.0.value=/^\\u002Fapi\\u002F/]",
          message:
            "Raw fetch('/api/...') breaks DIRECT mode (VITE_API_URL). Use apiRequest()/apiUrl() from @/lib/queryClient.",
        },
        {
          selector: "CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\\u002Fapi\\u002F/]",
          message:
            "Raw fetch(`/api/...`) breaks DIRECT mode (VITE_API_URL). Use apiRequest()/apiUrl() from @/lib/queryClient.",
        },
      ],
    },
  },
  {
    // Server: console IS the logging mechanism (Railway captures stdout).
    files: ["server/**/*.ts"],
    rules: {
      "no-console": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
);
