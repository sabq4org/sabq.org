package com.sabq.smart.feature.plus

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Login
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.theme.SabqTheme
import java.util.Locale

// «سبق بلس» — المعاينة الداخلية (مسؤول المنصة فقط)، مرآة iOS
// SabqPlusView.swift بنفس ترتيب الأقسام: شريط المعاينة → بطاقة العضوية
// الكحلية → كيف تكسب → الكتالوج → السجل → الشروط.
//
// لا مكافئ لـ Apple Wallet هنا — القسيمة داخل التطبيق (رمز + نسخ) هي
// الإجابة الأندرويدية، ولا QR لغياب ZXing من التبعيات (قرار: لا تبعيات
// جديدة).

private val CardNavyTop = Color(0.063f, 0.137f, 0.227f)
private val CardNavyMid = Color(0.043f, 0.086f, 0.141f)
private val CardNavyEnd = Color(0.090f, 0.161f, 0.290f)
private val SabqBlue = Color(0.090f, 0.576f, 0.910f)
private val AmbPurple = Color(0.486f, 0.227f, 0.929f)
private val WalaPurple = Color(0.482f, 0.424f, 0.878f)
private val WalaDeep = Color(0.373f, 0.310f, 0.820f)
private val NavySubInk = Color(0.616f, 0.714f, 0.800f)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SabqPlusScreen(
    onBack: () -> Unit,
    viewModel: SabqPlusViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val user by viewModel.user.collectAsStateWithLifecycle()

    var confirmReward by remember { mutableStateOf<PlusRewardDto?>(null) }
    var removalTarget by remember { mutableStateOf<PlusRedemptionDto?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)

        // بوابة العميل — الخادم يرفض غير المسؤول بـ404 أيضاً (بوابة مزدوجة).
        val gated = user == null || user?.isPlatformAdmin != true
        when {
            gated || state.notAvailable -> LockPlaceholder()

            state.loading -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
            }

            state.loadError != null && state.summary == null -> ErrorRetry(
                message = state.loadError ?: "",
                onRetry = viewModel::load,
            )

            else -> PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier.weight(1f),
            ) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(22.dp),
                ) {
                    item { PreviewStrip() }
                    item {
                        MemberCard(
                            userName = user?.displayName ?: "مسؤول النظام",
                            summary = state.summary,
                        )
                    }
                    item { EarnSection() }
                    item {
                        CatalogSection(
                            catalog = state.catalog,
                            redeemingId = state.redeemingId,
                            onRedeemTap = { confirmReward = it },
                        )
                    }
                    item {
                        HistorySection(
                            redemptions = state.redemptions,
                            removingId = state.removingId,
                            onRemoveTap = { removalTarget = it },
                        )
                    }
                    item { TermsSection() }
                    item {
                        Text(
                            text = "نموذج محاكاة داخلي لتجربة «سبق بلس × ولاء ون» — أسماء الشركاء تجريبية والخصم من رصيدك فعلي",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.secondaryInk,
                            textAlign = TextAlign.Center,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp),
                        )
                        Spacer(Modifier.height(24.dp))
                    }
                }
            }
        }
    }

    confirmReward?.let { reward ->
        RedeemConfirmDialog(
            reward = reward,
            balance = state.catalog?.balance ?: 0,
            redeeming = state.redeemingId == reward.id,
            onConfirm = {
                viewModel.redeem(reward)
                confirmReward = null
            },
            onDismiss = { confirmReward = null },
        )
    }

    state.celebrationVoucher?.let { voucher ->
        CelebrationDialog(
            voucher = voucher,
            newBalance = state.catalog?.balance ?: 0,
            onDismiss = viewModel::dismissCelebration,
        )
    }

    removalTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { removalTarget = null },
            containerColor = SabqTheme.colors.surface,
            titleContentColor = SabqTheme.colors.ink,
            textContentColor = SabqTheme.colors.secondaryInk,
            title = { Text("إزالة القسيمة", fontWeight = FontWeight.Bold) },
            text = {
                Text("ستُرجع ${formatPoints(target.pointsSpent)} نقطة إلى رصيدك وتُلغى القسيمة نهائياً.")
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.removeRedemption(target)
                    removalTarget = null
                }) {
                    Text("إلغاء واسترداد النقاط", color = SabqTheme.colors.coral, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { removalTarget = null }) {
                    Text("تراجع", color = SabqTheme.colors.secondaryInk)
                }
            },
        )
    }

    state.actionError?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::dismissActionError,
            containerColor = SabqTheme.colors.surface,
            titleContentColor = SabqTheme.colors.ink,
            textContentColor = SabqTheme.colors.secondaryInk,
            title = { Text("تنبيه", fontWeight = FontWeight.Bold) },
            text = { Text(message) },
            confirmButton = {
                TextButton(onClick = viewModel::dismissActionError) {
                    Text("حسناً", color = SabqTheme.colors.primaryEnd, fontWeight = FontWeight.Bold)
                }
            },
        )
    }
}

// ============================================================
// شريط علوي + بوابة القفل + حالات التحميل
// ============================================================

@Composable
private fun TopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "سبق بلس",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.width(40.dp))
    }
}

@Composable
private fun LockPlaceholder() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
    ) {
        Box(
            modifier = Modifier
                .size(84.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.secondaryInk.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Lock,
                contentDescription = null,
                tint = SabqTheme.colors.secondaryInk,
                modifier = Modifier.size(34.dp),
            )
        }
        Text(
            text = "هذه المعاينة متاحة لمسؤولي النظام فقط",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
            textAlign = TextAlign.Center,
        )
        Text(
            text = "«سبق بلس» قيد التطوير — سيُعلن عن الإطلاق الرسمي لاحقاً.",
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ErrorRetry(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Icon(
            imageVector = Icons.Filled.WarningAmber,
            contentDescription = null,
            tint = SabqTheme.colors.coral,
            modifier = Modifier.size(30.dp),
        )
        Text(
            text = message,
            fontSize = 14.sp,
            color = SabqTheme.colors.secondaryInk,
            textAlign = TextAlign.Center,
        )
        Text(
            text = "إعادة المحاولة",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .clickable { onRetry() }
                .padding(horizontal = 22.dp, vertical = 10.dp),
        )
    }
}

// ============================================================
// 1) شريط المعاينة
// ============================================================

@Composable
private fun PreviewStrip() {
    Text(
        text = "⚠ معاينة داخلية — سبق بلس قيد التطوير",
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = Color(0.42f, 0.31f, 0f),
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Color(1f, 0.93f, 0.72f))
            .padding(vertical = 8.dp, horizontal = 12.dp),
    )
}

// ============================================================
// 2) بطاقة العضوية الكحلية
// ============================================================

@Composable
private fun MemberCard(userName: String, summary: PlusSummaryDto?) {
    val shape = RoundedCornerShape(22.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(colors = listOf(CardNavyTop, CardNavyMid, CardNavyEnd)),
            )
            .border(1.dp, Color(0.549f, 0.706f, 0.863f).copy(alpha = 0.14f), shape),
    ) {
        // «+» عملاقة باهتة — لمسة الهوية في خلفية بطاقة iOS.
        Text(
            text = "+",
            fontSize = 190.sp,
            fontWeight = FontWeight.Black,
            color = SabqBlue.copy(alpha = 0.09f),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .offset(x = (-30).dp, y = 50.dp),
        )
        Column(modifier = Modifier.padding(22.dp)) {
            Text(
                text = userName,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
            )
            Text(
                text = "مسؤول النظام · حساب التجربة",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = NavySubInk,
                modifier = Modifier.padding(bottom = 18.dp),
            )
            if (summary == null) {
                CircularProgressIndicator(
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(vertical = 40.dp),
                )
            } else {
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = String.format(Locale.US, "%.2f", summary.sarValue),
                        fontSize = 42.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                    )
                    Text(
                        text = "ر.س",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0.561f, 0.722f, 0.847f),
                        modifier = Modifier.padding(bottom = 6.dp),
                    )
                    Text(
                        text = "${formatPoints(summary.totalPoints)} نقطة",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0.659f, 0.761f, 0.847f),
                        modifier = Modifier.padding(bottom = 7.dp),
                    )
                }
                Text(
                    text = "كل ${summary.pointsPerSar} نقطة = 1 ريال سعودي · الاستبدال عبر شركاء ولاء ون",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0.498f, 0.631f, 0.737f),
                    modifier = Modifier.padding(top = 4.dp),
                )

                TierJourney(summary = summary)

                StatsPanel(summary = summary)

                Text(
                    text = summary.nextTier?.let { next ->
                        "يفصلك ${formatPoints(summary.pointsToNext)} نقطة عن فئة «${next.nameAr}»"
                    } ?: "وصلت لأعلى فئة — يُحتسب مضاعف السفير على كل مكافآت التوقعات",
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0.788f, 0.722f, 0.961f),
                    modifier = Modifier
                        .padding(top = 14.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(AmbPurple.copy(alpha = 0.16f))
                        .padding(vertical = 8.dp, horizontal = 12.dp),
                )
            }
        }
    }
}

@Composable
private fun TierJourney(summary: PlusSummaryDto) {
    val tierColor = parseHexColor(summary.tier.color, fallback = AmbPurple)
    Row(
        modifier = Modifier.padding(top = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Text(
            text = summary.tier.nameAr,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Black,
            color = Color(0.851f, 0.780f, 1f),
            modifier = Modifier
                .clip(CircleShape)
                .background(AmbPurple.copy(alpha = 0.22f))
                .border(1.dp, Color(0.655f, 0.478f, 0.980f).copy(alpha = 0.55f), CircleShape)
                .padding(vertical = 5.dp, horizontal = 12.dp),
        )
        for (level in 1..5) {
            val filled = level <= summary.tier.level
            val current = level == summary.tier.level
            Box(
                modifier = Modifier
                    .size(if (current) 12.dp else 9.dp)
                    .clip(CircleShape)
                    .background(if (filled) tierColor else Color.White.copy(alpha = 0.14f)),
            )
        }
        Text(
            text = "${summary.tier.level.coerceIn(0, 5)}/5",
            fontSize = 10.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = NavySubInk,
        )
    }
}

@Composable
private fun StatsPanel(summary: PlusSummaryDto) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = Modifier
            .padding(top = 14.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(Color.White.copy(alpha = 0.045f))
            .border(1.dp, Color.White.copy(alpha = 0.09f), shape)
            .padding(vertical = 6.dp, horizontal = 14.dp),
    ) {
        StatRow("نقاط مدى الحياة", formatPoints(summary.lifetimePoints), divider = false)
        StatRow("نقاط هذا الشهر", "+${formatPoints(summary.monthPoints)}")
        StatRow("مضاعف التوقعات", "×${cleanMultiplier(summary.predictionMultiplier)}")
        StatRow("للفئة التالية", "${formatPoints(summary.pointsToNext)} نقطة")
    }
}

@Composable
private fun StatRow(label: String, value: String, divider: Boolean = true) {
    Column {
        if (divider) {
            HorizontalDivider(color = Color.White.copy(alpha = 0.08f), thickness = 0.5.dp)
        }
        Row(
            modifier = Modifier.padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = NavySubInk,
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = value,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

// ============================================================
// 3) كيف تكسب — بلاطات تعريفية ثابتة (مرآة صياغة iOS)
// ============================================================

@Composable
private fun EarnSection() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("كيف تكسب النقاط")
        Text(
            text = "تُمنح النقاط تلقائياً أثناء استخدامك سبق — لا حاجة لأي خطوة إضافية.",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            EarnTile(Icons.Filled.MenuBook, "قراءة مقال", "+2", Modifier.weight(1f))
            EarnTile(Icons.Filled.ThumbUp, "تفاعل وتعليق", "+1", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            EarnTile(Icons.Filled.SportsSoccer, "توقعات رياضية", "حسب الجائزة", Modifier.weight(1f))
            EarnTile(Icons.Filled.Login, "دخول يومي", "+5 × السلسلة", Modifier.weight(1f))
        }
        Text(
            text = "القيم الحالية للإنتاج — جدول الاكتساب الجديد (المكافئ للريال) قيد الاعتماد.",
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

@Composable
private fun EarnTile(
    icon: ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(SabqTheme.colors.surface)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = SabqBlue,
            modifier = Modifier.size(17.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = value,
                fontSize = 12.sp,
                fontWeight = FontWeight.Black,
                color = SabqBlue,
            )
        }
    }
}

// ============================================================
// 4) الكتالوج — صفوف بعرض كامل (عمودان بالعربية يشوّهان المحاذاة)
// ============================================================

@Composable
private fun CatalogSection(
    catalog: PlusCatalogDto?,
    redeemingId: String?,
    onRedeemTap: (PlusRewardDto) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SectionTitle("استبدل نقاطك")
            Text(
                text = "بالتعاون مع ولاء ون",
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                color = WalaPurple,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(WalaPurple.copy(alpha = 0.12f))
                    .padding(vertical = 4.dp, horizontal = 10.dp),
            )
        }
        Text(
            text = "بعد تأكيد الاستبدال تصدر قسيمتك فوراً برمز داخل التطبيق. أسماء الشركاء تجريبية للمحاكاة.",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
        val rewards = catalog?.rewards.orEmpty()
        if (rewards.isEmpty()) {
            Text(
                text = "لا قسائم متاحة حالياً",
                fontSize = 13.sp,
                color = SabqTheme.colors.secondaryInk,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(SabqTheme.colors.surface)
                    .padding(vertical = 22.dp),
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                rewards.forEach { reward ->
                    RewardRow(
                        reward = reward,
                        balance = catalog?.balance ?: 0,
                        redeeming = redeemingId == reward.id,
                        onRedeemTap = { onRedeemTap(reward) },
                    )
                }
            }
        }
    }
}

@Composable
private fun RewardRow(
    reward: PlusRewardDto,
    balance: Int,
    redeeming: Boolean,
    onRedeemTap: () -> Unit,
) {
    val affordable = balance >= reward.pointsCost
    val brand = parseHexColor(reward.brandColor, fallback = WalaPurple)
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), shape)
            .padding(vertical = 13.dp, horizontal = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PartnerBadge(brand = brand, size = 48.dp)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = reward.partnerName,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = reward.offer,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${reward.category} · ولاء ون",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = brand,
                )
            }
            // شارة القيمة — بلون العلامة التجارية
            Text(
                text = reward.valueLabel,
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                color = brand,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(brand.copy(alpha = 0.12f))
                    .padding(vertical = 4.dp, horizontal = 10.dp),
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "${formatPoints(reward.pointsCost)} نقطة",
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            val stock = reward.remainingStock
            if (stock != null && stock < 20) {
                Text(
                    text = "متبقي $stock",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.coral,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(SabqTheme.colors.coral.copy(alpha = 0.10f))
                        .padding(vertical = 3.dp, horizontal = 8.dp),
                )
            }
            Spacer(Modifier.weight(1f))
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(
                        if (affordable) Brush.linearGradient(colors = listOf(WalaPurple, WalaDeep))
                        else Brush.linearGradient(
                            colors = listOf(SabqTheme.colors.tertiaryInk, SabqTheme.colors.secondaryInk),
                        ),
                    )
                    .clickable(enabled = affordable && !redeeming) { onRedeemTap() }
                    .padding(vertical = 7.dp, horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (redeeming) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(12.dp),
                    )
                }
                Text(
                    text = if (affordable) "استبدل" else "لا يكفي",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                )
            }
        }
    }
}

@Composable
private fun PartnerBadge(brand: Color, size: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.28f))
            .background(
                Brush.linearGradient(colors = listOf(brand.copy(alpha = 0.85f), brand)),
            )
            .border(0.8.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(size * 0.28f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.EmojiEvents,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(size * 0.44f),
        )
    }
}

// ============================================================
// 5) نافذة تأكيد الاستبدال — موافقة إلزامية على الشروط
// ============================================================

@Composable
private fun RedeemConfirmDialog(
    reward: PlusRewardDto,
    balance: Int,
    redeeming: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    var agreed by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SabqTheme.colors.surface,
        titleContentColor = SabqTheme.colors.ink,
        textContentColor = SabqTheme.colors.secondaryInk,
        title = { Text("تأكيد الاستبدال", fontWeight = FontWeight.Black) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "${reward.partnerName} — ${reward.offer}",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
                ConfirmRow("قيمة القسيمة", reward.valueLabel)
                ConfirmRow("التكلفة", "${formatPoints(reward.pointsCost)} نقطة")
                ConfirmRow("رصيدك بعد الاستبدال", "${formatPoints(balance - reward.pointsCost)} نقطة")
                Text(
                    text = "⚠ بعد التأكيد تسري شروط وأحكام ولاء ون ولا يمكن التراجع أو استرداد النقاط.",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.ink,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(WalaPurple.copy(alpha = 0.10f))
                        .padding(10.dp),
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { agreed = !agreed },
                ) {
                    Checkbox(
                        checked = agreed,
                        onCheckedChange = { agreed = it },
                        colors = CheckboxDefaults.colors(checkedColor = WalaPurple),
                    )
                    Text(
                        text = "أوافق على الشروط والأحكام",
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.ink,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = agreed && !redeeming) {
                Text(
                    text = if (redeeming) "جارٍ الاستبدال…" else "تأكيد الاستبدال",
                    color = if (agreed) WalaPurple else SabqTheme.colors.tertiaryInk,
                    fontWeight = FontWeight.Black,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("إلغاء", color = SabqTheme.colors.secondaryInk)
            }
        },
    )
}

@Composable
private fun ConfirmRow(label: String, value: String) {
    Column {
        Row(modifier = Modifier.padding(vertical = 6.dp)) {
            Text(
                text = label,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = value,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            )
        }
        HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.5f), thickness = 0.5.dp)
    }
}

// ============================================================
// 6) التهنئة — قسيمة داخل التطبيق (رمز كبير + نسخ؛ لا QR بلا ZXing)
// ============================================================

@Composable
private fun CelebrationDialog(
    voucher: PlusVoucherDto,
    newBalance: Int,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(SabqTheme.colors.background)
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(text = "🎉", fontSize = 52.sp, modifier = Modifier.padding(top = 30.dp))
            Text(
                text = "مبروك! تم الاستبدال",
                fontSize = 22.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "قسيمتك من ${voucher.partnerName} جاهزة — أبرِز الرمز عند الشريك",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
                textAlign = TextAlign.Center,
            )

            VoucherCard(voucher = voucher)

            Text(
                text = "خُصمت ${formatPoints(voucher.pointsSpent)} نقطة · رصيدك الجديد ${formatPoints(newBalance)} نقطة",
                fontSize = 11.5.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            )

            Text(
                text = "تم",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(SabqTheme.colors.surface)
                    .clickable { onDismiss() }
                    .padding(vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun VoucherCard(voucher: PlusVoucherDto) {
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(colors = listOf(WalaDeep, WalaPurple)))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PartnerBadge(
                brand = parseHexColor(voucher.brandColor, fallback = WalaPurple),
                size = 40.dp,
            )
            Text(
                text = voucher.partnerName,
                fontSize = 17.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
            )
        }
        Text(
            text = "${voucher.offer} · ${voucher.valueLabel}",
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0.894f, 0.871f, 1f),
        )
        // لوحة الرمز البيضاء — الرمز كبيراً + زر نسخ (بديل QR على أندرويد)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White)
                .padding(vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = voucher.code,
                fontSize = 24.sp,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 3.sp,
                color = Color(0.102f, 0.071f, 0.200f),
                textAlign = TextAlign.Center,
                style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Ltr),
            )
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(WalaPurple.copy(alpha = 0.12f))
                    .clickable {
                        clipboard.setText(AnnotatedString(voucher.code))
                        copied = true
                    }
                    .padding(vertical = 6.dp, horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.ContentCopy,
                    contentDescription = null,
                    tint = WalaDeep,
                    modifier = Modifier.size(13.dp),
                )
                Text(
                    text = if (copied) "نُسخ ✓" else "نسخ الرمز",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = WalaDeep,
                )
            }
        }
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = voucher.expiresAt?.let { "صالحة حتى ${formatIsoDate(it)}" } ?: "",
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0.851f, 0.824f, 0.980f),
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "سبق بلس × ولاء ون",
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0.851f, 0.824f, 0.980f),
            )
        }
    }
}

// ============================================================
// 7) سجل الاستبدالات
// ============================================================

@Composable
private fun HistorySection(
    redemptions: List<PlusRedemptionDto>,
    removingId: String?,
    onRemoveTap: (PlusRedemptionDto) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("سجل استبدالاتي")
        if (redemptions.isEmpty()) {
            Text(
                text = "لا توجد استبدالات بعد — جرّب استبدال أول قسيمة ✨",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(SabqTheme.colors.surface)
                    .padding(vertical = 22.dp),
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                redemptions.forEach { item ->
                    RedemptionRow(
                        item = item,
                        removing = removingId == item.id,
                        onRemoveTap = { onRemoveTap(item) },
                    )
                }
            }
        }
    }
}

@Composable
private fun RedemptionRow(
    item: PlusRedemptionDto,
    removing: Boolean,
    onRemoveTap: () -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PartnerBadge(
                brand = parseHexColor(item.brandColor, fallback = Color(0.29f, 0.29f, 0.35f)),
                size = 34.dp,
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = item.partnerName ?: "قسيمة",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    item.code?.let { code ->
                        Text(
                            text = code,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = FontFamily.Monospace,
                            color = SabqTheme.colors.secondaryInk,
                            style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Ltr),
                        )
                    }
                    item.redeemedAt?.let { date ->
                        Text(
                            text = formatIsoDate(date),
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.secondaryInk,
                        )
                    }
                }
            }
            StatusChip(status = item.status)
            Text(
                text = "−${formatPoints(item.pointsSpent)}",
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = Color(0.840f, 0.271f, 0.271f),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(9.dp))
                .background(SabqTheme.colors.coral.copy(alpha = 0.07f))
                .clickable(enabled = !removing) { onRemoveTap() }
                .padding(vertical = 7.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (removing) {
                CircularProgressIndicator(
                    color = SabqTheme.colors.coral,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(12.dp),
                )
            } else {
                Text(
                    text = "إلغاء واسترداد النقاط",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.coral,
                )
            }
        }
    }
}

@Composable
private fun StatusChip(status: String?) {
    val (label, tint) = when (status?.lowercase()) {
        "active", "issued" -> "فعّالة" to SabqTheme.colors.leaf
        "used", "consumed" -> "مستخدمة" to SabqTheme.colors.secondaryInk
        "expired" -> "منتهية" to SabqTheme.colors.coral
        "refunded", "cancelled", "canceled" -> "مستردة" to SabqTheme.colors.secondaryInk
        else -> (status ?: "—") to SabqTheme.colors.secondaryInk
    }
    Text(
        text = label,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        color = tint,
        modifier = Modifier
            .clip(CircleShape)
            .background(tint.copy(alpha = 0.12f))
            .padding(vertical = 3.dp, horizontal = 8.dp),
    )
}

// ============================================================
// 8) الشروط — بنود قابلة للطي (ملخص iOS نفسه)
// ============================================================

@Composable
private fun TermsSection() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionTitle("الإرشادات وشروط الاستخدام")
        Text(
            text = "ملخص توضيحي — الصياغة القانونية النهائية تُعتمد قبل الإطلاق الرسمي.",
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
        TermItem(
            title = "اكتساب النقاط وأسقفها",
            body = "تُمنح النقاط من قراءة المحتوى والتفاعل والدخول اليومي والتوقعات الرياضية وفق الجدول المعلن، وبأسقف يومية مضادة لإساءة الاستخدام.",
        )
        TermItem(
            title = "الاستبدال عبر ولاء ون",
            body = "عند تأكيد الاستبدال تُخصم النقاط فوراً وتصدر القسيمة. بعد التأكيد تسري شروط وأحكام ولاء ون ولا يمكن التراجع أو استرداد النقاط.",
        )
        TermItem(
            title = "صلاحية النقاط والقسائم",
            body = "نقاط سبق بلس لا تنتهي ما دام حسابك نشطاً. القسائم الصادرة عبر ولاء ون تنتهي بعد 12 شهراً من الإصدار ما لم يُذكر خلاف ذلك.",
        )
        TermItem(
            title = "حدود المسؤولية",
            body = "مسؤولية سبق تقتصر على صحة خصم النقاط وإصدار القسيمة. تأخر الشريك أو تغيير عروضه يخضع لشروط ولاء ون والشريك، وفي حال تعذر الإصدار تُعاد النقاط كاملة.",
        )
        TermItem(
            title = "الدعم والنزاعات",
            body = "لمشاكل النقاط: دعم سبق خلال 15 يوماً من العملية. لمشاكل استخدام القسيمة لدى الشريك: تُحال لدعم ولاء ون مع رقم المرجع.",
        )
    }
}

@Composable
private fun TermItem(title: String, body: String) {
    var expanded by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SabqTheme.colors.surface)
            .clickable { expanded = !expanded }
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = title,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = null,
                tint = SabqTheme.colors.secondaryInk,
                modifier = Modifier.size(16.dp),
            )
        }
        if (expanded) {
            Text(
                text = body,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            )
        }
    }
}

// ============================================================
// أدوات
// ============================================================

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        fontSize = 18.sp,
        fontWeight = FontWeight.Black,
        color = SabqTheme.colors.ink,
    )
}

private fun formatPoints(value: Int): String =
    String.format(Locale.US, "%,d", value)

private fun cleanMultiplier(value: Double): String =
    if (value % 1.0 == 0.0) String.format(Locale.US, "%.0f", value)
    else String.format(Locale.US, "%.1f", value)

/** ‏ISO → «5 أغسطس 2026»؛ عند فشل التحليل يُعرض التاريخ الخام مقصوصاً. */
internal fun formatIsoDate(iso: String): String = runCatching {
    val instant = java.time.OffsetDateTime.parse(iso)
    val fmt = java.time.format.DateTimeFormatter.ofPattern("d MMMM yyyy", Locale("ar"))
    instant.format(fmt)
}.getOrElse { iso.take(10) }

/** ‏"#RRGGBB" أو "#AARRGGBB" → Color، مع لون بديل عند أي صيغة غير متوقعة. */
internal fun parseHexColor(hex: String?, fallback: Color): Color {
    val cleaned = hex?.trim()?.removePrefix("#") ?: return fallback
    return runCatching {
        when (cleaned.length) {
            6 -> Color(0xFF000000 or cleaned.toLong(16))
            8 -> Color(cleaned.toLong(16))
            else -> fallback
        }
    }.getOrElse { fallback }
}
