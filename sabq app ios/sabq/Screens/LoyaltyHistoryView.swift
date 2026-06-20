import SwiftUI

/// "سجل النقاط" — paginated activity feed for the signed-in member.
///
/// The list groups events into Today / Yesterday / This week / This
/// month / Older buckets, prepends a totals strip summarising the
/// points visible on screen, and surfaces the source article's
/// headline next to READ / LIKE / SHARE / COMMENT actions so the
/// reader can pinpoint exactly which piece earned them what.
struct LoyaltyHistoryView: View {
    @State private var items: [LoyaltyHistoryEvent] = []
    @State private var page = 1
    @State private var hasMore = true
    @State private var isLoading = false
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14, pinnedViews: []) {
                if items.isEmpty && isLoading {
                    ProgressView().padding(.top, 60)
                } else if items.isEmpty, let err = loadError {
                    Text(err)
                        .font(SabqFonts.app(size: 14))
                        .foregroundStyle(SabqTheme.coral)
                        .padding(.top, 60)
                } else if items.isEmpty {
                    emptyState
                } else {
                    totalsStrip
                    ForEach(groupedBuckets, id: \.label) { bucket in
                        bucketSection(bucket)
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

    // MARK: Totals strip — total / earned today / earned this week

    private var totalsStrip: some View {
        let total = items.reduce(0) { $0 + $1.points }
        let today = items.filter { isToday($0.date) }.reduce(0) { $0 + $1.points }
        let week = items.filter { isInThisWeek($0.date) }.reduce(0) { $0 + $1.points }
        return HStack(spacing: 10) {
            totalsCell(value: total, label: "إجمالي السجل", tint: SabqTheme.primaryEnd)
            totalsCell(value: today, label: "اليوم", tint: SabqTheme.leaf)
            totalsCell(value: week, label: "هذا الأسبوع", tint: Color.orange)
        }
    }

    private func totalsCell(value: Int, label: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Text("+\(value)")
                    .font(SabqFonts.app(size: 19, weight: .black))
                    .foregroundStyle(tint)
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 10, weight: .heavy))
                    .foregroundStyle(tint.opacity(0.75))
            }
            Text(label)
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(tint.opacity(0.18), lineWidth: 0.5)
        )
    }

    // MARK: Grouping

    private struct Bucket {
        let label: String
        let events: [LoyaltyHistoryEvent]
        var subtotal: Int { events.reduce(0) { $0 + $1.points } }
    }

    private var groupedBuckets: [Bucket] {
        let calendar = Calendar(identifier: .gregorian)
        var today: [LoyaltyHistoryEvent] = []
        var yesterday: [LoyaltyHistoryEvent] = []
        var thisWeek: [LoyaltyHistoryEvent] = []
        var thisMonth: [LoyaltyHistoryEvent] = []
        var older: [LoyaltyHistoryEvent] = []
        for event in items {
            guard let date = event.date else { older.append(event); continue }
            if calendar.isDateInToday(date) {
                today.append(event)
            } else if calendar.isDateInYesterday(date) {
                yesterday.append(event)
            } else if calendar.isDate(date, equalTo: Date(), toGranularity: .weekOfYear) {
                thisWeek.append(event)
            } else if calendar.isDate(date, equalTo: Date(), toGranularity: .month) {
                thisMonth.append(event)
            } else {
                older.append(event)
            }
        }
        var out: [Bucket] = []
        if !today.isEmpty { out.append(Bucket(label: "اليوم", events: today)) }
        if !yesterday.isEmpty { out.append(Bucket(label: "أمس", events: yesterday)) }
        if !thisWeek.isEmpty { out.append(Bucket(label: "هذا الأسبوع", events: thisWeek)) }
        if !thisMonth.isEmpty { out.append(Bucket(label: "هذا الشهر", events: thisMonth)) }
        if !older.isEmpty { out.append(Bucket(label: "أقدم", events: older)) }
        return out
    }

    private func bucketSection(_ bucket: Bucket) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(bucket.label)
                    .font(SabqFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
                HStack(spacing: 3) {
                    Text("+\(bucket.subtotal)")
                        .font(SabqFonts.app(size: 12, weight: .black))
                    Image(systemName: "sparkles").font(SabqFonts.app(size: 9, weight: .heavy))
                }
                .foregroundStyle(SabqTheme.leaf)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(SabqTheme.leaf.opacity(0.10), in: Capsule())
            }
            .padding(.horizontal, 4)
            VStack(spacing: 6) {
                ForEach(bucket.events) { event in
                    eventRow(event)
                }
            }
        }
    }

    // MARK: Row

    private func eventRow(_ event: LoyaltyHistoryEvent) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(actionColor(for: event.action).opacity(0.12))
                    .frame(width: 40, height: 40)
                Text(actionIcon(for: event.action))
                    .font(SabqFonts.app(size: 19))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(actionLabel(for: event.action))
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                if let title = event.articleTitle, !title.isEmpty {
                    Text(title)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(2)
                }
                if let date = event.date {
                    Text(relativeTime(date))
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 2) {
                Text("+\(event.points)")
                    .font(SabqFonts.app(size: 15, weight: .black))
                    .foregroundStyle(SabqTheme.leaf)
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 11, weight: .heavy))
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
                .font(SabqFonts.app(size: 44, weight: .ultraLight))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text("لا يوجد نشاط بعد")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
            Text("ابدأ بالقراءة والتفاعل لكسب نقاطك الأولى ⭐")
                .font(SabqFonts.app(size: 12))
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

    // MARK: Date helpers

    private func isToday(_ date: Date?) -> Bool {
        guard let date else { return false }
        return Calendar.current.isDateInToday(date)
    }

    private func isInThisWeek(_ date: Date?) -> Bool {
        guard let date else { return false }
        return Calendar.current.isDate(date, equalTo: Date(), toGranularity: .weekOfYear)
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
