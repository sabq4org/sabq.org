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
            LazyVStack(spacing: SabqLayout.space24, pinnedViews: []) {
                if items.isEmpty && isLoading {
                    ProgressView().padding(.top, 64)
                } else if items.isEmpty, let err = loadError {
                    Text(err)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.danger)
                        .multilineTextAlignment(.center)
                        .padding(.top, 64)
                } else if items.isEmpty {
                    emptyState
                } else {
                    totalsStrip
                    ForEach(groupedBuckets, id: \.label) { bucket in
                        bucketSection(bucket)
                    }
                    if hasMore {
                        ProgressView()
                            .padding(.vertical, SabqLayout.space16)
                            .task { await loadMore() }
                    }
                }
            }
            .padding(SabqLayout.pageMargin)
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
        return HStack(spacing: SabqLayout.space12) {
            totalsCell(value: total, label: "إجمالي السجل", tint: SabqTheme.primary)
            totalsCell(value: today, label: "اليوم", tint: SabqTheme.primary)
            totalsCell(value: week, label: "هذا الأسبوع", tint: SabqTheme.primary)
        }
    }

    private func totalsCell(value: Int, label: String, tint: Color) -> some View {
        VStack(spacing: SabqLayout.space4) {
            Text("+\(value)")
                .font(SabqType.leadTitle.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .environment(\.layoutDirection, .leftToRight)
            Text(label)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
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
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SabqLayout.space8) {
                Text(bucket.label)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Text("+\(bucket.subtotal)")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.success)
                    .environment(\.layoutDirection, .leftToRight)
            }
            .padding(.bottom, SabqLayout.space4)
            ForEach(Array(bucket.events.enumerated()), id: \.element.id) { index, event in
                if index > 0 {
                    Rectangle().fill(SabqTheme.separator).frame(height: 1)
                }
                eventRow(event)
            }
        }
    }

    // MARK: Row

    private func eventRow(_ event: LoyaltyHistoryEvent) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Image(systemName: actionIcon(for: event.action))
                .font(SabqFonts.app(size: 16, weight: .regular))
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 36, height: 36)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(actionLabel(for: event.action))
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                if let title = event.articleTitle, !title.isEmpty {
                    Text(title)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(2)
                }
                if let date = event.date {
                    Text(relativeTime(date))
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }
            Spacer(minLength: 0)
            Text("+\(event.points)")
                .font(SabqType.button.font)
                .foregroundStyle(SabqTheme.success)
                .environment(\.layoutDirection, .leftToRight)
        }
        .padding(.vertical, SabqLayout.space12)
        .accessibilityElement(children: .combine)
    }

    private var emptyState: some View {
        EmptyStateView(
            icon: "clock.arrow.circlepath",
            tint: SabqTheme.textSecondary,
            title: "لا يوجد نشاط بعد",
            subtitle: "ابدأ بالقراءة والتفاعل لكسب نقاطك الأولى ⭐"
        )
        .padding(.top, SabqLayout.space40)
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
        case "READ": return "book"
        case "READ_DEEP": return "book.closed"
        case "LIKE": return "heart"
        case "SHARE": return "arrowshape.turn.up.left"
        case "COMMENT": return "bubble.left"
        case "NOTIFICATION_OPEN": return "bell"
        case "DAILY_LOGIN": return "door.left.hand.open"
        case "PROFILE_COMPLETE": return "person.crop.circle.badge.checkmark"
        case "EMAIL_VERIFIED": return "envelope"
        default: return "sparkles"
        }
    }

    private func relativeTime(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "ar")
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }
}
