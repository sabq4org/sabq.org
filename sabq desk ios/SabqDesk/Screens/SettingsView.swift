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
                        SettingsAccountHeader(me: me)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }

                    Section {
                        SettingsRow(title: "المصادقة الثنائية", systemImage: "lock.shield.fill",
                                    tone: me.twoFactorEnabled == true ? .success : .warning) {
                            StatusChip(title: me.twoFactorEnabled == true ? "مفعّلة" : "غير مفعّلة",
                                       tone: me.twoFactorEnabled == true ? .success : .warning)
                        }
                    }
                    .listRowBackground(DeskTheme.cardBackground)

                    Section {
                        permission("استفسارات الكتّاب", systemImage: "bubble.left.and.bubble.right.fill",
                                   me.capabilities.canTickets)
                        permission("عرض مقترحات النشر", systemImage: "eye.fill", me.capabilities.canSocial.view)
                        permission("النشر الفوري", systemImage: "paperplane.fill", me.capabilities.canSocial.publish)
                        permission("الجدولة", systemImage: "calendar.badge.clock", me.capabilities.canSocial.schedule)
                        permission("الرفض", systemImage: "xmark.circle.fill", me.capabilities.canSocial.reject)
                    } header: {
                        sectionHeader("الصلاحيات")
                    }
                    .listRowBackground(DeskTheme.cardBackground)
                }

                Section {
                    Toggle(isOn: appLockBinding) {
                        SettingsRowLabel(title: appLock.availability.toggleTitle,
                                         systemImage: appLock.availability.kind?.systemImage ?? "lock",
                                         tone: .info)
                    }
                    .tint(DeskTheme.primary)
                    .disabled(appLock.isAuthenticating || (!appLock.availability.isAvailable && !appLock.isEnabled))
                } header: {
                    sectionHeader("الأمان")
                } footer: {
                    Text(appLockFooter)
                        .deskText(DeskType.meta)
                        .foregroundStyle(appLock.errorMessage == nil ? DeskTheme.textSecondary : DeskTheme.danger)
                }
                .listRowBackground(DeskTheme.cardBackground)

                Section {
                    Button {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    } label: {
                        SettingsRow(title: "إعدادات الإشعارات في النظام", systemImage: "bell.badge.fill", tone: .danger) {
                            Image(systemName: "arrow.up.forward.app")
                                .foregroundStyle(DeskTheme.textTertiary)
                                .accessibilityHidden(true)
                        }
                    }
                    .accessibilityHint("يفتح إعدادات النظام")
                } header: {
                    sectionHeader("الإشعارات")
                }
                .listRowBackground(DeskTheme.cardBackground)

                Section {
                    SettingsRow(title: "الإصدار", systemImage: "info.circle.fill", tone: .neutral) {
                        LTRText(text: appVersion, role: DeskType.excerpt, color: DeskTheme.textPrimary)
                    }
                    SettingsRow(title: "رقم البناء", systemImage: "hammer.fill", tone: .neutral) {
                        LTRText(text: buildNumber, role: DeskType.excerpt, color: DeskTheme.textPrimary)
                    }
                } header: {
                    sectionHeader("حول التطبيق")
                }
                .listRowBackground(DeskTheme.cardBackground)

                Section {
                    Button(role: .destructive) { confirmSignOut = true } label: {
                        HStack(spacing: DeskLayout.space8) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .accessibilityHidden(true)
                            Text("تسجيل الخروج")
                                .deskText(DeskType.button)
                        }
                        .foregroundStyle(DeskTheme.danger)
                        .frame(maxWidth: .infinity, minHeight: DeskLayout.touchTarget)
                    }
                } footer: {
                    LTRText(text: "Sabq Desk \(appVersion) (\(buildNumber))")
                        .frame(maxWidth: .infinity)
                }
                .listRowBackground(DeskTheme.cardBackground)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(DeskTheme.groupedBackground)
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

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .deskText(DeskType.metaEmphasis)
            .foregroundStyle(DeskTheme.textSecondary)
    }

    private func permission(_ title: String, systemImage: String, _ granted: Bool) -> some View {
        SettingsRow(title: title, systemImage: systemImage, tone: granted ? .teal : .neutral) {
            Image(systemName: granted ? "checkmark.circle.fill" : "minus.circle")
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

/// Account card: initials avatar, name, email and the Arabic role label.
private struct SettingsAccountHeader: View {
    let me: StaffMe
    @ScaledMetric(relativeTo: .title) private var avatarSide: CGFloat = DeskLayout.avatar

    var body: some View {
        HStack(alignment: .center, spacing: DeskLayout.space12) {
            Text(verbatim: initials)
                .deskText(DeskType.avatarInitials)
                .foregroundStyle(DeskTheme.onAction)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .frame(width: avatarSide, height: avatarSide)
                .background(DeskTheme.actionFill, in: Circle())
                .overlay(Circle().stroke(DeskTheme.brandSky.opacity(0.6), lineWidth: 2))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                Text(me.displayName)
                    .deskText(DeskType.sectionHeading)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let email = me.email {
                    LTRText(text: email, role: DeskType.meta, color: DeskTheme.textSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                StatusChip(title: me.roleDisplayLabel, tone: .info, systemImage: "person.text.rectangle")
                    .padding(.top, 2)
                    .accessibilityLabel("الدور: \(me.roleDisplayLabel)")
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .deskCard(radius: DeskRadius.large)
        .accessibilityElement(children: .combine)
    }

    /// First letter of up to two words. ZWNJ keeps Arabic letters unjoined.
    private var initials: String {
        let words = me.displayName.split(whereSeparator: { $0.isWhitespace || $0 == "@" })
        let letters = words.prefix(2).compactMap { $0.first }.map { String($0) }
        return letters.isEmpty ? "؟" : letters.joined(separator: "\u{200C}")
    }
}

/// iOS Settings-style row: icon tile, title, trailing accessory.
private struct SettingsRow<Accessory: View>: View {
    let title: String
    let systemImage: String
    let tone: DeskTone
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        HStack(spacing: DeskLayout.space12) {
            SettingsRowLabel(title: title, systemImage: systemImage, tone: tone)
            Spacer(minLength: DeskLayout.space8)
            accessory()
        }
        .accessibilityElement(children: .combine)
    }
}

private struct SettingsRowLabel: View {
    let title: String
    let systemImage: String
    let tone: DeskTone

    var body: some View {
        HStack(spacing: DeskLayout.space12) {
            DeskIconTile(systemImage: systemImage, tone: tone)
            Text(title)
                .deskText(DeskType.excerpt)
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#if DEBUG
#Preview("الإعدادات — فاتح") {
    SettingsView()
        .deskPreviewEnvironment()
}

#Preview("الإعدادات — داكن") {
    SettingsView()
        .deskPreviewEnvironment()
        .preferredColorScheme(.dark)
}
#endif
