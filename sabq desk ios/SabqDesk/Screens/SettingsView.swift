import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UIKit

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(AppLockController.self) private var appLock
    @Environment(\.openURL) private var openURL
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if let me = model.me {
                    Section {
                        VStack(alignment: .leading, spacing: DeskLayout.space4) {
                            Text(me.displayName)
                                .deskText(DeskType.rowTitle)
                                .foregroundStyle(DeskTheme.textPrimary)
                            if let email = me.email {
                                LTRText(text: email, role: DeskType.meta, color: DeskTheme.textSecondary)
                            }
                        }
                        .padding(.vertical, DeskLayout.space4)
                        row("الدور", value: me.roleDisplayLabel)
                        row("المصادقة الثنائية", value: me.twoFactorEnabled == true ? "مفعّلة" : "غير مفعّلة")
                    }

                    Section("الصلاحيات") {
                        permission("استفسارات الكتّاب", me.capabilities.canTickets)
                        permission("عرض مقترحات النشر", me.capabilities.canSocial.view)
                        permission("النشر الفوري", me.capabilities.canSocial.publish)
                        permission("الجدولة", me.capabilities.canSocial.schedule)
                        permission("الرفض", me.capabilities.canSocial.reject)
                    }
                }

                Section {
                    Toggle(isOn: appLockBinding) {
                        Label(appLock.availability.toggleTitle,
                              systemImage: appLock.availability.kind?.systemImage ?? "lock")
                            .foregroundStyle(DeskTheme.textPrimary)
                    }
                    .tint(DeskTheme.primary)
                    .disabled(appLock.isAuthenticating || (!appLock.availability.isAvailable && !appLock.isEnabled))
                } header: {
                    Text("الأمان")
                } footer: {
                    Text(appLockFooter)
                        .deskText(DeskType.meta)
                        .foregroundStyle(appLock.errorMessage == nil ? DeskTheme.textSecondary : DeskTheme.danger)
                }

                Section("الإشعارات") {
                    Button("إعدادات الإشعارات في النظام") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    }
                }

                Section("حول التطبيق") {
                    HStack {
                        Text("الإصدار").foregroundStyle(DeskTheme.textSecondary)
                        Spacer()
                        LTRText(text: appVersion, role: DeskType.excerpt, color: DeskTheme.textPrimary)
                    }
                    HStack {
                        Text("رقم البناء").foregroundStyle(DeskTheme.textSecondary)
                        Spacer()
                        LTRText(text: buildNumber, role: DeskType.excerpt, color: DeskTheme.textPrimary)
                    }
                }

                Section {
                    Button("تسجيل الخروج", role: .destructive) { confirmSignOut = true }
                } footer: {
                    LTRText(text: "Sabq Desk \(appVersion) (\(buildNumber))")
                }
            }
            .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
            .deskText(DeskType.excerpt)
            .navigationTitle("الإعدادات")
            .refreshable { await model.reloadIdentity() }
            .onAppear { appLock.refreshAvailability() }
            .confirmationDialog("تسجيل الخروج من الديسك؟", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("تسجيل الخروج", role: .destructive) { Task { await model.signOut() } }
                Button("إلغاء", role: .cancel) {}
            } message: {
                Text("لن تصلك إشعارات الديسك على هذا الجهاز حتى تسجّل الدخول مجدداً.")
            }
        }
    }

    private func row(_ title: String, value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(DeskTheme.textSecondary)
            Spacer()
            Text(value).foregroundStyle(DeskTheme.textPrimary)
        }
    }

    private func permission(_ title: String, _ granted: Bool) -> some View {
        HStack {
            Text(title).foregroundStyle(DeskTheme.textPrimary)
            Spacer()
            Image(systemName: granted ? "checkmark" : "minus")
                .foregroundStyle(granted ? DeskTheme.success : DeskTheme.textTertiary)
                .accessibilityLabel(granted ? "متاحة" : "غير متاحة")
        }
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "-"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "-"
    }

    /// Turning the lock on asks for Face ID / passcode once; the toggle only
    /// flips after that succeeds.
    private var appLockBinding: Binding<Bool> {
        Binding(get: { appLock.isEnabled },
                set: { newValue in Task { await appLock.setEnabled(newValue) } })
    }

    private var appLockFooter: String {
        if let error = appLock.errorMessage { return error }
        if let reason = appLock.availability.unavailableReason, !appLock.isEnabled { return reason }
        return "عند التفعيل يُطلب التحقق عند فتح التطبيق، وعند العودة إليه بعد أكثر من دقيقة. هذا قفل محلي إضافي على الجهاز ولا يغني عن تسجيل الدخول والمصادقة الثنائية."
    }
}
