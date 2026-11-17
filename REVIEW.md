# Review instructions — sabq

Read this before reviewing any change in this repository. It adds review-only
rules on top of `CLAUDE.md` and `AGENTS.md`; it does not repeat them.

## How to use the reliability checklist

1. Get the list of changed files and the diff. A reviewer without shell access
   must be handed both by the lead.
2. For each item below, test the **Trigger** against the diff. A small change
   may match one or two items, a broad one up to ten.
3. Run only the matching items. For each one, report pass or fail with
   `file:line` evidence. A matching item you could not check is reported as
   "not checked", never as a pass.
4. Then review the rest of the change normally.

## Severity

- **Important**: breaks behaviour, leaks data, takes the site down under load,
  demotes or blocks published content, or cannot be rolled back. Every failed
  checklist item is Important unless the item says otherwise.
- **Nit**: style, naming, refactors. At most five per review.
- **Pre-existing**: a defect the change did not introduce. Report it
  separately and do not hold the change for it.

A behaviour claim needs a `file:line` citation from the source. An inference
from a name is a hypothesis and must be labelled as one.

## Skip

- What CI already enforces: type errors, ESLint (including `max-lines` caps,
  ADR-001 `db` imports, raw `fetch`), gitleaks, the npm audit gate.
- Lockfiles, `dist/`, `docs/systems/inventory-snapshot.json`, build output.

## Reliability checklist

Each item: the trigger readable from a diff, the check, and the incident or
PR behind it. PR numbers refer to this repository.

### Database and schema

**D1. New table.**
Trigger: `pgTable(` added in `shared/schema.ts`, or `CREATE TABLE` in `migrations/`.
Check: the same change has a dated SQL file in `migrations/` that GRANTs the
needed privileges to `sabq_runtime` (guarded by a `pg_roles` existence check)
and ends with a `has_table_privilege` SELECT.
Why: `/api/mawaeed` returned 500 with SQLSTATE 42501 in production (#1758).

**D2. Index on an existing table.**
Trigger: `CREATE INDEX` in `migrations/` on a table not created in the same file.
Check: `CONCURRENTLY`, outside any transaction block.
Why: AGENTS.md fixed rule 4; a plain index locks a table with ~940k article rows.

**D3. Destructive or rewritten migration.**
Trigger: `DROP`, `TRUNCATE`, `RENAME`, `ALTER ... TYPE`, `DELETE`/`UPDATE`
without a specific `WHERE`, or an edit to an existing file in `migrations/`.
Check: fail the review and send it back to the owner. Additive changes only.
Why: AGENTS.md fixed rule 2 and Workflow C.

**D4. Field added to one language family only.**
Trigger: a column added to `articles`, `categories` or another table that has
`en_` and `ur_` siblings.
Check: the siblings get the field too, or the change states why not.

**D5. Search condition with OR.**
Trigger: `or(` or SQL `OR` combined with `ilike`/`ILIKE '%...%'` on `articles`.
Check: every branch is served by an index declared in `shared/schema.ts`
(`title` and `excerpt` have trigram indexes there; `subtitle` does not). A
leading-wildcard match on `slug`, `english_slug` or `id` is never indexed; use
equality.
Why: one unindexed branch turned exact-title search into a full scan and a
15s timeout while loose search looked fine (#1285).

**D6. Chained Drizzle `.where()`.**
Trigger: a query builder that calls `.where(` more than once, including
conditionally.
Check: conditions are combined with `and(...)`. A second `.where()` replaces
the first.
Why: a `?status` filter wiped the `articleType` filter on the opinion
dashboard (#1398).

**D7. Limit or offset from the request.**
Trigger: `.limit(` or `.offset(` fed by `req.query`, `req.params` or
`req.body`, or a new `parseInt(...)` used for paging.
Check: it goes through `readPagination` / `paginationOrReject` and
`boundedLimit` in `server/utils/pagination.ts`.
Why: `limit=-1` returned all 24k articles (40 MB) in one request (#1505, #1507).

**D8. List endpoint that selects whole rows.**
Trigger: a new or changed list route that selects full rows (especially
article `content`) or runs a count per row.
Check: a slim select and counts via `GROUP BY`; the response size is stated.
Why: `GET /api/stories` returned 8.2 MB with ~2,000 count queries per request
and slowed every route (#870).

### Caching and hot paths

**C1. Broad cache invalidation.**
Trigger: an invalidation call with a prefix or regex pattern (for example
`^article:`), or a change to `server/services/contentInvalidation.ts`.
Check: patterns are built from the affected id and slugs only.
Why: publishing a breaking story wiped every article's cache and exhausted
the DB pool (`pool=50/0idle/98wait`) (#1376).

**C2. Uncached anonymous read.**
Trigger: a new public GET, or a new DB query added to one, under `/api/v1/*`,
the home page, the article page or the breaking ticker.
Check: it sits behind `withCache`, `withSWR`, `freshWindowCache` or an edge
cache, with single-flight. Per-request queries (views, media, reactions) on
the article path count.
Why: the push-notification landing endpoint had no cache: 6 queries per tap
times 38k devices (#1376, #1744). Render also bills outbound bandwidth.

**C3. Local `CACHE_TTL`.**
Trigger: `const CACHE_TTL` or `let CACHE_TTL` declared in a file that also
imports it.
Check: fail. It shadows the imported object and silently breaks SWR.

**C4. In-process state or a new cron.**
Trigger: a new module-level `Map`, `Set`, array cache or counter in `server/`,
or a new `cron.schedule(` / file in `server/jobs/`.
Check: shared state lives in Redis or Postgres, or being per-replica is
harmless and said so. Cron jobs run through `server/leaderElection.ts`.

**C5. New in-flight promise map.**
Trigger: a map of pending promises (single-flight) outside
`server/memoryCache.ts`, or a change to `trackInflight` / `withSWR`.
Check: waiters have a deadline and stale entries are evicted (compare
`FETCH_WAIT_DEADLINE_MS` in `server/memoryCache.ts`, set by the `SWR_FETCH_DEADLINE_MS` env var). DB calls inside rely on the pool `query_timeout`.
Why: one hung fetch left a dead promise that every later request joined
forever (#1325).

**C6. Third-party call inside a request.**
Trigger: an `await` on an external provider (sports feeds, AI, email, SMS)
inside a public route handler.
Check: a timeout, a cap on queued waiters, and a circuit breaker; ideally the
route serves from cache or DB only.
Why: a provider outage held inbound sockets until every route returned 502,
three times in 30 hours (#1199, #1201).

**C7. Client created inside a retry or timer loop.**
Trigger: `connect(`, `new ...Client(` or `createClient(` reachable from
`setInterval`, a heartbeat, or a reconnect handler.
Check: the previous client is ended before a new one is created, with
exponential backoff and throttled error logging.
Why: the MQTT worker created a new client every 5s (~17k per day); sockets
grew from 200 to 2,000 and sessions failed, logging staff out of the dashboard.

**C8. Cache headers on noindex or error routes.**
Trigger: a change to the smart-cache middleware in `server/index.ts`,
`server/seoInjector.ts`, `server/utils/noindexPaths.ts`, or a new route under
dashboard, admin, search, profile, auth, payment, onboarding or
`/api/internal/`.
Check: those paths ship `Cache-Control: private, no-store`, and the dev guard
that throws on a leak is untouched.

**C9. Time value in a query key.**
Trigger: `new Date()` or `Date.now()` evaluated during render and used in a
TanStack `queryKey`.
Check: it is memoised on the filter only.
Why: a new key on every render caused an endless request loop (#1284).

### Auth, permissions and writes

**A1. New write route.**
Trigger: a new `POST`, `PUT`, `PATCH` or `DELETE` handler.
Check: authentication and a permission check. An ownership check is also
required unless the permission is desk-wide by design. `requireAuth` alone is
not enough. Article writes go through
`authorizeArticleWrite` in `server/services/articleAccessService.ts`.
Why: the write-endpoint audit confirmed 120 holes, 56 fixed in #1211; the edit
lock was `requireAuth` only (#1398).

**A2. User rows in a response.**
Trigger: a response that includes rows from `users` or joins them.
Check: credential columns are stripped through `server/utils/publicUser.ts`.
Why: credential columns were reaching public responses (#1211).

**A3. New permission check.**
Trigger: a new `permissions.includes(`, nav filter, or permission helper.
Check: it handles the `"*"` wildcard, does not expand it into
`PERMISSION_CODES`, and does not bypass `ROLE_PERMISSION_DENY_MAP` or the
superuser shortcut in `server/rbac.ts`.
Why: without the wildcard check admins see an empty sidebar; `articles.view`
was treated as view-any (#1398).

**A4. Field dropped silently.**
Trigger: a handler that deletes, ignores or strips a submitted field and
still returns 2xx. This includes a `z.object(` body schema without
`.strict()`: Zod drops unknown keys by default.
Check: a rejected field returns an explicit 4xx with a code.
Why: the profile screen said "saved" while the server dropped the phone
number, so phone login opened a different account (#1680).

**A5. Redirect from user input.**
Trigger: `res.redirect(` or a client navigation whose target comes from a
query string, body or header.
Check: it passes through `server/utils/safeRedirect.ts`.

**A6. Article status writes.**
Trigger: a client payload with a literal `status:` value for an article, or
a server path that sets an article's `status`, `scheduledAt` or `publishedAt`
(the `articles`, `en_articles` and `ur_articles` families only).
Check: no implicit `scheduled`/`published` → `draft`; a downgrade needs
`confirmStatusDowngrade: true` plus publish permission. `scheduled` counts as
publishing in `server/services/publishGate.ts`.
Why: "save as draft" sent `status: "draft"` for a scheduled article; the
publish cron then skipped it silently (#1398).

**A7. Publish gated on the sensitivity label.**
Trigger: a condition on `riskLabel` or a "sensitive" flag that blocks, delays
or reroutes publishing.
Check: fail. The label is informational only (#1839). This does not cover
other gates that exist on purpose: the opinion-writer review flow, banned
words, licence checks.

**A8. Draft autosave payload.**
Trigger: a change to `client/src/lib/articleAutosave.ts`,
`useArticleServerAutosave.ts`, or the `autosave: true` branch on the server.
Check: no key from `SERVER_AUTOSAVE_FORBIDDEN_KEYS` is sent, and the create
body carries `reporterId` (news) or `opinionAuthorId` (opinion).
Why: a blank byline and a licence check falling on the logged-in user (#1873).

### AI

**I1. Direct provider client.**
Trigger: `new OpenAI(`, `new Anthropic(` or `new GoogleGenerativeAI(` outside
`server/ai/gateway`.
Check: the call goes through `aiGateway`. ESLint only warns here, so the
review must catch it.

**I2. Structured outputs on Arabic text.**
Trigger: `output_config`, `json_schema`, or `CLAUDE_STRUCTURED_OUTPUTS` on a
path that returns edited article text.
Check: `assertEditedContentComplete` guards the result, and the comparison
script in `scripts/prompt-audit/` was run.
Why: an ASCII quote inside the content closed the JSON string early and
truncated the article with `stop_reason=end_turn` (#1358).

**I3. Transform of an AI-generated image.**
Trigger: `sharp(` applied to a generated image.
Check: IPTC provenance is re-applied afterwards via
`server/utils/aiImageProvenance.ts`. sharp strips metadata.

### Bulk sends

**B1. Loop over recipients.**
Trigger: `sendEmailNotification`, an SMS send or a push send called in a loop
or `Promise.all`.
Check: the return value (`{ success }`) is checked and recorded per recipient,
and the loop respects the provider rate limit (MailerSend: 120 per minute).
Why: a staff campaign reported 208 sent and 0 failed; 88 never arrived.

### Rendering parity

**P1. New editor block, tag or image attribute.**
Trigger: a new node, tag, `data-*` attribute or inline style produced by
`RichTextEditor` or its extensions.
Check: it survives `server/utils/sanitizeHtml.ts` (the SSR and crawler path),
and both native parsers handle it: `sabq app ios/sabq/Services/ArticleHtmlParser.swift`
and `android-native/app/src/main/kotlin/com/sabq/smart/util/HtmlSimpleParser.kt`.
Why: tables rendered as scattered paragraphs in both apps (#1488); image
width was lost on two separate paths.

**P2. Sports score or ratio bar.**
Trigger: a component that renders a score pair or a home/away bar.
Check: the host team is on the right; the pair sits inside `dir="ltr"` with
the away value first; a bar under RTL labels is not forced to LTR. No user
text uses the word «بركة».
Why: four reversed bars and four reversed scores in one audit (#1254, #1256).

**P3. Screen that shows a phone number field.**
Trigger: a raw phone input in an account or profile screen.
Check: it uses `client/src/components/account/PhoneVerificationCard.tsx`.

### iOS and Android

**M1. `@FocusState` in a sheet.**
Trigger: `@FocusState` on an input inside a sheet in `sabq app ios/`.
Check: fail. UIKit owns focus there; dismiss with `sabqDismissKeyboard()`.
Why: the keyboard closed after every keystroke (#987).

**M2. New Swift file in the sports app.**
Trigger: a new `.swift` file under `sports app ios/`.
Check: `project.pbxproj` references it. That project uses explicit file
references; `sabq app ios/` uses synchronized folders and needs nothing.

**M3. API newer than iOS 17.**
Trigger: a newly used API that needs iOS above 17.0.
Check: `#available`, plus a compile-time guard when the symbol may be missing
from the CI SDK. Note that such code is off in CI-built binaries (#1874).

**M4. Build intended for TestFlight.**
Trigger: a version or release change in `sabq app ios/`.
Check: `CURRENT_PROJECT_VERSION` is raised on every target, app and widgets,
above the last uploaded build.

### Edge and deploy

**E1. Proxy or middleware change.**
Trigger: a change to `functions/_middleware.js` or `cloudflare-worker/`.
Check: `X-Sabq-Client-IP` is still set from the inbound request, and no image
transform is applied to `/public-objects/` or `/api/`.
Why: every visitor collapsed into one rate-limit bucket: site-wide 429 on
login and comments.

**E2. robots.txt.**
Trigger: a change to `server/utils/robotsTxt.ts`.
Check: no crawler gets its own Allow group (a named group ignores `*` and
loses `Disallow: /api/`).

**E3. Dependency moved or bumped outside root CI.**
Trigger: a package moved to `devDependencies`, or any change under
`meetings-agent/`.
Check: evidence of a production install and boot for the first; evidence of
`npx tsc --noEmit` inside `meetings-agent/` for the second. Root CI proves
neither.

## Maintaining this file

- Add an item only after a real miss (an incident, a revert, a human review
  comment) whose trigger can be read from a diff. Record the PR or incident.
- Remove an item when CI starts enforcing it or the code it guards is gone.
- A change must not edit this file in the same PR as the code it judges.
