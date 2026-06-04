import SwiftUI

// MARK: - Admin article editor
//
// Simplified, mock-backed editor reached from a news row's "تعديل" action.
// It's a pure form: it seeds its fields from the passed item and hands the
// edited copy back through `onSave`. Persistence + refresh are owned by
// `AdminDashboardViewModel.applyEdit(_:)`, so this view stays dumb and
// reusable once a real API is wired in.
struct AdminArticleEditorView: View {
    let item: AdminNewsItem
    let onSave: (AdminNewsItem) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var excerpt: String
    @State private var bodyText: String
    @State private var status: AdminArticleStatus

    init(item: AdminNewsItem, onSave: @escaping (AdminNewsItem) -> Void) {
        self.item = item
        self.onSave = onSave
        _title = State(initialValue: item.title)
        _excerpt = State(initialValue: item.excerpt)
        _bodyText = State(initialValue: item.body)
        _status = State(initialValue: item.status)
    }

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                field("العنوان") {
                    TextField("عنوان الخبر", text: $title, axis: .vertical)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }

                field("المقتطف") {
                    TextField("مقتطف موجز للخبر", text: $excerpt, axis: .vertical)
                        .font(.system(size: 14))
                        .foregroundStyle(SabqTheme.ink)
                        .lineLimit(2...4)
                }

                field("نص الخبر") {
                    TextEditor(text: $bodyText)
                        .font(.system(size: 15))
                        .foregroundStyle(SabqTheme.ink)
                        .frame(minHeight: 180)
                        .scrollContentBackground(.hidden)
                        .multilineTextAlignment(.leading)
                }

                VStack(alignment: .leading, spacing: 8) {
                    fieldLabel("الحالة")
                    AdminSegmentedControl(selected: status) { status = $0 }
                }

                saveButton
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 60)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("تعديل الخبر")
        .navigationBarTitleDisplayMode(.inline)
        .sabqScreen("AdminArticleEditor")
    }

    // MARK: Save

    private var saveButton: some View {
        Button {
            var updated = item
            updated.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
            updated.excerpt = excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
            updated.body = bodyText
            updated.status = status
            onSave(updated)
            dismiss()
        } label: {
            Text("حفظ التعديلات")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(
                    SabqTheme.brandGradient,
                    in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                )
                .opacity(isValid ? 1 : 0.5)
        }
        .buttonStyle(.plain)
        .disabled(!isValid)
        .padding(.top, 4)
    }

    // MARK: Field helpers

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(SabqTheme.secondaryInk)
    }

    @ViewBuilder
    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            fieldLabel(label)
            content()
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5)
                )
        }
    }
}
