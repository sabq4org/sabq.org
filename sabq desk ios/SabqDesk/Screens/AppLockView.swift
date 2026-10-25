import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// Full-screen cover while the local app lock is engaged.
struct AppLockView: View {
    @Environment(AppModel.self) private var model
    @Environment(AppLockController.self) private var lock

    var body: some View {
        VStack(spacing: DeskLayout.space16) {
            Spacer(minLength: DeskLayout.space24)
            DeskMascot(size: 180)
            VStack(spacing: 2) {
                Text("مكتب سبق")
                    .deskText(DeskType.pageTitle)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(verbatim: "SABQ DESK")
                    .font(DeskFonts.app(size: 12, weight: .semibold))
                    .tracking(2)
                    .foregroundStyle(DeskInk.link)
            }
            AssistantBubble(text: greeting)
                .padding(.top, DeskLayout.space8)
            if let message = lock.errorMessage {
                ErrorLine(message: message)
            }
            Spacer(minLength: DeskLayout.space16)
            VStack(spacing: DeskLayout.space12) {
                Button {
                    Task { await lock.unlock() }
                } label: {
                    HStack(spacing: DeskLayout.space8) {
                        if lock.isAuthenticating {
                            ProgressView().tint(Color.white)
                        } else {
                            Image(systemName: lock.availability.kind?.systemImage ?? "lock.open")
                        }
                        Text(unlockTitle)
                    }
                }
                .buttonStyle(DeskBigButtonStyle())
                .disabled(lock.isAuthenticating)

                Button("تسجيل الخروج") { Task { await model.signOut() } }
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .frame(minHeight: DeskLayout.touchTarget)
                    .disabled(lock.isAuthenticating)
            }
            .padding(.bottom, DeskLayout.space16)
        }
        .padding(.horizontal, DeskLayout.space24)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DeskTheme.background)
    }

    /// «أهلًا علي، عندك 3 تغريدات بانتظار قرارك.» then how to unlock.
    private var greeting: String {
        let counts = DeskCount.greeting(name: model.me?.displayName,
                                        pendingTweets: model.unread.social,
                                        openMessages: model.unread.tickets,
                                        showsTweets: model.capabilities.canSocial.view,
                                        showsMessages: model.capabilities.canTickets)
        return counts + " " + unlockHint
    }

    private var unlockTitle: String {
        if let kind = lock.availability.kind, lock.availability.isAvailable { return "افتح بـ \(kind.displayName)" }
        return "افتح القفل"
    }

    private var unlockHint: String {
        if let kind = lock.availability.kind, lock.availability.isAvailable {
            return "استخدم \(kind.displayName) أو رمز الجهاز للمتابعة."
        }
        return "استخدم رمز الجهاز للمتابعة."
    }
}

/// Plain cover shown in the app switcher while the lock is on, so inbox
/// content is not visible in the snapshot.
struct AppPrivacyCover: View {
    var body: some View {
        VStack(spacing: DeskLayout.space12) {
            DeskMascot(size: 140)
            Text("مكتب سبق")
                .deskText(DeskType.sectionHeading)
                .foregroundStyle(DeskTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DeskTheme.background)
    }
}
