import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// Full-screen cover while the local app lock is engaged.
struct AppLockView: View {
    @Environment(AppModel.self) private var model
    @Environment(AppLockController.self) private var lock

    var body: some View {
        VStack(spacing: DeskLayout.space16) {
            Spacer()
            Image("SabqLogo")
                .resizable()
                .scaledToFit()
                .frame(height: 40)
                .accessibilityLabel("سبق")
            Image(systemName: lock.availability.kind?.systemImage ?? "lock.fill")
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(DeskTheme.primary)
                .accessibilityHidden(true)
            Text("ديسك سبق مقفل")
                .deskText(DeskType.sectionHeading)
                .foregroundStyle(DeskTheme.textPrimary)
                .multilineTextAlignment(.center)
            Text(unlockHint)
                .deskText(DeskType.excerpt)
                .foregroundStyle(DeskTheme.textSecondary)
                .multilineTextAlignment(.center)
            if let message = lock.errorMessage {
                ErrorLine(message: message)
            }
            VStack(spacing: DeskLayout.space12) {
                Button {
                    Task { await lock.unlock() }
                } label: {
                    HStack(spacing: DeskLayout.space8) {
                        if lock.isAuthenticating { ProgressView() }
                        Text("فتح القفل")
                    }
                }
                .buttonStyle(DeskPrimaryButtonStyle())
                .disabled(lock.isAuthenticating)

                Button("تسجيل الخروج") { Task { await model.signOut() } }
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .padding(.top, DeskLayout.space8)
                    .disabled(lock.isAuthenticating)
            }
            .padding(.top, DeskLayout.space8)
            Spacer()
        }
        .padding(.horizontal, DeskLayout.space24)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DeskTheme.background)
    }

    private var unlockHint: String {
        if let kind = lock.availability.kind, lock.availability.isAvailable {
            return "استخدم \(kind.displayName) أو رمز دخول الجهاز لفتح التطبيق."
        }
        return "استخدم رمز دخول الجهاز لفتح التطبيق."
    }
}

/// Plain cover shown in the app switcher while the lock is on, so inbox
/// content is not visible in the snapshot.
struct AppPrivacyCover: View {
    var body: some View {
        VStack {
            Image("SabqLogo")
                .resizable()
                .scaledToFit()
                .frame(height: 40)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DeskTheme.background)
    }
}
