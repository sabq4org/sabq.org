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
// بطاقة فاتحة منسّقة (قرار المالك: لا داكن) بهوية روشن: سماوي + زمردي على
// أرضية بيضاء صباحية. أربع حالات: عدّاد انطلاق الموسم (قبل الموسم) / يوم
// الجولة / المباراة القادمة أو الحية / بطاقة البطل. تختفي كليًا عند إطفاء
// البلوك من لوحة التحكم (blockHidden) — نفس مفتاح الويب حرفيًا.

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

    // MARK: بطاقة ما قبل الموسم — عدّاد الانطلاقة + مباراة الافتتاح

    private func preSeasonCard(_ h: RsHero, opener: RsFixture) -> some View {
        HStack(spacing: 10) {
            identity(subtitle: "الموسم الجديد \(RsFormat.seasonLabel(h.outlook.nextSeason ?? h.outlook.season))")
                .frame(width: 130, alignment: .leading)

            Spacer(minLength: 4)

            VStack(spacing: 3) {
                HStack(spacing: 7) {
                    logo(opener.home.logo)
                    Text("مباراة الافتتاح")
                        .font(SabqFonts.app(size: 10, weight: .medium))
                        .foregroundStyle(RoshnTheme.inkSoft)
                    logo(opener.away.logo)
                }
                if let ts = h.outlook.firstKickoffTs ?? (opener.timestamp > 0 ? opener.timestamp : nil) {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text("ينطلق بعد \(WCFormat.countdown(to: ts))")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(RoshnTheme.sky)
                            .lineLimit(1).fixedSize()
                    }
                }
            }

            Spacer(minLength: 2)

            chevron
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(lightCard(glow: RoshnTheme.sky))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
        .shadow(color: RoshnTheme.sky.opacity(0.12), radius: 12, x: 0, y: 6)
    }

    // MARK: بطاقة المباراة القادمة/الحية

    private func matchCard(_ f: RsFixture) -> some View {
        HStack(spacing: 10) {
            identity(subtitle: f.status.live ? "مباشر الآن" : "تغطية حية بتوقيت الرياض")
                .frame(width: 130, alignment: .leading)

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
        .background(lightCard(glow: f.status.live ? RoshnTheme.liveRed : RoshnTheme.pitch))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
        .shadow(color: RoshnTheme.sky.opacity(0.12), radius: 12, x: 0, y: 6)
    }

    // MARK: بطاقة يوم الجولة (عدّاد مشترك)

    private func matchdayCard(_ md: RsMatchday) -> some View {
        HStack(spacing: 10) {
            identity(subtitle: "تغطية بتوقيت الرياض")
                .frame(width: 130, alignment: .leading)

            Spacer(minLength: 4)

            VStack(spacing: 3) {
                Text(md.round ?? "جولة الدوري")
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(RoshnTheme.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text("\(md.count) \(md.count == 2 ? "مباراتان" : "مباريات") · \(RsFormat.day(iso: md.date))")
                    .font(SabqFonts.app(size: 9)).foregroundStyle(RoshnTheme.inkSoft)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if md.liveCount > 0 {
                    HStack(spacing: 4) {
                        Circle().fill(RoshnTheme.liveRed).frame(width: 6, height: 6)
                        Text(md.liveCount == 1 ? "مباراة تجري الآن" : "\(md.liveCount) مباريات تجري الآن")
                            .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(RoshnTheme.liveRed)
                    }
                } else if let ts = md.nextKickoffTs {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text("تنطلق بعد \(WCFormat.countdown(to: ts))")
                            .font(SabqFonts.app(size: 11)).foregroundStyle(RoshnTheme.sky)
                            .lineLimit(1).fixedSize()
                    }
                }
            }

            Spacer(minLength: 2)

            chevron
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(lightCard(glow: RoshnTheme.pitch))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
        .shadow(color: RoshnTheme.sky.opacity(0.12), radius: 12, x: 0, y: 6)
    }

    // MARK: بطاقة البطل (عطلة ما بين الموسمين)

    private func championCard(_ c: RsChampion) -> some View {
        HStack(spacing: 10) {
            identity(subtitle: "اكتمل الموسم", subtitleColor: RoshnTheme.gold)
                .frame(width: 130, alignment: .leading)

            Spacer(minLength: 4)

            HStack(spacing: 8) {
                ZStack(alignment: .bottomLeading) {
                    WCRemoteImage(url: c.logo)
                        .padding(4).frame(width: 40, height: 40)
                        .background(Circle().fill(.white))
                        .overlay(Circle().stroke(RoshnTheme.gold.opacity(0.8), lineWidth: 1.5))
                    Image(systemName: "trophy.fill")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(RoshnTheme.gold)
                        .offset(x: -4, y: 3)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("🏆 بطل دوري روشن")
                        .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(RoshnTheme.gold)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(c.name)
                        .font(SabqFonts.app(size: 17, weight: .semibold)).foregroundStyle(RoshnTheme.ink)
                        .lineLimit(1).minimumScaleFactor(0.75)
                }
            }

            Spacer(minLength: 2)

            chevron
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(lightCard(glow: RoshnTheme.gold))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(RoshnTheme.gold.opacity(0.35), lineWidth: 1))
        .shadow(color: RoshnTheme.gold.opacity(0.15), radius: 12, x: 0, y: 6)
    }

    // MARK: عناصر مشتركة

    private func identity(subtitle: String, subtitleColor: Color = RoshnTheme.inkSoft) -> some View {
        HStack(spacing: 10) {
            // شارة الدوري: كرة على تدرّج سماوي — بديل أنيق حتى يتوفر أصل الشعار.
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(LinearGradient(colors: [RoshnTheme.sky, RoshnTheme.pitch],
                                         startPoint: .topTrailing, endPoint: .bottomLeading))
                    .frame(width: 38, height: 38)
                Image(systemName: "soccerball")
                    .font(SabqFonts.app(size: 18, weight: .medium))
                    .foregroundStyle(.white)
            }
            .shadow(color: RoshnTheme.sky.opacity(0.25), radius: 5, y: 2)

            VStack(alignment: .leading, spacing: 2) {
                Text("دوري روشن")
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(RoshnTheme.ink)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Text(subtitle)
                    .font(SabqFonts.app(size: 9)).foregroundStyle(subtitleColor)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// أرضية فاتحة بتوهّج لوني ناعم في الزاوية — بديل التدرّج الداكن.
    private func lightCard(glow: Color) -> some View {
        RoshnTheme.stripGradient.overlay(alignment: .topLeading) {
            Circle()
                .fill(glow.opacity(0.10))
                .frame(width: 150, height: 150)
                .blur(radius: 50)
                .offset(x: -30, y: -50)
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.left")
            .font(SabqFonts.app(size: 12, weight: .medium))
            .foregroundStyle(RoshnTheme.sky)
    }

    private func logo(_ url: String) -> some View {
        WCRemoteImage(url: url)
            .padding(3).frame(width: 32, height: 32)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(RoshnTheme.line, lineWidth: 1))
    }

    private func centerColumn(_ f: RsFixture) -> some View {
        Group {
            if f.started {
                VStack(spacing: 2) {
                    Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                        .font(SabqFonts.app(size: 18, weight: .semibold)).foregroundStyle(RoshnTheme.ink)
                        .environment(\.layoutDirection, .leftToRight)
                    liveStatus(f)
                }
                .frame(minWidth: 82)
            } else {
                VStack(spacing: 2) {
                    Text(RsFormat.time(f))
                        .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(RoshnTheme.ink)
                        .lineLimit(1).fixedSize()
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text("تنطلق بعد \(WCFormat.countdown(to: f.timestamp))")
                            .font(SabqFonts.app(size: 10)).foregroundStyle(RoshnTheme.sky)
                            .lineLimit(1).fixedSize()
                    }
                }
                .frame(minWidth: 82)
            }
        }
    }

    private func liveStatus(_ f: RsFixture) -> some View {
        let period = f.status.label.isEmpty ? "مباشر" : f.status.label
        let minute: String? = {
            guard let elapsed = f.status.elapsed, elapsed > 0 else { return nil }
            let extra = (f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : ""
            return "\(elapsed)\(extra)'"
        }()
        return HStack(spacing: 5) {
            Text(period).lineLimit(1).minimumScaleFactor(0.72)
            if let minute {
                Circle().fill(.white.opacity(0.85)).frame(width: 3.5, height: 3.5)
                Text(minute).monospacedDigit().environment(\.layoutDirection, .leftToRight)
            }
        }
        .font(SabqFonts.app(size: 10, weight: .medium))
        .foregroundStyle(.white)
        .padding(.horizontal, 9).padding(.vertical, 5)
        .frame(minWidth: 78, maxWidth: 94)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(RoshnTheme.liveRed))
    }
}
