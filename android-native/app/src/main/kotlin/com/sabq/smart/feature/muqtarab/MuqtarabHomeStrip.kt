package com.sabq.smart.feature.muqtarab

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.MuqTopic
import com.sabq.smart.data.formatRelativeDate
import com.sabq.smart.data.parseDate
import com.sabq.smart.ui.theme.SabqTheme

/**
 * شريط «الزوايا» في الرئيسية — قائمة رأسية بنفس بنية قسم «الرأي»
 * وبهوية سبق: بطاقة سماوية فاتحة، عنوان الموضوع ثم اسم كاتب الزاوية
 * بأزرق سبق والتاريخ النسبي بجانبه. بلا صور إطلاقًا بقرار المالك.
 * يختفي كليًا عند غياب البيانات — نظير iOS `MuqtarabHomeStrip`.
 */
@Composable
fun MuqtarabHomeStrip(
    topics: List<MuqTopic>,
    onAllClick: () -> Unit,
    onTopicClick: (angleSlug: String, topicSlug: String) -> Unit,
) {
    // المواضيع القابلة للعرض فقط (زاوية معلومة) — حتى لا يكسر موضوع
    // ناقص البيانات ترتيب الفواصل بين الصفوف.
    val visibleTopics = topics.filter { it.angle?.slug != null }.take(3)
    if (visibleTopics.isEmpty()) return

    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.sectionCard, shape),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f),
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 4.dp, height = 22.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(SabqTheme.colors.brandSky),
                )
                Text(
                    text = "مُقترب",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }
            Row(
                modifier = Modifier.clickable { onAllClick() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = "كل الزوايا",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.brandBlue,
                    ),
                )
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                    tint = SabqTheme.colors.brandBlue,
                    modifier = Modifier.size(12.dp),
                )
            }
        }

        visibleTopics.forEachIndexed { index, topic ->
            if (index > 0) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .height(0.8.dp)
                        .background(SabqTheme.colors.sectionSeparator),
                )
            }
            TopicListRow(
                topic = topic,
                onClick = { onTopicClick(topic.angle?.slug.orEmpty(), topic.slug) },
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
private fun TopicListRow(topic: MuqTopic, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = topic.title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            ),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 23.sp,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = topic.writer?.name?.takeIf { it.isNotBlank() }
                    ?: topic.angle?.name?.takeIf { it.isNotBlank() }
                    ?: "مُقترب",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.brandBlue,
                ),
                maxLines = 1,
            )
            val relative = formatRelativeDate(parseDate(topic.publishedAt))
            if (relative.isNotBlank()) {
                Text(
                    text = "•",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 10.sp,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                )
                Text(
                    text = relative,
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                    maxLines = 1,
                )
            }
        }
    }
}
