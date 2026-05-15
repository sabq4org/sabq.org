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
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                Text(Self.relativeTime(comment.createdAt))
                    .font(.system(size: 11.5, weight: .medium))
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
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    private var bodyText: some View {
        Text(comment.body)
            .font(.system(size: 14.5, weight: .regular))
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
                            .font(.system(size: 11, weight: .semibold))
                        Text("رد")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                }
                .buttonStyle(.plain)
            }

            if let pending = comment.status?.lowercased(), pending == "pending" {
                HStack(spacing: 4) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 9, weight: .bold))
                    Text("SABQ AI يراجع")
                        .font(.system(size: 10.5, weight: .bold))
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
/// Geometry constants depend on the parent row's internal layout:
///   - the row has `.padding(.vertical, 10)` so the header starts at y=10
///   - the avatar is 32×32, so its center is at y=26 and bottom at y=42
///   - the avatar's horizontal center is x=16 (HStack starts at x=0)
///   - replies VStack adds `.padding(.leading, 38)` so reply avatars start
///     at x=38 inside the shared `commentRowSpace` coordinate
private struct ThreadLineOverlay: View {
    let replyFrames: [CGRect]

    private let trunkX: CGFloat = 16
    private let trunkStartY: CGFloat = 42
    private let avatarEdgeX: CGFloat = 38
    private let avatarCenterYOffset: CGFloat = 26
    private let cornerRadius: CGFloat = 8

    var body: some View {
        Canvas { context, _ in
            guard !replyFrames.isEmpty else { return }
            let centerYs = replyFrames.map { $0.minY + avatarCenterYOffset }
            guard let lastY = centerYs.last else { return }

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
                    to: CGPoint(x: trunkX + cornerRadius, y: y),
                    control: CGPoint(x: trunkX, y: y)
                )
                branch.addLine(to: CGPoint(x: avatarEdgeX - 2, y: y))
                context.stroke(branch, with: stroke, lineWidth: 1.5)
            }
        }
    }
}
