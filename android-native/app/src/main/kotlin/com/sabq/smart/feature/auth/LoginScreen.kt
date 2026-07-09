package com.sabq.smart.feature.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PhoneIphone
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.components.PrimaryCTAButton
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay

private enum class LoginMode { Phone, Email }
private enum class PhoneStep { Number, Code }

@Composable
fun LoginScreen(
    viewModel: AuthViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onAuthenticated: () -> Unit,
    onForgotPasswordClick: () -> Unit = {},
    onSmartSignUpClick: () -> Unit = {},
) {
    val form by viewModel.form.collectAsStateWithLifecycle()
    val resend by viewModel.resend.collectAsStateWithLifecycle()

    var mode by remember { mutableStateOf(LoginMode.Phone) }
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { viewModel.resetForm() }

    LaunchedEffect(form) {
        if (form is AuthFormState.Success) onAuthenticated()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(
                start = SabqTheme.dimens.screenPaddingH,
                end = SabqTheme.dimens.screenPaddingH,
                top = 24.dp,
                bottom = 48.dp,
            ),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface)
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

        Text(
            text = "أهلاً بعودتك",
            style = SabqTheme.typography.screenTitle,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = "سجّل دخولك للوصول إلى محفوظاتك وتفضيلاتك",
            style = SabqTheme.typography.excerpt,
            color = SabqTheme.colors.secondaryInk,
        )

        LoginModeTabs(
            mode = mode,
            onSelect = {
                viewModel.resetForm()
                mode = it
            },
        )

        SurfaceCard {
            when (mode) {
                LoginMode.Phone -> PhoneLoginSection(viewModel = viewModel, form = form)
                LoginMode.Email -> EmailLoginSection(
                    viewModel = viewModel,
                    form = form,
                    resend = resend,
                    identifier = identifier,
                    onIdentifierChange = { identifier = it },
                    password = password,
                    onPasswordChange = { password = it },
                    onForgotPasswordClick = onForgotPasswordClick,
                )
            }
        }

        Text(
            text = "ليس لديك حساب؟ إنشاء حساب جديد",
            style = SabqTheme.typography.chipLabel,
            color = SabqTheme.colors.primaryEnd,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .clickable { onSmartSignUpClick() },
        )
    }
}

@Composable
private fun LoginModeTabs(mode: LoginMode, onSelect: (LoginMode) -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.paleFill)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        ModeTab(
            title = "الجوال",
            icon = Icons.Filled.PhoneIphone,
            active = mode == LoginMode.Phone,
            onClick = { onSelect(LoginMode.Phone) },
            modifier = Modifier.weight(1f),
        )
        ModeTab(
            title = "البريد الإلكتروني",
            icon = Icons.Filled.AlternateEmail,
            active = mode == LoginMode.Email,
            onClick = { onSelect(LoginMode.Email) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ModeTab(
    title: String,
    icon: ImageVector,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius - 2.dp)
    Row(
        modifier = modifier
            .height(38.dp)
            .clip(shape)
            .background(if (active) SabqTheme.colors.primaryEnd else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (active) androidx.compose.ui.graphics.Color.White else SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = title,
            style = SabqTheme.typography.chipLabel.copy(fontWeight = FontWeight.Bold),
            color = if (active) androidx.compose.ui.graphics.Color.White else SabqTheme.colors.secondaryInk,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

@Composable
private fun EmailLoginSection(
    viewModel: AuthViewModel,
    form: AuthFormState,
    resend: ResendActivationState,
    identifier: String,
    onIdentifierChange: (String) -> Unit,
    password: String,
    onPasswordChange: (String) -> Unit,
    onForgotPasswordClick: () -> Unit,
) {
    FormField(
        icon = Icons.Filled.AlternateEmail,
        placeholder = "البريد الإلكتروني أو الجوال",
        value = identifier,
        onValueChange = onIdentifierChange,
        keyboardType = KeyboardType.Email,
        imeAction = ImeAction.Next,
    )
    FormField(
        icon = Icons.Filled.Lock,
        placeholder = "كلمة المرور",
        value = password,
        onValueChange = onPasswordChange,
        keyboardType = KeyboardType.Password,
        imeAction = ImeAction.Done,
        isPassword = true,
        onSubmit = { viewModel.loginWithCredentials(identifier, password) },
    )

    CredentialsErrorBlock(form = form, resend = resend, onResend = { viewModel.resendActivation() })

    if (form is AuthFormState.Submitting) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
        ) {
            CircularProgressIndicator(
                color = SabqTheme.colors.primaryEnd,
                strokeWidth = 2.dp,
                modifier = Modifier.size(22.dp),
            )
        }
    } else {
        PrimaryCTAButton(
            title = "تسجيل الدخول",
            icon = Icons.AutoMirrored.Filled.ArrowForward,
            onClick = { viewModel.loginWithCredentials(identifier, password) },
        )
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable { onForgotPasswordClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "نسيت كلمة المرور؟",
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

@Composable
private fun PhoneLoginSection(viewModel: AuthViewModel, form: AuthFormState) {
    var step by remember { mutableStateOf(PhoneStep.Number) }
    var number by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var resendSeconds by remember { mutableIntStateOf(0) }

    val normalized = number.filter { it.isDigit() }.take(9)
    val phoneValid = normalized.length == 9 && normalized.startsWith("5")
    val e164Display = "+966 $normalized"
    val submitting = form is AuthFormState.Submitting

    LaunchedEffect(resendSeconds) {
        if (resendSeconds > 0) {
            delay(1_000)
            resendSeconds -= 1
        }
    }

    when (step) {
        PhoneStep.Number -> {
            PhoneNumberField(
                number = number,
                onNumberChange = { number = it.filter { c -> c.isDigit() }.take(9) },
            )
            Text(
                text = "سنرسل رمز تحقّق برسالة نصية إلى جوالك.",
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            if (form is AuthFormState.Error) {
                Text(
                    text = form.message,
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.coral,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
            }
            if (submitting) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    CircularProgressIndicator(
                        color = SabqTheme.colors.primaryEnd,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(22.dp),
                    )
                }
            } else {
                PrimaryCTAButton(
                    title = "أرسل رمز التحقق",
                    icon = Icons.AutoMirrored.Filled.ArrowForward,
                    enabled = phoneValid,
                    onClick = {
                        viewModel.sendPhoneCode(normalized) { ok, _ ->
                            if (ok) {
                                step = PhoneStep.Code
                                resendSeconds = 60
                            }
                        }
                    },
                )
            }
        }
        PhoneStep.Code -> {
            Text(
                text = "أدخل رمز التحقق",
                style = SabqTheme.typography.chipLabel.copy(fontWeight = FontWeight.Bold),
                color = SabqTheme.colors.ink,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "أُرسل إلى ",
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.secondaryInk,
                )
                androidx.compose.runtime.CompositionLocalProvider(
                    LocalLayoutDirection provides LayoutDirection.Ltr,
                ) {
                    Text(
                        text = e164Display,
                        style = SabqTheme.typography.meta,
                        color = SabqTheme.colors.secondaryInk,
                    )
                }
                Text(
                    text = " تعديل",
                    style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.Bold),
                    color = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.clickable {
                        step = PhoneStep.Number
                        code = ""
                        viewModel.resetForm()
                    },
                )
            }

            OtpBoxes(
                code = code,
                onCodeChange = { code = it },
                onComplete = { viewModel.verifyPhoneCode(normalized, it) },
            )

            if (resendSeconds > 0) {
                Text(
                    text = "إعادة الإرسال خلال $resendSeconds ثانية",
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
            } else {
                Text(
                    text = "إعادة إرسال الرمز",
                    style = SabqTheme.typography.chipLabel.copy(fontWeight = FontWeight.Bold),
                    color = SabqTheme.colors.primaryEnd,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = !submitting) {
                            viewModel.sendPhoneCode(normalized) { ok, _ ->
                                if (ok) resendSeconds = 60
                            }
                        },
                    textAlign = TextAlign.Center,
                )
            }

            if (form is AuthFormState.Error) {
                Text(
                    text = form.message,
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.coral,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
            }

            if (submitting) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    CircularProgressIndicator(
                        color = SabqTheme.colors.primaryEnd,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(22.dp),
                    )
                }
            } else {
                PrimaryCTAButton(
                    title = "تحقّق ودخول",
                    icon = Icons.AutoMirrored.Filled.ArrowForward,
                    enabled = code.length == 6,
                    onClick = { viewModel.verifyPhoneCode(normalized, code) },
                )
            }
        }
    }
}

@Composable
private fun PhoneNumberField(number: String, onNumberChange: (String) -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    androidx.compose.runtime.CompositionLocalProvider(
        LocalLayoutDirection provides LayoutDirection.Ltr,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(SabqTheme.colors.paleFill.copy(alpha = 0.7f), shape)
                .border(BorderStroke(0.5.dp, SabqTheme.colors.outline), shape)
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(text = "🇸🇦", fontSize = 16.sp)
            Text(
                text = "+966",
                style = SabqTheme.typography.chipLabel.copy(fontWeight = FontWeight.Bold),
                color = SabqTheme.colors.ink,
            )
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(22.dp)
                    .background(SabqTheme.colors.outline),
            )
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (number.isEmpty()) {
                    Text(
                        text = "5XXXXXXXX",
                        style = SabqTheme.typography.chipLabel,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
                BasicTextField(
                    value = number,
                    onValueChange = onNumberChange,
                    singleLine = true,
                    textStyle = SabqTheme.typography.chipLabel.copy(
                        color = SabqTheme.colors.ink,
                        fontWeight = FontWeight.SemiBold,
                    ),
                    cursorBrush = SolidColor(SabqTheme.colors.primaryEnd),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Phone,
                        imeAction = ImeAction.Done,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun OtpBoxes(
    code: String,
    onCodeChange: (String) -> Unit,
    onComplete: (String) -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    val length = 6
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    Box(modifier = Modifier.fillMaxWidth()) {
        BasicTextField(
            value = code,
            onValueChange = { raw ->
                val digits = raw.filter { it.isDigit() }.take(length)
                onCodeChange(digits)
                if (digits.length == length) onComplete(digits)
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.NumberPassword,
                imeAction = ImeAction.Done,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
                .focusRequester(focusRequester),
            textStyle = SabqTheme.typography.chipLabel.copy(
                color = androidx.compose.ui.graphics.Color.Transparent,
            ),
            cursorBrush = SolidColor(androidx.compose.ui.graphics.Color.Transparent),
        )
        androidx.compose.runtime.CompositionLocalProvider(
            LocalLayoutDirection provides LayoutDirection.Ltr,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { focusRequester.requestFocus() },
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                repeat(length) { i ->
                    val digit = code.getOrNull(i)?.toString().orEmpty()
                    val active = i == code.length
                    val shape = RoundedCornerShape(12.dp)
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(54.dp)
                            .clip(shape)
                            .background(SabqTheme.colors.paleFill, shape)
                            .border(
                                BorderStroke(
                                    if (active) 2.dp else 1.dp,
                                    if (active) SabqTheme.colors.primaryEnd else SabqTheme.colors.outline,
                                ),
                                shape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = digit,
                            style = SabqTheme.typography.chipLabel.copy(
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Black,
                            ),
                            color = SabqTheme.colors.ink,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CredentialsErrorBlock(
    form: AuthFormState,
    resend: ResendActivationState,
    onResend: () -> Unit,
) {
    when (form) {
        is AuthFormState.Error -> Text(
            text = form.message,
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.coral,
        )
        is AuthFormState.PendingActivation -> Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = form.message,
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.coral,
            )
            val isSending = resend is ResendActivationState.Sending
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .border(
                        BorderStroke(1.dp, SabqTheme.colors.coral.copy(alpha = 0.35f)),
                        RoundedCornerShape(8.dp),
                    )
                    .clickable(enabled = !isSending, onClick = onResend)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (isSending) {
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
                    text = "إعادة إرسال رمز التفعيل",
                    style = SabqTheme.typography.chipLabel,
                    color = SabqTheme.colors.coral,
                )
            }
            when (val r = resend) {
                is ResendActivationState.Sent -> Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = SabqTheme.colors.leaf,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(text = r.message, style = SabqTheme.typography.meta, color = SabqTheme.colors.leaf)
                }
                is ResendActivationState.Error -> Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.ErrorOutline,
                        contentDescription = null,
                        tint = SabqTheme.colors.coral,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(text = r.message, style = SabqTheme.typography.meta, color = SabqTheme.colors.coral)
                }
                else -> Unit
            }
        }
        else -> Unit
    }
}

@Composable
private fun FormField(
    icon: ImageVector,
    placeholder: String,
    value: String,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Done,
    isPassword: Boolean = false,
    onSubmit: () -> Unit = {},
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.paleFill.copy(alpha = 0.7f), shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline), shape)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(18.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (value.isEmpty()) {
                Text(
                    text = placeholder,
                    style = SabqTheme.typography.chipLabel,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = SabqTheme.typography.chipLabel.copy(color = SabqTheme.colors.ink),
                cursorBrush = SolidColor(SabqTheme.colors.primaryEnd),
                visualTransformation = if (isPassword) {
                    PasswordVisualTransformation()
                } else {
                    androidx.compose.ui.text.input.VisualTransformation.None
                },
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
                keyboardActions = KeyboardActions(onDone = { onSubmit() }, onSearch = { onSubmit() }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
