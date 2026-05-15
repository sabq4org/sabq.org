import SwiftUI

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
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(comment.replies) { reply in
                        CommentRow(comment: reply, depth: depth + 1)
                    }
                }
                .padding(.top, 4)
                .padding(.leading, 38)
                .overlay(alignment: .leading) {
                    // Vertical thread guide line so it's visually clear the
                    // replies belong to the parent comment.
                    Rectangle()
                        .fill(SabqTheme.outline.opacity(0.5))
                        .frame(width: 2)
                        .padding(.leading, 16)
                }
            }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
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
                Text("قيد المراجعة")
                    .font(.system(size: 10.5, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule().fill(Color.orange)
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
