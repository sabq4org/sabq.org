package com.sabq.smart.feature.comments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch

@HiltViewModel
class BlockedUsersViewModel @Inject constructor(
    val store: CommentSafetyStore,
) : ViewModel()

/** «المستخدمون المحظورون» — نظير iOS `BlockedUsersView`. */
@Composable
fun BlockedUsersScreen(onBack: () -> Unit, viewModel: BlockedUsersViewModel = hiltViewModel()) {
    val state by viewModel.store.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { viewModel.store.reloadBlocked() }

    SabqDetailScaffold(title = "المستخدمون المحظورون", onBack = onBack) {
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "لا ترى تعليقات من حظرتهم. إلغاء الحظر يعيد ظهور تعليقاتهم.",
                fontSize = 13.sp,
                color = SabqTheme.colors.secondaryInk,
            )
            error?.let { Text(it, fontSize = 13.sp, color = SabqTheme.colors.coral) }
            if (state.blockedUsers.isEmpty()) {
                EmptyStateView(
                    icon = Icons.Outlined.Block,
                    tint = SabqTheme.colors.primaryEnd,
                    title = "لا يوجد مستخدمون محظورون",
                    subtitle = "يمكنك حظر أي معلّق من قائمة «⋯» بجوار تعليقه.",
                    modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                )
            } else {
                SurfaceCard { Column {
                    state.blockedUsers.forEachIndexed { index, user ->
                        if (index > 0) HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.5f))
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            val url = user.profileImageUrl
                            if (!url.isNullOrBlank()) {
                                AsyncImage(
                                    model = url,
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(36.dp).clip(CircleShape),
                                )
                            } else {
                                Box(
                                    Modifier.size(36.dp).clip(CircleShape)
                                        .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.15f)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(user.name?.take(1) ?: "م", color = SabqTheme.colors.primaryEnd)
                                }
                            }
                            Text(
                                user.name ?: "مستخدم",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = SabqTheme.colors.ink,
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(onClick = {
                                error = null
                                scope.launch {
                                    runCatching { viewModel.store.unblock(user.id) }
                                        .onFailure { error = "تعذر إلغاء الحظر، حاول مرة أخرى" }
                                }
                            }) { Text("إلغاء الحظر", color = SabqTheme.colors.primaryEnd) }
                        }
                    }
                } }
            }
        }
    }
}
