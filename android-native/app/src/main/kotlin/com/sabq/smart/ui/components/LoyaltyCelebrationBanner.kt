package com.sabq.smart.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.EaseInOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.LoyaltyTier
import com.sabq.smart.ui.theme.SabqTheme
import java.time.LocalDate

/**
 * Sliding celebration / nudge banner — port of iOS
 * `LoyaltyCelebrationBanner` (Components/LoyaltyCelebrationBanner.swift).
 *
 * Two modes:
 *   - [Mode.TierUp]: fires once per level (UI-only — caller tracks
 *     last-seen level).
 *   - [Mode.Nudge]: periodic encouragement, throttled by caller.
 *
 * Copy is tier- and mode-specific; nudge has two variants per tier
 * that rotate by calendar day so the user doesn't see identical text.
 */
sealed interface LoyaltyBannerMode {
    data class TierUp(val previousLevel: Int) : LoyaltyBannerMode
    data object Nudge : LoyaltyBannerMode
}

@Composable
fun LoyaltyCelebrationBanner(
    tier: LoyaltyTier,
    mode: LoyaltyBannerMode,
    onTap: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = when (mode) {
        is LoyaltyBannerMode.TierUp -> tierUpCopy(tier)
        is LoyaltyBannerMode.Nudge -> nudgeCopy(tier)
    }
    val icon = when (mode) {
        is LoyaltyBannerMode.TierUp -> Icons.Filled.EmojiEvents
        is LoyaltyBannerMode.Nudge -> Icons.Filled.AutoAwesome
    }
    val cardShape = RoundedCornerShape(16.dp)

    // Subtle sparkle bob — matches iOS easeInOut 1.6s autoreverse.
    val transition = rememberInfiniteTransition(label = "sparkle-bob")
    val sparkleY by transition.animateFloat(
        initialValue = 0f,
        targetValue = 3f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1600, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "sparkleY",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            // Tier-tinted glow under the card — matches iOS 6% opacity wash.
            .padding(2.dp)
            .clip(cardShape)
            .background(tier.color.copy(alpha = 0.06f), cardShape),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(cardShape)
                .background(SabqTheme.colors.surface, cardShape)
                .border(BorderStroke(1.dp, tier.color.copy(alpha = 0.30f)), cardShape)
                .clickable { onTap() }
                .padding(14.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 48 dp tier-tinted circle + icon + sparkle overlay.
            Box(modifier = Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(tier.color.copy(alpha = 0.18f)),
                )
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = tier.color,
                    modifier = Modifier.size(22.dp),
                )
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = tier.color.copy(alpha = 0.7f),
                    modifier = Modifier
                        .size(9.dp)
                        .align(Alignment.TopEnd)
                        .offset(x = 4.dp, y = (-2).dp + sparkleY.dp),
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = copy.eyebrow,
                    style = TextStyle(
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.5.sp,
                        color = tier.color,
                    ),
                )
                Text(
                    text = copy.title,
                    style = TextStyle(
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                        color = SabqTheme.colors.ink,
                    ),
                )
                Text(
                    text = copy.body,
                    style = TextStyle(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.secondaryInk,
                        lineHeight = 16.sp,
                    ),
                )
            }

            Spacer(modifier = Modifier.size(0.dp))

            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.tertiaryInk.copy(alpha = 0.10f), CircleShape)
                    .clickable { onDismiss() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "إخفاء",
                    tint = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.size(11.dp),
                )
            }
        }
    }

    @Suppress("UNUSED_EXPRESSION") sparkleY
}

// ─── Copy ports — kept verbatim with iOS strings ───────────────────────

private data class BannerCopy(val eyebrow: String, val title: String, val body: String)

private fun tierUpCopy(tier: LoyaltyTier): BannerCopy = when (tier.level) {
    2 -> BannerCopy(
        "ترقية جديدة",
        "أهلاً بك في المتفاعل 🎉",
        "تجاوزت أوّل ١٠٠ نقطة! كل قراءة وكل لايك يقرّبك من العضو الذهبي.",
    )
    3 -> BannerCopy(
        "ذهبي",
        "وصلت إلى العضو الذهبي ✨",
        "أنت من القرّاء المخلصين لسبق. شارة ذهبية تليق بأسلوبك.",
    )
    4 -> BannerCopy(
        "موثوق",
        "ترقّيت إلى القارئ الموثوق 🏆",
        "أداؤك ملحوظ ومميّز. الطريق إلى سفير سبق صار أقرب.",
    )
    5 -> BannerCopy(
        "سفير سبق",
        "أصبحت سفيراً لسبق 👑",
        "أعلى مستوى في برنامج الولاء. شكراً لكونك جزءاً مميزاً من مجتمعنا.",
    )
    else -> BannerCopy(
        "ترقية",
        "مستوى جديد!",
        "أحسنت — استمر في رحلتك المعرفية.",
    )
}

private fun nudgeCopy(tier: LoyaltyTier): BannerCopy {
    // iOS rotates between two variants per tier using the calendar day —
    // keeps copy fresh without server state.
    val variantA = LocalDate.now().dayOfMonth % 2 == 0
    return when (tier.level) {
        1 -> if (variantA) BannerCopy(
            "ابدأ رحلتك",
            "اقرأ خبراً اليوم 📰",
            "كل قراءة كاملة = ٥ نقاط. ١٠٠ نقطة وأنت من المتفاعلين.",
        ) else BannerCopy(
            "خطوة واحدة",
            "نقطة لكل تفاعل",
            "إعجابات + مشاركات + قراءات. كلها تُحسب في رصيدك.",
        )
        2 -> if (variantA) BannerCopy(
            "أنت متفاعل",
            "اقترب من الذهبي 🌟",
            "بضع قراءات إضافية تكفي. تابع أحدث الأخبار الآن.",
        ) else BannerCopy(
            "تابع التفاعل",
            "كل يوم نقاط جديدة",
            "حافظ على وتيرتك. عضوية ذهبية بانتظارك.",
        )
        3 -> if (variantA) BannerCopy(
            "ذهبي ولامع",
            "حافظ على ذهبيتك ⭐",
            "اقرأ ٣ مقالات اليوم — تبقى في القمة وتقترب من الموثوق.",
        ) else BannerCopy(
            "نشاط متواصل",
            "الطريق إلى الموثوق",
            "أنت من النخبة. كل مقال جديد يبني رصيدك.",
        )
        4 -> if (variantA) BannerCopy(
            "قارئ موثوق",
            "السفارة قريبة 👑",
            "أداؤك يثير الإعجاب. استمر بنفس الإيقاع للوصول إلى سفير سبق.",
        ) else BannerCopy(
            "موثوق ومميّز",
            "نشاطك يُحدث الفرق",
            "كل تفاعل يقرّبك أكثر من أعلى مستوى في البرنامج.",
        )
        5 -> if (variantA) BannerCopy(
            "سفير سبق",
            "إلهامك يصنع الفرق 💎",
            "شكراً لك على نشاطك المستمر. أنت جزء من نخبة سبق.",
        ) else BannerCopy(
            "أعلى مستوى",
            "أنت قدوة 👑",
            "نشاطك يحفّز قرّاء آخرين. واصل التميّز.",
        )
        else -> BannerCopy(
            "رحلتك المعرفية",
            "اقرأ. تفاعل. اكسب نقاطاً",
            "كل قراءة تحتسب في رحلتك.",
        )
    }
}
