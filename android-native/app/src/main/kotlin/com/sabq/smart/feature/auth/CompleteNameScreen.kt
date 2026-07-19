package com.sabq.smart.feature.auth

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.PersonAddAlt1
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.feature.settings.AccountActionViewModel
import com.sabq.smart.ui.components.PrimaryCTAButton
import com.sabq.smart.ui.theme.SabqTheme

/**
 * شاشة إكمال الاسم الإلزامية بعد دخول الجوال / للجلسات القديمة بلا firstName.
 * الاسم الأول مطلوب (≥2)؛ اسم العائلة اختياري. لا يوجد تخطٍّ.
 */
@Composable
fun CompleteNameScreen(
    onDone: () -> Unit,
    phoneHint: String? = null,
    accountViewModel: AccountActionViewModel = hiltViewModel(),
) {
    BackHandler(enabled = true) { /* إلزامي — لا رجوع */ }

    LaunchedEffect(Unit) { accountViewModel.reset() }
    val state by accountViewModel.state.collectAsStateWithLifecycle()

    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    val canSave = firstName.trim().length >= 2

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
                top = 32.dp,
                bottom = 48.dp,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.PersonAddAlt1,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier.size(48.dp),
        )

        Text(
            text = "أكمل اسمك",
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )

        Text(
            text = "سجّلت بجوالك بنجاح. أضف اسمك ليظهر في عضويتك وتعليقاتك.",
            fontSize = 14.sp,
            color = SabqTheme.colors.secondaryInk,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )

        if (!phoneHint.isNullOrBlank()) {
            Text(
                text = phoneHint,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            )
        }

        OutlinedTextField(
            value = firstName,
            onValueChange = { firstName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("الاسم الأول *") },
            placeholder = { Text("مثال: أحمد") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                imeAction = ImeAction.Next,
            ),
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = SabqTheme.colors.primaryEnd,
                cursorColor = SabqTheme.colors.primaryEnd,
            ),
        )

        OutlinedTextField(
            value = lastName,
            onValueChange = { lastName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("اسم العائلة (اختياري)") },
            placeholder = { Text("مثال: العتيبي") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                imeAction = ImeAction.Done,
            ),
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = SabqTheme.colors.primaryEnd,
                cursorColor = SabqTheme.colors.primaryEnd,
            ),
        )

        Text(
            text = "لا يمكن تعديل الاسم لاحقًا لاعتبارات مصداقية التعليقات.",
            fontSize = 12.sp,
            color = SabqTheme.colors.tertiaryInk,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )

        state.errorMessage?.let { err ->
            Text(
                text = err,
                fontSize = 13.sp,
                color = SabqTheme.colors.coral,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        PrimaryCTAButton(
            title = if (state.isLoading) "جاري الحفظ…" else "متابعة",
            icon = Icons.AutoMirrored.Filled.ArrowForward,
            enabled = canSave && !state.isLoading,
            onClick = {
                accountViewModel.completeDisplayName(
                    firstName = firstName,
                    lastName = lastName,
                    onSaved = { onDone() },
                )
            },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
