import SwiftUI
import UIKit

// MARK: - Haptic Feedback

enum SabqHaptics {
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
    static func soft() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}

// MARK: - Shimmer Effect

struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geo in
                    LinearGradient(
                        colors: [
                            .clear,
                            Color.white.opacity(0.25),
                            .clear
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geo.size.width * 0.6)
                    .offset(x: phase * (geo.size.width * 1.6) - geo.size.width * 0.3)
                    .blendMode(.softLight)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .onAppear {
                withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
    }
}

extension View {
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

// MARK: - Skeleton Views

struct SkeletonBox: View {
    var width: CGFloat? = nil
    var height: CGFloat = 16
    var radius: CGFloat = 8

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(SabqTheme.outline.opacity(0.5))
            .frame(width: width, height: height)
            .shimmer()
    }
}

struct ArticleRowSkeleton: View {
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                SkeletonBox(width: 70, height: 24, radius: 12)
                SkeletonBox(height: 16)
                SkeletonBox(width: 200, height: 14)
                SkeletonBox(width: 140, height: 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SkeletonBox(width: 80, height: 80, radius: 16)
        }
        .padding(.vertical, 4)
    }
}

struct FeaturedCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SkeletonBox(height: 200, radius: 0)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: SabqTheme.cardRadius,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: SabqTheme.cardRadius,
                        style: .continuous
                    )
                )

            VStack(alignment: .leading, spacing: 12) {
                SkeletonBox(height: 20)
                SkeletonBox(width: 240, height: 16)
                SkeletonBox(width: 180, height: 14)
            }
            .padding(20)
        }
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
        )
    }
}

struct HomeFeedSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                SkeletonBox(width: 120, height: 48, radius: 12)
                Spacer()
                HStack(spacing: 12) {
                    SkeletonBox(width: 48, height: 48, radius: 24)
                    SkeletonBox(width: 48, height: 48, radius: 24)
                }
            }

            SkeletonBox(height: 50, radius: SabqTheme.tileRadius)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(0..<5, id: \.self) { _ in
                        VStack(spacing: 8) {
                            SkeletonBox(width: 68, height: 68, radius: 34)
                            SkeletonBox(width: 50, height: 10)
                        }
                    }
                }
            }

            FeaturedCardSkeleton()
                .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(0..<6, id: \.self) { _ in
                        SkeletonBox(width: 80, height: 36, radius: SabqTheme.chipRadius)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 16) {
                ForEach(0..<4, id: \.self) { _ in
                    ArticleRowSkeleton()
                    if true { Divider().foregroundStyle(SabqTheme.outline.opacity(0.3)) }
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(SabqTheme.surface)
                    .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
            )
        }
    }
}

// MARK: - Animated Appear Modifier

struct AnimatedAppear: ViewModifier {
    let index: Int
    @State private var isVisible = false

    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible ? 0 : 18)
            .onAppear {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82).delay(Double(index) * 0.05)) {
                    isVisible = true
                }
            }
    }
}

extension View {
    func animatedAppear(index: Int = 0) -> some View {
        modifier(AnimatedAppear(index: index))
    }
}

// MARK: - Cached Image

struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    let contentMode: ContentMode
    @ViewBuilder let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var isLoading = false
    @State private var didAppear = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity.animation(.easeOut(duration: 0.25)))
            } else {
                placeholder()
                    .onAppear {
                        guard !didAppear else { return }
                        didAppear = true
                        loadImage()
                    }
            }
        }
    }

    private func loadImage() {
        guard let url, !isLoading else { return }
        if let cached = ImageCache.shared.object(forKey: url as NSURL) {
            image = cached
            return
        }
        isLoading = true
        Task.detached(priority: .userInitiated) {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                // Downsample full-resolution news photos (often 1920×1080 +
                // 1–2 MB JPEGs) to a sane on-screen max. Removes the worst
                // memory + decode cost when the same image renders as a
                // 84×84 thumbnail. 2048 keeps room for retina hero shots.
                if let uiImage = ImageCache.decodedImage(data: data, maxPixelSize: 2048) {
                    ImageCache.shared.setObject(
                        uiImage,
                        forKey: url as NSURL,
                        // NSCache enforces `totalCostLimit` only when items
                        // declare a cost — without this, the 100 MB ceiling
                        // is unenforceable and the cache could grow to GBs.
                        cost: ImageCache.byteCost(of: uiImage)
                    )
                    await MainActor.run {
                        withAnimation(.easeOut(duration: 0.25)) {
                            image = uiImage
                        }
                    }
                }
            } catch {}
            await MainActor.run { isLoading = false }
        }
    }
}

enum ImageCache {
    nonisolated(unsafe) static let shared: NSCache<NSURL, UIImage> = {
        let c = NSCache<NSURL, UIImage>()
        c.countLimit = 150
        c.totalCostLimit = 100 * 1024 * 1024
        return c
    }()

    static func clear() {
        shared.removeAllObjects()
    }

    /// Decode + downsample an image to a sensible on-screen maximum.
    /// Uses ImageIO's `kCGImageSourceCreateThumbnailFromImageAlways` so
    /// the full-resolution bitmap never lives in memory.
    static func decodedImage(data: Data, maxPixelSize: CGFloat) -> UIImage? {
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, opts as CFDictionary)
        else {
            // Fall back to the standard decoder when ImageIO can't process
            // the payload (rare — usually corrupt or unsupported formats).
            return UIImage(data: data)
        }
        return UIImage(cgImage: cg)
    }

    /// Approximate bitmap cost in bytes (width × height × 4 for RGBA).
    /// Used as the NSCache `cost` so `totalCostLimit` actually enforces a
    /// memory ceiling.
    static func byteCost(of image: UIImage) -> Int {
        Int(image.size.width * image.scale * image.size.height * image.scale * 4)
    }
}

// MARK: - Theme

enum SabqTheme {
    static let background  = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.07, green: 0.07, blue: 0.09, alpha: 1)
            : UIColor(red: 0.95, green: 0.97, blue: 0.99, alpha: 1)
    })
    static let surface = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1)
            : UIColor.white
    })
    static let ink = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.95, green: 0.95, blue: 0.97, alpha: 1)
            : UIColor(red: 0.10, green: 0.10, blue: 0.14, alpha: 1)
    })
    static let secondaryInk = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.68, green: 0.68, blue: 0.72, alpha: 1)
            : UIColor(red: 0.38, green: 0.40, blue: 0.46, alpha: 1)
    })
    static let tertiaryInk = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.50, green: 0.50, blue: 0.55, alpha: 1)
            : UIColor(red: 0.56, green: 0.58, blue: 0.64, alpha: 1)
    })
    static let outline = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.20, green: 0.20, blue: 0.23, alpha: 1)
            : UIColor(red: 0.88, green: 0.90, blue: 0.93, alpha: 1)
    })
    static let shadow = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor.black.withAlphaComponent(0.30)
            : UIColor.black.withAlphaComponent(0.05)
    })
    static let deepShadow = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor.black.withAlphaComponent(0.40)
            : UIColor.black.withAlphaComponent(0.08)
    })
    private static var _cachedAccentRaw: String?
    private static var _cachedAccent: AppAccent?

    private static var resolvedAccent: AppAccent {
        let raw = UserDefaults.standard.string(forKey: "appAccent") ?? "blue"
        if raw == _cachedAccentRaw, let cached = _cachedAccent { return cached }
        let accent = AppAccent(rawValue: raw) ?? .blue
        _cachedAccentRaw = raw
        _cachedAccent = accent
        return accent
    }

    static var primaryStart: Color {
        let accent = resolvedAccent
        return Color(UIColor { t in
            t.userInterfaceStyle == .dark
                ? UIColor(accent.darkColor)
                : UIColor(accent.color)
        })
    }
    static var primaryEnd: Color {
        let accent = resolvedAccent
        return Color(UIColor { t in
            t.userInterfaceStyle == .dark
                ? UIColor(accent.darkColor)
                : UIColor(accent.color)
        })
    }
    static let teal        = Color(red: 0.16, green: 0.65, blue: 0.55)
    static let sky         = Color(red: 0.22, green: 0.52, blue: 0.95)
    static let gold        = Color(red: 0.92, green: 0.68, blue: 0.20)
    static let coral       = Color(red: 0.90, green: 0.35, blue: 0.32)
    static let leaf        = Color(red: 0.40, green: 0.73, blue: 0.22)
    static let paleFill = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.14, green: 0.14, blue: 0.16, alpha: 1)
            : UIColor(red: 0.94, green: 0.97, blue: 0.99, alpha: 1)
    })
    static let softFill = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.16, green: 0.16, blue: 0.18, alpha: 1)
            : UIColor(red: 0.92, green: 0.95, blue: 0.98, alpha: 1)
    })
    static let warmGlow = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1)
            : UIColor(red: 0.95, green: 0.97, blue: 0.99, alpha: 1)
    })

    static let cardRadius: CGFloat   = 28
    static let tileRadius: CGFloat   = 22
    static let chipRadius: CGFloat   = 14
    static let buttonRadius: CGFloat = 20

    static var brandGradient: LinearGradient {
        LinearGradient(
            colors: [primaryStart, primaryEnd],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Surface Card

struct SurfaceCard<Content: View>: View {
    private let content: Content
    var accent: Color?

    init(accent: Color? = nil, @ViewBuilder content: () -> Content) {
        self.accent = accent
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            content
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
                .shadow(color: SabqTheme.deepShadow, radius: 1, x: 0, y: 1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
        .overlay(alignment: .topTrailing) {
            if let accent {
                Circle()
                    .fill(accent.opacity(0.08))
                    .frame(width: 120, height: 120)
                    .offset(x: 40, y: -40)
                    .clipShape(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous))
            }
        }
        .sabqRTL()
    }
}

// MARK: - Screen Header

struct CompactScreenHeader: View {
    let title: String
    let subtitle: String
    var actionTitle: String?
    var actionIcon: String?
    var actionTint: Color = SabqTheme.primaryEnd
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let actionTitle, let actionIcon, let action {
                SmallActionButton(
                    title: actionTitle,
                    systemImage: actionIcon,
                    tint: actionTint,
                    action: action
                )
            }
        }
        .sabqRTL()
    }
}

// MARK: - Section Header

struct SectionHeader: View {
    let title: String
    let subtitle: String
    let icon: String
    let tint: Color

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SmallSquareBadge(systemImage: icon, tint: tint)
        }
    }
}

// MARK: - Badges

struct SmallSquareBadge: View {
    let systemImage: String
    let tint: Color

    var body: some View {
        RoundedRectangle(cornerRadius: 13, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [tint.opacity(0.12), tint.opacity(0.06)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 44, height: 44)
            .overlay {
                Image(systemName: systemImage)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(tint)
            }
    }
}

struct SquareIconBadge: View {
    let systemImage: String
    let tint: Color

    var body: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [tint.opacity(0.10), tint.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 72, height: 72)
            .overlay {
                Image(systemName: systemImage)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(tint)
            }
    }
}

// MARK: - Buttons

struct SmallActionButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))

                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(tint.opacity(0.10))
            )
        }
        .buttonStyle(.plain)
    }
}

struct PrimaryCTAButton: View {
    let title: String
    let systemImage: String
    var isDisabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Text(title)
                    .font(.system(size: 17, weight: .bold))

                Image(systemName: systemImage)
                    .font(.system(size: 17, weight: .bold))
            }
            .foregroundStyle(Color.white.opacity(isDisabled ? 0.7 : 1))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(
                LinearGradient(
                    colors: isDisabled
                        ? [SabqTheme.secondaryInk.opacity(0.4), SabqTheme.secondaryInk.opacity(0.3)]
                        : [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
            )
            .shadow(color: isDisabled ? .clear : SabqTheme.primaryEnd.opacity(0.25), radius: 12, x: 0, y: 6)
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
    }
}

// MARK: - Chips

struct CategoryChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(isSelected ? .white : SabqTheme.secondaryInk)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(
                    Capsule(style: .continuous)
                        .fill(
                            isSelected
                                ? AnyShapeStyle(SabqTheme.brandGradient)
                                : AnyShapeStyle(SabqTheme.paleFill)
                        )
                )
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(
                            isSelected ? Color.clear : SabqTheme.outline.opacity(0.6),
                            lineWidth: 0.5
                        )
                )
        }
        .buttonStyle(.plain)
    }
}

struct StatusChip: View {
    let title: String
    let tint: Color

    var body: some View {
        Text(title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(
                Capsule(style: .continuous)
                    .fill(tint.opacity(0.10))
            )
    }
}

// MARK: - Featured Article Card

struct FeaturedArticleCard: View {
    let article: Article
    let onBookmark: () -> Void
    let isBookmarked: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                if let urlString = article.imageURL, let url = URL(string: urlString) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        articleImagePlaceholder
                            .overlay {
                                ProgressView()
                                    .tint(SabqTheme.primaryEnd)
                            }
                    }
                    .frame(height: 200)
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: SabqTheme.cardRadius,
                            bottomLeadingRadius: 0,
                            bottomTrailingRadius: 0,
                            topTrailingRadius: SabqTheme.cardRadius,
                            style: .continuous
                        )
                    )
                } else {
                    articleImagePlaceholder
                }

                // Category badge + author chip removed from the carousel
                // image overlay per user direction (2026-05-15). Category and
                // byline still appear in the article detail; the carousel
                // card now leads with the hero photo + title alone for a
                // cleaner, more editorial look.
            }

            VStack(alignment: .leading, spacing: 12) {
                Text(article.title)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(4)

                Text(article.excerpt)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(3)

                HStack(spacing: 12) {
                    HStack(spacing: 5) {
                        Image(systemName: "clock")
                            .font(.system(size: 12, weight: .medium))
                        Text(article.readingTime)
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .monospacedDigit()
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)

                    HStack(spacing: 5) {
                        Image(systemName: "calendar")
                            .font(.system(size: 12, weight: .medium))
                        Text(article.dateFormatted)
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)

                    Spacer(minLength: 0)

                    Button {
                        SabqHaptics.light()
                        onBookmark()
                    } label: {
                        Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(isBookmarked ? SabqTheme.primaryEnd : SabqTheme.tertiaryInk)
                            .scaleEffect(isBookmarked ? 1.15 : 1)
                            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: isBookmarked)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(20)
        }
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
                .shadow(color: SabqTheme.deepShadow, radius: 1, x: 0, y: 1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    private var articleImagePlaceholder: some View {
        UnevenRoundedRectangle(
            topLeadingRadius: SabqTheme.cardRadius,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: SabqTheme.cardRadius,
            style: .continuous
        )
        .fill(
            LinearGradient(
                colors: [article.category.tint.opacity(0.15), article.category.tint.opacity(0.05)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .frame(height: 200)
        .overlay {
            Image(systemName: article.category.icon)
                .font(.system(size: 80, weight: .ultraLight))
                .foregroundStyle(article.category.tint.opacity(0.15))
        }
    }
}

// MARK: - Compact Article Row

struct CompactArticleRow: View {
    let article: Article
    let onBookmark: () -> Void
    let isBookmarked: Bool

    // Reader can flip between the legacy thumbnail-on-the-side layout
    // ("classic") and the experimental image-on-top hero layout
    // ("spacious") from Settings → العرض. Default is "classic" — the
    // spacious variant took too much vertical real estate and was rolled
    // back. Kept as an opt-in until we can iterate on density.
    @AppStorage("homeCardStyle") private var styleRaw: String = "classic"

    private var isSpacious: Bool { styleRaw == "spacious" }

    var body: some View {
        if isSpacious {
            spaciousLayout
        } else {
            classicLayout
        }
    }

    // MARK: - Classic (thumbnail on the side, original design)

    private var classicLayout: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    StatusChip(title: article.category.title, tint: article.category.tint)
                    if article.isBreaking { breakingPill }
                }

                Text(article.title)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(3)

                metadataRow
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let urlString = article.imageURL, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    thumbnailPlaceholder(size: 84)
                }
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                thumbnailPlaceholder(size: 84)
            }
        }
        .padding(.vertical, 6)
    }

    // MARK: - Spacious (image on top, 16:10 hero)

    private var spaciousLayout: some View {
        VStack(alignment: .leading, spacing: 12) {
            heroImage

            Text(article.title)
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .lineSpacing(4)

            metadataRow
        }
        .padding(.vertical, 8)
    }

    private var heroImage: some View {
        ZStack(alignment: .topLeading) {
            // 16:10 container — full row width. CachedAsyncImage fills.
            Color.clear
                .aspectRatio(16.0 / 10.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay(
                    Group {
                        if let urlString = article.imageURL, let url = URL(string: urlString) {
                            CachedAsyncImage(url: url, contentMode: .fill) {
                                heroPlaceholder
                            }
                        } else {
                            heroPlaceholder
                        }
                    }
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            HStack(spacing: 6) {
                if article.isBreaking { breakingPill }
                StatusChip(title: article.category.title, tint: article.category.tint)
            }
            .padding(10)
        }
    }

    private var heroPlaceholder: some View {
        LinearGradient(
            colors: [article.category.tint.opacity(0.14), article.category.tint.opacity(0.04)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay {
            Image(systemName: article.category.icon)
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(article.category.tint.opacity(0.5))
        }
    }

    // MARK: - Shared sub-views

    private var breakingPill: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(SabqTheme.coral)
                .frame(width: 6, height: 6)
            Text("عاجل")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(SabqTheme.coral)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            Capsule(style: .continuous)
                .fill(SabqTheme.coral.opacity(0.10))
        )
    }

    private var metadataRow: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                Image(systemName: "clock")
                    .font(.system(size: 11, weight: .medium))
                Text(article.readingTime)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .monospacedDigit()
            }
            .foregroundStyle(SabqTheme.tertiaryInk)

            Text(article.relativeDate)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)

            Spacer(minLength: 0)

            Button {
                SabqHaptics.light()
                onBookmark()
            } label: {
                Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isBookmarked ? SabqTheme.primaryEnd : SabqTheme.tertiaryInk)
                    .scaleEffect(isBookmarked ? 1.1 : 1)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isBookmarked)
            }
            .buttonStyle(.plain)
        }
    }

    private func thumbnailPlaceholder(size: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [article.category.tint.opacity(0.12), article.category.tint.opacity(0.04)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: size, height: size)
            .overlay {
                Image(systemName: article.category.icon)
                    .font(.system(size: size * 0.33, weight: .light))
                    .foregroundStyle(article.category.tint.opacity(0.6))
            }
    }
}

// MARK: - Category Tile

struct CategoryTile: View {
    let category: ArticleCategory
    let action: () -> Void

    // `articleCount` was removed per user request — the prominent number
    // felt noisy and dominated the tile. Kept the initializer overload
    // below for backwards compatibility with older call sites that still
    // pass a count; we just ignore it.
    init(category: ArticleCategory, action: @escaping () -> Void) {
        self.category = category
        self.action = action
    }

    init(category: ArticleCategory, articleCount: Int, action: @escaping () -> Void) {
        self.category = category
        self.action = action
        _ = articleCount
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    SmallSquareBadge(systemImage: category.icon, tint: category.tint)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.left")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(category.tint.opacity(0.6))
                        .padding(.top, 6)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(category.title)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)

                    Text(category.subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                category.tint.opacity(0.08),
                                SabqTheme.surface,
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .shadow(color: SabqTheme.shadow, radius: 8, x: 0, y: 3)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .stroke(category.tint.opacity(0.18), lineWidth: 0.6)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Empty State

struct EmptyStateView: View {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String
    var action: (() -> Void)? = nil
    var actionTitle: String? = nil

    @State private var isAnimating = false

    var body: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [tint.opacity(0.12), tint.opacity(0.03)],
                            center: .center,
                            startRadius: 20,
                            endRadius: 60
                        )
                    )
                    .frame(width: 120, height: 120)
                    .scaleEffect(isAnimating ? 1.05 : 0.95)
                    .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: isAnimating)

                Image(systemName: icon)
                    .font(.system(size: 42, weight: .semibold))
                    .foregroundStyle(tint)
                    .symbolEffect(.pulse, isActive: isAnimating)
            }

            VStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.center)

                Text(subtitle)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .frame(maxWidth: 300)
            }

            if let action, let actionTitle {
                Button {
                    SabqHaptics.light()
                    action()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 14, weight: .semibold))
                        Text(actionTitle)
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(tint)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(
                        Capsule(style: .continuous)
                            .fill(tint.opacity(0.10))
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .onAppear { isAnimating = true }
    }
}

// MARK: - Error State

struct ErrorStateView: View {
    let message: String
    var retryAction: (() -> Void)?

    var body: some View {
        EmptyStateView(
            icon: "wifi.exclamationmark",
            tint: SabqTheme.coral,
            title: "حدث خطأ",
            subtitle: message,
            action: retryAction,
            actionTitle: "إعادة المحاولة"
        )
    }
}

// MARK: - Tab Bar

// Floating-capsule TabBar redesigned around 4 tabs (was 5).
// Aesthetic mirrors the Passport sheet calmness the user pointed at as
// reference: ultraThinMaterial container, generous breathing room, an
// accent-tinted pill that slides under the selected tab via
// matchedGeometryEffect. The selected tab keeps its label visible; idle tabs
// shrink to icon-only so the bar feels light, not crowded.
struct SabqTabBar: View {
    @Binding var selectedTab: AppTab
    /// Fires on every tap, even when the tap targets the already-selected
    /// tab. ContentView uses this hook to empty its `navigationPath`
    /// (pop-to-root behaviour) — `.onChange(of: selectedTab)` alone
    /// wouldn't fire when the value doesn't change, which is exactly the
    /// case when the user is deep inside a pushed view of the Home tab
    /// and taps Home again hoping to escape.
    var onSelect: ((AppTab) -> Void)? = nil
    @Namespace private var selectionNamespace

    private let tabs: [AppTab] = [.home, .explore, .bookmarks, .profile]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(tabs) { tab in
                let isSelected = selectedTab == tab
                Button {
                    SabqHaptics.light()
                    onSelect?(tab)
                    if selectedTab != tab {
                        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                            selectedTab = tab
                        }
                    }
                } label: {
                    tabLabel(tab: tab, isSelected: isSelected)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(
            Capsule(style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(SabqTheme.outline.opacity(0.30), lineWidth: 0.5)
                )
                .shadow(color: SabqTheme.deepShadow.opacity(0.35), radius: 18, x: 0, y: -2)
                .shadow(color: SabqTheme.shadow, radius: 36, x: 0, y: 8)
        )
    }

    @ViewBuilder
    private func tabLabel(tab: AppTab, isSelected: Bool) -> some View {
        let tint = SabqTheme.primaryEnd
        HStack(spacing: 6) {
            Image(systemName: isSelected ? tab.selectedImage : tab.systemImage)
                .font(.system(size: 17, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(isSelected ? tint : SabqTheme.tertiaryInk)

            if isSelected {
                Text(tab.title)
                    .font(.system(size: 12.5, weight: .bold))
                    .foregroundStyle(tint)
                    // Without these, "استكشاف" wraps onto a second line
                    // inside the narrower active capsule on 6.1" devices.
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .move(edge: .leading)),
                        removal: .opacity
                    ))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity)
        .background {
            if isSelected {
                Capsule(style: .continuous)
                    .fill(tint.opacity(0.14))
                    .matchedGeometryEffect(id: "selectionPill", in: selectionNamespace)
            }
        }
        .contentShape(Capsule(style: .continuous))
    }
}

// MARK: - Search Bar

struct SabqSearchBar: View {
    @Binding var text: String
    let placeholder: String
    var onSubmit: (() -> Void)?
    var focusState: FocusState<Bool>.Binding?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(text.isEmpty ? SabqTheme.primaryEnd.opacity(0.5) : SabqTheme.primaryEnd)
                .animation(.easeInOut(duration: 0.2), value: text.isEmpty)

            textField

            if !text.isEmpty {
                Button {
                    withAnimation(.easeOut(duration: 0.15)) {
                        text = ""
                    }
                    SabqHaptics.light()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .buttonStyle(.plain)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    // Soft tint over the material so the bar reads warm in
                    // light mode and adapts in dark — calmer than pure glass.
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(SabqTheme.paleFill.opacity(0.35))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.40), lineWidth: 0.5)
        )
        .animation(.easeInOut(duration: 0.2), value: !text.isEmpty)
    }

    @ViewBuilder
    private var textField: some View {
        let field = TextField(placeholder, text: $text)
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(SabqTheme.ink)
            .multilineTextAlignment(.leading)
            .onSubmit { onSubmit?() }

        if let focusState {
            field.focused(focusState)
        } else {
            field
        }
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth, currentX > 0 {
                currentY += rowHeight + spacing
                currentX = 0
                rowHeight = 0
            }
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: maxWidth, height: currentY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX: CGFloat = bounds.minX
        var currentY: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX, currentX > bounds.minX {
                currentY += rowHeight + spacing
                currentX = bounds.minX
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
