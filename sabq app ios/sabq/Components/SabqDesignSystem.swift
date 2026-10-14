import SwiftUI

/// Editorial layout primitives, shared by reader, discovery and account screens.
nonisolated enum SabqLayout {
    static let space4: CGFloat = 4
    static let space8: CGFloat = 8
    static let space12: CGFloat = 12
    static let space16: CGFloat = 16
    static let space24: CGFloat = 24
    static let space32: CGFloat = 32
    static let pageInset: CGFloat = 20
    static let cardInset: CGFloat = 16
    static let controlHeight: CGFloat = 48
    static let touchTarget: CGFloat = 44
    static let readingWidth: CGFloat = 680
}

/// IBM Plex Sans Arabic; semantic Dynamic Type scaling without fixed text frames.
nonisolated enum SabqType {
    static var pageTitle: Font { SabqFonts.editorial(.title, size: 26, weight: .semibold) }
    static var sectionTitle: Font { SabqFonts.editorial(.title3, size: 20, weight: .semibold) }
    static var headline: Font { SabqFonts.editorial(.headline, size: 18, weight: .semibold) }
    static var body: Font { SabqFonts.editorial(.body, size: 17) }
    static var label: Font { SabqFonts.editorial(.subheadline, size: 15, weight: .semibold) }
    static var caption: Font { SabqFonts.editorial(.caption, size: 13) }
}

/// «حبر وسماء» — هوية V2 بلونيها القائدين: حبر سبق الكحلي #081420 وسماويه
/// #4CBCFD. الحبر ثابت في الوضعين (هيرو، شريط «الآن»، مشغّل الصوت)، وبقية
/// الأدوار تتكيّف مع الوضع الليلي.
nonisolated enum InkSky {
    static let ink = Color(red: 0x08 / 255.0, green: 0x14 / 255.0, blue: 0x20 / 255.0)
    static let inkRaised = Color(red: 0x10 / 255.0, green: 0x20 / 255.0, blue: 0x2E / 255.0)
    static let sky = SabqTheme.brandSky
    /// أحمر العاجل والإنذار على أرضية الحبر (تباين كافٍ للنص الصغير).
    static let alertOnInk = Color(red: 1, green: 0x9C / 255.0, blue: 0x9C / 255.0)

    static let page = SabqTheme.background
    static let card = SabqTheme.surface
    static let accent = SabqTheme.brandBlue
    static let line = SabqTheme.adaptive(0xE3EBF2, 0x1D3246)
    static let wash = SabqTheme.adaptive(0xDCF1FE, 0x0E2A40)
    static let track = SabqTheme.adaptive(0xE9EFF4, 0x1D3246)
    /// الزر الممتلئ الأساسي: حبر في النهار، سماوي في الليل.
    static let solid = SabqTheme.adaptive(0x081420, 0x4CBCFD)
    static let onSolid = SabqTheme.adaptive(0xFFFFFF, 0x081420)

    static let sheetRadius: CGFloat = 28
    static let cardRadius: CGFloat = 20
}

/// موجة أعمدة بإيقاع شعار سبق — للصوت والموجز. زخرفة صامتة لقارئ الشاشة.
struct InkSkyWave: View {
    var activeCount = 5
    var active: Color = InkSky.accent
    var idle: Color = InkSky.accent.opacity(0.28)
    var heights: [CGFloat] = [10, 18, 26, 14, 30, 22, 12, 24, 16, 28, 11, 19]

    var body: some View {
        HStack(alignment: .center, spacing: 3) {
            ForEach(Array(heights.enumerated()), id: \.offset) { i, h in
                RoundedRectangle(cornerRadius: 1)
                    .fill(i < activeCount ? active : idle)
                    .frame(width: 3, height: h)
            }
        }
        .accessibilityHidden(true)
    }
}

/// نقطة «مباشر» نابضة بالسماوي؛ ثابتة مع «تقليل الحركة».
struct InkSkyPulse: View {
    var color: Color = InkSky.sky
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var on = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 9, height: 9)
            .background(
                Circle()
                    .stroke(color.opacity(on ? 0 : 0.55), lineWidth: on ? 10 : 1)
                    .scaleEffect(on ? 2.2 : 1)
            )
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { on = true }
            }
            .accessibilityHidden(true)
    }
}

/// زر دائري زجاجي فوق الصور والحبر (بحث، إشعارات، رجوع، مشاركة).
struct InkGlassCircle: View {
    let systemName: String
    var size: CGFloat = 44

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Circle().fill(InkSky.ink.opacity(0.38)))
            .background(Circle().fill(.ultraThinMaterial).environment(\.colorScheme, .dark))
            .overlay(Circle().stroke(.white.opacity(0.18), lineWidth: 1))
            .contentShape(Circle())
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

extension View {
    /// يُخفي ضباب حافة التمرير العلوي (iOS 26+) فوق أرضية الحبر؛ يعود حين
    /// تصعد الورقة الفاتحة تحت الشريط.
    @ViewBuilder
    func inkTopEdgeEffectHidden(_ hidden: Bool) -> some View {
        if #available(iOS 26, *) {
            scrollEdgeEffectHidden(hidden, for: .top)
        } else {
            self
        }
    }
}
