import SwiftUI
import Combine

// لوحة الكاتب — مساحة عمل كاتب الرأي في التطبيق، مطابقة للوحة الويب
// (WriterWorkspacePage) بتبويباتها الأربعة: اليوم، أفكاري، مقالاتي، أدائي.
// تبويب «أدائي» يعيد استخدام ContributorDashboardView (embedded) كما هو،
// وغير كاتب الرأي (مراسل/إداري) يرى لوحة الأداء وحدها كالسابق.

// MARK: - Models (نظائر أشكال /api/v1/contributor/*)

nonisolated struct WriterDeskItem: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String
    let reviewStatus: String?
    let reviewNotes: String?
    let nextAction: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        status = (try? c.decode(String.self, forKey: FlexKey("status"))) ?? "draft"
        reviewStatus = try? c.decode(String.self, forKey: FlexKey("reviewStatus"))
        reviewNotes = try? c.decode(String.self, forKey: FlexKey("reviewNotes"))
        nextAction = (try? c.decode(String.self, forKey: FlexKey("nextAction"))) ?? "متابعة الكتابة"
    }
}

nonisolated struct WriterTrackingArticle: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String
    let reviewStatus: String?
    let reviewNotes: String?
    let scheduledAt: String?
    let publishedAt: String?
    let updatedAt: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        status = (try? c.decode(String.self, forKey: FlexKey("status"))) ?? "draft"
        reviewStatus = try? c.decode(String.self, forKey: FlexKey("reviewStatus"))
        reviewNotes = try? c.decode(String.self, forKey: FlexKey("reviewNotes"))
        scheduledAt = try? c.decode(String.self, forKey: FlexKey("scheduledAt"))
        publishedAt = try? c.decode(String.self, forKey: FlexKey("publishedAt"))
        updatedAt = try? c.decode(String.self, forKey: FlexKey("updatedAt"))
    }
}

nonisolated struct WriterPulseComment: Decodable {
    let content: String
    let articleTitle: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        content = (try? c.decode(String.self, forKey: FlexKey("content"))) ?? ""
        articleTitle = (try? c.decode(String.self, forKey: FlexKey("articleTitle"))) ?? "مقالك"
    }
}

nonisolated struct WriterReaderPulse: Decodable {
    let commentsCount: Int
    let positiveShare: Int
    let highlightedComment: WriterPulseComment?
    let message: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        commentsCount = (try? c.decode(Int.self, forKey: FlexKey("commentsCount"))) ?? 0
        positiveShare = (try? c.decode(Int.self, forKey: FlexKey("positiveShare"))) ?? 0
        highlightedComment = try? c.decode(WriterPulseComment.self, forKey: FlexKey("highlightedComment"))
        message = (try? c.decode(String.self, forKey: FlexKey("message"))) ?? ""
    }
}

nonisolated struct WriterFollowUp: Decodable {
    let articleId: String
    let title: String
    let prompt: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        articleId = (try? c.decode(String.self, forKey: FlexKey("articleId"))) ?? ""
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        prompt = (try? c.decode(String.self, forKey: FlexKey("prompt"))) ?? ""
    }
}

nonisolated struct WriterCalendarItem: Decodable, Identifiable {
    let id: String
    let name: String
    let date: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        name = (try? c.decode(String.self, forKey: FlexKey("name"))) ?? ""
        date = (try? c.decode(String.self, forKey: FlexKey("date"))) ?? ""
    }
}

nonisolated struct WriterMonthlyBrief: Decodable {
    let publishedCount: Int
    let views: Int
    let message: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        publishedCount = (try? c.decode(Int.self, forKey: FlexKey("publishedCount"))) ?? 0
        views = (try? c.decode(Int.self, forKey: FlexKey("views"))) ?? 0
        message = (try? c.decode(String.self, forKey: FlexKey("message"))) ?? ""
    }
}

nonisolated struct WriterWorkspaceModel: Decodable {
    let desk: [WriterDeskItem]
    let tracking: [WriterTrackingArticle]
    let readerPulse: WriterReaderPulse?
    let followUp: WriterFollowUp?
    let calendar: [WriterCalendarItem]
    let monthlyBrief: WriterMonthlyBrief?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        desk = (try? c.decode([WriterDeskItem].self, forKey: FlexKey("desk"))) ?? []
        tracking = (try? c.decode([WriterTrackingArticle].self, forKey: FlexKey("tracking"))) ?? []
        readerPulse = try? c.decode(WriterReaderPulse.self, forKey: FlexKey("readerPulse"))
        followUp = try? c.decode(WriterFollowUp.self, forKey: FlexKey("followUp"))
        calendar = (try? c.decode([WriterCalendarItem].self, forKey: FlexKey("calendar"))) ?? []
        monthlyBrief = try? c.decode(WriterMonthlyBrief.self, forKey: FlexKey("monthlyBrief"))
    }
}

nonisolated struct WriterIdeaModel: Decodable, Identifiable {
    let id: String
    let title: String
    let angle: String
    let whyNow: String
    let audience: String
    let kind: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        angle = (try? c.decode(String.self, forKey: FlexKey("angle"))) ?? ""
        whyNow = (try? c.decode(String.self, forKey: FlexKey("whyNow"))) ?? ""
        audience = (try? c.decode(String.self, forKey: FlexKey("audience"))) ?? ""
        kind = (try? c.decode(String.self, forKey: FlexKey("kind"))) ?? "specialty"
    }
}

nonisolated struct WriterIdeasResponse: Decodable {
    let ideas: [WriterIdeaModel]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        ideas = (try? c.decode([WriterIdeaModel].self, forKey: FlexKey("ideas"))) ?? []
    }
}

nonisolated struct WriterCoachResult: Decodable {
    let reflection: String?
    let questions: [String]
    let thesisOptions: [String]
    let outline: [String]
    let counterpoint: String?
    let sourcesToSeek: [String]
    let cautions: [String]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        reflection = try? c.decode(String.self, forKey: FlexKey("reflection"))
        questions = (try? c.decode([String].self, forKey: FlexKey("questions"))) ?? []
        thesisOptions = (try? c.decode([String].self, forKey: FlexKey("thesisOptions"))) ?? []
        outline = (try? c.decode([String].self, forKey: FlexKey("outline"))) ?? []
        counterpoint = try? c.decode(String.self, forKey: FlexKey("counterpoint"))
        sourcesToSeek = (try? c.decode([String].self, forKey: FlexKey("sourcesToSeek"))) ?? []
        cautions = (try? c.decode([String].self, forKey: FlexKey("cautions"))) ?? []
    }
}

nonisolated struct WriterReviewCheck: Decodable, Identifiable {
    var id: String { key }
    let key: String
    let label: String
    let score: Int
    let note: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        key = (try? c.decode(String.self, forKey: FlexKey("key"))) ?? UUID().uuidString
        label = (try? c.decode(String.self, forKey: FlexKey("label"))) ?? ""
        score = (try? c.decode(Int.self, forKey: FlexKey("score"))) ?? 0
        note = (try? c.decode(String.self, forKey: FlexKey("note"))) ?? ""
    }
}

nonisolated struct WriterReviewResult: Decodable {
    let overallScore: Int?
    let summary: String?
    let checks: [WriterReviewCheck]
    let headlineSuggestions: [String]
    let sourceFlags: [String]
    let sensitiveClaims: [String]
    let strengths: [String]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        overallScore = try? c.decode(Int.self, forKey: FlexKey("overallScore"))
        summary = try? c.decode(String.self, forKey: FlexKey("summary"))
        checks = (try? c.decode([WriterReviewCheck].self, forKey: FlexKey("checks"))) ?? []
        headlineSuggestions = (try? c.decode([String].self, forKey: FlexKey("headlineSuggestions"))) ?? []
        sourceFlags = (try? c.decode([String].self, forKey: FlexKey("sourceFlags"))) ?? []
        sensitiveClaims = (try? c.decode([String].self, forKey: FlexKey("sensitiveClaims"))) ?? []
        strengths = (try? c.decode([String].self, forKey: FlexKey("strengths"))) ?? []
    }
}

nonisolated struct WriterStyleProfileModel: Decodable {
    let ready: Bool
    let message: String?
    let signature: String?
    let traits: [String]
    let guidance: [String]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        ready = (try? c.decode(Bool.self, forKey: FlexKey("ready"))) ?? false
        message = try? c.decode(String.self, forKey: FlexKey("message"))
        signature = try? c.decode(String.self, forKey: FlexKey("signature"))
        traits = (try? c.decode([String].self, forKey: FlexKey("traits"))) ?? []
        guidance = (try? c.decode([String].self, forKey: FlexKey("guidance"))) ?? []
    }
}

// MARK: - ViewModel

@MainActor
final class WriterWorkspaceViewModel: ObservableObject {
    @Published var workspace: WriterWorkspaceModel?
    @Published var notifications: EditorialNotificationsPage?
    @Published var schedule: WriterScheduleResponse?
    @Published var isLoading = true
    @Published var loadError: String?

    @Published var savingDay = false
    @Published var scheduleError: String?

    @Published var ideasRequested = false
    @Published var ideasLoading = false
    @Published var ideas: [WriterIdeaModel] = []

    @Published var coachInput = ""
    @Published var coachLoading = false
    @Published var coachResult: WriterCoachResult?
    @Published var coachError: String?

    @Published var styleProfile: WriterStyleProfileModel?
    @Published var styleLoading = false

    @Published var reviewLoading = false
    @Published var reviewResult: WriterReviewResult?
    @Published var reviewTitle = ""
    @Published var reviewError: String?

    func load() async {
        loadError = nil
        async let w = APIClient.shared.get(WriterWorkspaceModel.self, path: "/contributor/workspace", ignoreCache: true)
        async let n = APIClient.shared.fetchEditorialNotifications()
        async let s = APIClient.shared.get(WriterScheduleResponse.self, path: "/contributor/schedule", ignoreCache: true)
        do {
            workspace = try await w
        } catch {
            loadError = "تعذر تجهيز مساحة الكاتب"
        }
        notifications = try? await n
        schedule = try? await s
        isLoading = false
    }

    func pickDay(_ weekday: Int) async {
        savingDay = true
        scheduleError = nil
        struct Body: Encodable { let weekday: Int }
        do {
            _ = try await APIClient.shared.post(WriterSchedulePostResponse.self, path: "/contributor/schedule", body: Body(weekday: weekday))
            schedule = try? await APIClient.shared.get(WriterScheduleResponse.self, path: "/contributor/schedule", ignoreCache: true)
        } catch {
            scheduleError = "تعذر حفظ اليوم — حاول مرة أخرى"
        }
        savingDay = false
    }

    func requestIdeas() async {
        ideasRequested = true
        ideasLoading = true
        ideas = (try? await APIClient.shared.get(WriterIdeasResponse.self, path: "/contributor/ideas", ignoreCache: true))?.ideas ?? []
        ideasLoading = false
    }

    func coach() async {
        guard coachInput.trimmingCharacters(in: .whitespacesAndNewlines).count >= 12 else { return }
        coachLoading = true
        coachError = nil
        struct Body: Encodable { let idea: String }
        do {
            coachResult = try await APIClient.shared.post(WriterCoachResult.self, path: "/contributor/idea-coach", body: Body(idea: coachInput), timeout: 90)
        } catch {
            coachError = "تعذر تطوير الفكرة الآن — حاول بعد قليل"
        }
        coachLoading = false
    }

    func loadStyleProfileIfNeeded() async {
        guard styleProfile == nil, !styleLoading else { return }
        styleLoading = true
        styleProfile = try? await APIClient.shared.get(WriterStyleProfileModel.self, path: "/contributor/style-profile", ignoreCache: true)
        styleLoading = false
    }

    func review(article: WriterTrackingArticle) async {
        reviewLoading = true
        reviewError = nil
        reviewTitle = article.title
        struct Body: Encodable { let articleId: String }
        do {
            reviewResult = try await APIClient.shared.post(WriterReviewResult.self, path: "/contributor/article-review", body: Body(articleId: article.id), timeout: 90)
        } catch {
            reviewError = "تعذرت القراءة الذكية الآن — حاول بعد قليل"
        }
        reviewLoading = false
    }

    func markAllNotificationsRead() async {
        try? await APIClient.shared.markAllEditorialNotificationsRead()
        notifications = try? await APIClient.shared.fetchEditorialNotifications()
    }

    var trackingCounts: (pending: Int, action: Int, scheduled: Int, declined: Int, published: Int) {
        let tracking = workspace?.tracking ?? []
        return (
            tracking.filter { $0.reviewStatus == "pending_review" }.count,
            tracking.filter { $0.reviewStatus == "needs_changes" }.count,
            tracking.filter { $0.status == "scheduled" }.count,
            tracking.filter { $0.reviewStatus == "rejected" || $0.status == "archived" || $0.status == "rejected" }.count,
            tracking.filter { $0.status == "published" }.count
        )
    }
}

// MARK: - Container

struct WriterWorkspaceView: View {
    enum WorkspaceTab: String, CaseIterable {
        case today = "اليوم"
        case ideas = "أفكاري"
        case articles = "مقالاتي"
        case performance = "أدائي"
    }

    @Environment(AuthStore.self) private var authStore
    @StateObject private var vm = WriterWorkspaceViewModel()
    @State private var tab: WorkspaceTab = .today
    @State private var showReviewSheet = false

    /// مساحة العمل الكاملة لكاتب الرأي فقط؛ غيره (مراسل/إداري) يرى الأداء كما كان
    private var isOpinionWriter: Bool { authStore.currentUser?.isWriter == true }

    var body: some View {
        Group {
            if isOpinionWriter {
                VStack(spacing: 0) {
                    segmentBar
                    Divider().opacity(0.25)
                    switch tab {
                    case .today: todaySegment
                    case .ideas: ideasSegment
                    case .articles: articlesSegment
                    case .performance: ContributorDashboardView(embedded: true)
                    }
                }
            } else {
                ContributorDashboardView()
            }
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(isOpinionWriter ? "لوحة الكاتب" : "لوحة الأداء")
        .navigationBarTitleDisplayMode(.large)
        .task {
            guard isOpinionWriter else { return }
            await vm.load()
        }
        .sheet(isPresented: $showReviewSheet) { reviewSheet }
        .onChange(of: vm.reviewResult != nil) { _, hasResult in
            if hasResult { showReviewSheet = true }
        }
    }

    // MARK: شريط التبويبات

    private var unreadCount: Int { vm.notifications?.unread ?? 0 }

    private var segmentBar: some View {
        HStack(spacing: 6) {
            ForEach(WorkspaceTab.allCases, id: \.self) { item in
                Button {
                    withAnimation(.snappy(duration: 0.2)) { tab = item }
                } label: {
                    HStack(spacing: 4) {
                        Text(item.rawValue)
                            .font(SabqFonts.app(size: 13, weight: tab == item ? .bold : .semibold))
                        if item == .articles, unreadCount > 0 {
                            Text("\(min(unreadCount, 99))")
                                .font(SabqFonts.app(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1.5)
                                .background(Capsule().fill(SabqTheme.coral))
                        }
                    }
                    .foregroundStyle(tab == item ? .white : SabqTheme.secondaryInk)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity)
                    .background(
                        Capsule().fill(tab == item ? SabqTheme.sky : SabqTheme.paleFill)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - تبويب «اليوم»

    private var todaySegment: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    scheduleCard
                    if unreadCount > 0 { alertsCard }
                    monthlyBriefCard
                    deskCard
                    readerPulseCard
                    followUpCard
                    calendarCard
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 100)
        }
        .refreshable { await vm.load() }
    }

    @ViewBuilder
    private var scheduleCard: some View {
        if let sched = vm.schedule {
            if let banner = sched.banner {
                WriterScheduleBannerCard(banner: banner)
            } else if sched.canChoose {
                WriterDayPickerCard(
                    dayLoads: sched.dayLoads,
                    saving: vm.savingDay,
                    errorText: vm.scheduleError
                ) { day in
                    Task { await vm.pickDay(day) }
                }
            }
        }
    }

    private var alertsCard: some View {
        workspaceCard(icon: "bell.badge.fill", tint: SabqTheme.coral, title: "تنبيهات تحريرية بانتظارك") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach((vm.notifications?.items.filter { $0.readAt == nil }.prefix(2)) ?? []) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title)
                            .font(SabqFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                        Text(item.body)
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineLimit(2)
                    }
                }
                HStack {
                    NavigationLink(value: EditorialNotificationsRoute()) {
                        Text("عرض كل التنبيهات (\(unreadCount))")
                            .font(SabqFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(SabqTheme.sky)
                    }
                    Spacer()
                    Button {
                        Task { await vm.markAllNotificationsRead() }
                    } label: {
                        Text("تمت قراءتها")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var monthlyBriefCard: some View {
        workspaceCard(icon: "book.fill", tint: SabqTheme.teal, title: "موجزك هذا الشهر") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    metricTile(value: "\(vm.workspace?.monthlyBrief?.publishedCount ?? 0)", label: "مقال منشور")
                    metricTile(value: (vm.workspace?.monthlyBrief?.views ?? 0).formatted(), label: "قراءة")
                }
                if let message = vm.workspace?.monthlyBrief?.message, !message.isEmpty {
                    quoteText(message)
                }
            }
        }
    }

    private var deskCard: some View {
        workspaceCard(icon: "pencil.and.outline", tint: SabqTheme.sky, title: "على مكتبك الآن") {
            if let desk = vm.workspace?.desk, !desk.isEmpty {
                VStack(spacing: 8) {
                    ForEach(desk) { item in
                        HStack(alignment: .top, spacing: 10) {
                            Circle()
                                .fill(item.reviewStatus == "needs_changes" ? SabqTheme.gold : SabqTheme.sky)
                                .frame(width: 7, height: 7)
                                .padding(.top, 5)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(SabqFonts.app(size: 13, weight: .bold))
                                    .foregroundStyle(SabqTheme.ink)
                                    .lineLimit(1)
                                Text(item.nextAction)
                                    .font(SabqFonts.app(size: 11, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.paleFill))
                    }
                }
            } else {
                emptyHint(icon: "checkmark.circle", text: "مكتبك مرتب — لا مسودات أو ملاحظات تنتظر إجراءك.")
            }
        }
    }

    private var readerPulseCard: some View {
        workspaceCard(icon: "person.2.fill", tint: SabqTheme.leaf, title: "نبض قرائك") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    metricTile(value: "\(vm.workspace?.readerPulse?.commentsCount ?? 0)", label: "تعليق حديث")
                    metricTile(value: "\(vm.workspace?.readerPulse?.positiveShare ?? 0)%", label: "نبض إيجابي")
                }
                if let highlight = vm.workspace?.readerPulse?.highlightedComment {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("«\(highlight.content)»")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.ink)
                            .lineLimit(3)
                        Text("حول: \(highlight.articleTitle)")
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.paleFill))
                } else if let message = vm.workspace?.readerPulse?.message {
                    quoteText(message)
                }
            }
        }
    }

    @ViewBuilder
    private var followUpCard: some View {
        if let followUp = vm.workspace?.followUp {
            workspaceCard(icon: "target", tint: SabqTheme.gold, title: "فرصة متابعة") {
                VStack(alignment: .leading, spacing: 8) {
                    Text(followUp.title)
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                    Text(followUp.prompt)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                    Button {
                        vm.coachInput = followUp.prompt
                        withAnimation(.snappy(duration: 0.2)) { tab = .ideas }
                    } label: {
                        Text("طوّر المتابعة")
                            .font(SabqFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(SabqTheme.sky)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private var calendarCard: some View {
        if let calendar = vm.workspace?.calendar, !calendar.isEmpty {
            workspaceCard(icon: "calendar", tint: SabqTheme.secondaryInk, title: "تقويم الإلهام") {
                VStack(spacing: 0) {
                    ForEach(calendar) { item in
                        HStack {
                            Text(item.name)
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(1)
                            Spacer()
                            Text(writerShortDate(item.date))
                                .font(SabqFonts.app(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
                        .padding(.vertical, 8)
                        if item.id != calendar.last?.id {
                            Divider().opacity(0.3)
                        }
                    }
                }
            }
        }
    }

    // MARK: - تبويب «أفكاري»

    private var ideasSegment: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                coachCard
                ideasListCard
                styleProfileCard
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 100)
        }
        // سحب الإصبع نحو الأسفل يُنزل الكيبورد أثناء الكتابة في استوديو الفكرة
        .scrollDismissesKeyboard(.interactively)
        .task { await vm.loadStyleProfileIfNeeded() }
        .refreshable { await vm.load() }
    }

    private var coachCard: some View {
        workspaceCard(icon: "brain.head.profile", tint: SabqTheme.sky, title: "استوديو الفكرة") {
            VStack(alignment: .leading, spacing: 10) {
                Text("اكتب بذرة الفكرة، وسنساعدك بالأسئلة والخريطة دون كتابة المقال بدلًا عنك.")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                TextEditor(text: $vm.coachInput)
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .frame(minHeight: 90)
                    .padding(8)
                    .scrollContentBackground(.hidden)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.paleFill))
                if let coachError = vm.coachError {
                    Text(coachError)
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.coral)
                }
                Button {
                    Task { await vm.coach() }
                } label: {
                    HStack(spacing: 6) {
                        if vm.coachLoading {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "wand.and.stars")
                        }
                        Text("تحدث مع فكرتك")
                    }
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .background(Capsule().fill(SabqTheme.sky.opacity(
                        vm.coachInput.trimmingCharacters(in: .whitespacesAndNewlines).count >= 12 ? 1 : 0.4
                    )))
                }
                .buttonStyle(.plain)
                .disabled(vm.coachLoading || vm.coachInput.trimmingCharacters(in: .whitespacesAndNewlines).count < 12)
                if let result = vm.coachResult {
                    coachResultView(result)
                }
            }
        }
    }

    private func coachResultView(_ result: WriterCoachResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let reflection = result.reflection, !reflection.isEmpty {
                quoteText(reflection)
            }
            bulletBlock(title: "أسئلة تشحذ الفكرة", items: result.questions, icon: "questionmark.circle")
            bulletBlock(title: "أطروحات محتملة", items: result.thesisOptions, icon: "lightbulb")
            bulletBlock(title: "خريطة المقال", items: result.outline, icon: "list.number")
            if let counterpoint = result.counterpoint, !counterpoint.isEmpty {
                bulletBlock(title: "الرأي المضاد", items: [counterpoint], icon: "arrow.left.arrow.right")
            }
            bulletBlock(title: "مصادر تبحث عنها", items: result.sourcesToSeek, icon: "doc.text.magnifyingglass")
            bulletBlock(title: "احذر", items: result.cautions, icon: "exclamationmark.triangle")
        }
        .padding(.top, 4)
    }

    private var ideasListCard: some View {
        workspaceCard(icon: "lightbulb.fill", tint: SabqTheme.gold, title: "بوصلة الأفكار") {
            VStack(alignment: .leading, spacing: 10) {
                if !vm.ideasRequested {
                    Text("ثلاث فرص منتقاة لك بالذكاء الاصطناعي — تُولَّد عند طلبك فقط.")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                    Button {
                        Task { await vm.requestIdeas() }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "sparkles")
                            Text("اقترح 3 أفكار")
                        }
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(SabqTheme.gold))
                    }
                    .buttonStyle(.plain)
                } else if vm.ideasLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 80)
                } else if vm.ideas.isEmpty {
                    emptyHint(icon: "lightbulb", text: "تعذر جلب الأفكار — جرّب مرة أخرى بعد قليل.")
                } else {
                    VStack(spacing: 10) {
                        ForEach(vm.ideas) { idea in
                            ideaCard(idea)
                        }
                    }
                    Button {
                        Task { await vm.requestIdeas() }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "arrow.clockwise")
                            Text("أفكار جديدة")
                        }
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SabqTheme.sky)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func ideaCard(_ idea: WriterIdeaModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(ideaKindLabel(idea.kind))
                    .font(SabqFonts.app(size: 10, weight: .bold))
                    .foregroundStyle(SabqTheme.sky)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(SabqTheme.sky.opacity(0.10)))
                Spacer()
            }
            Text(idea.title)
                .font(SabqFonts.app(size: 13, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Text(idea.angle)
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            Text(idea.whyNow)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Button {
                vm.coachInput = "\(idea.title)\n\nالزاوية: \(idea.angle)"
            } label: {
                Text("ابدأ من هذه الفكرة")
                    .font(SabqFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(SabqTheme.sky)
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.paleFill))
    }

    private func ideaKindLabel(_ kind: String) -> String {
        switch kind {
        case "follow_up": return "متابعة"
        case "timely": return "مناسبة قريبة"
        default: return "تخصصك"
        }
    }

    private var styleProfileCard: some View {
        workspaceCard(icon: "signature", tint: SabqTheme.teal, title: "بصمتك الأسلوبية") {
            if vm.styleLoading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 60)
            } else if let profile = vm.styleProfile {
                if profile.ready {
                    VStack(alignment: .leading, spacing: 8) {
                        if let signature = profile.signature, !signature.isEmpty {
                            quoteText(signature)
                        }
                        bulletBlock(title: "ملامح صوتك", items: profile.traits, icon: "checkmark.seal")
                        bulletBlock(title: "لتقوية أثرك", items: profile.guidance, icon: "arrow.up.right")
                    }
                } else {
                    emptyHint(icon: "signature", text: profile.message ?? "يُبنى ملف أسلوبك بعد نشر أول مقال.")
                }
            } else {
                emptyHint(icon: "signature", text: "يُبنى ملف الأسلوب من مقالاتك المنشورة.")
            }
        }
    }

    // MARK: - تبويب «مقالاتي»

    private var articlesSegment: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    trackingCountersRow
                    if unreadCount > 0 { alertsCard }
                    if vm.trackingCounts.action > 0 { needsChangesCallout }
                    trackingList
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 100)
        }
        .refreshable { await vm.load() }
    }

    private var trackingCountersRow: some View {
        let counts = vm.trackingCounts
        return VStack(spacing: 8) {
            HStack(spacing: 8) {
                trackingCounter(label: "تحت المراجعة", value: counts.pending, tint: SabqTheme.sky)
                trackingCounter(label: "تحتاج إجراءك", value: counts.action, tint: SabqTheme.gold)
                trackingCounter(label: "مجدولة", value: counts.scheduled, tint: SabqTheme.teal)
            }
            HStack(spacing: 8) {
                trackingCounter(label: "غير صالحة للنشر", value: counts.declined, tint: SabqTheme.coral)
                trackingCounter(label: "منشورة", value: counts.published, tint: SabqTheme.leaf)
            }
        }
    }

    private func trackingCounter(label: String, value: Int, tint: Color) -> some View {
        VStack(spacing: 3) {
            Text("\(value)")
                .font(SabqFonts.app(size: 18, weight: .heavy))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .font(SabqFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
    }

    private var needsChangesCallout: some View {
        NavigationLink(value: ArticleRevisionsRoute()) {
            HStack(spacing: 10) {
                Image(systemName: "pencil.and.list.clipboard")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.gold)
                VStack(alignment: .leading, spacing: 2) {
                    Text("مقالات تحتاج لمستك (\(vm.trackingCounts.action))")
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                    Text("ملاحظات التحرير جاهزة — اضغط للتعديل مباشرة.")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Spacer()
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.gold.opacity(0.10)))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SabqTheme.gold.opacity(0.35), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var trackingList: some View {
        let tracking = vm.workspace?.tracking ?? []
        if tracking.isEmpty {
            emptyHint(icon: "square.and.pencil", text: "هنا تبدأ الحكاية — أرسل مقالك الأول من «إرسال مقال رأي».")
        } else {
            VStack(spacing: 10) {
                ForEach(tracking) { article in
                    trackingCard(article)
                }
            }
        }
    }

    private func trackingCard(_ article: WriterTrackingArticle) -> some View {
        let info = trackingStatusInfo(article)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Text(article.title)
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(2)
                Spacer(minLength: 8)
                Text(info.label)
                    .font(SabqFonts.app(size: 10, weight: .bold))
                    .foregroundStyle(info.tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(info.tint.opacity(0.12)))
            }
            if let date = trackingDateLine(article) {
                Text(date)
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            if let notes = article.reviewNotes, !notes.isEmpty, article.reviewStatus == "needs_changes" || article.reviewStatus == "rejected" {
                Text("ملاحظة التحرير: \(notes)")
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(SabqTheme.gold.opacity(0.08)))
            }
            HStack(spacing: 14) {
                if article.reviewStatus == "needs_changes" {
                    NavigationLink(value: ArticleRevisionsRoute()) {
                        actionLabel(icon: "pencil", text: "عدّل حسب الملاحظات", tint: SabqTheme.gold)
                    }
                    .buttonStyle(.plain)
                }
                Button {
                    Task { await vm.review(article: article) }
                } label: {
                    actionLabel(
                        icon: vm.reviewLoading && vm.reviewTitle == article.title ? "hourglass" : "brain.head.profile",
                        text: "قارئ سبق الأول",
                        tint: SabqTheme.sky
                    )
                }
                .buttonStyle(.plain)
                .disabled(vm.reviewLoading)
                Spacer()
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
    }

    private func trackingStatusInfo(_ article: WriterTrackingArticle) -> (label: String, tint: Color) {
        if article.reviewStatus == "needs_changes" { return ("تحتاج إجراءك", SabqTheme.gold) }
        if article.reviewStatus == "rejected" || article.status == "rejected" || article.status == "archived" {
            return ("غير صالحة للنشر", SabqTheme.coral)
        }
        if article.status == "published" { return ("منشورة", SabqTheme.leaf) }
        if article.status == "scheduled" { return ("مجدولة", SabqTheme.teal) }
        if article.reviewStatus == "pending_review" { return ("تحت المراجعة", SabqTheme.sky) }
        return ("مسودة", SabqTheme.secondaryInk)
    }

    private func trackingDateLine(_ article: WriterTrackingArticle) -> String? {
        if article.status == "published", let published = article.publishedAt {
            return "نُشرت \(writerShortDate(published, withTime: true))"
        }
        if article.status == "scheduled", let scheduled = article.scheduledAt {
            return "موعد النشر \(writerShortDate(scheduled, withTime: true))"
        }
        if let updated = article.updatedAt {
            return "آخر تحديث \(writerShortDate(updated, withTime: true))"
        }
        return nil
    }

    // MARK: - قارئ سبق الأول (Sheet)

    private var reviewSheet: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "brain.head.profile")
                        .font(SabqFonts.app(size: 20, weight: .semibold))
                        .foregroundStyle(SabqTheme.sky)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("قارئ سبق الأول")
                            .font(SabqFonts.app(size: 17, weight: .heavy))
                            .foregroundStyle(SabqTheme.ink)
                        Text(vm.reviewTitle)
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineLimit(2)
                    }
                }
                if let result = vm.reviewResult {
                    if let score = result.overallScore {
                        HStack(spacing: 8) {
                            Text("\(score)")
                                .font(SabqFonts.app(size: 28, weight: .heavy))
                                .foregroundStyle(score >= 70 ? SabqTheme.leaf : score >= 50 ? SabqTheme.gold : SabqTheme.coral)
                                .monospacedDigit()
                            Text("من 100 — الملاحظات اقتراحات اختيارية، وأنت صاحب النص النهائي.")
                                .font(SabqFonts.app(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.secondaryInk)
                        }
                    }
                    if let summary = result.summary, !summary.isEmpty {
                        quoteText(summary)
                    }
                    ForEach(result.checks) { check in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(check.score)")
                                .font(SabqFonts.app(size: 13, weight: .heavy))
                                .foregroundStyle(check.score >= 70 ? SabqTheme.leaf : check.score >= 50 ? SabqTheme.gold : SabqTheme.coral)
                                .monospacedDigit()
                                .frame(width: 30, alignment: .center)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(check.label)
                                    .font(SabqFonts.app(size: 12, weight: .bold))
                                    .foregroundStyle(SabqTheme.ink)
                                Text(check.note)
                                    .font(SabqFonts.app(size: 11, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(10)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.paleFill))
                    }
                    bulletBlock(title: "عناوين مقترحة", items: result.headlineSuggestions, icon: "textformat")
                    bulletBlock(title: "نقاط قوة", items: result.strengths, icon: "hand.thumbsup")
                    bulletBlock(title: "ادّعاءات تحتاج توثيقًا", items: result.sourceFlags + result.sensitiveClaims, icon: "exclamationmark.triangle")
                }
            }
            .padding(20)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .presentationDetents([.medium, .large])
        .onDisappear { vm.reviewResult = nil }
    }

    // MARK: - لبنات مشتركة

    private func workspaceCard(icon: String, tint: Color, title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
                Text(title)
                    .font(SabqFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Spacer()
            }
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(SabqTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
    }

    private func metricTile(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(SabqFonts.app(size: 18, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .monospacedDigit()
            Text(label)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.paleFill))
    }

    private func quoteText(_ text: String) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 12, weight: .medium))
            .foregroundStyle(SabqTheme.secondaryInk)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.paleFill))
    }

    @ViewBuilder
    private func bulletBlock(title: String, items: [String], icon: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 5) {
                    Image(systemName: icon)
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.sky)
                    Text(title)
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: 6) {
                        Circle().fill(SabqTheme.tertiaryInk).frame(width: 4, height: 4).padding(.top, 6)
                        Text(item)
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                }
            }
        }
    }

    private func actionLabel(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 11, weight: .semibold))
            Text(text)
                .font(SabqFonts.app(size: 12, weight: .bold))
        }
        .foregroundStyle(tint)
    }

    private func emptyHint(icon: String, text: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 22, weight: .light))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text(text)
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }
}

// تاريخ عربي مختصر بتوقيت الرياض — نسخة محلية لأن نظيرتها في
// ContributorDashboardView خاصة بملفها
private func writerShortDate(_ iso: String, withTime: Bool = false) -> String {
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date else { return "" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "ar")
    formatter.timeZone = TimeZone(identifier: "Asia/Riyadh")
    formatter.dateFormat = withTime ? "EEEE d MMMM — h:mm a" : "d MMMM"
    return formatter.string(from: date)
}
