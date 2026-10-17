import Foundation
import SwiftUI
import Testing
import UIKit

@testable import sabq

/// Contract tests for the editorial palette.  These tests resolve the dynamic
/// SwiftUI colours through both trait collections, so a change that only fails
/// in dark mode is still caught without relying on a simulator appearance.
@Suite(.serialized)
struct EditorialDesignSystemTests {
    private let defaults = UserDefaults.standard

    @Test func increasedContrastStrengthensSecondaryTextInBothModes() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let high = UITraitCollection(traitsFrom: [
                UITraitCollection(userInterfaceStyle: style),
                UITraitCollection(accessibilityContrast: .high)
            ])
            for color in [SabqTheme.secondaryInk, SabqTheme.tertiaryInk] {
                let highColor = UIColor(color).resolvedColor(with: high)
                let surface = resolved(SabqTheme.surface, style: style)
                #expect(contrast(highColor, against: surface) >= 7)
                #expect(contrast(highColor, against: surface) > contrast(color, against: SabqTheme.surface, style: style))
            }
        }
    }

    @Test func primaryAndTextRolesAreReadableOnEverySurfaceInBothModes() {
        withSeason(false) {
            let foregrounds: [(String, Color)] = [
                ("primary", SabqTheme.primary), ("textPrimary", SabqTheme.textPrimary),
                ("textSecondary", SabqTheme.textSecondary), ("textTertiary", SabqTheme.textTertiary),
                ("breaking", SabqTheme.breaking),
            ]
            let surfaces: [(String, Color)] = [
                ("background", SabqTheme.background), ("surface", SabqTheme.surface),
                ("surfaceMuted", SabqTheme.surfaceMuted),
            ]
            for style in [UIUserInterfaceStyle.light, .dark] {
                for (name, color) in foregrounds {
                    for (surfaceName, surface) in surfaces {
                        #expect(
                            contrast(color, against: surface, style: style) >= 4.5,
                            "\(name) must be readable on \(surfaceName) in \(styleName(style))"
                        )
                    }
                }
            }
        }
    }

    @Test func actionFillSupportsWhiteActionLabelsInBothModes() {
        withSeason(false) {
            for style in [UIUserInterfaceStyle.light, .dark] {
                #expect(
                    contrast(SabqTheme.onAction, against: SabqTheme.actionFill, style: style) >= 4.5,
                    "onAction must be readable on actionFill in \(styleName(style))"
                )
            }
        }
    }

    @Test func legacyColourNamesResolveToTheSemanticRoles() {
        withSeason(false) {
            let pairs: [(Color, Color)] = [
                (SabqTheme.ink, SabqTheme.textPrimary), (SabqTheme.secondaryInk, SabqTheme.textSecondary),
                (SabqTheme.tertiaryInk, SabqTheme.textTertiary), (SabqTheme.primaryEnd, SabqTheme.primary),
                (SabqTheme.brandBlue, SabqTheme.primary), (SabqTheme.paleFill, SabqTheme.surfaceMuted),
                (SabqTheme.publicSurface, SabqTheme.surfaceMuted),
            ]
            for style in [UIUserInterfaceStyle.light, .dark] {
                for (legacy, role) in pairs {
                    #expect(colorDistance(resolved(legacy, style: style), resolved(role, style: style)) < 0.001)
                }
            }
        }
    }

    @Test func typeScaleKeepsTheTwelvePointFloorAndBoldOnlyForLargeTitles() {
        let roles = [SabqType.articleTitle, SabqType.leadTitle, SabqType.sectionHeading, SabqType.rowTitle,
                     SabqType.articleBody, SabqType.excerpt, SabqType.meta, SabqType.tag, SabqType.button]
        for role in roles {
            #expect(role.size >= 12)
            #expect(role.size.truncatingRemainder(dividingBy: 1) == 0)
            if role.weight == .bold { #expect(role.size >= 20) }
        }
        #expect(SabqType.articleTitle.size > SabqType.leadTitle.size)
        #expect(SabqType.leadTitle.size > SabqType.sectionHeading.size)
        #expect(SabqType.sectionHeading.size > SabqType.rowTitle.size)
    }

    @Test func radiiAndSpacingStayOnTheSystemGrid() {
        let radii = [SabqTheme.cardRadius, SabqTheme.blockRadius, SabqTheme.tileRadius,
                     SabqTheme.buttonRadius, SabqTheme.chipRadius]
        #expect(Set(radii).isSubset(of: [SabqRadius.small, SabqRadius.medium]))
        for value in [SabqLayout.pageMargin, SabqLayout.sectionGap, SabqLayout.rowPadding, SabqLayout.cardInset] {
            #expect(value.truncatingRemainder(dividingBy: 4) == 0)
        }
    }

    @Test func disabledActionPairRemainsReadableInBothModes() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            #expect(
                contrast(SabqTheme.disabledInk, against: SabqTheme.disabledFill, style: style) >= 4.5,
                "disabledInk must be readable on disabledFill in \(styleName(style))"
            )
        }
    }

    @Test func seasonalOverrideIsReadableAndRestoresTheBrandPrimary() {
        withSeason(false) {
            let beforeLight = resolved(SabqTheme.primaryEnd, style: .light)
            let beforeDark = resolved(SabqTheme.primaryEnd, style: .dark)

            defaults.set(true, forKey: NationalDayTheme.activeDefaultsKey)
            for style in [UIUserInterfaceStyle.light, .dark] {
                #expect(
                    contrast(SabqTheme.primaryEnd, against: SabqTheme.surface, style: style) >= 4.5,
                    "seasonal primaryEnd must be readable on surface in \(styleName(style))"
                )
                #expect(
                    contrast(SabqTheme.primaryEnd, against: SabqTheme.background, style: style) >= 4.5,
                    "seasonal primaryEnd must be readable on background in \(styleName(style))"
                )
                #expect(
                    contrast(SabqTheme.onAction, against: SabqTheme.actionFill, style: style) >= 4.5,
                    "seasonal actionFill must support white labels in \(styleName(style))"
                )
                #expect(
                    colorDistance(resolved(SabqTheme.primaryEnd, style: style), resolved(NationalDayTheme.accent, style: style)) < 0.001,
                    "seasonal primaryEnd must use the National Day accent in \(styleName(style))"
                )
            }

            defaults.set(false, forKey: NationalDayTheme.activeDefaultsKey)
            #expect(colorDistance(resolved(SabqTheme.primaryEnd, style: .light), beforeLight) < 0.001)
            #expect(colorDistance(resolved(SabqTheme.primaryEnd, style: .dark), beforeDark) < 0.001)
            #expect(colorDistance(resolved(SabqTheme.actionFill, style: .light), beforeLight) < 0.001)
        }
    }

    @Test func editorialLayoutKeepsTouchTargetsAndReadingColumnAtDocumentedMinimums() {
        #expect(SabqLayout.touchTarget >= 44)
        #expect(SabqLayout.controlHeight >= 44)
        #expect(SabqLayout.readingWidth >= 600)
        _ = SabqType.pageTitle
        _ = SabqType.sectionTitle
        _ = SabqType.headline
        _ = SabqType.body
        _ = SabqType.label
        _ = SabqType.caption
    }

    private func withSeason<T>(_ seasonal: Bool, _ body: () throws -> T) rethrows -> T {
        let previousSeason = defaults.object(forKey: NationalDayTheme.activeDefaultsKey)
        defaults.set(seasonal, forKey: NationalDayTheme.activeDefaultsKey)
        defer { restore(previousSeason, forKey: NationalDayTheme.activeDefaultsKey) }
        return try body()
    }

    private func restore(_ value: Any?, forKey key: String) {
        if let value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }

    private func resolved(_ color: Color, style: UIUserInterfaceStyle) -> UIColor {
        UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
    }

    private func contrast(_ foreground: Color, against background: Color, style: UIUserInterfaceStyle) -> Double {
        contrast(resolved(foreground, style: style), against: resolved(background, style: style))
    }

    private func contrast(_ foreground: UIColor, against background: UIColor) -> Double {
        let foregroundLuminance = luminance(foreground)
        let backgroundLuminance = luminance(background)
        let lighter = max(foregroundLuminance, backgroundLuminance)
        let darker = min(foregroundLuminance, backgroundLuminance)
        return (lighter + 0.05) / (darker + 0.05)
    }

    private func luminance(_ color: UIColor) -> Double {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        if color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) {
            return channelLuminance(Double(red)) * 0.2126
                + channelLuminance(Double(green)) * 0.7152
                + channelLuminance(Double(blue)) * 0.0722
        }

        var white: CGFloat = 0
        if color.getWhite(&white, alpha: &alpha) {
            return channelLuminance(Double(white))
        }
        return 0
    }

    private func channelLuminance(_ channel: Double) -> Double {
        channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
    }

    private func colorDistance(_ lhs: UIColor, _ rhs: UIColor) -> CGFloat {
        var lr: CGFloat = 0, lg: CGFloat = 0, lb: CGFloat = 0, la: CGFloat = 0
        var rr: CGFloat = 0, rg: CGFloat = 0, rb: CGFloat = 0, ra: CGFloat = 0
        guard lhs.getRed(&lr, green: &lg, blue: &lb, alpha: &la),
              rhs.getRed(&rr, green: &rg, blue: &rb, alpha: &ra) else {
            return .greatestFiniteMagnitude
        }
        return abs(lr - rr) + abs(lg - rg) + abs(lb - rb) + abs(la - ra)
    }

    private func styleName(_ style: UIUserInterfaceStyle) -> String {
        style == .dark ? "dark" : "light"
    }
}
