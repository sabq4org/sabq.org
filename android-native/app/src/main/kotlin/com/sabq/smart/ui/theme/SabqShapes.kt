package com.sabq.smart.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Shape

/** Pre-built shapes pinned to [SabqDimens]. iOS uses `style: .continuous`
 * which Compose can't replicate exactly — Compose's circular corner is a
 * superellipse approximation that reads identical at common radii (>14dp). */
@Immutable
data class SabqShapes(
    val card: Shape   = RoundedCornerShape(28.0f.let { it.dp() }),
    val tile: Shape   = RoundedCornerShape(22.0f.dp()),
    val chip: Shape   = RoundedCornerShape(14.0f.dp()),
    val button: Shape = RoundedCornerShape(20.0f.dp()),
    val thumbnail: Shape = RoundedCornerShape(16.0f.dp()),
    val badge: Shape = RoundedCornerShape(13.0f.dp()),
)

private fun Float.dp() = androidx.compose.ui.unit.Dp(this)
