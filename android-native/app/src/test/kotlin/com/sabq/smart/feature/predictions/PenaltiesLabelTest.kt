package com.sabq.smart.feature.predictions

import org.junit.Assert.*
import org.junit.Test

/** ركلات الترجيح في التوقعات (#1439). */
class PenaltiesLabelTest {
    @Test fun awayFirstInsideLtrParens() {
        assertEquals("(3–4 ر.ت)", PredScoreResult.penaltiesLabel(PredPenaltiesMeta(home = 4, away = 3)))
        assertNull(PredScoreResult.penaltiesLabel(null))
        assertNull(PredScoreResult.penaltiesLabel(PredPenaltiesMeta(home = null, away = 3)))
    }
}
