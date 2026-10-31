package com.sabq.smart.feature.asiancup

import com.sabq.smart.feature.worldcup.WcMatchDetail
import com.sabq.smart.feature.worldcup.WcPressure
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** ردود كأس آسيا تُفكّ في نماذج مركز مباراة كأس العالم (أشكال الخادم متطابقة). */
class AsianCupMatchCenterDecodeTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test fun matchDetailDecodesIntoSharedModel() {
        val body = """
            {"fixture":{"id":77,"date":"2027-01-10T16:00:00Z","timestamp":1799600000,
              "status":{"code":"2H","label":"الشوط الثاني","elapsed":67,"live":true,"finished":false},
              "round":"دور المجموعات","roundEn":"Group","venue":{"name":"ملعب الملك فهد","city":"الرياض"},
              "home":{"id":23,"name":"السعودية","logo":""},"away":{"id":12,"name":"اليابان","logo":""},
              "goals":{"home":1,"away":0}},
             "events":[{"minute":30,"extraMinute":null,"teamId":23,"type":"goal","label":"هدف","detail":"",
               "player":"الدوسري","playerEn":"Al-Dawsari","playerId":5,"assist":null,"assistEn":null,"assistId":null}],
             "lineups":[{"teamId":23,"teamName":"السعودية","formation":"4-3-3","coach":"","startXI":[
               {"id":5,"name":"الدوسري","nameEn":"x","number":10,"position":"F","grid":"4:1"}],"substitutes":[]}],
             "statistics":[{"key":"possession","label":"الاستحواذ","home":"55%","away":"45%"}],
             "ratings":[],"manOfTheMatch":null,"prediction":{"home":40,"draw":30,"away":30},
             "headToHead":[],"tv":[{"name":"SSC","country":"SA","logo":null}],"trend":null}
        """.trimIndent()
        val d = json.decodeFromString(WcMatchDetail.serializer(), body)
        assertEquals(77, d.fixture.id)
        assertTrue(d.fixture.status.live)
        assertEquals(67, d.fixture.status.elapsed)
        assertEquals("الدوسري", d.events.single().player)
        assertEquals("4:1", d.lineups.single().startXI.single().grid)
        assertEquals(40, d.prediction?.home)
    }

    @Test fun pressureDecodes() {
        val body = """{"available":true,"live":true,"latest":{"side":"home","value":42},
            "points":[{"label":"10'","minute":10,"home":42,"away":0,"net":42}]}"""
        val p = json.decodeFromString(WcPressure.serializer(), body)
        assertEquals("home", p.latest?.side)
        assertEquals(42.0, p.points.single().net, 0.0)
    }
}
