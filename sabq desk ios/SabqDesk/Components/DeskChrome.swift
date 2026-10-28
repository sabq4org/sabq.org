import SabqDeskDesign
import SabqDeskKit
import SwiftUI

// Building blocks of the bot-style desk (approved mockup 2026-10-25): the
// robot, the assistant's speech bubble, sender avatars and labels, and the
// section chips. Light theme, no cards: list rows sit on the page, separated
// by space, with a rail running behind the avatars.

/// Spec colours under their original desk names; the values live in `DeskTheme`.
enum DeskInk {
    /// Strong text only; the desk has no dark fills.
    static let strong = DeskTheme.navy
    /// Selected chip, day or segment fill (white text on it).
    static let selected = DeskTheme.selectedFill
    /// Soft blue behind a selected tab, initials or a highlight.
    static let soft = DeskTheme.softBlue
    /// The assistant's bubble and the robot's halo.
    static let bubble = DeskTheme.bubbleBlue
    static let chip = DeskTheme.chipGrey
    static let hairline = DeskTheme.hairline
    /// Text-safe Sabq blue (AA on white) for links and selected tabs.
    static let link = DeskTheme.link
    /// Bright Sabq blue for filled buttons and the desk's own bubbles.
    static let action = DeskTheme.buttonBlue
}

/// Row and header type sizes from the approved mockup (SF Arabic since 2026-10-28).
enum DeskRowType {
    /// Sender name in lists: 15 bold when unread, 15 semibold otherwise.
    static let name = DeskTextRole(size: 15, weight: .bold, style: .subheadline, lineSpacing: 0)
    static let nameRead = DeskTextRole(size: 15, weight: .semibold, style: .subheadline, lineSpacing: 0)
    /// Message subject under the name: 14 semibold / 14 medium.
    static let subject = DeskTextRole(size: 14, weight: .semibold, style: .subheadline, lineSpacing: 0)
    static let subjectRead = DeskTextRole(size: 14, weight: .medium, style: .subheadline, lineSpacing: 0)
    /// Subject in the rail message list: 15 semibold unread, 15 medium read.
    static let subjectStrong = DeskTextRole(size: 15, weight: .semibold, style: .subheadline, lineSpacing: 0)
    static let subjectPlain = DeskTextRole(size: 15, weight: .medium, style: .subheadline, lineSpacing: 0)
    /// Tweet preview in the desk lists.
    static let preview = DeskTextRole(size: 14, weight: .regular, style: .subheadline, lineSpacing: 3)
    /// Tweet in the «المكتب» rows, where it is the row's main content.
    static let tweet = DeskTextRole(size: 15, weight: .regular, style: .subheadline, lineSpacing: 4)
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

/// A short guiding line on the soft blue gradient of the summary card.
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
            .background(
                LinearGradient(colors: [DeskTheme.heroStart, DeskTheme.heroEnd],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// Screen header: a short grey line over a large title, an optional grey
/// detail line under it (the week on «الرأي»), and an optional trailing view
/// (a count pill, a search or account button).
struct DeskScreenHeader<Trailing: View>: View {
    let title: String
    let subtitle: String
    var detail: String? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: DeskLayout.space12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(subtitle)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(2)
                Text(title)
                    .deskText(DeskHomeType.name)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                if let detail {
                    Text(detail)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.top, 2)
                }
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

/// The sender's photo (or agency logo) when the server sends an https URL,
/// else initials in a circle tinted by who sent it.
struct SenderAvatar: View {
    let name: String
    var kind: StaffSenderKind = .unknown
    var imageURL: String?
    var size: CGFloat = 44

    var body: some View {
        RemoteAvatar(url: DeskAvatarURL.https(imageURL), size: size) {
            Text(verbatim: DeskInitials.of(name))
                // Spec: 17 bold at list size (44–48), smaller avatars scale down.
                .font(DeskFonts.app(size: DeskType.listAvatarInitials.size * min(1, size / 44),
                                    weight: DeskType.listAvatarInitials.weight,
                                    relativeTo: DeskType.listAvatarInitials.style))
                .foregroundStyle(kind.tone.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(width: size, height: size)
                .background(kind.tone.tileFill, in: Circle())
        }
    }
}

/// A sender avatar in a list row: a hairline border and an optional state badge.
struct RailAvatar: View {
    enum Badge { case rejected, withdrawn }

    let name: String
    var kind: StaffSenderKind = .unknown
    var imageURL: String?
    var badge: Badge?

    static let size: CGFloat = 44

    var body: some View {
        SenderAvatar(name: name, kind: kind, imageURL: imageURL, size: Self.size)
            .overlay(Circle().strokeBorder(DeskTheme.separator, lineWidth: 1))
            .overlay(alignment: .bottomTrailing) {
                if let badge {
                    Image(systemName: badge == .rejected ? "xmark" : "arrow.uturn.backward")
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundStyle(Color.white)
                        .frame(width: 19, height: 19)
                        .background(badge == .rejected ? DeskTheme.danger : DeskTheme.textTertiary, in: Circle())
                        .overlay(Circle().stroke(DeskTheme.surface, lineWidth: 2))
                        .offset(x: 3, y: 3)
                        .accessibilityHidden(true)
                }
            }
    }
}

/// A short grey fact under a row, led by a small symbol.
struct QuietLine: View {
    let systemImage: String
    let text: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .imageScale(.small)
                .accessibilityHidden(true)
            Text(text)
                .lineLimit(1)
        }
        .deskText(DeskType.meta)
        .foregroundStyle(DeskTheme.textTertiary)
    }
}

/// The signed-in member's photo, else blue initials on soft blue with a white
/// ring (spec: 36 semibold at 96 pt, scaled proportionally for smaller sizes).
struct AccountAvatar: View {
    let name: String
    var imageURL: String?
    var size: CGFloat = 44

    var body: some View {
        RemoteAvatar(url: DeskAvatarURL.https(imageURL), size: size) {
            Text(verbatim: DeskInitials.of(name))
                .font(DeskFonts.app(size: DeskType.accountAvatarInitials.size * size / 96,
                                    weight: DeskType.accountAvatarInitials.weight,
                                    relativeTo: DeskType.accountAvatarInitials.style))
                .foregroundStyle(DeskInk.link)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(width: size, height: size)
                .background(DeskInk.soft, in: Circle())
        }
        .overlay(Circle().strokeBorder(Color.white, lineWidth: max(2, size / 24)))
        .shadow(color: DeskTheme.shadow, radius: 6, y: 2)
    }
}

/// A circular remote image with a fallback while loading, on failure, or
/// when there is no URL. Decorative: the row's text names the person.
struct RemoteAvatar<Fallback: View>: View {
    let url: URL?
    let size: CGFloat
    @ViewBuilder var fallback: () -> Fallback

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        fallback()
                    }
                }
            } else {
                fallback()
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
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

/// The same label as plain tinted text, for rows where a filled tag is too loud.
struct SenderKindLabel: View {
    let kind: StaffSenderKind

    var body: some View {
        Text(kind.title)
            .deskText(DeskType.tag)
            .foregroundStyle(kind.tone.ink)
            .lineLimit(1)
            .fixedSize()
    }
}

extension StaffSenderKind {
    var tone: DeskTone {
        switch self {
        case .writer: return .info
        case .agency: return .warning
        case .reporter: return .teal
        // The spec defines no colour for «حساب المؤسسة»: same grey as unknown.
        case .organization, .unknown: return .neutral
        }
    }
}

/// One tab chip: Sabq blue when selected, white otherwise, with an optional count.
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
                        .foregroundStyle(isSelected ? Color.white : DeskInk.link)
                        .background(isSelected ? Color.white.opacity(0.25) : DeskInk.soft, in: Capsule())
                }
            }
            .deskText(DeskType.metaEmphasis)
            .foregroundStyle(isSelected ? Color.white : DeskTheme.textPrimary)
            .padding(.horizontal, 16)
            .frame(minHeight: 40)
            .background(isSelected ? DeskInk.selected : DeskTheme.surface, in: Capsule())
            .shadow(color: isSelected ? DeskInk.selected.opacity(0.28) : DeskTheme.shadow,
                    radius: isSelected ? 8 : 4, y: isSelected ? 4 : 1)
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
            .padding(.vertical, 6)
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

/// Text-style filled button used on the lock and login screens.
struct DeskBigButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .deskText(DeskType.bigButton)
            .foregroundStyle(isEnabled ? Color.white : DeskTheme.disabledInk)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(isEnabled ? DeskInk.action : DeskTheme.disabledFill,
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
