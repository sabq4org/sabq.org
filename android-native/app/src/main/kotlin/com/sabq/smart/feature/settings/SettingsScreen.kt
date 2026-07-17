package com.sabq.smart.feature.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Camera
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LockReset
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.R
import com.sabq.smart.data.User
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqAccent
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "المزيد" tab — full account + app-settings surface. Ports
 * `Screens/SettingsView.swift` section-by-section.
 *
 * Section order (1:1 with iOS):
 *   1. CompactScreenHeader: "المزيد" / "إعدادات التطبيق وعن سبق"
 *   2. profileSection: avatar + identity + verified seal + role chip +
 *      email + job/dept + bio + email-not-verified warning + edit
 *      capsule + role-gated submission cards + change-password row.
 *   3. loyaltyEntry (signed-in only): "نقاطي والمكافآت"
 *   4. (press card entry — DEFERRED per editorial direction)
 *   5. displaySection: dark mode + accent + font slider
 *   6. subscriptionSection: newsletter
 *   7. aboutSection: privacy + terms + website + X + contact
 *   8. accountDangerSection (signed-in only): clear data + delete +
 *      logout
 *   9. appInfoSection: logo + version + slogan
 */
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
    onLoginClick: () -> Unit = {},
    onLoyaltyClick: () -> Unit = {},
    onPredictionsClick: () -> Unit = {},
    onEditProfileClick: () -> Unit = {},
    onChangePasswordClick: () -> Unit = {},
    onDeleteAccountClick: () -> Unit = {},
    onForgotPasswordClick: () -> Unit = {},
    onNotificationsClick: () -> Unit = {},
    onContactClick: () -> Unit = {},
    onNewsletterClick: () -> Unit = {},
    onPrivacyClick: () -> Unit = {},
    onTermsClick: () -> Unit = {},
    onOpenWebsite: () -> Unit = {},
    onOpenTwitter: () -> Unit = {},
    onSubmitOpinionClick: () -> Unit = {},
    onSubmitNewsClick: () -> Unit = {},
    onPickInterestsClick: () -> Unit = {},
    onDashboardClick: () -> Unit = {},
    onLogout: () -> Unit = {},
) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val currentUser by authViewModel.currentUser.collectAsStateWithLifecycle()
    val clearState by viewModel.clearLocalDataState.collectAsStateWithLifecycle()
    var showClearConfirm by remember { mutableStateOf(false) }
    var showLogoutConfirm by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = SabqTheme.dimens.screenPaddingH, vertical = 18.dp)
            .padding(bottom = SabqTheme.dimens.tabBarSafeArea),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // 1) Header
        CompactScreenHeader(
            title = "المزيد",
            subtitle = "إعدادات التطبيق وعن سبق",
        )

        // 2) Profile section
        ProfileSection(
            user = currentUser,
            onLoginClick = onLoginClick,
            onEditProfileClick = onEditProfileClick,
            onChangePasswordClick = onChangePasswordClick,
            onSubmitOpinionClick = onSubmitOpinionClick,
            onSubmitNewsClick = onSubmitNewsClick,
            onNotificationsClick = onNotificationsClick,
        )

        // 2.5) Profile-completion nudge — mirrors iOS PR #58. Shown only
        // when at least one of {city/gender, interests} is missing. Each
        // CTA is gated independently; the whole banner collapses once
        // both are filled in.
        currentUser?.let { u ->
            ProfileCompletionBanner(
                needsBasics = !u.hasMinimumBasicProfile,
                needsInterests = !u.hasAtLeastOneInterest,
                onEditProfileClick = onEditProfileClick,
                onPickInterestsClick = onPickInterestsClick,
            )
        }

        // 3) Contributor dashboard (writers/reporters/admins only)
        currentUser?.let { u ->
            if (u.isWriter || u.isReporter || u.isAdminLike) {
                DashboardEntryRow(onClick = onDashboardClick)
            }
        }

        // 4) Loyalty entry (signed-in only)
        if (currentUser != null) {
            LoyaltyEntryRow(onClick = onLoyaltyClick)
        }

        // 4-ب) مركز التوقّعات — المنصة المركزية (متاح للجميع، الإرسال للمسجّلين)
        PredictionsEntryRow(onClick = onPredictionsClick)

        // 4) Press card entry — DEFERRED (editorial direction 2026-05-19)

        // 5) Display
        DisplaySection(viewModel = viewModel, settings = settings)

        // 6) Subscription
        SubscriptionSection(onNewsletterClick = onNewsletterClick)

        // 7) About
        AboutSection(
            onPrivacyClick = onPrivacyClick,
            onTermsClick = onTermsClick,
            onOpenWebsite = onOpenWebsite,
            onOpenTwitter = onOpenTwitter,
            onContactClick = onContactClick,
        )

        // 8) Account danger (signed-in only)
        if (currentUser != null) {
            AccountDangerSection(
                onClearDataClick = { showClearConfirm = true },
                onDeleteAccountClick = onDeleteAccountClick,
                onLogoutClick = { showLogoutConfirm = true },
            )
        }

        // 9) App info
        AppInfoSection()
    }

    // Confirm + result dialogs for "مسح البيانات المحلية" — mirrors the
    // two .alert() blocks at SettingsView.swift:102-112.
    if (showClearConfirm) {
        ClearLocalDataConfirmDialog(
            onCancel = { showClearConfirm = false },
            onConfirm = {
                showClearConfirm = false
                viewModel.clearLocalData()
            },
        )
    }

    // Logout confirmation — mirrors iOS SettingsView.swift:132-139.
    if (showLogoutConfirm) {
        LogoutConfirmDialog(
            onCancel = { showLogoutConfirm = false },
            onConfirm = {
                showLogoutConfirm = false
                onLogout()
            },
        )
    }

    when (clearState) {
        SettingsViewModel.ClearLocalDataState.Cleared -> ClearLocalDataResultDialog(
            title = "تم المسح",
            message = "تم مسح البيانات المحلية بنجاح.",
            tint = SabqTheme.colors.leaf,
            onDismiss = viewModel::acknowledgeClearLocalData,
        )
        SettingsViewModel.ClearLocalDataState.Error -> ClearLocalDataResultDialog(
            title = "تعذّر المسح",
            message = "حدث خطأ أثناء مسح البيانات. حاول مرة أخرى.",
            tint = SabqTheme.colors.coral,
            onDismiss = viewModel::acknowledgeClearLocalData,
        )
        SettingsViewModel.ClearLocalDataState.Idle -> Unit
    }
}

@Composable
private fun LogoutConfirmDialog(onCancel: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = SabqTheme.colors.surface,
        titleContentColor = SabqTheme.colors.ink,
        textContentColor = SabqTheme.colors.secondaryInk,
        title = { Text("تسجيل الخروج؟", fontWeight = FontWeight.Bold) },
        text = { Text("سيتم إنهاء جلستك على هذا الجهاز.") },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("خروج", color = SabqTheme.colors.coral, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text("إلغاء", color = SabqTheme.colors.secondaryInk)
            }
        },
    )
}

@Composable
private fun ClearLocalDataConfirmDialog(onCancel: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = SabqTheme.colors.surface,
        titleContentColor = SabqTheme.colors.ink,
        textContentColor = SabqTheme.colors.secondaryInk,
        title = { Text("مسح البيانات المحلية؟", fontWeight = FontWeight.Bold) },
        text = {
            Text(
                "سيتم حذف المقالات المحفوظة، عمليات البحث الأخيرة، والكلمات المتابعة من هذا الجهاز. " +
                    "لن يتأثر حسابك ولن يتم تسجيل خروجك.",
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("مسح", color = SabqTheme.colors.coral, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text("إلغاء", color = SabqTheme.colors.secondaryInk)
            }
        },
    )
}

@Composable
private fun ClearLocalDataResultDialog(
    title: String,
    message: String,
    tint: Color,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SabqTheme.colors.surface,
        titleContentColor = SabqTheme.colors.ink,
        textContentColor = SabqTheme.colors.secondaryInk,
        title = { Text(title, fontWeight = FontWeight.Bold) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("حسناً", color = tint, fontWeight = FontWeight.Bold)
            }
        },
    )
}

// MARK: - Header

@Composable
private fun CompactScreenHeader(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = title,
            style = SabqTheme.typography.screenTitle,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = subtitle,
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

// MARK: - Profile section

@Composable
private fun ProfileSection(
    user: User?,
    onLoginClick: () -> Unit,
    onEditProfileClick: () -> Unit,
    onChangePasswordClick: () -> Unit,
    onSubmitOpinionClick: () -> Unit,
    onSubmitNewsClick: () -> Unit,
    onNotificationsClick: () -> Unit,
) {
    SurfaceCard(accent = SabqTheme.colors.primaryEnd) {
        if (user != null) {
            SignedInProfile(
                user = user,
                onEditProfileClick = onEditProfileClick,
                onChangePasswordClick = onChangePasswordClick,
                onSubmitOpinionClick = onSubmitOpinionClick,
                onSubmitNewsClick = onSubmitNewsClick,
                onNotificationsClick = onNotificationsClick,
            )
        } else {
            SignedOutPrompt(onLoginClick = onLoginClick)
        }
    }
}

@Composable
private fun SignedInProfile(
    user: User,
    onEditProfileClick: () -> Unit,
    onChangePasswordClick: () -> Unit,
    onSubmitOpinionClick: () -> Unit,
    onSubmitNewsClick: () -> Unit,
    onNotificationsClick: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Identity row: avatar + name + verified + role + email
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
                    if (user.isVerified) {
                        Icon(
                            imageVector = Icons.Filled.Verified,
                            contentDescription = "موثّق",
                            tint = SabqTheme.colors.primaryEnd,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = roleIcon(user.primaryRoleKey),
                        contentDescription = null,
                        tint = SabqTheme.colors.primaryEnd,
                        modifier = Modifier.size(11.dp),
                    )
                    Text(
                        text = user.localizedRole,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = SabqTheme.colors.primaryEnd,
                        ),
                    )
                }

                user.email?.takeIf { it.isNotBlank() }?.let { email ->
                    Text(
                        text = email,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 12.sp,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                        maxLines = 1,
                    )
                }
            }
        }

        // Job title + department row (when set, and not duplicate of role)
        user.jobTitle?.takeIf { it.isNotBlank() && it != user.localizedRole }?.let { title ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Business,
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
                user.department?.takeIf { it.isNotBlank() }?.let { dept ->
                    Text(
                        text = "·",
                        style = SabqTheme.typography.metaSmall.copy(color = SabqTheme.colors.tertiaryInk),
                    )
                    Text(
                        text = dept,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                    )
                }
            }
        }

        // Bio (3 lines max)
        user.bio?.takeIf { it.isNotBlank() }?.let { bio ->
            Text(
                text = bio,
                style = SabqTheme.typography.meta.copy(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Normal,
                    color = SabqTheme.colors.secondaryInk,
                ),
                maxLines = 3,
            )
        }

        // Email not verified warning (orange)
        if (user.emailVerified == false) {
            EmailNotVerifiedWarning()
        }

        // Edit profile capsule
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f))
                    .clickable { onEditProfileClick() }
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
        }

        // Role-gated submission cards
        SubmissionCards(
            user = user,
            onSubmitOpinionClick = onSubmitOpinionClick,
            onSubmitNewsClick = onSubmitNewsClick,
            onNotificationsClick = onNotificationsClick,
        )

        // Change password row (inside profile card per iOS)
        AccountActionsRow(onChangePasswordClick = onChangePasswordClick)
    }
}

@Composable
private fun EmailNotVerifiedWarning() {
    val orange = Color(red = 0.95f, green = 0.55f, blue = 0.20f)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(orange.copy(alpha = 0.08f))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.WarningAmber,
            contentDescription = null,
            tint = orange,
            modifier = Modifier.size(13.dp),
        )
        Text(
            text = "لم يتم تأكيد البريد الإلكتروني بعد",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = orange,
            ),
        )
    }
}

@Composable
private fun AccountActionsRow(onChangePasswordClick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        HorizontalDivider(
            color = SabqTheme.colors.outline.copy(alpha = 0.5f),
            thickness = 0.5.dp,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onChangePasswordClick() }
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.LockReset,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = "تغيير كلمة المرور",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.ink,
                ),
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = null,
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

// MARK: - Submission cards (role-gated)

@Composable
private fun SubmissionCards(
    user: User,
    onSubmitOpinionClick: () -> Unit,
    onSubmitNewsClick: () -> Unit,
    onNotificationsClick: () -> Unit,
) {
    val writerVisible = user.isWriter || user.isAdminLike
    val reporterVisible = user.isReporter || user.isAdminLike

    if (!writerVisible && !reporterVisible) return

    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(top = 4.dp),
    ) {
        if (writerVisible) {
            SubmissionCard(
                title = "إرسال مقالة للنشر",
                subtitle = "اكتب رأيك أو مقالتك وسنراجعها للنشر",
                icon = Icons.Filled.Edit,
                tint = SabqTheme.colors.primaryEnd,
                onClick = onSubmitOpinionClick,
            )
        }
        if (reporterVisible) {
            SubmissionCard(
                title = "إرسال خبر",
                subtitle = "أرسل خبرك مع الصور — يصل لغرفة الأخبار",
                icon = Icons.Outlined.Article,
                tint = SabqTheme.colors.coral,
                onClick = onSubmitNewsClick,
            )
        }
        SubmissionCard(
            title = "إشعاراتي التحريرية",
            subtitle = "متابعة جدولة ونشر ومراجعة محتواك",
            icon = Icons.Filled.Notifications,
            tint = SabqTheme.colors.teal,
            onClick = onNotificationsClick,
        )
    }
}

@Composable
private fun SubmissionCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    tint: Color,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tint.copy(alpha = 0.05f), shape)
            .border(BorderStroke(0.5.dp, tint.copy(alpha = 0.20f)), shape)
            .clickable { onClick() }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(18.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = title,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = subtitle,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                ),
                maxLines = 2,
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

@Composable
private fun ProfileAvatar(user: User, size: Dp) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val avatarUrl = user.avatarUrl?.takeIf { it.isNotBlank() }
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        if (avatarUrl != null) {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(context)
                    .data(avatarUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = user.displayName,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size),
                loading = { AvatarInitial(user = user, size = size) },
                error = { AvatarInitial(user = user, size = size) },
            )
        } else {
            AvatarInitial(user = user, size = size)
        }
    }
}

@Composable
private fun AvatarInitial(user: User, size: Dp) {
    Text(
        text = user.displayName.take(1),
        style = SabqTheme.typography.cardTitle.copy(
            fontSize = (size.value * 0.38f).sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.primaryEnd,
        ),
    )
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
                    imageVector = Icons.Filled.PersonOff,
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
                    style = SabqTheme.typography.cardTitle.copy(
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

        val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(
                    Brush.linearGradient(
                        listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                    ),
                    shape,
                )
                .clickable { onLoginClick() }
                .padding(vertical = 14.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
            Text(
                text = "تسجيل الدخول",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                ),
            )
        }
    }
}

// MARK: - Profile completion banner

/** "أكمل بياناتك" banner — mirrors iOS PR #58. The two CTAs are gated
 *  independently so the whole thing collapses gracefully as the user
 *  fills in pieces. */
@Composable
private fun ProfileCompletionBanner(
    needsBasics: Boolean,
    needsInterests: Boolean,
    onEditProfileClick: () -> Unit,
    onPickInterestsClick: () -> Unit,
) {
    if (!needsBasics && !needsInterests) return

    val outerShape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(outerShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.06f), outerShape)
            .border(BorderStroke(1.dp, SabqTheme.colors.primaryEnd.copy(alpha = 0.18f)), outerShape)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(18.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = "أكمل بياناتك",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                )
                val hint = when {
                    needsBasics && needsInterests -> "ساعدنا نقدّم لك تجربة شخصية أذكى"
                    needsBasics -> "أكمل بياناتك الشخصية لتجربة أدق"
                    else -> "اختر اهتماماتك لنرشّح لك ما يهمّك"
                }
                Text(
                    text = hint,
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 2,
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (needsBasics) {
                ProfileCompletionCTA(
                    label = "البيانات الشخصية",
                    icon = Icons.Filled.PersonOutline,
                    isPrimary = true,
                    onClick = onEditProfileClick,
                    modifier = Modifier.weight(1f),
                )
            }
            if (needsInterests) {
                ProfileCompletionCTA(
                    label = "اهتماماتك",
                    icon = Icons.Filled.Tune,
                    isPrimary = !needsBasics, // standalone interest CTA becomes the filled primary
                    onClick = onPickInterestsClick,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ProfileCompletionCTA(
    label: String,
    icon: ImageVector,
    isPrimary: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(9.dp)
    val bg = if (isPrimary) SabqTheme.colors.primaryEnd else SabqTheme.colors.primaryEnd.copy(alpha = 0.10f)
    val fg = if (isPrimary) Color.White else SabqTheme.colors.primaryEnd
    Row(
        modifier = modifier
            .clip(shape)
            .background(bg, shape)
            .border(
                BorderStroke(
                    width = if (isPrimary) 0.dp else 1.dp,
                    color = if (isPrimary) Color.Transparent else SabqTheme.colors.primaryEnd.copy(alpha = 0.35f),
                ),
                shape,
            )
            .clickable { onClick() }
            .padding(vertical = 9.dp, horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = fg,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = label,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = fg,
            modifier = Modifier.weight(1f, fill = false),
        )
    }
}

// MARK: - Dashboard entry

@Composable
private fun DashboardEntryRow(onClick: () -> Unit) {
    val accentGreen = Color(red = 0.30f, green = 0.69f, blue = 0.31f)
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
                .background(accentGreen.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.BarChart,
                contentDescription = null,
                tint = accentGreen,
                modifier = Modifier.size(19.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "مركز الأداء",
                style = SabqTheme.typography.compactCardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "إحصائيات مقالاتك وتفاعل جمهورك",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

// MARK: - Loyalty entry

@Composable
private fun LoyaltyEntryRow(onClick: () -> Unit) {
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
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

// مدخل مركز التوقّعات — نفس بنية LoyaltyEntryRow
@Composable
private fun PredictionsEntryRow(onClick: () -> Unit) {
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
                .background(SabqTheme.colors.primaryStart.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.SportsSoccer,
                contentDescription = null,
                tint = SabqTheme.colors.primaryStart,
                modifier = Modifier.size(19.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "توقّعات البطولات",
                style = SabqTheme.typography.compactCardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "توقّع نتائج المباريات وتنافس على النقاط والجوائز",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

// MARK: - Display

@Composable
private fun DisplaySection(viewModel: SettingsViewModel, settings: com.sabq.smart.data.AppSettings) {
    SurfaceCard {
        SectionHeader(
            title = "العرض",
            subtitle = "تخصيص مظهر التطبيق",
            icon = Icons.Filled.PhotoCamera,
            tint = SabqTheme.colors.primaryEnd,
        )

        // Dark mode toggle
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = "الوضع الداكن",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.ink,
                    ),
                )
                Text(
                    text = if (settings.followsSystemDark) "يتبع إعدادات النظام تلقائياً"
                    else "تفعيل المظهر الداكن",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }
            Switch(
                checked = if (settings.followsSystemDark)
                    androidx.compose.foundation.isSystemInDarkTheme()
                else settings.isDarkMode,
                onCheckedChange = {
                    if (settings.followsSystemDark) viewModel.setFollowsSystem(false)
                    viewModel.setDarkMode(it)
                },
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = SabqTheme.colors.primaryEnd,
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = SabqTheme.colors.outline,
                ),
            )
        }

        // Accent colour picker
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = "لون التطبيق",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                SabqAccent.entries.forEach { accent ->
                    AccentDot(
                        accent = accent,
                        selected = settings.accent == accent,
                        onClick = { viewModel.setAccent(accent) },
                    )
                }
            }
        }

        // Font size slider with preview
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        text = "حجم الخط",
                        style = SabqTheme.typography.cardTitle.copy(
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = SabqTheme.colors.ink,
                        ),
                    )
                    Text(
                        text = "حجم النص: ${settings.articleFontSize.toInt()}",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 13.sp,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                    )
                }
                SmallSquareBadge(icon = Icons.Filled.Article, tint = SabqTheme.colors.primaryEnd)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "أ",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                )
                Slider(
                    value = settings.articleFontSize,
                    onValueChange = { viewModel.setFontSize(it) },
                    valueRange = 14f..24f,
                    steps = 9,
                    modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(
                        thumbColor = SabqTheme.colors.primaryEnd,
                        activeTrackColor = SabqTheme.colors.primaryEnd,
                        inactiveTrackColor = SabqTheme.colors.outline,
                    ),
                )
                Text(
                    text = "أ",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }
            Text(
                text = "معاينة حجم الخط في المقالات",
                style = SabqTheme.typography.body.copy(
                    fontSize = settings.articleFontSize.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
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
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(color)
                .border(
                    width = if (selected) 3.dp else 0.dp,
                    color = Color.White,
                    shape = CircleShape,
                )
                .clickable { onClick() },
        )
        Text(
            text = accent.arabicName,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 11.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                color = if (selected) color else SabqTheme.colors.tertiaryInk,
            ),
        )
    }
}

// MARK: - Subscription

@Composable
private fun SubscriptionSection(onNewsletterClick: () -> Unit) {
    SurfaceCard(accent = SabqTheme.colors.teal) {
        SectionHeader(
            title = "اشتراكات",
            subtitle = "ابقَ على اطلاع دائم",
            icon = Icons.Filled.Email,
            tint = SabqTheme.colors.teal,
        )
        SettingsRow(
            title = "النشرة البريدية",
            subtitle = "اشترك في ملخص الأخبار اليومي",
            icon = Icons.Filled.Inbox,
            tint = SabqTheme.colors.teal,
            onClick = onNewsletterClick,
        )
    }
}

// MARK: - About

@Composable
private fun AboutSection(
    onPrivacyClick: () -> Unit,
    onTermsClick: () -> Unit,
    onOpenWebsite: () -> Unit,
    onOpenTwitter: () -> Unit,
    onContactClick: () -> Unit,
) {
    SurfaceCard(accent = SabqTheme.colors.primaryEnd) {
        SectionHeader(
            title = "عن سبق",
            subtitle = "صحيفة إلكترونية سعودية",
            icon = Icons.Filled.Campaign,
            tint = SabqTheme.colors.primaryEnd,
        )
        Text(
            text = "سبق.. حيث يلتقي الخبر الموثوق بذكاء المستقبل ✨. تغطية لحظية لا تتوقف، بتقنيات الذكاء الاصطناعي وأقلام محررين من قلب الحدث.",
            style = SabqTheme.typography.body.copy(
                fontSize = 15.sp,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
        SettingsRow(
            title = "خصوصيتك أولاً",
            subtitle = "كيف نحمي بياناتك الشخصية؟",
            icon = Icons.Filled.Security,
            tint = SabqTheme.colors.leaf,
            onClick = onPrivacyClick,
        )
        SettingsRow(
            title = "شروط الاستخدام",
            subtitle = "اعرف حقوقك وحقوقنا",
            icon = Icons.Filled.Description,
            tint = SabqTheme.colors.sky,
            onClick = onTermsClick,
        )
        SettingsRow(
            title = "اقرأ أكثر على موقعنا",
            subtitle = "sabq.org",
            icon = Icons.Filled.Language,
            tint = SabqTheme.colors.primaryEnd,
            trailingIcon = Icons.AutoMirrored.Filled.OpenInNew,
            onClick = onOpenWebsite,
        )
        SettingsRow(
            title = "تابعنا على إكس",
            subtitle = "@sabqorg آخر الأخبار لحظة بلحظة",
            icon = Icons.Filled.AlternateEmail,
            tint = SabqTheme.colors.sky,
            trailingIcon = Icons.AutoMirrored.Filled.OpenInNew,
            onClick = onOpenTwitter,
        )
        SettingsRow(
            title = "راسلنا",
            subtitle = "آراؤك تهمنا، نرد في أقرب وقت",
            icon = Icons.Filled.Email,
            tint = SabqTheme.colors.teal,
            onClick = onContactClick,
        )
    }
}

// MARK: - Danger

@Composable
private fun AccountDangerSection(
    onClearDataClick: () -> Unit,
    onDeleteAccountClick: () -> Unit,
    onLogoutClick: () -> Unit,
) {
    SurfaceCard(accent = SabqTheme.colors.coral) {
        SectionHeader(
            title = "منطقة الخطر",
            subtitle = "إجراءات تخصّ حسابك وبياناتك",
            icon = Icons.Filled.WarningAmber,
            tint = SabqTheme.colors.coral,
        )
        DangerRow(
            title = "مسح البيانات المحلية",
            subtitle = "إزالة المقالات المحفوظة وعمليات البحث والكلمات المتابعة من هذا الجهاز. لن يتأثر حسابك.",
            icon = Icons.Filled.Inbox,
            onClick = onClearDataClick,
        )
        DangerRow(
            title = "حذف الحساب",
            subtitle = "حذف نهائي لحسابك وكل بياناتك من سبق. لا يمكن التراجع عن هذه الخطوة.",
            icon = Icons.Filled.PersonOff,
            onClick = onDeleteAccountClick,
        )
        DangerRow(
            title = "تسجيل الخروج",
            subtitle = "إنهاء جلستك على هذا الجهاز. يمكنك تسجيل الدخول مجددًا في أي وقت.",
            icon = Icons.Filled.Logout,
            onClick = onLogoutClick,
        )
    }
}

@Composable
private fun DangerRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SmallSquareBadge(icon = icon, tint = SabqTheme.colors.coral)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.coral,
                ),
            )
            Text(
                text = subtitle,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

// MARK: - App info

@Composable
private fun AppInfoSection() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp, bottom = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Image(
            painter = painterResource(id = R.drawable.sabq_logo),
            contentDescription = "سبق",
            contentScale = ContentScale.Fit,
            modifier = Modifier.height(56.dp),
        )
        Text(
            text = "الإصدار ${com.sabq.smart.BuildConfig.VERSION_NAME}",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            ),
        )
        Text(
            text = "صنع بكل حب في السعودية 🇸🇦",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
    }
}

// MARK: - Shared atoms

@Composable
private fun SectionHeader(
    title: String,
    subtitle: String,
    icon: ImageVector,
    tint: Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SmallSquareBadge(icon = icon, tint = tint)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = title,
                style = SabqTheme.typography.sectionHeader.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = subtitle,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun SettingsRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    tint: Color,
    trailingIcon: ImageVector = Icons.AutoMirrored.Filled.ArrowBack,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SmallSquareBadge(icon = icon, tint = tint)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = title,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = subtitle,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
        Icon(
            imageVector = trailingIcon,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

@Composable
private fun SmallSquareBadge(icon: ImageVector, tint: Color) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(tint.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(15.dp),
        )
    }
}

// MARK: - Role icons

@Composable
private fun roleIcon(key: String?): ImageVector = when (key?.lowercase()) {
    "admin", "system_admin", "system-admin" -> Icons.Filled.AdminPanelSettings
    "editor", "editor_in_chief", "editor-in-chief",
    "senior_editor", "senior-editor",
    "managing_editor", "managing-editor",
    "editorial_manager", "editorial-manager",
    -> Icons.Filled.Edit
    "journalist", "reporter", "correspondent",
    "writer", "author",
    "article_writer", "article-writer",
    "article_author", "article-author",
    "opinion_author", "opinion-author",
    -> Icons.Outlined.Article
    "columnist" -> Icons.Filled.FormatQuote
    "photographer" -> Icons.Filled.Camera
    "moderator", "comments_moderator", "comments-moderator" -> Icons.Filled.Flag
    "publisher" -> Icons.Filled.Campaign
    "contributor" -> Icons.Filled.Send
    else -> Icons.Filled.CheckCircle
}
