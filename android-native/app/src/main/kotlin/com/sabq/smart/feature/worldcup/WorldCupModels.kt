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

// أغلفة الاستجابات
@Serializable
data class WcFixturesResponse(val fixtures: List<WcFixture> = emptyList())

@Serializable
data class WcStandingsResponse(val groups: List<WcGroup> = emptyList())

@Serializable
data class WcScorersResponse(val scorers: List<WcScorer> = emptyList())

@Serializable
data class WcLeadersResponse(val leaders: List<WcLeader> = emptyList())

@Serializable
data class WcTeamsResponse(val teams: List<WcTeam> = emptyList())

const val WC_SAUDI_TEAM_ID = 23
