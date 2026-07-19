import SwiftUI

// صبغة المونديال تتبع لون التطبيق المحوري؛ البطولات لا تعيد صبغ الشاشة.
private var wcAccent: Color { SpTheme.compAccent("world-cup") }

// MARK: - نماذج ومسارات كأس العالم + شجرة خروج المغلوب
//
// كان هذا الملف يضم شاشة «المباريات» القديمة (جدول المونديال) ومركز مباراته
// WcMatchCenter — حلّ محلّهما MatchesCenterView وSpMatchCenter الموحّدان،
// فحُذفت الواجهات الميتة (~2400 سطر) وبقي هنا ما يُستهلك فعليًّا من بقية
// التطبيق: نماذج المونديال (SpWc*)، امتداد SpFixture(worldCup:)، مسارات
// /world-cup في APIClient، امتداد VaraTeamStrength(wcRow:)، وواجهتا شجرة
// خروج المغلوب (تُعرضان في تفاصيل البطولة ومركز المباريات).
// (اسم الملف محفوظ لتفادي مساس pbxproj.)

// MARK: نموذج مباريات المونديال (يطابق WcFixture في الخادم)

nonisolated struct SpWcFixturesResponse: Decodable { let fixtures: [SpWcFixture] }

nonisolated struct SpWcFixture: Decodable, Identifiable {
    let id: Int
    let date: String
    let timestamp: Double
    let status: SpWcStatus
    let round: String
    let roundEn: String
    let venue: SpWcVenue?
    let home: SpWcTeam
    let away: SpWcTeam
    let goals: SpWcScore
    let penalties: SpWcScore?
    let matchNo: Int?
    let homeCode: String?
    let awayCode: String?
}

nonisolated struct SpWcVenue: Decodable { let name: String; let city: String }

nonisolated struct SpWcStatus: Decodable {
    let code: String
    let label: String
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct SpWcTeam: Decodable {
    let id: Int
    let name: String
    let logo: String
    let winner: Bool?
}

nonisolated struct SpWcScore: Decodable { let home: Int?; let away: Int? }

extension SpFixture {
    nonisolated init(worldCup f: SpWcFixture) {
        self.init(
            id: f.id,
            date: f.date,
            timestamp: Int(f.timestamp),
            status: SpStatus(
                code: f.status.code,
                label: f.status.label,
                elapsed: f.status.elapsed,
                extra: f.status.extra,
                live: f.status.live,
                finished: f.status.finished
            ),
            round: f.round,
            venue: SpVenue(name: f.venue?.name ?? "", city: f.venue?.city ?? ""),
            home: SpTeam(id: f.home.id, name: f.home.name, logo: f.home.logo, winner: f.home.winner),
            away: SpTeam(id: f.away.id, name: f.away.name, logo: f.away.logo, winner: f.away.winner),
            goals: SpScore(home: f.goals.home, away: f.goals.away),
            penalties: f.penalties.map { SpScore(home: $0.home, away: $0.away) },
            competition: "كأس العالم",
            competitionSlug: "world-cup"
        )
    }
}

nonisolated struct SpWcStandingsResponse: Decodable { let groups: [SpWcGroup] }
nonisolated struct SpWcGroup: Decodable, Identifiable {
    let group: String
    let groupEn: String
    let rows: [SpWcStandingRow]
    var id: String { groupEn }
}

nonisolated struct SpWcStandingRow: Decodable, Identifiable {
    let rank: Int
    let team: SpWcTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    let form: String?
    let live: Bool?
    let liveDelta: Int?
    var id: Int { team.id }
}

nonisolated struct SpWcBracket: Decodable {
    let source: String?
    let rounds: [SpWcBracketRound]
    let tree: SpWcBracketTree?
}

nonisolated struct SpWcBracketTree: Decodable {
    let columns: [SpWcBracketColumn]
    let thirdPlace: SpWcFixture?
    let hasAny: Bool?
}

nonisolated struct SpWcBracketColumn: Decodable, Identifiable {
    let key: String
    let label: String
    let roundIndex: Int
    let slots: [SpWcBracketSlot]
    var id: String { key }
}

nonisolated struct SpWcBracketSlot: Decodable, Identifiable {
    let matchNo: Int
    let fixture: SpWcFixture?
    let sources: [Int]?
    let topTeam: SpWcTeam?
    let bottomTeam: SpWcTeam?
    let topLabel: String?
    let bottomLabel: String?
    var id: Int { matchNo }

    func resolvedHome(from fx: SpWcFixture?) -> (team: SpWcTeam?, label: String) {
        let side = fx?.home
        if let t = side, t.id > 0, !t.logo.isEmpty { return (t, t.name) }
        if let t = topTeam, t.id > 0, !t.logo.isEmpty { return (t, t.name) }
        if let code = fx?.homeCode { return (nil, code) }
        return (nil, topLabel ?? "TBD")
    }

    func resolvedAway(from fx: SpWcFixture?) -> (team: SpWcTeam?, label: String) {
        let side = fx?.away
        if let t = side, t.id > 0, !t.logo.isEmpty { return (t, t.name) }
        if let t = bottomTeam, t.id > 0, !t.logo.isEmpty { return (t, t.name) }
        if let code = fx?.awayCode { return (nil, code) }
        return (nil, bottomLabel ?? "TBD")
    }
}

nonisolated struct SpWcBracketRound: Decodable, Identifiable {
    let round: String
    let roundEn: String
    let matches: [SpWcFixture]
    var id: String { roundEn }
}

nonisolated struct SpWcScorersResponse: Decodable { let scorers: [SpWcScorer] }
nonisolated struct SpWcLeadersResponse: Decodable { let leaders: [SpWcLeader] }

nonisolated struct SpWcScorer: Decodable, Identifiable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let team: SpWcTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let minutes: Int
    let matches: Int
}

nonisolated struct SpWcLeader: Decodable, Identifiable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let team: SpWcTeam
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let minutes: Int
    let matches: Int
}

// تفاصيل مباراة المونديال (/world-cup/match/:id) — الأسماء عربية ومُوحّدة بالمعرّف.
nonisolated struct SpWcMatchDetail: Decodable {
    let fixture: SpWcFixture
    let events: [SpWcEvent]
    let lineups: [SpWcLineup]
    let statistics: [SpWcStat]
    let ratings: [SpWcRating]
    let manOfTheMatch: SpWcRating?
    let prediction: SpWcPrediction?
    let headToHead: [SpWcFixture]?
}

nonisolated struct SpWcPrediction: Decodable { let home: Int?; let draw: Int?; let away: Int? }

nonisolated struct SpWcEvent: Decodable, Identifiable {
    let minute: Int
    let extraMinute: Int?
    let teamId: Int
    let type: String      // goal / yellow-card / red-card / substitution / var / missed-penalty
    let label: String
    let detail: String
    let player: String
    let assist: String?
    var id: String { "\(minute)-\(extraMinute ?? 0)-\(teamId)-\(type)-\(player)" }
}

nonisolated struct SpWcLineupPlayer: Decodable, Identifiable {
    let id: Int
    let name: String
    let number: Int?
    let position: String?
    let grid: String?
}

nonisolated struct SpWcLineup: Decodable, Identifiable {
    let teamId: Int
    let teamName: String
    let formation: String?
    let coach: String
    let startXI: [SpWcLineupPlayer]
    let substitutes: [SpWcLineupPlayer]
    var id: Int { teamId }
}

nonisolated struct SpWcStat: Decodable, Identifiable {
    let key: String
    let label: String
    let home: String
    let away: String
    var id: String { key }
}

nonisolated struct SpWcRating: Decodable, Identifiable {
    let id: Int
    let name: String
    let photo: String
    let teamId: Int
    let number: Int?
    let position: String?
    let rating: Double
    let goals: Int?
    let assists: Int?
    let captain: Bool?
}

extension APIClient {
    /// كل مباريات كأس العالم (الجدول الكامل) — نقطة عامة على البوابة.
    func fetchWorldCupFixtures(ignoreCache: Bool = false) async throws -> SpWcFixturesResponse {
        try await get(SpWcFixturesResponse.self, path: "/world-cup/fixtures",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupStandings(ignoreCache: Bool = false) async throws -> SpWcStandingsResponse {
        try await get(SpWcStandingsResponse.self, path: "/world-cup/standings",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupBracket(ignoreCache: Bool = false) async throws -> SpWcBracket {
        try await get(SpWcBracket.self, path: "/world-cup/bracket",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupScorers(ignoreCache: Bool = false) async throws -> SpWcScorersResponse {
        try await get(SpWcScorersResponse.self, path: "/world-cup/scorers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupAssists(ignoreCache: Bool = false) async throws -> SpWcLeadersResponse {
        try await get(SpWcLeadersResponse.self, path: "/world-cup/assists",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupCards(ignoreCache: Bool = false) async throws -> SpWcLeadersResponse {
        try await get(SpWcLeadersResponse.self, path: "/world-cup/cards",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// تفاصيل مباراة مونديال واحدة (أحداث/إحصائيات/تشكيلات/تقييمات).
    func fetchWorldCupMatch(id: Int, ignoreCache: Bool = false) async throws -> SpWcMatchDetail {
        try await get(SpWcMatchDetail.self, path: "/world-cup/match/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// إثراء مركز مباراة كأس العالم — نفس بنية مركز روشن، لكن من مسارات المونديال.
    func fetchWorldCupXg(id: Int, ignoreCache: Bool = false) async throws -> SpXg {
        try await get(SpXg.self, path: "/world-cup/xg/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchWorldCupMomentum(id: Int, ignoreCache: Bool = false) async throws -> SpMomentum {
        try await get(SpMomentum.self, path: "/world-cup/momentum/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchWorldCupPressure(id: Int, ignoreCache: Bool = false) async throws -> SpPressure {
        try await get(SpPressure.self, path: "/world-cup/pressure/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchWorldCupMatchFacts(id: Int, ignoreCache: Bool = false) async throws -> SpMatchFacts {
        try await get(SpMatchFacts.self, path: "/world-cup/match-facts/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchWorldCupCommentary(id: Int, ignoreCache: Bool = false) async throws -> SpCommentary {
        try await get(SpCommentary.self, path: "/world-cup/commentary/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
}

extension VaraTeamStrength {
    /// قوّة منتخب من صفّ ترتيب المجموعة (كأس العالم).
    nonisolated init(wcRow r: SpWcStandingRow) {
        self.init(played: r.played, points: r.points,
                  goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
                  form: r.form, rank: r.rank)
    }
}

// MARK: - شجرة خروج المغلوب (FIFA 73–104)

struct SpWcBracketTreeView: View {
    let tree: SpWcBracketTree

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(L("من دور الـ32 حتى النهائي"))
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(wcAccent)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(tree.columns) { col in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(col.label)
                                .font(SportsFonts.app(size: 12, weight: .heavy))
                                .foregroundStyle(SpTheme.onDark)
                                .frame(maxWidth: .infinity, alignment: .center)
                            ForEach(col.slots) { slot in
                                SpWcBracketSlotCard(slot: slot, isFinal: col.key == "final")
                            }
                        }
                        .frame(width: 168)
                    }
                }
                .padding(.vertical, 4)
            }

            if let third = tree.thirdPlace {
                VStack(alignment: .leading, spacing: 8) {
                    Text(L("المركز الثالث"))
                        .font(SportsFonts.app(size: 12, weight: .heavy))
                        .foregroundStyle(SpTheme.gold)
                    SpWcBracketSlotCard(
                        slot: SpWcBracketSlot(
                            matchNo: 103,
                            fixture: third,
                            sources: nil,
                            topTeam: nil,
                            bottomTeam: nil,
                            topLabel: nil,
                            bottomLabel: nil
                        ),
                        isFinal: false
                    )
                }
            }
        }
    }
}

struct SpWcBracketSlotCard: View {
    let slot: SpWcBracketSlot
    let isFinal: Bool

    private var fx: SpWcFixture? { slot.fixture }
    private var homeResolved: (team: SpWcTeam?, label: String) { slot.resolvedHome(from: fx) }
    private var awayResolved: (team: SpWcTeam?, label: String) { slot.resolvedAway(from: fx) }

    var body: some View {
        Group {
            if let fx {
                NavigationLink {
                    SpMatchCenter(fixtureId: fx.id, preview: SpFixture(worldCup: fx))
                } label: {
                    cardContent
                }
                .buttonStyle(SpPressStyle())
            } else {
                cardContent
            }
        }
    }

    private var cardContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(statusText)
                    .font(SportsFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                Spacer(minLength: 0)
                Text(isFinal ? L("النهائي") : Lf("مباراة %d", slot.matchNo))
                    .font(SportsFonts.app(size: 10, weight: .bold))
                    .foregroundStyle(wcAccent)
                    .monospacedDigit()
            }
            bracketTeamLine(homeResolved, goals: fx?.goals.home, finished: fx?.status.finished == true)
            bracketTeamLine(awayResolved, goals: fx?.goals.away, finished: fx?.status.finished == true)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    private var statusText: String {
        guard let fx else { return L("بانتظار التأهل") }
        if fx.status.live { return L("مباشرة") }
        if fx.status.finished { return L("انتهت") }
        if fx.status.code != "TBD", fx.timestamp > 0 { return SpFormat.kickoffTime(fx.date) }
        return L("قريبًا")
    }

    private func bracketTeamLine(_ resolved: (team: SpWcTeam?, label: String), goals: Int?, finished: Bool) -> some View {
        HStack(spacing: 8) {
            if let team = resolved.team, team.id > 0, !team.logo.isEmpty {
                SpTeamLogo(logo: team.logo, size: 20)
            } else {
                Circle()
                    .stroke(SpTheme.outline, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                    .frame(width: 20, height: 20)
                    .overlay {
                        Text("?")
                            .font(SportsFonts.app(size: 9, weight: .bold))
                            .foregroundStyle(SpTheme.onDarkFaint)
                    }
            }
            Text(resolved.label)
                .font(SportsFonts.app(size: 11, weight: resolved.team == nil ? .semibold : .bold))
                .foregroundStyle(resolved.team == nil ? SpTheme.onDarkDim : SpTheme.onDark)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            if finished, let goals {
                Text("\(goals)")
                    .font(SportsFonts.app(size: 12, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .monospacedDigit()
            }
        }
    }
}
