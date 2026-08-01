# ترخيص وحالة خلاصات رادار سبق

> آخر تحديث: 2026-08-01 · يُراجع عند إضافة حزمة بذر

| الجهة | RSS عام؟ | الحزمة | بديل X | ملاحظات |
|---|---|---|---|---|
| AP | لا | — | `@AP` | رصد عبر X فقط |
| Reuters | مدفوع/مغلق | — | `@Reuters` | رصد عبر X فقط |
| AFP | لا | — | `@AFP` | رصد عبر X فقط |
| NYT | نعم (محدود) | `us-nationals` | `@nytimes` | Home/World/MiddleEast |
| Washington Post | لا مستقر | — | `@washingtonpost` | RSS العام متعطّل |
| WSJ | اشتراك | — | `@WSJ` | |
| USA Today | نعم | `us-nationals` | `@USATODAY` | |
| LA Times | نعم | `us-nationals` | `@latimes` | |
| CNN / NBC / ABC / CBS / Fox / NPR | نعم | `us-broadcast` | حسابات رسمية | |
| Politico / Axios / The Hill | نعم | `us-broadcast` | حسابات رسمية | The Hill قد يقيّد المعدل |
| CNBC / Bloomberg / TechCrunch / Wired | نعم | `us-business` | `@business` لبلومبرغ | |
| BBC / Guardian / Sky / Al Jazeera / DW / France24 | نعم | `global-background` | `@BBCBreaking` إلخ | |
| واس / عكاظ / CNN عربية / سكاي عربية | نعم | `saudi-gulf` | `@spagov` وغيره | وزن أعلى |
| STAT News | نعم | `capsulah` | — | أولوية يومية #1 لكابسولة |
| FDA Newsroom (Press Releases) | نعم | `capsulah` | `@US_FDA` | أولوية #2 — بيان رسمي |
| WHO Newsroom | نعم | `capsulah` | `@WHO` | أولوية #3 — `news-english.xml` |
| EurekAlert | لا (WAF) | `capsulah` | `@EurekAlert` | ممر Google News `site:eurekalert.org` |
| MedPage Today | نعم | `capsulah` | — | أولوية #5 — `rss/Headlines.xml` |

**قاعدة:** إن فُقد RSS لمصدر Tier A، لا تُحذف الجهة — أبقِ رصدة X الموازية نشطة.

**كبسولة (`capsulah`):** حزمة صحة/علوم مُعفاة من `RADAR_TOPIC_FILTER` — البذر: `npx tsx scripts/seed-radar-pack.ts capsulah`.
