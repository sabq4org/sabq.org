import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UIKit

/// «حسابي»: the member's avatar with the robot beside it, what they may do as
/// plain tags, then security, notifications, quick replies and about. Rows sit
/// on the page with hairlines, no cards.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(AppLockController.self) private var appLock
    @Environment(\.openURL) private var openURL
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if let me = model.me {
                    AccountHeader(me: me)
                        .listRowInsets(EdgeInsets(top: DeskLayout.space16, leading: DeskLayout.pageMargin + 4,
                                                  bottom: DeskLayout.space16, trailing: DeskLayout.pageMargin + 4))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                Section {
                    Toggle(isOn: appLockBinding) {
                        RowLabel(title: appLock.availability.toggleTitle,
                                 systemImage: appLock.availability.kind?.systemImage ?? "lock")
                    }
                    .tint(DeskInk.action)
                    .disabled(appLock.isAuthenticating || (!appLock.availability.isAvailable && !appLock.isEnabled))
                    if let me = model.me {
                        HStack {
                            RowLabel(title: "المصادقة الثنائية", systemImage: "lock.shield")
                            Spacer()
                            Text(me.twoFactorEnabled == true ? "مفعّلة" : "غير مفعّلة")
                                .deskText(DeskType.metaEmphasis)
                                .foregroundStyle(me.twoFactorEnabled == true ? DeskTheme.success : DeskTheme.warning)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } header: {
                    sectionHeader("الأمان")
                } footer: {
                    Text(appLockFooter)
                        .deskText(DeskType.meta)
                        .foregroundStyle(appLock.errorMessage == nil ? DeskTheme.textSecondary : DeskTheme.danger)
                }

                Section {
                    Button {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    } label: {
                        HStack {
                            RowLabel(title: "إشعارات المكتب", systemImage: "bell.badge")
                            Spacer()
                            Image(systemName: "arrow.up.forward.app")
                                .foregroundStyle(DeskTheme.textTertiary)
                                .accessibilityHidden(true)
                        }
                    }
                    .accessibilityHint("يفتح إعدادات النظام")
                    if model.capabilities.canTickets {
                        NavigationLink {
                            QuickRepliesEditor()
                        } label: {
                            RowLabel(title: "الردود السريعة", systemImage: "text.bubble")
                        }
                    }
                } header: {
                    sectionHeader("الإشعارات والرسائل")
                }

                Section {
                    HStack {
                        RowLabel(title: "الإصدار", systemImage: "info.circle")
                        Spacer()
                        LTRText(text: "\(appVersion) (\(buildNumber))", role: DeskType.excerpt, color: DeskTheme.textSecondary)
                    }
                    .accessibilityElement(children: .combine)
                } header: {
                    sectionHeader("حول التطبيق")
                }

                Section {
                    Button(role: .destructive) { confirmSignOut = true } label: {
                        Text("تسجيل الخروج")
                            .deskText(DeskType.button)
                            .foregroundStyle(DeskTheme.danger)
                            .frame(maxWidth: .infinity, minHeight: DeskLayout.touchTarget)
                    }
                } footer: {
                    LTRText(text: "Sabq Desk \(appVersion) (\(buildNumber))")
                        .frame(maxWidth: .infinity)
                }
            }
            .listStyle(.plain)
            .listRowSeparatorTint(DeskInk.hairline)
            .scrollContentBackground(.hidden)
            .background(DeskTheme.background)
            .contentMargins(.bottom, DeskLayout.space24, for: .scrollContent)
            .deskText(DeskType.excerpt)
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { await model.reloadIdentity() }
            .onAppear { appLock.refreshAvailability() }
            .confirmationDialog("تسجيل الخروج من المكتب؟", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("تسجيل الخروج", role: .destructive) { Task { await model.signOut() } }
                Button("إلغاء", role: .cancel) {}
            } message: {
                Text("لن تصلك إشعارات المكتب على هذا الجهاز حتى تسجّل الدخول مجددًا.")
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .deskText(DeskType.metaEmphasis)
            .foregroundStyle(DeskTheme.textSecondary)
            .textCase(nil)
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
        return "عند التفعيل يُطلب التحقق عند فتح التطبيق، وعند العودة إليه بعد أكثر من دقيقة. هذا قفل محلي إضافي ولا يغني عن تسجيل الدخول والمصادقة الثنائية."
    }
}

/// Big avatar (photo when the account has one) with the robot as a badge,
/// name, email, role, and the member's desk permissions as tags.
private struct AccountHeader: View {
    let me: StaffMe

    var body: some View {
        VStack(spacing: DeskLayout.space12) {
            ZStack(alignment: .bottomTrailing) {
                avatar
                DeskMascot(size: 40)
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
            FlowTags(tags: permissionTags)
                .padding(.top, DeskLayout.space4)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("صلاحياتك: " + permissionTags.joined(separator: "، "))
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var avatar: some View {
        if let raw = me.profileImageUrl, let url = URL(string: raw), url.scheme == "https" {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    MemberAvatar(name: me.displayName, size: 96)
                }
            }
            .frame(width: 96, height: 96)
            .clipShape(Circle())
            .accessibilityHidden(true)
        } else {
            MemberAvatar(name: me.displayName, size: 96)
                .accessibilityHidden(true)
        }
    }

    private var permissionTags: [String] {
        let caps = me.capabilities
        var tags: [String] = []
        if caps.canTickets { tags.append("رسائل المساهمين") }
        if caps.canSocial.view { tags.append("مقترحات X") }
        if caps.canSocial.schedule { tags.append("الجدولة") }
        if caps.canSocial.publish { tags.append("النشر الفوري") }
        if caps.canSocial.reject { tags.append("الرفض") }
        return tags.isEmpty ? ["لا صلاحيات في المكتب"] : tags
    }
}

/// Wrapping row of small grey tags.
private struct FlowTags: View {
    let tags: [String]

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .deskText(DeskType.tag)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(DeskInk.chip, in: Capsule())
            }
        }
    }
}

/// Minimal centered wrapping layout for the tags.
private struct FlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(for: subviews, width: proposal.width ?? .infinity)
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(for: subviews, width: bounds.width) {
            var x = bounds.midX - row.width / 2
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func rows(for subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let extra = rows[rows.count - 1].indices.isEmpty ? size.width : size.width + spacing
            if rows[rows.count - 1].width + extra > width, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            let isFirst = rows[rows.count - 1].indices.isEmpty
            rows[rows.count - 1].indices.append(index)
            rows[rows.count - 1].width += isFirst ? size.width : size.width + spacing
            rows[rows.count - 1].height = max(rows[rows.count - 1].height, size.height)
        }
        return rows
    }
}

/// Icon and title for a settings row, in Sabq blue line icons.
private struct RowLabel: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack(spacing: DeskLayout.space12) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(DeskInk.link)
                .frame(width: 26)
                .accessibilityHidden(true)
            Text(title)
                .deskText(DeskType.excerpt)
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
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
