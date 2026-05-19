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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.components.PrimaryCTAButton
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Login screen — email + password + "إنشاء حساب" toggle to register
 * mode. Stays minimal: no Google sign-in, no 2FA, no forgot-password
 * sub-flow. Those land once the basic auth path is solid.
 */
@Composable
fun LoginScreen(
    viewModel: AuthViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onAuthenticated: () -> Unit,
) {
    val form by viewModel.form.collectAsStateWithLifecycle()

    var isRegister by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    // Reset the form when toggling between login/register.
    LaunchedEffect(isRegister) { viewModel.resetForm() }

    LaunchedEffect(form) {
        if (form is AuthFormState.Success) onAuthenticated()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(
                start = SabqTheme.dimens.screenPaddingH,
                end = SabqTheme.dimens.screenPaddingH,
                top = 24.dp,
                bottom = 48.dp,
            ),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // Back button.
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
            text = if (isRegister) "أنشئ حسابك" else "أهلاً بعودتك",
            style = SabqTheme.typography.screenTitle,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = if (isRegister)
                "انضم إلى مجتمع سبق لمتابعة أخبارك المفضلة وحفظها"
            else "سجّل دخولك للوصول إلى محفوظاتك وتفضيلاتك",
            style = SabqTheme.typography.excerpt,
            color = SabqTheme.colors.secondaryInk,
        )

        SurfaceCard {
            if (isRegister) {
                FormField(
                    icon = Icons.Filled.PersonOutline,
                    placeholder = "الاسم الكامل",
                    value = name,
                    onValueChange = { name = it },
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Next,
                )
            }
            FormField(
                icon = Icons.Filled.AlternateEmail,
                placeholder = "البريد الإلكتروني",
                value = email,
                onValueChange = { email = it },
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            )
            FormField(
                icon = Icons.Filled.Lock,
                placeholder = "كلمة المرور",
                value = password,
                onValueChange = { password = it },
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
                isPassword = true,
                onSubmit = {
                    if (isRegister) viewModel.register(name, email, password)
                    else viewModel.login(email, password)
                },
            )

            if (form is AuthFormState.Error) {
                Text(
                    text = (form as AuthFormState.Error).message,
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.coral,
                )
            }

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
                    title = if (isRegister) "إنشاء الحساب" else "تسجيل الدخول",
                    icon = Icons.AutoMirrored.Filled.ArrowForward,
                    onClick = {
                        if (isRegister) viewModel.register(name, email, password)
                        else viewModel.login(email, password)
                    },
                )
            }
        }

        // Toggle login/register.
        Text(
            text = if (isRegister)
                "لديك حساب بالفعل؟ تسجيل الدخول"
            else "ليس لديك حساب؟ إنشاء حساب جديد",
            style = SabqTheme.typography.chipLabel,
            color = SabqTheme.colors.primaryEnd,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .clickable { isRegister = !isRegister },
        )
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
                visualTransformation = if (isPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
                keyboardActions = KeyboardActions(onDone = { onSubmit() }, onSearch = { onSubmit() }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
