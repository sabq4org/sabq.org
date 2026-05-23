package com.sabq.smart.feature.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Conversational SABQ-AI signup — 1:1 port of iOS
 * `SignUpFlowView.swift`. A small AI character asks for name → email →
 * password → interests, then submits and plays an animated "نُجهّز
 * ملفّك الذكي…" sequence before handing the session back to the host.
 */
@Composable
fun SmartSignUpScreen(
    viewModel: SmartSignUpViewModel = hiltViewModel(),
    onClose: () -> Unit,
    onDone: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var input by remember { mutableStateOf("") }
    var didStart by remember { mutableStateOf(false) }

    // Kick off the opening AI bubbles once. iOS does the same with a
    // `didStart` guard so re-renders don't re-greet the user.
    LaunchedEffect(Unit) {
        if (!didStart) {
            didStart = true
            typeAi(viewModel, "مرحباً بك في سبق ✨")
            typeAi(viewModel, "خلف كل خبر هنا ذكاءٌ. وخلف ملفّك… ذكاءٌ مخصّص لك وحدك.")
            typeAi(viewModel, "نبدأ من شيء واحد — كيف نناديك؟")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding()
            .imePadding(),
    ) {
        SmartSignUpHeader(onClose = onClose)

        when (state.step) {
            SmartSignUpViewModel.Step.Building, SmartSignUpViewModel.Step.Done -> {
                BuildingProfile(
                    state = state,
                    onDone = onDone,
                    onAdvance = { idx -> viewModel.setBuildProgress(idx) },
                    onFinishStep = { viewModel.finish() },
                )
            }
            SmartSignUpViewModel.Step.PendingActivation -> {
                RegistrationPendingCard(
                    message = state.pendingActivationMessage
                        ?: "تم إنشاء الحساب بنجاح. يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب.",
                    email = state.pendingActivationEmail,
                    resend = state.resend,
                    onResend = viewModel::resendActivation,
                    onDone = onDone,
                )
            }
            else -> {
                ChatList(
                    messages = state.messages,
                    step = state.step,
                    modifier = Modifier.weight(1f),
                )
                InputArea(
                    step = state.step,
                    state = state,
                    input = input,
                    onInputChange = { input = it },
                    onSubmit = {
                        scope.launch {
                            handleSubmit(viewModel, state, input) { input = "" }
                        }
                    },
                    onToggleInterest = viewModel::toggleInterest,
                    onConfirmInterests = {
                        scope.launch {
                            handleInterestsConfirm(viewModel, state)
                        }
                    },
                    onRetryFromError = {
                        viewModel.clearError()
                        viewModel.setStep(SmartSignUpViewModel.Step.AskPassword)
                    },
                )
            }
        }
    }
}

// MARK: - Header (SABQ AI orb + close)

@Composable
private fun SmartSignUpHeader(onClose: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(SabqTheme.colors.surface)
            .padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        AiOrb(size = 36.dp, iconSize = 16.dp)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            Text(
                text = "SABQ AI",
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "مرشدك إلى ملفّك",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.paleFill)
                .clickable { onClose() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = "إغلاق",
                tint = SabqTheme.colors.secondaryInk,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}

@Composable
private fun AiOrb(size: androidx.compose.ui.unit.Dp, iconSize: androidx.compose.ui.unit.Dp) {
    val gradient = Brush.linearGradient(
        listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
    )
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(gradient),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(iconSize),
        )
    }
}

// MARK: - Chat list

@Composable
private fun ChatList(
    messages: List<SmartSignUpViewModel.Bubble>,
    step: SmartSignUpViewModel.Step,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size, step) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }
    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        state = listState,
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        items(messages, key = { it.id }) { bubble ->
            BubbleRow(bubble)
        }
        if (step == SmartSignUpViewModel.Step.Submitting) {
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CircularProgressIndicator(
                        color = SabqTheme.colors.primaryEnd,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = "ننشئ حسابك…",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.secondaryInk,
                    )
                }
            }
        }
    }
}

@Composable
private fun BubbleRow(bubble: SmartSignUpViewModel.Bubble) {
    when (bubble.role) {
        SmartSignUpViewModel.BubbleRole.Ai -> Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            AiOrb(size = 26.dp, iconSize = 11.dp)
            AiBubble(bubble.text, modifier = Modifier.weight(1f, fill = false))
            Spacer(modifier = Modifier.width(30.dp))
        }
        SmartSignUpViewModel.BubbleRole.User -> Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            Spacer(modifier = Modifier.width(30.dp))
            UserBubble(bubble.text)
        }
    }
}

@Composable
private fun AiBubble(text: String, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(18.dp)
    Text(
        text = text,
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
        color = SabqTheme.colors.ink,
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.4f)), shape)
            .padding(horizontal = 14.dp, vertical = 11.dp),
    )
}

@Composable
private fun UserBubble(text: String) {
    val shape = RoundedCornerShape(18.dp)
    Text(
        text = text,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        modifier = Modifier
            .clip(shape)
            .background(SabqTheme.colors.primaryEnd, shape)
            .padding(horizontal = 14.dp, vertical = 11.dp),
    )
}

// MARK: - Input

@Composable
private fun InputArea(
    step: SmartSignUpViewModel.Step,
    state: SmartSignUpViewModel.UiState,
    input: String,
    onInputChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onToggleInterest: (String) -> Unit,
    onConfirmInterests: () -> Unit,
    onRetryFromError: () -> Unit,
) {
    val errorMessage = state.errorMessage
    when (step) {
        SmartSignUpViewModel.Step.AskInterests -> InterestsPicker(
            categories = state.categories,
            selectedIds = state.selectedInterestIds,
            onToggle = onToggleInterest,
            onConfirm = onConfirmInterests,
        )
        SmartSignUpViewModel.Step.Submitting -> {
            // Submission shows a progress row inside the chat list; no
            // input affordance here.
        }
        else -> {
            Column {
                if (errorMessage != null) {
                    ErrorBanner(message = errorMessage, onRetry = onRetryFromError)
                }
                TextInputBar(
                    step = step,
                    input = input,
                    onInputChange = onInputChange,
                    onSubmit = onSubmit,
                )
            }
        }
    }
}

@Composable
private fun TextInputBar(
    step: SmartSignUpViewModel.Step,
    input: String,
    onInputChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val placeholder = when (step) {
        SmartSignUpViewModel.Step.AskName -> "اكتب اسمك"
        SmartSignUpViewModel.Step.AskEmail -> "you@example.com"
        SmartSignUpViewModel.Step.AskPassword -> "اختر كلمة مرور قوية"
        else -> ""
    }
    val canSubmit = when (step) {
        SmartSignUpViewModel.Step.AskName -> input.trim().isNotEmpty()
        SmartSignUpViewModel.Step.AskEmail -> input.contains('@') && input.contains('.')
        // Mirrors iOS ≥6 chars. Repo also accepts this; deeper validation
        // lives server-side.
        SmartSignUpViewModel.Step.AskPassword -> input.length >= 6
        else -> false
    }
    val keyboardType = when (step) {
        SmartSignUpViewModel.Step.AskEmail -> KeyboardType.Email
        SmartSignUpViewModel.Step.AskPassword -> KeyboardType.Password
        else -> KeyboardType.Text
    }
    val isPassword = step == SmartSignUpViewModel.Step.AskPassword

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val fieldShape = RoundedCornerShape(22.dp)
        Box(
            modifier = Modifier
                .weight(1f)
                .clip(fieldShape)
                .background(SabqTheme.colors.paleFill, fieldShape)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (input.isEmpty()) {
                Text(
                    text = placeholder,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
            BasicTextField(
                value = input,
                onValueChange = onInputChange,
                singleLine = true,
                textStyle = SabqTheme.typography.body.copy(
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.ink,
                ),
                cursorBrush = SolidColor(SabqTheme.colors.primaryEnd),
                visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
                keyboardOptions = KeyboardOptions(
                    keyboardType = keyboardType,
                    imeAction = ImeAction.Send,
                ),
                keyboardActions = KeyboardActions(onSend = { if (canSubmit) onSubmit() }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(
                    if (canSubmit) SabqTheme.colors.primaryEnd else SabqTheme.colors.tertiaryInk,
                )
                .clickable(enabled = canSubmit) { onSubmit() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = "إرسال",
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun InterestsPicker(
    categories: List<com.sabq.smart.data.Section>,
    selectedIds: Set<String>,
    onToggle: (String) -> Unit,
    onConfirm: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f)),
    ) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 100.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
            modifier = Modifier.heightIn(max = 220.dp),
        ) {
            items(categories, key = { it.id }) { category ->
                InterestChip(
                    label = category.name.ifBlank { category.slug },
                    selected = category.id in selectedIds,
                    onClick = { onToggle(category.id) },
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .clip(RoundedCornerShape(SabqTheme.dimens.buttonRadius))
                .background(
                    Brush.linearGradient(
                        listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                    ),
                )
                .clickable { onConfirm() }
                .padding(vertical = 13.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = if (selectedIds.isEmpty()) "تخطّي"
                    else "تأكيد ${selectedIds.size} تصنيفاً",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                )
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun InterestChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val shape = androidx.compose.foundation.shape.CircleShape
    Box(
        modifier = Modifier
            .clip(shape)
            .background(
                if (selected) SabqTheme.colors.primaryEnd else SabqTheme.colors.paleFill,
                shape,
            )
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Color.White else SabqTheme.colors.ink,
        )
    }
}

@Composable
private fun ErrorBanner(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.coral,
        )
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .clickable { onRetry() }
                .padding(horizontal = 18.dp, vertical = 10.dp),
        ) {
            Text(
                text = "إعادة المحاولة",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

// MARK: - Building profile animation

private data class BuildStep(val label: String)

private val BUILD_STEPS = listOf(
    BuildStep("ربط البريد بحسابك"),
    BuildStep("تحضير اهتماماتك"),
    BuildStep("تدريب موجزك اليومي"),
    BuildStep("تخصيص الصفحة الرئيسية"),
)

@Composable
private fun BuildingProfile(
    state: SmartSignUpViewModel.UiState,
    onDone: () -> Unit,
    onAdvance: (Int) -> Unit,
    onFinishStep: () -> Unit,
) {
    val done = state.buildProgress >= BUILD_STEPS.size

    LaunchedEffect(state.step) {
        if (state.step != SmartSignUpViewModel.Step.Building) return@LaunchedEffect
        // Pace the steps so the user has time to read each line — total
        // ~3.4s, matching iOS.
        for (i in 1..BUILD_STEPS.size) {
            delay(800)
            onAdvance(i)
        }
        delay(200)
        onFinishStep()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        Spacer(modifier = Modifier.height(30.dp))

        // Hero AI orb (larger).
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
        ) {
            BigAiOrb(done = done)
        }

        // Headline.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (!done) {
                Text(
                    text = "نُجهّز ملفّك الذكي…",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = SabqTheme.colors.ink,
                )
                Text(
                    text = "لحظات قليلة وتصبح سبق أقرب إليك",
                    fontSize = 13.sp,
                    color = SabqTheme.colors.secondaryInk,
                )
            } else {
                Text(
                    text = "أهلاً ${state.name} 🎉",
                    fontSize = 26.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = SabqTheme.colors.ink,
                )
                Text(
                    text = "ملفّك الذكي جاهز. كل خبر من الآن مرتّب لك أنت.",
                    fontSize = 13.sp,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
        }

        // Step list.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(SabqTheme.dimens.cardRadius))
                .background(SabqTheme.colors.surface)
                .border(
                    BorderStroke(0.5.dp, SabqTheme.colors.primaryEnd.copy(alpha = 0.18f)),
                    RoundedCornerShape(SabqTheme.dimens.cardRadius),
                )
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            BUILD_STEPS.forEachIndexed { idx, step ->
                BuildStepRow(
                    label = step.label,
                    progress = state.buildProgress,
                    index = idx,
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        AnimatedVisibility(
            visible = done,
            enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 }),
            exit = fadeOut(),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 18.dp)
                    .clip(RoundedCornerShape(SabqTheme.dimens.buttonRadius))
                    .background(
                        Brush.linearGradient(
                            listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                        ),
                    )
                    .clickable { onDone() }
                    .padding(vertical = 15.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "ابدأ التصفّح",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                )
            }
        }
        if (!done) {
            Spacer(modifier = Modifier.height(80.dp))
        }
    }
}

@Composable
private fun BigAiOrb(done: Boolean) {
    Box(
        modifier = Modifier
            .size(96.dp)
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (done) Icons.Filled.Check else Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(36.dp),
        )
    }
}

@Composable
private fun BuildStepRow(label: String, progress: Int, index: Int) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(
                    if (index < progress) SabqTheme.colors.primaryEnd else SabqTheme.colors.paleFill,
                ),
            contentAlignment = Alignment.Center,
        ) {
            when {
                index < progress -> Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(12.dp),
                )
                index == progress -> CircularProgressIndicator(
                    color = SabqTheme.colors.primaryEnd,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(14.dp),
                )
                else -> Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.size(12.dp),
                )
            }
        }
        Text(
            text = label,
            fontSize = 14.sp,
            fontWeight = if (index <= progress) FontWeight.Bold else FontWeight.Medium,
            color = if (index <= progress) SabqTheme.colors.ink else SabqTheme.colors.tertiaryInk,
            modifier = Modifier.weight(1f),
        )
    }
}

// MARK: - Registration-pending success card (resend activation)

@Composable
private fun RegistrationPendingCard(
    message: String,
    email: String?,
    resend: SmartSignUpViewModel.ResendState,
    onResend: () -> Unit,
    onDone: () -> Unit,
) {
    val isResending = resend is SmartSignUpViewModel.ResendState.Sending
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.height(40.dp))

        // Big leaf-coloured envelope — matches iOS
        // `envelope.badge.shield.half.filled` 60pt.
        Icon(
            imageVector = Icons.Filled.MarkEmailRead,
            contentDescription = null,
            tint = SabqTheme.colors.leaf,
            modifier = Modifier.size(60.dp),
        )

        Text(
            text = "تم إنشاء الحساب",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )

        Text(
            text = message,
            fontSize = 15.sp,
            color = SabqTheme.colors.secondaryInk,
            modifier = Modifier.padding(horizontal = 12.dp),
        )

        if (!email.isNullOrBlank()) {
            // Show the email LTR so it reads naturally inside the RTL
            // layout — same trick used in the contact-method cards.
            androidx.compose.runtime.CompositionLocalProvider(
                androidx.compose.ui.platform.LocalLayoutDirection provides
                    androidx.compose.ui.unit.LayoutDirection.Ltr,
            ) {
                Text(
                    text = email,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.primaryEnd,
                )
            }
        }

        // Resend status banner.
        when (resend) {
            is SmartSignUpViewModel.ResendState.Sent -> ResultBanner(
                icon = Icons.Filled.CheckCircle,
                tint = SabqTheme.colors.leaf,
                text = resend.message,
            )
            is SmartSignUpViewModel.ResendState.Error -> ResultBanner(
                icon = Icons.Filled.ErrorOutline,
                tint = SabqTheme.colors.coral,
                text = resend.message,
            )
            else -> Unit
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Resend button — outlined coral, matches iOS resendActivation
        // CTA style.
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .border(
                    BorderStroke(1.dp, SabqTheme.colors.coral.copy(alpha = 0.35f)),
                    RoundedCornerShape(8.dp),
                )
                .clickable(enabled = !isResending) { onResend() }
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (isResending) {
                CircularProgressIndicator(
                    color = SabqTheme.colors.coral,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(14.dp),
                )
            } else {
                Icon(
                    imageVector = Icons.Outlined.MarkEmailRead,
                    contentDescription = null,
                    tint = SabqTheme.colors.coral,
                    modifier = Modifier.size(14.dp),
                )
            }
            Text(
                text = "إعادة إرسال رابط التفعيل",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.coral,
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        // Primary CTA — same gradient pill iOS uses to bounce the user
        // back to login after they've checked their inbox.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 18.dp)
                .clip(RoundedCornerShape(SabqTheme.dimens.buttonRadius))
                .background(
                    Brush.linearGradient(
                        listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                    ),
                )
                .clickable { onDone() }
                .padding(vertical = 15.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "العودة لتسجيل الدخول",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun ResultBanner(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    text: String,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = text,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = tint,
        )
    }
}

// MARK: - Conversation helpers

/**
 * Append an AI bubble with a small typing delay so the chat doesn't
 * land as a wall of text — matches iOS `typeAI()` (400ms delay).
 */
private suspend fun typeAi(viewModel: SmartSignUpViewModel, text: String) {
    delay(400)
    viewModel.appendAiBubble(text)
}

private suspend fun handleSubmit(
    viewModel: SmartSignUpViewModel,
    state: SmartSignUpViewModel.UiState,
    input: String,
    onInputCleared: () -> Unit,
) {
    val trimmed = input.trim()
    when (state.step) {
        SmartSignUpViewModel.Step.AskName -> {
            if (trimmed.isEmpty()) return
            viewModel.setName(trimmed)
            viewModel.appendUserBubble(trimmed)
            onInputCleared()
            typeAi(viewModel, "تشرّفنا $trimmed 🌟")
            typeAi(viewModel, "على أي بريد نلتقي من جديد؟ سيكون مفتاحك إلى سبق.")
            viewModel.setStep(SmartSignUpViewModel.Step.AskEmail)
        }
        SmartSignUpViewModel.Step.AskEmail -> {
            if (!trimmed.contains('@') || !trimmed.contains('.')) return
            viewModel.setEmail(trimmed)
            viewModel.appendUserBubble(trimmed)
            onInputCleared()
            typeAi(viewModel, "ممتاز. كلمة مرور قويّة الآن — حسابك بأمان عندنا 🔒")
            viewModel.setStep(SmartSignUpViewModel.Step.AskPassword)
        }
        SmartSignUpViewModel.Step.AskPassword -> {
            if (trimmed.length < 6) return
            viewModel.setPassword(trimmed)
            viewModel.appendUserBubble("•".repeat(trimmed.length))
            onInputCleared()
            typeAi(viewModel, "الخطوة الأخيرة 🎯")
            typeAi(viewModel, "اختر ما يشدّك من التصنيفات، أعِد ترتيب الأخبار حولك أنت.")
            viewModel.setStep(SmartSignUpViewModel.Step.AskInterests)
        }
        else -> Unit
    }
}

private suspend fun handleInterestsConfirm(
    viewModel: SmartSignUpViewModel,
    state: SmartSignUpViewModel.UiState,
) {
    if (state.selectedInterestIds.isNotEmpty()) {
        val names = state.categories
            .filter { it.id in state.selectedInterestIds }
            .joinToString(" · ") { it.name }
        viewModel.appendUserBubble(names)
    }
    viewModel.submitRegistration()
}
