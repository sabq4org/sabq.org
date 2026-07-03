import SwiftUI

// MARK: - واجهات محرّك الذكاء الرياضي (VARA Intelligence)
//
// مكوّنات SwiftUI تعرض رؤى الخادم المؤسَّسة على الحقائق، بهوية «VARA» نفسها
// (أبيض/أخضر تكيّفي، بطاقات مسطّحة، خطّ التطبيق). كلها تختفي ذاتيًّا حين لا تتوفّر
// بيانات (الخادم يعيد configured=false أو قوائم فارغة) فلا تترك فراغًا في الشاشة.
//   • VaraSceneShelf          رفّ «المشهد الآن» أعلى الرئيسية
//   • VaraSmartMatchCard      بطاقة المباراة الذكية + التوقّع المفسّر (مركز المباراة)
//   • VaraTrendsSection       «قصص الموسم» في صفحة البطولة
//   • VaraDigestCard          الموجز المخصّص في صفحة «لك»
//   • VaraCopilotView         المساعد المحادثي (RAG)

// MARK: - أدوات مشتركة

private enum VaraIntelStyle {
    /// لون بارز حسب أهمية اللقطة — الأعلى قرمزي، المتوسط ذهبي، وإلا أخضر.
    static func accent(importance: Int) -> Color {
        if importance >= 66 { return SpTheme.crimson }
        if importance >= 40 { return SpTheme.gold }
        return SpTheme.green
    }

    static func kindIcon(_ kind: String) -> String {
        switch kind {
        case "anomaly":       return "exclamationmark.triangle.fill"
        case "trend":         return "chart.line.uptrend.xyaxis"
        case "scene_summary": return "sparkles"
        default:              return "bolt.horizontal.circle.fill"
        }
    }
}

/// ترويسة «ذكاء VARA» الموحّدة — أيقونة شرارة + الاسم اللاتيني (LTR) + عنوان عربي.
private struct VaraIntelHeader: View {
    let title: String
    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "sparkles")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(SpTheme.green)
            Text("ذكاء VARA")
                .font(SportsFonts.app(size: 11, weight: .heavy))
                .foregroundStyle(SpTheme.green)
                .environment(\.layoutDirection, .leftToRight)
            Text("· \(title)")
                .font(SportsFonts.app(size: 12, weight: .bold))
                .foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
        }
    }
}

// MARK: - رفّ «المشهد الآن»

/// رفّ أفقي لأبرز ما يجري عبر البطولات، مع خلاصة نصّية موجزة. يُحدَّث كل 90ث.
struct VaraSceneShelf: View {
    @State private var summary: VaraIntelInsight?
    @State private var cards: [VaraIntelInsight] = []

    var body: some View {
        Group {
            if summary != nil || !cards.isEmpty {
                VStack(alignment: .leading, spacing: 11) {
                    VaraIntelHeader(title: "المشهد الآن").padding(.horizontal, 16)
                    if let s = summary, !s.body.isEmpty {
                        Text(s.body)
                            .font(SportsFonts.app(size: 12.5, weight: .semibold))
                            .foregroundStyle(SpTheme.onDarkDim)
                            .lineLimit(3)
                            .padding(.horizontal, 16)
                    }
                    if !cards.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(cards) { card in sceneCard(card) }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                }
            }
        }
        .task(id: "vara-scene") { await run() }
    }

    private func sceneCard(_ c: VaraIntelInsight) -> some View {
        let accent = VaraIntelStyle.accent(importance: c.importance)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: VaraIntelStyle.kindIcon(c.kind))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(accent)
                RoundedRectangle(cornerRadius: 2).fill(accent).frame(width: 22, height: 3)
                Spacer(minLength: 0)
            }
            Text(c.headline)
                .font(SportsFonts.app(size: 14, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(2).minimumScaleFactor(0.85)
                .fixedSize(horizontal: false, vertical: true)
            Text(c.body)
                .font(SportsFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(13)
        .frame(width: 250, height: 132, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func run() async {
        await load(force: false)
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 90_000_000_000)
            if Task.isCancelled { break }
            await load(force: true)
        }
    }

    private func load(force: Bool) async {
        guard let res = try? await APIClient.shared.fetchIntelScene(ignoreCache: force), res.configured else {
            if force == false { summary = nil; cards = [] }
            return
        }
        summary = res.summary
        cards = res.cards
    }
}

// MARK: - بطاقة المباراة الذكية + التوقّع المفسّر

/// بطاقة سرد ذكيّة للمباراة (قبل/أثناء/بعد) مع نقاط بارزة، يتبعها توقّع مفسّر إن
/// كانت مرتقبة. تختفي كليًّا إن لم يوفّر الخادم أيّ محتوى. تُحدَّث دوريًّا أثناء اللعب.
struct VaraSmartMatchCardView: View {
    let fixtureId: Int

    @State private var card: VaraSmartMatchCard?
    @State private var prediction: VaraExplainedPrediction?

    var body: some View {
        Group {
            if card != nil || prediction != nil {
                VStack(alignment: .leading, spacing: 14) {
                    if let c = card { cardBody(c) }
                    if let p = prediction { predictionBody(p) }
                }
                .padding(15)
                .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
                .padding(.horizontal, 16)
            }
        }
        .task(id: fixtureId) { await run() }
    }

    @ViewBuilder private func cardBody(_ c: VaraSmartMatchCard) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                Image(systemName: "sparkles").font(.system(size: 12, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("بطاقة VARA الذكية")
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.green)
                Spacer(minLength: 0)
                phaseBadge(c.phase)
            }
            Text(c.headline)
                .font(SportsFonts.headline(size: 17))
                .foregroundStyle(SpTheme.onDark)
                .fixedSize(horizontal: false, vertical: true)
            if !c.body.isEmpty {
                Text(c.body)
                    .font(SportsFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !c.bullets.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(Array(c.bullets.enumerated()), id: \.offset) { _, b in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "circle.fill").font(.system(size: 5)).foregroundStyle(SpTheme.green)
                                .padding(.top, 6)
                            Text(b)
                                .font(SportsFonts.app(size: 12.5, weight: .semibold))
                                .foregroundStyle(SpTheme.onDark)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(.top, 2)
            }
        }
    }

    @ViewBuilder private func predictionBody(_ p: VaraExplainedPrediction) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Rectangle().fill(SpTheme.outline).frame(height: 1)
            HStack(spacing: 7) {
                Image(systemName: "chart.bar.xaxis").font(.system(size: 12, weight: .bold)).foregroundStyle(SpTheme.gold)
                Text("توقّع VARA المفسّر")
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.gold)
                Spacer(minLength: 0)
            }
            if let pr = p.probabilities { probabilitiesBar(pr) }
            if !p.headline.isEmpty {
                Text(p.headline)
                    .font(SportsFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !p.body.isEmpty {
                Text(p.body)
                    .font(SportsFonts.app(size: 12.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func probabilitiesBar(_ pr: VaraPredictionProbabilities) -> some View {
        let total = max(1, pr.home + pr.draw + pr.away)
        return VStack(spacing: 6) {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(SpTheme.green)
                        .frame(width: geo.size.width * CGFloat(pr.home) / CGFloat(total))
                    Capsule().fill(SpTheme.onDarkFaint.opacity(0.5))
                        .frame(width: geo.size.width * CGFloat(pr.draw) / CGFloat(total))
                    Capsule().fill(SpTheme.gold)
                        .frame(width: geo.size.width * CGFloat(pr.away) / CGFloat(total))
                }
            }
            .frame(height: 8)
            HStack {
                probLabel("مضيف", "\(pr.home)%", SpTheme.green)
                Spacer()
                probLabel("تعادل", "\(pr.draw)%", SpTheme.onDarkDim)
                Spacer()
                probLabel("ضيف", "\(pr.away)%", SpTheme.gold)
            }
        }
    }

    private func probLabel(_ title: String, _ value: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(title).font(SportsFonts.app(size: 10, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
            Text(value).font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
        }
    }

    private func phaseBadge(_ phase: VaraMatchPhase) -> some View {
        let color: Color = phase == .live ? SpTheme.crimson : (phase == .post ? SpTheme.onDarkDim : SpTheme.green)
        return HStack(spacing: 5) {
            Image(systemName: phase.icon).font(.system(size: 9, weight: .bold))
            Text(phase.label).font(SportsFonts.app(size: 10, weight: .bold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(Capsule().fill(color.opacity(0.12)))
    }

    private func run() async {
        await load(force: false)
        while !Task.isCancelled {
            guard card?.phase == .live else { break }
            try? await Task.sleep(nanoseconds: 60_000_000_000)
            if Task.isCancelled { break }
            await load(force: true)
        }
    }

    private func load(force: Bool) async {
        guard let res = try? await APIClient.shared.fetchIntelMatch(id: fixtureId, ignoreCache: force), res.configured else {
            if force == false { card = nil; prediction = nil }
            return
        }
        card = res.card
        prediction = res.prediction
    }
}

// MARK: - «قصص الموسم» (بطولة)

/// شبكة بطاقات لأنماط وشذوذات الموسم في بطولة. تختفي إن لا قصص.
struct VaraTrendsSection: View {
    let slug: String

    @State private var cards: [VaraIntelInsight] = []

    var body: some View {
        Group {
            if !cards.isEmpty {
                VStack(alignment: .leading, spacing: 11) {
                    VaraIntelHeader(title: "قصص الموسم")
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(cards) { c in storyCard(c) }
                    }
                }
            }
        }
        .task(id: slug) { await load() }
    }

    private func storyCard(_ c: VaraIntelInsight) -> some View {
        let isAnomaly = c.kind == "anomaly"
        let accent = isAnomaly ? SpTheme.gold : SpTheme.green
        return VStack(alignment: .leading, spacing: 7) {
            Image(systemName: VaraIntelStyle.kindIcon(c.kind))
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(accent)
                .frame(width: 34, height: 34)
                .background(Circle().fill(accent.opacity(0.12)))
            Text(c.headline)
                .font(SportsFonts.app(size: 13.5, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(2).minimumScaleFactor(0.85)
                .fixedSize(horizontal: false, vertical: true)
            Text(c.body)
                .font(SportsFonts.app(size: 11.5, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(13)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func load() async {
        guard let res = try? await APIClient.shared.fetchIntelCompetition(slug: slug), res.configured else {
            cards = []
            return
        }
        cards = res.cards
    }
}

// MARK: - الموجز المخصّص

/// موجز رياضي مخصّص لمتابعات العضو. يظهر فقط لعضو مسجّل وبوجود موجز جاهز.
struct VaraDigestCard: View {
    @Environment(SpAuthStore.self) private var auth
    @State private var digest: VaraDigest?

    var body: some View {
        Group {
            if auth.isLoggedIn, let d = digest {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 7) {
                        Image(systemName: "text.badge.star").font(.system(size: 12, weight: .bold)).foregroundStyle(SpTheme.green)
                        Text("موجزك من VARA")
                            .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.green)
                        Spacer(minLength: 0)
                    }
                    Text(d.headline)
                        .font(SportsFonts.headline(size: 17))
                        .foregroundStyle(SpTheme.onDark)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(d.body)
                        .font(SportsFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(15)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            }
        }
        .task(id: auth.isLoggedIn) { await load() }
    }

    private func load() async {
        guard auth.isLoggedIn else { digest = nil; return }
        guard let res = try? await APIClient.shared.fetchIntelDigest(), res.configured else {
            digest = nil
            return
        }
        digest = res.digest
    }
}

// MARK: - مدخل المساعد المحادثي

/// بطاقة زرّ تفتح المساعد الرياضي المحادثي — للاستخدام في صفحة «لك».
struct VaraCopilotEntry: View {
    var body: some View {
        NavigationLink { VaraCopilotView() } label: {
            HStack(spacing: 13) {
                Image(systemName: "bubble.left.and.text.bubble.right.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(LinearGradient(colors: [SpTheme.green, SpTheme.greenDeep], startPoint: .topLeading, endPoint: .bottomTrailing)))
                VStack(alignment: .leading, spacing: 3) {
                    Text("اسأل VARA")
                        .font(SportsFonts.app(size: 15, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    Text("مساعد رياضي يجيب من بياناتنا الحيّة")
                        .font(SportsFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.compact.left").font(.system(size: 20, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
            }
            .padding(13)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }
}

// MARK: - المساعد المحادثي (شاشة)

/// شاشة المساعد الرياضي (RAG) — سؤال حرّ يُجاب من بياناتنا الحيّة. أسئلة مقترحة
/// للبدء السريع، وحالة تحميل/خطأ واضحة.
struct VaraCopilotView: View {
    @State private var question = ""
    @State private var answer: String?
    @State private var loading = false
    @State private var errorText: String?
    @FocusState private var focused: Bool

    private let suggestions = [
        "من يتصدّر دوري روشن الآن؟",
        "ما آخر نتائج مباريات اليوم؟",
        "من هدّاف الدوري هذا الموسم؟",
        "كيف تبدو المنافسة على اللقب؟",
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                intro
                inputField
                if loading {
                    SpLoading().padding(.top, 8)
                } else if let errorText {
                    SpEmptyState(icon: "exclamationmark.bubble", title: "تعذّرت الإجابة", subtitle: errorText)
                } else if let answer {
                    answerCard(answer)
                }
                if answer == nil && !loading {
                    suggestionsBlock
                }
            }
            .padding(16)
        }
        .background(SpAmbientBackground())
        .navigationTitle("اسأل VARA")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var intro: some View {
        HStack(spacing: 11) {
            Image(systemName: "sparkles")
                .font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(LinearGradient(colors: [SpTheme.green, SpTheme.greenDeep], startPoint: .topLeading, endPoint: .bottomTrailing)))
            VStack(alignment: .leading, spacing: 2) {
                Text("المساعد الرياضي")
                    .font(SportsFonts.headline(size: 18)).foregroundStyle(SpTheme.onDark)
                Text("يجيب من ترتيب وهدّافي ونتائج بطولاتنا فقط")
                    .font(SportsFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
    }

    private var inputField: some View {
        HStack(spacing: 10) {
            TextField("", text: $question, prompt: Text("اكتب سؤالك الرياضي…").foregroundStyle(SpTheme.onDarkFaint), axis: .vertical)
                .font(SportsFonts.app(size: 15))
                .foregroundStyle(SpTheme.onDark)
                .tint(SpTheme.green)
                .lineLimit(1...4)
                .focused($focused)
                .submitLabel(.send)
                .onSubmit { Task { await ask() } }
            Button { Task { await ask() } } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(canAsk ? SpTheme.green : SpTheme.onDarkFaint)
            }
            .disabled(!canAsk)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
            .fill(SpTheme.cardFill)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1)))
    }

    private var suggestionsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("جرّب أن تسأل")
                .font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
            ForEach(suggestions, id: \.self) { s in
                Button {
                    question = s
                    Task { await ask() }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "text.bubble").font(.system(size: 13, weight: .semibold)).foregroundStyle(SpTheme.green)
                        Text(s).font(SportsFonts.app(size: 13.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                            .lineLimit(1).minimumScaleFactor(0.85)
                        Spacer(minLength: 0)
                        Image(systemName: "arrow.up.left").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 13)
                    .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.card))
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
                }
                .buttonStyle(SpPressStyle())
            }
        }
    }

    private func answerCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                Image(systemName: "sparkles").font(.system(size: 12, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("إجابة VARA").font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.green)
                Spacer(minLength: 0)
                Button {
                    answer = nil
                    question = ""
                    focused = true
                } label: {
                    Text("سؤال جديد").font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.green)
                }
            }
            Text(text)
                .font(SportsFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SpTheme.onDark)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private var canAsk: Bool {
        !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !loading
    }

    private func ask() async {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        focused = false
        loading = true
        errorText = nil
        answer = nil
        do {
            let res = try await APIClient.shared.askIntelCopilot(question: q)
            if let a = res.answer, !a.isEmpty {
                answer = a
            } else {
                errorText = "لا تتوفّر إجابة موثوقة لهذا السؤال الآن. جرّب سؤالاً عن الترتيب أو النتائج أو الهدّافين."
            }
        } catch {
            errorText = "تعذّر الوصول إلى المساعد حاليًا. حاول لاحقًا."
        }
        loading = false
    }
}
