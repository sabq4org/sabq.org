import SwiftUI

/// Multi-line text composer + send button for a single comment submission.
/// Drives `CommentsStore.submit`. Surfaces inline:
///   - character counter (turns warning then error near the limit)
///   - disabled-state for blank / over-limit / in-flight
///   - "replying to X" pill the user can dismiss
/// Auth gating (is the user logged in?) is the parent view's responsibility —
/// this composer assumes it is only visible when the user can in fact post.
struct CommentComposer: View {
    @Environment(\.colorScheme) private var colorScheme
    @Bindable var store: CommentsStore

    /// Local text buffer; cleared on successful publish/awaiting-review.
    @State private var text: String = ""
    @FocusState private var focused: Bool

    /// Callback fired after a non-throwing submit so the parent can show a toast.
    /// We return the outcome (published vs awaiting review) to the parent rather
    /// than reading it from the store to keep the parent's toast logic
    /// declarative.
    var onSubmit: (CommentsStore.SubmitOutcome) -> Void = { _ in }
    /// Surfaced auth-required so the parent can present its login sheet.
    var onAuthRequired: () -> Void = {}
    var onError: (String) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let parent = store.replyingTo {
                replyChip(parent: parent)
            }

            HStack(alignment: .bottom, spacing: 10) {
                composerField
                sendButton
            }

            counterRow
        }
    }

    private var composerField: some View {
        TextField(
            store.replyingTo == nil ? "اكتب تعليقك…" : "اكتب ردك…",
            text: $text,
            axis: .vertical
        )
        .lineLimit(1...6)
        .font(SabqFonts.app(size: 15, weight: .medium))
        .foregroundStyle(SabqTheme.ink)
        .focused($focused)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(SabqTheme.paleFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(focused ? 0.6 : 0.3), lineWidth: 0.5)
        )
    }

    private var sendButton: some View {
        Button {
            Task { await submit() }
        } label: {
            if store.isSubmitting {
                ProgressView()
                    .progressViewStyle(.circular)
                    .frame(width: 32, height: 32)
            } else {
                Image(systemName: "paperplane.fill")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(
                        Circle().fill(isDisabled ? SabqTheme.tertiaryInk : SabqTheme.primaryEnd)
                    )
                    .rotationEffect(.degrees(180))
            }
        }
        .buttonStyle(.plain)
        .disabled(isDisabled || store.isSubmitting)
        .animation(.easeOut(duration: 0.15), value: isDisabled)
    }

    private var counterRow: some View {
        HStack(spacing: 6) {
            Spacer(minLength: 0)
            Text("\(text.count) / \(CommentsStore.maxLength)")
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(counterColor)
                .monospacedDigit()
        }
    }

    private func replyChip(parent: APIComment) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "arrowshape.turn.up.left.fill")
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
            Text("ترد على \(parent.userName ?? "تعليق")")
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(1)
            Spacer(minLength: 4)
            Button {
                store.replyingTo = nil
            } label: {
                Image(systemName: "xmark")
                    .font(SabqFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .padding(6)
                    .background(Circle().fill(SabqTheme.paleFill))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(SabqTheme.primaryEnd.opacity(0.08))
        )
    }

    // MARK: - Helpers

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isDisabled: Bool {
        trimmed.isEmpty || text.count > CommentsStore.maxLength
    }

    private var counterColor: Color {
        if text.count > CommentsStore.maxLength { return .red }
        if text.count > Int(Double(CommentsStore.maxLength) * 0.9) {
            return .orange
        }
        return SabqTheme.tertiaryInk
    }

    private func submit() async {
        do {
            let outcome = try await store.submit(content: text, parentId: store.replyingTo?.id)
            text = ""
            focused = false
            SabqHaptics.success()
            onSubmit(outcome)
        } catch APIError.unauthorized {
            SabqHaptics.error()
            onAuthRequired()
        } catch let api as APIError {
            SabqHaptics.error()
            onError(api.errorDescription ?? "تعذر إرسال التعليق")
        } catch let custom as CommentsError {
            SabqHaptics.error()
            onError(custom.errorDescription ?? "تعذر إرسال التعليق")
        } catch {
            SabqHaptics.error()
            onError("تعذر إرسال التعليق")
        }
    }
}
