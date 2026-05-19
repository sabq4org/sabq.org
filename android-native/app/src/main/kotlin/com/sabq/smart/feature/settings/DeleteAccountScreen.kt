package com.sabq.smart.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.WarningAmber
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Delete account sheet — ports `SettingsView.swift:2554-2722`.
 * Two-step gate: enter password → confirm by typing "حذف" → DELETE.
 */
@Composable
fun DeleteAccountScreen(
    onBack: () -> Unit,
    onAccountDeleted: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var password by remember { mutableStateOf("") }
    var confirmText by remember { mutableStateOf("") }
    var showConfirmation by remember { mutableStateOf(false) }
    val confirmWord = "حذف"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(onClose = onBack)
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
                    imageVector = Icons.Filled.WarningAmber,
                    contentDescription = null,
                    tint = SabqTheme.colors.coral,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = "حذف الحساب",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.coral,
                    ),
                )
            }

            WarningCard()

            if (!showConfirmation) {
                SheetField(
                    label = "كلمة المرور",
                    value = password,
                    onValueChange = { password = it },
                    placeholder = "أدخل كلمة المرور للتأكيد",
                    isSecure = true,
                )
                CoralButton(
                    title = "متابعة",
                    enabled = password.isNotEmpty(),
                    onClick = { showConfirmation = true },
                )
            } else {
                SheetField(
                    label = "اكتب \"$confirmWord\" للتأكيد",
                    value = confirmText,
                    onValueChange = { confirmText = it },
                    placeholder = confirmWord,
                    accent = SabqTheme.colors.coral,
                )
                state.errorMessage?.let { ErrorBanner(message = it) }
                CoralButton(
                    title = "حذف الحساب نهائياً",
                    isLoading = state.isLoading,
                    enabled = confirmText == confirmWord,
                    onClick = { viewModel.deleteAccount(password, onAccountDeleted) },
                )
            }
        }
    }
}

@Composable
private fun WarningCard() {
    val coral = SabqTheme.colors.coral
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(coral.copy(alpha = 0.06f), shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "تحذير: هذا الإجراء لا يمكن التراجع عنه",
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = coral,
            ),
        )
        Text(
            text = "سيتم حذف حسابك وجميع بياناتك بشكل نهائي. لن تتمكن من استعادة الحساب بعد الحذف.",
            style = SabqTheme.typography.body.copy(
                fontSize = 14.sp,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
    }
}
