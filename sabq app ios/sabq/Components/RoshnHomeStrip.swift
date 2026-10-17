import SwiftUI

// MARK: - مخزن نظرة دوري روشن المشترك
//
// مخزن حيّ على مستوى التطبيق يحتفظ بآخر hero جُلب — تبقى البطاقة ظاهرة عند
// العودة من التنقّل (نفس نهج مخزن كأس الملك). التحديث انتهازي: لحظي عند
// اللعب، نبضة أبطأ حول الصافرة، وإلا عند الحاجة فقط.

@Observable
@MainActor
final class RoshnHomeStore {
    static let shared = RoshnHomeStore()
    private init() {}

    private(set) var hero: RsHero?
    private var lastFetch: Date?
    private var fetching = false

    func loadIfNeeded() async {
        if fetching { return }
        if hero != nil, let last = lastFetch, Date().timeIntervalSince(last) < 30 { return }
        fetching = true
        defer { fetching = false }
        if let result = try? await APIClient.shared.fetchRoshnHero() {
            hero = result
            lastFetch = Date()
        } else if hero == nil {
            // فشل الجلب الأول كان يخفي البانر حتى إعادة تشغيل التطبيق —
            // إعادة واحدة بعد ثانيتين (نمط لوحات الموسم الموثّق).
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if Task.isCancelled { return }
            if let result = try? await APIClient.shared.fetchRoshnHero(ignoreCache: true) {
                hero = result
                lastFetch = Date()
            }
        }
    }

    func refreshLive() async {
        if fetching { return }
        fetching = true
        defer { fetching = false }
        if let result = try? await APIClient.shared.fetchRoshnHero(ignoreCache: true) {
            hero = result
            lastFetch = Date()
        }
    }

    var anyLive: Bool {
        guard let h = hero else { return false }
        if h.live.contains(where: { $0.status.live }) { return true }
        if h.matchday?.liveCount ?? 0 > 0 { return true }
        return h.nextMatch?.status.live ?? false
    }

    /// أقرب انطلاقة قادمة — من يوم الجولة أو المباراة القادمة أو انطلاقة الموسم.
    var nextKickoffTimestamp: Int? {
        guard let h = hero else { return nil }
        if let ts = h.matchday?.nextKickoffTs { return ts }
        if let f = h.nextMatch, !f.status.live, !f.status.finished { return f.timestamp }
        if h.preSeason { return h.outlook.firstKickoffTs }
        return nil
    }
}

// MARK: - شريط دوري روشن في الواجهة الرئيسية
//
// بطاقة بهوية «أخضر الملعب» (2026-08-02): زمردي صلب بنص أبيض — نفس لون ترويسة
// المركز (RoshnTheme.accentFill، آمن التباين منذ 2026-10-17) — بثلاثة عناصر فقط: شعار الدوري، سطرا الهوية، وشارة حالة واحدة
// (عدّاد/نتيجة حية/بطل). قرار المالك بعد البطاقة البيضاء المزدحمة.
// أربع حالات: عدّاد انطلاق الموسم / يوم الجولة / المباراة القادمة أو الحية /
// بطاقة البطل. تختفي كليًا عند إطفاء البلوك من لوحة التحكم (blockHidden).

struct RoshnHomeStrip: View {
    private let store = RoshnHomeStore.shared

    private var matchdayMode: Bool {
        guard let h = store.hero, h.inSeason, let md = h.matchday else { return false }
        return md.count >= 3
    }

    private var offSeasonChampion: RsChampion? {
        guard let h = store.hero, h.outlook.phase == "off-season" else { return nil }
        return h.outlook.champion ?? h.lastSeason?.champion
    }

    /// مباراة البطاقة: الحية أولًا ثم القادمة ثم افتتاحية الموسم.
    private var cardFixture: RsFixture? {
        guard let h = store.hero else { return nil }
        return h.live.first ?? h.nextMatch ?? h.outlook.openers.first
    }

    private var hidden: Bool {
        guard let h = store.hero else { return true }
        if h.blockHidden { return true }
        return offSeasonChampion == nil && cardFixture == nil && !matchdayMode
    }

    var body: some View {
        // حامل Color.clear يمنع SwiftUI من إلغاء .task قبل وصول البيانات.
        ZStack {
            HomeStripAnchor()
            if let h = store.hero, !hidden {
                NavigationLink(value: RoshnRoute()) {
                    if let champion = offSeasonChampion {
                        championCard(champion)
                    } else if h.preSeason, !h.inSeason, let opener = cardFixture, !opener.started {
                        preSeasonCard(h, opener: opener)
                    } else if matchdayMode, let md = h.matchday {
                        matchdayCard(md)
                    } else if let f = cardFixture {
                        matchCard(f)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .task {
            await store.loadIfNeeded()
            while !Task.isCancelled {
                let interval: UInt64
                var lightRefresh = false
                if store.anyLive {
                    interval = 15_000_000_000
                } else if let ts = store.nextKickoffTimestamp {
                    let untilKickoff = TimeInterval(ts) - Date().timeIntervalSince1970
                    if untilKickoff <= -900 {
                        return
                    } else if untilKickoff <= 600 {
                        interval = 20_000_000_000
                    } else {
                        interval = 60_000_000_000
                        lightRefresh = true
                    }
                } else {
                    return
                }
                try? await Task.sleep(nanoseconds: interval)
                if Task.isCancelled { return }
                if lightRefresh { await store.loadIfNeeded() } else { await store.refreshLive() }
            }
        }
    }

    // MARK: البطاقة الموحّدة — زمردي صلب بثلاثة عناصر فقط
    //
    // قرار المالك 2026-08-02: البانر السابق كان مزدحمًا (شعارا فريقين + عدّاد
    // + عمود هوية) وباهت اللون. الشكل الجديد: هوية الدوري يمينًا، شارة حالة
    // واحدة يسارًا، وسهم — على زمردي الهوية الصلب نفسه (لون هيرو المركز).

    private func preSeasonCard(_ h: RsHero, opener: RsFixture) -> some View {
        banner(subtitle: "الموسم الجديد \(RsFormat.isolatedLatin(RsFormat.seasonLabel(h.outlook.nextSeason ?? h.outlook.season)))") {
            if let ts = h.outlook.firstKickoffTs ?? (opener.timestamp > 0 ? opener.timestamp : nil) {
                countdownChip(prefix: "ينطلق بعد", timestamp: ts)
            }
        }
    }

    private func matchCard(_ f: RsFixture) -> some View {
        banner(subtitle: f.status.live
            ? "\(f.home.name) × \(f.away.name)"
            : "\(f.home.name) × \(f.away.name) · \(RsFormat.time(f))"
        ) {
            if f.status.live {
                liveScoreChip(f)
            } else {
                countdownChip(prefix: "تنطلق بعد", timestamp: f.timestamp)
            }
        }
    }

    private func matchdayCard(_ md: RsMatchday) -> some View {
        banner(subtitle: "\(md.round ?? "جولة الدوري") · \(md.count) \(md.count == 2 ? "مباراتان" : "مباريات")") {
            if md.liveCount > 0 {
                chip(background: RoshnTheme.liveFill) {
                    HStack(spacing: SabqLayout.space4) {
                        Circle().fill(.white).frame(width: 5, height: 5)
                        Text(md.liveCount == 1 ? "مباشر" : "\(md.liveCount) مباشر")
                    }
                }
            } else if let ts = md.nextKickoffTs {
                countdownChip(prefix: "تنطلق بعد", timestamp: ts)
            }
        }
    }

    private func championCard(_ c: RsChampion) -> some View {
        banner(subtitle: "اكتمل الموسم") {
            chip(background: RoshnTheme.gold, ink: RoshnTheme.navy) {
                HStack(spacing: SabqLayout.space4) {
                    Text("🏆")
                    Text(c.name).lineLimit(1)
                }
            }
        }
    }

    // MARK: البطاقة الموحّدة — بطاقة هادئة متناسقة مع الصحيفة
    //
    // تحديث 2026-10-17: استبدال الشريط الأخضر الصلب الكامل ببطاقة هادئة تتبع
    // سطح الصحيفة (SabqTheme.surfaceMuted) مع شريط جانبي زمردي وشعار الدوري،
    // لمنع التنافر اللوني في الرئيسية (قرار تصور سبق الهادئ).

    private func banner(subtitle: String, @ViewBuilder trailing: () -> some View) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Image("RoshnLeagueLogo")
                .resizable()
                .scaledToFit()
                .padding(SabqLayout.space4)
                .frame(width: 40, height: 40)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .strokeBorder(SabqTheme.outline.opacity(0.6), lineWidth: 0.75)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("دوري روشن")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1).minimumScaleFactor(0.85)
            }

            Spacer(minLength: SabqLayout.space8)

            trailing()

            Image(systemName: "chevron.left")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, SabqLayout.space16).padding(.vertical, SabqLayout.space12)
        .frame(minHeight: 64)
        .sabqBlockSurface()
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(
                topLeadingRadius: SabqRadius.medium,
                bottomLeadingRadius: SabqRadius.medium,
                bottomTrailingRadius: 0,
                topTrailingRadius: 0,
                style: .continuous
            )
            .fill(RoshnTheme.accentFill)
            .frame(width: 4)
            .accessibilityHidden(true)
        }
        .contentShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    /// شارة حالة: تعبئة مسطّحة، أو شريحة هادئة بحدّ فوق البطاقة.
    private func chip(background: Color? = nil, ink: Color? = nil, @ViewBuilder content: () -> some View) -> some View {
        let resolvedInk = ink ?? (background != nil ? Color.white : SabqTheme.textPrimary)
        return content()
            .sabqText(SabqType.tag)
            .foregroundStyle(resolvedInk)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background {
                if let background {
                    Capsule().fill(background)
                } else {
                    Capsule().fill(SabqTheme.surface)
                        .overlay(Capsule().strokeBorder(SabqTheme.outline, lineWidth: 0.75))
                }
            }
    }

    private func countdownChip(prefix: String, timestamp: Int) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            chip {
                Text("\(prefix) \(WCFormat.countdown(to: timestamp))")
                    .monospacedDigit()
                    .lineLimit(1).fixedSize()
            }
        }
    }

    private func liveScoreChip(_ f: RsFixture) -> some View {
        chip(background: RoshnTheme.liveFill) {
            HStack(spacing: SabqLayout.space4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .sabqText(SabqType.metaEmphasis)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                if let elapsed = f.status.elapsed, elapsed > 0 {
                    Text("\(elapsed)\((f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : "")'")
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
    }
}
