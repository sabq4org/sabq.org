import SwiftUI

/// AI-generated image disclosure badge.
/// Matches the web's `ImageWithCaption.tsx` (`bg-primary/90`).
struct AIImageBadge: View {
    let model: String?
    private let sizeScale: CGFloat

    /// Drives re-render when the user picks a new accent in Settings.
    @AppStorage("appAccent") private var accentRaw: String = AppAccent.blue.rawValue
    @Environment(\.colorScheme) private var colorScheme

    init(model: String? = nil, sizeScale: CGFloat = 1) {
        self.model = model
        self.sizeScale = sizeScale
    }

    var body: some View {
        HStack(spacing: 5 * sizeScale) {
            Text("مولدة بالذكاء الاصطناعي")
                .font(SabqFonts.app(size: 11 * sizeScale, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
            Image(systemName: "sparkles")
                .font(SabqFonts.app(size: 11 * sizeScale, weight: .bold))
        }
        // Icon on the physical right, Arabic text flows inward.
        .environment(\.layoutDirection, .leftToRight)
        .foregroundStyle(.white)
        .padding(.horizontal, 10 * sizeScale)
        .padding(.vertical, 5 * sizeScale)
        .background(
            Capsule().fill(badgeFill)
        )
        .overlay(
            Capsule().stroke(.white.opacity(colorScheme == .dark ? 0.22 : 0.30), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(colorScheme == .dark ? 0.45 : 0.25), radius: 6, x: 0, y: 2)
        .accessibilityLabel("مولدة بالذكاء الاصطناعي")
    }

    /// Same token as the web `bg-primary/90` — follows accent picker + dark mode.
    private var badgeFill: Color {
        let accent = AppAccent(rawValue: accentRaw) ?? .blue
        let base = colorScheme == .dark ? accent.darkColor : accent.color
        return base.opacity(0.95)
    }
}

/// Physical screen corner — not semantic leading/trailing (immune to RTL flip).
enum AIImageBadgeCorner {
    /// Physical top-left — same side as `.primaryAction` toolbar (like / save / share) in RTL.
    case topLeading
    /// Physical top-right — feed cards / web hero.
    case topTrailing
}

/// Pins the badge to a fixed physical corner of the image bounds.
struct AIImageBadgeOverlay: View {
    let model: String?
    let inset: CGFloat
    let sizeScale: CGFloat
    let corner: AIImageBadgeCorner

    init(
        model: String? = nil,
        inset: CGFloat = 12,
        sizeScale: CGFloat = 1,
        corner: AIImageBadgeCorner = .topTrailing
    ) {
        self.model = model
        self.inset = inset
        self.sizeScale = sizeScale
        self.corner = corner
    }

    var body: some View {
        // Color.clear expands to the full overlay; ZStack alignment pins the badge.
        // GeometryReader was centering the badge in the hero — avoid it here.
        ZStack(alignment: zStackAlignment) {
            Color.clear
            AIImageBadge(model: model, sizeScale: sizeScale)
                .padding(.top, inset)
                .padding(.leading, corner == .topLeading ? inset : 0)
                .padding(.trailing, corner == .topTrailing ? inset : 0)
        }
        .environment(\.layoutDirection, .leftToRight)
        .allowsHitTesting(false)
    }

    private var zStackAlignment: Alignment {
        corner == .topLeading ? .topLeading : .topTrailing
    }
}

extension View {
    func aiImageBadgeOverlay(
        isVisible: Bool,
        model: String? = nil,
        inset: CGFloat = 12,
        sizeScale: CGFloat = 1,
        corner: AIImageBadgeCorner = .topTrailing
    ) -> some View {
        overlay {
            if isVisible {
                AIImageBadgeOverlay(
                    model: model,
                    inset: inset,
                    sizeScale: sizeScale,
                    corner: corner
                )
            }
        }
    }
}
