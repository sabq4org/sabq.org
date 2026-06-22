# تنبيهات أحداث المباريات (Match Event Alerts)

> إشعارات دفعية لأحداث مباريات المونديال (وغيره) حسب نوع الحدث: **بداية · أهداف · بطاقات · فار (VAR) · نهاية**، موجَّهة لمتابعي الفريق فقط، مع تحكُّم المستخدم في الأنواع التي تصله.
>
> الحالة: **مبنيّة ومتحقَّقة (تبني خضراء)، غير مدموجة بعد، خلف علم بيئة.** تاريخ: 2026-06-22.

---

## 1) الطلب والقرار

**الطلب (المالك):** في تطبيق iOS، أن يفعّل المستخدم إشعارات لمباراة معيّنة ويختار نوع الحدث (هدف/كرت/فار) لمتابعتها وفق أحداثها.

**القرار المعتمد:** نموذج **متابعة فريق** (لا متابعة مباراة مفردة) **+ تفضيلات أنواع أحداث عامّة لكل المستخدم**. أي: يتابع المستخدم منتخبًا، ويختار مرّة واحدة أنواع الأحداث التي يريدها، فتُطبَّق على كل مباريات الفِرق التي يتابعها (المونديال وغيره). هذا يُعيد استخدام بنية المتابعة القائمة بأقل سطح جديد.

**لماذا أعيد الاستخدام بدل البناء من الصفر:** يوجد محرك تنبيهات رياضية شغّال أصلاً (`sportsAlertsService`) يغطّي المونديال (دوري `id 1` ضمن «مباريات اليوم»)، وجدول متابعة (`sports_follows`)، وبنية دفع (APNs/FCM + صندوق داخل التطبيق + بثّ لحظي). الفجوة كانت: (أ) لا كشف للبطاقات/الفار، (ب) لا اختيار لنوع الحدث.

---

## 2) تجربة المستخدم (iOS)

نقطتا دخول، كلاهما يفتح نفس شاشة التفضيلات:

1. **صفحة المنتخب** (تُفتح بالضغط على شعار منتخب في المونديال) → زر **«تابع التنبيهات» 🔔**. بعد المتابعة يظهر زر **«نوع التنبيهات» ⚙️**.
2. **الإعدادات** → صفّ **«تنبيهات المباريات»** (يظهر للمسجّلين فقط).

شاشة التفضيلات فيها 5 مفاتيح: **بداية المباراة · الأهداف · البطاقات · حالات الفار (VAR) · نهاية المباراة**. الحفظ فوري عند كل تبديل. غير المسجّل يُوجَّه لتسجيل الدخول عند محاولة المتابعة.

---

## 3) آلية العمل (شاملة)

```
جوب كل 20ث (القائد فقط، خلف SPORTS_ALERTS_ENABLED)
  sportsAlertsJob.ts → runSportsAlertsCycle()
    │
    ├─ getGlobalTodayFixtures() [كاش 60ث]  ┐ دمج (المباشر يَجُبّ)
    ├─ getGlobalLiveFixtures()  [كاش 15ث]  ┘
    │
    ├─ detectAlerts(matches)            ← دلتا النتيجة/الحالة: انطلاق/هدف/نهاية (كل المباريات)
    │
    ├─ detectEventAlerts(matches)       ← البطاقات/الفار (المباريات المباشرة فقط):
    │     لكل مباراة مباشرة:
    │       followers = getTeamFollowerUserIds([home,away])
    │       if followers == 0 → تخطٍّ (لا نداء API إطلاقًا)
    │       events = getMatchEventsOnly(id)  [كاش 12ث — نداء fixtures/events فقط]
    │       أول رصد للمباراة = خطّ أساس (تسجيل التواقيع بلا إرسال)
    │       لكل حدث جديد من نوع yellow-card / red-card / var → تنبيه
    │
    └─ لكل تنبيه → dispatchAlert(alert):
          followers = getTeamFollowerUserIds(teamRefIds)
          userIds   = filterUsersByEventPref(followers, نوع الحدث)   ← ترشيح حسب التفضيل
          لكل مستخدم:
            • notifications_inbox  (سجلّ داخل التطبيق)
            • notificationBus.emit (بثّ لحظي/SSE)
            • APNs (iOS) + FCM (Android) لأجهزته النشطة
```

**نقاط مفتاحية:**
- **حماية المعدّل (rate-limit):** أحداث المباراة تُجلب عبر نداء واحد (`fixtures/events`) بكاش 12ث، و**فقط** للمباريات المباشرة التي لها متابعون. مباراة لا يتابعها أحد = صفر نداءات API.
- **منع الإغراق:** أول رصد لأحداث مباراة يؤسّس «خط أساس» بلا إرسال — فلا يصل متابعٌ جديد فيضٌ من بطاقات وقعت قبل اشتراكه. توقيع الحدث = `type|minute|extra|teamId|player`.
- **القائد فقط:** الجوب يفحص `isLeader()` داخل كل دورة (نمط آمن أثناء النشر).

---

## 4) نموذج البيانات

### جدول جديد: `sports_alert_prefs` ([shared/schema.ts](../shared/schema.ts))
تفضيلات أنواع التنبيهات، صفّ واحد لكل مستخدم.

| العمود | النوع | الافتراضي | المعنى |
|---|---|---|---|
| `user_id` | varchar (PK, FK→users) | — | المستخدم |
| `kickoff` | boolean | `true` | انطلاق المباراة |
| `goals` | boolean | `true` | الأهداف (يشمل ركلات الجزاء) |
| `cards` | boolean | `true` | البطاقات (صفراء + حمراء) |
| `var_review` | boolean | `true` | حالات الفار |
| `fulltime` | boolean | `true` | نهاية المباراة |
| `updated_at` | timestamp | now() | آخر تحديث |

> **توافق رجعي مهم:** غياب صفّ المستخدم = «كل الأنواع مفعّلة». هكذا يستمر المتابعون السابقون (قبل وجود الجدول) في تلقّي إشعارات الهدف/الانطلاق/النهاية كما كان، ولا يُكتَم أحد إلا إن أطفأ نوعًا صراحةً.

### جدول قائم (دون تغيير): `sports_follows`
متابعة المستخدم: `(user_id, kind, ref_id)` فريدة. `kind ∈ {team, competition}`. عمود `notify` (تفعيل/كتم المتابعة كلها). ميزتنا تستخدم `kind="team"` و`ref_id`=معرّف الفريق في API-Football.

---

## 5) واجهات API

### iOS — تحت `/api/v1`، بجلسة العضو (Bearer / `verifyMemberSession`) — في [mobileApiRoutes.ts](../server/routes/mobileApiRoutes.ts)

| الطريقة | المسار | الجسم/المعطيات | الإرجاع |
|---|---|---|---|
| GET | `/sports/follows` | — | `{ success, follows: [...] }` |
| POST | `/sports/follows` | `{ kind, refId, refName, refLogo? }` | `{ success, follow }` |
| DELETE | `/sports/follows` | `{ kind, refId }` (في الجسم) | `{ success }` |
| GET | `/sports/alert-prefs` | — | `{ success, preferences }` |
| PUT | `/sports/alert-prefs` | `{ kickoff?, goals?, cards?, varReview?, fulltime? }` | `{ success, preferences }` |

> **لماذا نسخة `/api/v1`؟** نسخة الويب `/api/sports/follows` تتطلّب جلسة Passport (`requireAuth`)، وiOS يستخدم نظام Bearer (`appMemberSessions`) لا جلسات Passport — فأي مسار موبايل مُصادَق يجب أن يكون تحت `/api/v1` ويستعمل `verifyMemberSession` وإلا أرجع 401.
> **فخّ DELETE:** نُمرّر `(kind, refId)` في **الجسم** لا في المسار، لأن `buildURL` في iOS يرمّز `?` إلى `%3F` (404).

### الويب (دون تغيير): `/api/sports/follows` (GET/POST/PATCH/DELETE) بـ `requireAuth` — في [server/routes/sports.ts](../server/routes/sports.ts).

---

## 6) الملفات (مضاف/معدّل)

### الخادم
| الملف | التغيير |
|---|---|
| [shared/schema.ts](../shared/schema.ts) | **+** جدول `sports_alert_prefs` + نوعاه. |
| [server/services/saudiLeagueService.ts](../server/services/saudiLeagueService.ts) | **+** `getMatchEventsOnly(fixtureId)` — أحداث المباراة فقط (نداء `fixtures/events`، SWR 12ث). |
| [server/services/sportsAlertPrefsService.ts](../server/services/sportsAlertPrefsService.ts) | **ملف جديد** — `getPrefs` / `upsertPrefs` / `filterUsersByEventPref`. |
| [server/services/sportsAlertsService.ts](../server/services/sportsAlertsService.ts) | توسعة: نوع الحدث `card`/`var`، خريطة `ALERT_KIND_TO_PREF`، `detectEventAlerts`، ترشيح المستلمين في `dispatchAlert`، دمج التنبيهات في `runSportsAlertsCycle`. |
| [server/routes/mobileApiRoutes.ts](../server/routes/mobileApiRoutes.ts) | **+** 5 نقاط `/api/v1/sports/*` (متابعات + تفضيلات). |

### iOS (`sabq app ios/sabq/`)
| الملف | التغيير |
|---|---|
| `Services/APIModels.swift` | **+** `SportsAlertPreferences`, `SportsFollow`. |
| `Services/APIClient.swift` | **+** `fetchSportsFollows` / `addSportsFollow` / `removeSportsFollow` / `fetchSportsAlertPreferences` / `updateSportsAlertPreferences`. |
| `Screens/WCMatchEventNotificationsView.swift` | **ملف جديد** — شاشة 5 مفاتيح (نمط `NotificationPreferencesView`: تحميل عند الظهور + حفظ عند كل تبديل). |
| `Screens/WorldCupExtras.swift` | **+** `followBar` + `refreshFollowState` + `toggleFollow` في `WCTeamSheet`، وأوراق (login/alertPrefs). |
| `Screens/SettingsView.swift` | **+** `matchAlertsSection` (صفّ «تنبيهات المباريات»، للمسجّلين). |

---

## 7) كشف الأحداث (تفصيل)

أحداث المباراة تأتي معرّبة عبر `localizeEvent` ([worldCupNames.ts](../server/services/worldCupNames.ts)) ويعاد استخدامها في `saudiLeagueService.localizeEventRow`. التصنيفات:

| `type` بعد التعريب | المصدر الخام (API-Football) | يُرسَل كـ | مفتاح التفضيل |
|---|---|---|---|
| `goal` | goal | (النتيجة — `detectAlerts`) | `goals` |
| `yellow-card` | card / "Yellow Card" | `card` 🟨 | `cards` |
| `red-card` | card / "Red Card" | `card` 🟥 | `cards` |
| `var` | var (Goal cancelled / Penalty confirmed / offside) | `var` 🎦 | `varReview` |
| (انطلاق/نهاية) | حالة المباراة | `kickoff` / `fulltime` | `kickoff` / `fulltime` |

ملاحظة: الأهداف تُكتشف من **دلتا النتيجة** في `detectAlerts` (أسرع وأبسط)، بينما البطاقات/الفار من **مصفوفة الأحداث** في `detectEventAlerts`. التبديلات (`substitution`) لا تُرسَل (ليست ضمن أنواع المستخدم المطلوبة).

---

## 8) التشغيل والنشر

**خطوتان إلزاميتان قبل أن تعمل الميزة:**

1. **إنشاء الجدول:** `npm run db:push` (على البيئة الهدف). التعديل إضافي وآمن. *لم يُشغَّل في التطوير احترازًا لأمان الإنتاج — لا تشغّله على `DATABASE_URL` الإنتاج إلا بوعي.*
2. **تفعيل الجوب:** `SPORTS_ALERTS_ENABLED=true` على Railway. الجوب مطفأ افتراضيًّا، يعمل كل 20ث على القائد فقط.

**اعتماديات قائمة (موجودة على الإنتاج):** APNs (`APNS_KEY_ID/TEAM_ID/KEY_P8/...`) للـiOS، وFCM (`FCM_SERVER_KEY`) للأندرويد، و`APIFOOTBALL_KEY` لبيانات المباريات. النقاط الخمس (`/sports/follows` و`/sports/alert-prefs`) تعمل بمجرّد وجود الجدول (مستقلّة عن علم الجوب) — لكن لا تصل إشعارات فعليّة قبل تفعيل الجوب.

---

## 9) قرارات التصميم والفخوخ

- **عامّة لا لكل مباراة:** التفضيلات على مستوى المستخدم (لا لكل فريق ولا لكل مباراة) — أبسط سطح، ويطابق قرار المالك.
- **الافتراضي «الكل مفعّل»:** يحفظ سلوك المتابعين السابقين ولا يكسر إشعارات الأهداف الحالية.
- **بوّابة المتابعين قبل نداء API:** `detectEventAlerts` لا يستهلك نداء أحداث لمباراة بلا متابعين — حاسم أثناء المونديال (مباريات متزامنة كثيرة).
- **خطّ الأساس عند أول رصد:** يمنع فيض الأحداث القديمة على المشترك الجديد.
- **iOS Bearer لا Passport:** المسارات تحت `/api/v1` بـ `verifyMemberSession` (راجع `docs` الموبايل).
- **DELETE بالجسم لا بالمسار:** تفاديًا لترميز `?` في `buildURL`.
- **البناء على الفرع:** بُنيت العمل خطأً على فرع `feat/thesports-realtime-score`؛ تُنقل لفرعها الخاص قبل الدمج.

---

## 10) التحقّق

- **الخادم:** `npm run check` (tsc) — **خرج 0** (يلزم `NODE_OPTIONS=--max-old-space-size=8192` بسبب حجم المشروع).
- **iOS:** `xcodebuild build -scheme sabq -sdk iphonesimulator` — **BUILD SUCCEEDED**، صفر أخطاء.

---

## 11) توسعات مستقبلية (مؤجَّلة)

- زر متابعة مباشر داخل **مركز المباراة** (`WorldCupMatchCenter`) لكلا الفريقين.
- متابعة **مباراة مفردة** (kind="match") لمن يريد حدثًا واحدًا دون متابعة الفريق كله.
- نوع حدث **التبديلات** كخيار اختياري.
- ربط الـ deeplink `sabq://match/:id` بفتح مركز المباراة في iOS (حاليًّا الإشعار يحمل الرابط لكن المعالجة في iOS تغطّي المقال/الرأي فقط).
