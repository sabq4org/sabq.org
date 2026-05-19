package com.sabq.smart.feature.settings

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.ArrowCircleRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.WorkOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.User
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqAccent
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "المزيد" tab — Settings + account surface. Ports iOS [SettingsView]
 * order:
 *
 *   1. CompactScreenHeader "المزيد" / "إعدادات التطبيق وعن سبق".
 *   2. profileSection (SurfaceCard with primaryEnd accent halo):
 *        - signed-in   → avatar 64 dp + name + role chip + email +
 *                        optional job-title + "تعديل الملف الشخصي"
 *                        capsule + (logout via accountActionsSection).
 *        - signed-out  → avatar placeholder + "تسجيل الدخول" title +
 *                        full-width brand-gradient CTA.
 *   3. loyaltyEntrySection (signed-in only) — trophy row pushing
 *      LoyaltyAccountScreen.
 *   4. displaySection — dark mode + accent picker + font slider.
 *   5. aboutSection.
 */
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
    onLoginClick: () -> Unit = {},
    onLoyaltyClick: () -> Unit = {},
) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val currentUser by authViewModel.currentUser.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(
                start = SabqTheme.dimens.screenPaddingH,
                end = SabqTheme.dimens.screenPaddingH,
                top = 18.dp,
                bottom = 120.dp,
            ),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // 1) Header.
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "المزيد",
                style = SabqTheme.typography.screenTitle,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "إعدادات التطبيق وعن سبق",
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.secondaryInk,
            )
        }

        // 2) Profile section.
        ProfileSection(
            user = currentUser,
            onLoginClick = onLoginClick,
            onLogoutClick = { authViewModel.logout() },
        )

        // 3) Loyalty entry — visible only when signed in.
        if (currentUser != null) {
            LoyaltyEntryRow(onClick = onLoyaltyClick)
        }

        // 4) Display section.
        DisplaySection(viewModel = viewModel, settings = settings)

        // 5) About.
        AboutSection()
    }
}

// MARK: - Profile section

@Composable
private fun ProfileSection(
    user: User?,
    onLoginClick: () -> Unit,
    onLogoutClick: () -> Unit,
) {
    SurfaceCard(accent = SabqTheme.colors.primaryEnd) {
        if (user != null) {
            SignedInProfile(user = user, onLogoutClick = onLogoutClick)
        } else {
            SignedOutPrompt(onLoginClick = onLoginClick)
        }
    }
}

@Composable
private fun SignedInProfile(user: User, onLogoutClick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Top row: avatar + (name + verified + role + email).
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            ProfileAvatar(user = user, size = 64.dp)

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = user.displayName,
                        style = SabqTheme.typography.compactCardTitle.copy(
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = SabqTheme.colors.ink,
                        ),
                    )
                    // Verified seal — shown for staff roles; v1 just
                    // shows for any user with a role string. Refine
                    // once isVerified lands on ApiUser.
                    if (!user.role.isNullOrBlank()) {
                        Icon(
                            imageVector = Icons.Filled.Verified,
                            contentDescription = null,
                            tint = SabqTheme.colors.primaryEnd,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }

                // Role chip with icon.
                if (!user.role.isNullOrBlank()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Person,
                            contentDescription = null,
                            tint = SabqTheme.colors.primaryEnd,
                            modifier = Modifier.size(11.dp),
                        )
                        Text(
                            text = localizedRole(user.role),
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = SabqTheme.colors.primaryEnd,
                            ),
                        )
                    }
                }

                user.email?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        text = it,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 12.sp,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                        maxLines = 1,
                    )
                }
            }
        }

        // Optional job title row.
        user.jobTitle?.takeIf { it.isNotBlank() && it != localizedRole(user.role) }?.let { title ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.WorkOutline,
                    contentDescription = null,
                    tint = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = title,
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }
        }

        // "تعديل الملف الشخصي" capsule button + logout in same row.
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f))
                    .clickable { /* TODO: EditProfileSheet */ }
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Edit,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(13.dp),
                )
                Text(
                    text = "تعديل الملف الشخصي",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.primaryEnd,
                    ),
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            // Logout capsule (coral tint).
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(SabqTheme.colors.coral.copy(alpha = 0.10f))
                    .clickable { onLogoutClick() }
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Logout,
                    contentDescription = null,
                    tint = SabqTheme.colors.coral,
                    modifier = Modifier.size(13.dp),
                )
                Text(
                    text = "تسجيل الخروج",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.coral,
                    ),
                )
            }
        }
    }
}

@Composable
private fun ProfileAvatar(user: User, size: androidx.compose.ui.unit.Dp) {
    // V1: initial-letter fallback. CachedAsyncImage-backed real avatar
    // lands once avatar upload is wired (iOS uses `user.avatar`).
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = user.displayName.take(1),
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = (size.value * 0.38f).sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.primaryEnd,
            ),
        )
    }
}

@Composable
private fun SignedOutPrompt(onLoginClick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onLoginClick() },
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(22.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = "تسجيل الدخول",
                    style = SabqTheme.typography.compactCardTitle.copy(
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
                Text(
                    text = "سجّل دخولك لتجربة شخصية أفضل",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }
        }

        // Full-width brand-gradient CTA.
        val ctaShape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(ctaShape)
                .background(
                    Brush.linearGradient(
                        listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                    ),
                    ctaShape,
                )
                .clickable { onLoginClick() }
                .padding(vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.ArrowCircleRight,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = "تسجيل الدخول",
                style = SabqTheme.typography.ctaButton.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                ),
            )
        }
    }
}

// MARK: - Loyalty entry

@Composable
private fun LoyaltyEntryRow(onClick: () -> Unit) {
    // Trophy gold matches iOS rgb(0.96, 0.62, 0.04).
    val trophyGold = Color(red = 0.96f, green = 0.62f, blue = 0.04f)
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f), shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f)), shape)
            .clickable { onClick() }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(trophyGold.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.EmojiEvents,
                contentDescription = null,
                tint = trophyGold,
                modifier = Modifier.size(19.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "نقاطي والمكافآت",
                style = SabqTheme.typography.compactCardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "تابع مستواك واستبدل نقاطك",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
        // chevron.backward — points into the row's trailing edge,
        // which in RTL is the LEFT side. Compose's autoMirrored
        // ArrowBack handles the flip for us.
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

// MARK: - Display section

@Composable
private fun DisplaySection(viewModel: SettingsViewModel, settings: com.sabq.smart.data.AppSettings) {
    SurfaceCard {
        SectionTitle("العرض", "الوضع، الألوان، حجم الخط")

        SettingsRow(
            title = "الوضع المظلم",
            subtitle = if (settings.followsSystemDark)
                "يتبع إعدادات النظام تلقائياً"
            else if (settings.isDarkMode) "مفعّل" else "متوقّف",
        ) {
            Switch(
                checked = if (settings.followsSystemDark)
                    androidx.compose.foundation.isSystemInDarkTheme()
                else settings.isDarkMode,
                onCheckedChange = { viewModel.setDarkMode(it) },
                colors = SwitchDefaults.colors(
                    checkedThumbColor = SabqTheme.colors.surface,
                    checkedTrackColor = SabqTheme.colors.primaryEnd,
                    uncheckedThumbColor = SabqTheme.colors.surface,
                    uncheckedTrackColor = SabqTheme.colors.outline,
                ),
            )
        }
        SettingsRow(
            title = "اتباع إعدادات النظام",
            subtitle = "ينطبق الوضع المظلم عند تفعيله في الجهاز",
        ) {
            Switch(
                checked = settings.followsSystemDark,
                onCheckedChange = { viewModel.setFollowsSystem(it) },
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "لون التطبيق",
                style = SabqTheme.typography.chipLabel,
                color = SabqTheme.colors.ink,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                SabqAccent.entries.forEach { accent ->
                    AccentDot(
                        accent = accent,
                        selected = settings.accent == accent,
                        onClick = { viewModel.setAccent(accent) },
                    )
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "حجم خط المقال",
                    style = SabqTheme.typography.chipLabel,
                    color = SabqTheme.colors.ink,
                )
                Text(
                    text = "${settings.articleFontSize.toInt()} نقطة",
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
            Slider(
                value = settings.articleFontSize,
                onValueChange = { viewModel.setFontSize(it) },
                valueRange = 14f..24f,
                steps = 9,
                colors = SliderDefaults.colors(
                    thumbColor = SabqTheme.colors.primaryEnd,
                    activeTrackColor = SabqTheme.colors.primaryEnd,
                    inactiveTrackColor = SabqTheme.colors.outline,
                ),
            )
            Text(
                text = "معاينة: الصحة تدعو حجاج بيت الله لارتداء السوار التعريفي",
                style = SabqTheme.typography.body,
                color = SabqTheme.colors.ink,
            )
        }
    }
}

@Composable
private fun AboutSection() {
    SurfaceCard {
        SectionTitle("عن سبق", "الإصدار الأصلي على Android")
        Text(
            "صحيفة إلكترونية سعودية تتميز بالسبق في تقديم الأخبار العاجلة والتحليلات السياسية والاقتصادية والرياضية والتقنية على مدار الساعة.",
            style = SabqTheme.typography.excerpt,
            color = SabqTheme.colors.secondaryInk,
        )
        Text(
            "الإصدار 10.0.0-native — قيد التطوير",
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.tertiaryInk,
        )
        Text(
            "صنع بكل حب في السعودية",
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

// MARK: - Shared atoms

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = title,
            style = SabqTheme.typography.sectionHeader,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = subtitle,
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

@Composable
private fun SettingsRow(
    title: String,
    subtitle: String,
    trailing: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(text = title, style = SabqTheme.typography.chipLabel, color = SabqTheme.colors.ink)
            Text(text = subtitle, style = SabqTheme.typography.metaSmall, color = SabqTheme.colors.tertiaryInk)
        }
        trailing()
    }
}

@Composable
private fun AccentDot(
    accent: SabqAccent,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val isDark = SabqTheme.colors.isDark
    val color = if (isDark) accent.dark else accent.light
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(color)
                .border(
                    width = if (selected) 3.dp else 0.dp,
                    color = SabqTheme.colors.ink.copy(alpha = if (selected) 0.5f else 0f),
                    shape = CircleShape,
                )
                .clickable { onClick() },
        )
        Text(
            text = accent.arabicName,
            style = SabqTheme.typography.metaSmall,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

private val SabqAccent.arabicName: String
    get() = when (this) {
        SabqAccent.Blue -> "أزرق"
        SabqAccent.Teal -> "أخضر"
        SabqAccent.Purple -> "بنفسجي"
        SabqAccent.Rose -> "وردي"
        SabqAccent.Orange -> "برتقالي"
    }

/** Localise role keys to Arabic display names. Mirrors
 *  iOS APIUser.localizedRole — the canonical mapping for keys like
 *  "admin" → "مسؤول", "reporter" → "مراسل", etc. */
private fun localizedRole(roleKey: String?): String = when (roleKey?.lowercase()) {
    "admin", "system_admin", "superadmin" -> "مسؤول"
    "editor", "chief_editor" -> "محرر"
    "reporter", "correspondent", "journalist" -> "مراسل"
    "writer", "author", "columnist", "opinion_author", "article_author" -> "كاتب"
    "subscriber", "premium" -> "مشترك"
    "member" -> "عضو"
    "reader" -> "قارئ"
    null, "" -> "قارئ"
    else -> roleKey
}
