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
// بطاقة بهوية كأس الملك (أخضر زمردي + ذهبي) تعرض عدّاد يوم الجولة (أدوار الدفعة
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
            Color.clear.frame(width: 0, height: 0)
            if let ov = store.overview, !hidden {
                NavigationLink(value: KingsCupRoute()) {
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

    private var cardGradient: LinearGradient {
        LinearGradient(
            colors: [WCTheme.heroTop, WCTheme.royal, WCTheme.heroBottom],
            startPoint: .topTrailing, endPoint: .bottomLeading
        )
    }

    // MARK: بطاقة المباراة القادمة/الحية

    private func matchCard(_ f: KcFixture) -> some View {
        HStack(spacing: 10) {
            identity(subtitle: statusSubtitle(f))
                .frame(width: 126, alignment: .leading)

            Spacer(minLength: 4)

            HStack(spacing: 7) {
                logo(f.home.logo)
                centerColumn(f)
                logo(f.away.logo)
            }

            Spacer(minLength: 2)

            chevron
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(cardBackground(glow: WCTheme.leaf))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(.white.opacity(0.18), lineWidth: 1))
        .shadow(color: WCTheme.royal.opacity(0.30), radius: 14, x: 0, y: 7)
    }

    // MARK: بطاقة يوم الجولة (عدّاد مشترك)

    private func matchdayCard(_ md: KcMatchday) -> some View {
        HStack(spacing: 10) {
            identity(subtitle: "تغطية بتوقيت الرياض")
                .frame(width: 126, alignment: .leading)

            Spacer(minLength: 4)

            VStack(spacing: 3) {
                Text(md.round ?? "جولة البطولة")
                    .font(SabqFonts.app(size: 15, weight: .black)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text("\(md.count) \(md.count == 2 ? "مباراتان" : "مباريات") · \(KcFormat.day(iso: md.date))")
                    .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.leaf)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if md.liveCount > 0 {
                    HStack(spacing: 4) {
                        Circle().fill(WCTheme.liveRed).frame(width: 6, height: 6)
                        Text(md.liveCount == 1 ? "مباراة تجري الآن" : "\(md.liveCount) مباريات تجري الآن")
                            .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(.white)
                    }
                } else if let ts = md.nextKickoffTs {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text("تنطلق بعد \(WCFormat.countdown(to: ts))")
                            .font(SabqFonts.app(size: 11, weight: .semibold)).foregroundStyle(WCTheme.leaf)
                            .lineLimit(1).fixedSize()
                    }
                }
            }

            Spacer(minLength: 2)

            chevron
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(cardBackground(glow: WCTheme.leaf))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(.white.opacity(0.18), lineWidth: 1))
        .shadow(color: WCTheme.royal.opacity(0.30), radius: 14, x: 0, y: 7)
    }

    // MARK: بطاقة البطل

    private func championCard(_ c: KcChampion) -> some View {
        HStack(spacing: 10) {
            identity(subtitle: "اكتملت البطولة", subtitleColor: WCTheme.leaf)
                .frame(width: 126, alignment: .leading)

            Spacer(minLength: 4)

            HStack(spacing: 8) {
                ZStack(alignment: .bottomLeading) {
                    WCRemoteImage(url: c.team.logo)
                        .padding(4).frame(width: 40, height: 40)
                        .background(Circle().fill(.white))
                        .overlay(Circle().stroke(WCTheme.gold.opacity(0.8), lineWidth: 1.5))
                    Image(systemName: "trophy.fill")
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(WCTheme.gold)
                        .shadow(color: .black.opacity(0.35), radius: 2)
                        .offset(x: -4, y: 3)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("🏆 بطل كأس الملك")
                        .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.gold)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(c.team.name)
                        .font(SabqFonts.app(size: 18, weight: .black)).foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.75)
                    if let runnerUp = c.runnerUp, let score = c.score {
                        Text("فاز على \(runnerUp.name) \(score)\(c.penalties.map { " (ترجيح \($0))" } ?? "")")
                            .font(SabqFonts.app(size: 9, weight: .semibold)).foregroundStyle(WCTheme.leaf)
                            .lineLimit(1).minimumScaleFactor(0.65)
                    }
                }
            }

            Spacer(minLength: 2)

            chevron
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(cardBackground(glow: WCTheme.gold))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(WCTheme.gold.opacity(0.35), lineWidth: 1))
        .shadow(color: WCTheme.royal.opacity(0.30), radius: 14, x: 0, y: 7)
    }

    // MARK: عناصر مشتركة

    private func identity(subtitle: String, subtitleColor: Color = WCTheme.leaf) -> some View {
        HStack(spacing: 10) {
            Image("KingsCupEmblem")
                .resizable().scaledToFit()
                .frame(height: 32)
                .padding(.horizontal, 6).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(.white))
                .shadow(color: .black.opacity(0.20), radius: 5, y: 2)

            VStack(alignment: .leading, spacing: 2) {
                Text("كأس الملك")
                    .font(SabqFonts.app(size: 15, weight: .black)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Text(subtitle)
                    .font(SabqFonts.app(size: 9)).foregroundStyle(subtitleColor)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func cardBackground(glow: Color) -> some View {
        cardGradient.overlay(alignment: .topLeading) {
            Circle()
                .fill(glow.opacity(0.20))
                .frame(width: 140, height: 140)
                .blur(radius: 50)
                .offset(x: -30, y: -50)
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.left")
            .font(SabqFonts.app(size: 13, weight: .bold))
            .foregroundStyle(.white.opacity(0.9))
    }

    private func logo(_ url: String) -> some View {
        WCRemoteImage(url: url)
            .padding(3).frame(width: 32, height: 32)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1))
    }

    private func statusSubtitle(_ f: KcFixture) -> String {
        f.status.live ? "مباشر الآن" : "تغطية حية بتوقيت الرياض"
    }

    private func centerColumn(_ f: KcFixture) -> some View {
        Group {
            if f.started {
                VStack(spacing: 2) {
                    Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                        .font(SabqFonts.app(size: 19, weight: .black)).foregroundStyle(.white)
                        .environment(\.layoutDirection, .leftToRight)
                    liveStatus(f)
                }
                .frame(minWidth: 82)
            } else {
                VStack(spacing: 2) {
                    Text(KcFormat.time(f))
                        .font(SabqFonts.app(size: 14, weight: .black)).foregroundStyle(.white)
                        .lineLimit(1).fixedSize()
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text("تنطلق بعد \(WCFormat.countdown(to: f.timestamp))")
                            .font(SabqFonts.app(size: 10, weight: .semibold)).foregroundStyle(WCTheme.leaf)
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
        return HStack(spacing: 5) {
            Text(period).lineLimit(1).minimumScaleFactor(0.72)
            if let minute {
                Circle().fill(.white.opacity(0.85)).frame(width: 3.5, height: 3.5)
                Text(minute).monospacedDigit().environment(\.layoutDirection, .leftToRight)
            }
        }
        .font(SabqFonts.app(size: 10, weight: .black))
        .foregroundStyle(.white)
        .padding(.horizontal, 9).padding(.vertical, 5)
        .frame(minWidth: 78, maxWidth: 94)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(WCTheme.liveRed))
        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(.white.opacity(0.12), lineWidth: 1))
    }

    private func liveMinute(_ f: KcFixture) -> String? {
        guard let elapsed = f.status.elapsed, elapsed > 0 else { return nil }
        let extra = (f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : ""
        return "\(elapsed)\(extra)'"
    }
}
