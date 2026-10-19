import SwiftUI

/// «المستخدمون المحظورون» — من حظرهم القارئ من قائمة التعليقات (بند أبل 1.2).
/// القائمة محفوظة في الحساب (`/members/blocks`)، و«إلغاء الحظر» يعيد ظهور تعليقاتهم.
struct BlockedUsersView: View {
    private let safety = CommentSafetyStore.shared
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                ForEach(safety.blockedUsers) { user in
                    row(user)
                        .listRowBackground(SabqTheme.background)
                }
            } footer: {
                if let errorMessage {
                    Text(errorMessage)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.danger)
                        .padding(.horizontal, SabqLayout.space8)
                } else if !safety.blockedUsers.isEmpty {
                    Text("لا تظهر لك تعليقات من حظرتهم. لا يُبلَّغون بالحظر.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .padding(.horizontal, SabqLayout.space8)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(SabqTheme.background)
        .overlay {
            if isLoading && safety.blockedUsers.isEmpty {
                ProgressView()
            } else if safety.blockedUsers.isEmpty {
                EmptyStateView(
                    icon: "hand.raised",
                    tint: SabqTheme.secondaryInk,
                    title: "لم تحظر أحدًا",
                    subtitle: "من زر «⋯» بجوار أي تعليق يمكنك حظر صاحبه أو الإبلاغ عن التعليق."
                )
            }
        }
        .sabqRTL()
        .navigationTitle("المستخدمون المحظورون")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await safety.reloadBlocked()
            isLoading = false
        }
        .refreshable { await safety.reloadBlocked() }
    }

    private func row(_ user: APIBlockedUser) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Circle()
                .fill(SabqTheme.surfaceMuted)
                .frame(width: 36, height: 36)
                .overlay {
                    Text(String((user.name ?? "م").prefix(1)))
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                .accessibilityHidden(true)
            Text(user.name ?? "مستخدم")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
            Spacer(minLength: SabqLayout.space8)
            Button {
                unblock(user)
            } label: {
                Text("إلغاء الحظر")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.primary)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, SabqLayout.space4)
    }

    private func unblock(_ user: APIBlockedUser) {
        Task {
            do {
                try await safety.unblock(userId: user.id)
                errorMessage = nil
                SabqHaptics.success()
            } catch {
                errorMessage = "تعذر إلغاء الحظر، حاول مرة أخرى"
                SabqHaptics.error()
            }
        }
    }
}
