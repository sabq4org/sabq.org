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

    public static let textPrimary = adaptive(0x0C1A2A, 0xF0F4F8)
    public static let textSecondary = adaptive(0x3E5063, 0xA6B5C4, highContrastLight: 0x0C1A2A, highContrastDark: 0xF0F4F8)
    public static let textTertiary = adaptive(0x556677, 0x8E9EAE, highContrastLight: 0x0C1A2A, highContrastDark: 0xF0F4F8)

    public static let background = adaptive(0xFFFFFF, 0x0B121A)
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
}

public enum DeskRadius {
    public static let small: CGFloat = 8
    public static let medium: CGFloat = 12
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
}

/// One step of the reader app's type scale.
public struct DeskTextRole: Sendable {
    public let size: CGFloat
    public let weight: Weight
    public let style: Font.TextStyle
    public let lineSpacing: CGFloat

    public enum Weight: Sendable { case regular, medium, semibold, bold }

    public var font: Font { .custom(postScriptName, size: size, relativeTo: style) }

    private var postScriptName: String {
        switch weight {
        case .regular: return DeskFonts.regular
        case .medium: return DeskFonts.medium
        case .semibold: return DeskFonts.semibold
        case .bold: return DeskFonts.bold
        }
    }
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
}

extension View {
    public func deskText(_ role: DeskTextRole) -> some View {
        font(role.font).lineSpacing(role.lineSpacing)
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

/// Filled primary button; `role: .destructive` switches to the danger fill.
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
                        in: RoundedRectangle(cornerRadius: DeskRadius.medium))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Outlined secondary button.
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
            .background(DeskTheme.surface, in: RoundedRectangle(cornerRadius: DeskRadius.medium))
            .overlay(RoundedRectangle(cornerRadius: DeskRadius.medium).stroke(ink.opacity(0.5), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
#endif
