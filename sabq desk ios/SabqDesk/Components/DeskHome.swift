import SabqDeskDesign
import SabqDeskKit
import SwiftUI

// Pieces of the redesigned desk (owner-approved mockup 2026-10-28): a
// greeting header, a soft summary card, a week strip, and rows that sit on
// their own white rounded surface. Light only, SF Arabic, no dark fills.

/// «صباح الخير،» / «مساء الخير،» over the member's name and a short line,
/// with an optional trailing view (the account avatar).
struct DeskGreetingHeader<Trailing: View>: View {
    let name: String?
    let subtitle: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: DeskLayout.space12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(DeskGreeting.salutation())
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textSecondary)
                Text(DeskCount.greetingName(name) ?? "مكتب سبق")
                    .deskText(DeskHomeType.name)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                Text(subtitle)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: DeskLayout.space8)
            trailing()
        }
        .accessibilityElement(children: .contain)
    }
}

enum DeskGreeting {
    /// Morning until noon in Riyadh, evening after.
    static func salutation(now: Date = Date()) -> String {
        RiyadhTime.calendar.component(.hour, from: now) < 12 ? "صباح الخير،" : "مساء الخير،"
    }
}

enum DeskHomeType {
    /// The member's name / screen title in the header.
    static let name = DeskTextRole(size: 28, weight: .bold, style: .largeTitle, lineSpacing: 0)
    /// The big count on the summary card.
    static let heroValue = DeskTextRole(size: 34, weight: .bold, style: .largeTitle, lineSpacing: 0)
    /// Day number in a week strip.
    static let dayNumber = DeskTextRole(size: 17, weight: .bold, style: .headline, lineSpacing: 0)
}

/// The soft blue summary card: an icon tile, a label, a big value, a detail
/// line and an optional trailing note (for example the next scheduled time).
struct DeskSummaryCard: View {
    let systemImage: String
    let label: String
    let value: String
    let detail: String?
    var note: String?
    var noteValue: String?

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(DeskInk.action)
                .frame(width: 52, height: 52)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: DeskInk.action.opacity(0.14), radius: 8, y: 2)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                Text(verbatim: value)
                    .deskText(DeskHomeType.heroValue)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let detail {
                    Text(detail)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            if let note, let noteValue {
                VStack(spacing: 2) {
                    Text(note)
                        .deskText(DeskType.tag)
                        .foregroundStyle(DeskTheme.textSecondary)
                    LTRText(text: noteValue, role: DeskType.sectionHeading, color: DeskInk.link)
                }
                .padding(.horizontal, DeskLayout.space12)
                .padding(.vertical, DeskLayout.space8)
                .background(Color.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [DeskTheme.heroStart, DeskTheme.heroEnd],
                           startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous)
            .strokeBorder(Color.white, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// Seven days from today; each shows how many posts are scheduled in it.
/// Tapping a day selects it, tapping it again clears the selection.
struct DeskWeekStrip: View {
    /// Counts keyed by the start of a Riyadh day.
    let counts: [Date: Int]
    @Binding var selection: Date?
    var now: Date = Date()

    private var days: [Date] {
        let start = RiyadhTime.dayKey(now)
        return (0..<7).compactMap { RiyadhTime.calendar.date(byAdding: .day, value: $0, to: start) }
    }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(days, id: \.self) { day in
                let isSelected = selection == day
                let count = counts[day] ?? 0
                Button {
                    selection = isSelected ? nil : day
                } label: {
                    VStack(spacing: 3) {
                        Text(verbatim: RiyadhTime.dayNumber(day))
                            .deskText(DeskHomeType.dayNumber)
                            .monospacedDigit()
                        Text(RiyadhTime.shortWeekday(day))
                            .deskText(DeskType.timestamp)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        HStack(spacing: 3) {
                            ForEach(0..<min(count, 3), id: \.self) { _ in
                                Circle()
                                    .fill(isSelected ? Color.white : DeskInk.action.opacity(0.55))
                                    .frame(width: 5, height: 5)
                            }
                        }
                        .frame(height: 5)
                    }
                    .foregroundStyle(isSelected ? Color.white : DeskTheme.textPrimary)
                    .frame(maxWidth: .infinity, minHeight: 72)
                    .background(isSelected ? DeskInk.selected : DeskTheme.surface,
                                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: isSelected ? DeskInk.selected.opacity(0.3) : DeskTheme.shadow,
                            radius: isSelected ? 10 : 4, y: isSelected ? 5 : 1)
                    .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
                .accessibilityLabel("\(RiyadhTime.dayTitle(day, now: now))، \(count == 0 ? "لا منشورات مجدولة" : DeskCount.posts(count))")
            }
        }
    }
}

extension DeskCount {
    /// `منشور واحد`, `منشوران`, `3 منشورات`, `11 منشورًا`.
    static func posts(_ count: Int) -> String {
        switch count {
        case 1: return "منشور واحد"
        case 2: return "منشوران"
        case 3...10: return "\(count) منشورات"
        default: return "\(count) منشورًا"
        }
    }

    /// `مهمة واحدة`, `مهمتان`, `3 مهام`, `11 مهمة`.
    static func tasks(_ count: Int) -> String {
        switch count {
        case 1: return "مهمة واحدة"
        case 2: return "مهمتان"
        case 3...10: return "\(count) مهام"
        default: return "\(count) مهمة"
        }
    }
}

extension View {
    /// A list row on its own white rounded surface with a soft shadow.
    func deskRowCard(padding: CGFloat = 14) -> some View {
        self.padding(padding)
            .background(DeskCardBackground(radius: 18))
    }
}
