package com.sabq.smart.feature.presscard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.data.User
import com.sabq.smart.ui.theme.SabqTheme

// «بطاقتي الصحفية» — مرآة iOS PressCardActivationView + PressCardView.
// لا بوابة عميل: أي مسجَّل دخول يفتح الشاشة وعلم `authorized` من الخادم
// هو الفيصل (مطابقة iOS). أي فشل شبكة يُظهر حالة «غير مصرّح».
//
// لا Apple Wallet على أندرويد — الإصدار هنا أثره في الخادم (تسجيل
// الرقم التسلسلي) والبطاقة المرئية داخل التطبيق هي البديل.

/** أزرق سبق السماوي — نفس rgb بطاقة iOS ‏(0.11,‏0.64,‏0.94). */
private val CardAccent = Color(0.11f, 0.64f, 0.94f)
private val CardInkPrimary = Color(0.10f, 0.13f, 0.21f)
private val CardInkSecondary = Color(0.34f, 0.39f, 0.50f)
private val CardInkMuted = Color(0.55f, 0.59f, 0.66f)

@Composable
fun PressCardScreen(
    onBack: () -> Unit,
    viewModel: PressCardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val user by viewModel.user.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            when {
                state.loading -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 60.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
                }

                state.authorized && state.status != null -> AuthorizedBody(
                    status = state.status!!,
                    user = user,
                    issuing = state.issuing,
                    onIssue = viewModel::issue,
                )

                else -> UnauthorizedBody()
            }
        }
    }

    state.issueError?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::dismissIssueError,
            containerColor = SabqTheme.colors.surface,
            titleContentColor = SabqTheme.colors.ink,
            textContentColor = SabqTheme.colors.secondaryInk,
            title = { Text("لم نتمكّن من إصدار البطاقة", fontWeight = FontWeight.Bold) },
            text = { Text(message) },
            confirmButton = {
                TextButton(onClick = viewModel::dismissIssueError) {
                    Text("حسناً", color = SabqTheme.colors.primaryEnd, fontWeight = FontWeight.Bold)
                }
            },
        )
    }
}

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
            text = "بطاقتي الصحفية",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.width(40.dp))
    }
}

// ============================================================
// الحالة المصرّح بها — البطاقة المرئية + الإصدار + الشرح
// ============================================================

@Composable
private fun AuthorizedBody(
    status: PressPassStatusDto,
    user: User?,
    issuing: Boolean,
    onIssue: () -> Unit,
) {
    val userName = pressCardUserName(user)
    val roleAr = status.roleLabel?.takeIf { it.isNotBlank() } ?: "عضو سبق"

    PressCardVisual(
        userName = userName,
        roleAr = roleAr,
        jobTitle = status.jobTitle?.takeIf { it.isNotBlank() && it != roleAr },
        serialNumber = if (status.hasPass) status.serialNumber else null,
        avatarUrl = user?.avatarUrl,
    )

    IssuePanel(status = status, issuing = issuing, onIssue = onIssue)

    HelpSection()
}

/** الاسم الأول + الأخير، ثم البريد، ثم «حامل البطاقة» — نفس تدرج iOS. */
private fun pressCardUserName(user: User?): String {
    val combined = listOfNotNull(user?.firstName, user?.lastName)
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .trim()
    if (combined.isNotEmpty()) return combined
    return user?.email?.takeIf { it.isNotBlank() } ?: "حامل البطاقة"
}

@Composable
private fun PressCardVisual(
    userName: String,
    roleAr: String,
    jobTitle: String?,
    serialNumber: String?,
    avatarUrl: String?,
) {
    val shape = RoundedCornerShape(22.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1.586f)
            .clip(shape)
            .background(Color.White)
            .border(0.5.dp, Color.Black.copy(alpha = 0.06f), shape)
            // هالة سماوية خفيفة أعلى الطرف البادئ (topTrailing في iOS
            // المقلوب RTL) — عمق بلا خلفية ملوّنة.
            .drawBehind {
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(CardAccent.copy(alpha = 0.10f), Color.Transparent),
                        center = Offset(size.width * 0.06f, 0f),
                        radius = size.width * 0.55f,
                    ),
                )
            },
    ) {
        // شريط العلامة العلوي
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(CardAccent)
                .align(Alignment.TopCenter),
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "سبق · بطاقة صحفية",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 2.sp,
                        color = CardInkMuted,
                    )
                    Text(
                        text = roleAr,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        color = CardAccent,
                    )
                }
                Spacer(Modifier.weight(1f))
                Icon(
                    imageVector = Icons.Filled.Verified,
                    contentDescription = null,
                    tint = CardAccent,
                    modifier = Modifier.size(24.dp),
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                CardAvatar(avatarUrl = avatarUrl)
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        text = "الاسم",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 1.5.sp,
                        color = CardInkMuted,
                    )
                    Text(
                        text = userName,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = CardInkPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    jobTitle?.let {
                        Text(
                            text = it,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = CardInkSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            Row(verticalAlignment = Alignment.Bottom) {
                if (!serialNumber.isNullOrBlank()) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = "رقم البطاقة",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Medium,
                            letterSpacing = 1.5.sp,
                            color = CardInkMuted,
                        )
                        Text(
                            text = serialNumber,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 2.sp,
                            color = CardInkPrimary,
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                Text(
                    text = "سبق",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = CardAccent,
                )
            }
        }
    }
}

@Composable
private fun CardAvatar(avatarUrl: String?) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(shape)
            .background(CardAccent.copy(alpha = 0.08f))
            .border(1.dp, CardAccent.copy(alpha = 0.30f), shape),
        contentAlignment = Alignment.Center,
    ) {
        if (!avatarUrl.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = avatarUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                error = { AvatarFallback() },
                loading = { AvatarFallback() },
            )
        } else {
            AvatarFallback()
        }
    }
}

@Composable
private fun AvatarFallback() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Icon(
            imageVector = Icons.Filled.Person,
            contentDescription = null,
            tint = CardAccent.copy(alpha = 0.55f),
            modifier = Modifier.size(28.dp),
        )
    }
}

// ============================================================
// لوحة الإصدار / إعادة الإصدار
// ============================================================

@Composable
private fun IssuePanel(
    status: PressPassStatusDto,
    issuing: Boolean,
    onIssue: () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), shape)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!status.hasPass) {
            Text(
                text = "أصدر بطاقتك الرسمية من سبق — تُسجَّل برقم تسلسلي وتظهر هنا في أي وقت.",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
                textAlign = TextAlign.Center,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(CardAccent, CardAccent.copy(alpha = 0.85f)),
                        ),
                    )
                    .clickable(enabled = !issuing) { onIssue() }
                    .padding(vertical = 13.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (issuing) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Icon(
                    imageVector = Icons.Filled.Badge,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (issuing) "جارٍ الإصدار…" else "إصدار البطاقة",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                )
            }
        } else {
            Text(
                text = "بطاقتك صادرة برقم ${status.serialNumber ?: "—"}",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                textAlign = TextAlign.Center,
            )
            HorizontalDivider(
                color = SabqTheme.colors.outline.copy(alpha = 0.5f),
                thickness = 0.5.dp,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(enabled = !issuing) { onIssue() }
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (issuing) {
                    CircularProgressIndicator(
                        color = CardAccent,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(13.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    text = "إعادة إصدار البطاقة",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = CardAccent,
                )
            }
        }
    }
}

// ============================================================
// غير مصرّح + الشرح
// ============================================================

@Composable
private fun UnauthorizedBody() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
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
            text = "غير مصرّح لك بإصدار بطاقة صحفية",
            fontSize = 16.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
            textAlign = TextAlign.Center,
        )
        Text(
            text = "البطاقة متاحة للمراسلين وكتّاب الرأي والمحرّرين. إذا اعتقدت أن هذا خطأ، تواصل مع إدارة سبق.",
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
    }
}

@Composable
private fun HelpSection() {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "كيف تعمل البطاقة؟",
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        HelpBullet("تُثبت هويتك الصحفية أثناء التغطيات الميدانية")
        HelpBullet("إصدار رسمي من صحيفة سبق برقم تسلسلي موثّق")
        HelpBullet("صالحة ما دامت عضويتك في سبق فعّالة")
    }
}

@Composable
private fun HelpBullet(text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(4.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.secondaryInk),
        )
        Text(
            text = text,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}
