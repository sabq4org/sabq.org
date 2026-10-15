package com.sabq.smart.feature.home

import org.junit.Assert.*
import org.junit.Test

/** تصغير الشعار بعتبتين (#1600). */
class HomeHeaderCompactTest {
    @Test fun hysteresis() {
        assertTrue(HomeHeaderCompact.next(false, 73f))
        assertFalse(HomeHeaderCompact.next(false, 72f))
        assertTrue(HomeHeaderCompact.next(true, 40f))
        assertFalse(HomeHeaderCompact.next(false, 40f))
        assertFalse(HomeHeaderCompact.next(true, 16f))
        assertFalse(HomeHeaderCompact.next(true, 0f))
    }
}
