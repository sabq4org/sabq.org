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
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            if let parent = store.replyingTo {
                replyChip(parent: parent)
            }

            HStack(alignment: .bottom, spacing: SabqLayout.space8) {
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
        .font(SabqType.excerpt.font)
        .foregroundStyle(SabqTheme.textPrimary)
        .focused($focused)
        .modifier(SabqInputSurface())
        // التركيز صريح: حد بلون الروابط فوق حد الحقل.
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(SabqTheme.primary, lineWidth: focused ? 1.5 : 0)
        )
    }

    private var sendButton: some View {
        Button {
            Task { await submit() }
        } label: {
            if store.isSubmitting {
                ProgressView()
                    .progressViewStyle(.circular)
                    .frame(width: SabqLayout.controlHeight, height: SabqLayout.controlHeight)
            } else {
                Image(systemName: "paperplane.fill")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(isDisabled ? SabqTheme.disabledInk : SabqTheme.onAction)
                    .rotationEffect(.degrees(180))
                    .frame(width: SabqLayout.controlHeight, height: SabqLayout.controlHeight)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(isDisabled ? SabqTheme.disabledFill : SabqTheme.actionFill)
                    )
            }
        }
        .buttonStyle(.plain)
        .disabled(isDisabled || store.isSubmitting)
        .animation(.easeOut(duration: 0.15), value: isDisabled)
    }

    private var counterRow: some View {
        HStack(spacing: SabqLayout.space8) {
            Spacer(minLength: 0)
            Text("\(text.count) / \(CommentsStore.maxLength)")
                .font(SabqType.tag.font)
                .foregroundStyle(counterColor)
                .monospacedDigit()
        }
    }

    private func replyChip(parent: APIComment) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "arrowshape.turn.up.left.fill")
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.primary)
                .accessibilityHidden(true)
            Text("ترد على \(parent.userName ?? "تعليق")")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1)
            Spacer(minLength: SabqLayout.space4)
            Button {
                store.replyingTo = nil
            } label: {
                Image(systemName: "xmark")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, SabqLayout.space12)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
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
        if text.count > CommentsStore.maxLength { return SabqTheme.danger }
        if text.count > Int(Double(CommentsStore.maxLength) * 0.9) {
            return SabqTheme.warning
        }
        return SabqTheme.textTertiary
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
