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
// بطاقة بهوية «أخضر الملعب» (2026-08-02): زمردي صلب بنص أبيض — نفس لون هيرو
// المركز — بثلاثة عناصر فقط: شعار الدوري، سطرا الهوية، وشارة حالة واحدة
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
            Color.clear.frame(width: 0, height: 0)
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
                chip(background: RoshnTheme.liveRed) {
                    HStack(spacing: 5) {
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
            chip(background: RoshnTheme.gold) {
                HStack(spacing: 6) {
                    Text("🏆")
                    Text(c.name).lineLimit(1)
                }
            }
        }
    }

    // MARK: هيكل البطاقة والعناصر

    private func banner(subtitle: String, @ViewBuilder trailing: () -> some View) -> some View {
        HStack(spacing: 11) {
            Image("RoshnLeagueLogo")
                .resizable()
                .scaledToFit()
                .padding(4)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(.white))

            VStack(alignment: .leading, spacing: 2) {
                Text("دوري روشن")
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(subtitle)
                    .font(SabqFonts.app(size: 10))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1).minimumScaleFactor(0.8)
            }

            Spacer(minLength: 8)

            trailing()

            Image(systemName: "chevron.left")
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Circle().fill(.white.opacity(0.18)))
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .background(RoshnTheme.sky)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: RoshnTheme.cardShadow, radius: 8, x: 0, y: 3)
    }

    private func chip(background: Color, @ViewBuilder content: () -> some View) -> some View {
        content()
            .font(SabqFonts.app(size: 11, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Capsule().fill(background))
    }

    private func countdownChip(prefix: String, timestamp: Int) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            chip(background: .white.opacity(0.16)) {
                Text("\(prefix) \(WCFormat.countdown(to: timestamp))")
                    .monospacedDigit()
                    .lineLimit(1).fixedSize()
            }
        }
    }

    private func liveScoreChip(_ f: RsFixture) -> some View {
        chip(background: RoshnTheme.liveRed) {
            HStack(spacing: 6) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .font(SabqFonts.app(size: 13, weight: .bold))
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
