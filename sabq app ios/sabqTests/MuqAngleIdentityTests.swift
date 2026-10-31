import SwiftUI
import Testing
import UIKit
@testable import sabq

@Suite @MainActor
struct MuqAngleIdentityTests {
    private let colors = ["#008cb4", "#0c8a4d", "#6C63FF", "#0099CC", "#9a244f", "#ffaa00", "#6366f1", "#fff", "#000"]

    @Test func missingCoverDoesNotBecomeTheWebsiteURL() {
        #expect(muqImageURL(nil) == nil)
        #expect(muqImageURL("") == nil)
        #expect(muqImageURL("  \n ") == nil)
        #expect(muqImageURL("/api/media/proxy/example")?.absoluteString == "https://sabq.org/api/media/proxy/example")
    }

    @Test func angleTextStaysReadableAcrossReaderSurfaces() {
        for hex in colors {
            let theme = MuqTheme(hex)
            for style in [UIUserInterfaceStyle.light, .dark] {
                let traits = UITraitCollection(userInterfaceStyle: style)
                let text = UIColor(theme.ink).resolvedColor(with: traits)
                let base = UIColor(SabqTheme.surface).resolvedColor(with: traits)
                let page = UIColor(SabqTheme.background).resolvedColor(with: traits)
                let soft = blend(theme.ui, over: base, alpha: 0.12)
                let softer = blend(theme.ui, over: base, alpha: 0.06)
                for surface in [base, page, soft, softer] {
                    #expect(contrast(text, surface) >= 4.5, "\(hex) in \(style.rawValue)")
                }
            }
        }
    }

    @Test func headerLabelRemainsReadableEvenOverAWhiteCover() {
        for hex in colors {
            let fill = MuqTheme(hex).headerFill
            #expect(contrast(.white, fill) >= 5.5)
            #expect(contrast(.white, blend(.white, over: fill, alpha: 0.08)) >= 4.5)
        }
    }

    private func blend(_ foreground: UIColor, over background: UIColor, alpha: CGFloat) -> UIColor {
        let front = rgb(foreground), back = rgb(background)
        return UIColor(red: front.0 * alpha + back.0 * (1 - alpha),
                       green: front.1 * alpha + back.1 * (1 - alpha),
                       blue: front.2 * alpha + back.2 * (1 - alpha), alpha: 1)
    }

    private func rgb(_ color: UIColor) -> (CGFloat, CGFloat, CGFloat) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b)
    }

    private func contrast(_ a: UIColor, _ b: UIColor) -> CGFloat {
        func luminance(_ color: UIColor) -> CGFloat {
            let c = rgb(color)
            func linear(_ v: CGFloat) -> CGFloat {
                v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
            }
            return linear(c.0) * 0.2126 + linear(c.1) * 0.7152 + linear(c.2) * 0.0722
        }
        let first = luminance(a), second = luminance(b)
        return (max(first, second) + 0.05) / (min(first, second) + 0.05)
    }
}
