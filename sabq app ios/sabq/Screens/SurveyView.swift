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

    /// Fixed sabq sky-blue family from the approved design — deliberately
    /// NOT the user-selectable accent so the survey looks the same for
    /// every writer (it is Sabq speaking, not the user's theme).
    private let headerGradient = LinearGradient(
        colors: [
            Color(red: 0.043, green: 0.282, blue: 0.435),
            Color(red: 0.055, green: 0.427, blue: 0.690),
            Color(red: 0.118, green: 0.616, blue: 0.945),
        ],
        startPoint: .topTrailing,
        endPoint: .bottomLeading
    )
    private let accent = Color(red: 0.118, green: 0.616, blue: 0.945)

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
                if let payload { ScrollView { introCard(payload).padding(16) } }
            case .questions:
                if let payload { questionCard(payload).padding(16) }
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
        return VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Capsule().fill(SabqTheme.gold).frame(width: 22, height: 2.5)
                    Text(data.survey.purpose.map { "استطلاع: \($0)" } ?? "استطلاع رأي من صحيفة سبق")
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.9))
                }
                Text((data.survey.welcomeTitle ?? "أهلًا بك يا {name}، رأيك يصنع الخطوة القادمة")
                    .replacingOccurrences(of: "{name}", with: firstName))
                    .font(SabqFonts.app(size: 23, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineSpacing(5)
                if let welcome = data.survey.welcomeMessage, !welcome.isEmpty {
                    Text(welcome)
                        .font(SabqFonts.app(size: 14))
                        .foregroundStyle(.white.opacity(0.88))
                        .lineSpacing(4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
            .background(headerGradient)

            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle().fill(accent.opacity(0.12))
                        Text(String(firstName.prefix(1)))
                            .font(SabqFonts.app(size: 20, weight: .heavy))
                            .foregroundStyle(accent)
                    }
                    .frame(width: 52, height: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(data.recipient.name)
                            .font(SabqFonts.app(size: 16, weight: .heavy))
                            .foregroundStyle(SabqTheme.ink)
                        if let year = data.recipient.stats?.sinceYear {
                            Text("معنا في سبق منذ \(String(year))")
                                .font(SabqFonts.app(size: 13))
                                .foregroundStyle(SabqTheme.secondaryInk)
                        }
                    }
                }

                if let stats = data.recipient.stats {
                    HStack(spacing: 10) {
                        statTile(value: formatCount(stats.publishedCount), label: "مادة منشورة")
                        statTile(value: formatCount(stats.totalViews), label: "قراءة لموادك")
                    }
                }

                HStack(spacing: 10) {
                    metaItem(icon: "list.bullet", text: "\(data.questions.count) أسئلة")
                    metaItem(icon: "clock", text: "دقائق معدودة")
                    metaItem(icon: "paperplane", text: "تصل لإدارة التحرير")
                }

                Button {
                    startedAt = Date()
                    withAnimation(.easeOut(duration: 0.3)) { stage = .questions }
                } label: {
                    Text("ابدأ الاستطلاع")
                        .font(SabqFonts.app(size: 16, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(accent, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(24)
            .background(SabqTheme.surface)
        }
        .clipShape(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
        .shadow(color: SabqTheme.deepShadow, radius: 18, y: 8)
    }

    private func statTile(value: String, label: String) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(SabqFonts.app(size: 20, weight: .heavy))
                .foregroundStyle(SabqTheme.gold)
                .monospacedDigit()
            Text(label)
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(SabqTheme.paleFill, in: RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    private func metaItem(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 11))
            Text(text).font(SabqFonts.app(size: 11.5))
        }
        .foregroundStyle(SabqTheme.tertiaryInk)
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
                HStack(spacing: 12) {
                    Text("السؤال \(currentIndex + 1) من \(data.questions.count)")
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .monospacedDigit()
                    GeometryReader { geo in
                        ZStack(alignment: .trailing) {
                            Capsule().fill(SabqTheme.outline.opacity(0.6))
                            Capsule().fill(accent)
                                .frame(width: geo.size.width * CGFloat(currentIndex) / CGFloat(data.questions.count))
                        }
                    }
                    .frame(height: 5)
                }
                .padding(.bottom, 22)

                Text(typeLabel(question.type))
                    .font(SabqFonts.app(size: 11, weight: .heavy))
                    .foregroundStyle(accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(accent.opacity(0.10), in: Capsule())
                    .padding(.bottom, 10)

                (Text(question.text) + Text(question.isRequired ? " *" : "").foregroundColor(SabqTheme.gold))
                    .font(SabqFonts.app(size: 19, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .lineSpacing(5)
                    .padding(.bottom, 4)

                if let hint = question.hint, !hint.isEmpty {
                    Text(hint)
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(SabqTheme.secondaryInk)
                } else if !question.isRequired {
                    Text("اختياري")
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }

                answerControl(for: question)
                    .padding(.top, 18)

                if let submitError {
                    Text(submitError)
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SabqTheme.coral)
                        .padding(.top, 12)
                }

                HStack {
                    if currentIndex > 0 {
                        Button {
                            advanceTask?.cancel()
                            withAnimation(.easeOut(duration: 0.25)) { currentIndex -= 1 }
                        } label: {
                            Text("السابق")
                                .font(SabqFonts.app(size: 14, weight: .bold))
                                .foregroundStyle(SabqTheme.secondaryInk)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 11)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    if autoAdvances {
                        Text("ينتقل تلقائيًا بعد اختيارك")
                            .font(SabqFonts.app(size: 12))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    } else {
                        Button {
                            goNext(data)
                        } label: {
                            Text(isLast ? (submitting ? "جارٍ الإرسال…" : "إرسال الاستطلاع") : "متابعة")
                                .font(SabqFonts.app(size: 15, weight: .heavy))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 26)
                                .padding(.vertical, 12)
                                .background(
                                    accent.opacity(canProceed(question) && !submitting ? 1 : 0.45),
                                    in: RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                )
                        }
                        .buttonStyle(.plain)
                        .disabled(!canProceed(question) || submitting)
                    }
                }
                .padding(.top, 26)
            }
            .padding(24)
            .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
            .shadow(color: SabqTheme.shadow, radius: 14, y: 6)
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
            VStack(spacing: 10) {
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
            HStack(spacing: 12) {
                ZStack {
                    if isSingle {
                        Circle().stroke(selected ? accent : SabqTheme.outline, lineWidth: 2)
                        if selected { Circle().fill(accent).frame(width: 10, height: 10) }
                    } else {
                        RoundedRectangle(cornerRadius: 5).stroke(selected ? accent : SabqTheme.outline, lineWidth: 2)
                        if selected {
                            RoundedRectangle(cornerRadius: 5).fill(accent)
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .heavy))
                                .foregroundStyle(.white)
                        }
                    }
                }
                .frame(width: 20, height: 20)
                Text(option)
                    .font(SabqFonts.app(size: 15, weight: selected ? .bold : .regular))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .background(
                selected ? accent.opacity(0.08) : SabqTheme.paleFill,
                in: RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(selected ? accent : SabqTheme.outline.opacity(0.6), lineWidth: selected ? 1.5 : 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func scaleControl(_ question: APISurveyPublic.Question) -> some View {
        let minValue = question.settings?.scaleMin ?? 0
        let maxValue = question.settings?.scaleMax ?? 10
        let selectedValue: Int? = { if case .number(let value)? = answers[question.id] { return value }; return nil }()
        let columns = [GridItem(.adaptive(minimum: 44), spacing: 7)]
        return VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: columns, spacing: 7) {
                ForEach(minValue...maxValue, id: \.self) { value in
                    Button {
                        answers[question.id] = .number(value)
                        scheduleAutoAdvance()
                    } label: {
                        Text(String(value))
                            .font(SabqFonts.app(size: 15, weight: .heavy))
                            .monospacedDigit()
                            .foregroundStyle(selectedValue == value ? .white : SabqTheme.ink)
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(
                                selectedValue == value ? accent : SabqTheme.paleFill,
                                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(selectedValue == value ? accent : SabqTheme.outline.opacity(0.6), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack {
                if let minLabel = question.settings?.minLabel { Text(minLabel) }
                Spacer()
                if let maxLabel = question.settings?.maxLabel { Text(maxLabel) }
            }
            .font(SabqFonts.app(size: 12))
            .foregroundStyle(SabqTheme.tertiaryInk)
        }
    }

    private func starsControl(_ question: APISurveyPublic.Question) -> some View {
        let selectedValue: Int = { if case .number(let value)? = answers[question.id] { return value }; return 0 }()
        return HStack(spacing: 10) {
            ForEach(1...5, id: \.self) { value in
                Button {
                    answers[question.id] = .number(value)
                    scheduleAutoAdvance()
                } label: {
                    Image(systemName: value <= selectedValue ? "star.fill" : "star")
                        .font(.system(size: 30))
                        .foregroundStyle(value <= selectedValue ? SabqTheme.gold : SabqTheme.outline)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func textControl(_ question: APISurveyPublic.Question) -> some View {
        let binding = Binding<String>(
            get: { if case .text(let value)? = answers[question.id] { return value }; return "" },
            set: { answers[question.id] = .text($0) }
        )
        return TextField("اكتب إجابتك هنا…", text: binding, axis: .vertical)
            .font(SabqFonts.app(size: 15))
            .foregroundStyle(SabqTheme.ink)
            .lineLimit(question.type == "long_text" ? 5...12 : 2...4)
            .padding(14)
            .background(SabqTheme.paleFill, in: RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.6), lineWidth: 1)
            )
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
        VStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 34))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text(title)
                .font(SabqFonts.app(size: 19, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            Text(message)
                .font(SabqFonts.app(size: 14))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
        }
        .padding(30)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous))
        .padding(24)
    }

    private func successCard(title: String, message: String) -> some View {
        VStack(spacing: 16) {
            ZStack {
                Circle().fill(SabqTheme.leaf.opacity(0.12))
                Circle().stroke(SabqTheme.leaf, lineWidth: 2.5)
                Image(systemName: "checkmark")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(SabqTheme.leaf)
            }
            .frame(width: 88, height: 88)
            .padding(.bottom, 6)

            Text(title)
                .font(SabqFonts.app(size: 21, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.center)
            Text(message)
                .font(SabqFonts.app(size: 14))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(5)

            VStack(spacing: 2) {
                Text("مع خالص التقدير،")
                    .font(SabqFonts.app(size: 13))
                    .foregroundStyle(SabqTheme.secondaryInk)
                Text("إدارة التحرير — صحيفة سبق")
                    .font(SabqFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
            }
            .padding(.top, 16)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(SabqTheme.outline)
                    .frame(width: 220, height: 1)
            }
        }
        .padding(32)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
        .shadow(color: SabqTheme.deepShadow, radius: 18, y: 8)
        .padding(20)
        .transition(.scale(scale: 0.95).combined(with: .opacity))
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
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(SabqTheme.sky.opacity(0.12))
                        Image(systemName: "checklist")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(SabqTheme.sky)
                    }
                    .frame(width: 44, height: 44)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("استطلاع بانتظارك: \(invite.title)")
                            .font(SabqFonts.app(size: 15, weight: .heavy))
                            .foregroundStyle(SabqTheme.ink)
                            .lineLimit(1)
                        Text(invite.purpose.map { "رأيك يساعدنا في \($0) — \(invite.questionsCount) أسئلة" } ?? "\(invite.questionsCount) أسئلة قصيرة، دقائق معدودة")
                            .font(SabqFonts.app(size: 12.5))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.left")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .padding(16)
                .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqTheme.chipRadius + 4, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius + 4, style: .continuous)
                        .stroke(SabqTheme.sky.opacity(0.35), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
    }
}
