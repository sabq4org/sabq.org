package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * إطار شاشة فرعية: شريط علوي بزر رجوع وعنوان في المنتصف، ومحتوى قابل للتمرير.
 * نفس نمط AiTeamScreen حتى تتطابق الشاشات الجديدة المنقولة من iOS.
 * [scrollable] = false للشاشات التي تدير قائمتها بنفسها (LazyColumn).
 */
@Composable
fun SabqDetailScaffold(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    scrollable: Boolean = true,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(modifier.fillMaxSize().background(SabqTheme.colors.background)) {
        val columnModifier = Modifier
            .fillMaxSize()
            .let { if (scrollable) it.verticalScroll(rememberScrollState()) else it }
        Column(columnModifier) {
            Spacer(Modifier.statusBarsPadding().height(56.dp))
            content()
            if (scrollable) Spacer(Modifier.height(120.dp))
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(SabqTheme.colors.background.copy(alpha = 0.94f))
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = "رجوع",
                    tint = SabqTheme.colors.ink,
                    modifier = Modifier.size(20.dp),
                )
            }
            Text(
                title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            Box(Modifier.width(40.dp), contentAlignment = Alignment.Center) { trailing?.invoke() }
        }
    }
}
