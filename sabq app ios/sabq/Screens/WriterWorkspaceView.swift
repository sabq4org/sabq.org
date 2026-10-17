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

    /// يتحقق مما إذا كان للكاتب مقال في المسودات أو قيد المراجعة أو مجدول ولم يُنشر بعد.
    var blockingUnpublishedArticle: (title: String, stage: String, scheduledAt: String?)? {
        if let active = schedule?.activeArticle {
            return (active.title, active.stage, active.scheduledAt)
        }
        let tracking = workspace?.tracking ?? []
        if let scheduled = tracking.first(where: { $0.status == "scheduled" }) {
            return (scheduled.title, "scheduled", scheduled.scheduledAt)
        }
        if let activeDraft = tracking.first(where: {
            $0.status == "draft" && $0.reviewStatus != "rejected"
        }) {
            return (activeDraft.title, activeDraft.reviewStatus ?? "draft", activeDraft.scheduledAt)
        }
        if let deskItem = (workspace?.desk ?? []).first(where: {
            ($0.status == "draft" || $0.status == "scheduled") && $0.reviewStatus != "rejected"
        }) {
            return (deskItem.title, deskItem.status == "scheduled" ? "scheduled" : (deskItem.reviewStatus ?? "draft"), nil)
        }
        return nil
    }

    var canCreateNewArticle: Bool {
        !isLoading && blockingUnpublishedArticle == nil
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
    @State private var showNewOpinionSheet = false

    /// مساحة العمل الكاملة لكاتب الرأي فقط؛ غيره (مراسل/إداري) يرى الأداء كما كان
    private var isOpinionWriter: Bool { authStore.currentUser?.isWriter == true }

    var body: some View {
        Group {
            if isOpinionWriter {
                VStack(spacing: 0) {
                    writerHeaderBar
                    segmentBar
                    Divider().overlay(SabqTheme.separator)
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
        .navigationTitle(isOpinionWriter ? "" : "لوحة الأداء")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SabqTheme.background, for: .navigationBar)
        .task {
            guard isOpinionWriter else { return }
            await vm.load()
        }
        .sheet(isPresented: $showReviewSheet) { reviewSheet }
        .sheet(isPresented: $showNewOpinionSheet, onDismiss: {
            Task { await vm.load() }
        }) {
            ArticleSubmissionView(kind: .opinion)
        }
        .onChange(of: vm.reviewResult != nil) { _, hasResult in
            if hasResult { showReviewSheet = true }
        }
    }

    // MARK: شريط الترويسة وزر إضافة مقال

    private var writerHeaderBar: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .center, spacing: SabqLayout.space12) {
                Text("لوحة الكاتب")
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)

                Spacer(minLength: 0)

                Button {
                    guard vm.canCreateNewArticle else { return }
                    showNewOpinionSheet = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: vm.canCreateNewArticle ? "square.and.pencil" : "lock.fill")
                            .font(.system(size: 13, weight: .semibold))
                        Text("إضافة مقال")
                            .sabqText(SabqType.metaEmphasis)
                    }
                    .foregroundStyle(vm.canCreateNewArticle ? SabqTheme.onAction : SabqTheme.disabledInk)
                    .padding(.horizontal, SabqLayout.space12)
                    .frame(minHeight: 38)
                    .background(
                        Capsule(style: .continuous)
                            .fill(vm.canCreateNewArticle ? SabqTheme.actionFill : SabqTheme.disabledFill)
                    )
                    .contentShape(Capsule(style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!vm.canCreateNewArticle)
            }
            .environment(\.layoutDirection, .rightToLeft)

            if let blocking = vm.blockingUnpublishedArticle {
                HStack(alignment: .center, spacing: SabqLayout.space8) {
                    Image(systemName: blocking.stage == "scheduled" ? "calendar.badge.clock" : "clock.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(SabqTheme.warning)
                    Text(blockingBannerText(blocking))
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    if tab != .articles {
                        Button {
                            withAnimation(.snappy(duration: 0.2)) { tab = .articles }
                        } label: {
                            Text("مقالاتي ‹")
                                .sabqText(SabqType.tag)
                                .foregroundStyle(SabqTheme.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, SabqLayout.space12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.warning.opacity(0.08))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .strokeBorder(SabqTheme.warning.opacity(0.22), lineWidth: 0.75)
                )
                .environment(\.layoutDirection, .rightToLeft)
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space8)
        .padding(.bottom, SabqLayout.space4)
    }

    private func blockingBannerText(_ blocking: (title: String, stage: String, scheduledAt: String?)) -> String {
        switch blocking.stage {
        case "scheduled":
            return "لا يمكن إضافة مقال جديد حالياً؛ لديك مقال مجدول للنشر («\(blocking.title)»)."
        case "pending_review", "approved":
            return "لا يمكن إضافة مقال جديد حالياً؛ مقالك «\(blocking.title)» قيد المراجعة والجدولة."
        case "needs_changes":
            return "لا يمكن إضافة مقال جديد حالياً؛ مقالك «\(blocking.title)» بانتظار تعديلك."
        default:
            return "لا يمكن إضافة مقال جديد حالياً؛ لديك مسودة لم تُنشر بعد («\(blocking.title)»)."
        }
    }

    // MARK: شريط التبويبات

    private var unreadCount: Int { vm.notifications?.unread ?? 0 }

    private var segmentBar: some View {
        HStack(spacing: SabqLayout.space8) {
            ForEach(WorkspaceTab.allCases, id: \.self) { item in
                let isActive = tab == item
                Button {
                    withAnimation(.snappy(duration: 0.2)) { tab = item }
                } label: {
                    HStack(spacing: SabqLayout.space4) {
                        Text(item.rawValue)
                            .sabqText(SabqType.metaEmphasis)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        if item == .articles, unreadCount > 0 {
                            Text("\(min(unreadCount, 99))")
                                .sabqText(SabqType.tag)
                                .foregroundStyle(SabqTheme.background)
                                .padding(.horizontal, SabqLayout.space4)
                                .frame(minWidth: 18)
                                .background(Capsule().fill(SabqTheme.danger))
                        }
                    }
                    .foregroundStyle(isActive ? SabqTheme.onAction : SabqTheme.textPrimary)
                    .padding(.horizontal, SabqLayout.space8)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)
                    .background(
                        Capsule().fill(isActive ? SabqTheme.actionFill : SabqTheme.surfaceMuted)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isActive ? [.isSelected] : [])
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.vertical, SabqLayout.space8)
    }

    // MARK: - تبويب «اليوم»

    private var todaySegment: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.sectionGap) {
                if vm.isLoading {
                    ProgressView().tint(SabqTheme.primary).frame(maxWidth: .infinity, minHeight: 200)
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
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, 104)
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
        workspaceCard(icon: "bell.badge", tint: SabqTheme.danger, title: "تنبيهات تحريرية بانتظارك") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach((vm.notifications?.items.filter { $0.readAt == nil }.prefix(2)) ?? []) { item in
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        Text(item.title)
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                        Text(item.body)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, SabqLayout.space12)
                    Divider().overlay(SabqTheme.separator)
                }
                HStack {
                    NavigationLink(value: EditorialNotificationsRoute()) {
                        Text("عرض كل التنبيهات (\(unreadCount))")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.primary)
                            .frame(minHeight: SabqLayout.touchTarget)
                    }
                    Spacer()
                    Button {
                        Task { await vm.markAllNotificationsRead() }
                    } label: {
                        Text("تمت قراءتها")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .frame(minHeight: SabqLayout.touchTarget)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var monthlyBriefCard: some View {
        workspaceCard(icon: "book", tint: SabqTheme.teal, title: "موجزك هذا الشهر") {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
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
        workspaceCard(icon: "pencil.and.outline", tint: SabqTheme.primary, title: "على مكتبك الآن") {
            if let desk = vm.workspace?.desk, !desk.isEmpty {
                VStack(spacing: 0) {
                    ForEach(desk) { item in
                        if item.id != desk.first?.id {
                            Divider().overlay(SabqTheme.separator)
                        }
                        HStack(alignment: .top, spacing: SabqLayout.space12) {
                            Circle()
                                .fill(item.reviewStatus == "needs_changes" ? SabqTheme.warning : SabqTheme.primary)
                                .frame(width: 8, height: 8)
                                .padding(.top, SabqLayout.space8)
                            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                                Text(item.title)
                                    .sabqText(SabqType.rowTitle)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                    .lineLimit(2)
                                Text(item.nextAction)
                                    .sabqText(SabqType.meta)
                                    .foregroundStyle(SabqTheme.textSecondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, SabqLayout.space12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            } else {
                emptyHint(icon: "checkmark.circle", text: "مكتبك مرتب — لا مسودات أو ملاحظات تنتظر إجراءك.")
            }
        }
    }

    private var readerPulseCard: some View {
        workspaceCard(icon: "person.2", tint: SabqTheme.success, title: "نبض قرائك") {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    metricTile(value: "\(vm.workspace?.readerPulse?.commentsCount ?? 0)", label: "تعليق حديث")
                    metricTile(value: "\(vm.workspace?.readerPulse?.positiveShare ?? 0)%", label: "نبض إيجابي")
                }
                if let highlight = vm.workspace?.readerPulse?.highlightedComment {
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        Text("«\(highlight.content)»")
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(3)
                        Text("حول: \(highlight.articleTitle)")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textTertiary)
                    }
                    .padding(SabqLayout.space12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
                } else if let message = vm.workspace?.readerPulse?.message {
                    quoteText(message)
                }
            }
        }
    }

    @ViewBuilder
    private var followUpCard: some View {
        if let followUp = vm.workspace?.followUp {
            workspaceCard(icon: "target", tint: SabqTheme.warning, title: "فرصة متابعة") {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(followUp.title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text(followUp.prompt)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Button {
                        vm.coachInput = followUp.prompt
                        withAnimation(.snappy(duration: 0.2)) { tab = .ideas }
                    } label: {
                        Text("طوّر المتابعة")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.primary)
                            .frame(minHeight: SabqLayout.touchTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private var calendarCard: some View {
        if let calendar = vm.workspace?.calendar, !calendar.isEmpty {
            workspaceCard(icon: "calendar", tint: SabqTheme.textSecondary, title: "تقويم الإلهام") {
                VStack(spacing: 0) {
                    ForEach(calendar) { item in
                        HStack {
                            Text(item.name)
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .lineLimit(1)
                            Spacer()
                            Text(writerShortDate(item.date))
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.textTertiary)
                        }
                        .padding(.vertical, SabqLayout.space12)
                        if item.id != calendar.last?.id {
                            Divider().overlay(SabqTheme.separator)
                        }
                    }
                }
            }
        }
    }

    // MARK: - تبويب «أفكاري»

    private var ideasSegment: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.sectionGap) {
                coachCard
                ideasListCard
                styleProfileCard
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, 104)
        }
        // سحب الإصبع نحو الأسفل يُنزل الكيبورد أثناء الكتابة في استوديو الفكرة
        .scrollDismissesKeyboard(.interactively)
        .task { await vm.loadStyleProfileIfNeeded() }
        .refreshable { await vm.load() }
    }

    private var coachCard: some View {
        let canCoach = vm.coachInput.trimmingCharacters(in: .whitespacesAndNewlines).count >= 12
        return workspaceCard(icon: "brain.head.profile", tint: SabqTheme.primary, title: "استوديو الفكرة") {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                Text("اكتب بذرة الفكرة، وسنساعدك بالأسئلة والخريطة دون كتابة المقال بدلًا عنك.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                TextEditor(text: $vm.coachInput)
                    .font(SabqType.excerpt.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .frame(minHeight: 96)
                    .padding(SabqLayout.space8)
                    .scrollContentBackground(.hidden)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surface))
                    .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
                if let coachError = vm.coachError {
                    Text(coachError)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.danger)
                }
                Button {
                    Task { await vm.coach() }
                } label: {
                    HStack(spacing: SabqLayout.space8) {
                        if vm.coachLoading {
                            ProgressView().tint(SabqTheme.onAction)
                        } else {
                            Image(systemName: "wand.and.stars")
                        }
                        Text("تحدث مع فكرتك")
                    }
                    .font(SabqType.button.font)
                    .foregroundStyle(canCoach || vm.coachLoading ? SabqTheme.onAction : SabqTheme.disabledInk)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(canCoach || vm.coachLoading ? SabqTheme.actionFill : SabqTheme.disabledFill)
                    )
                }
                .buttonStyle(.plain)
                .disabled(vm.coachLoading || !canCoach)
                if let result = vm.coachResult {
                    coachResultView(result)
                }
            }
        }
    }

    private func coachResultView(_ result: WriterCoachResult) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
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
        .padding(.top, SabqLayout.space4)
    }

    private var ideasListCard: some View {
        workspaceCard(icon: "lightbulb", tint: SabqTheme.warning, title: "بوصلة الأفكار") {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                if !vm.ideasRequested {
                    Text("ثلاث فرص منتقاة لك بالذكاء الاصطناعي — تُولَّد عند طلبك فقط.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Button {
                        Task { await vm.requestIdeas() }
                    } label: {
                        HStack(spacing: SabqLayout.space8) {
                            Image(systemName: "sparkles")
                            Text("اقترح 3 أفكار")
                        }
                        .font(SabqType.button.font)
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, SabqLayout.space24)
                        .frame(minHeight: SabqLayout.controlHeight)
                        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.actionFill))
                    }
                    .buttonStyle(.plain)
                } else if vm.ideasLoading {
                    ProgressView().tint(SabqTheme.primary).frame(maxWidth: .infinity, minHeight: 80)
                } else if vm.ideas.isEmpty {
                    emptyHint(icon: "lightbulb", text: "تعذر جلب الأفكار — جرّب مرة أخرى بعد قليل.")
                } else {
                    VStack(spacing: 0) {
                        ForEach(vm.ideas) { idea in
                            if idea.id != vm.ideas.first?.id {
                                Divider().overlay(SabqTheme.separator)
                            }
                            ideaCard(idea)
                        }
                    }
                    Button {
                        Task { await vm.requestIdeas() }
                    } label: {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "arrow.clockwise")
                            Text("أفكار جديدة")
                        }
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.primary)
                        .frame(minHeight: SabqLayout.touchTarget)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func ideaCard(_ idea: WriterIdeaModel) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            StatusChip(title: ideaKindLabel(idea.kind), tint: SabqTheme.primary)
            Text(idea.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .padding(.top, SabqLayout.space4)
            Text(idea.angle)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
            Text(idea.whyNow)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textTertiary)
            Button {
                vm.coachInput = "\(idea.title)\n\nالزاوية: \(idea.angle)"
            } label: {
                Text("ابدأ من هذه الفكرة")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.primary)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.top, SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
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
                ProgressView().tint(SabqTheme.primary).frame(maxWidth: .infinity, minHeight: 60)
            } else if let profile = vm.styleProfile {
                if profile.ready {
                    VStack(alignment: .leading, spacing: SabqLayout.space16) {
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
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                if vm.isLoading {
                    ProgressView().tint(SabqTheme.primary).frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    trackingCountersRow
                    if unreadCount > 0 { alertsCard }
                    if vm.trackingCounts.action > 0 { needsChangesCallout }
                    trackingList
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, 104)
        }
        .refreshable { await vm.load() }
    }

    private var trackingCountersRow: some View {
        let counts = vm.trackingCounts
        return VStack(spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                trackingCounter(label: "تحت المراجعة", value: counts.pending, tint: SabqTheme.primary)
                trackingCounter(label: "تحتاج إجراءك", value: counts.action, tint: SabqTheme.warning)
                trackingCounter(label: "مجدولة", value: counts.scheduled, tint: SabqTheme.teal)
            }
            HStack(spacing: SabqLayout.space8) {
                trackingCounter(label: "غير صالحة للنشر", value: counts.declined, tint: SabqTheme.danger)
                trackingCounter(label: "منشورة", value: counts.published, tint: SabqTheme.success)
            }
        }
    }

    private func trackingCounter(label: String, value: Int, tint: Color) -> some View {
        VStack(spacing: SabqLayout.space4) {
            Text("\(value)")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
        .accessibilityElement(children: .combine)
    }

    private var needsChangesCallout: some View {
        NavigationLink(value: ArticleRevisionsRoute()) {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "pencil.and.list.clipboard")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.warning)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("مقالات تحتاج لمستك (\(vm.trackingCounts.action))")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("ملاحظات التحرير جاهزة — اضغط للتعديل مباشرة.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer()
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            .padding(SabqLayout.space16)
            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var trackingList: some View {
        let tracking = vm.workspace?.tracking ?? []
        if tracking.isEmpty {
            emptyHint(icon: "square.and.pencil", text: "هنا تبدأ الحكاية — أرسل مقالك الأول من «إرسال مقال رأي».")
        } else {
            VStack(spacing: 0) {
                ForEach(tracking) { article in
                    if article.id != tracking.first?.id {
                        Divider().overlay(SabqTheme.separator)
                    }
                    trackingCard(article)
                }
            }
        }
    }

    private func trackingCard(_ article: WriterTrackingArticle) -> some View {
        let info = trackingStatusInfo(article)
        return VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .top, spacing: SabqLayout.space8) {
                Text(article.title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(2)
                Spacer(minLength: SabqLayout.space8)
                StatusChip(title: info.label, tint: info.tint)
            }
            if let date = trackingDateLine(article) {
                Text(date)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            if let notes = article.reviewNotes, !notes.isEmpty, article.reviewStatus == "needs_changes" || article.reviewStatus == "rejected" {
                Text("ملاحظة التحرير: \(notes)")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .padding(SabqLayout.space12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
            }
            HStack(spacing: SabqLayout.space16) {
                if article.reviewStatus == "needs_changes" {
                    NavigationLink(value: ArticleRevisionsRoute()) {
                        actionLabel(icon: "pencil", text: "عدّل حسب الملاحظات", tint: SabqTheme.primary)
                    }
                    .buttonStyle(.plain)
                }
                Button {
                    Task { await vm.review(article: article) }
                } label: {
                    actionLabel(
                        icon: vm.reviewLoading && vm.reviewTitle == article.title ? "hourglass" : "brain.head.profile",
                        text: "قارئ سبق الأول",
                        tint: SabqTheme.primary
                    )
                }
                .buttonStyle(.plain)
                .disabled(vm.reviewLoading)
                Spacer()
            }
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func trackingStatusInfo(_ article: WriterTrackingArticle) -> (label: String, tint: Color) {
        if article.reviewStatus == "needs_changes" { return ("تحتاج إجراءك", SabqTheme.warning) }
        if article.reviewStatus == "rejected" || article.status == "rejected" || article.status == "archived" {
            return ("غير صالحة للنشر", SabqTheme.danger)
        }
        if article.status == "published" { return ("منشورة", SabqTheme.success) }
        if article.status == "scheduled" { return ("مجدولة", SabqTheme.teal) }
        if article.reviewStatus == "pending_review" { return ("تحت المراجعة", SabqTheme.primary) }
        return ("مسودة", SabqTheme.textSecondary)
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
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                HStack(alignment: .top, spacing: SabqLayout.space12) {
                    Image(systemName: "brain.head.profile")
                        .font(SabqFonts.app(size: 20, weight: .semibold))
                        .foregroundStyle(SabqTheme.primary)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        Text("قارئ سبق الأول")
                            .sabqText(SabqType.sectionHeading)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .accessibilityAddTraits(.isHeader)
                        Text(vm.reviewTitle)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(2)
                    }
                }
                if let result = vm.reviewResult {
                    if let score = result.overallScore {
                        HStack(spacing: SabqLayout.space12) {
                            Text("\(score)")
                                .sabqText(SabqType.articleTitle)
                                .foregroundStyle(scoreTint(score))
                                .monospacedDigit()
                            Text("من 100 — الملاحظات اقتراحات اختيارية، وأنت صاحب النص النهائي.")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                    if let summary = result.summary, !summary.isEmpty {
                        quoteText(summary)
                    }
                    VStack(spacing: 0) {
                        ForEach(result.checks) { check in
                            if check.id != result.checks.first?.id {
                                Divider().overlay(SabqTheme.separator)
                            }
                            HStack(alignment: .top, spacing: SabqLayout.space8) {
                                Text("\(check.score)")
                                    .sabqText(SabqType.rowTitle)
                                    .foregroundStyle(scoreTint(check.score))
                                    .monospacedDigit()
                                    .frame(width: 32, alignment: .center)
                                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                                    Text(check.label)
                                        .sabqText(SabqType.metaEmphasis)
                                        .foregroundStyle(SabqTheme.textPrimary)
                                    Text(check.note)
                                        .sabqText(SabqType.meta)
                                        .foregroundStyle(SabqTheme.textSecondary)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, SabqLayout.space12)
                        }
                    }
                    bulletBlock(title: "عناوين مقترحة", items: result.headlineSuggestions, icon: "textformat")
                    bulletBlock(title: "نقاط قوة", items: result.strengths, icon: "hand.thumbsup")
                    bulletBlock(title: "ادّعاءات تحتاج توثيقًا", items: result.sourceFlags + result.sensitiveClaims, icon: "exclamationmark.triangle")
                }
            }
            .padding(SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .presentationDetents([.medium, .large])
        .onDisappear { vm.reviewResult = nil }
    }

    private func scoreTint(_ score: Int) -> Color {
        score >= 70 ? SabqTheme.success : score >= 50 ? SabqTheme.warning : SabqTheme.danger
    }

    // MARK: - لبنات مشتركة

    /// قسم غير مؤطر: عنوان بأيقونة بسيطة ثم المحتوى مباشرة على الصفحة.
    private func workspaceCard(icon: String, tint: Color, title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                Text(title)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metricTile(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text(value)
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
            Text(label)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SabqLayout.space12)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
        .accessibilityElement(children: .combine)
    }

    private func quoteText(_ text: String) -> some View {
        Text(text)
            .sabqText(SabqType.excerpt)
            .foregroundStyle(SabqTheme.textSecondary)
            .padding(SabqLayout.space12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    @ViewBuilder
    private func bulletBlock(title: String, items: [String], icon: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: icon)
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(SabqTheme.primary)
                        .accessibilityHidden(true)
                    Text(title)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: SabqLayout.space8) {
                        Circle().fill(SabqTheme.textTertiary).frame(width: 4, height: 4).padding(.top, SabqLayout.space8)
                        Text(item)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }
        }
    }

    private func actionLabel(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 12, weight: .semibold))
            Text(text)
                .sabqText(SabqType.metaEmphasis)
        }
        .foregroundStyle(tint)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
    }

    private func emptyHint(icon: String, text: String) -> some View {
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 22, weight: .light))
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text(text)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space24)
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
