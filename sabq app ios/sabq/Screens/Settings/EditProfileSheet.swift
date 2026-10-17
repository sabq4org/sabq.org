import SwiftUI
import PhotosUI
import UIKit

// كانت هذه الورقة جزءًا من SettingsView.swift (3394 سطرًا = 8 شاشات
// في ملف واحد) — فُكّكت إلى Screens/Settings/ في تدقيق 2026-07-01.

// MARK: - Edit Profile Sheet

struct EditProfileSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var bio = ""
    @State private var city = ""
    @State private var gender = ""
    @State private var saved = false
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showAvatarPicker = false
    @State private var selectedImage: UIImage?
    @State private var showUploadNotice = false
    /// True when the user already has a non-empty firstName/lastName.
    /// Names are write-once for comment-integrity reasons — once set the
    /// backend silently drops further updates, so the UI mirrors that by
    /// disabling the inputs and surfacing a lock helper.
    @State private var firstNameLocked = false
    @State private var lastNameLocked = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SabqLayout.space24) {
                    avatarSection

                    if saved {
                        HStack(spacing: SabqLayout.space8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(SabqFonts.app(size: 16))
                            Text("تم حفظ التغييرات بنجاح")
                                .sabqText(SabqType.metaEmphasis)
                        }
                        .foregroundStyle(SabqTheme.success)
                        .padding(.horizontal, SabqLayout.space12)
                        .padding(.vertical, SabqLayout.space12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
                        )
                    }

                    VStack(spacing: SabqLayout.space16) {
                        if firstNameLocked {
                            readOnlyField(label: "الاسم الأول", value: firstName, icon: "person.fill")
                        } else {
                            editField(label: "الاسم الأول", placeholder: "أدخل الاسم الأول", text: $firstName)
                        }
                        if lastNameLocked {
                            readOnlyField(label: "اسم العائلة", value: lastName, icon: "person.fill")
                        } else {
                            editField(label: "اسم العائلة", placeholder: "أدخل اسم العائلة", text: $lastName)
                        }
                        if firstNameLocked || lastNameLocked {
                            HStack(spacing: SabqLayout.space8) {
                                Image(systemName: "info.circle.fill")
                                    .sabqText(SabqType.tag)
                                    .foregroundStyle(SabqTheme.textTertiary)
                                Text("لا يمكن تعديل الاسم بعد التسجيل لاعتبارات أمنية ومصداقية التعليقات")
                                    .sabqText(SabqType.tag)
                                    .foregroundStyle(SabqTheme.textTertiary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        editField(label: "المدينة", placeholder: "أدخل مدينتك", text: $city)
                        genderPicker

                        if let email = authStore.currentUser?.email, !email.isEmpty {
                            readOnlyField(label: "البريد الإلكتروني", value: email, icon: "envelope.fill")
                        }
                        if let phone = authStore.currentUser?.phoneNumber, !phone.isEmpty {
                            readOnlyField(label: "رقم الجوال", value: phone, icon: "phone.fill")
                        }

                        VStack(alignment: .leading, spacing: SabqLayout.space8) {
                            Text("نبذة عنك")
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(SabqTheme.textPrimary)

                            TextEditor(text: $bio)
                                .sabqText(SabqType.excerpt)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .frame(minHeight: 80)
                                .padding(SabqLayout.space12)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .fill(SabqTheme.surface)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 1)
                                )
                                .overlay(alignment: .topLeading) {
                                    if bio.isEmpty {
                                        Text("اكتب نبذة مختصرة عنك...")
                                            .sabqText(SabqType.excerpt)
                                            .foregroundStyle(SabqTheme.textTertiary)
                                            .padding(.horizontal, SabqLayout.space16)
                                            .padding(.vertical, SabqLayout.space24)
                                            .allowsHitTesting(false)
                                    }
                                }
                        }
                    }

                    if let error = authStore.errorMessage {
                        HStack(spacing: SabqLayout.space8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .sabqText(SabqType.excerpt)
                            Text(error)
                                .sabqText(SabqType.meta)
                        }
                        .foregroundStyle(SabqTheme.danger)
                        .padding(.horizontal, SabqLayout.space12)
                        .padding(.vertical, SabqLayout.space12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
                        )
                    }

                    Button {
                        Task {
                            await authStore.updateProfile(
                                firstName: firstName,
                                lastName: lastName,
                                bio: bio.isEmpty ? nil : bio,
                                city: city.isEmpty ? nil : city,
                                gender: gender.isEmpty ? nil : gender
                            )
                            if authStore.errorMessage == nil {
                                withAnimation { saved = true }
                                try? await Task.sleep(for: .seconds(1.5))
                                dismiss()
                            }
                        }
                    } label: {
                        HStack(spacing: SabqLayout.space8) {
                            if authStore.isLoading {
                                ProgressView().tint(SabqTheme.onAction)
                            }
                            Text("حفظ التغييرات")
                                .sabqText(SabqType.button)
                        }
                        .foregroundStyle(SabqTheme.onAction)
                        .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                        .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(firstName.isEmpty || authStore.isLoading)
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.vertical, SabqLayout.space24)
            }
            .sabqNavigationEdge()
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Label("إغلاق", systemImage: "xmark")
                            .labelStyle(.iconOnly)
                    }
                }
            }
            .onAppear {
                if let user = authStore.currentUser {
                    firstName = user.firstName ?? ""
                    lastName = user.lastName ?? ""
                    bio = user.bio ?? ""
                    city = user.city ?? ""
                    let normalizedGender = (user.gender ?? "").lowercased()
                    gender = (normalizedGender == "male" || normalizedGender == "female") ? normalizedGender : ""
                    firstNameLocked = !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    lastNameLocked = !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                }
            }
        }
    }

    private var avatarSection: some View {
        VStack(spacing: SabqLayout.space16) {
            ZStack(alignment: .bottomTrailing) {
                if let selectedImage {
                    Image(uiImage: selectedImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 90, height: 90)
                        .clipShape(Circle())
                } else if let user = authStore.currentUser, let avatarURL = user.avatar, let url = URL(string: avatarURL) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        avatarPlaceholder
                    }
                    .frame(width: 90, height: 90)
                    .clipShape(Circle())
                } else {
                    avatarPlaceholder
                }

                Button {
                    Task {
                        // App Store review expects the platform's
                        // photo-library permission alert to appear at
                        // the moment the user invokes a photo flow —
                        // PhotosUI.PhotosPicker alone bypasses it
                        // because it runs out-of-process.
                        await SabqPhotoPermission.ensureRequested()
                        showAvatarPicker = true
                    }
                } label: {
                    Circle()
                        .fill(SabqTheme.actionFill)
                        .frame(width: 32, height: 32)
                        .overlay {
                            Image(systemName: "camera.fill")
                                .sabqText(SabqType.button)
                                .foregroundStyle(SabqTheme.onAction)
                        }
                }
                .buttonStyle(.plain)
                .photosPicker(isPresented: $showAvatarPicker, selection: $selectedPhoto, matching: .images)
            }
            .onChange(of: selectedPhoto) { _, newValue in
                Task {
                    if let data = try? await newValue?.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: data) {
                        selectedImage = uiImage
                        // صغّر واضغط قبل الرفع: صورة المكتبة قد تتجاوز 12MP،
                        // وكان pngData بدقة كاملة يرفع عشرات الميغابايت على
                        // شبكة الجوال — 1024px بصيغة JPEG تكفي لصورة رمزية.
                        let maxDim: CGFloat = 1024
                        let longest = max(uiImage.size.width, uiImage.size.height)
                        var upload = uiImage
                        if longest > maxDim, longest > 0 {
                            let scale = maxDim / longest
                            let target = CGSize(width: uiImage.size.width * scale,
                                                height: uiImage.size.height * scale)
                            upload = await uiImage.byPreparingThumbnail(ofSize: target) ?? uiImage
                        }
                        if let jpegData = upload.jpegData(compressionQuality: 0.85) ?? upload.pngData() {
                            await authStore.uploadAvatar(imageData: jpegData)
                            if authStore.errorMessage == nil {
                                withAnimation { showUploadNotice = true }
                            }
                        }
                    }
                }
            }

            Text(authStore.currentUser?.displayName ?? "")
                .sabqText(SabqType.button)
                .foregroundStyle(SabqTheme.textPrimary)

            if authStore.isLoading {
                HStack(spacing: SabqLayout.space8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("جاري رفع الصورة...")
                        .sabqText(SabqType.meta)
                }
                .foregroundStyle(SabqTheme.textSecondary)
            }

            if showUploadNotice {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "checkmark.circle.fill")
                        .sabqText(SabqType.excerpt)
                    Text("تم تحديث الصورة الشخصية بنجاح")
                        .sabqText(SabqType.metaEmphasis)
                }
                .foregroundStyle(SabqTheme.success)
                .padding(.horizontal, SabqLayout.space12)
                .padding(.vertical, SabqLayout.space8)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.surfaceMuted)
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space8)
    }

    private var avatarPlaceholder: some View {
        Circle()
            .fill(SabqTheme.surfaceMuted)
            .frame(width: 90, height: 90)
            .overlay {
                Text(String((authStore.currentUser?.displayName ?? "م").prefix(1)))
                    .font(SabqFonts.app(size: 36, weight: .bold))
                    .foregroundStyle(SabqTheme.primary)
            }
    }

    private func editField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(label)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)

            TextField(placeholder, text: text)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textPrimary)
                .padding(.horizontal, SabqLayout.space16)
                .padding(.vertical, SabqLayout.space12)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 1)
                )
        }
    }

    private var genderPicker: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text("الجنس")
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)

            Picker("الجنس", selection: $gender) {
                Text("غير محدد").tag("")
                Text("ذكر").tag("male")
                Text("أنثى").tag("female")
            }
            .pickerStyle(.segmented)
        }
    }

    private func readOnlyField(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(label)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)

            HStack(spacing: SabqLayout.space8) {
                Image(systemName: icon)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                Text(value)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 0)
                Image(systemName: "lock.fill")
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            .padding(.horizontal, SabqLayout.space16)
            .padding(.vertical, SabqLayout.space12)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
            )
        }
    }
}
