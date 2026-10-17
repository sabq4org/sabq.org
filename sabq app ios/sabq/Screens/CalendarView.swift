import SwiftUI

// Public events calendar: world days, gulf/national commemorations, internal
// editorial dates. Source: GET /api/calendar (+/upcoming for the home card).
struct CalendarView: View {
    @State private var events: [APICalendarEvent] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var grouped: [(date: String, events: [APICalendarEvent])] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let out = DateFormatter()
        out.locale = Locale(identifier: "ar")
        out.dateStyle = .full

        var byDate: [String: [APICalendarEvent]] = [:]
        for ev in events {
            let key: String = {
                if let d = formatter.date(from: ev.dateStart) ?? ISO8601DateFormatter().date(from: ev.dateStart) {
                    return out.string(from: d)
                }
                return ev.dateStart
            }()
            byDate[key, default: []].append(ev)
        }
        return byDate
            .map { ($0.key, $0.value) }
            .sorted { lhs, rhs in
                guard let l = events.first(where: { lhs.events.first?.id == $0.id })?.dateStart,
                      let r = events.first(where: { rhs.events.first?.id == $0.id })?.dateStart else {
                    return lhs.date < rhs.date
                }
                return l < r
            }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                header

                if isLoading {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(0..<3, id: \.self) { index in
                            if index > 0 { SidebarRowDivider() }
                            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                                SkeletonBox(width: 72, height: 20, radius: SabqRadius.small)
                                SkeletonBox(height: 16, radius: SabqRadius.small)
                                SkeletonBox(width: 200, height: 12, radius: SabqRadius.small)
                            }
                            .padding(.vertical, SabqLayout.rowPadding)
                        }
                    }
                    .accessibilityHidden(true)
                } else if let errorMessage {
                    EmptyStateView(
                        icon: "calendar.badge.exclamationmark",
                        tint: SabqTheme.danger,
                        title: "تعذّر تحميل التقويم",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if events.isEmpty {
                    EmptyStateView(
                        icon: "calendar",
                        tint: SabqTheme.tertiaryInk,
                        title: "لا توجد أحداث",
                        subtitle: "لا توجد فعاليات أو أيام عالمية مسجّلة للفترة القادمة."
                    )
                } else {
                    ForEach(Array(grouped.enumerated()), id: \.offset) { groupIndex, group in
                        if groupIndex > 0 { SabqSectionBand() }
                        VStack(alignment: .leading, spacing: SabqLayout.space4) {
                            Text(group.date)
                                .font(SabqType.sectionHeading.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .accessibilityAddTraits(.isHeader)

                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(Array(group.events.enumerated()), id: \.element.id) { index, event in
                                    if index > 0 { SidebarRowDivider() }
                                    eventRow(event)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("أحداث وأيام عالمية")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var header: some View {
        SabqPageIntro("ما يحدث في العالم خلال الأسبوع القادم")
    }

    private func eventRow(_ event: APICalendarEvent) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                StatusChip(title: labelFor(type: event.type), tint: SabqTheme.primary)
                if let imp = event.importance, imp >= 4 {
                    HStack(spacing: 2) {
                        ForEach(0..<min(imp, 5), id: \.self) { _ in
                            Image(systemName: "star.fill")
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.warning)
                        }
                    }
                    .accessibilityHidden(true)
                }
                Spacer(minLength: 0)
            }
            Text(event.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            if let desc = event.description, !desc.isEmpty {
                Text(desc)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func labelFor(type: String?) -> String {
        switch type?.uppercased() {
        case "GLOBAL": return "يوم عالمي"
        case "NATIONAL": return "يوم وطني"
        case "INTERNAL": return "حدث داخلي"
        default: return "حدث"
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            // 30 days ahead = useful planning window
            events = try await APIClient.shared.fetchUpcomingCalendarEvents(days: 30)
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
            events = []
        }
        isLoading = false
    }
}

struct CalendarRoute: Hashable {}
