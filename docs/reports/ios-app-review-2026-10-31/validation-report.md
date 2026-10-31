# iOS release audit validation — 2026-10-31

Worktree: `/private/tmp/sabq-ios-featured-cover`, branch `codex/ios-featured-cover`.
No source changes performed by validation agent. No UI automation, account writes, publishing, or uploads.

## Environment and safety
- Xcode 27.2 (27B52), only installed Xcode. Deployment target 17.0 across app/test/widget target configurations.
- Fresh isolated simulator: `8C8C61E1-EAE9-4883-8000-5FEFD16CF9FE` (iPhone 17 Pro, iOS 27.0). Existing simulators untouched.
- `sabqTests` inspected before executing: admin saves use injected fake services, album operations use injected closures, SSE uses URLProtocol interception, cache tests use isolated UserDefaults. Tests do not create production content. Fresh host app has no authenticated account, no onboarding or analytics consent.
- UI test target explicitly excluded using `-only-testing:sabqTests`. In-process schedule snapshot tests remain included.

## Native configuration check
PASS: `python3 scripts/verify-mobile-firebase-config.py --platform ios --config 'sabq app ios/sabq/GoogleService-Info.plist' --identity com.sabq.sabqorg`.
Safe output: `/private/tmp/sabq-ios-firebase-validation.json`.

## CI compatibility
`.github/workflows/sabq-vara-ios-build.yml` runs unsigned generic-device build on macos-latest; it does not pin Xcode or execute tests. CLAUDE documents Xcode 26 CI. Local machine cannot prove Xcode 26 compilation because only Xcode 27.2 is installed. Newer Duo symbols in `DuoPosture.swift` have compile-time `canImport(SwiftUICore, _version: 8.0.85)` plus runtime iOS 27.1 guards. Local success must not be represented as Xcode 26 evidence.

## Execution
Initial baseline full unit/in-process suite running. Derived data `/private/tmp/sabq-ios-release-audit-tests`; log `/private/tmp/sabq-ios-release-audit-tests.log`; result bundle `/private/tmp/sabq-ios-release-audit-tests.xcresult`.
Release device build intentionally held until root confirms audit fixes complete.

### Baseline result
PASS: 209 tests, 0 failed, 0 skipped; 207 Swift Testing tests in 25 suites plus 2 XCTest in-process snapshot tests. `xcodebuild` exit 0, `TEST SUCCEEDED`. Exact machine-readable summary: `/private/tmp/sabq-ios-baseline-summary.json`.
Compiler warnings: unused `id` in ContentView.swift:272; ArticleContext.swift:127 calls main actor-isolated normalized from nonisolated context; Validate Firebase build phase has no outputs. No compilation error.

### Combined fix suite result
PASS: 226 test definitions / 235 parameter-expanded executions, 0 failed, 0 skipped. New calendar decoding (including malformed payloads), homepage pagination/race/retry, and comment safety isolation/retry tests all passed. `xcodebuild` exit 0, `TEST SUCCEEDED`.
- Log: `/private/tmp/sabq-ios-release-audit-final-tests.log`
- Result bundle: `/private/tmp/sabq-ios-release-audit-final.xcresult`
- Exact summary: `/private/tmp/sabq-ios-final-summary.json`
Unsigned Release generic-device build now running against the combined source.

### Release device build result
PASS: `xcodebuild -project 'sabq app ios/sabq.xcodeproj' -scheme sabq -configuration Release -destination 'generic/platform=iOS' -derivedDataPath /private/tmp/sabq-ios-release-audit-tests CODE_SIGNING_ALLOWED=NO build` exited 0; `BUILD SUCCEEDED`.
- Device app: `/private/tmp/sabq-ios-release-audit-tests/Build/Products/Release-iphoneos/sabq.app`
- Embedded widget: app `PlugIns/SabqWidgetsExtension.appex`
- Log: `/private/tmp/sabq-ios-release-audit-release.log`
- Final simulator app: `/private/tmp/sabq-ios-release-audit-tests/Build/Products/Debug-iphonesimulator/sabq.app`
Warnings remain the unused `id`, ArticleContext actor isolation, Firebase script outputs, and skipped AppIntents metadata extraction (no framework dependency). No error. Build included Release Firebase validation.

## Limits
No Xcode 26 SDK installed; no iOS 17 simulator/device runtime tested. These results do not verify code signing, App Store upload/validation, actual device rendering, push delivery, Apple/Google login, account deletion, HealthKit, or background audio behavior. No physical device test performed. Root owns visible simulator verification separately. Compliance agent owns packaged privacy-manifest audit. No UI test suite was executed.
