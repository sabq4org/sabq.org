package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.feature.article.rememberAnnotatedString
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.util.BlockNode
import com.sabq.smart.util.InlineRun

/**
 * جدول أصلي لبلوك [BlockNode.Table] (جدول المحرر `sabq-table`) — يُستعمل في
 * المقال ومُقترب. صف رؤوس مظلّل، خطوط شعرية بين الصفوف، وأعمدة متساوية
 * تلتفّ نصوصها؛ أكثر من أربعة أعمدة ⇒ تمرير أفقي بعرض ثابت للعمود.
 * يطابق `tableView` في iOS `ArticleContentView`.
 */
@Composable
fun ArticleTableBlock(
    block: BlockNode.Table,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
    modifier: Modifier = Modifier,
) {
    val columnCount = maxOf(block.header?.size ?: 0, block.rows.maxOfOrNull { it.size } ?: 0, 1)
    val scrolls = columnCount > 4
    val shape = RoundedCornerShape(12.dp)
    val outline = SabqTheme.colors.outline

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, outline.copy(alpha = 0.8f), shape)
            .then(if (scrolls) Modifier.horizontalScroll(rememberScrollState()) else Modifier),
    ) {
        block.header?.let { header ->
            TableRow(
                cells = header,
                columnCount = columnCount,
                scrolls = scrolls,
                emphasiseAll = true,
                emphasiseFirst = false,
                fontSize = fontSize,
                lineSpacing = lineSpacing,
                useSerif = useSerif,
                modifier = Modifier.background(SabqTheme.colors.paleFill),
            )
        }
        block.rows.forEachIndexed { idx, cells ->
            if (block.header != null || idx > 0) {
                HorizontalDivider(color = outline.copy(alpha = 0.6f))
            }
            TableRow(
                cells = cells,
                columnCount = columnCount,
                scrolls = scrolls,
                emphasiseAll = false,
                emphasiseFirst = block.cardStyle,
                fontSize = fontSize,
                lineSpacing = lineSpacing,
                useSerif = useSerif,
            )
        }
    }
}

@Composable
private fun TableRow(
    cells: List<List<InlineRun>>,
    columnCount: Int,
    scrolls: Boolean,
    emphasiseAll: Boolean,
    emphasiseFirst: Boolean,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
    modifier: Modifier = Modifier,
) {
    val cellSize = maxOf(13f, fontSize - 2f)
    Row(
        modifier = modifier.then(if (scrolls) Modifier else Modifier.fillMaxWidth()),
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        for (col in 0 until columnCount) {
            val runs = if (col < cells.size) cells[col] else emptyList()
            val emphasised = emphasiseAll || (emphasiseFirst && col == 0)
            val cellModifier = (if (scrolls) Modifier.width(120.dp) else Modifier.weight(1f))
                .then(
                    if (emphasiseFirst && !emphasiseAll && col == 0)
                        Modifier.background(SabqTheme.colors.paleFill.copy(alpha = 0.6f))
                    else Modifier
                )
                .padding(horizontal = 10.dp, vertical = 9.dp)
            Text(
                text = rememberAnnotatedString(runs, cellSize, lineSpacing, useSerif),
                fontSize = cellSize.sp,
                lineHeight = (cellSize + lineSpacing + 1).sp,
                fontWeight = if (emphasised) FontWeight.Bold else FontWeight.Normal,
                fontFamily = if (useSerif) FontFamily.Serif else FontFamily.Default,
                color = if (emphasised) SabqTheme.colors.ink else SabqTheme.colors.ink.copy(alpha = 0.92f),
                modifier = cellModifier,
            )
        }
    }
}
