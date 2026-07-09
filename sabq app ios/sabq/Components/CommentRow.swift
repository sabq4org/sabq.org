import SwiftUI

/// Collects each nested reply row's frame in the parent's coordinate space so
/// the thread-line overlay can draw a single connected path from the parent's
/// avatar down to each reply's avatar.
private struct ReplyFrameKey: PreferenceKey {
    static var defaultValue: [CGRect] = []
    static func reduce(value: inout [CGRect], nextValue: () -> [CGRect]) {
        value.append(contentsOf: nextValue())
    }
}

/// A single comment plus its replies (one level deep). Top-level rows nest
/// their replies inline; replies themselves do NOT recurse — they render flat
/// without a further reply button, matching the web app's UX.
struct CommentRow: View {
    let comment: APIComment
    let depth: Int
    var onReply: ((APIComment) -> Void)? = nil

    init(comment: APIComment, depth: Int = 0, onReply: ((APIComment) -> Void)? = nil) {
        self.comment = comment
        self.depth = depth
        self.onReply = onReply
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            bodyText
            footer

            if !comment.replies.isEmpty {
                repliesStack
            }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .coordinateSpace(name: rowSpaceName)
        .overlayPreferenceValue(ReplyFrameKey.self) { frames in
            if !frames.isEmpty {
                ThreadLineOverlay(replyFrames: frames)
                    .allowsHitTesting(false)
            }
        }
    }

    private var rowSpaceName: String { "commentRowSpace-\(comment.id)" }

    private var repliesStack: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(comment.replies) { reply in
                CommentRow(comment: reply, depth: depth + 1)
                    .background(
                        GeometryReader { geo in
                            Color.clear.preference(
                                key: ReplyFrameKey.self,
                                value: [geo.frame(in: .named(rowSpaceName))]
                            )
                        }
                    )
            }
        }
        .padding(.leading, 38)
        .padding(.top, 4)
    }

    private var header: some View {
        HStack(spacing: 10) {
            avatar
            VStack(alignment: .leading, spacing: 2) {
                Text(comment.userName ?? "مستخدم")
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)

                Text(Self.relativeTime(comment.createdAt))
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            Spacer(minLength: 0)
        }
    }

    private var avatar: some View {
        Group {
            if let urlString = comment.userAvatar,
               let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        initialsCircle
                    }
                }
                .frame(width: 32, height: 32)
                .clipShape(Circle())
            } else {
                initialsCircle
            }
        }
    }

    private var initialsCircle: some View {
        Circle()
            .fill(SabqTheme.primaryEnd.opacity(0.15))
            .frame(width: 32, height: 32)
            .overlay {
                Text(String((comment.userName ?? "م").prefix(1)))
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    private var bodyText: some View {
        Text(comment.body)
            .font(SabqFonts.app(size: 14.5, weight: .regular))
            .foregroundStyle(SabqTheme.secondaryInk)
            .lineSpacing(4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 42)
    }

    private var footer: some View {
        HStack(spacing: 10) {
            // Reply is only shown for top-level rows; one-level threading
            // matches the backend's flat-replies-under-parent shape from
            // `getCommentsByArticle` in storage.ts.
            if depth == 0, let onReply {
                Button {
                    SabqHaptics.light()
                    onReply(comment)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrowshape.turn.up.left")
                            .font(SabqFonts.app(size: 11, weight: .regular))
                        Text("رد")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                }
                .buttonStyle(.plain)
            }

            if let pending = comment.status?.lowercased(), pending == "pending" {
                HStack(spacing: 4) {
                    Image(systemName: "sparkles")
                        .font(SabqFonts.app(size: 9, weight: .medium))
                    Text("SABQ AI يراجع")
                        .font(SabqFonts.app(size: 10, weight: .medium))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    Capsule().fill(
                        LinearGradient(
                            colors: [SabqTheme.primaryEnd, SabqTheme.teal],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                )
            }
            Spacer(minLength: 0)
        }
        .padding(.leading, 42)
    }

    // MARK: - Relative-time formatter

    /// Pretty-prints an ISO-8601 backend timestamp into Arabic relative time
    /// ("قبل 3 دقائق", "أمس", "قبل أسبوع"). Falls back to the raw string when
    /// parsing fails so we never silently render an empty timestamp.
    private static func relativeTime(_ raw: String) -> String {
        guard let date = Self.parseISO(raw) else { return raw }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        formatter.locale = Locale(identifier: "ar")
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private static let isoFormatters: [ISO8601DateFormatter] = {
        let a = ISO8601DateFormatter()
        a.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let b = ISO8601DateFormatter()
        b.formatOptions = [.withInternetDateTime]
        return [a, b]
    }()

    private static func parseISO(_ raw: String) -> Date? {
        for f in isoFormatters {
            if let d = f.date(from: raw) { return d }
        }
        return nil
    }
}

/// Draws a single connected thread guide that emerges from under the parent
/// row's avatar and curves into each reply's avatar.
///
/// Geometry constants — distances measured from the row's **leading** edge so
/// the same numbers work in LTR and RTL. SwiftUI's `Canvas` always uses
/// LTR pixel coordinates, so we read `layoutDirection` and mirror the X
/// coordinates against `size.width` when the surrounding layout is RTL
/// (which is the default for this app via `.sabqRTL()`).
///
///   - the row has `.padding(.vertical, 10)` so the header starts at y=10
///   - the avatar is 32×32, so its center is at y=26 and bottom at y=42
///   - the avatar's leading-edge offset is 16 (HStack starts at the
///     leading edge, avatar width 32, center at 16)
///   - replies VStack adds `.padding(.leading, 38)` so reply avatars start
///     38pt in from the leading edge
private struct ThreadLineOverlay: View {
    @Environment(\.layoutDirection) private var layoutDirection
    let replyFrames: [CGRect]

    private let trunkFromLeading: CGFloat = 16
    private let trunkStartY: CGFloat = 42
    private let avatarEdgeFromLeading: CGFloat = 38
    private let avatarCenterYOffset: CGFloat = 26
    private let cornerRadius: CGFloat = 8

    var body: some View {
        Canvas { context, size in
            guard !replyFrames.isEmpty else { return }
            let centerYs = replyFrames.map { $0.minY + avatarCenterYOffset }
            guard let lastY = centerYs.last else { return }

            // In RTL, "leading" is the right edge — mirror all X coordinates
            // against the canvas width. The `dir` sign also flips the elbow
            // arc so it curves the same direction relative to the trunk.
            let isRTL = layoutDirection == .rightToLeft
            let trunkX = isRTL ? size.width - trunkFromLeading : trunkFromLeading
            let avatarEdgeX = isRTL ? size.width - avatarEdgeFromLeading : avatarEdgeFromLeading
            let dir: CGFloat = isRTL ? -1 : 1

            let stroke = GraphicsContext.Shading.color(SabqTheme.outline.opacity(0.55))

            // Trunk: from the parent's avatar bottom down to where the LAST
            // reply's elbow starts curving. Intermediate elbows are drawn
            // separately and the trunk passes straight through their corner
            // points, which is the conventional thread-tree look.
            var trunk = Path()
            trunk.move(to: CGPoint(x: trunkX, y: trunkStartY))
            trunk.addLine(to: CGPoint(x: trunkX, y: max(trunkStartY, lastY - cornerRadius)))
            context.stroke(trunk, with: stroke, lineWidth: 1.5)

            for y in centerYs {
                var branch = Path()
                branch.move(to: CGPoint(x: trunkX, y: y - cornerRadius))
                branch.addQuadCurve(
                    to: CGPoint(x: trunkX + cornerRadius * dir, y: y),
                    control: CGPoint(x: trunkX, y: y)
                )
                // Stop the stub 2pt shy of the avatar's outer edge so the
                // line doesn't visually touch the circle.
                branch.addLine(to: CGPoint(x: avatarEdgeX - 2 * dir, y: y))
                context.stroke(branch, with: stroke, lineWidth: 1.5)
            }
        }
    }
}
