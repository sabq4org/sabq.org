package com.sabq.smart.ui.components

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.Comment
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Multi-line composer + paper-plane send button. Ports iOS
 * `CommentComposer` (Components/CommentComposer.swift) 1:1.
 *
 * iOS uses a TextField with `.lineLimit(1...6)` so the field grows up
 * to 6 visual lines then scrolls. Compose's BasicTextField supports
 * the same via `singleLine = false` + a maxLines cap on the inner
 * row.
 */
@Composable
fun CommentComposer(
    replyingTo: Comment?,
    isSubmitting: Boolean,
    onSubmit: (content: String) -> Unit,
    onCancelReply: () -> Unit,
    modifier: Modifier = Modifier,
    maxLength: Int = 2000,
) {
    var text by remember { mutableStateOf("") }
    val trimmed = text.trim()
    val isDisabled = trimmed.isEmpty() || text.length > maxLength

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        replyingTo?.let { parent ->
            ReplyChip(parent = parent, onDismiss = onCancelReply)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ComposerField(
                value = text,
                onValueChange = { if (it.length <= maxLength + 200) text = it },
                placeholder = if (replyingTo == null) "اكتب تعليقك…" else "اكتب ردك…",
                modifier = Modifier.weight(1f),
            )

            SendButton(
                isSubmitting = isSubmitting,
                isDisabled = isDisabled,
                onClick = {
                    onSubmit(text)
                    if (!isDisabled) text = ""
                },
            )
        }

        CounterRow(currentLength = text.length, maxLength = maxLength)
    }
}

@Composable
private fun ComposerField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.paleFill, shape)
            .border(
                BorderStroke(
                    width = 0.5.dp,
                    color = SabqTheme.colors.outline.copy(alpha = if (focused) 0.6f else 0.3f),
                ),
                shape,
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        if (value.isEmpty()) {
            Text(
                text = placeholder,
                style = SabqTheme.typography.body.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.tertiaryInk,
                ),
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = SabqTheme.typography.body.copy(
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.ink,
            ),
            cursorBrush = SolidColor(SabqTheme.colors.primaryEnd),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Text,
                imeAction = ImeAction.Default,
            ),
            maxLines = 6,
            modifier = Modifier
                .fillMaxWidth(),
        )
    }
}

@Composable
private fun SendButton(
    isSubmitting: Boolean,
    isDisabled: Boolean,
    onClick: () -> Unit,
) {
    val haptics = rememberSabqHaptics()
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(
                if (isDisabled || isSubmitting) SabqTheme.colors.tertiaryInk
                else SabqTheme.colors.primaryEnd,
            )
            .clickable(enabled = !isDisabled && !isSubmitting) {
                haptics.medium()
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        if (isSubmitting) {
            // iOS: ProgressView().frame(32×32) — الدوّار الفعلي ~20pt داخل الإطار
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp),
            )
        } else {
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
private fun CounterRow(currentLength: Int, maxLength: Int) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Text(
            text = "$currentLength / $maxLength",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                fontFamily = FontFamily.Default,
                color = when {
                    // SwiftUI .red / .orange — exact hex from iOS
                    // CommentComposer.swift:137-141 (.red, .orange).
                    currentLength > maxLength -> Color(0xFFFF3B30)
                    currentLength > (maxLength * 0.9).toInt() -> Color(0xFFFF9500)
                    else -> SabqTheme.colors.tertiaryInk
                },
            ),
        )
    }
}

@Composable
private fun ReplyChip(parent: Comment, onDismiss: () -> Unit) {
    val haptics = rememberSabqHaptics()
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.08f), shape)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Reply,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier.size(11.dp),
        )
        Text(
            text = "ترد على ${parent.userName ?: "تعليق"}",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.secondaryInk,
            ),
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        Box(
            modifier = Modifier
                .size(22.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.paleFill)
                .clickable {
                    haptics.light()
                    onDismiss()
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = "إلغاء",
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.size(11.dp),
            )
        }
    }
}

@Suppress("unused")
private val _spacerMarker: @Composable () -> Unit = { Spacer(Modifier.size(0.dp)) }
