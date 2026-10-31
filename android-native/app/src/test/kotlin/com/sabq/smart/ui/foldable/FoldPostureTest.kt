package com.sabq.smart.ui.foldable

import org.junit.Assert.assertEquals
import org.junit.Test

class FoldPostureTest {
    private val foldable = FoldInfo(isFoldable = true)

    @Test fun nonFoldableAlwaysStandard() {
        assertEquals(MatchLayoutMode.STANDARD, FoldPosture.matchLayout(FoldInfo(), 900, hasDetail = true))
    }

    @Test fun standardUntilDetailArrives() {
        assertEquals(MatchLayoutMode.STANDARD, FoldPosture.matchLayout(foldable, 900, hasDetail = false))
    }

    @Test fun unfoldedWideUsesColumns() {
        assertEquals(MatchLayoutMode.COLUMNS, FoldPosture.matchLayout(foldable, 673, hasDetail = true))
        assertEquals(MatchLayoutMode.STANDARD, FoldPosture.matchLayout(foldable, 412, hasDetail = true))
    }

    @Test fun halfOpenedHorizontalHingeIsTabletop() {
        val table = foldable.copy(halfOpened = true, horizontalHinge = true, hingeTopPx = 1100, hingeBottomPx = 1100)
        assertEquals(MatchLayoutMode.TABLETOP, FoldPosture.matchLayout(table, 900, hasDetail = true))
        // كتاب (مفصلة عمودية نصف مطوية) = عمودان
        val book = foldable.copy(halfOpened = true, horizontalHinge = false, hingeTopPx = 0, hingeBottomPx = 2000)
        assertEquals(MatchLayoutMode.COLUMNS, FoldPosture.matchLayout(book, 900, hasDetail = true))
    }
}
