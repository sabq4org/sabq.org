import Foundation
import WidgetKit

// جسر ودجت الشاشة الرئيسية — يختار «المباراة القادمة» (مباراة المفضّل أولًا،
// ثم أقرب متابَعة من «مبارياتي» عبر البطولات، ثم أبرز مباريات روشن)، يكيّش
// الشعارين في حاوية App Group، يكتب اللقطة المشتركة، ثم يطلب تحديث خطوط
// الودجت. يُستدعى بعد تحميل الرئيسية — أفضل جهد، لا يرمي.
nonisolated enum SpWidgetBridge {
    static let widgetKind = "SpNextMatchWidget"

    static func sync(follows: [SpFixture], favoriteId: Int?) async {
        guard let f = pickFollow(follows, favoriteId: favoriteId) else { return }
        await write(f, favoriteId: favoriteId)
    }

    static func sync(matches m: SpMatchesResponse?, follows: [SpFixture] = [], favoriteId: Int?) async {
        guard let m else { return }
        guard let f = pick(m, follows: follows, favoriteId: favoriteId) else {
            SpWidgetSnapshot.clear()
            WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
            return
        }
        await write(f, favoriteId: favoriteId)
    }

    private static func write(_ f: SpFixture, favoriteId: Int?) async {
        // لا نعيد الكتابة إن كانت اللقطة الحالية لنفس المباراة وبنفس البيانات الأساسية.
        let current = SpWidgetSnapshot.load()
        let homeFile = await SpSharedContainer.cacheLogo(from: f.home.logo)
        let awayFile = await SpSharedContainer.cacheLogo(from: f.away.logo)
        let isFav = favoriteId != nil && (f.home.id == favoriteId || f.away.id == favoriteId)
        let snap = SpWidgetSnapshot(
            fixtureId: f.id,
            homeName: f.home.name, awayName: f.away.name,
            homeLogoFile: homeFile, awayLogoFile: awayFile,
            competition: (f.competition?.isEmpty == false) ? f.competition! : "دوري روشن",
            kickoff: f.kickoff,
            isFavoriteTeam: isFav,
            homeScore: f.started ? (f.goals.home ?? 0) : nil,
            awayScore: f.started ? (f.goals.away ?? 0) : nil,
            homePenaltyScore: f.penaltyScore?.home,
            awayPenaltyScore: f.penaltyScore?.away,
            statusLabel: f.status.label,
            isLive: f.status.live,
            isFinished: f.status.finished
        )
        guard current == nil || current!.fixtureId != snap.fixtureId
            || current!.homeLogoFile != snap.homeLogoFile || current!.awayLogoFile != snap.awayLogoFile
            || current!.isFavoriteTeam != snap.isFavoriteTeam
            || current!.homeScore != snap.homeScore || current!.awayScore != snap.awayScore
            || current!.homePenaltyScore != snap.homePenaltyScore || current!.awayPenaltyScore != snap.awayPenaltyScore
            || current!.statusLabel != snap.statusLabel || current!.isLive != snap.isLive
            || current!.isFinished != snap.isFinished else { return }
        snap.save()
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }

    /// مباراة الودجت: مباراة المفضّل غير المنتهية أولًا (من روشن أو المتابَعات)،
    /// ثم أقرب متابَعة من «مبارياتي» عبر البطولات، ثم مباشر/اليوم/قادمة من روشن.
    private static func pick(_ m: SpMatchesResponse, follows: [SpFixture], favoriteId: Int?) -> SpFixture? {
        let liveFollows = follows.filter { !$0.status.finished }.sorted(by: matchOrder)
        if let fav = favoriteId {
            for bucket in [m.live, m.today, m.upcoming] {
                if let f = bucket.first(where: { !$0.status.finished && ($0.home.id == fav || $0.away.id == fav) }) {
                    return f
                }
            }
            if let f = liveFollows.first(where: { $0.home.id == fav || $0.away.id == fav }) { return f }
        }
        if let f = liveFollows.first { return f }
        for bucket in [m.live, m.today, m.upcoming] {
            if let f = bucket.first(where: { !$0.status.finished }) { return f }
        }
        return nil
    }

    private static func pickFollow(_ follows: [SpFixture], favoriteId: Int?) -> SpFixture? {
        let liveFollows = follows.filter { !$0.status.finished }.sorted(by: matchOrder)
        if let fav = favoriteId,
           let f = liveFollows.first(where: { $0.home.id == fav || $0.away.id == fav }) {
            return f
        }
        return liveFollows.first
    }

    private static func matchOrder(_ a: SpFixture, _ b: SpFixture) -> Bool {
        let ra = a.status.live ? 0 : a.started ? 2 : 1
        let rb = b.status.live ? 0 : b.started ? 2 : 1
        if ra != rb { return ra < rb }
        if a.timestamp != b.timestamp { return a.timestamp < b.timestamp }
        return a.id < b.id
    }
}
