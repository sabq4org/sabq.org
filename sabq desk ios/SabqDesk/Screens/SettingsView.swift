import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UIKit

/// «حسابي»: the member's avatar with the robot beside it, one row for what
/// they may do, then security, notifications (a page of its own), quick
/// replies and about, each group on a white rounded surface.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(AppLockController.self) private var appLock
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DeskLayout.space24) {
                    if let me = model.me {
                        AccountHeader(me: me)
                        SettingsGroup {
                            NavigationLink {
                                PermissionsList(titles: DeskPermissionSummary.titles(me.capabilities))
                            } label: {
                                HStack {
                                    RowLabel(title: "صلاحياتك في المكتب", systemImage: "key",
                                             subtitle: DeskPermissionSummary.line(me.capabilities))
                                    Spacer()
                                    Image(systemName: "chevron.forward")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(DeskTheme.textTertiary)
                                        .accessibilityHidden(true)
                                }
                                .settingsRow()
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    SettingsSection(title: "الأمان", footer: appLockFootnote) {
                        Toggle(isOn: appLockBinding) {
                            RowLabel(title: appLock.availability.toggleTitle,
                                     systemImage: appLock.availability.kind?.systemImage ?? "lock",
                                     subtitle: appLockNote,
                                     subtitleColor: appLock.errorMessage == nil ? DeskTheme.textSecondary : DeskTheme.danger)
                        }
                        .tint(DeskInk.action)
                        .disabled(appLock.isAuthenticating || (!appLock.availability.isAvailable && !appLock.isEnabled))
                        .settingsRow()
                        if let me = model.me {
                            GroupDivider()
                            HStack {
                                RowLabel(title: "المصادقة الثنائية", systemImage: "lock.shield")
                                Spacer()
                                Text(me.twoFactorEnabled == true ? "مفعّلة" : "غير مفعّلة")
                                    .deskText(DeskType.metaEmphasis)
                                    .foregroundStyle(me.twoFactorEnabled == true ? DeskTheme.success : DeskTheme.warning)
                            }
                            .settingsRow()
                            .accessibilityElement(children: .combine)
                        }
                    }

                    SettingsSection(title: "الإشعارات والرسائل") {
                        NavigationLink {
                            NotificationPrefsView()
                        } label: {
                            HStack {
                                RowLabel(title: "التنبيهات", systemImage: "bell.badge",
                                         subtitle: alertsSummary)
                                Spacer()
                                Image(systemName: "chevron.forward")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(DeskTheme.textTertiary)
                                    .accessibilityHidden(true)
                            }
                            .settingsRow()
                        }
                        .buttonStyle(.plain)
                        if model.capabilities.canTickets {
                            GroupDivider()
                            NavigationLink {
                                QuickRepliesEditor()
                            } label: {
                                HStack {
                                    RowLabel(title: "الردود السريعة", systemImage: "text.bubble")
                                    Spacer()
                                    Image(systemName: "chevron.forward")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(DeskTheme.textTertiary)
                                        .accessibilityHidden(true)
                                }
                                .settingsRow()
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    SettingsSection(title: "حول التطبيق") {
                        HStack {
                            RowLabel(title: "الإصدار", systemImage: "info.circle")
                            Spacer()
                            LTRText(text: "\(appVersion) (\(buildNumber))", role: DeskType.excerpt, color: DeskTheme.textSecondary)
                        }
                        .settingsRow()
                        .accessibilityElement(children: .combine)
                    }

                    SettingsGroup {
                        Button(role: .destructive) { confirmSignOut = true } label: {
                            Text("تسجيل الخروج")
                                .deskText(DeskType.button)
                                .foregroundStyle(DeskTheme.danger)
                                .frame(maxWidth: .infinity, minHeight: 56)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, DeskLayout.pageMargin + 4)
                .padding(.vertical, DeskLayout.space16)
            }
            .scrollContentBackground(.hidden)
            .background(DeskTheme.background)
            .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { await model.reloadIdentity() }
            .onAppear { appLock.refreshAvailability() }
            .task { await model.loadAlertPrefsIfNeeded() }
            .confirmationDialog("تسجيل الخروج من المكتب؟", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("تسجيل الخروج", role: .destructive) { Task { await model.signOut() } }
                Button("إلغاء", role: .cancel) {}
            } message: {
                Text("لن تصلك إشعارات المكتب على هذا الجهاز حتى تسجّل الدخول مجددًا.")
            }
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

    /// Under «التنبيهات»: the quiet-hours preset, or that everything is on.
    private var alertsSummary: String {
        switch model.alertPrefs?.quietHours ?? .off {
        case .night: return "هادئة ليلًا \u{2066}23:00 – 07:00\u{2069}"
        case .offhours: return "هادئة خارج الدوام \u{2066}17:00 – 08:00\u{2069}"
        case .off: return "الساعات الهادئة وما يصلك على الجوال"
        }
    }

    /// Under the lock's own row: an error, or why it cannot be turned on.
    private var appLockNote: String? {
        if let error = appLock.errorMessage { return error }
        if let reason = appLock.availability.unavailableReason, !appLock.isEnabled { return reason }
        return nil
    }

    /// What the lock does, under the group, only while it can be used.
    private var appLockFootnote: String? {
        appLockNote == nil
            ? "عند التفعيل يُطلب التحقق عند فتح التطبيق، وعند العودة إليه بعد أكثر من دقيقة. هذا قفل محلي إضافي ولا يغني عن تسجيل الدخول والمصادقة الثنائية."
            : nil
    }
}

/// A titled outlined group with an optional note under it.
private struct SettingsSection<Content: View>: View {
    let title: String
    var footer: String?
    var footerColor: Color = DeskTheme.textSecondary
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            DeskSectionHeader(title: title)
                .padding(.horizontal, 4)
            SettingsGroup(content: content)
            if let footer {
                Text(footer)
                    .deskText(DeskType.meta)
                    .foregroundStyle(footerColor)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
            }
        }
    }
}

private struct SettingsGroup<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) { content() }
            .modifier(DeskOutlinedGroup())
    }
}

private struct GroupDivider: View {
    var body: some View {
        Rectangle().fill(DeskTheme.hairline).frame(height: 1)
    }
}

private extension View {
    func settingsRow() -> some View {
        padding(.horizontal, DeskLayout.space16)
            .padding(.vertical, 6)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
    }
}

/// The member's desk permissions: every title, or a short line for the row.
enum DeskPermissionSummary {
    static func titles(_ caps: StaffCapabilities) -> [String] {
        var titles: [String] = []
        if caps.canTickets { titles.append("رسائل المساهمين") }
        if caps.canSocial.view { titles.append("مقترحات X") }
        if caps.canSocial.schedule { titles.append("الجدولة") }
        if caps.canSocial.publish { titles.append("النشر الفوري") }
        if caps.canSocial.reject { titles.append("الرفض") }
        if caps.canSystemHealth { titles.append("حالة النظام") }
        if caps.canAdminAlerts { titles.append("تنبيهات الإدارة") }
        return titles
    }

    /// «كل الصلاحيات · 7», «رسائل المساهمين، مقترحات X +2», or none.
    static func line(_ caps: StaffCapabilities) -> String {
        let titles = titles(caps)
        switch titles.count {
        case 0: return "لا صلاحيات في المكتب"
        case 7: return "كل الصلاحيات · \u{2066}7\u{2069}"
        case 1, 2: return titles.joined(separator: "، ")
        default: return titles.prefix(2).joined(separator: "، ") + " \u{2066}+\(titles.count - 2)\u{2069}"
        }
    }
}

private struct PermissionsList: View {
    let titles: [String]

    var body: some View {
        List {
            if titles.isEmpty {
                Text("لا صلاحيات في المكتب. تواصل مع مدير النظام.")
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
            ForEach(titles, id: \.self) { title in
                Label(title, systemImage: "checkmark")
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textPrimary)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(DeskTheme.background)
        .navigationTitle("صلاحياتك في المكتب")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
    }
}

/// Avatar (photo when the account has one) with the robot as a badge, then
/// name, email and role.
private struct AccountHeader: View {
    let me: StaffMe

    var body: some View {
        VStack(spacing: DeskLayout.space12) {
            ZStack(alignment: .bottomTrailing) {
                AccountAvatar(name: me.displayName, imageURL: me.profileImageUrl, size: 88)
                    .overlay(Circle().strokeBorder(DeskTheme.separator, lineWidth: 1))
                DeskMascot(size: 36)
                    .background(DeskTheme.background, in: Circle())
                    .overlay(Circle().stroke(DeskTheme.background, lineWidth: 3))
                    .offset(x: 6, y: 4)
            }
            VStack(spacing: 2) {
                Text(me.displayName)
                    .deskText(DeskType.sectionHeading)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .multilineTextAlignment(.center)
                if let email = me.email {
                    LTRText(text: email, role: DeskType.meta, color: DeskTheme.textSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Text(me.roleDisplayLabel)
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskInk.link)
                    .padding(.top, 2)
            }
            .accessibilityElement(children: .combine)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Icon, title and an optional note under the title, in Sabq blue line icons.
private struct RowLabel: View {
    let title: String
    let systemImage: String
    var subtitle: String?
    var subtitleColor: Color = DeskTheme.textSecondary

    var body: some View {
        HStack(spacing: DeskLayout.space12) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(DeskInk.link)
                .frame(width: 36, height: 36)
                .background(DeskInk.soft, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .deskText(DeskType.meta)
                        .foregroundStyle(subtitleColor)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(minHeight: DeskLayout.touchTarget)
    }
}

/// Edits the quick replies shown above the message composer (this device only).
private struct QuickRepliesEditor: View {
    private let store = QuickReplyStore()
    @State private var replies: [String] = []
    @State private var newReply = ""

    var body: some View {
        List {
            Section {
                ForEach(replies.indices, id: \.self) { index in
                    Text(replies[index])
                        .deskText(DeskType.excerpt)
                        .foregroundStyle(DeskTheme.textPrimary)
                }
                .onDelete { offsets in
                    replies.remove(atOffsets: offsets)
                    save()
                }
                .onMove { from, to in
                    replies.move(fromOffsets: from, toOffset: to)
                    save()
                }
            } footer: {
                Text("تظهر فوق مربع الرد في الرسائل. حتى 8 ردود، تُحفظ على هذا الجهاز.")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
            if replies.count < 8 {
                Section {
                    HStack {
                        TextField("رد جديد", text: $newReply)
                            .deskText(DeskType.excerpt)
                            .submitLabel(.done)
                            .onSubmit(add)
                        Button("إضافة", action: add)
                            .deskText(DeskType.metaEmphasis)
                            .foregroundStyle(DeskInk.link)
                            .disabled(newReply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            Section {
                Button("استعادة الردود الافتراضية") {
                    replies = QuickReplyStore.defaults
                    save()
                }
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskInk.link)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(DeskTheme.background)
        .navigationTitle("الردود السريعة")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar { EditButton() }
        .onAppear { replies = store.replies }
    }

    private func add() {
        let text = newReply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, replies.count < 8 else { return }
        replies.append(String(text.prefix(200)))
        newReply = ""
        save()
    }

    private func save() {
        store.replies = replies
        replies = store.replies
    }
}

#if DEBUG
#Preview("حسابي") {
    SettingsView()
        .deskPreviewEnvironment()
}
#endif
