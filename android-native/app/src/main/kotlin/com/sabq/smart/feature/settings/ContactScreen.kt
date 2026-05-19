package com.sabq.smart.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay

/**
 * Contact form sheet — five required fields per the backend schema
 * (name / phone / email / subject / message). Mirrors the visual
 * order in `SettingsView.swift:1159+`. The subject is constrained
 * to one of four canonical Arabic strings the backend enums on.
 */
@Composable
fun ContactScreen(
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var subject by remember { mutableStateOf(subjects.first()) }
    var message by remember { mutableStateOf("") }

    val valid = name.isNotBlank() && phone.isNotBlank() &&
        email.contains('@') && subject.isNotBlank() && message.length >= 10

    LaunchedEffect(state.success) {
        if (state.success) {
            delay(2000)
            onBack()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(title = "راسلنا", onClose = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Email,
                    contentDescription = null,
                    tint = SabqTheme.colors.teal,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = "نسعد بتواصلكم",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
                Text(
                    text = "آراؤكم تهمنا. ادخل بياناتك ورسالتك ونرد في أقرب وقت.",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }

            if (state.success) {
                SuccessBanner(message = "تم إرسال رسالتك بنجاح")
            } else {
                SheetField(
                    label = "الاسم الكامل",
                    value = name,
                    onValueChange = { name = it },
                    placeholder = "اسمك",
                )
                SheetField(
                    label = "رقم الجوال",
                    value = phone,
                    onValueChange = { phone = it },
                    placeholder = "+9665XXXXXXXX",
                    keyboardType = KeyboardType.Phone,
                )
                SheetField(
                    label = "البريد الإلكتروني",
                    value = email,
                    onValueChange = { email = it },
                    placeholder = "name@example.com",
                    keyboardType = KeyboardType.Email,
                )
                SubjectPicker(selected = subject, onChange = { subject = it })
                SheetField(
                    label = "نص الرسالة",
                    value = message,
                    onValueChange = { message = it },
                    placeholder = "اكتب رسالتك هنا (10 أحرف على الأقل)",
                    singleLine = false,
                    minLines = 4,
                )

                state.errorMessage?.let { ErrorBanner(message = it) }
                PrimaryGradientButton(
                    title = "إرسال الرسالة",
                    isLoading = state.isLoading,
                    enabled = valid,
                    onClick = {
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
    }
}

// Canonical Arabic subjects the backend Zod schema accepts.
private val subjects = listOf(
    "استفسار عام",
    "ملاحظة على الموقع",
    "تقرير خطأ",
    "أخرى",
)

@Composable
private fun SubjectPicker(selected: String, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "الموضوع",
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            subjects.forEach { subject ->
                SubjectChip(
                    label = subject,
                    selected = selected == subject,
                    onClick = { onChange(subject) },
                )
            }
        }
    }
}

@Composable
private fun SubjectChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                if (selected) SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)
                else SabqTheme.colors.paleFill,
                shape,
            )
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(18.dp)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(
                    if (selected) SabqTheme.colors.primaryEnd
                    else androidx.compose.ui.graphics.Color.Transparent,
                )
                .padding(2.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(androidx.compose.foundation.shape.CircleShape)
                        .background(androidx.compose.ui.graphics.Color.White),
                )
            }
        }
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(10.dp))
        Text(
            text = label,
            style = SabqTheme.typography.body.copy(
                fontSize = 14.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                color = if (selected) SabqTheme.colors.primaryEnd else SabqTheme.colors.ink,
            ),
        )
    }
}
