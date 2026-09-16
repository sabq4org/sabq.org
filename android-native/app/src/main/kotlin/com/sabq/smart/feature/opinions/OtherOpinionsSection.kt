package com.sabq.smart.feature.opinions

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleHandoff
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class OtherOpinionsViewModel @Inject constructor(
    private val repo: ArticleRepository,
) : ViewModel() {

    private val _items = MutableStateFlow<List<Article>>(emptyList())
    val items = _items.asStateFlow()

    private var loadedForId: String? = null

    fun load(excludeId: String, excludeSlug: String?) {
        if (loadedForId == excludeId) return
        loadedForId = excludeId
        viewModelScope.launch {
            _items.value = runCatching { repo.getOpinions(page = 1, limit = 8) }
                .getOrNull()
                ?.items
                .orEmpty()
                .filterNot { it.id == excludeId || (excludeSlug != null && it.slug == excludeSlug) }
                .take(4)
        }
    }
}

/**
 * «مقالات أخرى» — تحل محل «أخبار ذات صلة» والتعليقات في صفحة الرأي
 * (مطابقة iOS OpinionDetail): حتى 4 مقالات رأي أخرى من /api/opinion،
 * كل صف عنوان + اسم الكاتب + دائرة 48dp على الطرف البادئ للنهاية.
 * تختفي كلياً عندما لا توجد نتائج.
 */
@Composable
fun OtherOpinionsSection(
    current: Article,
    onOpinionClick: (Article) -> Unit,
    viewModel: OtherOpinionsViewModel = hiltViewModel(),
) {
    val items by viewModel.items.collectAsStateWithLifecycle()
    LaunchedEffect(current.id) { viewModel.load(current.id, current.slug) }
    if (items.isEmpty()) return

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        HorizontalDivider(color = SabqTheme.colors.outline)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = "مقالات أخرى",
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                )
                Text(
                    text = "من كتّاب سبق",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(13.dp))
                    .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.FormatQuote,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
        items.forEachIndexed { idx, article ->
            OtherOpinionRow(
                article = article,
                onClick = {
                    // نفس مسار OpinionsListScreen: تسليم فوري ثم فتح التفاصيل
                    ArticleHandoff.put(article)
                    onOpinionClick(article)
                },
            )
            if (idx != items.lastIndex) {
                HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.5f))
            }
        }
    }
}

@Composable
private fun OtherOpinionRow(article: Article, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Text(
                text = article.title,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 21.sp,
            )
            article.authorName?.takeIf { it.isNotBlank() }?.let { name ->
                Text(
                    text = name,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        AuthorCircle(name = article.authorName)
    }
}

@Composable
private fun AuthorCircle(name: String?) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        val initial = name?.trim()?.firstOrNull()?.toString()
        if (initial != null) {
            Text(
                text = initial,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.primaryEnd,
            )
        } else {
            Icon(
                imageVector = Icons.Filled.FormatQuote,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd.copy(alpha = 0.45f),
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
