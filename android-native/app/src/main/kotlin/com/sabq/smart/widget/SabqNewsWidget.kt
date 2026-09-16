package com.sabq.smart.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.action.actionStartActivity as actionStartActivityIntent
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.action.clickable
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.sabq.smart.MainActivity
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.util.formatRelativeDateAr
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent

/**
 * ودجت «آخر الأخبار» — Glance بلا WorkManager: التحديث الدوري عبر
 * updatePeriodMillis في sabq_news_widget_info.xml (كل 30 دقيقة) وكل
 * provideGlance يجلب أحدث 5 عناوين مباشرة عبر [ArticleRepository].
 * فشل الجلب يعرض حالة «افتح سبق لآخر الأخبار» بدل أن يكسر الودجت.
 *
 * النقر على أي عنوان يفتح MainActivity برابط sabq://push?slug=… —
 * نفس المسار الذي تعالجه capturePushExtras أصلاً.
 */
class SabqNewsWidget : GlanceAppWidget() {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface WidgetEntryPoint {
        fun articleRepository(): ArticleRepository
    }

    override val sizeMode: SizeMode = SizeMode.Responsive(
        setOf(SMALL, MEDIUM),
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // الجلب قبل provideContent — تركيبة Glance تُبنى مرة لكل تحديث.
        val articles: List<Article> = runCatching {
            val repo = EntryPointAccessors.fromApplication(
                context.applicationContext,
                WidgetEntryPoint::class.java,
            ).articleRepository()
            repo.getArticles(page = 1, limit = 5).items
        }.getOrDefault(emptyList())

        provideContent {
            GlanceTheme {
                WidgetBody(articles)
            }
        }
    }

    companion object {
        // صغير 2×2 (~3 صفوف) ومتوسط/عريض 4×2 (5 صفوف).
        private val SMALL = DpSize(120.dp, 120.dp)
        private val MEDIUM = DpSize(250.dp, 140.dp)
    }
}

@Composable
private fun WidgetBody(articles: List<Article>) {
    val size = LocalSize.current
    val maxRows = if (size.width < 200.dp) 3 else 5

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(GlanceTheme.colors.widgetBackground)
            .cornerRadius(20.dp)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        WidgetHeader()
        Spacer(modifier = GlanceModifier.height(6.dp))

        if (articles.isEmpty()) {
            EmptyState()
        } else {
            articles.take(maxRows).forEachIndexed { index, article ->
                if (index > 0) ThinDivider()
                HeadlineRow(article)
            }
        }
    }
}

@Composable
private fun WidgetHeader() {
    // فتح التطبيق فقط — بلا رابط عميق.
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "آخر الأخبار",
            style = TextStyle(
                fontSize = 11.sp,
                color = GlanceTheme.colors.onSurfaceVariant,
            ),
        )
        Spacer(modifier = GlanceModifier.defaultWeight())
        Text(
            text = "سبق",
            style = TextStyle(
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = GlanceTheme.colors.primary,
            ),
        )
    }
}

@Composable
private fun HeadlineRow(article: Article) {
    val context = androidx.glance.LocalContext.current
    val slug = article.slug ?: article.id
    val intent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("sabq://push?slug=${Uri.encode(slug)}"),
        context,
        MainActivity::class.java,
    )

    Column(
        modifier = GlanceModifier
            .fillMaxWidth()
            .clickable(actionStartActivityIntent(intent))
            .padding(vertical = 5.dp),
    ) {
        Text(
            text = article.title,
            maxLines = 2,
            style = TextStyle(
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = GlanceTheme.colors.onSurface,
                textAlign = TextAlign.Right,
            ),
            modifier = GlanceModifier.fillMaxWidth(),
        )
        val timeAgo = formatRelativeDateAr(article.publishedAtIso)
            .ifBlank { article.dateFormatted }
        if (timeAgo.isNotBlank()) {
            Text(
                text = timeAgo,
                maxLines = 1,
                style = TextStyle(
                    fontSize = 10.sp,
                    color = GlanceTheme.colors.onSurfaceVariant,
                    textAlign = TextAlign.Right,
                ),
                modifier = GlanceModifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ThinDivider() {
    Box(
        modifier = GlanceModifier
            .fillMaxWidth()
            .height(1.dp)
            .padding(horizontal = 2.dp)
            .background(GlanceTheme.colors.outline),
    ) {}
}

@Composable
private fun EmptyState() {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .clickable(actionStartActivity<MainActivity>()),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "افتح سبق لآخر الأخبار",
            style = TextStyle(
                fontSize = 12.sp,
                color = GlanceTheme.colors.onSurfaceVariant,
                textAlign = TextAlign.Center,
            ),
        )
    }
}
