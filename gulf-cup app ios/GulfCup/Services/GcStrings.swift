import Foundation

// نصوص عربية ثابتة لتطبيق خليجي 27 — بدون i18n متعدد اللغات في النسخة الأولى.
nonisolated enum GcStrings {
    static let strings: [String: String] = [
        "tab.home": "الرئيسية",
        "tab.matches": "المباريات",
        "tab.predictions": "التوقعات",
        "tab.groups": "المجموعات",
        "tab.more": "المزيد",
        "app.title": "خليجي 27",
        "app.host": "السعودية · جدة 2026",
        "state.live": "مباشر",
        "state.pre": "قبل الانطلاق",
        "state.original": "مسابقة أصلية",
        "brand.sabq": "سبق",
        "matches.subtitle": "الجدول الكامل بتوقيت الرياض",
        "groups.subtitle": "ترتيب المنتخبات ونقاطها",
        "more.subtitle": "الملاعب والمنتخبات والأدوار الإقصائية",
        "standings.section.title": "ترتيب المجموعات",
        "standings.section.subtitle": "يتأهل الأول والثاني من كل مجموعة",
        "standings.legend.qualified": "متأهل",
        "standings.legend.third": "المركز الثالث",
        "standings.legend.host": "المستضيف",
        "standings.col.played": "لعب",
        "standings.col.diff": "فارق",
        "standings.col.points": "نقاط",
        "standings.group.fallback": "مجموعة",
        "standings.qualifyLine": "حدّ التأهل",
        "groups.empty.title": "ستُعلن المجموعات",
        "groups.empty.subtitle": "عقب انطلاق البطولة ستُحدَّث الجداول تلقائيًّا",
        "loading.standings": "يتم تحديث الترتيب",
        "loading.matches": "يتم تحديث جدول المباريات",
        "loading.predictions": "يتم تحميل مباريات التوقعات",
        "loading.teams": "يتم تحديث المنتخبات",
        "loading.host": "يتم تجهيز بيانات الاستضافة",
        "loading.hub": "يتم تجهيز مركز البطولة",
        "loading.bracket": "يتم تحميل الأدوار الإقصائية",
        "predictions.subtitle": "مسابقة توقّعات خليجي 27 — بركة مشتركة",
        "predictions.leaderboard": "المتصدرون",
        "predictions.long": "البطل والهدّاف",
        "predictions.hero.title": "توقّع النتيجة وشارك في البركة",
        "predictions.hero.subtitle": "1000 نقطة لكل مباراة + جائزة متراكمة — تُقسَّم 50/30/20 على طبقات الدقّة.",
        "predictions.stat.points": "نقطة",
        "predictions.stat.correct": "صحيحة",
        "predictions.stat.exact": "دقيقة",
        "predictions.stat.streak": "سلسلة",
        "predictions.jackpot": "الجائزة المتراكمة",
        "predictions.pool": "البركة",
        "predictions.empty.title": "لا توجد مباريات مفتوحة الآن",
        "predictions.empty.subtitle": "ستظهر مباريات التوقعات عند اقتراب الجولة",
        "predictions.draw": "تعادل",
        "predictions.meta.participant": "مشارك",
        "predictions.meta.pool": "البركة",
        "predictions.meta.prediction": "توقّع",
        "predictions.locked": "مغلق",
        "predictions.locked.note": "انتهى وقت التوقّع",
        "predictions.login.note": "الحفظ يتطلب تسجيل الدخول — قريبًا",
        "predictions.unavailable": "مسابقة التوقعات غير مفعّلة حاليًا",
        "leaderboard.empty.title": "لم يبدأ الترتيب بعد",
        "leaderboard.empty.subtitle": "سيظهر المتصدرون بعد أول جولة توقعات",
        "teams.title": "المنتخبات",
        "teams.subtitle": "ثمانية منتخبات خليجية",
        "teams.section.title": "منتخبات البطولة",
        "teams.empty.title": "ستظهر المنتخبات",
        "teams.empty.subtitle": "فور تحميل بيانات البطولة",
        "teams.host.badge": "مضيف",
        "more.explore.title": "استكشف",
        "more.explore.subtitle": "أقسام إضافية من البطولة",
        "bracket.title": "الأدوار الإقصائية",
        "bracket.subtitle": "نصف النهائي والنهائي",
        "bracket.empty.title": "لم تُحدَّد المواجهات بعد",
        "bracket.empty.subtitle": "ستظهر بعد انتهاء دور المجموعات",
        "hero.badge.special": "كأس الخليج العربي",
        "hero.subtitle": "البطولة تُقام في جدة — 23 سبتمبر → 6 أكتوبر 2026",
        "hero.liveNow": "انطلقت البطولة — التغطية جارية",
        "hero.fullCoverage": "تابع كل مباريات خليجي 27",
        "hero.hostedBy": "تستضيفها السعودية",
        "metric.team": "منتخب",
        "metric.groups": "مجموعات",
        "metric.venues": "ملاعب",
        "dashboard.title": "مركز البطولة",
        "dashboard.subtitle": "انتقل سريعًا لأهم الأقسام",
        "dashboard.value.new": "جديد",
        "banner.predictions.title": "مسابقة التوقعات",
        "banner.predictions.subtitle": "شارك في البركة — النتيجة الدقيقة 50% من الجائزة",
        "home.next.title": "أقرب المباريات",
        "home.next.empty.title": "لا مباريات قادمة",
        "home.next.empty.subtitle": "ستُحدَّث عند اقتراب الجولة",
        "home.next.viewAll": "عرض الجدول الكامل",
        "home.venues.title": "ملاعب جدة",
        "home.venues.subtitle": "King Abdullah Sports City · Prince Abdullah al-Faisal",
        "home.venues.all": "عرض كل الملاعب",
        "matchesHero.matches": "مباراة",
        "matchesHero.finished": "منتهية",
        "refresh.error.title": "تعذّر التحديث",
        "countdown.title": "العدّ التنازلي للانطلاق",
        "countdown.days": "يوم",
        "countdown.hours": "ساعة",
        "countdown.minutes": "دقيقة",
        "countdown.seconds": "ثانية",
        "countdown.next": "المباراة القادمة",
        "saudi.host": "المستضيف",
        "saudi.subtitle.in": "في {group}",
        "saudi.subtitle.fallback": "منتخب السعودية — أبطال خليجي 26",
        "saudi.matches": "مباريات الأخضر",
        "team.saudi": "السعودية",
        "schedule.title": "جدول المباريات",
        "schedule.empty.title": "لا مباريات",
        "schedule.empty.subtitle": "سيُحدَّث الجدول قريبًا",
        "schedule.round.all": "الكل",
        "venues.section.title": "ملاعب الاستضافة",
        "venues.empty.title": "ستُعلن الملاعب",
        "venues.empty.subtitle": "جدة — المملكة العربية السعودية",
    ]

    static func text(_ key: String, _ vars: [String: String] = [:]) -> String {
        var s = strings[key] ?? key
        for (k, v) in vars {
            s = s.replacingOccurrences(of: "{\(k)}", with: v)
        }
        return s
    }
}

func L(_ key: String, _ vars: [String: String] = [:]) -> String {
    GcStrings.text(key, vars)
}

func LTeam(_ id: String, fallback: String) -> String { fallback }

func LRound(_ roundEn: String, fallback: String) -> String { fallback.isEmpty ? roundEn : fallback }

func LError(_ error: Error) -> String {
    if let api = error as? APIError { return api.errorDescription ?? "حدث خطأ" }
    return "تعذّر تحميل البيانات"
}
