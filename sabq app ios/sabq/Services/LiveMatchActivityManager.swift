import ActivityKit
import Foundation
import SwiftUI

// MARK: - مدير النشاط المباشر للمباراة (Live Activity)
//
// يعيش في عملية التطبيق الرئيسية وحده مسؤول عن دورة حياة النشاط:
// البدء (Activity.request) عند ضغط المستخدم زر «تابع مباشرة»، ثم
// التحديث اللحظي عبر سحب دوري (polling) من /api/world-cup/match/:id،
// والإنهاء عند انتهاء المباراة أو طلب المستخدم. امتداد الويدجت يرسم فقط.
//
// قيد معروف (مقصود في هذه النسخة): التحديث يتوقف حين يُعلّق النظام عملية
// التطبيق بعد فترة في الخلفية؛ يُستأنف فور عودة التطبيق للمقدمة. للتحديث
// أثناء القفل التام يلزم دفع APNs لاحقًا.

@Observable
@MainActor
final class LiveMatchActivityManager {
    static let shared = LiveMatchActivityManager()
    private init() {}

    /// معرّف المباراة التي يعرضها نشاط جارٍ حاليًا — للتحقق من زر الواجهة
    private(set) var activeFixtureId: Int?

    private var activity: Activity<LiveMatchAttributes>?
    private var pollTask: Task<Void, Never>?

    private let pollInterval: UInt64 = 12_000_000_000 // 12 ثانية

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

        let f = detail.fixture
        let attributes = LiveMatchAttributes(
            fixtureId: f.id,
            homeName: f.home.name,
            awayName: f.away.name,
            round: "\(f.round) · \(f.venue.city)"
        )
        let state = Self.makeState(from: detail)

        do {
            let act = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: Self.staleDate(state)),
                pushType: nil
            )
            activity = act
            activeFixtureId = f.id
            startPolling(fixtureId: f.id)
            return true
        } catch {
            print("[LiveActivity] request failed:", error.localizedDescription)
            return false
        }
    }

    /// ينهي النشاط الجاري ويوقف السحب الدوري.
    func stop() {
        pollTask?.cancel()
        pollTask = nil
        let act = activity
        activity = nil
        activeFixtureId = nil
        Task {
            await act?.end(nil, dismissalPolicy: .immediate)
        }
    }

    // MARK: - السحب الدوري

    private func startPolling(fixtureId: Int) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: self?.pollInterval ?? 12_000_000_000)
                if Task.isCancelled { return }
                guard let detail = try? await APIClient.shared.fetchWorldCupMatch(
                    fixtureId: fixtureId, ignoreCache: true
                ) else { continue }
                await self?.apply(detail)
            }
        }
    }

    private func apply(_ detail: WCMatchDetail) async {
        guard let act = activity else { return }
        let state = Self.makeState(from: detail)
        await act.update(.init(state: state, staleDate: Self.staleDate(state)))

        // عند انتهاء المباراة: نثبّت النتيجة على شاشة القفل لساعتين ثم
        // نوقف السحب الدوري (النشاط يبقى معروضًا حتى يزيله المستخدم/النظام).
        if state.isFinished {
            pollTask?.cancel()
            pollTask = nil
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
            lastEvent: lastEventText(detail)
        )
    }

    private static func minuteText(_ status: WCStatus) -> String {
        guard let elapsed = status.elapsed, elapsed > 0 else { return "" }
        if let extra = status.extra, extra > 0 { return "\(elapsed)+\(extra)'" }
        return "\(elapsed)'"
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

    private static func staleDate(_ state: LiveMatchAttributes.ContentState) -> Date {
        // إن توقف السحب (خلفية) يعتبر النظام الحالة قديمة بعد 3 دقائق
        Date().addingTimeInterval(180)
    }
}
