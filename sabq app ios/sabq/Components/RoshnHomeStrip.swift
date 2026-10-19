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

    /// المباراة القادمة فعلًا. لا يُوثق بـ nextMatch وحده: الخادم كان يعيد مباراة
    /// مؤجلة (PST) مضى موعدها، فتُظهر البطاقة «تنطلق بعد 00:00:00» بعد انتهاء
    /// الجولة (2026-10-17) — والنسخ المثبّتة تبقى على الخادم القديم.
    var upcomingFixture: RsFixture? {
        guard let h = hero else { return nil }
        if let f = h.nextMatch, f.isUpcoming() { return f }
        return h.today.filter { $0.isUpcoming() }.min { $0.timestamp < $1.timestamp }
    }

    /// يوم الجولة صالح للعرض فقط إن كان فيه لعب جارٍ أو انطلاقة لم تفت مهلتها.
    var activeMatchday: RsMatchday? {
        guard let h = hero, h.inSeason, let md = h.matchday, md.count >= 3 else { return nil }
        if md.liveCount > 0 { return md }
        guard let ts = md.nextKickoffTs,
              TimeInterval(ts) > Date().timeIntervalSince1970 - 3 * 3_600 else { return nil }
        return md
    }

    /// نتائج اليوم بعد انتهاء مبارياته — حالة البطاقة حين لا لعب ولا موعد قادم.
    var todayResults: [RsFixture] {
        hero?.today.filter { $0.status.finished } ?? []
    }

    /// أقرب انطلاقة قادمة — من يوم الجولة أو المباراة القادمة أو انطلاقة الموسم.
    var nextKickoffTimestamp: Int? {
        guard let h = hero else { return nil }
        if let ts = activeMatchday?.nextKickoffTs { return ts }
        if let f = upcomingFixture { return f.timestamp }
        if h.preSeason { return h.outlook.firstKickoffTs }
        return nil
    }
}

// MARK: - شريط دوري روشن في الواجهة الرئيسية
//
// بطاقة بهوية «أخضر الملعب» (2026-08-02): زمردي صلب بنص أبيض — نفس لون ترويسة
// المركز (RoshnTheme.accentFill، آمن التباين منذ 2026-10-17) — بثلاثة عناصر فقط: شعار الدوري، سطرا الهوية، وشارة حالة واحدة
// (عدّاد/نتيجة حية/بطل). قرار المالك بعد البطاقة البيضاء المزدحمة.
// خمس حالات: عدّاد انطلاق الموسم / يوم الجولة / المباراة القادمة أو الحية /
// نتائج اليوم (أو مدخل المركز) حين لا لعب ولا موعد / بطاقة البطل. لا عدّاد
// صفري أبدًا. تختفي كليًا عند إطفاء البلوك من لوحة التحكم (blockHidden).

struct RoshnHomeStrip: View {
    @Environment(\.homeSideColumn) private var compactType
    @Environment(\.homeSpreadLayout) private var narrow
    private let store = RoshnHomeStore.shared

    private var offSeasonChampion: RsChampion? {
        guard let h = store.hero, h.outlook.phase == "off-season" else { return nil }
        return h.outlook.champion ?? h.lastSeason?.champion
    }

    /// مباراة البطاقة: الحية أولًا ثم القادمة فعلًا ثم افتتاحية الموسم.
    private var cardFixture: RsFixture? {
        guard let h = store.hero else { return nil }
        if let live = h.live.first(where: { $0.status.live }) ?? h.nextMatch.flatMap({ $0.status.live ? $0 : nil }) {
            return live
        }
        return store.upcomingFixture ?? h.outlook.openers.first(where: { !$0.started })
    }

    private var hidden: Bool {
        guard let h = store.hero else { return true }
        if h.blockHidden { return true }
        return offSeasonChampion == nil && cardFixture == nil && store.activeMatchday == nil && !h.inSeason
    }

    var body: some View {
        // حامل Color.clear يمنع SwiftUI من إلغاء .task قبل وصول البيانات.
        ZStack {
            HomeStripAnchor()
            if let h = store.hero, !hidden {
                ReaderLink(value: RoshnRoute()) {
                    if let champion = offSeasonChampion {
                        championCard(champion)
                    } else if h.preSeason, !h.inSeason, let opener = cardFixture, !opener.started {
                        preSeasonCard(h, opener: opener)
                    } else if let md = store.activeMatchday {
                        matchdayCard(md)
                    } else if let f = cardFixture {
                        matchCard(f)
                    } else {
                        resultsCard(store.todayResults)
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

    /// لا لعب ولا موعد قادم معروف: نتائج اليوم إن وُجدت، وإلا مدخل هادئ للمركز.
    private func resultsCard(_ results: [RsFixture]) -> some View {
        let n = results.count
        let round = results.first.map(\.round).flatMap { r in
            results.allSatisfy { $0.round == r } && !r.isEmpty ? r : nil
        }
        let subtitle = n == 0
            ? "المباريات والترتيب والنتائج"
            : "\(round ?? "مباريات اليوم") · انتهت \(n == 1 ? "مباراة" : n == 2 ? "مباراتان" : "\(n) مباريات")"
        return banner(subtitle: subtitle) {
            if n > 0 {
                chip { Text("النتائج").lineLimit(1).fixedSize() }
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
            // عمود الأقسام الضيق في رئيسية Duo: الشعار يُخفى ليتسع الاسم والنتيجة
            if !narrow {
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
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("دوري روشن")
                    .sabqText(SabqType.rowTitle.scaled(compactType))
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                Text(subtitle)
                    .sabqText(SabqType.meta.scaled(compactType))
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1).minimumScaleFactor(0.85)
                // العمود الضيق: النتيجة/العدّاد تحت الاسم فلا يُقصّ «دوري روشن»
                if narrow { trailing().padding(.top, SabqLayout.space4) }
            }

            Spacer(minLength: SabqLayout.space8)

            if !narrow { trailing() }

            Image(systemName: "chevron.left")
                .font(SabqType.metaEmphasis.scaled(compactType).font)
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
            .sabqText(SabqType.tag.scaled(compactType))
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

    /// عدّاد تنازلي؛ إذا حلّ الموعد قبل أن يقلب المزوّد الحالة إلى «مباشر»
    /// يظهر «حان الموعد» (نص الويب نفسه) بدل 00:00:00.
    private func countdownChip(prefix: String, timestamp: Int) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            chip {
                Group {
                    if TimeInterval(timestamp) <= context.date.timeIntervalSince1970 {
                        Text("حان الموعد")
                    } else {
                        // الكلمة أولًا (يمينًا) ثم العدّاد، أيًّا كان اتجاه الحاوية
                        // (طلب المالك 2026-10-19).
                        HStack(spacing: 4) {
                            Text(prefix)
                            Text(WCFormat.countdown(to: timestamp))
                                .monospacedDigit()
                        }
                        .environment(\.layoutDirection, .rightToLeft)
                    }
                }
                .lineLimit(1).fixedSize()
            }
        }
    }

    private func liveScoreChip(_ f: RsFixture) -> some View {
        chip(background: RoshnTheme.liveFill) {
            HStack(spacing: SabqLayout.space4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .sabqText(SabqType.metaEmphasis.scaled(compactType))
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                if let elapsed = f.status.elapsed, elapsed > 0 {
                    Text("\(elapsed)\((f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : "")'")
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            .lineLimit(1)
            .fixedSize()
        }
    }
}
