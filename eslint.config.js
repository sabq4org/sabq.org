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
  {
    // Audit T2.1 (2026-06-10): the two monoliths are FROZEN. Ceilings are
    // current size + ~100 lines of slack for bugfixes — adding a new
    // endpoint or query method here WILL fail lint; put it in
    // server/routes/<module>.ts / server/services/<feature>.ts instead
    // (see ADR-001). When an extraction shrinks a file, RATCHET the
    // ceiling down to the new size + 100 so the monolith can't regrow.
    // Re-baselined 2026-07-15: Admin Tools extracted to adminToolsRoutes
    // (+ adminToolsService); routes.ts is 36291 → ceiling = size + 100.
    //
    // Re-baselined 2026-07-25 (security audit remediation): the write-endpoint
    // audit added authorization guards inside EXISTING handlers — publish
    // gates, article-ownership checks, column allowlists. Zero new endpoints,
    // zero new queries; the extractable logic all went to server/services/
    // (publishGate, articleAccessService, calendarAssignmentService). The
    // ratchet's intent — no new FEATURES in the monolith — is unchanged, and
    // the next extraction must ratchet this back down.
    // Re-ratcheted 2026-08-01 after production-log privacy cleanup: the file is
    // 36346 lines. Keep the ceiling exact so no new monolith growth is hidden.
    //
    // Re-baselined 2026-08-08 (scheduled→draft demotion incident): status-demotion
    // and open-for-edit guards inside EXISTING handlers (article GET/PATCH,
    // submit-review ×2, opinion list, analyze-credibility). Zero new endpoints;
    // the extractable rules went to server/services/publishGateRules.ts
    // (decideStatusDemotion, resolveArticleEditFlags, statusAfterSubmitForReview).
    // Ceiling follows the file exactly — the next extraction must lower it.
    files: ["server/routes.ts"],
    rules: { "max-lines": ["error", { max: 36372 }] },
  },
  {
    files: ["server/storage.ts"],
    rules: { "max-lines": ["error", { max: 21100 }] },
  },
  {
    // Third emerging monolith: mobileApiRoutes.ts is the /api/v1 surface and had
    // no ceiling while it grew past 9.8k lines. Cap it here (current size + ~100
    // slack) so new endpoints go in their own module. When an extraction shrinks
    // it, RATCHET this down — same rule as the two monoliths above.
    // RATCHETED DOWN 2026-07-25: the audio-newsletter and audio-brief features
    // were removed, shrinking routes.ts by ~400 lines and storage.ts by ~200.
    // Ceilings follow the files down, per the rule above.
    //
    // Re-baselined 2026-07-25 (security audit remediation): the mobile Bearer
    // session verifier now joins alialhazmi so a ban, deletion or role revocation
    // takes effect immediately instead of after the session's 30-day life
    // (audit #19/#68). Guards inside existing handlers — no new endpoints. The
    // ratchet's intent is unchanged; the next extraction must lower this.
    files: ["server/routes/mobileApiRoutes.ts"],
    rules: { "max-lines": ["error", { max: 10120 }] },
  },
  {
    // AI Hub (issue #589, Phase 3): every AI call goes through
    // server/ai/gateway (aiGateway.complete/embed/generateImage/tts) so it
    // gets usage tracking, cost accounting, and automatic failover. Direct
    // SDK clients bypass all of that. WARN while the wave-by-wave migration
    // is in flight — flip to "error" once the last consumer is migrated.
    files: ["server/**/*.ts"],
    ignores: ["server/ai/gateway/**"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "NewExpression[callee.name='OpenAI']",
          message: "Use aiGateway (server/ai/gateway) instead of a direct OpenAI client — see issue #589.",
        },
        {
          selector: "NewExpression[callee.name='Anthropic']",
          message: "Use aiGateway (server/ai/gateway) instead of a direct Anthropic client — see issue #589.",
        },
        {
          selector: "NewExpression[callee.name='GoogleGenerativeAI']",
          message: "Use aiGateway (server/ai/gateway) instead of a direct Gemini client — see issue #589.",
        },
      ],
    },
  },
  {
    // ADR-001 (docs/architecture/ADR-001-data-access-layer.md): route modules
    // are HTTP-only. Drizzle queries belong in server/services/<feature>.ts;
    // routes call the service. The `ignores` list below is the 46 legacy
    // violators that predate the rule — when you clean one up (move its
    // queries into a service), DELETE it from this list so it can't regress.
    files: ["server/routes/**/*.ts"],
    ignores: [
      "server/routes/abTests.ts",
      "server/routes/advertiserAuth.ts",
      "server/routes/advertiserPayments.ts",
      "server/routes/articleEditLocks.ts",
      "server/routes/audioNewsletterRoutes.ts",
      "server/routes/commentModeration.ts",
      "server/routes/edgeExistsRoute.ts",
      "server/routes/edgeMeta.ts",
      "server/routes/emailAgent.ts",
      "server/routes/focalPoints.ts",
      "server/routes/gulfEvents.ts",
      "server/routes/hajjBlock.ts",
      "server/routes/homepage.ts",
      "server/routes/interests.ts",
      "server/routes/keywordFollowing.ts",
      "server/routes/liveNews.ts",
      "server/routes/loyaltyAdmin.ts",
      "server/routes/mediaStoreRoutes.ts",
      "server/routes/mobileApiRoutes.ts",
      "server/routes/muqtarabAI.ts",
      "server/routes/muqtarabOwn.ts",
      "server/routes/nanoBananaRoutes.ts",
      "server/routes/nativeAds.ts",
      "server/routes/newsMap.ts",
      "server/routes/newsletterAnalyticsRoutes.ts",
      "server/routes/notebookLmRoutes.ts",
      "server/routes/opinionTickets.ts",
      "server/routes/paymentAnalytics.ts",
      "server/routes/pollsRoutes.ts",
      "server/routes/pushNotificationRoutes.ts",
      "server/routes/rssFeedRoutes.ts",
      "server/routes/setup.ts",
      "server/routes/smartClassificationRoutes.ts",
      "server/routes/smartInsightsRoutes.ts",
      "server/routes/smartInterests.ts",
      "server/routes/smartNewsletterRoutes.ts",
      "server/routes/storeCustomerRoutes.ts",
      "server/routes/stories.ts",
      "server/routes/tags.ts",
      "server/routes/tapPaymentRoutes.ts",
      "server/routes/themes.ts",
      "server/routes/trendingKeywords.ts",
      "server/routes/twoFactorRoutes.ts",
      "server/routes/v1/oauthMobile.ts",
      "server/routes/visualAiRoutes.ts",
      "server/routes/whatsappAgent.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db", "**/db.js"],
              message:
                "ADR-001: server/routes/* are HTTP-only. Put Drizzle queries in server/services/<feature>.ts and import that instead.",
            },
          ],
        },
      ],
    },
  },
);
