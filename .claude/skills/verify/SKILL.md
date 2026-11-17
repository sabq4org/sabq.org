---
name: verify
description: Run the change for real and collect evidence before saying it is done or committing. Use after any code change in sabq (API, SPA/dashboard, web-next, iOS, Android), on «تحقق», «جرّب التغيير», «verify», and before every commit.
---

# verify — run the change, then show the evidence

A green build or a passing unit test is not verification. Verification means
the changed behaviour was exercised on the running app and the result was
looked at. Pick the surfaces the diff touches, run them, and report evidence.

Commands marked **(verified 2026-11-17)** were run end to end on the owner's
Mac on that date. Anything marked **(not verified)** is documented from the
repo but was not run; say so if you rely on it. Port 5050, brew Postgres and
the missing system Java describe that Mac only; check them on another machine.

## 0. Guard (always, before anything that can write)

```bash
grep -E '^DATABASE_URL=' .env.local | sed -E 's#://[^@]+@#://***@#'
```

```bash
grep -c '^NEON_DATABASE_URL=' .env .env.local
```

```bash
printenv NEON_DATABASE_URL DATABASE_URL | sed -E 's#://[^@]+@#://***@#'
```

```bash
pg_isready
```

Continue only if the file host is `localhost`, both `NEON_DATABASE_URL` counts
are 0, `printenv` prints nothing remote (a shell export overrides the files),
and Postgres accepts connections. Postgres on this machine is a brew
service, not Docker; do not run `npm run db:up`. Never run a write test
against production, and never create test content there (AGENTS.md rule 7).

## 1. Cheap checks first

```bash
npm run check
```

```bash
npx eslint <changed .ts/.tsx files>
```

```bash
npx vitest run <related test files>
```

Use `npm run test:unit` for the full suite, and `npm run test:web-next` when
`web-next/` changed. Fix failures here before starting any server.

## 2. API and SPA (dashboard, admin, non-SSR routes)

Start the server in the background with workers off, so no cron, push or
newsletter job fires from a dev machine **(verified 2026-11-17)**:

```bash
ENABLE_BACKGROUND_WORKERS=false ENABLE_NEWSLETTER_SCHEDULER=false ENABLE_NEWSLETTER_DELIVERY_WORKER=false npm run dev
```

- The port comes from `PORT` in `.env.local` (5050 here). Port 5000 is taken
  by macOS ControlCenter, and Playwright and the smoke test both default to
  5000, so always pass both base URLs.
- Ready when `curl -s http://localhost:5050/health` returns `"status":"ok"`.
- `REDIS_URL` must be empty locally. With a value and no Redis running,
  `POST /api/login` hangs forever.

Smoke **(verified 2026-11-17)**:

```bash
PW_BASE_URL=http://localhost:5050 PW_API_BASE_URL=http://localhost:5050 npm run test:smoke
```

Baseline on 2026-11-17, before any change: 4 passed, 3 failed, 1 skipped.
The three failures are the content tests (homepage links, article page,
category page). The local database held one published article that day and
the same three tests pass against production, so missing data is the likely
cause, but it was not confirmed. Compare your run with this baseline: a
fourth failure, or a content test failing against production, is yours.

There is no local path with real content for public SPA pages in `client/`.
web-next (section 3) is a separate codebase and does not cover them. Say so
in the report when a change touches those pages.

For the changed behaviour itself:

- **API**: `curl -i` the endpoint on localhost. For a cached read, check
  `Cache-Control` and call it twice. For a write, check the row afterwards.
- **Screen**: capture it at both sizes, then open the images and look at them
  (empty areas, clipping, RTL direction, real values):

```bash
npx playwright screenshot --viewport-size=390,844 --wait-for-timeout=8000 http://localhost:5050/<path> <scratchpad>/<name>-mobile.png
```

```bash
npx playwright screenshot --viewport-size=1440,900 --wait-for-timeout=8000 http://localhost:5050/<path> <scratchpad>/<name>-desktop.png
```

- **Signed-in screens**: use a Playwright script or the Browser pane with a
  local test account. The authenticated smoke spec reads `E2E_USER` and
  `E2E_PASS` from the environment; never write their values into a file.
  **(not verified)**
- A focused spec under `e2e/` for the flow is better evidence than a
  screenshot. Add one when the flow matters and run it with
  `npx playwright test e2e/<file>` plus the two base URLs.

Stop only the server you started, by its port, never by process name (other
projects run on this machine):

```bash
lsof -tiTCP:5050 -sTCP:LISTEN | xargs kill
```

## 3. web-next (home, article, category pages)

```bash
cd web-next && npm run dev
```

Serves on port 3001 **(verified 2026-11-17)**. With `API_ORIGIN` unset it
reads from `https://api.sabq.org`, so pages render with live production data
through read-only GETs. Set `API_ORIGIN=http://localhost:5050` to test
against a local API change instead **(not verified)**.

Take the same two screenshots against `http://localhost:3001/<path>`.

Side effect: `next dev` generates `web-next/AGENTS.md` and
`web-next/CLAUDE.md`. Delete both after the run and confirm with
`git status --short web-next`; never commit them.

## 4. iOS

Projects and schemes: `sabq app ios/sabq.xcodeproj` → `sabq`;
`sabq desk ios/SabqDesk.xcodeproj` → `SabqDesk`;
`sports app ios/SabqSports.xcodeproj` → `SabqSports`.

```bash
xcrun simctl list devices booted
```

```bash
cd "sabq app ios" && xcodebuild -project sabq.xcodeproj -scheme sabq -configuration Debug -destination 'platform=iOS Simulator,id=<booted UDID>' build
```

Then launch the built `.app` from
`~/Library/Developer/Xcode/DerivedData/sabq-*/Build/Products/Debug-iphonesimulator/sabq.app`
with the iOS Simulator tool (`launch`), wait a few seconds past the splash,
take a `screenshot`, and drive the changed screen with `tap`/`swipe`.
**(verified 2026-11-17 for `sabq` on the booted iPhone Duo; `SabqDesk` and
`SabqSports` not verified.)**

The app talks to the production API. Read freely; do not submit forms,
comments or articles from it.

## 5. Android

```bash
cd android-native && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk" ./gradlew :app:assembleDebug
```

**(not verified — no system Java on this machine; the JBR path exists.)**
Install on an emulator and screenshot the changed screen.

## 6. After a deploy (only when the owner merged)

- `https://api.sabq.org/api/version` matches the merge SHA.
- `https://api.sabq.org/health` is healthy.
- The affected user path works on sabq.org. Read-only smoke is safe:

```bash
PW_BASE_URL=https://sabq.org PW_API_BASE_URL=https://api.sabq.org npm run test:smoke
```

**(verified 2026-11-17: 7 passed, 1 skipped)**

`npx playwright screenshot` against `https://sabq.org` returned Cloudflare's
bot-verification page on the same day. Do not try to get past it; use the
smoke run, or ask the owner for a screenshot from their browser.

## 7. When a check keeps failing

- Do not rerun a flaky test until it passes, add sleeps, or skip it. Find the
  cause, or delete the test and record why.
- After two different failed fixes for the same failure, stop and re-diagnose;
  ask the owner only if progress needs a decision from them.
- Do not edit a test or a rule in `REVIEW.md` to make your own change pass.

## 8. Report

End with:

- **Ran**: each command or interaction, and its result.
- **Evidence**: screenshot paths (mobile and desktop), response excerpts,
  test names.
- **Not run**: every surface the diff touches that you did not exercise, and
  why.

Never write that a check passed unless it ran and passed in this session.
