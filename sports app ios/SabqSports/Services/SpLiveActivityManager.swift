import Foundation
import ActivityKit
import SwiftUI

// MARK: - مدير المتابعة اللحظية على شاشة القفل (Live Activity)
//
// يربط مباراة بعينها بنشاط حيّ يظهر على شاشة القفل والجزيرة الديناميكية.
// المستخدم «يحدّد المباراة» من زرّ في مركز المباراة → `start(for:)`.
//
// التحديث:
//   • محليًّا: عند تحديث لقطة المباراة (التطبيق نشط/خلفية قصيرة) عبر `update(with:)`.
//   • عن بُعد لاحقًا: نلتقط `pushToken` لكل نشاط ونرفعه للخادم كي يدفع APNs
//     تحديثات النتيجة حتى لو كان التطبيق مغلقًا (مرحلة تالية على الخادم).
//
// متاح من iOS 16.2+ (هدف التطبيق 17.0)، وبشرط تفعيل المستخدم لـLive Activities
// (إعدادات > VARA الرياضي > Live Activities) — `areActivitiesEnabled`.

@MainActor
@Observable
final class SpLiveActivityManager {
    static let shared = SpLiveActivityManager()
    private init() {}

    /// معرّفات المباريات التي لها نشاط حيّ قائم (لعكس حالة الزرّ في الواجهة).
    private(set) var activeFixtureIds: Set<Int> = []

    /// النشاطات القائمة مفهرسة بمعرّف المباراة.
    private var activities: [Int: Activity<SpMatchActivityAttributes>] = [:]

    /// آخر توكن دفع لكل مباراة (لإبلاغ الخادم بالإلغاء عند الإيقاف اليدوي).
    private var pushTokens: [Int: String] = [:]
    private var didAdoptExisting = false

    var isSupported: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func isActive(_ fixtureId: Int) -> Bool {
        adoptExistingIfNeeded()
        return activeFixtureIds.contains(fixtureId)
    }

    /// يبدّل المتابعة اللحظية لمباراة (يبدأ إن لم تكن قائمة، وإلا يُنهيها).
    func toggle(for fixture: SpFixture) {
        adoptExistingIfNeeded()
        if isActive(fixture.id) { end(fixtureId: fixture.id) }
        else { start(for: fixture) }
    }

    // MARK: بدء النشاط
    func start(for fixture: SpFixture) {
        // مباريات «عالمية» (id سالب): مركزها ومركز /lite يعملان الآن، لكن نؤجّل
        // Live Activity على شاشة القفل ريثما يُختبر مسار التحديث على جهاز فعلي.
        guard fixture.id > 0 else { return }
        adoptExistingIfNeeded()
        guard isSupported, activities[fixture.id] == nil else { return }
        // أظهر الحالة فورًا (تفاؤليًّا) ريثما تكتمل عملية البدء غير المتزامنة.
        activeFixtureIds.insert(fixture.id)
        Task { await startAsync(for: fixture) }
    }

    private func startAsync(for fixture: SpFixture) async {
        guard activities[fixture.id] == nil else { return }
        // نزّل شعارَي الفريقين للحاوية المشتركة (أفضل-جهد، بمهلة قصيرة).
        async let homeFile = SpSharedContainer.cacheLogo(from: fixture.home.logo)
        async let awayFile = SpSharedContainer.cacheLogo(from: fixture.away.logo)
        let (hFile, aFile) = await (homeFile, awayFile)

        let attrs = SpMatchActivityAttributes(
            fixtureId: fixture.id,
            homeName: fixture.home.name,
            awayName: fixture.away.name,
            homeLogo: fixture.home.logo,
            awayLogo: fixture.away.logo,
            homeLogoFile: hFile,
            awayLogoFile: aFile,
            competition: activityCompetitionName(for: fixture),
            kickoff: fixture.kickoff
        )
        let state = makeState(from: fixture)
        do {
            let activity = try Activity.request(
                attributes: attrs,
                content: .init(state: state, staleDate: staleDate(for: fixture)),
                pushType: .token   // نطلب توكن دفع لتمكين تحديثات APNs لاحقًا
            )
            activities[fixture.id] = activity
            activeFixtureIds.insert(fixture.id)
            observePushToken(activity)
        } catch {
            // فشل الطلب (الإذن مغلق/تجاوز الحدّ) — تراجَع عن الإظهار التفاؤلي.
            activeFixtureIds.remove(fixture.id)
        }
    }

    // MARK: تحديث الحالة الحيّة
    func update(with fixture: SpFixture, lastEvent: String? = nil) {
        guard let activity = activities[fixture.id] else { return }
        var state = makeState(from: fixture)
        // حافظ على آخر حدث معروض إن لم يحمل المستدعي أحدث — التحديث المحلي من
        // «مبارياتي» بلا أحداث، ومسحه كان يُخفي شريحة الهدف/البطاقة المدفوعة.
        state.lastEvent = lastEvent ?? activity.content.state.lastEvent
        // مرساة الخادم (matchClock) هي السلطة: مثبّتة عنده وتطابق دفعات APNs
        // حرفيًّا فلا قفز عند تعاقب التحديث المحلي والدفع البعيد — نعتمدها كما هي.
        // التسامح المحلي (75ث) يبقى فقط للمرساة المحسوبة محليًّا (خادم لم يحقنها):
        // لا نُزحزح مرساةً جاريةً لفرقٍ طفيف (اختلاف لحظة انقلاب الدقيقة بين
        // المصادر كان يجعل العدّاد يسبق ثم يرتدّ).
        if fixture.status.clockStartEpoch == nil,
           let current = activity.content.state.clockStartEpoch,
           let candidate = state.clockStartEpoch,
           abs(current - candidate) < 75 {
            state.clockStartEpoch = current
        }
        Task {
            await activity.update(.init(state: state, staleDate: staleDate(for: fixture)))
            // أنهِ النشاط تلقائيًّا بعد نهاية المباراة بفترة قصيرة.
            if fixture.status.finished {
                try? await Task.sleep(nanoseconds: 200_000_000)
                end(fixtureId: fixture.id, final: state)
            }
        }
    }

    // MARK: إنهاء النشاط
    func end(fixtureId: Int, final: SpMatchActivityAttributes.ContentState? = nil) {
        guard let activity = activities[fixtureId] else {
            activeFixtureIds.remove(fixtureId)
            return
        }
        let content: ActivityContent<SpMatchActivityAttributes.ContentState>? =
            final.map { .init(state: $0, staleDate: nil) }
        Task {
            await activity.end(content, dismissalPolicy: .after(.now + 4 * 3600))
        }
        // أبلِغ الخادم بإلغاء التوكن كي يتوقّف الدفع.
        if let token = pushTokens[fixtureId] {
            Task { try? await APIClient.shared.endLiveActivity(pushToken: token) }
        }
        activities[fixtureId] = nil
        pushTokens[fixtureId] = nil
        activeFixtureIds.remove(fixtureId)
    }

    func endAll() {
        for id in Array(activities.keys) { end(fixtureId: id) }
    }

    // MARK: مساعدات

    func adoptExistingIfNeeded() {
        guard !didAdoptExisting else { return }
        didAdoptExisting = true
        adoptExisting()
    }

    /// يلتقط النشاطات الباقية من جلسة سابقة بعد إعادة تشغيل التطبيق.
    private func adoptExisting() {
        for activity in Activity<SpMatchActivityAttributes>.activities {
            let id = activity.attributes.fixtureId
            activities[id] = activity
            activeFixtureIds.insert(id)
            observePushToken(activity)
        }
    }

    private func makeState(from f: SpFixture) -> SpMatchActivityAttributes.ContentState {
        var minute = ""
        if f.status.live, let m = f.status.elapsed, m > 0 {
            let extra = (f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : ""
            minute = "\(m)\(extra)'"
        }
        return .init(
            homeScore: f.goals.home ?? 0,
            awayScore: f.goals.away ?? 0,
            homePenaltyScore: f.penaltyScore?.home,
            awayPenaltyScore: f.penaltyScore?.away,
            minute: minute,
            statusLabel: f.status.finished ? L("انتهت") : f.status.label,
            isLive: f.status.live,
            isFinished: f.status.finished,
            lastEvent: nil,
            // مرساة الخادم أولًا (نفس قيمة دفعات APNs والموجز) — الحساب المحلي
            // احتياط فقط للمسارات التي لا تحقنها بعد (كأس العالم).
            clockStartEpoch: f.status.clockStartEpoch ?? Self.clockStartEpoch(for: f.status)
        )
    }

    private func activityCompetitionName(for fixture: SpFixture) -> String {
        if let name = fixture.competition?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            return name
        }
        switch fixture.competitionSlug {
        case "pro-league": return L("دوري روشن")
        case "kings-cup": return L("كأس الملك")
        case "super-cup": return L("كأس السوبر السعودي")
        case "division-1": return L("دوري يلو")
        case "division-2": return L("دوري الدرجة الثانية")
        case "womens-league": return L("الدوري السعودي للسيدات")
        case "world-cup": return L("كأس العالم")
        case "premier-league": return L("الدوري الإنجليزي")
        case "laliga": return L("الدوري الإسباني")
        case "serie-a": return L("الدوري الإيطالي")
        case "bundesliga": return L("الدوري الألماني")
        case "ligue-1": return L("الدوري الفرنسي")
        default: return L("مباراة مباشرة")
        }
    }

    /// مرساة الساعة الذاتية: تُحسب فقط حين تكون الساعة **جاريةً فعليًّا** (لا استراحة).
    /// «الدقيقة m» عند المزوّد = اللعب جارٍ داخلها (ساعة البث تعرض m-1:xx)، فالإرساء
    /// الصحيح = الآن − (m-1)×60 كي يطابق العدّاد ساعة البث لا يسبقها بدقيقة.
    /// تُعاد nil وقت التوقّف ليُجمَّد العرض على الدقيقة المدفوعة.
    static func clockStartEpoch(for s: SpStatus) -> Double? {
        guard s.live, !s.finished, let m = s.elapsed, m > 0, isClockRunning(code: s.code) else { return nil }
        let playedMinutes = m + (s.extra ?? 0)
        guard playedMinutes >= 1 else { return nil }
        return Date().timeIntervalSince1970 - Double(playedMinutes - 1) * 60.0
    }

    /// أكواد توقّف الساعة (استراحة/فاصل الإضافي/ركلات الترجيح/إيقاف) — تُجمّد العدّاد.
    private static func isClockRunning(code: String) -> Bool {
        let paused: Set<String> = ["HT", "BT", "P", "PEN", "BREAK", "INT", "SUSP", "HALF_TIME"]
        return !paused.contains(code.uppercased())
    }

    /// تاريخ تقادم الحالة: أثناء اللعب نافذة واسعة (30 دقيقة) — العدّاد ذاتيّ من
    /// المرساة ودفعات الخادم تأتي عند التغيّر فقط، فشوط هادئ بلا أهداف ليس تقادمًا
    /// (نافذة 3 دقائق القديمة افترضت دفعات كل دقيقة). وحتى الانطلاق+دقيقتين
    /// للمباراة القادمة كي لا يُعتَّم العدّاد التنازلي قبل البدء.
    private func staleDate(for f: SpFixture) -> Date? {
        if f.status.live { return Date().addingTimeInterval(30 * 60) }
        if !f.started, f.kickoff > Date() { return f.kickoff.addingTimeInterval(120) }
        return nil
    }

    /// يراقب توكن الدفع الخاص بالنشاط ويرفعه للخادم (لتحديثات APNs المستقبلية).
    private func observePushToken(_ activity: Activity<SpMatchActivityAttributes>) {
        let fixtureId = activity.attributes.fixtureId
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                pushTokens[fixtureId] = token
                // يعمل للزوّار أيضًا (الخادم يلتقط userId إن وُجدت جلسة فقط).
                try? await APIClient.shared.registerLiveActivity(fixtureId: fixtureId, pushToken: token)
            }
        }
    }
}
