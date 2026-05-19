package com.sabq.smart.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Ports iOS [SabqSearchBar] (SabqComponents.swift line 1739-1802).
 * Pill-shaped text field with leading magnifying glass (brand-tinted
 * when text is empty, full-tone once typing starts) + trailing clear
 * button. Uses [BasicTextField] under the hood for full custom styling
 * — Material3's TextField doesn't match the iOS look closely enough.
 */
@Composable
fun SabqSearchBar(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "ابحث في أخبار سبق...",
    modifier: Modifier = Modifier,
    onSubmit: () -> Unit = {},
) {
    val haptics = rememberSabqHaptics()
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    val isEmpty = value.isEmpty()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.paleFill.copy(alpha = 0.85f), shape)
            .border(
                BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.40f)),
                shape,
            )
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Outlined.Search,
            contentDescription = null,
            tint = if (isEmpty)
                SabqTheme.colors.primaryEnd.copy(alpha = 0.5f)
            else SabqTheme.colors.primaryEnd,
            modifier = Modifier
                .size(18.dp)
                .padding(end = 0.dp),
        )

        Box(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (isEmpty) {
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
                textStyle = SabqTheme.typography.chipLabel.copy(
                    color = SabqTheme.colors.ink,
                ),
                cursorBrush = SolidColor(SabqTheme.colors.primaryEnd),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSubmit() }),
                modifier = Modifier.fillMaxWidth(),
            )
        }

        AnimatedVisibility(
            visible = !isEmpty,
            enter = fadeIn(animationSpec = tween(150)) + scaleIn(initialScale = 0.6f),
            exit = fadeOut(animationSpec = tween(150)) + scaleOut(targetScale = 0.6f),
        ) {
            Icon(
                imageVector = Icons.Filled.Cancel,
                contentDescription = "مسح",
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier
                    .size(18.dp)
                    .clickable {
                        haptics.light()
                        onValueChange("")
                    },
            )
        }
    }
}
