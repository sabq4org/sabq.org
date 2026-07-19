# مصفوفة تطابق iOS ↔ Android — سبق

**آخر تحديث:** 2026-07-13 · **المرجع البصري:** تطبيق iOS SwiftUI (مصدر الحقيقة) · **الهدف:** نسخة أندرويد طبق الأصل شكلاً وقياساً.

## الطبقة 1: التوكنات والمكوّنات المشتركة — ✅ مكتملة (تدقيق 2026-07-13)

تدقيق آلي رباعي (ألوان/خطوط/مقاسات/مكوّنات) قارن كل قيمة بين `SabqComponents.swift` وملفات `ui/theme/` + `ui/components/`، وأصلح كل الانحرافات:

| المجال | ما وُجد | ما أُصلح |
|---|---|---|
| الألوان (30 توكناً) | 9 منحرفة + 2 مخترعة | خلفية/سطح/حدود/ظلال/تعبئات → قيم iOS الحرفية؛ `trendingAccent` → برتقالي النظام |
| الخطوط (22 نمطاً) | **20 منحرفاً** | نقل سياسة تليين الأوزان من `FontRegistration.swift` كما هي (Bold>13→SemiBold، ≤13→Regular، Medium→Regular)؛ تصفير tracking كلياً؛ استعادة 30/19/22sp؛ سطر الجسم = طبيعي+8 |
| المقاسات (16 توكناً) | 3 "خُفّضت عمداً" | `sectionGap` 20، `cardPadding` 20، `tabBarSafeArea` 120 (إلغاء التخفيضات) |
| المكوّنات (7 أزواج، ~116 خاصية) | 26 منحرفة | Chips/Buttons/SurfaceCard/AIImageBadge/CommentRow/CommentComposer → أرقام iOS |

**ملاحظات مفتوحة من التدقيق:**
- ظلال iOS المزدوجة (radius 16/y6 + radius 1/y1) تُقارَب في Compose بـ elevation — تحتاج **معايرة بصرية على جهاز** (لقطات جنباً إلى جنب).
- نموذج ارتفاع السطر: iOS إضافي فوق الطبيعي؛ Android ‏×1.35 (متقارب عملياً) — يُحسم بلقطات المقارنة.
- خط Plex Arabic في أندرويد Downloadable (وميض fallback بأول تشغيل) بينما iOS يضمّنه — قرار مؤجل: تضمين TTF (+900KB).

## الطبقة 2: الشاشات (49) — تُملأ بالمقارنة البصرية شاشةً شاشة

الحالة: ⬜ لم تُراجع · 🟡 قريبة (فروق طفيفة) · ✅ مطابقة · 🔴 فجوة بنيوية

| # | الشاشة | المجال | مرجع iOS | الحالة | ملاحظات |
|---|---|---|---|---|---|
| 1 | HomeFeedScreen | home | HomeFeedView.swift | ⬜ | الأثقل — تبدأ بها المراجعة |
| 2 | ArticleDetailScreen | article | ArticleDetailView | ⬜ | يشمل شريط الإجراءات والملخص |
| 3 | SearchScreen | search | SearchView | ⬜ | |
| 4 | SectionsScreen | sections | SectionsView | ⬜ | |
| 5 | CategoryArticlesScreen | category | CategoryView | ⬜ | |
| 6 | ExploreScreen | explore | ExploreView | ⬜ | |
| 7 | TrendingScreen | trending | TrendingView | ⬜ | statValue 22sp أُصلح |
| 8 | BookmarksScreen | bookmarks | BookmarksView | ⬜ | statValue 22sp أُصلح |
| 9 | OpinionsListScreen | opinions | OpinionsView | ⬜ | mostViewedCardTitle أُصلح |
| 10 | DailyBriefScreen | brief | DailyBriefView | ⬜ | |
| 11 | InterestsPickerScreen | brief | InterestsPicker | ⬜ | |
| 12 | AudioNewslettersScreen | audio | AudioNewslettersView | ⬜ | |
| 13 | LiveCoverageScreen | livecoverage | LiveCoverageView | ⬜ | |
| 14 | MomentByMomentScreen | live | MomentByMomentView | ⬜ | |
| 15 | KeywordArticlesScreen | keyword | KeywordView | ⬜ | |
| 16 | AuthorArticlesScreen | author | AuthorArticlesView | ⬜ | StatBox معاد بناؤه |
| 17 | CalendarScreen | calendar | CalendarView | ⬜ | |
| 18 | LoginScreen | auth | LoginView | ⬜ | |
| 19 | SmartSignUpScreen | auth | SmartSignUpView | ⬜ | |
| 20 | CompleteNameScreen | auth | CompleteNameView | ⬜ | |
| 21 | OnboardingScreen | onboarding | OnboardingView | ⬜ | |
| 22 | SettingsScreen | settings | SettingsView | ⬜ | |
| 23 | EditProfileScreen | settings | EditProfileView | ⬜ | |
| 24 | ChangePasswordScreen | settings | ChangePasswordView | ⬜ | |
| 25 | ForgotPasswordScreen | settings | ForgotPasswordView | ⬜ | |
| 26 | DeleteAccountScreen | settings | DeleteAccountView | ⬜ | |
| 27 | ContactScreen | settings | ContactView | ⬜ | |
| 28 | LegalPagesScreen | settings | LegalPagesView | ⬜ | |
| 29 | NewsletterScreen | settings | NewsletterView | ⬜ | |
| 30 | ArticleSubmissionScreen | settings | ArticleSubmissionView | ⬜ | |
| 31 | ContributorDashboardScreen | settings | ContributorDashboard | ⬜ | |
| 32 | NotificationPreferencesScreen | notifications | NotificationPrefs | ⬜ | |
| 33 | EditorialNotificationsScreen | notifications | EditorialNotifications | ⬜ | |
| 34 | EditorialNotificationDetailScreen | notifications | — | ⬜ | |
| 35 | LoyaltyAccountScreen | loyalty | LoyaltyAccountView | ⬜ | |
| 36 | LoyaltyRewardsScreen | loyalty | LoyaltyRewardsView | ⬜ | |
| 37 | LoyaltyHistoryScreen | loyalty | LoyaltyHistoryView | ⬜ | |
| 38 | MuqtarabLandingScreen | muqtarab | MuqtarabLanding | ⬜ | |
| 39 | MuqtarabAngleScreen | muqtarab | MuqtarabAngle | ⬜ | |
| 40 | MuqtarabTopicScreen | muqtarab | MuqtarabTopic | ⬜ | |
| 41 | MuqtarabWriterScreen | muqtarab | MuqtarabWriter | ⬜ | |
| 42 | WorldCupScreen | worldcup | WorldCupView | ⬜ | |
| 43 | WorldCupPredictionsScreen | worldcup | WCPredictions | ⬜ | |
| 44 | WorldCupTeamScreen | worldcup | WCTeamView | ⬜ | |
| 45 | GulfCupScreen | gulfcup | GulfCupView | ⬜ | |
| 46 | GcPredictionsHubScreen | gulfcup | GcPredictionsHub | ⬜ | |
| 47 | GcMajlisHubScreen | gulfcup | GcMajlisHub | ⬜ | |
| 48 | GcMajlisDetailScreen | gulfcup | GcMajlisDetail | ⬜ | |
| 49 | AsianCupScreen | asiancup | AsianCupView | ⬜ | |

## منهجية مراجعة الشاشة الواحدة

1. لقطتان جنباً إلى جنب (iOS Simulator + Android Emulator، نفس المحتوى، نفس عرض النقاط).
2. فحص: الخط (حجم/وزن)، الألوان، الهوامش، ارتفاعات البطاقات، المسافات بين الأقسام، RTL.
3. أي انحراف قيمي → يُصلح في التوكن إن كان عاماً، أو في الشاشة إن كان خاصاً.
4. تُحدَّث الحالة هنا مع رابط الـ commit.

> ترتيب المراجعة المقترح: 1→9 (القلب الإخباري) ثم الحساب فالبقية.
