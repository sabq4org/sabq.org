import SwiftUI
import UIKit

// The single source of truth for Sabq's visual tokens: colour, type, spacing
// and corner radii. Screens read semantic roles from here; raw hex values,
// point sizes and radii do not belong in view code.

// MARK: - Colour

nonisolated enum SabqTheme {
    static func adaptive(_ light: UInt32, _ dark: UInt32,
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

    // Brand and actions.

    /// سماوي سبق #4CBCFD — للشعار والزخرفة فقط؛ تباينه على الأبيض 2.1 فلا يصلح لنص.
    nonisolated static let brandSky = Color(red: 76 / 255.0, green: 188 / 255.0, blue: 253 / 255.0)
    /// روابط، اسم القسم، وعناصر التنقل النشطة. يتقدم عليه ثيم اليوم الوطني حين يُفعَّل.
    static var primary: Color {
        NationalDayTheme.isActive ? NationalDayTheme.accent : basePrimary
    }
    /// خلفية الأزرار الممتلئة؛ داكنة بما يكفي لنص أبيض في الوضعين.
    static var actionFill: Color {
        NationalDayTheme.isActive ? NationalDayTheme.canvas : baseActionFill
    }
    static let onAction = Color.white
    private static let basePrimary = adaptive(0x096EBD, 0x5CC4FF)
    private static let baseActionFill = adaptive(0x096EBD, 0x1A6FA8)

    // Text.

    static let textPrimary = adaptive(0x0C1A2A, 0xF0F4F8)
    static let textSecondary = adaptive(0x3E5063, 0xA6B5C4, highContrastLight: 0x0C1A2A, highContrastDark: 0xF0F4F8)
    static let textTertiary = adaptive(0x556677, 0x8E9EAE, highContrastLight: 0x0C1A2A, highContrastDark: 0xF0F4F8)

    // Surfaces. Light mode is a white page with cool sky-tinted muted blocks; dark mode steps up from the page.

    static let background = adaptive(0xFFFFFF, 0x0B121A)
    static let surface = adaptive(0xFFFFFF, 0x141D27)
    /// أشرطة الفصل بين الأقسام والبلوكات الهادئة (الموجز الذكي، الحقول).
    static let surfaceMuted = adaptive(0xEFF6FC, 0x152230)
    static let surfaceStrong = adaptive(0xDFECF7, 0x1F3145)
    /// خلفية البطاقات التحريرية المميزة بهوية سبق السماوية (الموجز اليومي، الموجز الذكي، بطاقة الآراء).
    static let skyTint = adaptive(0xDCF1FE, 0x152C44)
    /// إطار سماوي واضح للبطاقات التحريرية المميزة.
    static let skyOutline = adaptive(0xA6D8FB, 0x264B73)
    /// خط رفيع بين الأخبار داخل القائمة.
    static let separator = adaptive(0xE2E9F0, 0x24313F)
    /// حدود عناصر التحكم (حقول، أزرار ثانوية).
    static let outline = adaptive(0xCFDCE8, 0x334354)

    // Status.

    /// العاجل وحده.
    static let breaking = adaptive(0xC8102E, 0xFF6B6B)
    static let success = adaptive(0x13734E, 0x73D9A9)
    static let warning = adaptive(0x946000, 0xF2C76D)
    static let danger = adaptive(0xBF3038, 0xFF9297)
    static let teal = adaptive(0x08785F, 0x70DCC0)
    static let disabledFill = adaptive(0xE6EAEE, 0x2A3644)
    static let disabledInk = adaptive(0x55626F, 0xA3B1BF)

    static let shadow = Color.black.opacity(0.03)
    static let deepShadow = Color.black.opacity(0.05)

    // Legacy names kept so existing screens resolve to the system above;
    // new code uses the semantic names.

    static let ink = textPrimary
    static let secondaryInk = textSecondary
    static let tertiaryInk = textTertiary
    static var primaryStart: Color { primary }
    static var primaryEnd: Color { primary }
    static var brandBlue: Color { primary }
    static var sky: Color { primary }
    static let paleFill = surfaceMuted
    static let publicSurface = surfaceMuted
    static let identityCard = surfaceMuted
    static let softFill = surfaceStrong
    static let gold = warning
    static let coral = danger
    static let leaf = success
    static let emerald = success

    static var brandGradient: LinearGradient {
        LinearGradient(colors: [actionFill, actionFill], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    // Corner radii: three values only.

    nonisolated static let cardRadius: CGFloat = SabqRadius.medium
    nonisolated static let blockRadius: CGFloat = SabqRadius.medium
    nonisolated static let tileRadius: CGFloat = SabqRadius.medium
    nonisolated static let buttonRadius: CGFloat = SabqRadius.medium
    nonisolated static let chipRadius: CGFloat = SabqRadius.small
}

nonisolated enum SabqRadius {
    /// صور مصغّرة، وسوم، شارات.
    static let small: CGFloat = 8
    /// بطاقات، صور داخل البطاقات، أزرار.
    static let medium: CGFloat = 12
    // الكبسولة: `Capsule()` مباشرة.
}

// MARK: - Spacing

/// Editorial layout primitives on a 4-point grid.
nonisolated enum SabqLayout {
    static let space4: CGFloat = 4
    static let space8: CGFloat = 8
    static let space12: CGFloat = 12
    static let space16: CGFloat = 16
    static let space24: CGFloat = 24
    static let space32: CGFloat = 32
    static let space40: CGFloat = 40
    /// هامش الصفحة الأفقي.
    static let pageMargin: CGFloat = 16
    /// المسافة بين قسمين في الصفحة.
    static let sectionGap: CGFloat = 32
    /// الحشوة الرأسية لصف خبر في قائمة.
    static let rowPadding: CGFloat = 16
    static let pageInset: CGFloat = 20
    static let cardInset: CGFloat = 16
    static let controlHeight: CGFloat = 48
    static let touchTarget: CGFloat = 44
    static let readingWidth: CGFloat = 680
}

// MARK: - Type

/// One step of the type scale. `lineSpacing` is added on top of IBM Plex Sans
/// Arabic's natural line height (1.5 × size), which already leaves room for
/// Arabic diacritics.
nonisolated struct SabqTextRole: Sendable {
    let size: CGFloat
    let weight: Weight
    let style: Font.TextStyle
    let lineSpacing: CGFloat

    enum Weight: Sendable { case regular, semibold, bold }

    var font: Font { .custom(postScriptName(boldText: false), size: size, relativeTo: style) }

    /// يحترم «النص العريض» في إعدادات الإتاحة بدرجة وزن إضافية.
    func font(boldText: Bool) -> Font {
        .custom(postScriptName(boldText: boldText), size: size, relativeTo: style)
    }

    /// Base size for `SabqRTLText`, which scales it with `uiTextStyle`.
    var uiFont: UIFont { uiFont(adding: 0) }

    /// يتبع إعداد «حجم الخط» في صفحة الخبر: يزيد أو ينقص بقدر ما غيّره القارئ.
    func uiFont(adding delta: CGFloat) -> UIFont {
        let pointSize = max(12, size + delta)
        return UIFont(name: postScriptName(boldText: false), size: pointSize) ?? .systemFont(ofSize: pointSize, weight: uiWeight)
    }

    var uiTextStyle: UIFont.TextStyle {
        switch style {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }

    private func postScriptName(boldText: Bool) -> String {
        switch weight {
        case .regular:
            return boldText ? SabqFonts.semibold : SabqFonts.regular
        case .semibold:
            if boldText { return SabqFonts.bold }
            // استخدام الوزن المتوسط (Medium) لعناوين صفوف الأخبار (16pt) ليبقى الفارق
            // واضحاً بينها وبين العنوان الرئيسي (22pt Bold).
            return style == .headline ? SabqFonts.medium : SabqFonts.semibold
        case .bold:
            return SabqFonts.bold
        }
    }

    private var uiWeight: UIFont.Weight {
        switch weight {
        case .regular: .regular
        case .semibold: .semibold
        case .bold: .bold
        }
    }
}

/// IBM Plex Sans Arabic. Bold only for titles of 20pt and above, SemiBold for
/// list headlines, labels and buttons, Regular for everything else; 12pt floor.
nonisolated enum SabqType {
    static let articleTitle = SabqTextRole(size: 23, weight: .bold, style: .title, lineSpacing: 3)
    static let leadTitle = SabqTextRole(size: 21, weight: .bold, style: .title2, lineSpacing: 2)
    static let sectionHeading = SabqTextRole(size: 20, weight: .bold, style: .title3, lineSpacing: 0)
    static let rowTitle = SabqTextRole(size: 16, weight: .semibold, style: .headline, lineSpacing: 2)
    static let articleBody = SabqTextRole(size: 18, weight: .regular, style: .body, lineSpacing: 5)
    static let excerpt = SabqTextRole(size: 15, weight: .regular, style: .subheadline, lineSpacing: 1)
    static let meta = SabqTextRole(size: 13, weight: .regular, style: .footnote, lineSpacing: 0)
    /// اسم القسم داخل سطر البيانات.
    static let metaEmphasis = SabqTextRole(size: 13, weight: .semibold, style: .footnote, lineSpacing: 0)
    static let tag = SabqTextRole(size: 12, weight: .semibold, style: .caption, lineSpacing: 0)
    static let button = SabqTextRole(size: 16, weight: .semibold, style: .callout, lineSpacing: 0)

    // Roles used by the account, discovery and form screens before the scale above.
    static var pageTitle: Font { SabqFonts.editorial(.title, size: 26, weight: .semibold) }
    static var sectionTitle: Font { SabqFonts.editorial(.title3, size: 20, weight: .semibold) }
    static var headline: Font { SabqFonts.editorial(.headline, size: 18, weight: .semibold) }
    static var body: Font { SabqFonts.editorial(.body, size: 17) }
    static var label: Font { SabqFonts.editorial(.subheadline, size: 15, weight: .semibold) }
    static var caption: Font { SabqFonts.editorial(.caption, size: 13) }
}

extension View {
    func sabqText(_ role: SabqTextRole) -> some View {
        font(role.font).lineSpacing(role.lineSpacing)
    }
}

/// Consistent text-field surface; focus and error remain explicit at the call site.
struct SabqInputSurface: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, SabqLayout.space16)
            .padding(.vertical, SabqLayout.space12)
            .frame(minHeight: SabqLayout.controlHeight)
            .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius))
            .overlay(RoundedRectangle(cornerRadius: SabqTheme.buttonRadius)
                .stroke(SabqTheme.outline, lineWidth: 1))
    }
}
