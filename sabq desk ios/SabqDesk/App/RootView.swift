import SabqDeskDesign
import SabqDeskKit
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(AppLockController.self) private var appLock
    @Environment(\.scenePhase) private var scenePhase

    @State private var lockWindow = AppLockWindowPresenter()

    var body: some View {
        content
            .accessibilityHidden(appLock.isLocked)
            // In-tree cover as a fallback; the window above also covers sheets.
            .overlay { coverView }
            .onChange(of: scenePhase, initial: true) { _, phase in
                switch phase {
                case .active: appLock.didBecomeActive()
                case .background: appLock.didEnterBackground()
                default: break
                }
            }
            .onChange(of: model.phase) { _, phase in
                if phase == .signedOut { appLock.sessionEnded() }
            }
            .onChange(of: cover, initial: true) { _, cover in
                lockWindow.update(cover, model: model, lock: appLock)
            }
    }

    /// The optional local Face ID lock sits above everything (including the
    /// launch spinner) but never replaces the server login or 2FA screens.
    private var cover: AppLockCover {
        if appLock.isLocked { return .lock }
        if scenePhase != .active, appLock.isGuarding, !appLock.isAuthenticating { return .privacy }
        return .none
    }

    @ViewBuilder
    private var coverView: some View {
        switch cover {
        case .lock: AppLockView()
        case .privacy: AppPrivacyCover()
        case .none: EmptyView()
        }
    }

    private var content: some View {
        Group {
            switch model.phase {
            case .launching:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .signedOut:
                LoginView()
            case .twoFactorRequired(let message):
                TwoFactorRequiredView(message: message)
            case .noAccess:
                NoAccessView()
            case .failed(let message):
                LaunchFailedView(message: message)
            case .ready:
                MainTabView()
            }
        }
        .background(DeskTheme.background)
        .task { await model.bootstrap() }
    }
}

/// Two tabs only (decision 2026-10-24): الوارد and الإعدادات.
struct MainTabView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    enum Tab: Hashable { case inbox, settings }
    @State private var tab: Tab = .inbox

    var body: some View {
        TabView(selection: $tab) {
            InboxView()
                .tabItem { Label("الوارد", systemImage: "tray") }
                .badge(model.unread.total)
                .tag(Tab.inbox)
            SettingsView()
                .tabItem { Label("الإعدادات", systemImage: "gearshape") }
                .tag(Tab.settings)
        }
        .onChange(of: model.pendingLink) { _, link in
            if link != nil { tab = .inbox }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.refreshUnread() } }
        }
    }
}

struct NoAccessView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        DeskMessageView(systemImage: "lock",
                        title: "لا تملك صلاحية الديسك",
                        message: "يحتاج حسابك صلاحية الاستفسارات أو سجل النشر الاجتماعي. تواصل مع مدير النظام.") {
            Button("تسجيل الخروج") { Task { await model.signOut() } }
                .buttonStyle(DeskSecondaryButtonStyle())
        }
    }
}

struct LaunchFailedView: View {
    @Environment(AppModel.self) private var model
    let message: String

    var body: some View {
        DeskMessageView(systemImage: "wifi.exclamationmark", title: "تعذر التحميل", message: message) {
            VStack(spacing: DeskLayout.space12) {
                Button("إعادة المحاولة") { Task { await model.reloadIdentity() } }
                    .buttonStyle(DeskPrimaryButtonStyle())
                Button("تسجيل الخروج") { Task { await model.signOut() } }
                    .buttonStyle(DeskSecondaryButtonStyle())
            }
        }
    }
}
