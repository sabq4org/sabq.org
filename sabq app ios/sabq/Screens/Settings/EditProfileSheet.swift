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
                VStack(alignment: .leading, spacing: 24) {
                    avatarSection

                    if saved {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(SabqFonts.app(size: 16))
                            Text("تم حفظ التغييرات بنجاح")
                                .font(SabqFonts.app(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.leaf)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(SabqTheme.leaf.opacity(0.08))
                        )
                    }

                    VStack(spacing: 16) {
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
                            HStack(spacing: 6) {
                                Image(systemName: "info.circle.fill")
                                    .font(SabqFonts.app(size: 11))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                                Text("لا يمكن تعديل الاسم بعد التسجيل لاعتبارات أمنية ومصداقية التعليقات")
                                    .font(SabqFonts.app(size: 11, weight: .regular))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
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

                        VStack(alignment: .leading, spacing: 8) {
                            Text("نبذة عنك")
                                .font(SabqFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            TextEditor(text: $bio)
                                .font(SabqFonts.app(size: 15, weight: .regular))
                                .foregroundStyle(SabqTheme.ink)
                                .frame(minHeight: 80)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .fill(SabqTheme.paleFill)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                                )
                                .overlay(alignment: .topLeading) {
                                    if bio.isEmpty {
                                        Text("اكتب نبذة مختصرة عنك...")
                                            .font(SabqFonts.app(size: 15, weight: .regular))
                                            .foregroundStyle(SabqTheme.tertiaryInk)
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 20)
                                            .allowsHitTesting(false)
                                    }
                                }
                        }
                    }

                    if let error = authStore.errorMessage {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(SabqFonts.app(size: 14))
                            Text(error)
                                .font(SabqFonts.app(size: 13, weight: .medium))
                        }
                        .foregroundStyle(SabqTheme.coral)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(SabqTheme.coral.opacity(0.08))
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
                        HStack(spacing: 10) {
                            if authStore.isLoading {
                                ProgressView().tint(.white)
                            }
                            Text("حفظ التغييرات")
                                .font(SabqFonts.app(size: 16, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(firstName.isEmpty || authStore.isLoading)
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(SabqFonts.app(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
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
        VStack(spacing: 16) {
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
                        .fill(SabqTheme.primaryEnd)
                        .frame(width: 30, height: 30)
                        .overlay {
                            Image(systemName: "camera.fill")
                                .font(SabqFonts.app(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        .shadow(color: .black.opacity(0.15), radius: 3, y: 1)
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
                .font(SabqFonts.app(size: 17, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            if authStore.isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("جاري رفع الصورة...")
                        .font(SabqFonts.app(size: 13, weight: .medium))
                }
                .foregroundStyle(SabqTheme.secondaryInk)
            }

            if showUploadNotice {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(SabqFonts.app(size: 14))
                    Text("تم تحديث الصورة الشخصية بنجاح")
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.leaf)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(SabqTheme.leaf.opacity(0.08))
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var avatarPlaceholder: some View {
        Circle()
            .fill(SabqTheme.primaryEnd.opacity(0.12))
            .frame(width: 90, height: 90)
            .overlay {
                Text(String((authStore.currentUser?.displayName ?? "م").prefix(1)))
                    .font(SabqFonts.app(size: 36, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    private func editField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextField(placeholder, text: text)
                .font(SabqFonts.app(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                )
        }
    }

    private var genderPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الجنس")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            Picker("الجنس", selection: $gender) {
                Text("غير محدد").tag("")
                Text("ذكر").tag("male")
                Text("أنثى").tag("female")
            }
            .pickerStyle(.segmented)
        }
    }

    private func readOnlyField(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Text(value)
                    .font(SabqFonts.app(size: 15, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 0)
                Image(systemName: "lock.fill")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(SabqTheme.paleFill.opacity(0.6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
        }
    }
}
