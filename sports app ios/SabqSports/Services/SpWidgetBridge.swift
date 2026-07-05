import Foundation
import WidgetKit

// جسر ودجت الشاشة الرئيسية — يختار «المباراة القادمة» (مباراة المفضّل أولًا،
// ثم أقرب متابَعة من «مبارياتي» عبر البطولات، ثم أبرز مباريات روشن)، يكيّش
// الشعارين في حاوية App Group، يكتب اللقطة المشتركة، ثم يطلب تحديث خطوط
// الودجت. يُستدعى بعد تحميل الرئيسية — أفضل جهد، لا يرمي.
enum SpWidgetBridge {
    static let widgetKind = "SpNextMatchWidget"

    static func sync(matches m: SpMatchesResponse?, follows: [SpFixture] = [], favoriteId: Int?) async {
        guard let m else { return }
        guard let f = pick(m, follows: follows, favoriteId: favoriteId) else {
            SpWidgetSnapshot.clear()
            WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
            return
        }
        // لا نعيد الكتابة إن كانت اللقطة الحالية لنفس المباراة (الشعارات مكيّشة أصلًا).
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
            isFavoriteTeam: isFav
        )
        guard current == nil || current!.fixtureId != snap.fixtureId
            || current!.homeLogoFile != snap.homeLogoFile || current!.awayLogoFile != snap.awayLogoFile
            || current!.isFavoriteTeam != snap.isFavoriteTeam else { return }
        snap.save()
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }

    /// مباراة الودجت: مباراة المفضّل غير المنتهية أولًا (من روشن أو المتابَعات)،
    /// ثم أقرب متابَعة من «مبارياتي» عبر البطولات، ثم مباشر/اليوم/قادمة من روشن.
    private static func pick(_ m: SpMatchesResponse, follows: [SpFixture], favoriteId: Int?) -> SpFixture? {
        let liveFollows = follows.filter { !$0.status.finished }.sorted { $0.timestamp < $1.timestamp }
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
}
