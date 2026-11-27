import SwiftUI

/// «جملة المقال» و«أوافق / لا أوافق» في أدوات الكاتب، نظير
/// OpinionExtrasEditorPanel في الويب. القيود نفسها في الخادم
/// (shared/opinionReaderExtras.ts)، وهنا تنبيه مبكر فقط.
enum OpinionExtrasRules {
    static let minChars = 15
    static let maxChars = 240

    static func normalized(_ raw: String) -> String {
        raw.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"«»“”'"))
            .trimmingCharacters(in: .whitespaces)
    }

    /// nil = صالحة (أو فارغة).
    static func problem(_ raw: String) -> String? {
        let value = normalized(raw)
        if value.isEmpty { return nil }
        if value.count < minChars { return "العبارة قصيرة جدًا (\(minChars) حرفًا على الأقل)" }
        if value.count > maxChars { return "العبارة طويلة (\(maxChars) حرفًا على الأكثر)" }
        return nil
    }
}

struct OpinionExtrasFields: View {
    @Binding var quote: String
    @Binding var agreeOn: Bool
    var authorName: String?

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "quote.opening")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(SabqTheme.primary.opacity(0.1)))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("جملة المقال")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("عبارة عميقة من مقالك تظهر بطاقةً يشاركها القرّاء صورةً")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }

            ZStack(alignment: .topLeading) {
                TextEditor(text: $quote)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 88)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .padding(SabqLayout.space8)
                if quote.isEmpty {
                    Text("انسخ هنا أقوى عبارة في مقالك…")
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .padding(SabqLayout.space12)
                        .allowsHitTesting(false)
                }
            }
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.surface))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))

            HStack {
                if let problem = OpinionExtrasRules.problem(quote) {
                    Text(problem)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.danger)
                }
                Spacer(minLength: 0)
                Text("\(OpinionExtrasRules.normalized(quote).count)/\(OpinionExtrasRules.maxChars)")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .environment(\.layoutDirection, .leftToRight)
            }

            if !OpinionExtrasRules.normalized(quote).isEmpty, OpinionExtrasRules.problem(quote) == nil {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Image(systemName: "quote.opening")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.brandSky)
                        .accessibilityHidden(true)
                    Text(OpinionExtrasRules.normalized(quote))
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(authorName ?? "اسمك") · كاتب رأي في سبق")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                .padding(SabqLayout.space16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(LinearGradient(
                            colors: [Color(red: 0xE2 / 255, green: 0xF2 / 255, blue: 0xFD / 255),
                                     Color(red: 0xEE / 255, green: 0xF1 / 255, blue: 0xFE / 255)],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                )
                .accessibilityElement(children: .combine)
                .accessibilityLabel("معاينة البطاقة")
            }

            Toggle(isOn: $agreeOn) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("أوافق / لا أوافق")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("يظهر في نهاية المقال سؤال «هل توافق الكاتب؟» وتُعرض النسبة للقارئ فور تصويته.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(SabqTheme.primary)
            .padding(SabqLayout.space12)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(SabqTheme.surfaceMuted))
        }
    }
}

/// تعديل الجملة والتصويت لمقال قائم من «مقالاتي».
struct WriterOpinionExtrasSheet: View {
    let articleId: String
    let articleTitle: String

    @Environment(\.dismiss) private var dismiss
    @State private var loading = true
    @State private var quote = ""
    @State private var agreeOn = false
    @State private var saving = false
    @State private var errorText: String?
    @State private var saved = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SabqLayout.space16) {
                    Text(articleTitle)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(2)
                    if loading {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        OpinionExtrasFields(quote: $quote, agreeOn: $agreeOn)
                    }
                    if let errorText {
                        Text(errorText).sabqText(SabqType.meta).foregroundStyle(SabqTheme.danger)
                    }
                    if saved {
                        Text("حُفظت إضافات المقال.")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.success)
                    }
                }
                .padding(SabqLayout.space16)
            }
            .background(SabqTheme.background)
            .navigationTitle("إضافات القارئ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(saved ? "تم" : "إلغاء") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("حفظ") }
                    }
                    .disabled(loading || saving || OpinionExtrasRules.problem(quote) != nil)
                }
            }
            .task { await load() }
        }
        .sabqRTL()
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let extras = try await APIClient.shared.opinionExtras(articleId: articleId)
            quote = extras.pullQuote ?? ""
            agreeOn = extras.agreeVoteEnabled
            if !extras.canEdit { errorText = "تعديل هذا المقال لكاتبه وفريق التحرير." }
        } catch {
            errorText = "تعذر جلب إضافات المقال."
        }
    }

    private func save() async {
        saving = true
        errorText = nil
        saved = false
        defer { saving = false }
        do {
            try await APIClient.shared.saveOpinionExtras(articleId: articleId, pullQuote: quote, agreeVoteEnabled: agreeOn)
            saved = true
            SabqHaptics.success()
        } catch APIError.apiMessage(let message) {
            errorText = message
        } catch {
            errorText = "تعذر الحفظ، حاول مرة أخرى."
        }
    }
}
