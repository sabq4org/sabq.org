package com.sabq.smart.feature.worldcup

import kotlinx.serialization.Serializable

/**
 * نماذج كأس العالم 2026 — مرآة لما ترسله /api/world-cup/… (مُعرَّبة من الخادم).
 * الـ JSON بصيغة camelCase نظيفة؛ تُستخدم هذه الأنواع مباشرة في الواجهة.
 * الحقول التي قد تكون null اختيارية بقيم افتراضية (Json: explicitNulls=false,
 * coerceInputValues=true). مطابق 1:1 لأنواع iOS (WCFixture, WCOverview, ...).
 */

@Serializable
data class WcTeam(
    val id: Int = 0,
    val name: String = "",
    val logo: String = "",
    val winner: Boolean? = null,
)

@Serializable
data class WcStatus(
    val code: String = "",
    val label: String = "",
    val elapsed: Int? = null,
    val extra: Int? = null,
    val live: Boolean = false,
    val finished: Boolean = false,
)

@Serializable
data class WcScore(
    val home: Int? = null,
    val away: Int? = null,
)

@Serializable
data class WcVenue(
    val name: String = "",
    val city: String = "",
)

@Serializable
data class WcFixture(
    val id: Int = 0,
    val date: String = "",
    val timestamp: Int = 0,
    val status: WcStatus = WcStatus(),
    val round: String = "",
    val roundEn: String = "",
    val venue: WcVenue = WcVenue(),
    val home: WcTeam = WcTeam(),
    val away: WcTeam = WcTeam(),
    val goals: WcScore = WcScore(),
    val penalties: WcScore? = null,
) {
    val started: Boolean get() = status.live || status.finished
}

/**
 * نتيجة ركلات الترجيح مع تحديد الفائز. النتيجة مرتّبة دائمًا «الفائز أولًا»
 * (winnerScore > loserScore) كي لا تنقلب بصريًّا في سياق RTL. المصدر موثوق:
 * penalties.home للمضيف وpenalties.away للضيف (نفس ربط الأهداف). null إن لم
 * تُحسم بالترجيح. لا نعتمد على team.winner لأن المزوّد قد يتركه فارغًا هنا.
 */
data class WcPenaltyOutcome(
    val winnerName: String,
    val winnerScore: Int,
    val loserScore: Int,
    val winnerHome: Boolean,
)

val WcFixture.penaltyOutcome: WcPenaltyOutcome?
    get() {
        val p = penalties ?: return null
        val h = p.home ?: return null
        val a = p.away ?: return null
        if (h == a) return null
        val homeWon = h > a
        return WcPenaltyOutcome(
            winnerName = if (homeWon) home.name else away.name,
            winnerScore = if (homeWon) h else a,
            loserScore = if (homeWon) a else h,
            winnerHome = homeWon,
        )
    }

@Serializable
data class WcPrediction(
    val home: Int = 0,
    val draw: Int = 0,
    val away: Int = 0,
    val advice: String? = null,
)

@Serializable
data class WcMatchOfDay(
    val fixture: WcFixture = WcFixture(),
    val prediction: WcPrediction? = null,
)

@Serializable
data class WcStandingRow(
    val rank: Int = 0,
    val team: WcTeam = WcTeam(),
    val played: Int = 0,
    val win: Int = 0,
    val draw: Int = 0,
    val lose: Int = 0,
    val goalsFor: Int = 0,
    val goalsAgainst: Int = 0,
    val goalsDiff: Int = 0,
    val points: Int = 0,
    val form: String? = null,
)

@Serializable
data class WcGroup(
    val group: String = "",
    val groupEn: String = "",
    val rows: List<WcStandingRow> = emptyList(),
)

@Serializable
data class WcSaudi(
    val next: WcFixture? = null,
    val fixtures: List<WcFixture> = emptyList(),
    val group: WcGroup? = null,
)

@Serializable
data class WcOverview(
    val live: List<WcFixture> = emptyList(),
    val today: List<WcFixture> = emptyList(),
    val matchOfTheDay: WcMatchOfDay? = null,
    val saudi: WcSaudi = WcSaudi(),
    val updatedAt: String = "",
)

@Serializable
data class WcScorer(
    val rank: Int = 0,
    /** معرّف اللاعب عند المزود — يفتح بطاقة اللاعب؛ 0 = غير معروف */
    val id: Int = 0,
    val name: String = "",
    val photo: String = "",
    val team: WcTeam = WcTeam(),
    val goals: Int = 0,
    val assists: Int = 0,
    val penalties: Int = 0,
    val minutes: Int = 0,
    val matches: Int = 0,
)

@Serializable
data class WcLeader(
    val rank: Int = 0,
    /** معرّف اللاعب عند المزود — يفتح بطاقة اللاعب؛ 0 = غير معروف */
    val id: Int = 0,
    val name: String = "",
    val photo: String = "",
    val team: WcTeam = WcTeam(),
    val goals: Int = 0,
    val assists: Int = 0,
    val yellow: Int = 0,
    val red: Int = 0,
    val minutes: Int = 0,
    val matches: Int = 0,
)

@Serializable
data class WcMatchEvent(
    val minute: Int = 0,
    val extraMinute: Int? = null,
    val teamId: Int = 0,
    val type: String = "",
    val label: String = "",
    val player: String = "",
    val playerId: Int? = null,
    val assist: String? = null,
    val assistId: Int? = null,
)

@Serializable
data class WcLineupPlayer(
    val id: Int = 0,
    val name: String = "",
    val number: Int? = null,
    val position: String? = null,
    val grid: String? = null,
)

@Serializable
data class WcLineup(
    val teamId: Int = 0,
    val teamName: String = "",
    val formation: String? = null,
    val coach: String = "",
    val startXI: List<WcLineupPlayer> = emptyList(),
    val substitutes: List<WcLineupPlayer> = emptyList(),
)

@Serializable
data class WcStatistic(
    val key: String = "",
    val label: String = "",
    val home: String = "",
    val away: String = "",
)

@Serializable
data class WcPlayerRating(
    val id: Int = 0,
    val name: String = "",
    val photo: String = "",
    val teamId: Int = 0,
    val number: Int? = null,
    val position: String = "",
    val rating: Double = 0.0,
    val minutes: Int = 0,
    val goals: Int = 0,
    val assists: Int = 0,
    val captain: Boolean = false,
)

@Serializable
data class WcMatchDetail(
    val fixture: WcFixture = WcFixture(),
    val events: List<WcMatchEvent> = emptyList(),
    val lineups: List<WcLineup> = emptyList(),
    val statistics: List<WcStatistic> = emptyList(),
    val prediction: WcPrediction? = null,
    val ratings: List<WcPlayerRating> = emptyList(),
    val manOfTheMatch: WcPlayerRating? = null,
    val headToHead: List<WcFixture> = emptyList(),
)

// ---------- إثراء مركز المباراة (نقاط أفضل-جهد عبر sabq.org) ----------
// كلّها اختيارية: لو رجع الخادم 404/503 يفشل فكّ الترميز فتبقى القيمة null
// وتُخفى الأقسام دون عطل.

@Serializable
data class WcHalftime(val home: Int = 0, val away: Int = 0)

@Serializable
data class WcWeather(
    val type: String = "",            // actual | forecast
    val temp: Int? = null,
    val description: String = "",
    val icon: String = "",
    val humidity: String? = null,
)

@Serializable
data class WcAbsentee(val name: String = "", val location: String = "", val reason: String = "")

@Serializable
data class WcEventDetail(
    val minute: Int = 0,
    val location: String = "",
    val klass: String = "",
    val detail: String = "",
    val player: String = "",
)

@Serializable
data class WcMatchFacts(
    val available: Boolean = false,
    val statistics: List<WcStatistic> = emptyList(),
    val weather: WcWeather? = null,
    val absentees: List<WcAbsentee> = emptyList(),
    val eventDetails: List<WcEventDetail> = emptyList(),
    val halftime: WcHalftime? = null,
)

@Serializable
data class WcXgSide(val xg: Double = 0.0, val xgot: Double = 0.0)

@Serializable
data class WcXgPlayer(val name: String = "", val location: String = "", val xg: Double = 0.0)

@Serializable
data class WcXg(
    val available: Boolean = false,
    val home: WcXgSide = WcXgSide(),
    val away: WcXgSide = WcXgSide(),
    val topPlayers: List<WcXgPlayer> = emptyList(),
)

@Serializable
data class WcFulltimeOdds(val home: Int = 0, val draw: Int = 0, val away: Int = 0)

@Serializable
data class WcBtts(val yes: Int = 0, val no: Int = 0)

@Serializable
data class WcDoubleChance(val homeOrDraw: Int = 0, val awayOrDraw: Int = 0, val homeOrAway: Int = 0)

@Serializable
data class WcOverUnderLine(val line: Double = 0.0, val over: Int = 0, val under: Int = 0)

@Serializable
data class WcCorrectScore(val score: String = "", val prob: Double = 0.0)

@Serializable
data class WcForecast(
    val available: Boolean = false,
    val fulltime: WcFulltimeOdds? = null,
    val btts: WcBtts? = null,
    val doubleChance: WcDoubleChance? = null,
    val goals: List<WcOverUnderLine> = emptyList(),
    val correctScores: List<WcCorrectScore> = emptyList(),
)

@Serializable
data class WcPressurePoint(
    val label: String = "",
    val minute: Int = 0,
    val home: Double = 0.0,
    val away: Double = 0.0,
    val net: Double = 0.0,
)

@Serializable
data class WcPressureLatest(val side: String = "even", val value: Double = 0.0)

@Serializable
data class WcPressure(
    val available: Boolean = false,
    val live: Boolean = false,
    val latest: WcPressureLatest? = null,
    val points: List<WcPressurePoint> = emptyList(),
)

@Serializable
data class WcMomentumPoint(
    val label: String = "",
    val minute: Int = 0,
    val home: Double = 0.0,
    val away: Double = 0.0,
    val net: Double = 0.0,
)

@Serializable
data class WcPossession(val home: Int = 0, val away: Int = 0)

@Serializable
data class WcMomentum(
    val available: Boolean = false,
    val live: Boolean = false,
    val possession: WcPossession? = null,
    val points: List<WcMomentumPoint> = emptyList(),
)

@Serializable
data class WcCommentaryItem(
    val minute: Int = 0,
    val extraMinute: Int? = null,
    val goal: Boolean = false,
    val important: Boolean = false,
    val textAr: String = "",
    val textEn: String = "",
    val order: Int = 0,
) {
    val minuteLabel: String get() = "$minute'${extraMinute?.let { "+$it" } ?: ""}"
}

@Serializable
data class WcCommentary(
    val available: Boolean = false,
    val live: Boolean = false,
    val items: List<WcCommentaryItem> = emptyList(),
)

@Serializable
data class WcTvChannel(
    val name: String = "",
    val country: String? = null,
    val url: String? = null,
    val logo: String? = null,
)

@Serializable
data class WcTvListing(
    val available: Boolean = false,
    val channels: List<WcTvChannel> = emptyList(),
)

// ---------- القيمة السوقية + الفورمة (/world-cup/player/:id/market|form) ----------

@Serializable
data class WcMarketPoint(val time: Int = 0, val value: Double = 0.0)

@Serializable
data class WcPlayerMarket(
    val available: Boolean = false,
    val marketValue: Double? = null,
    val currency: String = "€",
    val history: List<WcMarketPoint> = emptyList(),
)

@Serializable
data class WcFormMatch(
    val date: String = "",
    val opponent: String = "",
    val opponentLogo: String = "",
    val homeAway: String = "",   // home | away
    val result: String = "",     // W | D | L
    val scoreFor: Int = 0,
    val scoreAgainst: Int = 0,
    val xg: Double? = null,
    val goals: Int = 0,
    val rating: Double? = null,
    val league: String = "",
)

@Serializable
data class WcPlayerForm(
    val available: Boolean = false,
    val matches: List<WcFormMatch> = emptyList(),
)

// ---------- نبض المباراة (ودجت حيّ — /world-cup/pulse/:id) ----------
// حِمل خفيف: اسم+شعار فقط لكل فريق، حالة بلا code.

@Serializable
data class WcPulseSide(val name: String = "", val logo: String = "")

@Serializable
data class WcPulseScore(val home: Int = 0, val away: Int = 0)

@Serializable
data class WcPulseStatus(
    val live: Boolean = false,
    val finished: Boolean = false,
    val elapsed: Int? = null,
    val extra: Int? = null,
    val label: String = "",
)

@Serializable
data class WcPulseMomentum(
    val home: Int = 0,
    val away: Int = 0,
    val leader: String? = null,   // home | away | null
    val value: Int = 0,
)

@Serializable
data class WcPulseVar(val minute: Int = 0, val team: String = "")

@Serializable
data class WcPulse(
    val id: Int = 0,
    val home: WcPulseSide = WcPulseSide(),
    val away: WcPulseSide = WcPulseSide(),
    val score: WcPulseScore = WcPulseScore(),
    val status: WcPulseStatus = WcPulseStatus(),
    val kickoff: String = "",
    val timestamp: Int = 0,
    val round: String = "",
    val momentum: WcPulseMomentum = WcPulseMomentum(),
    val lastVar: WcPulseVar? = null,
)

@Serializable
data class WcSquadPlayer(
    val id: Int = 0,
    val name: String = "",
    val number: Int? = null,
    val position: String = "",
    val positionEn: String = "",
    val age: Int? = null,
    val photo: String = "",
)

@Serializable
data class WcSquad(
    val team: WcTeam = WcTeam(),
    val players: List<WcSquadPlayer> = emptyList(),
)

// ---------- بطاقة اللاعب الشاملة (/world-cup/player/:id) ----------

@Serializable
data class WcPlayerCareerStop(
    val teamId: Int = 0,
    val team: String = "",
    val logo: String = "",
    val seasons: List<Int> = emptyList(),
) {
    /** [2019..2025] → "2019–2025"، وموسم واحد يُعرض مفردًا */
    val seasonsLabel: String
        get() {
            val first = seasons.firstOrNull() ?: return ""
            val last = seasons.last()
            return if (first == last) "$first" else "$first–$last"
        }
}

@Serializable
data class WcPlayerTrophy(
    val competition: String = "",
    val country: String = "",
    val season: String = "",
    val place: String = "",
    val winner: Boolean = false,
)

@Serializable
data class WcPlayerTournamentStats(
    val matches: Int = 0,
    val lineups: Int = 0,
    val minutes: Int = 0,
    val rating: Double? = null,
    val goals: Int = 0,
    val assists: Int = 0,
    val shots: Int = 0,
    val shotsOn: Int = 0,
    val passes: Int = 0,
    val keyPasses: Int = 0,
    val dribblesAttempts: Int = 0,
    val dribblesSuccess: Int = 0,
    val tackles: Int = 0,
    val yellow: Int = 0,
    val red: Int = 0,
    val saves: Int = 0,
    val conceded: Int = 0,
    val penaltiesScored: Int = 0,
    val penaltiesMissed: Int = 0,
)

@Serializable
data class WcPlayerInjury(val reason: String = "")

@Serializable
data class WcPlayerCard(
    val id: Int = 0,
    val name: String = "",
    /** الاسم الرسمي الكامل — null عندما لا يضيف شيئًا على الاسم المعروض */
    val fullName: String? = null,
    val photo: String = "",
    val position: String = "",
    val positionEn: String = "",
    val number: Int? = null,
    val age: Int? = null,
    val birthDate: String? = null,
    /** "الرياض، السعودية" — جاهز للعرض من الخادم */
    val birthPlace: String? = null,
    val height: Int? = null,
    val weight: Int? = null,
    val career: List<WcPlayerCareerStop> = emptyList(),
    val trophies: List<WcPlayerTrophy> = emptyList(),
    /** أرقام اللاعب التراكمية في مونديال 2026 — null قبل اعتماد المزود لها */
    val stats: WcPlayerTournamentStats? = null,
    val injury: WcPlayerInjury? = null,
)

// ---------- صفحة المنتخب المتكاملة (/world-cup/team/:id) ----------

@Serializable
data class WcTeamExtra(
    val marketValue: Double? = null,
    val marketValueCurrency: String? = null,
    val foundation: Int? = null,
    val squadSize: Int? = null,
)

@Serializable
data class WcFifaRank(
    val rank: Int = 0,
    val points: Double? = null,
    /** عدد المراكز المتغيّرة منذ التحديث السابق (موجب = صعد) */
    val change: Int? = null,
)

@Serializable
data class WcInjury(
    val player: String = "",
    val reason: String? = null,
    val status: String? = null,
    val until: String? = null,
)

@Serializable
data class WcSeasonStatItem(
    val label: String = "",
    val value: Double = 0.0,
    val percent: Boolean? = null,
) {
    val display: String
        get() = when {
            percent == true -> "${value.toInt()}%"
            value == kotlin.math.floor(value) -> "${value.toInt()}"
            else -> String.format(java.util.Locale.US, "%.1f", value)
        }
}

@Serializable
data class WcTeamSeasonStats(
    val available: Boolean = false,
    val matches: Int = 0,
    val items: List<WcSeasonStatItem> = emptyList(),
)

@Serializable
data class WcCoachInfo(
    val name: String = "",
    val photo: String = "",
    val formation: String? = null,
    val age: Int? = null,
    val nationality: String? = null,
)

@Serializable
data class WcVenueInfo(
    val name: String = "",
    val capacity: Int? = null,
    val city: String = "",
    val country: String? = null,
)

@Serializable
data class WcTeamProfile(
    val team: WcTeam = WcTeam(),
    val isSaudi: Boolean = false,
    val coach: String? = null,
    val group: WcGroup? = null,
    val fixtures: List<WcFixture> = emptyList(),
    val squad: List<WcSquadPlayer> = emptyList(),
    val extra: WcTeamExtra? = null,
    val fifaRank: WcFifaRank? = null,
    val injuries: List<WcInjury>? = null,
    val seasonStats: WcTeamSeasonStats? = null,
    val coachInfo: WcCoachInfo? = null,
    val venue: WcVenueInfo? = null,
)

// ---------- مسابقة التوقّعات (/api/v1/world-cup/predictions/*) ----------

@Serializable
data class WcMyPrediction(
    val predHome: Int = 0,
    val predAway: Int = 0,
    /** pending | correct | incorrect */
    val status: String = "pending",
    val pointsAwarded: Int = 0,
)

@Serializable
data class WcMatchSettlement(
    /** open | locked | settled */
    val status: String = "open",
    val finalHome: Int? = null,
    val finalAway: Int? = null,
    val winnersCount: Int = 0,
    val pointsPerWinner: Int = 0,
    val predictionsCount: Int = 0,
)

@Serializable
data class WcPredictableMatch(
    val fixture: WcFixture = WcFixture(),
    val locked: Boolean = false,
    val predictionsCount: Int = 0,
    val myPrediction: WcMyPrediction? = null,
    val settlement: WcMatchSettlement? = null,
)

@Serializable
data class WcPredTodayResponse(val matches: List<WcPredictableMatch> = emptyList())

@Serializable
data class WcPredictionHistoryItem(
    val fixtureId: String = "",
    val predHome: Int = 0,
    val predAway: Int = 0,
    val status: String = "pending",
    val pointsAwarded: Int = 0,
    val createdAt: String? = null,
    val kickoffAt: String? = null,
    val homeTeamName: String? = null,
    val homeTeamLogo: String? = null,
    val awayTeamName: String? = null,
    val awayTeamLogo: String? = null,
    val finalHome: Int? = null,
    val finalAway: Int? = null,
    val finalPenHome: Int? = null,
    val finalPenAway: Int? = null,
    val matchStatus: String? = null,
)

@Serializable
data class WcPredMineResponse(val predictions: List<WcPredictionHistoryItem> = emptyList())

@Serializable
data class WcPredLeader(
    val rank: Int = 0,
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val totalPoints: Int = 0,
    val correctCount: Int = 0,
    val playedCount: Int = 0,
)

@Serializable
data class WcLeaderboardResponse(val leaders: List<WcPredLeader> = emptyList())

@Serializable
data class WcPredictionSubmitBody(
    val fixtureId: Int,
    val predHome: Int,
    val predAway: Int,
)

// ---------- المتابعة + تنبيهات المباريات (/api/v1/sports/*) ----------

@Serializable
data class SportsFollow(
    val id: String = "",
    val kind: String = "",
    val refId: String = "",
    val refName: String = "",
    val refLogo: String? = null,
    val notify: Boolean = true,
)

@Serializable
data class SportsFollowsResponse(val follows: List<SportsFollow> = emptyList())

@Serializable
data class SportsFollowBody(
    val kind: String,
    val refId: String,
    val refName: String = "",
    val refLogo: String? = null,
)

@Serializable
data class SportsAlertPreferences(
    val kickoff: Boolean = true,
    val goals: Boolean = true,
    val cards: Boolean = true,
    val varReview: Boolean = true,
    val fulltime: Boolean = true,
)

@Serializable
data class SportsAlertPrefsResponse(val preferences: SportsAlertPreferences = SportsAlertPreferences())

// ---------- حقائق البطولة (/world-cup/facts) ----------

@Serializable
data class WcMostTitles(
    val teams: List<WcTeam> = emptyList(),
    val count: Int = 0,
)

@Serializable
data class WcCompetitionFacts(
    val defendingChampion: WcTeam? = null,
    val defendingChampionTitles: Int? = null,
    val mostTitles: WcMostTitles? = null,
    val host: String? = null,
) {
    /** هل توجد أي حقيقة لعرضها؟ (يُخفى القسم كاملًا إن لا) */
    val hasContent: Boolean
        get() = defendingChampion != null || mostTitles != null || !host.isNullOrEmpty()
}

// ---------- شجرة الأدوار الإقصائية (/world-cup/bracket) ----------

@Serializable
data class WcBracketRound(
    val round: String = "",
    val roundEn: String = "",
    val matches: List<WcFixture> = emptyList(),
)

@Serializable
data class WcBracket(
    val source: String = "",
    val rounds: List<WcBracketRound> = emptyList(),
)

// ---------- أخبار المونديال (/world-cup/news) ----------

@Serializable
data class WcNewsSide(
    val name: String = "",
    val logo: String = "",
)

@Serializable
data class WcNewsFocalPoint(
    val x: Double = 0.5,
    val y: Double = 0.5,
)

@Serializable
data class WcNewsItem(
    val id: String = "",
    val title: String = "",
    val slug: String = "",
    val excerpt: String? = null,
    val imageUrl: String? = null,
    val imageFocalPoint: WcNewsFocalPoint? = null,
    val publishedAt: String? = null,
    /** "preview" (ما قبل المباراة) | "report" (تقرير) | "news" */
    val kind: String = "news",
    val fixtureId: Int? = null,
    val home: WcNewsSide? = null,
    val away: WcNewsSide? = null,
)

// أغلفة الاستجابات
@Serializable
data class WcFixturesResponse(val fixtures: List<WcFixture> = emptyList())

@Serializable
data class WcNewsResponse(val news: List<WcNewsItem> = emptyList())

@Serializable
data class WcStandingsResponse(val groups: List<WcGroup> = emptyList())

@Serializable
data class WcScorersResponse(val scorers: List<WcScorer> = emptyList())

@Serializable
data class WcLeadersResponse(val leaders: List<WcLeader> = emptyList())

@Serializable
data class WcTeamsResponse(val teams: List<WcTeam> = emptyList())

const val WC_SAUDI_TEAM_ID = 23
