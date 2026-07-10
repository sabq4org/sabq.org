import ActivityKit
import Foundation
import SwiftUI

// MARK: - مدير النشاط المباشر للمباراة (Live Activity)
//
// يعيش في عملية التطبيق الرئيسية وحده مسؤول عن دورة حياة النشاط:
// البدء (Activity.request) عند ضغط المستخدم زر «تابع مباشرة»، ثم
// التحديث اللحظي عبر سحب دوري (polling) من /api/world-cup/match/:id أثناء
// المقدمة (~5ث)، والإنهاء عند انتهاء المباراة أو طلب المستخدم. امتداد الويدجت يرسم فقط.
//
// التحديث أثناء القفل التام: يبدأ النشاط بـ pushType .token فيُصدر ActivityKit
// توكن APNs نرسله للخادم (registerLiveActivityToken)، فيدفع الخادم تحديثات شاشة
// القفل (النتيجة/الشوط) عبر APNs دون فتح التطبيق. السحب المحلي يبقى كمسار سريع
// أثناء وجود التطبيق في المقدمة فقط.

@Observable
@MainActor
final class LiveMatchActivityManager {
    static let shared = LiveMatchActivityManager()
    private init() {}

    /// معرّف المباراة التي يعرضها نشاط جارٍ حاليًا — للتحقق من زر الواجهة
    private(set) var activeFixtureId: Int?

    private var activity: Activity<LiveMatchAttributes>?
    private var pollTask: Task<Void, Never>?
    /// مهمة مراقبة توكن الدفع الصادر عن ActivityKit
    private var pushTokenTask: Task<Void, Never>?
    /// آخر توكن دفع (hex) سُجّل لدى الخادم — لإلغائه عند الإنهاء
    private var lastPushTokenHex: String?

    /// آخر طور معروف للمباراة — يضبط وتيرة السحب (أسرع أثناء اللعب)
    private var livePhase = false
    /// موعد انطلاق المباراة الجاري متابعتها — لتسريع السحب قرب البدء
    private var kickoff: Date?

    /// هل ميزة النشاطات المباشرة متاحة ومسموح بها على هذا الجهاز.
    /// عند false يكون المستخدم رفض الإذن من إعدادات النظام.
    var areActivitiesEnabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func isRunning(for fixtureId: Int) -> Bool {
        activeFixtureId == fixtureId && activity != nil
    }

    /// يبدأ نشاطًا مباشرًا لمباراة. يرجع false إذا كانت الميزة معطّلة من
    /// إعدادات النظام (يعرض المستخدم وقتها تنبيهًا لتفعيلها).
    @discardableResult
    func start(for detail: WCMatchDetail) -> Bool {
        guard areActivitiesEnabled else { return false }
        // نشاط واحد فقط في كل مرة — نُنهي السابق قبل بدء جديد
        if activity != nil { stop() }
        // ننهي أي أنشطة يتيمة بقيت من جلسات سابقة (التطبيق أُغلق دون إنهائها)
        // كي لا تظهر بطاقتان لنفس المباراة. توكناتها تُبطَل لدى الخادم تلقائيًا
        // (APNs يردّ Unregistered بعد الإنهاء).
        for orphan in Activity<LiveMatchAttributes>.activities {
            Task { await orphan.end(nil, dismissalPolicy: .immediate) }
        }

        let f = detail.fixture
        let kickoffDate = Date(timeIntervalSince1970: Double(f.timestamp))
        let attributes = LiveMatchAttributes(
            fixtureId: f.id,
            homeName: f.home.name,
            awayName: f.away.name,
            round: "\(f.round) · \(f.venue.city)",
            kickoff: kickoffDate
        )
        let state = Self.makeState(from: detail)

        do {
            let act = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: Self.staleDate(for: detail)),
                pushType: .token
            )
            activity = act
            activeFixtureId = f.id
            livePhase = f.status.live
            kickoff = kickoffDate
            observePushToken(act, fixtureId: f.id)
            startPolling(fixtureId: f.id)
            return true
        } catch {
            print("[LiveActivity] request failed:", error.localizedDescription)
            return false
        }
    }

    /// يراقب توكن الدفع الصادر عن النظام لهذا النشاط ويُسجّله لدى الخادم.
    /// يتغيّر التوكن أحيانًا فنُعيد التسجيل عند كل تحديث.
    private func observePushToken(_ act: Activity<LiveMatchAttributes>, fixtureId: Int) {
        pushTokenTask?.cancel()
        pushTokenTask = Task { [weak self] in
            for await tokenData in act.pushTokenUpdates {
                if Task.isCancelled { return }
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                self?.lastPushTokenHex = hex
                // إعادة محاولة بتراجع: فشل شبكي واحد لحظة البدء كان يعني ألا
                // يصل أي تحديث لشاشة القفل عند قفل الجهاز (السحب المحلي يعمل
                // بالمقدمة فقط) ولا فرصة ثانية إلا إذا دوّر النظام التوكن.
                var delay: UInt64 = 2_000_000_000
                for attempt in 0..<3 {
                    do {
                        try await APIClient.shared.registerLiveActivityToken(fixtureId: fixtureId, token: hex)
                        break
                    } catch {
                        if attempt == 2 || Task.isCancelled { break }
                        try? await Task.sleep(nanoseconds: delay)
                        delay *= 4
                    }
                }
            }
        }
    }

    /// يُبلغ الخادم بإيقاف الدفع لتوكن النشاط المنتهي (أفضل-جهد).
    private func deregisterPushToken() {
        guard let token = lastPushTokenHex else { return }
        lastPushTokenHex = nil
        Task { try? await APIClient.shared.endLiveActivityToken(token: token) }
    }

    /// ينهي النشاط الجاري ويوقف السحب الدوري.
    func stop() {
        pollTask?.cancel()
        pollTask = nil
        pushTokenTask?.cancel()
        pushTokenTask = nil
        deregisterPushToken()
        let act = activity
        activity = nil
        activeFixtureId = nil
        livePhase = false
        kickoff = nil
        Task {
            await act?.end(nil, dismissalPolicy: .immediate)
        }
    }

    // MARK: - السحب الدوري

    private func startPolling(fixtureId: Int) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let interval = self?.nextPollInterval() else { return }
                try? await Task.sleep(nanoseconds: interval)
                if Task.isCancelled { return }
                guard let detail = try? await APIClient.shared.fetchWorldCupMatch(
                    fixtureId: fixtureId, ignoreCache: true
                ) else { continue }
                await self?.apply(detail)
            }
        }
    }

    /// أثناء اللعب: 5 ثوانٍ (كان 12 — مع MQTT/SSE على الخادم يكفي سحب أسرع
    /// أثناء المقدمة؛ شاشة القفل تعتمد APNs من liveActivityWorker ~2ث).
    /// حول الانطلاق (−3 دقائق حتى +30 دقيقة): 15 ثانية.
    /// قبل ذلك بكثير: 60 ثانية — العدّاد التنازلي ذاتي التحديث فلا حاجة لسحب أسرع.
    /// nil = أوقف السحب نهائيًا: مضت 30 دقيقة على الموعد بلا بث (تأجيل/إلغاء).
    private func nextPollInterval() -> UInt64? {
        if livePhase { return 5_000_000_000 }
        if let k = kickoff {
            let untilKickoff = k.timeIntervalSinceNow
            if untilKickoff > 180 { return 60_000_000_000 }
            if untilKickoff > -1800 { return 15_000_000_000 }
            return nil
        }
        return 60_000_000_000
    }

    private func apply(_ detail: WCMatchDetail) async {
        guard let act = activity else { return }
        livePhase = detail.fixture.status.live
        let state = Self.makeState(from: detail)
        await act.update(.init(state: state, staleDate: Self.staleDate(for: detail)))

        // عند انتهاء المباراة: نثبّت النتيجة على شاشة القفل لساعتين ثم
        // نوقف السحب الدوري (النشاط يبقى معروضًا حتى يزيله المستخدم/النظام).
        if state.isFinished {
            pollTask?.cancel()
            pollTask = nil
            pushTokenTask?.cancel()
            pushTokenTask = nil
            deregisterPushToken()
            let finalContent = ActivityContent(
                state: state,
                staleDate: Date().addingTimeInterval(2 * 3600)
            )
            await act.end(finalContent, dismissalPolicy: .after(Date().addingTimeInterval(2 * 3600)))
            activity = nil
            activeFixtureId = nil
        }
    }

    // MARK: - تحويل تفاصيل المباراة إلى حالة النشاط

    private static func makeState(from detail: WCMatchDetail) -> LiveMatchAttributes.ContentState {
        let f = detail.fixture
        return .init(
            homeScore: f.goals.home ?? 0,
            awayScore: f.goals.away ?? 0,
            minute: minuteText(f.status),
            statusLabel: f.status.label,
            isLive: f.status.live,
            isFinished: f.status.finished,
            lastEvent: lastEventText(detail),
            clockStartEpoch: clockStartEpoch(for: f.status)
        )
    }

    private static func minuteText(_ status: WCStatus) -> String {
        guard let elapsed = status.elapsed, elapsed > 0 else { return "" }
        if let extra = status.extra, extra > 0 { return "\(elapsed)+\(extra)'" }
        return "\(elapsed)'"
    }

    /// مرساة الساعة الذاتية: تُحسب فقط حين تكون الساعة جاريةً فعليًّا (لا استراحة).
    /// = الآن − (الدقائق المنقضية + بدل الضائع) بالثواني، فيبدأ الويدجت العدّ منها
    /// تلقائيًّا. nil وقت التوقّف ليُجمَّد العرض على الدقيقة المدفوعة.
    private static func clockStartEpoch(for s: WCStatus) -> Double? {
        guard s.live, !s.finished, let m = s.elapsed, m > 0, isClockRunning(code: s.code) else {
            return nil
        }
        let totalSeconds = Double(m + (s.extra ?? 0)) * 60.0
        return Date().timeIntervalSince1970 - totalSeconds
    }

    /// أكواد توقّف الساعة (استراحة/فاصل الإضافي/ركلات الترجيح/إيقاف) — تُجمّد العدّاد.
    private static func isClockRunning(code: String) -> Bool {
        let paused: Set<String> = ["HT", "BT", "P", "PEN", "BREAK", "INT", "SUSP", "HALF_TIME"]
        return !paused.contains(code.uppercased())
    }

    /// آخر حدث مهم (هدف/بطاقة/ركلة جزاء ضائعة) منسّقًا للعرض على سطر واحد.
    private static func lastEventText(_ detail: WCMatchDetail) -> String? {
        let ranked = detail.events.sorted {
            ($0.minute, $0.extraMinute ?? 0) > ($1.minute, $1.extraMinute ?? 0)
        }
        guard let ev = ranked.first(where: { ["goal", "yellow-card", "red-card", "missed-penalty"].contains($0.type) }) else {
            return nil
        }
        let icon: String
        switch ev.type {
        case "goal": icon = "⚽"
        case "yellow-card": icon = "🟨"
        case "red-card": icon = "🟥"
        case "missed-penalty": icon = "❌"
        default: icon = "•"
        }
        let minute = "\(ev.minute)\(ev.extraMinute.map { "+\($0)" } ?? "")'"
        let who = ev.player.isEmpty ? ev.label : ev.player
        return "\(icon) \(minute) \(who)"
    }

    private static func staleDate(for detail: WCMatchDetail) -> Date {
        let f = detail.fixture
        // قبل الانطلاق: نُبقي النشاط طازجًا حتى موعد البدء (+دقيقتين) كي لا
        // يُعتمّ العدّاد التنازلي. أثناء/بعد اللعب: 3 دقائق بعد آخر سحب.
        if !f.status.live && !f.status.finished {
            let kickoff = Date(timeIntervalSince1970: Double(f.timestamp))
            if kickoff > Date() { return kickoff.addingTimeInterval(120) }
        }
        return Date().addingTimeInterval(180)
    }
}
