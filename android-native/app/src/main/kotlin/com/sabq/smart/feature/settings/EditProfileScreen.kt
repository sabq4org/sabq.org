package com.sabq.smart.feature.settings

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Phone
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import com.sabq.smart.data.User
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay

/**
 * Edit profile sheet — ports the form portion of
 * `SettingsView.swift:2075-2406` plus the avatar picker so users can
 * upload or remove their profile image directly from the form.
 */
@Composable
fun EditProfileScreen(
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val user by authViewModel.currentUser.collectAsStateWithLifecycle()
    val context = LocalContext.current

    var firstName by remember(user?.id) { mutableStateOf(user?.firstName.orEmpty()) }
    var lastName by remember(user?.id) { mutableStateOf(user?.lastName.orEmpty()) }
    var bio by remember(user?.id) { mutableStateOf(user?.bio.orEmpty()) }
    var city by remember(user?.id) { mutableStateOf(user?.city.orEmpty()) }
    var gender by remember(user?.id) { mutableStateOf(user?.gender.orEmpty()) }

    // Local override when the user picks a new image but the save
    // hasn't lifted off yet — the picker URI renders immediately.
    var pendingAvatarUri by remember { mutableStateOf<Uri?>(null) }

    val pickAvatar = rememberLauncherForActivityResult(
        contract = PickVisualMedia(),
    ) { uri: Uri? ->
        if (uri != null) {
            pendingAvatarUri = uri
            val bytes = runCatching {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            }.getOrNull()
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            if (bytes != null && bytes.isNotEmpty()) {
                viewModel.uploadAvatar(bytes, mime)
            }
        }
    }

    val valid = firstName.isNotBlank() && lastName.isNotBlank()

    // Auto-dismiss only when the SAVE succeeded (not on avatar upload —
    // the user is still editing the form). We track this with a local
    // flag that flips only when the explicit save runs.
    var saveJustFinished by remember { mutableStateOf(false) }
    LaunchedEffect(state.success, saveJustFinished) {
        if (state.success && saveJustFinished) {
            delay(1500)
            onBack()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(title = "تعديل الملف الشخصي", onClose = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            AvatarPicker(
                user = user,
                pendingUri = pendingAvatarUri,
                isUploading = state.isLoading && !saveJustFinished,
                onPick = {
                    pickAvatar.launch(PickVisualMediaRequest(PickVisualMedia.ImageOnly))
                },
                onDelete = {
                    pendingAvatarUri = null
                    viewModel.deleteAvatar()
                },
            )

            if (state.success && saveJustFinished) {
                SuccessBanner(message = "تم حفظ التغييرات بنجاح")
            }

            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                SheetField(
                    label = "الاسم الأول",
                    value = firstName,
                    onValueChange = { firstName = it },
                    placeholder = "أدخل الاسم الأول",
                )
                SheetField(
                    label = "اسم العائلة",
                    value = lastName,
                    onValueChange = { lastName = it },
                    placeholder = "أدخل اسم العائلة",
                )
                SheetField(
                    label = "المدينة",
                    value = city,
                    onValueChange = { city = it },
                    placeholder = "أدخل مدينتك",
                )
                GenderPicker(selected = gender, onChange = { gender = it })

                user?.email?.takeIf { it.isNotBlank() }?.let { email ->
                    SheetReadOnlyField(
                        label = "البريد الإلكتروني",
                        value = email,
                        icon = Icons.Filled.Email,
                    )
                }
                user?.phone?.takeIf { it.isNotBlank() }?.let { phone ->
                    SheetReadOnlyField(
                        label = "رقم الجوال",
                        value = phone,
                        icon = Icons.Filled.Phone,
                    )
                }

                SheetField(
                    label = "نبذة عنك",
                    value = bio,
                    onValueChange = { bio = it },
                    placeholder = "اكتب نبذة مختصرة عنك...",
                    singleLine = false,
                    minLines = 3,
                )
            }

            state.errorMessage?.let { ErrorBanner(message = it) }

            PrimaryGradientButton(
                title = "حفظ التغييرات",
                isLoading = state.isLoading,
                enabled = valid,
                onClick = {
                    saveJustFinished = true
                    viewModel.updateProfile(
                        firstName = firstName.trim(),
                        lastName = lastName.trim(),
                        bio = bio.trim().takeIf { it.isNotEmpty() },
                        city = city.trim().takeIf { it.isNotEmpty() },
                        gender = gender.takeIf { it.isNotEmpty() },
                        onSaved = { },
                    )
                },
            )
        }
    }
}

@Composable
private fun AvatarPicker(
    user: User?,
    pendingUri: Uri?,
    isUploading: Boolean,
    onPick: () -> Unit,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    val displayModel: Any? = pendingUri ?: user?.avatarUrl?.takeIf { it.isNotBlank() }
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(112.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.15f))
                .border(
                    width = 3.dp,
                    color = SabqTheme.colors.primaryEnd.copy(alpha = 0.20f),
                    shape = CircleShape,
                )
                .clickable(enabled = !isUploading) { onPick() },
            contentAlignment = Alignment.Center,
        ) {
            when {
                displayModel != null -> SubcomposeAsyncImage(
                    model = ImageRequest.Builder(context).data(displayModel).crossfade(true).build(),
                    contentDescription = user?.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(112.dp).clip(CircleShape),
                    loading = { Initial(user) },
                    error = { Initial(user) },
                )
                else -> Initial(user)
            }
            if (isUploading) {
                Box(
                    modifier = Modifier
                        .size(112.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.3f)),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }
            // Small camera badge bottom-end
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd)
                    .border(
                        width = 2.dp,
                        color = SabqTheme.colors.background,
                        shape = CircleShape,
                    )
                    .clickable(enabled = !isUploading) { onPick() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.PhotoCamera,
                    contentDescription = "تغيير الصورة",
                    tint = Color.White,
                    modifier = Modifier.size(16.dp),
                )
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PillButton(
                label = "تغيير الصورة",
                icon = Icons.Filled.PhotoCamera,
                tint = SabqTheme.colors.primaryEnd,
                enabled = !isUploading,
                onClick = onPick,
            )
            if (user?.avatarUrl != null) {
                PillButton(
                    label = "حذف",
                    icon = Icons.Filled.Delete,
                    tint = SabqTheme.colors.coral,
                    enabled = !isUploading,
                    onClick = onDelete,
                )
            }
        }
    }
}

@Composable
private fun Initial(user: User?) {
    Text(
        text = (user?.displayName ?: "").take(1).ifBlank { "?" },
        style = SabqTheme.typography.cardTitle.copy(
            fontSize = 44.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.primaryEnd,
        ),
    )
}

@Composable
private fun PillButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(tint.copy(alpha = 0.10f))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(13.dp),
        )
        Text(
            text = label,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = tint,
            ),
        )
    }
}

@Composable
private fun GenderPicker(selected: String, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "الجنس",
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GenderChip("ذكر", "male", selected, onChange)
            GenderChip("أنثى", "female", selected, onChange)
            GenderChip("غير ذلك", "other", selected, onChange)
        }
    }
}

@Composable
private fun GenderChip(label: String, value: String, selected: String, onChange: (String) -> Unit) {
    val isOn = selected == value
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Box(
        modifier = Modifier
            .clip(shape)
            .background(
                if (isOn) SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)
                else SabqTheme.colors.paleFill,
                shape,
            )
            .clickable { onChange(value) }
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(
            text = label,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = if (isOn) FontWeight.Bold else FontWeight.Medium,
                color = if (isOn) SabqTheme.colors.primaryEnd else SabqTheme.colors.secondaryInk,
            ),
        )
    }
}
