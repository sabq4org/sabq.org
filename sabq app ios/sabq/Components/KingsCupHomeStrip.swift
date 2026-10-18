import SwiftUI

// MARK: - مخزن نظرة كأس الملك المشترك
//
// مخزن حيّ على مستوى التطبيق يحتفظ بآخر نظرة جُلبت — كي تبقى البطاقة ظاهرة عند
// العودة من التنقّل (نفس علّة مخزن المونديال). التحديث انتهازي: عند اللعب لحظيًّا،
// وقبل الصافرة بنبضة أبطأ، وإلا عند الحاجة فقط.

@Observable
@MainActor
final class KingsCupHomeStore {
    static let shared = KingsCupHomeStore()
    private init() {}

    private(set) var overview: KcOverview?
    private var lastFetch: Date?
    private var fetching = false

    func loadIfNeeded() async {
        if fetching { return }
        if overview != nil, let last = lastFetch, Date().timeIntervalSince(last) < 30 { return }
        fetching = true
        defer { fetching = false }
        if let result = try? await APIClient.shared.fetchKingsCupOverview() {
            overview = result
            lastFetch = Date()
        }
    }

    func refreshLive() async {
        if fetching { return }
        fetching = true
        defer { fetching = false }
        if let result = try? await APIClient.shared.fetchKingsCupOverview(ignoreCache: true) {
            overview = result
            lastFetch = Date()
        }
    }

    /// هل تجري مباراة الآن؟ (من قائمة live أو مباراة اليوم/القادمة الحيّة).
    var anyLive: Bool {
        guard let ov = overview else { return false }
        if ov.live.contains(where: { $0.status.live }) { return true }
        if ov.matchday?.liveCount ?? 0 > 0 { return true }
        return ov.nextMatch?.status.live ?? false
    }

    /// أقرب انطلاقة قادمة (من يوم الجولة أو المباراة القادمة) — لإبقاء الاستطلاع
    /// حيًّا حول الصافرة فيلتقط التحوّل قادمة→مباشر.
    var nextKickoffTimestamp: Int? {
        guard let ov = overview else { return nil }
        if let ts = ov.matchday?.nextKickoffTs { return ts }
        if let f = ov.nextMatch, !f.status.live, !f.status.finished { return f.timestamp }
        return nil
    }
}

// MARK: - شريط كأس الملك في الواجهة الرئيسية
//
// بلوك هادئ (surfaceMuted، زوايا 12، بلا حد ولا ظل) بلمسة هوية كأس الملك يعرض عدّاد يوم الجولة (أدوار الدفعة
// الواحدة) أو المباراة القادمة/الحية أو بطاقة البطل، مع رابط لقسم كأس الملك
// الكامل. تختفي كليًا عند إطفاء البلوك من لوحة التحكم (blockHidden) أو غياب
// البيانات — صفر أثر (مطابق KingsCupHomeSection على الويب).

struct KingsCupHomeStrip: View {
    private let store = KingsCupHomeStore.shared

    /// عدّاد يوم الجولة يتصدّر عندما يضم اليوم 3 مباريات فأكثر (أدوار مبكرة).
    private var matchdayMode: Bool {
        guard let ov = store.overview, ov.champion == nil, let md = ov.matchday else { return false }
        return md.count >= 3
    }

    private var hidden: Bool {
        guard let ov = store.overview else { return true }
        if ov.blockHidden == true { return true }
        return ov.champion == nil && ov.nextMatch == nil
    }

    var body: some View {
        // حامل Color.clear يمنع SwiftUI من إلغاء .task قبل وصول البيانات.
        ZStack {
            HomeStripAnchor()
            if let ov = store.overview, !hidden {
                ReaderLink(value: KingsCupRoute()) {
                    if let champion = ov.champion {
                        championCard(champion)
                    } else if matchdayMode, let md = ov.matchday {
                        matchdayCard(md)
                    } else if let f = ov.nextMatch {
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

    // MARK: بطاقة المباراة القادمة/الحية

    private func matchCard(_ f: KcFixture) -> some View {
        HStack(spacing: SabqLayout.space8) {
            identity(subtitle: statusSubtitle(f))
                .frame(width: 120, alignment: .leading)

            Spacer(minLength: SabqLayout.space4)

            HStack(spacing: SabqLayout.space8) {
                logo(f.home.logo)
                centerColumn(f)
                logo(f.away.logo)
            }

            Spacer(minLength: 0)

            chevron
        }
        .modifier(KcStripSurface())
    }

    // MARK: بطاقة يوم الجولة (عدّاد مشترك)

    private func matchdayCard(_ md: KcMatchday) -> some View {
        HStack(spacing: SabqLayout.space8) {
            identity(subtitle: "تغطية بتوقيت الرياض")
                .frame(width: 120, alignment: .leading)

            Spacer(minLength: SabqLayout.space4)

            VStack(spacing: 2) {
                Text(md.round ?? "جولة البطولة")
                    .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text("\(md.count) \(md.count == 2 ? "مباراتان" : "مباريات") · \(KcFormat.day(iso: md.date))")
                    .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if md.liveCount > 0 {
                    Text(md.liveCount == 1 ? "مباراة تجري الآن" : "\(md.liveCount) مباريات تجري الآن")
                        .sabqText(SabqType.tag).foregroundStyle(.white)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                        .background(Capsule().fill(KcTheme.liveFill))
                } else if let ts = md.nextKickoffTs {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text("تنطلق بعد \(WCFormat.countdown(to: ts))")
                            .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                            .lineLimit(1).fixedSize()
                    }
                }
            }

            Spacer(minLength: 0)

            chevron
        }
        .modifier(KcStripSurface())
    }

    // MARK: بطاقة البطل

    private func championCard(_ c: KcChampion) -> some View {
        HStack(spacing: SabqLayout.space8) {
            identity(subtitle: "اكتملت البطولة")
                .frame(width: 120, alignment: .leading)

            Spacer(minLength: SabqLayout.space4)

            HStack(spacing: SabqLayout.space8) {
                ZStack(alignment: .bottomLeading) {
                    WCRemoteImage(url: c.team.logo)
                        .padding(4).frame(width: 40, height: 40)
                        .background(Circle().fill(.white))
                        .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
                    Image(systemName: "trophy.fill")
                        .font(SabqType.tag.font)
                        .foregroundStyle(KcTheme.gold)
                        .offset(x: -4, y: 4)
                        .accessibilityHidden(true)
                }

                VStack(alignment: .leading, spacing: 0) {
                    Text("🏆 بطل كأس الملك")
                        .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(c.team.name)
                        .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1).minimumScaleFactor(0.75)
                    if let runnerUp = c.runnerUp, let score = c.score {
                        Text("فاز على \(runnerUp.name) \(score)\(c.penalties.map { " (ترجيح \($0))" } ?? "")")
                            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(1).minimumScaleFactor(0.65)
                    }
                }
            }

            Spacer(minLength: 0)

            chevron
        }
        .modifier(KcStripSurface())
    }

    // MARK: عناصر مشتركة

    private func identity(subtitle: String) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image("KingsCupEmblem")
                .resizable().scaledToFit()
                .frame(height: 32)
                .padding(.horizontal, SabqLayout.space4).padding(.vertical, SabqLayout.space4)
                .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(.white))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 0) {
                Text("كأس الملك")
                    .sabqText(SabqType.rowTitle).foregroundStyle(KcTheme.accent)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Text(subtitle)
                    .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2).minimumScaleFactor(0.8)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.left")
            .font(SabqType.metaEmphasis.font)
            .foregroundStyle(SabqTheme.textTertiary)
            .accessibilityHidden(true)
    }

    private func logo(_ url: String) -> some View {
        WCRemoteImage(url: url)
            .padding(3).frame(width: 32, height: 32)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
    }

    private func statusSubtitle(_ f: KcFixture) -> String {
        f.status.live ? "مباشر الآن" : "تغطية حية بتوقيت الرياض"
    }

    private func centerColumn(_ f: KcFixture) -> some View {
        Group {
            if f.started {
                VStack(spacing: 2) {
                    Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                        .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                    liveStatus(f)
                }
                .frame(minWidth: 82)
            } else {
                VStack(spacing: 2) {
                    Text(KcFormat.time(f))
                        .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1).fixedSize()
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text("تنطلق بعد \(WCFormat.countdown(to: f.timestamp))")
                            .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                            .lineLimit(1).fixedSize()
                    }
                }
                .frame(minWidth: 82)
            }
        }
    }

    private func liveStatus(_ f: KcFixture) -> some View {
        let period = f.status.label.isEmpty ? "مباشر" : f.status.label
        let minute = liveMinute(f)
        return HStack(spacing: SabqLayout.space4) {
            Text(period).lineLimit(1).minimumScaleFactor(0.72)
            if let minute {
                Circle().fill(.white.opacity(0.85)).frame(width: 4, height: 4)
                Text(minute).monospacedDigit().environment(\.layoutDirection, .leftToRight)
            }
        }
        .sabqText(SabqType.tag)
        .foregroundStyle(.white)
        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
        .frame(minWidth: 78, maxWidth: 100)
        .background(Capsule().fill(KcTheme.liveFill))
    }

    private func liveMinute(_ f: KcFixture) -> String? {
        guard let elapsed = f.status.elapsed, elapsed > 0 else { return nil }
        let extra = (f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : ""
        return "\(elapsed)\(extra)'"
    }
}

/// سطح شريط الرئيسية: بلوك هادئ بزوايا 12 بلا حد ولا ظل ولا تدرّج.
private struct KcStripSurface: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space12)
            .frame(minHeight: 72)
            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
            .contentShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }
}
