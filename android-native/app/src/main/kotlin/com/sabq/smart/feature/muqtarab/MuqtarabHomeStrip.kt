package com.sabq.smart.feature.muqtarab

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.MuqTopic
import com.sabq.smart.data.formatRelativeDate
import com.sabq.smart.data.parseDate
import com.sabq.smart.ui.components.ArticleSidebarModule
import com.sabq.smart.ui.components.SidebarArticleRow
import com.sabq.smart.ui.components.SidebarRowDivider
import com.sabq.smart.ui.theme.SabqTheme

/**
 * بلوك «مُقترب» في الرئيسية — الحاوية الموحدة نفسها بصفوف بطاقة الخبر الجانبية
 * (قرار المالك: لا يشبه بلوك الرأي؛ بطاقة كبطاقة الأخبار الجانبية) ونظير iOS
 * `MuqtarabHomeStrip`: صورة الموضوع أو صورة الكاتب في الإطار نفسه، اسم الكاتب،
 * والوقت النسبي؛ حتى 4 مواضيع بزاوية معلومة، ويختفي كليًا بلا مواضيع.
 */
@Composable
fun MuqtarabHomeStrip(
    topics: List<MuqTopic>,
    onAllClick: () -> Unit,
    onTopicClick: (angleSlug: String, topicSlug: String) -> Unit,
) {
    val visibleTopics = topics.filter { it.angle?.slug != null }.take(4)
    if (visibleTopics.isEmpty()) return

    ArticleSidebarModule(
        title = "مُقترب",
        description = "زوايا كتّاب سبق — رأي يقترب من الحدث",
        icon = Icons.Filled.Layers,
        fill = SabqTheme.colors.surface,
        action = {
            Row(
                modifier = Modifier.clickable { onAllClick() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("كل الزوايا", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.primaryEnd)
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(12.dp),
                )
            }
        },
    ) {
        visibleTopics.forEachIndexed { index, topic ->
            if (index > 0) SidebarRowDivider()
            val writerAvatar = muqAbsolutize(topic.writer?.avatar)
            SidebarArticleRow(
                title = topic.title,
                // الموضوع بلا صورة يعرض صورة الكاتب داخل الإطار نفسه (ملاحظة المالك: «الصور لا تظهر»)
                imageUrl = muqAbsolutize(topic.heroImageUrl) ?: writerAvatar,
                byline = topic.writer?.name?.takeIf { it.isNotBlank() } ?: topic.angle?.name,
                bylineAvatarUrl = writerAvatar,
                date = formatRelativeDate(parseDate(topic.publishedAt)).takeIf { it.isNotBlank() },
                placeholderIcon = Icons.Filled.Layers,
                onClick = { onTopicClick(topic.angle!!.slug!!, topic.slug) },
            )
        }
    }
}
