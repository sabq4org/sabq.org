# Sabq iOS App Review compliance audit — 2026-10-31

Initial scope: read-only audit of `/private/tmp/sabq-ios-featured-cover`, branch `codex/ios-featured-cover`, local version 10.4.1/build 2026103106. User UI changes preserved. After the initial audit, coordinator authorized narrow local fixes to CommentSafetyStore.swift, its new tests, and PrivacyInfo.xcprivacy; these are described below. No app upload, production mutation, account deletion, or credential access. AGENTS.md, CLAUDE.md and auth-rbac/comments/mobile-analytics/platform-runtime system docs inspected. This document distinguishes source evidence from runtime/console evidence.

## Decision

Do not call this candidate submission-ready yet. Address the account-erasure mismatch, verify/update privacy disclosures, and verify the local block-list recovery fix. A new build number is also required: root's live App Store Connect inspection found 10.4.1 build **2026103107** already uploaded and Ready to Submit, and 3106 already uploaded; the current local number cannot be uploaded anew. This console finding was supplied by the coordinator, not independently inspected by this auditor.

## Findings

### P1 — Account deletion promises complete erasure but retains directly identifying records

Evidence:
- `sabq app ios/sabq/Screens/Settings/DeleteAccountSheet.swift:102` promises permanent deletion of the account and all data; `SettingsView.swift:722` repeats it.
- `server/routes/mobileApiRoutes.ts:2798–2811` wipes a fixed list of 12 tables. `:2813–2818` swallows every individual deletion error. `:2824–2850` updates the user row rather than deleting it, so FK ON DELETE cascades cannot clean omitted children.
- Omitted `newsletter_subscriptions` retains email, linked user ID, IP and subscription status (`shared/schema.ts:9620–9648`). Omitted `comments` retains content and the user ID (`:1628–1637`); `behavior_logs` retains linked events (`:1944–1955`). On the user row itself, press ID and media-license number/file reference remain (`:655–660`), because none appears in the anonymizing UPDATE.
- `server/routes/mobileAccountHooks.ts:56–68` adds block removal and Apple revocation, not these deletions. No matching cleanup job was found in the inspected jobs/services. Public comments are hidden for deleted authors (`server/services/commentVisibility.ts:28–35`); hiding is not deletion.

Impact: account-linked personal data can remain after a success response, without an explanation of retained categories or retention grounds. This is confirmed in source, not by deleting a real account. Apple expects removal of associated data except legally required retention, with transparent disclosure ([account-deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)).

Required resolution: inventory user-scoped records and any lawful retention; implement an idempotent, verifiable erasure process and honest UI copy. Test with disposable local/staging accounts covering local/Apple/phone, newsletter subscription and contribution documents. No production erase should be used as an audit test.

### P2 — Failed block-list fetch permanently suppresses retry for that account session (fixed locally; five regression tests passed)

`CommentSafetyStore.swift:40–47` sets `loadedForUserId` before fetching, then `try?` silently discards failure. Subsequent `syncIfNeeded` calls return early. Existing blocked authors therefore appear after a transient first-load failure until explicit manual reload/logout/relaunch. A late old-account response can also repopulate state after `clear()` because the fetch has no account/generation guard. `ArticleCommentsSection.swift:194` relies on this store for local filtering.

Required resolution: only mark a fetch successful after it completes; clear/isolate account state; reject stale completions and allow retry. A meaningful async test should fail the first request, succeed the next, and exercise logout/account change while a fetch is pending. This undermines the implemented UGC blocking feature; Apple 1.2 requires functional reporting/blocking ([guidelines](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)).

### P2 — Original candidate manifest omits explicit search-history collection (fixed locally and verified in Release bundle)

`SearchView.swift:133` calls `SabqAnalytics.searchSucceeded`; `SabqAnalytics.swift:121` sends `search_term`, subject to consent and sanitizer, through `Analytics.logEvent` (`:151–156`). `SabqAnalytics.swift:160–188` can also associate analytics with the authenticated internal user ID. Sanitization excludes obvious URLs/email/long numbers but retains ordinary query text.

Root manifest `PrivacyInfo.xcprivacy:9–133` declares ten collection categories and no `NSPrivacyCollectedDataTypeSearchHistory`. The same omission was verified in the built Debug .app. Apple identifies in-app queries as Search History, separately from Product Interaction ([privacy details](https://developer.apple.com/app-store/app-privacy-details/)). Reconcile the source manifest and App Store Connect privacy label; the published label was not yet known when this finding was drafted. Consent does not by itself remove disclosure obligations.

### P2 — Privacy policy incomplete about analytics and retention; AI permission is a review risk

`LegalPagesView.swift:260–352` contains the in-app privacy policy. It discloses local-only HealthKit and anonymous-comment AI moderation, but does not explain Firebase Analytics/user-linked search collection, the actual retention/deletion rules, or the protection afforded by processors. `SettingsView.swift:828–840` describes a general usage-analytics toggle, but it controls Firebase only; first-party reading/loyalty events continue through `BehaviorTracker.swift:40–81,98–133`.

The first-comment consent prompt (`CommentComposer.swift:44–52`) mentions abuse rules only. Every accepted comment is passed to the external AI pipeline (`mobileApiRoutes.ts:4258–4274`, `commentInsightsService.ts:516`, `commentModeration.ts:147–156`). Free text may contain personal information; the pipeline does not strip it here. Third-party-AI disclosure is buried at `LegalPagesView.swift:314`, not in that explicit consent. This establishes a disclosure/consent gap to resolve, not proof that a particular person's data was transferred in production. Apple's current 5.1.1/5.1.2 requires accurate privacy disclosures and explicit permission for sharing personal data with third-party AI ([guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy)).

Recommended: explain the processor/data/purpose at the existing first-use consent, provide cancel, version the acknowledgement if changed, and describe accurately which usage collection the toggle controls. Preserve comment moderation.

### P2 — Published Health wording does not match this implementation (coordinator evidence)

Root observed current App Store description referencing steps/calories. `HealthKitManager.swift:57–62` requests only stepCount and sleepAnalysis, with no calories query. Use steps/sleep in the new version's metadata. Source is conclusive; console wording is coordinator-provided. Review notes already describe steps/sleep.

## Positive findings / scope limits

| Area | Evidence and result |
|---|---|
| In-app account deletion | Accessible via Settings. Arabic or DELETE confirmation supported (`DeleteAccountSheet.swift:24–29`). Passwordless accounts can delete; native Apple reauth is implemented. Source passes availability, not data-erasure completeness. |
| Apple login alongside Google | `SocialAuthButtons.swift:33–36,67–88`; Apple sign-in entitlement exists. Native authentication and private relay were not exercised on a real device. |
| Apple token revocation | `mobileAccountHooks.ts:48–68` + `appleTokenRevocation.ts:57–101` perform exchange/revoke when configured. Errors/cancellation are best effort; no durable retry. Production credentials and successful revocation unverified. |
| UGC reporting/moderation | Comment menu, reasons, block/unblock, first-use abuse terms, pending moderation, contact email/WhatsApp and server reporting routes exist. 24-hour operational moderation SLA and deployed table state unverified. |
| HealthKit | Read-only step/sleep, explicit opt-in, values held locally in `HealthKitManager`; no health upload found. Absence of Health collection in privacy label is not automatically an issue for device-only processing. |
| Permission purpose strings | Built Debug Info.plist includes meaningful Arabic camera/photo library/photo-save/Health descriptions. No microphone/location/contact request paths found in the app search. Health write description is unnecessary but no write authorization is requested. |
| Tracking | Root manifest tracking=false; Firebase analytics off by default; ad storage/user data/personalization denied; project links FirebaseAnalyticsWithoutAdIdSupport. No ATT blocker established. Full network behavior untested. |
| Purchases | No StoreKit/IAP/checkout purchase implementation found in the audited native code. Sabq Plus is an admin-only preview (`SettingsView.swift:633–645`), loyalty redemption, not evidence of paid digital purchases. Its preview status should be explained if reviewer accounts expose it. |
| Version/config | App and widget source versions are10.4.1/2026103106; iOS17 minimum. Debug compiled SDK27.2/Xcode27.2. Apple accepts Xcode27.2 as of Oct30; minimum required SDK26 is satisfied by this debug build, not yet a signed archive. ([requirements](https://developer.apple.com/news/upcoming-requirements/), [release notes](https://developer.apple.com/help/app-store-connect/release-notes/)) |

## Bundle inspection

Inspected `/private/tmp/sabq-featured-cover-build/Build/Products/Debug-iphonesimulator/sabq.app` read-only. Root PrivacyInfo.xcprivacy exists and parses. Bundled manifests exist for FirebaseCore/CoreInternal/Installations, GoogleSignIn/Swift, AppAuth/Core, GTMAppAuth, GTMSessionFetcher, GoogleUtilities components, nanopb and Promises. GoogleSignIn manifest adds coarse location/other usage/etc., so the source app manifest alone is insufficient to derive the full nutrition label. Package.resolved pins Firebase11.15.0/GoogleSignIn9.1.0. Dependency pins alone do not prove the shipped binary contents.

Required-reason categories: UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime35F9.1, DiskSpaceE174.1. App-owned defaults and own-cache modification date were found; no missing required-reason category established. No shared app-group defaults were found in widget code. Reasons CA92.1/C617.1 align with Apple's definitions ([API reasons](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons)). SDK manifests are required for listed dependencies ([SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)); final signed Release archive and validation remain necessary.

## Unverified submission gates

- Exact new version draft/build selection, new unique build number, signed distribution profile and entitlement approval; no local ci_scripts auto-increment found, fallback deploy script explicitly does not increment.
- Updated App Store Connect privacy label, support URL validity, app age questionnaire including UGC, screenshot correspondence to latest UI, and required iPad assets.
- Demo credentials are present according to root; actual login/2FA/access not validated. Do not expose or export them. A reviewer needs usable access without a personal OTP dependency.
- Physical-device first launch, Apple/Google/OTP login, camera/photo denial/limited selection, push/APNs, Health denial, Wallet, account deletion/revocation on an isolated account.
- No claim of Apple approval or guaranteed acceptance. Prior approval of10.4.0 does not prove10.4.1 readiness.


## App Store Connect privacy label — LIVE coordinator evidence, confirmed mismatch

Coordinator read App Privacy during this audit: label published five months ago, privacy URL `https://sabq.org/ar/privacy`, exactly seven data types: Product Interaction (Functionality + Analytics, unlinked), Name (Functionality, linked), Email Address (Functionality, unlinked), Phone Number (Personalization, unlinked), Advertising Data (Analytics + Functionality, linked), Photos/Videos (Functionality, unlinked), Emails/Text Messages (Functionality, unlinked). No Search History, User ID/Device ID, or Diagnostics were shown. This is live UI evidence supplied by root; I did not reopen or edit the console.

**P1 — Do not submit with the existing label unchanged.** Unlike the earlier uncertain-label observation, the discrepancy is now established: app manifest declares linked Email/Phone/Photos/Product Interaction/User ID; authenticated analytics assigns internal user ID; app search sends the query; bundled GoogleSignIn also declares further categories. The published label does not match these app/SDK disclosures. Reconcile actual collection with a generated archive privacy report and update the label before submission. Do not blindly union every SDK's potential type without verifying which functions collect it. Advertising Data is currently declared while the inspected Firebase setup disables ad signals; that entry also needs reconciliation, rather than automatic deletion.

Current code maps:
- Account-linked email/phone/photos: app manifest lines 23–62; auth/profile requests establish these as account properties.
- Linked product interaction: root manifest lines 96–108; `SabqAnalytics.swift:160–188` sets account ID for consented analytics events.
- Search History: `SearchView.swift:133` → `SabqAnalytics.swift:121`, absent from live label.
- User ID: `SabqAnalytics.swift:188`, absent from live label.
- SDK coarse location/other diagnostics/etc.: built GoogleSignIn/FirebaseInstallations manifests. Verify generated report and actual configuration before final categorization.

## Narrow remediation completed locally

Coordinator explicitly authorized fixes after baseline build. Modified only:
1. `sabq app ios/sabq/Stores/CommentSafetyStore.swift`: mark loaded only after successful fetch, let failures retry, retain last-known blocks on refresh error, clear state immediately on account switch, and reject responses from requests invalidated by logout/account switch/newer reload.
2. `sabq app ios/sabqTests/CommentSafetyStoreTests.swift`: five isolated async tests for initial failure/retry and successful caching, pending logout, pending account switch, failed refresh retaining blocks, and clearing prior-account blocks before the next fetch completes.
3. `sabq app ios/sabq/PrivacyInfo.xcprivacy`: added Search History, linked=true, purpose Analytics, tracking=false. Consent behavior unchanged.

`plutil -lint` and `git diff --check` passed. Full compilation/test execution delegated to the coordinator's existing validation agent to avoid concurrent Xcode work; result pending at this update. Account deletion backend, Apple revocation, consent UI, privacy-policy copy, console metadata and live privacy label remain unchanged. No production write tests.


## Verified privacy URL / independent review update

Root opened `https://sabq.org/ar/privacy` in the in-app browser and confirmed a functioning, readable privacy policy (July2026). The web policy discloses comment text sent to OpenAI with Anthropic/Gemini alternatives, but no separate withdrawal mechanism. This corrects the earlier URL-verification unknown: the privacy URL is valid. The native policy is separate, dated October2026, with its own text at LegalPagesView.swift:260. Web disclosure is present; the first-comment native prompt still does not explicitly disclose/obtain permission for external AI sharing, so the identified consent review risk remains.

Root independently reviewed the CommentSafetyStore diff, tests and manifest, finding the fetch retry/clear/generation implementation reasonable. Full test execution remains the verification agent's responsibility; this is independent review, not a substitute for test evidence. No further code changes after this point.

## Test verification update

Validation agent reports the combined suite passed, including all five new CommentSafetyStore tests. This supersedes the earlier tests-pending note. Final unsigned Release bundle inspection is still pending. No real service or real user account was used by these five tests.

Read the validation artifacts directly: `/private/tmp/sabq-ios-final-summary.json` reports Passed, totalTestCount226, failedTests0, skippedTests0; device-level runs235 include parameterized invocations. `/private/tmp/sabq-ios-release-audit-final-tests.log:2056` explicitly records CommentSafetyStoreTests passed and `:2433` TEST SUCCEEDED. Result bundle: `/private/tmp/sabq-ios-release-audit-final.xcresult`.


## Final Release-bundle verification — completed

Inspected `/private/tmp/sabq-ios-release-audit-tests/Build/Products/Release-iphoneos/sabq.app` directly after validation reported successful build. Build log `/private/tmp/sabq-ios-release-audit-release.log:7275` says BUILD SUCCEEDED. This is an **unsigned device Release build**, not a signed archive/upload validation.

- App10.4.1/build2026103106; SDKiphoneos27.2/Xcode27.2; minimumiOS17; non-exempt encryption false.
- Embedded widget version/build matches exactly10.4.1/2026103106.
- Twenty PrivacyInfo.xcprivacy files found: root +19 dependency bundles, including FirebaseCore/CoreInternal/Installations, GoogleSignIn, AppAuth, GTM, GoogleUtilities, nanopb, Promises. No embedded .xctest bundle.
- Root Release manifest includes SearchHistory linked=true, tracking=false, purposeAnalytics, confirming the local disclosure edit is actually packaged.
- Root NSPrivacyTracking=false. Final signed SDK signature/provisioning/ASC validation remains outside this unsigned build evidence.

Coordinator additionally verified the final Debug app launches; guest Settings analytics toggle is OFF; the native privacy screen opens and shows October2026 text with the AI statement. These UI observations are coordinator evidence, not actions performed by this auditor.

Final disposition: local block-list fix and manifest fix are verified; the account-erasure issue, live App Privacy label mismatch, AI consent review risk, metadata correction, unique build increment and physical-device/auth checks remain open. No backend changes, console edits, upload or production deletion were performed.
