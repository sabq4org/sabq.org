import Foundation
import SwiftUI

// MARK: - World Cup 2026 — DTOs
//
// مرآة لما ترسله نقاط /api/world-cup/* (مُعرَّبة من الخادم). الـ JSON يصل
// بصيغة camelCase نظيفة، والـ decoder المشترك في APIClient عادي بلا
// keyDecodingStrategy، فالأسماء هنا تطابق المفاتيح حرفيًا. الحقول التي قد
// تكون null في الخادم optional هنا. التواريخ تبقى نصًا وتُحلَّل بـ
// SabqFormatters.parseISO8601 عند العرض.

nonisolated struct WCTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let winner: Bool?
    /// تصنيف فيفا (يصل فقط من /world-cup/teams المُرتّبة) — null خلاف ذلك
    let fifaRank: Int?
}

nonisolated struct WCStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct WCScore: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct WCVenue: Decodable, Hashable {
    let name: String
    let city: String
}

nonisolated struct WCFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let timestamp: Int
    let status: WCStatus
    let round: String
    let roundEn: String
    let venue: WCVenue
    let home: WCTeam
    let away: WCTeam
    let goals: WCScore
    let penalties: WCScore?

    var started: Bool { status.live || status.finished }
    var kickoff: Date? { SabqFormatters.parseISO8601(date) }

    /// نتيجة ركلات الترجيح مع تحديد الفائز. النتيجة مرتّبة دائمًا «الفائز أولًا»
    /// (winnerScore > loserScore) كي لا تنقلب بصريًّا في سياق RTL. المصدر موثوق:
    /// penalties.home للمضيف وpenalties.away للضيف (نفس ربط الأهداف). nil إن لم
    /// تُحسم بالترجيح. لا نعتمد على team.winner لأن المزوّد قد يتركه فارغًا هنا.
    var penaltyOutcome: (winnerName: String, winnerScore: Int, loserScore: Int, winnerHome: Bool)? {
        guard let p = penalties, let h = p.home, let a = p.away, h != a else { return nil }
        let homeWon = h > a
        return (homeWon ? home.name : away.name, homeWon ? h : a, homeWon ? a : h, homeWon)
    }
}

nonisolated struct WCPrediction: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
    let advice: String?
}

nonisolated struct WCMatchOfDay: Decodable, Hashable {
    let fixture: WCFixture
    let prediction: WCPrediction?
}

nonisolated struct WCStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: WCTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    let form: String?
    /// "qualified" | "contention" | "eliminated" — null عند انتهاء/غياب دور المجموعات
    let qualifyStatus: String?
    /// true إذا حُدِّث الصفّ لحظيًّا من TheSports
    let live: Bool?

    var id: Int { team.id }

    var qualifyColor: Color {
        switch qualifyStatus {
        case "qualified": return WCTheme.emeraldDeep
        case "contention": return WCTheme.gold
        case "eliminated": return WCTheme.liveRed
        default: return .clear
        }
    }

    var qualifyLabel: String? {
        switch qualifyStatus {
        case "qualified": return "تأهّل"
        case "eliminated": return "خارج"
        default: return nil
        }
    }
}

nonisolated struct WCGroup: Decodable, Identifiable, Hashable {
    let group: String
    let groupEn: String
    let rows: [WCStandingRow]

    var id: String { groupEn }
}

nonisolated struct WCSaudi: Decodable, Hashable {
    let next: WCFixture?
    let fixtures: [WCFixture]
    let group: WCGroup?
}

nonisolated struct WCOverview: Decodable, Hashable {
    let live: [WCFixture]
    let today: [WCFixture]
    let matchOfTheDay: WCMatchOfDay?
    /// المباريات القادمة المتزامنة مع المميّزة (نفس وقت الانطلاق) — قد تكون في
    /// يوم تقويمي تالٍ فلا تظهر في today؛ يرسلها الخادم لعرض بطاقتي Hero متجاورتين.
    /// optional حتى تبقى الاستجابات الأقدم قابلة للفكّ.
    let matchOfDayPeers: [WCFixture]?
    let saudi: WCSaudi
    let updatedAt: String
    /// توقعات النتيجة مفهرسة بمعرّف المباراة — يرسلها الخادم لكل مباراة قد تُعرض
    /// كبطاقة Hero كبيرة (الحيّة + المتزامنة القادمة)، لا المميّزة وحدها. مفاتيح
    /// JSON نصّية دائمًا فنفكّها [String: …] ثم نبحث بالمعرّف عبر prediction(for:).
    /// optional حتى تبقى الاستجابات الأقدم (قبل #483) قابلة للفكّ.
    let predictions: [String: WCPrediction]?

    /// توقع مباراة بعينها من خريطة overview (إن أرسله الخادم).
    func prediction(for fixtureId: Int) -> WCPrediction? {
        predictions?[String(fixtureId)]
    }
}

nonisolated struct WCScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    /// معرّف اللاعب عند المزود (مفتاح JSON: id) — يفتح بطاقة اللاعب؛ 0/null = غير معروف.
    /// معرّف Identifiable يبقى النصي المركّب لثبات ForEach مع صفوف بلا معرّف.
    let playerId: Int?
    let name: String
    let photo: String
    let team: WCTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let minutes: Int
    let matches: Int

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, photo, team, goals, assists, penalties, minutes, matches
    }
}

nonisolated struct WCLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    /// معرّف اللاعب عند المزود (مفتاح JSON: id) — يفتح بطاقة اللاعب؛ 0/null = غير معروف.
    let playerId: Int?
    let name: String
    let photo: String
    let team: WCTeam
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let minutes: Int
    let matches: Int

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, photo, team, goals, assists, yellow, red, minutes, matches
    }
}

nonisolated struct WCMatchEvent: Decodable, Identifiable, Hashable {
    let minute: Int
    let extraMinute: Int?
    let teamId: Int
    let type: String
    let label: String
    let player: String
    let playerId: Int?
    let assist: String?
    let assistId: Int?

    var id: String { "\(minute)-\(extraMinute ?? 0)-\(type)-\(player)" }
}

nonisolated struct WCLineupPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let number: Int?
    let position: String?
    let grid: String?
}

nonisolated struct WCLineup: Decodable, Identifiable, Hashable {
    let teamId: Int
    let teamName: String
    let formation: String?
    let coach: String
    let startXI: [WCLineupPlayer]
    let substitutes: [WCLineupPlayer]

    var id: Int { teamId }
}

nonisolated struct WCStatistic: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    let home: String
    let away: String

    var id: String { key }
}

nonisolated struct WCPlayerRating: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let teamId: Int
    let number: Int?
    let position: String
    let rating: Double
    let minutes: Int
    let goals: Int
    let assists: Int
    let captain: Bool
}

nonisolated struct WCMatchDetail: Decodable, Hashable {
    let fixture: WCFixture
    let events: [WCMatchEvent]
    let lineups: [WCLineup]
    let statistics: [WCStatistic]
    let prediction: WCPrediction?
    let ratings: [WCPlayerRating]
    let manOfTheMatch: WCPlayerRating?
    let headToHead: [WCFixture]
}

// MARK: - معطيات SportMonks المتقدّمة (ضغط/توقعات/إحصائيات+طقس+غيابات/xG)
//
// نقاط مكمّلة لـ /world-cup/match: pressure / forecast / match-facts / xg.
// كلها «أفضل جهد» — لو رجع الخادم 503/404 (غير مفعّل أو غير منشور بعد) يفشل
// فكّ الترميز فتبقى القيمة nil وتُخفى الأقسام دون أي عطل.

nonisolated struct WCPressurePoint: Decodable, Identifiable, Hashable {
    let label: String
    let minute: Int
    let home: Double
    let away: Double   // سالبة (تُرسم أسفل الصفر)
    let net: Double

    var id: Int { minute }
}

nonisolated struct WCPressureLatest: Decodable, Hashable {
    let side: String   // "home" | "away" | "even"
    let value: Double
}

nonisolated struct WCPressure: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let latest: WCPressureLatest?
    let points: [WCPressurePoint]
}

nonisolated struct WCFulltimeOdds: Decodable, Hashable { let home: Int; let draw: Int; let away: Int }
nonisolated struct WCBtts: Decodable, Hashable { let yes: Int; let no: Int }
nonisolated struct WCDoubleChance: Decodable, Hashable {
    let homeOrDraw: Int; let awayOrDraw: Int; let homeOrAway: Int
}
nonisolated struct WCOverUnderLine: Decodable, Identifiable, Hashable {
    let line: Double; let over: Int; let under: Int
    var id: Double { line }
}
nonisolated struct WCCorrectScore: Decodable, Identifiable, Hashable {
    let score: String; let prob: Double   // "2-0" (المضيف-الضيف)
    var id: String { score }
}
nonisolated struct WCForecast: Decodable, Hashable {
    let available: Bool
    let fulltime: WCFulltimeOdds?
    let btts: WCBtts?
    let doubleChance: WCDoubleChance?
    let goals: [WCOverUnderLine]
    let correctScores: [WCCorrectScore]
}

nonisolated struct WCWeather: Decodable, Hashable {
    let type: String   // "actual" | "forecast"
    let temp: Int?
    let description: String
    let icon: String
    let humidity: String?
}
nonisolated struct WCAbsentee: Decodable, Identifiable, Hashable {
    let name: String; let location: String; let reason: String
    var id: String { "\(location)-\(name)" }
}
nonisolated struct WCEventDetail: Decodable, Identifiable, Hashable {
    let minute: Int; let location: String; let klass: String; let detail: String; let player: String
    var id: String { "\(klass)-\(location)-\(minute)" }
}
nonisolated struct WCHalftime: Decodable, Hashable { let home: Int; let away: Int }
nonisolated struct WCMatchFacts: Decodable, Hashable {
    let available: Bool
    let statistics: [WCStatistic]
    let weather: WCWeather?
    let absentees: [WCAbsentee]
    let eventDetails: [WCEventDetail]
    let halftime: WCHalftime?
}

nonisolated struct WCXgSide: Decodable, Hashable { let xg: Double; let xgot: Double }
nonisolated struct WCXgPlayer: Decodable, Identifiable, Hashable {
    let name: String; let location: String; let xg: Double
    var id: String { "\(location)-\(name)" }
}
nonisolated struct WCXg: Decodable, Hashable {
    let available: Bool
    let home: WCXgSide
    let away: WCXgSide
    let topPlayers: [WCXgPlayer]
}

// MARK: - مسابقة التوقّعات (/api/v1/world-cup/predictions/*)
//
// نسخة الموبايل بمصادقة Bearer. توقّع دقيق بالأهداف لكل مباراة قبل انطلاقها،
// يُغلق عند البدء. جائزة كل مباراة 500 نقطة تُقسَّم على المصيبين.

nonisolated struct WCMyPrediction: Decodable, Hashable {
    let predHome: Int
    let predAway: Int
    let status: String        // pending | correct | incorrect
    let pointsAwarded: Int
}

nonisolated struct WCMatchSettlement: Decodable, Hashable {
    let status: String        // open | locked | settled
    let finalHome: Int?
    let finalAway: Int?
    let winnersCount: Int
    let pointsPerWinner: Int
    let predictionsCount: Int
}

nonisolated struct WCPredictableMatch: Decodable, Identifiable, Hashable {
    let fixture: WCFixture
    let locked: Bool
    let predictionsCount: Int
    let myPrediction: WCMyPrediction?
    let settlement: WCMatchSettlement?

    var id: Int { fixture.id }
}

nonisolated struct WCPredTodayResponse: Decodable, Hashable {
    let matches: [WCPredictableMatch]
}

// سجل توقّعاتي — صفّ مسطّح يجمع التوقّع بلقطة المباراة
nonisolated struct WCPredictionHistoryItem: Decodable, Identifiable, Hashable {
    let fixtureId: String
    let predHome: Int
    let predAway: Int
    let status: String
    let pointsAwarded: Int
    let createdAt: String?
    let kickoffAt: String?
    let homeTeamName: String?
    let homeTeamLogo: String?
    let awayTeamName: String?
    let awayTeamLogo: String?
    let finalHome: Int?
    let finalAway: Int?
    let finalPenHome: Int?
    let finalPenAway: Int?
    let matchStatus: String?
    let winnersCount: Int?
    let pointsPerWinner: Int?

    var id: String { fixtureId }
    var settled: Bool { (finalHome != nil && finalAway != nil) || matchStatus == "settled" }
}

nonisolated struct WCPredMineResponse: Decodable, Hashable {
    let predictions: [WCPredictionHistoryItem]
}

nonisolated struct WCPredLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    let userId: String
    let name: String
    let avatar: String?
    let totalPoints: Int
    let correctCount: Int
    let playedCount: Int

    var id: String { userId }
}

nonisolated struct WCLeaderboardResponse: Decodable, Hashable {
    let leaders: [WCPredLeader]
}

nonisolated struct WCSubmittedPrediction: Decodable, Hashable {
    let predHome: Int
    let predAway: Int
    let status: String
}

nonisolated struct WCPredSubmitResponse: Decodable, Hashable {
    let prediction: WCSubmittedPrediction
}

// MARK: - توقّعات البطولة طويلة المدى (البطل + الهدّاف) — /world-cup/predictions/long
//
// نظيرة WcLongData على الويب. البطل: مرجّح بوزن المبادر (وزن أعلى كلما بُكِّر
// التوقّع، يُغلق عند نصف النهائي). الهدّاف: يُقسَّم بالتساوي، يُغلق عند ربع
// النهائي. votes تصل دومًا (حتى لو فارغة) وتُستخدم لحساب نِسَب كل خيار.

nonisolated struct WCLongTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct WCLongScorerTeam: Decodable, Hashable {
    let name: String
    let logo: String
}

nonisolated struct WCLongScorer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let team: WCLongScorerTeam
    let goals: Int
}

nonisolated struct WCLongMine: Decodable, Hashable {
    let kind: String              // champion | top_scorer
    let teamId: Int?
    let teamName: String?
    let teamLogo: String?
    let playerId: Int?
    let playerName: String?
    let playerPhoto: String?
    let weight: Int
    let status: String            // pending | correct | incorrect
    let pointsAwarded: Int
}

nonisolated struct WCLongChampionVote: Decodable, Hashable {
    let teamId: Int?
    let n: Int
    let w: Int
}

nonisolated struct WCLongChampionState: Decodable, Hashable {
    let open: Bool
    let weight: Int?
    let stage: String              // r32 | r16 | qf | closed
    let votes: [WCLongChampionVote]
}

nonisolated struct WCLongScorerVote: Decodable, Hashable {
    let playerId: Int?
    let n: Int
}

nonisolated struct WCLongScorerState: Decodable, Hashable {
    let open: Bool
    let votes: [WCLongScorerVote]
}

/// مفتاح الهدّاف بالخادم `top_scorer` (snake_case استثناءً) — لا keyDecodingStrategy
/// عامًا في العميل فنُسمّيها Swift-يًّا صراحةً عبر CodingKeys.
nonisolated struct WCLongPools: Decodable, Hashable {
    let champion: Int
    let topScorer: Int

    private enum CodingKeys: String, CodingKey {
        case champion
        case topScorer = "top_scorer"
    }
}

nonisolated struct WCLongData: Decodable, Hashable {
    let pools: WCLongPools
    let teams: [WCLongTeam]
    let scorers: [WCLongScorer]
    let champion: WCLongChampionState
    let topScorer: WCLongScorerState
    let mine: [WCLongMine]
}

nonisolated struct WCLongSubmitBody: Encodable {
    let kind: String
    let teamId: Int?
    let playerId: Int?
}

nonisolated struct WCLongSubmitResponse: Decodable, Hashable {
    let ok: Bool
}

nonisolated struct WCPredictionSubmitBody: Encodable {
    let fixtureId: Int
    let predHome: Int
    let predAway: Int
}

// MARK: - القيمة السوقية للاعب (/world-cup/player/:id/market)

nonisolated struct WCMarketPoint: Decodable, Identifiable, Hashable {
    let time: Int       // ختم زمني (ثوانٍ) لنقطة التقييم
    let value: Double   // القيمة بالعملة (يورو غالبًا)

    var id: Int { time }
    var date: Date { Date(timeIntervalSince1970: TimeInterval(time)) }
}

nonisolated struct WCPlayerMarket: Decodable, Hashable {
    let available: Bool
    let marketValue: Double?
    let currency: String
    let history: [WCMarketPoint]
}

// MARK: - التعليق الحي (/world-cup/commentary/:id)
//
// تعليق نصّي لحظة بلحظة من SportMonks (مُعرَّب على الخادم). order يرتّب
// المجريات، goal/important لإبراز اللحظات الحاسمة. أفضل جهد — يُخفى عند الغياب.

nonisolated struct WCCommentaryItem: Decodable, Identifiable, Hashable {
    let minute: Int
    let extraMinute: Int?
    let goal: Bool
    let important: Bool
    let textAr: String
    let textEn: String
    let order: Int

    var id: String { "\(order)-\(minute)-\(extraMinute ?? 0)" }
    var minuteLabel: String { "\(minute)'\(extraMinute.map { "+\($0)" } ?? "")" }
}

nonisolated struct WCCommentary: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let items: [WCCommentaryItem]
}

// MARK: - الزخم/الاستحواذ (/world-cup/momentum/:id)
//
// مؤشّر زخم هجومي عبر دقائق المباراة + استحواذ كلّي. net موجب للمضيف وسالب
// للضيف. أفضل جهد (TheSports أو SportMonks) — يُخفى عند الغياب.

nonisolated struct WCMomentumPoint: Decodable, Identifiable, Hashable {
    let label: String
    let minute: Int
    let home: Double
    let away: Double
    let net: Double

    var id: Int { minute }
}

nonisolated struct WCPossession: Decodable, Hashable {
    let home: Int
    let away: Int
}

nonisolated struct WCMomentum: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let possession: WCPossession?
    let points: [WCMomentumPoint]
}

// MARK: - قنوات البث (/world-cup/match/:id/tv)

nonisolated struct WCTvChannel: Decodable, Identifiable, Hashable {
    let name: String
    let country: String?
    let url: String?
    let logo: String?

    var id: String { "\(name)-\(country ?? "")" }
}

nonisolated struct WCTvListing: Decodable, Hashable {
    let available: Bool
    let channels: [WCTvChannel]
}

// MARK: - نبض المباراة (/world-cup/pulse/:id)
//
// حزمة خفيفة بنداء واحد للودجت الحيّ: نتيجة/دقيقة لحظية + زخم + آخر VAR.
// home/away هنا اسم+شعار فقط (بلا id/winner)، وstatus بلا code — فلا تُعاد
// استخدام WCTeam/WCStatus بل بُنى مخصّصة تطابق حِمل الخادم حرفيًا.

nonisolated struct WCPulseSide: Decodable, Hashable { let name: String; let logo: String }
nonisolated struct WCPulseScore: Decodable, Hashable { let home: Int; let away: Int }
nonisolated struct WCPulseStatus: Decodable, Hashable {
    let live: Bool
    let finished: Bool
    let elapsed: Int?
    let extra: Int?
    let label: String
}
nonisolated struct WCPulseMomentum: Decodable, Hashable {
    let home: Int
    let away: Int
    let leader: String?   // "home" | "away" | null
    let value: Int
}
nonisolated struct WCPulseVar: Decodable, Hashable {
    let minute: Int
    let team: String      // "home" | "away"
}
nonisolated struct WCPulse: Decodable, Hashable {
    let id: Int
    let home: WCPulseSide
    let away: WCPulseSide
    let score: WCPulseScore
    let status: WCPulseStatus
    let kickoff: String
    let timestamp: Int
    let round: String
    let momentum: WCPulseMomentum
    let lastVar: WCPulseVar?

    var kickoffDate: Date? { SabqFormatters.parseISO8601(kickoff) }
}

// MARK: - فورمة اللاعب الأخيرة + xG (/world-cup/player/:id/form)
//
// آخر ٥ مباريات (الجسر بالاسم الإنجليزي+الميلاد على الخادم — iOS يستهلك فقط).
// الخصم نصّ + شعار نصّ (لا WCTeam)؛ xg/rating قد تكون null.

nonisolated struct WCFormMatch: Decodable, Identifiable, Hashable {
    let date: String
    let opponent: String
    let opponentLogo: String
    let homeAway: String   // "home" | "away"
    let result: String     // "W" | "D" | "L"
    let scoreFor: Int
    let scoreAgainst: Int
    let xg: Double?
    let goals: Int
    let rating: Double?
    let league: String

    var id: String { "\(date)-\(opponent)" }
}

nonisolated struct WCPlayerForm: Decodable, Hashable {
    let available: Bool
    let matches: [WCFormMatch]
}

nonisolated struct WCSquadPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let number: Int?
    let position: String
    let positionEn: String
    let age: Int?
    let photo: String
    /// القيمة السوقية (TheSports) — null إن تعذّر الربط
    let marketValue: Double?
    let marketValueCurrency: String?
}

nonisolated struct WCSquad: Decodable, Hashable {
    let team: WCTeam
    let players: [WCSquadPlayer]
}

// MARK: - صفحة المنتخب المتكاملة (/world-cup/team/:id)
//
// تجمّع الخادم لكل ما يخص منتخبًا واحدًا: هويته + مجموعته وترتيبها +
// كل مبارياته (منتهية/مباشرة/قادمة) + قائمته الكاملة + المدرّب.

nonisolated struct WCTeamExtra: Decodable, Hashable {
    let marketValue: Double?
    let marketValueCurrency: String?
    let foundation: Int?
    let squadSize: Int?
}

nonisolated struct WCFifaRank: Decodable, Hashable {
    let rank: Int
    let points: Double?
    /// عدد المراكز المتغيّرة منذ التحديث السابق (موجب = صعد) — null إن تعذّر
    let change: Int?
}

nonisolated struct WCInjury: Decodable, Identifiable, Hashable {
    let player: String
    let reason: String?
    let status: String?
    let until: String?

    var id: String { "\(player)-\(reason ?? "")" }
}

nonisolated struct WCSeasonStatItem: Decodable, Identifiable, Hashable {
    let label: String
    let value: Double
    let percent: Bool?

    var id: String { label }
    var display: String {
        if percent == true { return "\(Int(value))%" }
        return value == value.rounded() ? "\(Int(value))" : String(format: "%.1f", value)
    }
}

nonisolated struct WCTeamSeasonStats: Decodable, Hashable {
    let available: Bool
    let matches: Int
    let items: [WCSeasonStatItem]
}

nonisolated struct WCCoachInfo: Decodable, Hashable {
    let name: String
    let photo: String
    let formation: String?
    let age: Int?
    let nationality: String?
}

nonisolated struct WCVenueInfo: Decodable, Hashable {
    let name: String
    let capacity: Int?
    let city: String
    let country: String?
}

nonisolated struct WCTeamProfile: Decodable, Hashable {
    let team: WCTeam
    let isSaudi: Bool
    /// المدرّب الحالي — null إن لم يوفّره المزود
    let coach: String?
    /// مجموعة المنتخب كاملة (لتظليل صفّه) — null قبل اعتماد القرعة/الجداول
    let group: WCGroup?
    let fixtures: [WCFixture]
    let squad: [WCSquadPlayer]
    /// إثراء TheSports — قد تكون null جميعها قبل تفعيل المزود
    let extra: WCTeamExtra?
    let fifaRank: WCFifaRank?
    let injuries: [WCInjury]?
    let seasonStats: WCTeamSeasonStats?
    let coachInfo: WCCoachInfo?
    let venue: WCVenueInfo?
}

// MARK: - بطاقة اللاعب الشاملة (/world-cup/player/:id)

nonisolated struct WCPlayerCareerStop: Decodable, Identifiable, Hashable {
    let teamId: Int
    let team: String
    let logo: String
    let seasons: [Int]

    var id: String { "\(teamId)-\(team)" }

    /// [2019..2025] → "2019–2025"، وموسم واحد يُعرض مفردًا
    var seasonsLabel: String {
        guard let first = seasons.first, let last = seasons.last else { return "" }
        return first == last ? "\(first)" : "\(first)–\(last)"
    }
}

nonisolated struct WCPlayerTrophy: Decodable, Identifiable, Hashable {
    let competition: String
    let country: String
    let season: String
    let place: String
    let winner: Bool

    var id: String { "\(competition)-\(country)-\(season)-\(place)" }
}

nonisolated struct WCPlayerTournamentStats: Decodable, Hashable {
    let matches: Int
    let lineups: Int
    let minutes: Int
    let rating: Double?
    let goals: Int
    let assists: Int
    let shots: Int
    let shotsOn: Int
    let passes: Int
    let keyPasses: Int
    let dribblesAttempts: Int
    let dribblesSuccess: Int
    let tackles: Int
    let yellow: Int
    let red: Int
    let saves: Int
    let conceded: Int
    let penaltiesScored: Int
    let penaltiesMissed: Int
}

nonisolated struct WCPlayerInjury: Decodable, Hashable {
    let reason: String
}

nonisolated struct WCPlayerCard: Decodable, Hashable {
    let id: Int
    let name: String
    /// الاسم الرسمي الكامل — null عندما لا يضيف شيئًا على الاسم المعروض
    let fullName: String?
    let photo: String
    let position: String
    let positionEn: String
    let number: Int?
    let age: Int?
    let birthDate: String?
    /// "الرياض، السعودية" — جاهز للعرض من الخادم
    let birthPlace: String?
    let height: Int?
    let weight: Int?
    let career: [WCPlayerCareerStop]
    let trophies: [WCPlayerTrophy]
    /// أرقام اللاعب التراكمية في مونديال 2026 — null قبل اعتماد المزود لها
    let stats: WCPlayerTournamentStats?
    let injury: WCPlayerInjury?
}

// MARK: - شجرة الأدوار الإقصائية (/world-cup/bracket)
//
// يبني الخادم الشجرة من المباريات (دور 32 → النهائي + مباراة المركز الثالث).
// قبل اعتماد القرعة قد تصل الجولات فارغة فيُخفى القسم تلقائيًا.

nonisolated struct WCBracketRound: Decodable, Identifiable, Hashable {
    let round: String
    let roundEn: String
    let matches: [WCFixture]

    var id: String { roundEn }
}

nonisolated struct WCBracket: Decodable, Hashable {
    let source: String
    let rounds: [WCBracketRound]
}

// MARK: - أخبار المونديال (/world-cup/news)
//
// مصدرها جدول المقالات (مولّدة آليًا + تحريرية). الـ slug يفتح المقال داخل
// التطبيق عبر ArticleSlugRoute. home/away اسم+شعار فقط (لبطاقة المباراة).

nonisolated struct WCNewsSide: Decodable, Hashable {
    let name: String
    let logo: String
}

nonisolated struct WCNewsFocalPoint: Decodable, Hashable {
    let x: Double
    let y: Double
}

nonisolated struct WCNewsItem: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let slug: String
    let excerpt: String?
    let imageUrl: String?
    let imageFocalPoint: WCNewsFocalPoint?
    let publishedAt: String?
    /// "preview" (ما قبل المباراة) | "report" (تقرير) | "news"
    let kind: String
    let fixtureId: Int?
    let home: WCNewsSide?
    let away: WCNewsSide?

    var publishedDate: Date? { publishedAt.flatMap { SabqFormatters.parseISO8601($0) } }
}

// MARK: - حقائق البطولة (/world-cup/facts)
//
// حامل اللقب + الأكثر تتويجًا + الدول المضيفة. كل الحقول قد تكون null قبل
// اعتماد المزود لها فيُخفى القسم/البطاقة المعنيّة دون أثر.

nonisolated struct WCMostTitles: Decodable, Hashable {
    let teams: [WCTeam]
    let count: Int
}

nonisolated struct WCCompetitionFacts: Decodable, Hashable {
    let defendingChampion: WCTeam?
    let defendingChampionTitles: Int?
    let mostTitles: WCMostTitles?
    let host: String?

    /// هل توجد أي حقيقة لعرضها أصلًا؟ (يُخفى القسم كاملًا إن لا)
    var hasContent: Bool {
        defendingChampion != nil || mostTitles != nil || (host?.isEmpty == false)
    }
}

// MARK: - Response envelopes

private nonisolated struct WCFixturesResponse: Decodable { let fixtures: [WCFixture] }
private nonisolated struct WCStandingsResponse: Decodable { let groups: [WCGroup] }
private nonisolated struct WCScorersResponse: Decodable { let scorers: [WCScorer] }
private nonisolated struct WCLeadersResponse: Decodable { let leaders: [WCLeader] }
private nonisolated struct WCTeamsResponse: Decodable { let teams: [WCTeam] }
private nonisolated struct WCNewsResponse: Decodable { let news: [WCNewsItem] }

// MARK: - APIClient — World Cup reads
//
// كل النقاط عامة (لا مصادقة) فتُمرَّر عبر apiRoot=publicAPI بدل
// الافتراضي mobileAPI(/api/v1). الكاش على الخادم يخدم آلاف الزوار من طلب
// واحد، لذا لا نضيف كاشًا محليًا غير افتراضي URLSession.

extension APIClient {
    func fetchWorldCupOverview(ignoreCache: Bool = false) async throws -> WCOverview {
        try await get(WCOverview.self, path: "/world-cup/overview",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupFixtures(ignoreCache: Bool = false) async throws -> [WCFixture] {
        try await get(WCFixturesResponse.self, path: "/world-cup/fixtures",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).fixtures
    }

    func fetchWorldCupStandings(ignoreCache: Bool = false) async throws -> [WCGroup] {
        try await get(WCStandingsResponse.self, path: "/world-cup/standings",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).groups
    }

    func fetchWorldCupScorers(ignoreCache: Bool = false) async throws -> [WCScorer] {
        try await get(WCScorersResponse.self, path: "/world-cup/scorers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).scorers
    }

    func fetchWorldCupAssists() async throws -> [WCLeader] {
        try await get(WCLeadersResponse.self, path: "/world-cup/assists",
                      apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchWorldCupCards() async throws -> [WCLeader] {
        try await get(WCLeadersResponse.self, path: "/world-cup/cards",
                      apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchWorldCupTeams() async throws -> [WCTeam] {
        try await get(WCTeamsResponse.self, path: "/world-cup/teams",
                      apiRoot: URLConstants.publicAPI).teams
    }

    func fetchWorldCupBracket(ignoreCache: Bool = false) async throws -> WCBracket {
        try await get(WCBracket.self, path: "/world-cup/bracket",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupNews(limit: Int = 8) async throws -> [WCNewsItem] {
        try await get(WCNewsResponse.self, path: "/world-cup/news",
                      query: ["limit": String(limit)],
                      apiRoot: URLConstants.publicAPI).news
    }

    func fetchWorldCupFacts(ignoreCache: Bool = false) async throws -> WCCompetitionFacts {
        try await get(WCCompetitionFacts.self, path: "/world-cup/facts",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupSquad(teamId: Int) async throws -> WCSquad {
        try await get(WCSquad.self, path: "/world-cup/squad/\(teamId)",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupTeamProfile(teamId: Int, ignoreCache: Bool = false) async throws -> WCTeamProfile {
        try await get(WCTeamProfile.self, path: "/world-cup/team/\(teamId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupMatch(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCMatchDetail {
        try await get(WCMatchDetail.self, path: "/world-cup/match/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupPlayer(playerId: Int) async throws -> WCPlayerCard {
        try await get(WCPlayerCard.self, path: "/world-cup/player/\(playerId)",
                      apiRoot: URLConstants.publicAPI)
    }

    // معطيات SportMonks المتقدّمة — كلها عامة وأفضل جهد

    func fetchWorldCupPressure(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCPressure {
        try await get(WCPressure.self, path: "/world-cup/pressure/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupForecast(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCForecast {
        try await get(WCForecast.self, path: "/world-cup/forecast/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupMatchFacts(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCMatchFacts {
        try await get(WCMatchFacts.self, path: "/world-cup/match-facts/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupXg(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCXg {
        try await get(WCXg.self, path: "/world-cup/xg/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupPulse(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCPulse {
        try await get(WCPulse.self, path: "/world-cup/pulse/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupPlayerForm(playerId: Int) async throws -> WCPlayerForm {
        try await get(WCPlayerForm.self, path: "/world-cup/player/\(playerId)/form",
                      apiRoot: URLConstants.publicAPI)
    }

    // مسابقة التوقّعات — مسارات الموبايل (Bearer) عبر mobileAPI
    func fetchWCPredictionsToday(ignoreCache: Bool = false) async throws -> [WCPredictableMatch] {
        try await get(WCPredTodayResponse.self, path: "/world-cup/predictions/today",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI).matches
    }

    @discardableResult
    func submitWCPrediction(fixtureId: Int, predHome: Int, predAway: Int) async throws -> WCSubmittedPrediction {
        try await post(WCPredSubmitResponse.self, path: "/world-cup/predictions",
                       body: WCPredictionSubmitBody(fixtureId: fixtureId, predHome: predHome, predAway: predAway),
                       apiRoot: URLConstants.mobileAPI).prediction
    }

    func fetchWCMyPredictions() async throws -> [WCPredictionHistoryItem] {
        try await get(WCPredMineResponse.self, path: "/world-cup/predictions/mine",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI).predictions
    }

    func fetchWCLeaderboard() async throws -> [WCPredLeader] {
        try await get(WCLeaderboardResponse.self, path: "/world-cup/predictions/leaderboard",
                      apiRoot: URLConstants.mobileAPI).leaders
    }

    func fetchWCLongPredictions(ignoreCache: Bool = false) async throws -> WCLongData {
        try await get(WCLongData.self, path: "/world-cup/predictions/long",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI)
    }

    @discardableResult
    func submitWCLongPrediction(kind: String, teamId: Int? = nil, playerId: Int? = nil) async throws -> Bool {
        try await post(WCLongSubmitResponse.self, path: "/world-cup/predictions/long",
                       body: WCLongSubmitBody(kind: kind, teamId: teamId, playerId: playerId),
                       apiRoot: URLConstants.mobileAPI).ok
    }

    func fetchWorldCupPlayerMarket(playerId: Int) async throws -> WCPlayerMarket {
        try await get(WCPlayerMarket.self, path: "/world-cup/player/\(playerId)/market",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupCommentary(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCCommentary {
        try await get(WCCommentary.self, path: "/world-cup/commentary/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupMomentum(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCMomentum {
        try await get(WCMomentum.self, path: "/world-cup/momentum/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupTv(fixtureId: Int) async throws -> WCTvListing {
        try await get(WCTvListing.self, path: "/world-cup/match/\(fixtureId)/tv",
                      apiRoot: URLConstants.publicAPI)
    }
}

// MARK: - World Cup shared helpers (theme, formatting, navigation)

// ثيم المونديال — أزرق ملكي + ذهبي، تكيّفي (فاتح افتراضيًا، ليلي تلقائيًا).
//
// التصميم: جسم الصفحة والبطاقات القياسية والنصوص «تكيّفية» تتبع نمط النظام؛
// والبطاقات المميّزة (الهيرو، مشوار الأخضر، نبض المباراة) + الملعب تبقى أزرق
// داكن ثابت في الوضعين (نصوصها بيضاء). الرموز ديناميكية فتتبعها كل المكوّنات
// تلقائيًا دون تمرير البيئة لكل موضع (UIColor يُحَل وقت العرض حسب الـ trait).
nonisolated enum WCTheme {
    static let saudiId = 23

    /// لون يتبدّل تلقائيًا مع نمط النظام (فاتح/داكن) — (r,g,b,a) لكل وضع.
    private static func dyn(
        _ light: (CGFloat, CGFloat, CGFloat, CGFloat),
        _ dark: (CGFloat, CGFloat, CGFloat, CGFloat)
    ) -> Color {
        Color(uiColor: UIColor { tc in
            let c = tc.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
        })
    }

    // ── علامة المونديال: أخضر زمردي + ذهبي (هوية الملعب) ──
    static let royal = Color(red: 0.06, green: 0.50, blue: 0.33)   // الأخضر الأساسي (الاسم تاريخي)
    static let azure = Color(red: 0.16, green: 0.74, blue: 0.48)   // أخضر ساطع (إبراز/مباشر)
    static let liveRed = Color(red: 0.93, green: 0.26, blue: 0.30)
    static let sky = Color(red: 0.18, green: 0.70, blue: 0.60)     // تركوازي (سلسلة ثانية/الضيف)
    static let gold = Color(red: 0.96, green: 0.72, blue: 0.20)    // ذهبي (تتويج/تمييز)
    static let leaf = Color(red: 0.45, green: 0.78, blue: 0.30)    // أخضر فاتح «إيجابي» (تقييم جيد)

    static let emerald = azure // تعبئة/إبراز ساطع
    // نص/أيقونة/تعبئة-علامة تكيّفية: أخضر غامق على الفاتح، أخضر فاتح على الليلي —
    // يصلح نصًّا على البطاقات وتعبئةً بنصٍّ أبيض على السواء.
    static let emeraldDeep = dyn((0.04, 0.42, 0.28, 1), (0.22, 0.80, 0.52, 1))

    // ── الهيرو + شريط التنقّل: تدرّج أخضر زمردي حيّ ──
    // أعلى أغمق قليلًا لوضوح أيقونات الحالة البيضاء، وأسفل أخضر أسطع؛ نصوصه بيضاء.
    static let heroTop = Color(red: 0.03, green: 0.34, blue: 0.22)
    static let heroBottom = Color(red: 0.08, green: 0.56, blue: 0.36)

    // ── البطاقات المميّزة/الملعب: أخضر داكن ثابت (نصوصها بيضاء) ──
    static let stadiumTop = Color(red: 0.03, green: 0.18, blue: 0.12)
    static let stadiumBottom = Color(red: 0.05, green: 0.28, blue: 0.18)
    static let pitchTop = Color(red: 0.06, green: 0.34, blue: 0.20)
    static let pitchBottom = Color(red: 0.04, green: 0.22, blue: 0.13)

    // ── أسطح/نصوص تكيّفية (فاتح افتراضيًا، ليلي تلقائيًا) ──
    static let onDark = dyn((0.06, 0.13, 0.10, 1), (1, 1, 1, 1))       // نص أساسي
    static let onDarkDim = dyn((0.36, 0.46, 0.42, 1), (1, 1, 1, 0.62)) // نص ثانوي
    static let card = dyn((1, 1, 1, 1), (1, 1, 1, 0.06))              // سطح بطاقة
    static let cardStroke = dyn((0.04, 0.42, 0.28, 0.12), (1, 1, 1, 0.10))
    // ظل البطاقات: خفيف في الفاتح ليرفعها عن الخلفية الخضراء، ومعدوم في الليلي
    static let cardShadow = dyn((0.04, 0.20, 0.13, 0.10), (0, 0, 0, 0))
    static let chipFill = dyn((0.10, 0.55, 0.35, 0.08), (1, 1, 1, 0.10))

    /// خلفية القسم — أخضر خفيف جدًا في الفاتح، وأخضر داكن في الليلي.
    /// لا كتلة داكنة خلف الهيرو؛ المحتوى يجلس مباشرة على هذه الخلفية الخفيفة.
    static var sectionBackground: LinearGradient {
        LinearGradient(
            colors: [
                dyn((0.91, 0.97, 0.93, 1), (0.03, 0.12, 0.08, 1)),
                dyn((0.94, 0.98, 0.95, 1), (0.04, 0.16, 0.11, 1)),
                dyn((0.91, 0.97, 0.93, 1), (0.03, 0.12, 0.08, 1)),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }
}

extension View {
    /// سطح بطاقة مرتفع: أبيض في الفاتح مع حدّ وظلّ خفيف — يفصل المحتوى
    /// بوضوح عن خلفية القسم الخضراء بدل التدرّجات الخضراء المتقاربة.
    func wcElevatedCard(cornerRadius: CGFloat = 14) -> some View {
        self
            .background(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).fill(WCTheme.card))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).stroke(WCTheme.cardStroke, lineWidth: 1))
            .shadow(color: WCTheme.cardShadow, radius: 6, y: 2)
    }
}

nonisolated enum WCFormat {
    /// "1:00 ص" بتوقيت الرياض (12-ساعة عربي بأرقام لاتينية).
    /// ca-gregory ضروري: ar_SA يفترض التقويم الهجري افتراضيًا.
    static let timeRiyadh: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "h:mm a"
        return f
    }()

    /// "الأحد، 14 يونيو" (ميلادي — ca-gregory يمنع التحول للهجري)
    static let dayRiyadh: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "EEEE، d MMMM"
        return f
    }()

    static func time(_ fixture: WCFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return timeRiyadh.string(from: d)
    }

    static func day(_ fixture: WCFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return dayRiyadh.string(from: d)
    }

    /// مفتاح اليوم بتوقيت الرياض من سلسلة ISO (تصل بإزاحة +03:00 فالقص مباشر)
    static func dayKey(_ iso: String) -> String { String(iso.prefix(10)) }

    static func todayKey() -> String {
        let riyadh = Date().addingTimeInterval(3 * 3600)
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: riyadh)
    }

    /// عدّ تنازلي عربي سليم: يوم/يومين/3 أيام، ساعة/ساعتين، أو HH:MM:SS في آخر يوم
    static func countdown(to timestamp: Int) -> String {
        let total = max(0, Double(timestamp) - Date().timeIntervalSince1970)
        let days = Int(total) / 86_400
        let hours = (Int(total) % 86_400) / 3_600
        let minutes = (Int(total) % 3_600) / 60
        let seconds = Int(total) % 60
        if days == 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        }
        let d = arabicDays(days)
        return hours > 0 ? "\(d) و\(arabicHours(hours))" : d
    }

    static func arabicDays(_ n: Int) -> String {
        switch n {
        case 1: return "يوم"
        case 2: return "يومين"
        case 3...10: return "\(n) أيام"
        default: return "\(n) يومًا"
        }
    }

    static func arabicHours(_ n: Int) -> String {
        switch n {
        case 1: return "ساعة"
        case 2: return "ساعتين"
        case 3...10: return "\(n) ساعات"
        default: return "\(n) ساعة"
        }
    }
}

/// مسار التنقل لقسم كأس العالم
nonisolated struct WorldCupRoute: Hashable {}
