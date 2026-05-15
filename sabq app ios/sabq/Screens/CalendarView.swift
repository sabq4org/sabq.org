import SwiftUI

// Public events calendar: world days, gulf/national commemorations, internal
// editorial dates. Source: GET /api/calendar (+/upcoming for the home card).
struct CalendarView: View {
    @Environment(\.dismiss) private var dismiss
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
            VStack(alignment: .leading, spacing: 18) {
                header

                if isLoading {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 80, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 80, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 80, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage {
                    EmptyStateView(
                        icon: "calendar.badge.exclamationmark",
                        tint: SabqTheme.coral,
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
                    ForEach(Array(grouped.enumerated()), id: \.offset) { _, group in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(group.date)
                                .font(.system(size: 12, weight: .heavy, design: .rounded))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                                .padding(.horizontal, 4)

                            VStack(spacing: 10) {
                                ForEach(group.events) { event in
                                    eventRow(event)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .task { await load() }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.gold.opacity(0.14))
                    .frame(width: 56, height: 56)
                Image(systemName: "calendar")
                    .font(.system(size: 24, weight: .light))
                    .foregroundStyle(SabqTheme.gold)
                    .symbolRenderingMode(.hierarchical)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("أحداث وأيام عالمية")
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                Text("ما يحدث في العالم خلال الأسبوع القادم")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            Spacer(minLength: 0)
        }
    }

    private func eventRow(_ event: APICalendarEvent) -> some View {
        let tint = colorFor(type: event.type)
        return HStack(alignment: .top, spacing: 14) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(tint)
                .frame(width: 3)
                .frame(maxHeight: .infinity)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(labelFor(type: event.type))
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundStyle(tint)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(tint.opacity(0.10)))
                    if let imp = event.importance, imp >= 4 {
                        HStack(spacing: 2) {
                            ForEach(0..<min(imp, 5), id: \.self) { _ in
                                Image(systemName: "star.fill")
                                    .font(.system(size: 8))
                                    .foregroundStyle(SabqTheme.gold)
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
                Text(event.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let desc = event.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 12))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
    }

    private func labelFor(type: String?) -> String {
        switch type?.uppercased() {
        case "GLOBAL": return "يوم عالمي"
        case "NATIONAL": return "يوم وطني"
        case "INTERNAL": return "حدث داخلي"
        default: return "حدث"
        }
    }

    private func colorFor(type: String?) -> Color {
        switch type?.uppercased() {
        case "GLOBAL": return SabqTheme.sky
        case "NATIONAL": return SabqTheme.primaryEnd
        case "INTERNAL": return SabqTheme.teal
        default: return SabqTheme.secondaryInk
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
