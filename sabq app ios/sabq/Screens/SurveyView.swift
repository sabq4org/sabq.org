import SwiftUI

// MARK: - API models

/// Payload of `GET /api/public/surveys/<token>` — the personal survey
/// invitation. Token-gated, no session required (the token IS the
/// credential), so this works before login too.
nonisolated struct APISurveyPublic: Decodable {
    struct Info: Decodable {
        let title: String
        let purpose: String?
        let welcomeTitle: String?
        let welcomeMessage: String?
        let thankYouTitle: String?
        let thankYouMessage: String?
        let status: String
    }
    struct Settings: Decodable {
        let maxChoices: Int?
        let scaleMin: Int?
        let scaleMax: Int?
        let minLabel: String?
        let maxLabel: String?
    }
    struct Question: Decodable, Identifiable {
        let id: String
        let type: String
        let text: String
        let hint: String?
        let isRequired: Bool
        let options: [String]?
        let settings: Settings?

        enum CodingKeys: String, CodingKey {
            case id, type, text, hint, options, settings
            case isRequired = "required"
        }
    }
    struct Stats: Decodable {
        let publishedCount: Int
        let totalViews: Int
        let sinceYear: Int?
    }
    struct Recipient: Decodable {
        let name: String
        let stats: Stats?
    }
    let survey: Info
    let questions: [Question]
    let recipient: Recipient
    let alreadyCompleted: Bool
}

nonisolated struct APISurveySubmitResult: Decodable {
    let success: Bool
    let thankYouTitle: String?
    let thankYouMessage: String?
}

/// Row of `GET /api/v1/surveys/mine` — open invitations for the signed-in
/// member, used by the pending-survey card in the contributor dashboard.
nonisolated struct APIMySurveyInvite: Decodable, Identifiable {
    let token: String
    let title: String
    let purpose: String?
    let questionsCount: Int
    let opened: Bool
    var id: String { token }
}

/// One answer value — index, indices, or free text — encoded exactly as
/// the web client sends it (`answers[questionId] = value`).
nonisolated enum SurveyAnswer: Encodable, Equatable {
    case number(Int)
    case numbers([Int])
    case text(String)

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .number(let value):  try container.encode(value)
        case .numbers(let value): try container.encode(value)
        case .text(let value):    try container.encode(value)
        }
    }
}

extension APIClient {
    func fetchSurvey(token: String) async throws -> APISurveyPublic {
        try await get(APISurveyPublic.self, path: "/public/surveys/\(token)", apiRoot: URLConstants.publicAPI)
    }

    func submitSurvey(token: String, answers: [String: SurveyAnswer], durationSeconds: Int?) async throws -> APISurveySubmitResult {
        struct Body: Encodable {
            let answers: [String: SurveyAnswer]
            let durationSeconds: Int?
        }
        return try await post(
            APISurveySubmitResult.self,
            path: "/public/surveys/\(token)/submit",
            body: Body(answers: answers, durationSeconds: durationSeconds),
            apiRoot: URLConstants.publicAPI
        )
    }

    func fetchMySurveys() async throws -> [APIMySurveyInvite] {
        struct Response: Decodable { let items: [APIMySurveyInvite] }
        return try await get(Response.self, path: "/surveys/mine").items
    }
}

// MARK: - Screen

/// Personal survey experience — mirrors the approved web design: a
/// press-card welcome with the writer's own stats, one question per
/// screen with auto-advance for tap answers, and a warm thank-you close.
struct SurveyView: View {
    let token: String

    private enum Stage {
        case loading
        case failed(String)
        case closed
        case intro
        case questions
        case done(title: String, message: String)
    }

    @State private var stage: Stage = .loading
    @State private var payload: APISurveyPublic?
    @State private var currentIndex = 0
    @State private var answers: [String: SurveyAnswer] = [:]
    @State private var submitting = false
    @State private var submitError: String?
    @State private var startedAt: Date?
    @State private var advanceTask: Task<Void, Never>?

    /// لون التمييز في الاستطلاع: دور «primary» في نظام التصميم.
    private let accent = SabqTheme.primary

    private static let autoAdvanceTypes: Set<String> = ["single", "stars", "scale"]

    var body: some View {
        ZStack {
            SabqTheme.background.ignoresSafeArea()
            switch stage {
            case .loading:
                ProgressView().tint(accent)
            case .failed(let message):
                statusCard(icon: "link.badge.plus", title: "هذا الرابط غير صالح", message: message)
            case .closed:
                statusCard(icon: "hourglass", title: "أُغلق هذا الاستطلاع", message: "شكرًا لاهتمامك — انتهت فترة المشاركة في هذا الاستطلاع.")
            case .intro:
                if let payload { ScrollView { introCard(payload).padding(SabqLayout.pageMargin) } }
            case .questions:
                if let payload { questionCard(payload).padding(.horizontal, SabqLayout.pageMargin) }
            case .done(let title, let message):
                successCard(title: title, message: message)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .navigationTitle("استطلاع رأي")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onDisappear { advanceTask?.cancel() }
    }

    private func load() async {
        do {
            let data = try await APIClient.shared.fetchSurvey(token: token)
            payload = data
            let firstName = firstName(of: data.recipient.name)
            if data.alreadyCompleted {
                stage = .done(
                    title: data.survey.thankYouTitle?.replacingOccurrences(of: "{name}", with: firstName) ?? "وصلت إجاباتك يا \(firstName) 🌟",
                    message: "سبق أن أكملت هذا الاستطلاع — إجاباتك محفوظة لدينا، ولا حاجة لإعادتها."
                )
            } else if data.survey.status != "active" {
                stage = .closed
            } else {
                stage = .intro
            }
        } catch {
            stage = .failed("تأكد من فتح الرابط كما وصلك في الإشعار أو البريد، أو تواصل مع إدارة التحرير.")
        }
    }

    private func firstName(of name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }

    // MARK: Intro — بطاقة الترحيب الصحفية

    private func introCard(_ data: APISurveyPublic) -> some View {
        let firstName = firstName(of: data.recipient.name)
        return VStack(alignment: .leading, spacing: SabqLayout.space24) {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                Text(data.survey.purpose.map { "استطلاع: \($0)" } ?? "استطلاع رأي من صحيفة سبق")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.primary)
                Text((data.survey.welcomeTitle ?? "أهلًا بك يا {name}، رأيك يصنع الخطوة القادمة")
                    .replacingOccurrences(of: "{name}", with: firstName))
                    .sabqText(SabqType.articleTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if let welcome = data.survey.welcomeMessage, !welcome.isEmpty {
                    Text(welcome)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Rectangle().fill(SabqTheme.separator).frame(height: 1)

            HStack(spacing: SabqLayout.space12) {
                ZStack {
                    Circle().fill(SabqTheme.surfaceMuted)
                    Text(String(firstName.prefix(1)))
                        .font(SabqType.sectionHeading.font)
                        .foregroundStyle(SabqTheme.primary)
                }
                .frame(width: 48, height: 48)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(data.recipient.name)
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                    if let year = data.recipient.stats?.sinceYear {
                        Text("معنا في سبق منذ \(String(year))")
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }

            if let stats = data.recipient.stats {
                HStack(spacing: SabqLayout.space12) {
                    statTile(value: formatCount(stats.publishedCount), label: "مادة منشورة")
                    statTile(value: formatCount(stats.totalViews), label: "قراءة لموادك")
                }
            }

            FlowLayout(spacing: SabqLayout.space12) {
                metaItem(icon: "list.bullet", text: "\(data.questions.count) أسئلة")
                metaItem(icon: "clock", text: "دقائق معدودة")
                metaItem(icon: "paperplane", text: "تصل لإدارة التحرير")
            }

            Button {
                startedAt = Date()
                withAnimation(.easeOut(duration: 0.3)) { stage = .questions }
            } label: {
                Text("ابدأ الاستطلاع")
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.onAction)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    private func statTile(value: String, label: String) -> some View {
        VStack(spacing: SabqLayout.space4) {
            Text(value)
                .font(SabqType.leadTitle.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
            Text(label)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func metaItem(icon: String, text: String) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: icon).font(SabqType.meta.font).accessibilityHidden(true)
            Text(text).font(SabqType.meta.font)
        }
        .foregroundStyle(SabqTheme.textTertiary)
    }

    private func formatCount(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fم", Double(value) / 1_000_000).replacingOccurrences(of: ".0", with: "") }
        if value >= 1_000 { return String(format: "%.1fألف", Double(value) / 1_000).replacingOccurrences(of: ".0", with: "") }
        return String(value)
    }

    // MARK: Questions — سؤال في كل شاشة

    private func questionCard(_ data: APISurveyPublic) -> some View {
        let question = data.questions[currentIndex]
        let isLast = currentIndex == data.questions.count - 1
        let autoAdvances = Self.autoAdvanceTypes.contains(question.type) && !isLast

        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: SabqLayout.space12) {
                    Text("السؤال \(currentIndex + 1) من \(data.questions.count)")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .monospacedDigit()
                    GeometryReader { geo in
                        ZStack(alignment: .trailing) {
                            Capsule().fill(SabqTheme.surfaceStrong)
                            Capsule().fill(accent)
                                .frame(width: geo.size.width * CGFloat(currentIndex) / CGFloat(data.questions.count))
                        }
                    }
                    .frame(height: 4)
                    .accessibilityHidden(true)
                }
                .padding(.bottom, SabqLayout.space24)

                Text(typeLabel(question.type))
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .padding(.horizontal, SabqLayout.space8)
                    .padding(.vertical, SabqLayout.space4)
                    .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .padding(.bottom, SabqLayout.space12)

                (Text(question.text) + Text(question.isRequired ? " *" : "").foregroundColor(SabqTheme.danger))
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .padding(.bottom, SabqLayout.space4)

                if let hint = question.hint, !hint.isEmpty {
                    Text(hint)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                } else if !question.isRequired {
                    Text("اختياري")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }

                answerControl(for: question)
                    .padding(.top, SabqLayout.space16)

                if let submitError {
                    Text(submitError)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.danger)
                        .padding(.top, SabqLayout.space12)
                }

                HStack {
                    if currentIndex > 0 {
                        Button {
                            advanceTask?.cancel()
                            withAnimation(.easeOut(duration: 0.25)) { currentIndex -= 1 }
                        } label: {
                            Text("السابق")
                                .font(SabqType.button.font)
                                .foregroundStyle(SabqTheme.primary)
                                .padding(.horizontal, SabqLayout.space16)
                                .frame(minHeight: SabqLayout.controlHeight)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 1)
                                )
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    if autoAdvances {
                        Text("ينتقل تلقائيًا بعد اختيارك")
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                    } else {
                        Button {
                            goNext(data)
                        } label: {
                            let enabled = canProceed(question) && !submitting
                            Text(isLast ? (submitting ? "جارٍ الإرسال…" : "إرسال الاستطلاع") : "متابعة")
                                .font(SabqType.button.font)
                                .foregroundStyle(enabled ? SabqTheme.onAction : SabqTheme.disabledInk)
                                .padding(.horizontal, SabqLayout.space24)
                                .frame(minHeight: SabqLayout.controlHeight)
                                .background(
                                    enabled ? SabqTheme.actionFill : SabqTheme.disabledFill,
                                    in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                )
                        }
                        .buttonStyle(.plain)
                        .disabled(!canProceed(question) || submitting)
                    }
                }
                .padding(.top, SabqLayout.space24)
            }
            .padding(.vertical, SabqLayout.space24)
            .id(question.id)
            .transition(.asymmetric(insertion: .move(edge: .leading).combined(with: .opacity), removal: .opacity))
        }
    }

    private func typeLabel(_ type: String) -> String {
        switch type {
        case "single":     return "اختيار واحد"
        case "multi":      return "اختيار متعدد"
        case "short_text": return "نص قصير"
        case "long_text":  return "نص طويل"
        case "stars":      return "تقييم نجوم"
        case "scale":      return "مقياس"
        default:           return "سؤال"
        }
    }

    @ViewBuilder
    private func answerControl(for question: APISurveyPublic.Question) -> some View {
        switch question.type {
        case "single", "multi":
            VStack(spacing: SabqLayout.space8) {
                ForEach(Array((question.options ?? []).enumerated()), id: \.offset) { index, option in
                    choiceRow(question: question, index: index, option: option)
                }
            }
        case "scale":
            scaleControl(question)
        case "stars":
            starsControl(question)
        default:
            textControl(question)
        }
    }

    private func choiceRow(question: APISurveyPublic.Question, index: Int, option: String) -> some View {
        let isSingle = question.type == "single"
        let selected: Bool = {
            switch answers[question.id] {
            case .number(let value): return isSingle && value == index
            case .numbers(let values): return !isSingle && values.contains(index)
            default: return false
            }
        }()
        return Button {
            if isSingle {
                answers[question.id] = .number(index)
                scheduleAutoAdvance()
            } else {
                var values: [Int]
                if case .numbers(let existing)? = answers[question.id] { values = existing } else { values = [] }
                if let position = values.firstIndex(of: index) {
                    values.remove(at: position)
                } else if values.count < (question.settings?.maxChoices ?? question.options?.count ?? 12) {
                    values.append(index)
                }
                answers[question.id] = .numbers(values.sorted())
            }
        } label: {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: isSingle
                      ? (selected ? "largecircle.fill.circle" : "circle")
                      : (selected ? "checkmark.square.fill" : "square"))
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(selected ? accent : SabqTheme.textTertiary)
                    .frame(width: 24, height: 24)
                    .accessibilityHidden(true)
                Text(option)
                    .font(selected ? SabqFonts.app(size: 15, weight: .semibold) : SabqType.excerpt.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, SabqLayout.space16)
            .padding(.vertical, SabqLayout.space12)
            .frame(minHeight: SabqLayout.controlHeight)
            .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(selected ? accent : SabqTheme.outline, lineWidth: selected ? 1.5 : 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func scaleControl(_ question: APISurveyPublic.Question) -> some View {
        let minValue = question.settings?.scaleMin ?? 0
        let maxValue = question.settings?.scaleMax ?? 10
        let selectedValue: Int? = { if case .number(let value)? = answers[question.id] { return value }; return nil }()
        let columns = [GridItem(.adaptive(minimum: 44), spacing: SabqLayout.space8)]
        return VStack(alignment: .leading, spacing: SabqLayout.space8) {
            LazyVGrid(columns: columns, spacing: SabqLayout.space8) {
                ForEach(minValue...maxValue, id: \.self) { value in
                    Button {
                        answers[question.id] = .number(value)
                        scheduleAutoAdvance()
                    } label: {
                        Text(String(value))
                            .font(SabqType.button.font)
                            .monospacedDigit()
                            .foregroundStyle(selectedValue == value ? SabqTheme.onAction : SabqTheme.textPrimary)
                            .frame(maxWidth: .infinity)
                            .frame(height: SabqLayout.touchTarget)
                            .background(
                                selectedValue == value ? SabqTheme.actionFill : SabqTheme.surfaceMuted,
                                in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selectedValue == value ? .isSelected : [])
                }
            }
            HStack {
                if let minLabel = question.settings?.minLabel { Text(minLabel) }
                Spacer()
                if let maxLabel = question.settings?.maxLabel { Text(maxLabel) }
            }
            .font(SabqType.meta.font)
            .foregroundStyle(SabqTheme.textTertiary)
        }
    }

    private func starsControl(_ question: APISurveyPublic.Question) -> some View {
        let selectedValue: Int = { if case .number(let value)? = answers[question.id] { return value }; return 0 }()
        return HStack(spacing: SabqLayout.space8) {
            ForEach(1...5, id: \.self) { value in
                Button {
                    answers[question.id] = .number(value)
                    scheduleAutoAdvance()
                } label: {
                    Image(systemName: value <= selectedValue ? "star.fill" : "star")
                        .font(.system(size: 28))
                        .foregroundStyle(value <= selectedValue ? SabqTheme.warning : SabqTheme.textTertiary)
                        .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(value)")
                .accessibilityAddTraits(value == selectedValue ? .isSelected : [])
            }
        }
    }

    private func textControl(_ question: APISurveyPublic.Question) -> some View {
        let binding = Binding<String>(
            get: { if case .text(let value)? = answers[question.id] { return value }; return "" },
            set: { answers[question.id] = .text($0) }
        )
        return TextField("اكتب إجابتك هنا…", text: binding, axis: .vertical)
            .font(SabqType.excerpt.font)
            .foregroundStyle(SabqTheme.textPrimary)
            .lineLimit(question.type == "long_text" ? 5...12 : 2...4)
            .modifier(SabqInputSurface())
    }

    private func canProceed(_ question: APISurveyPublic.Question) -> Bool {
        guard question.isRequired else { return true }
        switch answers[question.id] {
        case .number: return true
        case .numbers(let values): return !values.isEmpty
        case .text(let value): return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case nil: return false
        }
    }

    private func scheduleAutoAdvance() {
        guard let payload else { return }
        let question = payload.questions[currentIndex]
        let isLast = currentIndex == payload.questions.count - 1
        guard Self.autoAdvanceTypes.contains(question.type), !isLast else { return }
        advanceTask?.cancel()
        advanceTask = Task {
            try? await Task.sleep(nanoseconds: 450_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.25)) { currentIndex += 1 }
        }
    }

    private func goNext(_ data: APISurveyPublic) {
        submitError = nil
        if currentIndex < data.questions.count - 1 {
            withAnimation(.easeOut(duration: 0.25)) { currentIndex += 1 }
        } else {
            Task { await submit(data) }
        }
    }

    private func submit(_ data: APISurveyPublic) async {
        submitting = true
        defer { submitting = false }
        let duration = startedAt.map { Int(Date().timeIntervalSince($0)) }
        do {
            let result = try await APIClient.shared.submitSurvey(token: token, answers: answers, durationSeconds: duration)
            let firstName = firstName(of: data.recipient.name)
            withAnimation(.easeOut(duration: 0.35)) {
                stage = .done(
                    title: (result.thankYouTitle ?? "وصلت إجاباتك يا \(firstName) 🌟").replacingOccurrences(of: "{name}", with: firstName),
                    message: result.thankYouMessage ?? "شكرًا لوقتك وصراحتك. كل إجابة كتبتها ستُقرأ باهتمام، وستكون جزءًا من قرارات التطوير القادمة."
                )
            }
        } catch {
            submitError = "تعذر إرسال إجاباتك؛ تحقق من الاتصال وحاول مرة أخرى"
        }
    }

    // MARK: Terminal states

    private func statusCard(icon: String, title: String, message: String) -> some View {
        EmptyStateView(icon: icon, tint: SabqTheme.textSecondary, title: title, subtitle: message)
            .padding(SabqLayout.space24)
    }

    private func successCard(title: String, message: String) -> some View {
        ScrollView {
            VStack(spacing: SabqLayout.space16) {
                Image(systemName: "checkmark.circle")
                    .font(SabqFonts.app(size: 44, weight: .regular))
                    .foregroundStyle(SabqTheme.success)
                    .accessibilityHidden(true)

                Text(title)
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                Text(message)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)

                VStack(spacing: 2) {
                    Text("مع خالص التقدير،")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Text("إدارة التحرير — صحيفة سبق")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                .padding(.top, SabqLayout.space16)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(SabqTheme.separator)
                        .frame(width: 220, height: 1)
                }
            }
            .padding(.horizontal, SabqLayout.space24)
            .padding(.vertical, SabqLayout.space40)
        }
        .transition(.opacity)
    }
}

// MARK: - Pending-survey card (contributor dashboard)

/// "لديك استطلاع بانتظارك" — shown at the top of the contributor
/// dashboard whenever the signed-in writer has open invitations, so the
/// survey is reachable even if the push was missed or dismissed.
struct PendingSurveysCard: View {
    let invites: [APIMySurveyInvite]

    var body: some View {
        ForEach(invites) { invite in
            NavigationLink(value: SurveyDeepLinkRoute(token: invite.token)) {
                HStack(spacing: SabqLayout.space12) {
                    Image(systemName: "checklist")
                        .font(SabqFonts.app(size: 18, weight: .regular))
                        .foregroundStyle(SabqTheme.primary)
                        .frame(width: 40, height: 40)
                        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        Text("استطلاع بانتظارك: \(invite.title)")
                            .font(SabqType.rowTitle.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1)
                        Text(invite.purpose.map { "رأيك يساعدنا في \($0) — \(invite.questionsCount) أسئلة" } ?? "\(invite.questionsCount) أسئلة قصيرة، دقائق معدودة")
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.left")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .accessibilityHidden(true)
                }
                .padding(SabqLayout.space16)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}
