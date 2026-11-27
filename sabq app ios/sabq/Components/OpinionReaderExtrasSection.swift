import SwiftUI
import UIKit

/// «جملة المقال» وبطاقتها و«أوافق / لا أوافق» أسفل مقال الرأي، كما في الويب.
/// يُخفى كله إن لم يضع الكاتب جملة ولم يفعّل التصويت، أو إن فشل الجلب
/// (لا رسالة خطأ للقارئ: هذه إضافة، لا تمنع قراءة المقال).
struct OpinionReaderExtrasSection: View {
    let articleId: String
    let articleTitle: String
    let articleURL: URL

    @State private var extras: APIOpinionExtras?
    @State private var agree: APIOpinionAgreeState?
    @State private var voting = false
    @State private var voteError: String?
    @State private var sharing = false

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            if let quote = extras?.pullQuote, !quote.isEmpty {
                pullQuoteBlock(quote)
            }
            if let agree {
                agreeBlock(agree)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .task(id: articleId) { await load() }
    }

    // MARK: - جملة المقال

    private func pullQuoteBlock(_ quote: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Image(systemName: "quote.opening")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(SabqTheme.brandSky)
                .accessibilityHidden(true)

            Text(quote)
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if extras?.quoteCardUrl != nil {
                Button {
                    Task { await shareCard() }
                } label: {
                    HStack(spacing: 6) {
                        if sharing {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        Text("شارك البطاقة")
                            .sabqText(SabqType.metaEmphasis)
                    }
                    .foregroundStyle(SabqTheme.primary)
                    .padding(.horizontal, SabqLayout.space16)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(SabqTheme.surface))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(sharing)
                .accessibilityHint("يشارك صورة فيها جملة المقال واسم الكاتب")
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }

    // MARK: - أوافق / لا أوافق

    private func agreeBlock(_ state: APIOpinionAgreeState) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Text("هل توافق الكاتب؟")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)

            if state.hasVoted {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    resultRow(label: "أوافق", pct: state.agreePct, mine: state.userChoice == "agree", tint: SabqTheme.primary)
                    resultRow(label: "لا أوافق", pct: state.disagreePct, mine: state.userChoice == "disagree", tint: SabqTheme.textTertiary)
                    Text("\(state.total.formatted(.number.locale(Locale(identifier: "en_US")))) صوتًا")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            } else {
                HStack(spacing: SabqLayout.space12) {
                    voteButton(title: "أوافق", agree: true, filled: true)
                    voteButton(title: "لا أوافق", agree: false, filled: false)
                }
            }

            if let voteError {
                Text(voteError)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.danger)
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(SabqTheme.separator, lineWidth: 1)
        )
    }

    private func voteButton(title: String, agree isAgree: Bool, filled: Bool) -> some View {
        Button {
            Task { await vote(agree: isAgree) }
        } label: {
            Text(title)
                .sabqText(SabqType.button)
                .foregroundStyle(filled ? SabqTheme.onAction : SabqTheme.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(
                    Capsule().fill(filled ? SabqTheme.actionFill : SabqTheme.surface)
                )
                .overlay(
                    Capsule().strokeBorder(filled ? Color.clear : SabqTheme.outline, lineWidth: 1)
                )
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(voting)
        .opacity(voting ? 0.6 : 1)
    }

    private func resultRow(label: String, pct: Int, mine: Bool, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(mine ? "\(label) · صوتك" : label)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textPrimary)
                Spacer(minLength: 0)
                Text("\(pct)%")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .environment(\.layoutDirection, .leftToRight)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(SabqTheme.chipFill)
                    Capsule().fill(tint)
                        .frame(width: geo.size.width * CGFloat(max(0, min(100, pct))) / 100)
                }
            }
            .frame(height: 8)
            .environment(\.layoutDirection, .rightToLeft)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label) \(pct) بالمئة\(mine ? "، صوتك" : "")")
    }

    // MARK: - Actions

    private func load() async {
        do {
            let result = try await APIClient.shared.opinionExtras(articleId: articleId)
            extras = result
            agree = result.agreeVoteEnabled ? result.agree : nil
        } catch {
            extras = nil
            agree = nil
        }
    }

    private func vote(agree isAgree: Bool) async {
        guard !voting else { return }
        voting = true
        voteError = nil
        defer { voting = false }
        do {
            let updated = try await APIClient.shared.voteOpinion(articleId: articleId, agree: isAgree)
            withAnimation(.easeOut(duration: 0.25)) { agree = updated }
            SabqHaptics.success()
        } catch APIError.rateLimited {
            voteError = "محاولات كثيرة، حاول بعد قليل."
        } catch {
            voteError = "تعذر تسجيل صوتك، حاول مرة أخرى."
        }
    }

    private func shareCard() async {
        guard let raw = extras?.quoteCardUrl, let url = URL(string: raw) else { return }
        sharing = true
        defer { sharing = false }
        var items: [Any] = []
        if let (data, response) = try? await URLSession.shared.data(from: url),
           (response as? HTTPURLResponse)?.statusCode == 200,
           let image = UIImage(data: data) {
            items.append(image)
        }
        items.append(articleTitle)
        items.append(articleURL)
        SabqAnalytics.shareIntent(articleId: articleId)
        SabqShareHelper.presentShareSheet(items: items)
    }
}
