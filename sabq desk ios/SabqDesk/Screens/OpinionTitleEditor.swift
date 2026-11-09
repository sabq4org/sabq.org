import SwiftUI
import SabqDeskDesign
import SabqDeskKit

/// The opinion card's title line. For a draft the member may schedule it shows
/// a pencil; tapping it swaps the title for a field with «حفظ» and «إلغاء».
/// After a desk edit the card carries the «عُدّل العنوان» mark.
struct OpinionTitleRow: View {
    let article: StaffOpinionArticle
    let canEdit: Bool
    let onPreview: () -> Void
    /// Saves the new title; returns an error message, or nil on success.
    let onSave: (String) async -> String?

    @State private var isEditing = false
    @State private var draft = ""
    @State private var isSaving = false
    @State private var errorText: String?
    @FocusState private var fieldFocused: Bool

    private static let maxLength = 200
    private static let minLength = 5

    private var cleaned: String {
        draft.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
    }

    private var canSave: Bool {
        !isSaving && cleaned.count >= Self.minLength && cleaned.count <= Self.maxLength && cleaned != article.title
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if isEditing {
                editor
            } else {
                display
            }
        }
        .animation(.easeInOut(duration: 0.18), value: isEditing)
    }

    // MARK: Display

    private var display: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: DeskLayout.space8) {
                Button(action: onPreview) {
                    Text(article.title)
                        .font(DeskFonts.app(size: 15, weight: .semibold, relativeTo: .subheadline))
                        .lineSpacing(4)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityHint("يفتح استعراض المقال")

                if canEdit {
                    Button(action: startEditing) {
                        Image(systemName: "pencil")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(DeskInk.link)
                            .frame(width: 32, height: 32)
                            .background(DeskInk.soft, in: Circle())
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, -6)
                    .padding(.trailing, -6)
                    .accessibilityLabel("تعديل العنوان")
                }
            }
            if article.titleEdited == true {
                StatusChip(title: "عُدّل العنوان", tone: .info, systemImage: "pencil")
                    .fixedSize()
            }
        }
    }

    // MARK: Editor

    private var editor: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            TextField("عنوان المقال", text: $draft, axis: .vertical)
                .font(DeskFonts.app(size: 15, weight: .semibold, relativeTo: .subheadline))
                .foregroundStyle(DeskTheme.textPrimary)
                .lineLimit(1...4)
                .focused($fieldFocused)
                .submitLabel(.done)
                .disabled(isSaving)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(DeskTheme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(fieldFocused ? DeskInk.action : DeskTheme.outline, lineWidth: fieldFocused ? 1.5 : 1))
                .onChange(of: draft) { _, value in
                    // «تم» على لوحة المفاتيح يضيف سطرًا في الحقل الرأسي: العنوان سطر واحد.
                    if value.contains(where: \.isNewline) {
                        draft = value.replacingOccurrences(of: "\n", with: " ")
                        fieldFocused = false
                    }
                }
                .accessibilityLabel("عنوان المقال")

            HStack(spacing: DeskLayout.space8) {
                Text("\(cleaned.count) / \(Self.maxLength)")
                    .font(DeskFonts.app(size: 11, weight: .regular, relativeTo: .caption2))
                    .monospacedDigit()
                    .foregroundStyle(cleaned.count > Self.maxLength ? DeskTheme.danger : DeskTheme.textTertiary)
                    .environment(\.layoutDirection, .leftToRight)
                    .accessibilityLabel("\(cleaned.count) من \(Self.maxLength) حرفًا")
                Spacer(minLength: DeskLayout.space4)
                Button("إلغاء", action: cancel)
                    .buttonStyle(OpinionTitleButtonStyle(isPrimary: false))
                    .disabled(isSaving)
                Button(action: { Task { await save() } }) {
                    if isSaving {
                        ProgressView().tint(.white)
                    } else {
                        Text("حفظ")
                    }
                }
                .buttonStyle(OpinionTitleButtonStyle(isPrimary: true))
                .disabled(!canSave)
            }

            if let errorText {
                Text(errorText)
                    .font(DeskFonts.app(size: 12, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(DeskTheme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: Actions

    private func startEditing() {
        draft = article.title
        errorText = nil
        isEditing = true
        fieldFocused = true
    }

    private func cancel() {
        fieldFocused = false
        errorText = nil
        isEditing = false
    }

    private func save() async {
        guard canSave else { return }
        isSaving = true
        errorText = nil
        let failure = await onSave(cleaned)
        isSaving = false
        if let failure {
            errorText = failure
        } else {
            fieldFocused = false
            isEditing = false
        }
    }
}

/// Compact pills for the title editor: filled Sabq blue «حفظ», grey «إلغاء».
private struct OpinionTitleButtonStyle: ButtonStyle {
    let isPrimary: Bool
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(DeskFonts.app(size: 13, weight: .semibold, relativeTo: .footnote))
            .lineLimit(1)
            .foregroundStyle(ink)
            .padding(.horizontal, 18)
            .frame(minWidth: 72, minHeight: 40)
            .background(fill, in: Capsule())
            .opacity(configuration.isPressed ? 0.85 : 1)
    }

    private var ink: Color {
        guard isEnabled else { return DeskTheme.disabledInk }
        return isPrimary ? .white : DeskTheme.textPrimary
    }

    private var fill: Color {
        guard isEnabled else { return DeskTheme.disabledFill }
        return isPrimary ? DeskInk.action : DeskInk.chip
    }
}
