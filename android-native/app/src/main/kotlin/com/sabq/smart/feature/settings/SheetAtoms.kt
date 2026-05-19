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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Shared atoms for the account-action sheet screens — port the
 * styling iOS uses inside `SettingsView.swift` sheets so the
 * fields, banners, buttons, and top bars match 1:1 visually.
 */

@Composable
internal fun SheetTopBar(
    title: String? = null,
    onClose: () -> Unit,
) {
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
                .clickable { onClose() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = "إغلاق",
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.size(22.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        if (title != null) {
            Text(
                text = title,
                style = SabqTheme.typography.cardTitle.copy(fontSize = 15.sp),
                color = SabqTheme.colors.ink,
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

@Composable
internal fun SheetField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    isSecure: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    accent: Color? = null,
) {
    val borderColor = accent?.copy(alpha = 0.3f) ?: SabqTheme.colors.outline
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
            modifier = Modifier.fillMaxWidth(),
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
            keyboardOptions = KeyboardOptions(
                keyboardType = if (isSecure) KeyboardType.Password else keyboardType,
                imeAction = imeAction,
            ),
            visualTransformation = if (isSecure) PasswordVisualTransformation() else VisualTransformation.None,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = SabqTheme.colors.primaryEnd,
                unfocusedBorderColor = borderColor,
                focusedContainerColor = SabqTheme.colors.paleFill,
                unfocusedContainerColor = SabqTheme.colors.paleFill,
                cursorColor = SabqTheme.colors.primaryEnd,
                focusedTextColor = SabqTheme.colors.ink,
                unfocusedTextColor = SabqTheme.colors.ink,
            ),
            shape = RoundedCornerShape(SabqTheme.dimens.chipRadius),
        )
    }
}

@Composable
internal fun ErrorBanner(message: String, tint: Color = SabqTheme.colors.coral) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(tint.copy(alpha = 0.08f))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.WarningAmber,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = message,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = tint,
            ),
        )
    }
}

@Composable
internal fun SuccessBanner(message: String) {
    val leaf = SabqTheme.colors.leaf
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(leaf.copy(alpha = 0.08f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = leaf,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = message,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = leaf,
            ),
        )
    }
}

@Composable
internal fun PrimaryGradientButton(
    title: String,
    isLoading: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.buttonRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                if (enabled) Brush.linearGradient(
                    listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                ) else Brush.linearGradient(
                    listOf(
                        SabqTheme.colors.primaryEnd.copy(alpha = 0.5f),
                        SabqTheme.colors.primaryEnd.copy(alpha = 0.5f),
                    ),
                ),
                shape,
            )
            .clickable(enabled = enabled && !isLoading) { onClick() }
            .padding(vertical = 15.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
        }
        Text(
            text = title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            ),
        )
    }
}

@Composable
internal fun CoralButton(
    title: String,
    isLoading: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.buttonRadius)
    val coral = SabqTheme.colors.coral
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (enabled) coral else coral.copy(alpha = 0.5f), shape)
            .clickable(enabled = enabled && !isLoading) { onClick() }
            .padding(vertical = 15.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
        }
        Text(
            text = title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            ),
        )
    }
}

@Composable
internal fun SheetReadOnlyField(
    label: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = label,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(SabqTheme.dimens.chipRadius))
                .background(SabqTheme.colors.paleFill)
                .border(
                    BorderStroke(0.5.dp, SabqTheme.colors.outline),
                    RoundedCornerShape(SabqTheme.dimens.chipRadius),
                )
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = value,
                style = SabqTheme.typography.body.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}
