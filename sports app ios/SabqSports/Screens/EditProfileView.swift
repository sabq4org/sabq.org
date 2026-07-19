import SwiftUI
import PhotosUI
import UIKit

/// تعديل الملف الشخصي داخل VARA — صورة + اسم (مرة واحدة) + بريد بدل الاصطناعي.
/// الصورة تُحفظ في نفس `profileImageUrl` لحساب سبق فتظهر على الويب فورًا.
struct EditProfileView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var firstNameLocked = false
    @State private var lastNameLocked = false
    @State private var emailLocked = false
    @State private var saved = false
    @State private var avatarUploaded = false
    @State private var localError: String?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showAvatarPicker = false
    @State private var selectedImage: UIImage?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    avatarSection

                    if saved {
                        statusBanner(
                            icon: "checkmark.circle.fill",
                            text: L("تم حفظ التغييرات بنجاح"),
                            color: SpTheme.green
                        )
                    } else if avatarUploaded {
                        statusBanner(
                            icon: "checkmark.circle.fill",
                            text: L("تم تحديث الصورة الشخصية"),
                            color: SpTheme.green
                        )
                    }

                    VStack(spacing: 14) {
                        if firstNameLocked {
                            readOnlyField(label: L("الاسم الأول"), value: firstName, icon: "person.fill")
                        } else {
                            editField(label: L("الاسم الأول"), placeholder: L("أدخل الاسم الأول"), text: $firstName)
                        }
                        if lastNameLocked {
                            readOnlyField(label: L("اسم العائلة"), value: lastName, icon: "person.fill")
                        } else {
                            editField(label: L("اسم العائلة"), placeholder: L("أدخل اسم العائلة"), text: $lastName)
                        }
                        if firstNameLocked || lastNameLocked {
                            helperRow(L("لا يمكن تعديل الاسم بعد تعيينه لاعتبارات أمنية ومصداقية التعليقات"))
                        } else {
                            helperRow(L("أضف اسمك ليظهر في عضويتك على سبق وVARA"))
                        }

                        if let phone = auth.member?.phone, !phone.isEmpty {
                            readOnlyField(label: L("رقم الجوال"), value: phone, icon: "phone.fill")
                        }

                        if emailLocked {
                            readOnlyField(label: L("البريد الإلكتروني"), value: email, icon: "envelope.fill")
                        } else {
                            editField(
                                label: L("البريد الإلكتروني"),
                                placeholder: L("أضف بريدك الإلكتروني (اختياري)"),
                                text: $email,
                                keyboard: .emailAddress
                            )
                            helperRow(L("البريد اختياري — رقم الجوال هو وسيلة الدخول الأساسية"))
                        }
                    }

                    if let err = localError ?? auth.errorMessage {
                        statusBanner(icon: "exclamationmark.triangle.fill", text: err, color: Color.red.opacity(0.85))
                    }

                    Button {
                        Task { await save() }
                    } label: {
                        HStack(spacing: 10) {
                            if auth.isLoading {
                                ProgressView().tint(.white)
                            }
                            Text(L("حفظ التغييرات"))
                                .font(SportsFonts.app(size: 16, weight: .heavy))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(
                            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                                .fill(canSave ? SpTheme.green : SpTheme.green.opacity(0.45))
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSave || auth.isLoading)
                }
                .padding(20)
            }
            .background(SpAmbientBackground())
            .navigationTitle(L("تعديل الملف الشخصي"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SpTheme.onDarkFaint)
                    }
                }
            }
            .onAppear { hydrate() }
            .photosPicker(isPresented: $showAvatarPicker, selection: $selectedPhoto, matching: .images)
            .onChange(of: selectedPhoto) { _, newValue in
                Task { await handlePickedPhoto(newValue) }
            }
        }
    }

    private var avatarSection: some View {
        VStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                Group {
                    if let selectedImage {
                        Image(uiImage: selectedImage)
                            .resizable()
                            .scaledToFill()
                    } else if let url = auth.member?.avatar, !url.isEmpty {
                        SpAvatarImage(url: url, size: 90, ring: SpTheme.green.opacity(0.35),
                                      placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
                    } else {
                        Circle()
                            .fill(SpTheme.green.opacity(0.14))
                            .overlay {
                                Text(String((auth.member?.name ?? L("عضو VARA")).prefix(1)))
                                    .font(SportsFonts.app(size: 34, weight: .heavy))
                                    .foregroundStyle(SpTheme.green)
                            }
                    }
                }
                .frame(width: 90, height: 90)
                .clipShape(Circle())
                .overlay(Circle().stroke(SpTheme.green.opacity(0.35), lineWidth: 2))

                Button {
                    Task {
                        await SpPhotoPermission.ensureRequested()
                        showAvatarPicker = true
                    }
                } label: {
                    Circle()
                        .fill(SpTheme.green)
                        .frame(width: 30, height: 30)
                        .overlay {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .shadow(color: .black.opacity(0.18), radius: 3, y: 1)
                }
                .buttonStyle(.plain)
            }

            Text(L("الصورة تظهر في حسابك على سبق وVARA"))
                .font(SportsFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private var canSave: Bool {
        if !firstNameLocked {
            let fn = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
            if fn.isEmpty { return false }
        }
        if !emailLocked {
            let em = email.trimmingCharacters(in: .whitespacesAndNewlines)
            if !em.isEmpty && !em.contains("@") { return false }
        }
        if !firstNameLocked || !lastNameLocked { return true }
        if !emailLocked {
            let em = email.trimmingCharacters(in: .whitespacesAndNewlines)
            return !em.isEmpty
        }
        return false
    }

    private func hydrate() {
        guard let m = auth.member else { return }
        firstName = m.firstName ?? ""
        lastName = m.lastName ?? ""
        if firstName.isEmpty, lastName.isEmpty, let full = m.name, !full.isEmpty {
            let parts = full.split(separator: " ", maxSplits: 1).map(String.init)
            firstName = parts.first ?? ""
            lastName = parts.count > 1 ? parts[1] : ""
        }
        firstNameLocked = !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        lastNameLocked = !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        if let real = m.displayEmail {
            email = real
            emailLocked = true
        } else {
            email = ""
            emailLocked = false
        }
    }

    private func handlePickedPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        localError = nil
        auth.errorMessage = nil
        guard let data = try? await item.loadTransferable(type: Data.self),
              let uiImage = UIImage(data: data) else {
            localError = L("تعذّر قراءة الصورة")
            return
        }
        selectedImage = uiImage
        let maxDim: CGFloat = 1024
        let longest = max(uiImage.size.width, uiImage.size.height)
        var upload = uiImage
        if longest > maxDim, longest > 0 {
            let scale = maxDim / longest
            let target = CGSize(width: uiImage.size.width * scale, height: uiImage.size.height * scale)
            upload = await uiImage.byPreparingThumbnail(ofSize: target) ?? uiImage
        }
        guard let jpeg = upload.jpegData(compressionQuality: 0.85) else {
            localError = L("تعذّر تجهيز الصورة")
            return
        }
        let ok = await auth.uploadAvatar(imageData: jpeg)
        if ok {
            withAnimation { avatarUploaded = true }
        } else {
            selectedImage = nil
        }
    }

    private func save() async {
        localError = nil
        auth.errorMessage = nil
        let fn = firstNameLocked ? nil : firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let ln = lastNameLocked ? nil : lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let em: String? = {
            guard !emailLocked else { return nil }
            let v = email.trimmingCharacters(in: .whitespacesAndNewlines)
            return v.isEmpty ? nil : v
        }()
        if let em, !em.contains("@") {
            localError = L("صيغة البريد الإلكتروني غير صحيحة")
            return
        }
        let ok = await auth.updateProfile(
            firstName: (fn?.isEmpty == false) ? fn : nil,
            lastName: (ln?.isEmpty == false) ? ln : nil,
            email: em
        )
        if ok {
            withAnimation { saved = true }
            try? await Task.sleep(for: .seconds(1.2))
            dismiss()
        }
    }

    private func editField(
        label: String,
        placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
            TextField(placeholder, text: text)
                .font(SportsFonts.app(size: 15, weight: .semibold))
                .foregroundStyle(SpTheme.onDark)
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .emailAddress ? .never : .words)
                .autocorrectionDisabled(keyboard == .emailAddress)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(SpTheme.card)
                )
        }
    }

    private func readOnlyField(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                Text(value)
                    .font(SportsFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 0)
                Image(systemName: "lock.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(SpTheme.card.opacity(0.7))
            )
        }
    }

    private func helperRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
            Text(text)
                .font(SportsFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func statusBanner(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
            Text(text)
                .font(SportsFonts.app(size: 13, weight: .bold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(color.opacity(0.12))
        )
    }
}
