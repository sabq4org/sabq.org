import SwiftUI

/// "سجل النقاط" — paginated activity feed for the signed-in member.
/// Each row shows the action with its Arabic label, the awarded points,
/// and a relative timestamp. Pull-to-refresh + infinite scroll.
struct LoyaltyHistoryView: View {
    @State private var items: [LoyaltyHistoryEvent] = []
    @State private var page = 1
    @State private var hasMore = true
    @State private var isLoading = false
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                if items.isEmpty && isLoading {
                    ProgressView().padding(.top, 60)
                } else if items.isEmpty, let err = loadError {
                    Text(err)
                        .font(.system(size: 14))
                        .foregroundStyle(SabqTheme.coral)
                        .padding(.top, 60)
                } else if items.isEmpty {
                    emptyState
                } else {
                    ForEach(items) { event in
                        eventRow(event)
                    }
                    if hasMore {
                        ProgressView()
                            .padding(.vertical, 18)
                            .task { await loadMore() }
                    }
                }
            }
            .padding(16)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("سجل نقاطي")
        .navigationBarTitleDisplayMode(.inline)
        .task { if items.isEmpty { await load(reset: true) } }
        .refreshable { await load(reset: true) }
        .sabqRTL()
    }

    // MARK: Row

    private func eventRow(_ event: LoyaltyHistoryEvent) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(actionColor(for: event.action).opacity(0.12))
                    .frame(width: 38, height: 38)
                Text(actionIcon(for: event.action))
                    .font(.system(size: 18))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(actionLabel(for: event.action))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                if let date = event.date {
                    Text(relativeTime(date))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 2) {
                Text("+\(event.points)")
                    .font(.system(size: 15, weight: .black, design: .rounded))
                    .foregroundStyle(SabqTheme.leaf)
                Image(systemName: "sparkles")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(SabqTheme.leaf.opacity(0.7))
            }
        }
        .padding(12)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.35), lineWidth: 0.5)
        )
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 44, weight: .ultraLight))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text("لا يوجد نشاط بعد")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
            Text("ابدأ بالقراءة والتفاعل لكسب نقاطك الأولى ⭐")
                .font(.system(size: 12))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 60)
        .frame(maxWidth: .infinity)
    }

    // MARK: Networking

    @MainActor
    private func load(reset: Bool) async {
        if reset {
            page = 1
            hasMore = true
            items = []
        }
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.fetchLoyaltyHistory(page: page, limit: 20)
            items = response.items
            hasMore = response.hasMore
        } catch let apiError as APIError {
            loadError = apiError.errorDescription
        } catch {
            loadError = "تعذر تحميل السجل"
        }
    }

    @MainActor
    private func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.fetchLoyaltyHistory(page: page + 1, limit: 20)
            items.append(contentsOf: response.items)
            page += 1
            hasMore = response.hasMore
        } catch {
            // silent fail on pagination — the next scroll will retry
        }
    }

    // MARK: Action metadata

    private func actionLabel(for action: String) -> String {
        switch action {
        case "READ": return "قراءة مقال"
        case "READ_DEEP": return "قراءة عميقة"
        case "LIKE": return "إعجاب بمقال"
        case "SHARE": return "مشاركة مقال"
        case "COMMENT": return "تعليق"
        case "NOTIFICATION_OPEN": return "فتح إشعار"
        case "DAILY_LOGIN": return "دخول يومي"
        case "PROFILE_COMPLETE": return "إكمال الملف الشخصي 🎉"
        case "EMAIL_VERIFIED": return "تأكيد البريد الإلكتروني"
        default: return action
        }
    }

    private func actionIcon(for action: String) -> String {
        switch action {
        case "READ": return "📖"
        case "READ_DEEP": return "📕"
        case "LIKE": return "❤️"
        case "SHARE": return "🔄"
        case "COMMENT": return "💬"
        case "NOTIFICATION_OPEN": return "🔔"
        case "DAILY_LOGIN": return "🚪"
        case "PROFILE_COMPLETE": return "🎉"
        case "EMAIL_VERIFIED": return "✉️"
        default: return "✨"
        }
    }

    private func actionColor(for action: String) -> Color {
        switch action {
        case "DAILY_LOGIN": return Color.orange
        case "READ_DEEP", "READ": return SabqTheme.primaryEnd
        case "LIKE": return SabqTheme.coral
        case "COMMENT": return Color(red: 0.40, green: 0.73, blue: 0.22)
        case "SHARE": return Color(red: 0.40, green: 0.50, blue: 0.95)
        case "PROFILE_COMPLETE", "EMAIL_VERIFIED": return SabqTheme.leaf
        default: return SabqTheme.secondaryInk
        }
    }

    private func relativeTime(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "ar")
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }
}
