package com.sabq.smart.feature.muqtarab

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.CenterFocusStrong
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.data.MuqTopic
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Home-feed «مُقترب» strip — a title row with an "الكل" link to the
 * landing and a horizontal rail of featured-topic cards. Topics are
 * supplied by [HomeFeedViewModel] (limit 6); the parent hides the whole
 * block when the list is empty, so this composable assumes non-empty.
 * 1:1 port of iOS `MuqtarabHomeStrip` (`Components/MuqtarabHomeStrip.swift`).
 */
@Composable
fun MuqtarabHomeStrip(
    topics: List<MuqTopic>,
    onAllClick: () -> Unit,
    onTopicClick: (angleSlug: String, topicSlug: String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(SabqTheme.colors.sky.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.CenterFocusStrong,
                    contentDescription = null,
                    tint = SabqTheme.colors.sky,
                    modifier = Modifier.size(16.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                Text(
                    text = "مُقترب",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                )
                Text(
                    text = "زوايا تحليلية بأقلام الكتّاب",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { onAllClick() }
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = "الكل",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.sky,
                )
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = null,
                    tint = SabqTheme.colors.sky,
                    modifier = Modifier.size(14.dp),
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            topics.forEach { topic ->
                val angleSlug = topic.angle?.slug
                if (angleSlug != null) {
                    StripCard(topic = topic, onClick = { onTopicClick(angleSlug, topic.slug) })
                }
            }
        }
    }
}

@Composable
private fun StripCard(topic: MuqTopic, onClick: () -> Unit) {
    val theme = MuqTheme(topic.angle?.colorHex)
    val cardWidth = 230.dp
    val imageHeight = 124.dp
    val textHeight = 98.dp
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = Modifier
            .width(cardWidth)
            .height(imageHeight + textHeight)
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(0.5.dp, theme.color.copy(alpha = 0.16f), shape)
            .clickable { onClick() },
    ) {
        Box(
            modifier = Modifier
                .width(cardWidth)
                .height(imageHeight),
            contentAlignment = Alignment.Center,
        ) {
            val hero = muqAbsolutize(topic.heroImageUrl)
            if (hero != null) {
                SubcomposeAsyncImage(
                    model = hero,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    loading = { Box(Modifier.fillMaxSize().background(theme.color.copy(alpha = 0.14f))) },
                    error = { Box(Modifier.fillMaxSize().background(theme.color.copy(alpha = 0.14f))) },
                )
            } else {
                Box(Modifier.fillMaxSize().background(theme.color.copy(alpha = 0.14f)))
                Icon(
                    imageVector = muqIcon(topic.angle?.icon),
                    contentDescription = null,
                    tint = theme.color.copy(alpha = 0.7f),
                    modifier = Modifier.size(30.dp),
                )
            }
        }
        Column(
            modifier = Modifier
                .width(cardWidth)
                .height(textHeight)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            topic.angle?.name?.takeIf { it.isNotBlank() }?.let { name ->
                MuqPill(text = name, tint = theme.color)
            }
            Text(
                text = topic.title,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 19.sp,
            )
        }
    }
}
