package com.sabq.smart.feature.settings

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imeNestedScroll
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Contact form — ported 1:1 from iOS `ContactSheet` in
 * `sabq app ios/sabq/Screens/SettingsView.swift:1259+`.
 *
 * Layout mirrors iOS:
 *   header → two contact-method cards (WhatsApp + Email) → SurfaceCard
 *   wrapping the 5-field form (name / phone / email / subject / message).
 *
 * Validation rules match the iOS Zod constraints exactly so the form
 * doesn't surprise the user with a late backend 400.
 */
@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun ContactScreen(
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()

    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("+966") }
    var email by remember { mutableStateOf("") }
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }

    // `triedSubmit` mirrors iOS quiet-state UX: we don't paint red
    // borders until the user has tried to submit at least once. Per-field
    // errors clear as soon as that field becomes valid.
    var triedSubmit by remember { mutableStateOf(false) }

    val nameError = if (triedSubmit) validateName(name) else null
    val phoneError = if (triedSubmit) validatePhone(phone) else null
    val emailError = if (triedSubmit) validateEmail(email) else null
    val subjectError = if (triedSubmit) validateSubject(subject) else null
    val messageError = if (triedSubmit) validateMessage(message) else null

    LaunchedEffect(state.success) {
        if (state.success) {
            delay(2000)
            onBack()
        }
    }

    val scope = rememberCoroutineScope()
    val nameBringer = remember { BringIntoViewRequester() }
    val phoneBringer = remember { BringIntoViewRequester() }
    val emailBringer = remember { BringIntoViewRequester() }
    val subjectBringer = remember { BringIntoViewRequester() }
    val messageBringer = remember { BringIntoViewRequester() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(title = "تواصل معنا", onClose = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imeNestedScroll()
                .imePadding()
                .padding(horizontal = SabqTheme.dimens.screenPaddingH, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            ContactPageHeader()

            ContactMethodCards()

            // Visual gap so the cards read as their own row, not a
            // header for the form — matches iOS Color.clear height 8.
            Spacer(modifier = Modifier.height(8.dp))

            if (state.success) {
                SurfaceCard(accent = SabqTheme.colors.leaf) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "تم استلام رسالتك",
                            style = SabqTheme.typography.cardTitle.copy(
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = SabqTheme.colors.ink,
                            ),
                        )
                        Text(
                            text = "شكراً لتواصلك معنا، سيتم الرد عليك قريباً",
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 13.sp,
                                color = SabqTheme.colors.secondaryInk,
                            ),
                        )
                    }
                }
            } else {
                SurfaceCard(accent = SabqTheme.colors.primaryEnd) {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        FormSectionHeader()

                        state.errorMessage?.let { ErrorBanner(message = it) }

                        ContactField(
                            label = "الاسم الكامل",
                            placeholder = "أدخل اسمك الكامل",
                            value = name,
                            onValueChange = { name = it },
                            error = nameError,
                            modifier = Modifier
                                .bringIntoViewRequester(nameBringer)
                                .onFocusChanged { f ->
                                    if (f.isFocused) scope.launch { nameBringer.bringIntoView() }
                                },
                        )
                        ContactField(
                            label = "رقم الهاتف",
                            placeholder = "+966500000000",
                            value = phone,
                            onValueChange = { phone = it },
                            keyboardType = KeyboardType.Phone,
                            error = phoneError,
                            modifier = Modifier
                                .bringIntoViewRequester(phoneBringer)
                                .onFocusChanged { f ->
                                    if (f.isFocused) scope.launch { phoneBringer.bringIntoView() }
                                },
                        )
                        ContactField(
                            label = "البريد الإلكتروني",
                            placeholder = "example@email.com",
                            value = email,
                            onValueChange = { email = it },
                            keyboardType = KeyboardType.Email,
                            error = emailError,
                            modifier = Modifier
                                .bringIntoViewRequester(emailBringer)
                                .onFocusChanged { f ->
                                    if (f.isFocused) scope.launch { emailBringer.bringIntoView() }
                                },
                        )
                        SubjectDropdown(
                            selected = subject,
                            onChange = { subject = it },
                            error = subjectError,
                            modifier = Modifier.bringIntoViewRequester(subjectBringer),
                        )
                        ContactField(
                            label = "الرسالة",
                            placeholder = "اكتب رسالتك هنا...",
                            value = message,
                            onValueChange = { message = it },
                            singleLine = false,
                            minLines = 5,
                            imeAction = ImeAction.Default,
                            error = messageError,
                            modifier = Modifier
                                .bringIntoViewRequester(messageBringer)
                                .onFocusChanged { f ->
                                    if (f.isFocused) scope.launch { messageBringer.bringIntoView() }
                                },
                        )

                        Spacer(modifier = Modifier.height(4.dp))

                        PrimaryGradientButton(
                            title = "إرسال الرسالة",
                            isLoading = state.isLoading,
                            enabled = !state.isLoading,
                            onClick = {
                                triedSubmit = true
                                val firstError = firstInvalidBringer(
                                    name, phone, email, subject, message,
                                    nameBringer, phoneBringer, emailBringer,
                                    subjectBringer, messageBringer,
                                )
                                if (firstError != null) {
                                    scope.launch { firstError.bringIntoView() }
                                    return@PrimaryGradientButton
                                }
                                viewModel.sendContactMessage(
                                    name = name.trim(),
                                    phone = phone.trim(),
                                    email = email.trim(),
                                    subject = subject,
                                    message = message.trim(),
                                )
                            },
                        )
                    }
                }

                // Trailing spacer so the message editor's bottom edge can
                // clear the keyboard when focused near the bottom of the
                // sheet — matches iOS Color.clear height 80.
                Spacer(modifier = Modifier.height(80.dp))
            }
        }
    }
}

@Composable
private fun ContactPageHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionBadge(tint = SabqTheme.colors.teal, icon = Icons.Filled.Email)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "تواصل معنا",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "اختر طريقة التواصل الأنسب لك",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun FormSectionHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionBadge(tint = SabqTheme.colors.primaryEnd, icon = Icons.Filled.Edit)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "أرسل رسالة",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "املأ النموذج وسنرد عليك في أقرب وقت",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun SectionBadge(tint: Color, icon: ImageVector) {
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
            modifier = Modifier.size(18.dp),
        )
    }
}

// MARK: - Contact-method cards (WhatsApp + Email — matches iOS web /contact)

@Composable
private fun ContactMethodCards() {
    val ctx = LocalContext.current
    val whatsAppTint = Color(0.16f, 0.74f, 0.42f, 1f) // iOS literal rgba(0.16,0.74,0.42)
    val emailTint = SabqTheme.colors.primaryEnd
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ContactMethodCard(
            modifier = Modifier.weight(1f),
            iconImage = Icons.Filled.ChatBubble,
            title = "واتساب",
            value = "+966 500 226 622",
            tint = whatsAppTint,
            onClick = {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/966500226622"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { ctx.startActivity(intent) }
            },
        )
        ContactMethodCard(
            modifier = Modifier.weight(1f),
            iconImage = Icons.Filled.Email,
            title = "البريد الإلكتروني",
            value = "info@sabq.org",
            tint = emailTint,
            onClick = {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("mailto:info@sabq.org"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { ctx.startActivity(intent) }
            },
        )
    }
}

@Composable
private fun ContactMethodCard(
    modifier: Modifier = Modifier,
    iconImage: ImageVector,
    title: String,
    value: String,
    tint: Color,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(tint.copy(alpha = 0.06f), shape)
            .border(BorderStroke(0.5.dp, tint.copy(alpha = 0.20f)), shape)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(tint),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = iconImage,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(18.dp),
            )
        }
        Text(
            text = title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            ),
        )
        // Phone numbers + email read left-to-right regardless of UI RTL.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Text(
                text = value,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = tint,
                ),
                maxLines = 1,
            )
        }
    }
}

// MARK: - Field

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ContactField(
    label: String,
    placeholder: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    singleLine: Boolean = true,
    minLines: Int = 1,
    error: String? = null,
) {
    val hasError = error != null
    val unfocusedBorder = if (hasError) SabqTheme.colors.coral else SabqTheme.colors.outline
    val focusedBorder = if (hasError) SabqTheme.colors.coral else SabqTheme.colors.primaryEnd
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = label,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .then(modifier),
            placeholder = {
                Text(
                    text = placeholder,
                    style = SabqTheme.typography.body.copy(
                        fontSize = 15.sp,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                )
            },
            singleLine = singleLine,
            minLines = minLines,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = focusedBorder,
                unfocusedBorderColor = unfocusedBorder,
                focusedContainerColor = SabqTheme.colors.paleFill,
                unfocusedContainerColor = SabqTheme.colors.paleFill,
                cursorColor = SabqTheme.colors.primaryEnd,
                focusedTextColor = SabqTheme.colors.ink,
                unfocusedTextColor = SabqTheme.colors.ink,
            ),
            shape = RoundedCornerShape(SabqTheme.dimens.chipRadius),
            isError = hasError,
        )
        if (error != null) {
            FieldErrorText(error)
        }
    }
}

@Composable
private fun FieldErrorText(message: String) {
    Text(
        text = message,
        style = SabqTheme.typography.metaSmall.copy(
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.coral,
        ),
    )
}

// MARK: - Subject dropdown (matches iOS `Menu { ... }` chip + chevron)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SubjectDropdown(
    selected: String,
    onChange: (String) -> Unit,
    error: String?,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    val hasError = error != null
    val borderColor = if (hasError) SabqTheme.colors.coral else SabqTheme.colors.outline
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "موضوع الرسالة",
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
        )
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(SabqTheme.colors.paleFill, shape)
                    .border(BorderStroke(if (hasError) 1.dp else 0.5.dp, borderColor), shape)
                    .clickable { expanded = true }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = selected.ifBlank { "اختر موضوع الرسالة" },
                    style = SabqTheme.typography.body.copy(
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (selected.isBlank()) SabqTheme.colors.tertiaryInk else SabqTheme.colors.ink,
                    ),
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.width(10.dp))
                Icon(
                    imageVector = Icons.Filled.ArrowDropDown,
                    contentDescription = null,
                    tint = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.size(20.dp),
                )
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                modifier = Modifier.background(SabqTheme.colors.surface),
            ) {
                SUBJECT_OPTIONS.forEach { option ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = option,
                                style = SabqTheme.typography.body.copy(
                                    fontSize = 15.sp,
                                    fontWeight = if (option == selected) FontWeight.SemiBold else FontWeight.Medium,
                                    color = if (option == selected) SabqTheme.colors.primaryEnd else SabqTheme.colors.ink,
                                ),
                            )
                        },
                        onClick = {
                            onChange(option)
                            expanded = false
                        },
                    )
                }
            }
        }
        if (error != null) {
            FieldErrorText(error)
        }
    }
}

// MARK: - Subjects (must match the backend Zod enum at /api/contact exactly)
private val SUBJECT_OPTIONS = listOf(
    "استفسار عام",
    "شراكات إعلامية",
    "شكوى",
    "اقتراح",
    "أخرى",
)

// MARK: - Validation (mirrors iOS isFormValid in SettingsView.swift:1307)

private fun validateName(value: String): String? {
    val trimmed = value.trim()
    return if (trimmed.length < 2) "الاسم يجب أن يكون حرفين على الأقل" else null
}

private val SAUDI_PHONE_REGEX = Regex("^\\+966[0-9]{9}$")

private fun validatePhone(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) return "رقم الهاتف مطلوب"
    return if (!SAUDI_PHONE_REGEX.matches(trimmed)) "أدخل رقماً سعودياً بصيغة +966500000000" else null
}

private fun validateEmail(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) return "البريد الإلكتروني مطلوب"
    return if (!trimmed.contains('@') || !trimmed.contains('.')) "أدخل بريداً إلكترونياً صحيحاً" else null
}

private fun validateSubject(value: String): String? {
    return if (value !in SUBJECT_OPTIONS) "اختر موضوعاً للرسالة" else null
}

private fun validateMessage(value: String): String? {
    val trimmed = value.trim()
    return if (trimmed.length < 10) "الرسالة يجب أن تكون 10 أحرف على الأقل" else null
}

@OptIn(ExperimentalFoundationApi::class)
private fun firstInvalidBringer(
    name: String,
    phone: String,
    email: String,
    subject: String,
    message: String,
    nameBringer: BringIntoViewRequester,
    phoneBringer: BringIntoViewRequester,
    emailBringer: BringIntoViewRequester,
    subjectBringer: BringIntoViewRequester,
    messageBringer: BringIntoViewRequester,
): BringIntoViewRequester? = when {
    validateName(name) != null -> nameBringer
    validatePhone(phone) != null -> phoneBringer
    validateEmail(email) != null -> emailBringer
    validateSubject(subject) != null -> subjectBringer
    validateMessage(message) != null -> messageBringer
    else -> null
}
