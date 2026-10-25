import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UIKit

struct SettingsView: View {
    @Environment(AppModel.self) private var model
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

                Section("الإشعارات") {
                    Button("إعدادات الإشعارات في النظام") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    }
                }

                Section {
                    Button("تسجيل الخروج", role: .destructive) { confirmSignOut = true }
                } footer: {
                    LTRText(text: versionString)
                }
            }
            .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
            .deskText(DeskType.excerpt)
            .navigationTitle("الإعدادات")
            .refreshable { await model.reloadIdentity() }
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

    private var versionString: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "-"
        let build = info?["CFBundleVersion"] as? String ?? "-"
        return "Sabq Desk \(version) (\(build))"
    }
}
