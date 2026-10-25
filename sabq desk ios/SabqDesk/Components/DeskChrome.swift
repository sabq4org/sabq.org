import SabqDeskDesign
import SabqDeskKit
import SwiftUI

// Building blocks of the bot-style desk (approved mockup 2026-10-25): the
// robot, the assistant's speech bubble, sender avatars and labels, and the
// section chips. Light theme, no cards: rows sit on the page with hairlines.

/// Mockup ink for the selected chip and strong text.
enum DeskInk {
    static let strong = Color(red: 15 / 255, green: 34 / 255, blue: 51 / 255)
    /// The assistant's bubble and the robot's halo.
    static let bubble = Color(red: 234 / 255, green: 247 / 255, blue: 255 / 255)
    static let chip = Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255)
    static let hairline = Color(red: 238 / 255, green: 242 / 255, blue: 246 / 255)
    /// Text-safe Sabq blue (AA on white) for links and selected tabs.
    static let link = Color(red: 11 / 255, green: 111 / 255, blue: 168 / 255)
    /// Bright Sabq blue for filled buttons and the desk's own bubbles.
    static let action = Color(red: 30 / 255, green: 155 / 255, blue: 230 / 255)
}

/// Row and header type sizes from the approved mockup (IBM Plex Sans Arabic).
enum DeskRowType {
    /// Sender name in lists: 15 bold when unread, 15 semibold otherwise.
    static let name = DeskTextRole(size: 15, weight: .bold, style: .subheadline, lineSpacing: 0)
    static let nameRead = DeskTextRole(size: 15, weight: .semibold, style: .subheadline, lineSpacing: 0)
    /// Message subject under the name: 14 semibold / 14 medium.
    static let subject = DeskTextRole(size: 14, weight: .semibold, style: .subheadline, lineSpacing: 0)
    static let subjectRead = DeskTextRole(size: 14, weight: .medium, style: .subheadline, lineSpacing: 0)
    /// Tweet preview in the desk lists.
    static let preview = DeskTextRole(size: 14, weight: .regular, style: .subheadline, lineSpacing: 3)
    /// Name at the top of a conversation.
    static let headerName = DeskTextRole(size: 16, weight: .bold, style: .headline, lineSpacing: 0)
}

/// The desk robot (asset `DeskMascot`), decorative.
struct DeskMascot: View {
    var size: CGFloat = 52

    var body: some View {
        Image("DeskMascot")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// The assistant speaking: a soft blue bubble, its tail on the robot's side.
struct AssistantBubble: View {
    let text: String

    var body: some View {
        Text(text)
            .deskText(DeskType.excerpt)
            .foregroundStyle(DeskTheme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DeskInk.bubble,
                        in: UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 6,
                                                   bottomTrailingRadius: 18, topTrailingRadius: 18,
                                                   style: .continuous))
    }
}

/// Screen header: robot, title and a line under it, and an optional trailing view.
struct DeskScreenHeader<Trailing: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: DeskLayout.space12) {
            DeskMascot(size: 52)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .deskText(DeskType.pageTitle)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(subtitle)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
            Spacer(minLength: DeskLayout.space8)
            trailing()
        }
    }
}

extension DeskScreenHeader where Trailing == EmptyView {
    init(title: String, subtitle: String) {
        self.init(title: title, subtitle: subtitle) { EmptyView() }
    }
}

/// Initials in a circle tinted by who sent it.
struct SenderAvatar: View {
    let name: String
    var kind: StaffSenderKind = .unknown
    var size: CGFloat = 44

    var body: some View {
        Text(verbatim: DeskInitials.of(name))
            .font(DeskFonts.app(size: size * 0.36, weight: .bold))
            .foregroundStyle(kind.tone.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .frame(width: size, height: size)
            .background(kind.tone.tileFill, in: Circle())
            .accessibilityHidden(true)
    }
}

/// «كاتب رأي» / «وكالة» / «مراسل» label next to a name.
struct SenderKindTag: View {
    let kind: StaffSenderKind

    var body: some View {
        Text(kind.title)
            .deskText(DeskType.tag)
            .foregroundStyle(kind.tone.ink)
            .padding(.horizontal, DeskLayout.space8)
            .padding(.vertical, 2)
            .background(kind.tone.fill, in: RoundedRectangle(cornerRadius: DeskRadius.small, style: .continuous))
            .fixedSize()
    }
}

extension StaffSenderKind {
    var tone: DeskTone {
        switch self {
        case .writer: return .info
        case .agency: return .warning
        case .reporter: return .teal
        case .unknown: return .neutral
        }
    }
}

/// One tab chip: dark when selected, quiet grey otherwise, with an optional count.
struct SectionChip: View {
    let title: String
    var count: Int = 0
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(title)
                if count > 0 {
                    Text(verbatim: "\(count)")
                        .monospacedDigit()
                        .padding(.horizontal, 7)
                        .background(isSelected ? DeskInk.link : DeskTheme.surfaceStrong, in: Capsule())
                }
            }
            .deskText(isSelected ? DeskType.metaEmphasis : DeskType.meta)
            .foregroundStyle(isSelected ? Color.white : DeskTheme.textPrimary)
            .padding(.horizontal, 14)
            .frame(minHeight: 38)
            .background(isSelected ? DeskInk.strong : DeskInk.chip, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityLabel(count > 0 ? "\(title)، \(count)" : title)
    }
}

/// A horizontal row of `SectionChip`s.
struct SectionChipBar<Item: Hashable & Identifiable>: View {
    let sections: [Item]
    @Binding var selection: Item
    let title: (Item) -> String
    var count: (Item) -> Int = { _ in 0 }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: DeskLayout.space8) {
                ForEach(sections) { section in
                    SectionChip(title: title(section), count: count(section), isSelected: section == selection) {
                        selection = section
                    }
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
        }
    }
}

/// Empty list state: the robot and two lines, no card.
struct DeskEmptyState: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: DeskLayout.space8) {
            DeskMascot(size: 88)
                .opacity(0.9)
            Text(title)
                .deskText(DeskType.rowTitle)
                .foregroundStyle(DeskTheme.textPrimary)
            Text(message)
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DeskLayout.space32)
        .padding(.horizontal, DeskLayout.space24)
        .accessibilityElement(children: .combine)
    }
}

/// Initials avatar of the signed-in member; opens the account tab.
struct MemberAvatar: View {
    let name: String
    var size: CGFloat = 44

    var body: some View {
        Text(verbatim: DeskInitials.of(name))
            .font(DeskFonts.app(size: size * 0.38, weight: .semibold))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .frame(width: size, height: size)
            .background(DeskInk.link, in: Circle())
    }
}

/// Text-style filled button used on the lock and login screens.
struct DeskBigButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(DeskFonts.app(size: 18, weight: .semibold, relativeTo: .headline))
            .foregroundStyle(isEnabled ? Color.white : DeskTheme.disabledInk)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(isEnabled ? DeskInk.action : DeskTheme.disabledFill,
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
