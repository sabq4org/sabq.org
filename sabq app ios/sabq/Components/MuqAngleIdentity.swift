import SwiftUI
import UIKit

extension MuqTheme {
    /// لون الزاوية نفسه، مع ضبط درجته فقط عندما يحتاج النص إلى تباين أعلى.
    var ink: Color {
        let base = ui
        return Color(UIColor { traits in
            let dark = traits.userInterfaceStyle == .dark
            let surface = UIColor(SabqTheme.surface).resolvedColor(with: traits)
            let background = Self.mix(base, over: surface, amount: 0.12)
            return Self.readable(base, on: background, toward: dark ? .white : .black)
        })
    }

    var headerFill: UIColor { Self.readable(ui, on: .white, toward: .black) }

    var headerGradient: LinearGradient {
        LinearGradient(
            colors: [Color(Self.mix(.black, over: headerFill, amount: 0.25)), Color(headerFill)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    private static func readable(_ base: UIColor, on background: UIColor, toward target: UIColor) -> UIColor {
        for step in 0...40 {
            let candidate = mix(target, over: base, amount: CGFloat(step) / 40)
            let first = luminance(candidate), second = luminance(background)
            if (max(first, second) + 0.05) / (min(first, second) + 0.05) >= 5.5 {
                return candidate
            }
        }
        return target
    }

    private static func mix(_ foreground: UIColor, over background: UIColor, amount: CGFloat) -> UIColor {
        var fr: CGFloat = 0, fg: CGFloat = 0, fb: CGFloat = 0, fa: CGFloat = 0
        var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
        foreground.getRed(&fr, green: &fg, blue: &fb, alpha: &fa)
        background.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        return UIColor(red: br + (fr - br) * amount, green: bg + (fg - bg) * amount,
                       blue: bb + (fb - bb) * amount, alpha: 1)
    }

    private static func luminance(_ color: UIColor) -> CGFloat {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        func linear(_ channel: CGFloat) -> CGFloat {
            channel <= 0.04045 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }
}

/// غياب الغلاف يصل أحيانًا كسلسلة فارغة؛ لا نحوله إلى رابط الصفحة الرئيسية.
func muqImageURL(_ raw: String?) -> URL? {
    guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty,
          let url = URL(string: URLConstants.absolutize(value)),
          ["https", "http"].contains(url.scheme?.lowercased() ?? "") else { return nil }
    return url
}

/// ترويسة الزاوية تحمل هويتها حتى عندما لا يرفع الكاتب صورة غلاف.
struct MuqAngleHeader: View {
    let angle: MuqAngle?
    let writer: MuqWriter?
    let fallbackName: String?
    let fallbackColor: String?
    let topicCount: Int
    let onShare: () -> Void

    private var theme: MuqTheme { MuqTheme(angle?.colorHex ?? fallbackColor) }

    var body: some View {
        VStack(spacing: SabqLayout.space16) {
            Image(systemName: muqSymbol(angle?.iconKey))
                .font(.system(size: 28, weight: .medium))
                .frame(width: 60, height: 60)
                .background(.white.opacity(0.16), in: Circle())
                .accessibilityHidden(true)

            Text(angle?.nameAr ?? fallbackName ?? "زاوية")
                .sabqText(SabqType.articleTitle)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            if let writer, let name = writer.name, !name.isEmpty {
                HStack(spacing: SabqLayout.space12) {
                    avatar(writer, name: name)
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        Text(name).font(SabqType.rowTitle.font)
                        Text("كاتب الزاوية").font(SabqType.meta.font)
                    }
                }
            }

            if let description = angle?.shortDesc, !description.isEmpty {
                Text(description)
                    .sabqText(SabqType.excerpt)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: SabqLayout.space16) { actions }
                VStack(spacing: SabqLayout.space8) { actions }
            }
        }
        .foregroundStyle(.white)
        .padding(SabqLayout.space24)
        .frame(maxWidth: .infinity)
        .background {
            theme.headerGradient
            if let url = muqImageURL(angle?.coverImageUrl) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 1200) { Color.clear }
                    .opacity(0.08)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .accessibilityIdentifier("muqtarab.angle.header")
    }

    @ViewBuilder private var actions: some View {
        Text("\(topicCount) موضوع")
            .font(SabqType.meta.font)
            .monospacedDigit()
        Button(action: onShare) {
            Label("مشاركة", systemImage: "square.and.arrow.up")
                .font(SabqType.metaEmphasis.font)
                .padding(.horizontal, SabqLayout.space12)
                .frame(minHeight: SabqLayout.touchTarget)
                .overlay(Capsule().strokeBorder(.white.opacity(0.45), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func avatar(_ writer: MuqWriter, name: String) -> some View {
        ZStack {
            Circle().fill(.white.opacity(0.15))
            Text(String(name.prefix(1))).font(SabqType.button.font)
            if let url = muqImageURL(writer.avatar) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 200) { Color.clear }
            }
        }
        .frame(width: 40, height: 40)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
        .accessibilityHidden(true)
    }
}
