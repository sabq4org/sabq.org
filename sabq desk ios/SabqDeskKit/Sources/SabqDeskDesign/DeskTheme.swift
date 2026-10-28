#if canImport(UIKit)
import SwiftUI
import UIKit

// Visual tokens copied from the reader app's `SabqDesignSystem.swift` so the
// desk looks like Sabq without linking the reader target. Keep the values in
// step with that file when the brand palette changes.

public enum DeskTheme {
    public static func adaptive(_ light: UInt32, _ dark: UInt32,
                                highContrastLight: UInt32? = nil, highContrastDark: UInt32? = nil) -> Color {
        Color(UIColor { traits in
            let isDark = traits.userInterfaceStyle == .dark
            let high = traits.accessibilityContrast == .high
            let hex = isDark ? (high ? highContrastDark ?? dark : dark)
                : (high ? highContrastLight ?? light : light)
            return UIColor(red: CGFloat((hex >> 16) & 255) / 255,
                           green: CGFloat((hex >> 8) & 255) / 255,
                           blue: CGFloat(hex & 255) / 255, alpha: 1)
        })
    }

    /// سماوي سبق — للشعار والزخرفة فقط؛ لا يصلح لنص على الأبيض.
    public static let brandSky = Color(red: 76 / 255.0, green: 188 / 255.0, blue: 253 / 255.0)
    public static let primary = adaptive(0x096EBD, 0x5CC4FF)
    public static let actionFill = adaptive(0x096EBD, 0x1A6FA8)
    public static let onAction = Color.white

    public static let textPrimary = adaptive(0x1B2B3A, 0xF0F4F8)
    public static let textSecondary = adaptive(0x55667A, 0xA6B5C4, highContrastLight: 0x1B2B3A, highContrastDark: 0xF0F4F8)
    public static let textTertiary = adaptive(0x617183, 0x8E9EAE, highContrastLight: 0x1B2B3A, highContrastDark: 0xF0F4F8)

    /// #F4F7FB — the soft grey-blue page (design 2026-10-28, SF Arabic).
    public static let background = adaptive(0xF4F7FB, 0x0B121A)
    public static let surface = adaptive(0xFFFFFF, 0x141D27)
    public static let surfaceMuted = adaptive(0xEFF6FC, 0x152230)
    public static let surfaceStrong = adaptive(0xDFECF7, 0x1F3145)
    public static let separator = adaptive(0xE2E9F0, 0x24313F)
    public static let outline = adaptive(0xCFDCE8, 0x334354)

    public static let success = adaptive(0x13734E, 0x73D9A9)
    public static let warning = adaptive(0x946000, 0xF2C76D)
    public static let danger = adaptive(0xBF3038, 0xFF9297)
    public static let disabledFill = adaptive(0xE6EAEE, 0x2A3644)
    public static let disabledInk = adaptive(0x55626F, 0xA3B1BF)

    // Copied verbatim from `SabqDesignSystem.swift` (skyTint, skyOutline, teal, shadow).

    /// خلفية البطاقات المميزة بالهوية السماوية الهادئة.
    public static let skyTint = adaptive(0xF3F8FD, 0x13202E)
    /// إطار سماوي ناعم للبطاقات.
    public static let skyOutline = adaptive(0xDCEAF7, 0x22364A)
    public static let teal = adaptive(0x08785F, 0x70DCC0)
    public static let shadow = Color(red: 27 / 255.0, green: 43 / 255.0, blue: 58 / 255.0).opacity(0.06)

    // «الرأي» (concept C, 2026-10-28): the warm card of writers without a fixed slot.

    /// #FFFCF4 — background of a «بلا موعد ثابت» card.
    public static let amberTint = adaptive(0xFFFCF4, 0x221C10)
    /// #E8C887 — its outline.
    public static let amberOutline = adaptive(0xE8C887, 0x5C4A22)
    /// #FBFCFE — an empty reserved slot («لم تصل بعد»), drawn with a dashed outline.
    public static let slotWaiting = adaptive(0xFBFCFE, 0x111A24)

    // Semantic roles for the grouped desk screens, built from the palette above.

    /// Page behind cards and grouped lists: muted sky in light, the page colour in dark.
    public static let groupedBackground = adaptive(0xF4F7FB, 0x0B121A)
    public static let cardBackground = surface
    public static let cardOutline = skyOutline

    // Fixed spec colours of the bot-style desk (typography spec 2026-10-25,
    // light theme only). `DeskInk` in the app forwards to these.

    /// #0B6FA8 — links, selected tab, «SABQ DESK», the desk's chat bubble.
    public static let link = rgb(0x0B6FA8)
    /// #1E9BE6 — big buttons, send, the «new» dot.
    public static let buttonBlue = rgb(0x1E9BE6)
    /// #1B2B3A — strong text. Never a fill: the desk has no dark surfaces (owner, 2026-10-28).
    public static let navy = rgb(0x1B2B3A)
    /// Selected chip, day or segment: solid Sabq blue with white text.
    public static let selectedFill = rgb(0x1E9BE6)
    /// #E6F4FD — soft blue behind selected tabs, the account initials and highlights.
    public static let softBlue = rgb(0xE6F4FD)
    /// Summary card gradient, soft blue to soft lavender.
    public static let heroStart = rgb(0xE2F2FD)
    public static let heroEnd = rgb(0xEEF1FE)
    /// #EBF0F6 — unselected chips, search field, the writer's bubble, secondary buttons.
    public static let chipGrey = rgb(0xEBF0F6)
    /// #EAF7FF — the assistant's bubble and quick replies.
    public static let bubbleBlue = rgb(0xEAF7FF)
    /// #EEF2F6 — hairlines between rows.
    public static let hairline = rgb(0xEEF2F6)

    private static func rgb(_ hex: UInt32) -> Color {
        Color(red: Double((hex >> 16) & 255) / 255,
              green: Double((hex >> 8) & 255) / 255,
              blue: Double(hex & 255) / 255)
    }
}

/// Semantic colour pairs for chips, badges and icon tiles. Text always uses
/// the palette ink on a low-opacity fill of the same ink, which keeps AA
/// contrast in both modes.
public enum DeskTone: Sendable, Hashable {
    case neutral, info, success, warning, danger, teal

    public var ink: Color {
        switch self {
        case .neutral: return DeskTheme.textSecondary
        case .info: return DeskTheme.primary
        case .success: return DeskTheme.success
        case .warning: return DeskTheme.warning
        case .danger: return DeskTheme.danger
        case .teal: return DeskTheme.teal
        }
    }

    /// Chip / badge background behind `ink` text.
    public var fill: Color {
        switch self {
        case .neutral: return DeskTheme.surfaceMuted
        default: return ink.opacity(0.10)
        }
    }

    /// Rounded-square background behind a decorative SF Symbol drawn in `ink`.
    public var tileFill: Color {
        switch self {
        case .neutral: return DeskTheme.surfaceStrong
        default: return ink.opacity(0.14)
        }
    }
}

public enum DeskRadius {
    public static let small: CGFloat = 8
    public static let medium: CGFloat = 16
    /// Desk-only: hero cards (account header, inbox summary).
    public static let large: CGFloat = 22
}

/// Soft card elevation, using the reader app's `shadow` colour.
public struct DeskShadowStyle: Sendable {
    public let color: Color
    public let radius: CGFloat
    public let y: CGFloat
}

public enum DeskShadow {
    public static let card = DeskShadowStyle(color: DeskTheme.shadow, radius: 10, y: 3)
}

public enum DeskLayout {
    public static let space4: CGFloat = 4
    public static let space8: CGFloat = 8
    public static let space12: CGFloat = 12
    public static let space16: CGFloat = 16
    public static let space24: CGFloat = 24
    public static let space32: CGFloat = 32
    public static let pageMargin: CGFloat = 16
    public static let controlHeight: CGFloat = 48
    public static let touchTarget: CGFloat = 44
    /// Bottom clearance so scrollable list and detail content clears the floating tab bar.
    public static let tabBarClearance: CGFloat = 88
    /// Inner padding of a card (reader app `cardInset`).
    public static let cardInset: CGFloat = 16
    /// Vertical gap between two stacked cards in a list.
    public static let cardGap: CGFloat = 12
    /// Base sizes for `@ScaledMetric` in views.
    public static let iconTile: CGFloat = 30
    public static let avatar: CGFloat = 56
}

/// One step of the reader app's type scale.
public struct DeskTextRole: Sendable {
    public let size: CGFloat
    public let weight: Weight
    public let style: Font.TextStyle
    public let lineSpacing: CGFloat

    public enum Weight: Sendable { case regular, medium, semibold, bold }

    public init(size: CGFloat, weight: Weight, style: Font.TextStyle, lineSpacing: CGFloat) {
        self.size = size
        self.weight = weight
        self.style = style
        self.lineSpacing = lineSpacing
    }

    public var font: Font { DeskFonts.app(size: size, weight: weight, relativeTo: style) }
}

public enum DeskType {
    public static let pageTitle = DeskTextRole(size: 23, weight: .bold, style: .title, lineSpacing: 3)
    public static let sectionHeading = DeskTextRole(size: 20, weight: .bold, style: .title3, lineSpacing: 0)
    public static let rowTitle = DeskTextRole(size: 16, weight: .medium, style: .headline, lineSpacing: 2)
    public static let body = DeskTextRole(size: 17, weight: .regular, style: .body, lineSpacing: 5)
    public static let excerpt = DeskTextRole(size: 15, weight: .regular, style: .subheadline, lineSpacing: 1)
    public static let meta = DeskTextRole(size: 13, weight: .regular, style: .footnote, lineSpacing: 0)
    public static let metaEmphasis = DeskTextRole(size: 13, weight: .semibold, style: .footnote, lineSpacing: 0)
    public static let tag = DeskTextRole(size: 12, weight: .semibold, style: .caption, lineSpacing: 0)
    public static let timestamp = DeskTextRole(size: 11, weight: .regular, style: .caption2, lineSpacing: 0)
    public static let button = DeskTextRole(size: 16, weight: .semibold, style: .callout, lineSpacing: 0)
    /// Large count in a summary tile.
    public static let statValue = DeskTextRole(size: 28, weight: .bold, style: .title, lineSpacing: 0)
    /// Avatar initials.
    public static let avatarInitials = DeskTextRole(size: 20, weight: .bold, style: .title3, lineSpacing: 0)
    /// Sender avatar initials in lists (spec: 17 bold, colour per sender kind).
    public static let listAvatarInitials = DeskTextRole(size: 17, weight: .bold, style: .body, lineSpacing: 0)
    /// Account avatar initials at 96 pt (spec: 36 semibold, white on #0B6FA8).
    public static let accountAvatarInitials = DeskTextRole(size: 36, weight: .semibold, style: .largeTitle, lineSpacing: 0)
    /// Big filled button (spec: 18 semibold).
    public static let bigButton = DeskTextRole(size: 18, weight: .semibold, style: .headline, lineSpacing: 0)
    /// Scheduled timeline time (spec: 22 bold).
    public static let timelineTime = DeskTextRole(size: 22, weight: .bold, style: .title2, lineSpacing: 0)
}

extension View {
    public func deskText(_ role: DeskTextRole) -> some View {
        font(role.font).lineSpacing(role.lineSpacing)
    }
}

/// Card surface: a white rounded fill and a soft shadow, no outline.
public struct DeskCardBackground: View {
    private let radius: CGFloat

    public init(radius: CGFloat = DeskRadius.medium) {
        self.radius = radius
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        shape.fill(DeskTheme.cardBackground)
            .shadow(color: DeskShadow.card.color, radius: DeskShadow.card.radius, y: DeskShadow.card.y)
    }
}

extension View {
    /// Pads the content and puts it on a `DeskCardBackground`.
    public func deskCard(radius: CGFloat = DeskRadius.medium, padding: CGFloat = DeskLayout.cardInset) -> some View {
        self.padding(padding).background(DeskCardBackground(radius: radius))
    }
}

/// Text-field surface matching the reader app's `SabqInputSurface`.
public struct DeskInputSurface: ViewModifier {
    public init() {}

    public func body(content: Content) -> some View {
        content
            .padding(.horizontal, DeskLayout.space16)
            .padding(.vertical, DeskLayout.space12)
            .frame(minHeight: DeskLayout.controlHeight)
            .background(DeskTheme.surface, in: RoundedRectangle(cornerRadius: DeskRadius.medium))
            .overlay(RoundedRectangle(cornerRadius: DeskRadius.medium).stroke(DeskTheme.outline, lineWidth: 1))
    }
}

/// Filled primary pill button; `destructive` switches to the danger fill.
public struct DeskPrimaryButtonStyle: ButtonStyle {
    private let destructive: Bool
    @Environment(\.isEnabled) private var isEnabled

    public init(destructive: Bool = false) {
        self.destructive = destructive
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .deskText(DeskType.button)
            .frame(maxWidth: .infinity, minHeight: DeskLayout.controlHeight)
            .foregroundStyle(isEnabled ? DeskTheme.onAction : DeskTheme.disabledInk)
            .background(isEnabled ? (destructive ? DeskTheme.danger : DeskTheme.actionFill) : DeskTheme.disabledFill,
                        in: Capsule())
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Outlined secondary pill button.
public struct DeskSecondaryButtonStyle: ButtonStyle {
    private let destructive: Bool
    @Environment(\.isEnabled) private var isEnabled

    public init(destructive: Bool = false) {
        self.destructive = destructive
    }

    public func makeBody(configuration: Configuration) -> some View {
        let ink = isEnabled ? (destructive ? DeskTheme.danger : DeskTheme.primary) : DeskTheme.disabledInk
        return configuration.label
            .deskText(DeskType.button)
            .frame(maxWidth: .infinity, minHeight: DeskLayout.controlHeight)
            .foregroundStyle(ink)
            .background(DeskTheme.surface, in: Capsule())
            .overlay(Capsule().stroke(ink.opacity(0.5), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
#endif
