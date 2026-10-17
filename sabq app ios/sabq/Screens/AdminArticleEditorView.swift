import SwiftUI
import Combine
import PhotosUI
import UIKit

// MARK: - Editor view model

/// Loads the full article for editing and persists every field through the
/// admin API. Mirrors `ContributorDashboardViewModel`'s observation style.
@MainActor
final class AdminEditorViewModel: ObservableObject {
    @Published var isLoading = true
    @Published var isSaving = false
    @Published var loaded = false
    @Published var error: String?

    // Editable fields
    @Published var title = ""
    @Published var subtitle = ""
    @Published var excerpt = ""
    @Published var contentHTML = ""          // seed for the rich editor
    @Published var status: AdminArticleStatus = .draft
    @Published var newsType = "regular"
    @Published var isFeatured = false
    @Published var isReading = false
    @Published var hideFromHomepage = false
    @Published var aiSummary = ""
    @Published var imageUrl = ""
    @Published var categoryId: String?
    @Published var categoryName: String?
    @Published var reporterId: String?
    @Published var reporterName: String?
    @Published var authorId: String?
    @Published var authorName: String?
    /// A saved or explicitly selected publish date. It stays optional so a
    /// newly selected "scheduled" status can never silently submit Date().
    @Published var scheduledAt: Date?
    @Published var hasSchedule = false
    /// DatePicker's visible value before the editor has an explicit selection.
    /// A writer suggestion is a useful starting point, but it is not saved
    /// until the user changes/accepts it.
    @Published var scheduleDateDraft = Date()
    @Published var scheduleWasExplicitlySelected = false
    @Published private(set) var writerWeeklySlot: AdminWriterWeeklySlot?
    @Published private(set) var overdueSavedSchedule: Date?
    @Published var seoTitle = ""
    @Published var seoDescription = ""
    @Published var keywords: [String] = []
    @Published var articleType = "news"
    /// Live HTML length from the editor — gates the AI buttons (web parity).
    @Published var liveHTMLLength = 0

    @Published var categories: [APICategory] = []

    // AI tool progress
    @Published var isSummarizing = false
    @Published var isGeneratingSEO = false
    @Published var isUploadingImage = false
    @Published var isGeneratingAll = false
    @Published var isEditGenerating = false
    @Published var isProofreading = false
    @Published var isGeneratingImage = false

    /// Opinion articles hide subtitle + news-type (mirrors the web).
    var isOpinion: Bool { articleType == "opinion" }

    let articleId: String?
    let isNew: Bool
    private let service: AdminServicing
    private var initialStatus: AdminArticleStatus = .draft
    private var clearScheduleRequested = false

    init(articleId: String?, newArticleType: String? = nil, service: AdminServicing? = nil) {
        self.articleId = articleId
        self.isNew = (articleId == nil)
        self.service = service ?? LiveAdminService()
        if articleId == nil {
            self.articleType = newArticleType ?? "news"
            self.status = .draft
            self.scheduledAt = nil
            self.writerWeeklySlot = nil
        }
    }

    func load(includeCategories: Bool = true) async {
        isLoading = true
        error = nil
        if let id = articleId {
            do {
                let d = try await service.fetchDetail(id: id)
                title = d.title
                subtitle = d.subtitle
                excerpt = d.excerpt
                contentHTML = d.content
                liveHTMLLength = d.content.count
                status = d.status
                initialStatus = d.status
                newsType = d.newsType
                articleType = d.articleType
                isFeatured = d.isFeatured
                isReading = d.isReading
                hideFromHomepage = d.hideFromHomepage
                aiSummary = d.aiSummary
                imageUrl = d.imageUrl
                categoryId = d.categoryId
                categoryName = d.categoryName
                reporterId = d.reporterId
                reporterName = d.reporterName
                authorId = d.authorId
                authorName = d.authorName
                scheduledAt = d.scheduledAt
                writerWeeklySlot = d.writerWeeklySlot
                scheduleDateDraft = d.scheduledAt ?? d.writerWeeklySlot?.nextSlot ?? Date()
                scheduleWasExplicitlySelected = d.scheduledAt != nil
                hasSchedule = d.status == .scheduled && d.scheduledAt != nil
                overdueSavedSchedule = nil
                clearScheduleRequested = false
                seoTitle = d.seo.metaTitle
                seoDescription = d.seo.metaDescription
                keywords = d.seo.keywords
                loaded = true
            } catch {
                self.error = "تعذّر تحميل الخبر"
            }
        } else {
            // New article — fields start blank (configured in init).
            scheduledAt = nil
            writerWeeklySlot = nil
            overdueSavedSchedule = nil
            scheduleDateDraft = Date()
            scheduleWasExplicitlySelected = false
            hasSchedule = false
            loaded = true
        }
        if includeCategories {
            categories = await Self.loadCategories()
        }
        isLoading = false
    }

    /// Persist using the freshest HTML pulled from the editor at save time.
    enum SaveGuard: Equatable {
        case missingSchedule
        case scheduleInPast
    }

    /// DatePicker binding that records an explicit user choice separately from
    /// its initial display value.
    var scheduleDateBinding: Binding<Date> {
        Binding(
            get: { self.scheduleDateDraft },
            set: { self.selectScheduleDate($0) }
        )
    }

    var schedulePresentation: AdminSchedulePresentation? {
        if status == .draft && isOpinion {
            return .opinionDraft(savedAt: scheduledAt, writerSlot: writerWeeklySlot)
        }
        if status == .scheduled {
            if scheduleWasSelectedFromWriter, let scheduledAt {
                return .writerSuggestion(scheduledAt)
            }
            return .actualSchedule(scheduledAt)
        }
        return nil
    }

    var isPublishNowAction: Bool {
        status == .published && initialStatus != .published
    }

    private var scheduleWasSelectedFromWriter = false

    func setStatus(_ next: AdminArticleStatus, now: Date = Date()) {
        if status == next, next == .scheduled, let date = scheduledAt, date > now { return }
        status = next
        if next == .scheduled {
            if let saved = scheduledAt, saved <= now,
               let nextSlot = writerWeeklySlot?.nextSlot, nextSlot > now {
                overdueSavedSchedule = saved
                scheduledAt = nextSlot
                scheduleDateDraft = nextSlot
                hasSchedule = true
                scheduleWasExplicitlySelected = true
                scheduleWasSelectedFromWriter = true
                clearScheduleRequested = false
            } else if scheduledAt == nil,
                      let nextSlot = writerWeeklySlot?.nextSlot, nextSlot > now {
                scheduledAt = nextSlot
                scheduleDateDraft = nextSlot
                hasSchedule = true
                scheduleWasExplicitlySelected = true
                scheduleWasSelectedFromWriter = true
                clearScheduleRequested = false
            } else {
                hasSchedule = scheduledAt != nil
                scheduleDateDraft = scheduledAt ?? writerWeeklySlot?.nextSlot ?? Date()
                scheduleWasSelectedFromWriter = false
            }
        } else {
            if scheduleWasSelectedFromWriter, let overdueSavedSchedule {
                scheduledAt = overdueSavedSchedule
                scheduleDateDraft = overdueSavedSchedule
                scheduleWasExplicitlySelected = true
            }
            hasSchedule = false
            scheduleWasSelectedFromWriter = false
        }
    }

    func selectScheduleDate(_ date: Date) {
        scheduleDateDraft = date
        scheduledAt = date
        hasSchedule = true
        scheduleWasExplicitlySelected = true
        scheduleWasSelectedFromWriter = false
        overdueSavedSchedule = nil
        clearScheduleRequested = false
    }

    func useWriterSchedule() {
        guard let nextSlot = writerWeeklySlot?.nextSlot else { return }
        scheduleDateDraft = nextSlot
        scheduledAt = nextSlot
        hasSchedule = true
        scheduleWasExplicitlySelected = true
        scheduleWasSelectedFromWriter = true
        overdueSavedSchedule = nil
        clearScheduleRequested = false
    }

    /// Explicitly remove a saved schedule. Ordinary draft saves retain it so
    /// an overdue saved appointment remains visible to the editorial team.
    func clearSchedule() {
        scheduledAt = nil
        hasSchedule = false
        scheduleWasExplicitlySelected = false
        scheduleWasSelectedFromWriter = false
        overdueSavedSchedule = nil
        clearScheduleRequested = true
    }

    /// Changing the opinion author invalidates the old writer's suggestion and
    /// any date that was selected for that author. There is no client-side
    /// way to calculate another writer's slot safely.
    func selectAuthor(_ user: AdminUser) {
        guard authorId != user.id else { return }
        authorId = user.id
        authorName = user.name
        writerWeeklySlot = nil
        scheduledAt = nil
        hasSchedule = false
        scheduleWasExplicitlySelected = false
        scheduleWasSelectedFromWriter = false
        overdueSavedSchedule = nil
        clearScheduleRequested = true
        scheduleDateDraft = Date()
    }

    func saveGuard(now: Date = Date()) -> SaveGuard? {
        guard status == .scheduled else { return nil }
        guard hasSchedule, let scheduledAt, scheduleWasExplicitlySelected else {
            return .missingSchedule
        }
        guard scheduledAt > now else { return .scheduleInPast }
        return nil
    }

    func save(html: String, now: Date = Date()) async -> Bool {
        isSaving = true
        defer { isSaving = false }
        if let guardFailure = saveGuard(now: now) {
            error = guardFailure == .missingSchedule
                ? "اختر موعدًا مستقبليًا صريحًا قبل الجدولة"
                : "لا يمكن جدولة المادة في موعد مضى"
            return false
        }
        let scheduledISO: String?
        if status == .scheduled, let scheduledAt {
            scheduledISO = SabqFormatters.iso8601Basic.string(from: scheduledAt)
        } else if clearScheduleRequested || status == .published {
            scheduledISO = nil
        } else if let scheduledAt {
            // Draft edits preserve the saved date, including an overdue one.
            scheduledISO = SabqFormatters.iso8601Basic.string(from: scheduledAt)
        } else {
            scheduledISO = nil
        }
        // The excerpt field was removed from the UI — the "smart summary" now
        // doubles as the excerpt (matches the web), falling back to the
        // original excerpt when no summary is set.
        let effectiveExcerpt = aiSummary.isEmpty ? excerpt : aiSummary
        let seo = AdminSEO(metaTitle: seoTitle, metaDescription: seoDescription, keywords: keywords)

        if isNew {
            let body = AdminCreateBody(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                subtitle: subtitle,
                excerpt: effectiveExcerpt,
                content: html,
                status: status.rawValue,
                articleType: articleType,
                newsType: newsType,
                isFeatured: isFeatured,
                isReading: isReading,
                hideFromHomepage: hideFromHomepage,
                aiSummary: aiSummary,
                imageUrl: imageUrl,
                categoryId: categoryId,
                reporterId: isOpinion ? nil : reporterId,
                opinionAuthorId: isOpinion ? authorId : nil,
                scheduledAt: scheduledISO,
                seo: seo
            )
            do {
                _ = try await service.createArticle(body)
                return true
            } catch {
                self.error = "تعذّر إنشاء الخبر"
                return false
            }
        }

        let payload = AdminArticleEditPayload(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            subtitle: subtitle,
            excerpt: effectiveExcerpt,
            content: html,
            status: status.rawValue,
            newsType: newsType,
            isFeatured: isFeatured,
            isReading: isReading,
            hideFromHomepage: hideFromHomepage,
            aiSummary: aiSummary,
            imageUrl: imageUrl,
            categoryId: categoryId,
            // News sends reporterId; opinion sends authorId — avoid clobbering
            // the other column.
            reporterId: isOpinion ? nil : reporterId,
            authorId: isOpinion ? authorId : nil,
            scheduledAt: scheduledISO,
            seo: seo,
            clearScheduledAt: clearScheduleRequested || status == .published
        )
        do {
            try await service.saveArticle(id: articleId ?? "", payload: payload)
            return true
        } catch {
            self.error = "تعذّر حفظ التعديلات"
            return false
        }
    }

    func runSummary(contentText: String) async {
        isSummarizing = true
        defer { isSummarizing = false }
        do {
            let source = contentText.isEmpty ? excerpt : contentText
            let summary = try await service.generateSummary(text: source)
            if !summary.isEmpty { aiSummary = summary }
        } catch {
            self.error = "تعذّر توليد الموجز"
        }
    }

    func runSEO(contentText: String) async {
        isGeneratingSEO = true
        defer { isGeneratingSEO = false }
        do {
            let seo = try await service.generateSEO(title: title, content: contentText, excerpt: excerpt)
            if !seo.metaTitle.isEmpty { seoTitle = seo.metaTitle }
            if !seo.metaDescription.isEmpty { seoDescription = seo.metaDescription }
            if !seo.keywords.isEmpty { keywords = seo.keywords }
        } catch {
            self.error = "تعذّر توليد SEO"
        }
    }

    func uploadImage(data: Data) async {
        isUploadingImage = true
        defer { isUploadingImage = false }
        let dataURI = "data:image/jpeg;base64,\(data.base64EncodedString())"
        do {
            imageUrl = try await service.uploadImage(dataURI: dataURI)
        } catch {
            self.error = "تعذّر رفع الصورة"
        }
    }

    // MARK: Comprehensive AI

    /// توليد ذكي شامل — fills fields, keeps the content.
    func runGenerateAll(content: String) async {
        isGeneratingAll = true
        defer { isGeneratingAll = false }
        do { apply(try await service.generateAll(content: content)) }
        catch { self.error = "تعذّر التوليد الذكي الشامل" }
    }

    /// تحرير وتوليد شامل — fills fields AND returns rewritten content (for the
    /// view to load into the editor), or nil on failure.
    func runEditAndGenerate(content: String) async -> String? {
        isEditGenerating = true
        defer { isEditGenerating = false }
        do {
            let r = try await service.editAndGenerate(content: content)
            apply(r)
            return r.content
        } catch {
            self.error = "تعذّر التحرير والتوليد الشامل"
            return nil
        }
    }

    /// تدقيق لغوي — returns the spelling issues for the review sheet.
    func runProofread(content: String) async -> [AdminProofIssue] {
        isProofreading = true
        defer { isProofreading = false }
        do { return try await service.proofread(content: content) }
        catch { self.error = "تعذّر التدقيق اللغوي"; return [] }
    }

    /// توليد صورة بضغطة واحدة — يستخدم إعدادات auto-image المحفوظة + المحتوى.
    /// يتطلب خبراً محفوظاً (له معرّف)؛ للخبر الجديد استخدم "توليد صورة بالذكاء".
    func runAutoImage(content: String) async {
        guard let id = articleId else {
            self.error = "احفظ الخبر أولاً للتوليد التلقائي، أو استخدم \"توليد صورة بالذكاء\""
            return
        }
        isGeneratingImage = true
        defer { isGeneratingImage = false }
        do {
            imageUrl = try await service.autoGenerateImage(
                articleId: id,
                title: title,
                content: content,
                excerpt: aiSummary,
                category: categoryName ?? "",
                articleType: articleType
            )
        } catch {
            self.error = "تعذّر توليد الصورة (تحقق من إعدادات الصور وتهيئة الخدمة)"
        }
    }

    /// Fetch the staff list for the reporter / opinion-author picker.
    func fetchUsers(role: String, query: String) async -> [AdminUser] {
        (try? await service.fetchUsers(role: role, query: query)) ?? []
    }

    /// Apply the non-content fields from a generation result.
    private func apply(_ r: AdminGenerationResult) {
        if let t = r.title, !t.isEmpty { title = t }
        if let s = r.subtitle, !s.isEmpty { subtitle = s }
        if let sum = r.summary, !sum.isEmpty { aiSummary = sum }
        if let kw = r.keywords, !kw.isEmpty { keywords = kw }
        if let st = r.seoTitle, !st.isEmpty { seoTitle = st }
        if let sd = r.seoDescription, !sd.isEmpty { seoDescription = sd }
        if let cid = r.categoryId, !cid.isEmpty {
            categoryId = cid
            categoryName = r.categoryName
        }
    }

    func addKeyword(_ raw: String) {
        let k = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !k.isEmpty, !keywords.contains(k) else { return }
        keywords.append(k)
    }

    func removeKeyword(_ k: String) {
        keywords.removeAll { $0 == k }
    }

    private static func loadCategories() async -> [APICategory] {
        (try? await APIClient.shared.fetchCategories()) ?? []
    }
}

// MARK: - Editor view

/// Full admin article editor: fetches every field, edits the body as rich
/// HTML (`SabqHTMLEditor`), and saves through `PATCH /api/v1/admin/articles/:id`.
@MainActor
struct AdminArticleEditorView: View {
    let articleId: String?
    let newArticleType: String?
    let initialTitle: String
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm: AdminEditorViewModel
    @StateObject private var htmlController = SabqHTMLEditorController()

    @State private var newKeyword = ""
    @State private var showLinkPrompt = false
    @State private var linkURL = ""
    @State private var imagePickerItem: PhotosPickerItem?
    @State private var proofIssues: [AdminProofIssue] = []
    @State private var showProofSheet = false
    @State private var showUserPicker = false
    @State private var pendingSaveHTML: String?
    @State private var showSaveConfirmation = false

    init(articleId: String?, articleType: String? = nil, title: String = "",
         service: AdminServicing? = nil, onSaved: @escaping () -> Void) {
        self.articleId = articleId
        self.newArticleType = articleType
        self.initialTitle = title
        self.onSaved = onSaved
        _vm = StateObject(wrappedValue: AdminEditorViewModel(
            articleId: articleId,
            newArticleType: articleType,
            service: service
        ))
    }

    var body: some View {
        Group {
            if vm.isLoading {
                ProgressView()
                    .tint(SabqTheme.primary)
                    .frame(maxWidth: .infinity, minHeight: 320)
            } else if !vm.loaded {
                errorState
            } else {
                form
            }
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(vm.isNew
            ? (vm.isOpinion ? "مقال رأي جديد" : "خبر جديد")
            : (vm.isOpinion ? "تعديل مقال رأي" : "تعديل خبر"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { saveButton }
        }
        .sheet(isPresented: $showProofSheet) {
            AdminProofIssuesSheet(issues: proofIssues) { applyProofreadAll() }
        }
        .sheet(isPresented: $showUserPicker) {
            AdminUserPickerSheet(
                role: vm.isOpinion ? "opinion_author" : "reporter",
                title: vm.isOpinion ? "اختيار الكاتب" : "اختيار المراسل",
                fetch: { q in await vm.fetchUsers(role: vm.isOpinion ? "opinion_author" : "reporter", query: q) }
            ) { picked in
                if vm.isOpinion {
                    vm.selectAuthor(picked)
                } else {
                    vm.reporterId = picked.id
                    vm.reporterName = picked.name
                }
            }
        }
        .alert(
            vm.isPublishNowAction ? "تأكيد النشر الآن" : "تأكيد الجدولة",
            isPresented: $showSaveConfirmation
        ) {
            Button("تأكيد") {
                guard let html = pendingSaveHTML else { return }
                Task { await completeSave(html: html) }
            }
            Button("إلغاء", role: .cancel) {
                pendingSaveHTML = nil
            }
        } message: {
            if vm.isPublishNowAction {
                Text("سيُنشر المقال فورًا. هل تريد المتابعة؟")
            } else {
                Text("سيُنشر المقال تلقائيًا في الموعد الظاهر بتوقيت الرياض.")
            }
        }
        .alert("تعذّر الحفظ", isPresented: Binding(
            get: { vm.error != nil && !vm.isLoading },
            set: { if !$0 { vm.error = nil } }
        )) {
            Button("حسنًا", role: .cancel) { vm.error = nil }
        } message: {
            Text(vm.error ?? "حاول مرة أخرى")
        }
        .task { await vm.load() }
        .sabqScreen("AdminArticleEditor")
    }

    // MARK: Form

    private var form: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                if vm.isOpinion { opinionPill }
                basicSection
                sectionDivider
                aiToolsSection
                sectionDivider
                contentSection
                sectionDivider
                summarySection
                sectionDivider
                categorySection
                sectionDivider
                bylineSection
                sectionDivider
                imageSection
                sectionDivider
                seoSection
                sectionDivider
                publishSection
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, 80)
        }
        .scrollDismissesKeyboard(.immediately)
    }

    // MARK: Sections

    private var opinionPill: some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: "text.quote").font(SabqFonts.app(size: 12, weight: .semibold))
            Text("مقال رأي").sabqText(SabqType.tag)
        }
        .foregroundStyle(SabqTheme.primary)
        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    private var basicSection: some View {
        sectionCard("الأساسي", icon: "textformat") {
            field("العنوان") {
                TextField("عنوان الخبر", text: $vm.title, axis: .vertical)
                    .font(SabqType.rowTitle.font)
            }
            if !vm.isOpinion {
                field("العنوان الفرعي") {
                    TextField("اختياري", text: $vm.subtitle, axis: .vertical)
                        .font(SabqType.excerpt.font)
                }
            }
        }
    }

    // MARK: AI tools toolbar (توليد ذكي شامل / تدقيق لغوي / تحرير وتوليد شامل)

    private var aiToolsSection: some View {
        sectionCard("أدوات الذكاء", icon: "sparkles") {
            aiToolButton(
                title: "توليد ذكي شامل", systemImage: "wand.and.stars",
                loading: vm.isGeneratingAll, minLength: 100
            ) {
                let html = await htmlController.currentHTML()
                await vm.runGenerateAll(content: html.isEmpty ? vm.contentHTML : html)
            }
            aiToolButton(
                title: "تحرير وتوليد شامل", systemImage: "wand.and.rays",
                loading: vm.isEditGenerating, minLength: 100
            ) {
                let html = await htmlController.currentHTML()
                if let newContent = await vm.runEditAndGenerate(content: html.isEmpty ? vm.contentHTML : html) {
                    vm.contentHTML = newContent
                    htmlController.setHTML(newContent)
                    vm.liveHTMLLength = newContent.count
                }
            }
            aiToolButton(
                title: "تدقيق لغوي", systemImage: "text.magnifyingglass",
                loading: vm.isProofreading, minLength: 20
            ) {
                let html = await htmlController.currentHTML()
                let issues = await vm.runProofread(content: html.isEmpty ? vm.contentHTML : html)
                proofIssues = issues
                showProofSheet = true
            }
            Text("اكتب المحتوى أولاً لتفعيل التوليد")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textTertiary)
                .opacity(vm.liveHTMLLength < 100 ? 1 : 0)
        }
    }

    private func aiToolButton(title: String, systemImage: String, loading: Bool, minLength: Int, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            toolLabel(loading ? "جارٍ التنفيذ…" : title, systemImage: systemImage, loading: loading)
        }
        .buttonStyle(.plain)
        .disabled(loading || vm.liveHTMLLength < minLength)
        .opacity(vm.liveHTMLLength < minLength ? 0.55 : 1)
    }

    private var contentSection: some View {
        sectionCard("المحتوى", icon: "doc.richtext") {
            SabqEditorToolbar(controller: htmlController) { showLinkPrompt = true }
            SabqHTMLEditor(initialHTML: vm.contentHTML, controller: htmlController, onChange: { vm.liveHTMLLength = $0.count })
                .frame(height: 340)
                .background(SabqTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 1)
                )
        }
        .alert("إضافة رابط", isPresented: $showLinkPrompt) {
            TextField("https://", text: $linkURL)
                .textInputAutocapitalization(.never)
            Button("إضافة") {
                let u = linkURL.trimmingCharacters(in: .whitespacesAndNewlines)
                if !u.isEmpty { htmlController.exec("createLink", value: u) }
                linkURL = ""
            }
            Button("إلغاء", role: .cancel) { linkURL = "" }
        }
    }

    private var categorySection: some View {
        sectionCard("التصنيف", icon: "folder") {
            Menu {
                ForEach(vm.categories) { cat in
                    Button(cat.name) {
                        vm.categoryId = cat.id
                        vm.categoryName = cat.name
                    }
                }
            } label: {
                HStack {
                    Text(vm.categoryName ?? "اختر تصنيفاً")
                        .font(SabqType.excerpt.font)
                        .foregroundStyle(vm.categoryName == nil ? SabqTheme.textSecondary : SabqTheme.textPrimary)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                .modifier(SabqInputSurface())
            }
        }
    }

    private var bylineSection: some View {
        sectionCard(vm.isOpinion ? "كاتب المقال" : "المراسل", icon: "person.crop.circle") {
            Button {
                showUserPicker = true
            } label: {
                HStack {
                    let name = vm.isOpinion ? vm.authorName : vm.reporterName
                    Text(name ?? (vm.isOpinion ? "اختر الكاتب" : "اختر المراسل"))
                        .font(SabqType.excerpt.font)
                        .foregroundStyle(((vm.isOpinion ? vm.authorName : vm.reporterName) == nil) ? SabqTheme.textSecondary : SabqTheme.textPrimary)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                .modifier(SabqInputSurface())
            }
            .buttonStyle(.plain)
        }
    }

    private var imageSection: some View {
        sectionCard("الصورة البارزة", icon: "photo") {
            if !vm.imageUrl.isEmpty, let url = URL(string: vm.imageUrl) {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .overlay {
                        CachedAsyncImage(url: url, contentMode: .fill) {
                            SabqImagePlaceholder()
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            Button {
                Task {
                    let html = await htmlController.currentHTML()
                    await vm.runAutoImage(content: html.isEmpty ? vm.contentHTML : html)
                }
            } label: {
                toolLabel(vm.isGeneratingImage ? "جارٍ توليد الصورة… (~30 ثانية)" : "توليد صورة بالذكاء الاصطناعي",
                          systemImage: "wand.and.stars", loading: vm.isGeneratingImage)
            }
            .buttonStyle(.plain)
            .disabled(vm.isGeneratingImage)
            if vm.isGeneratingImage {
                Text("يُرجى الانتظار وعدم إغلاق الشاشة حتى تكتمل الصورة")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            let uploading = vm.isUploadingImage
            PhotosPicker(selection: $imagePickerItem, matching: .images) {
                toolLabel(uploading ? "جارٍ الرفع…" : "رفع صورة",
                          systemImage: "arrow.up.circle",
                          loading: uploading)
            }
            .disabled(uploading)
            field("رابط الصورة") {
                TextField("https://", text: $vm.imageUrl, axis: .vertical)
                    .font(SabqType.meta.font)
                    .textInputAutocapitalization(.never)
            }
        }
        .onChange(of: imagePickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let prepared = Self.prepareImageData(data) {
                    await vm.uploadImage(data: prepared)
                }
                imagePickerItem = nil
            }
        }
    }

    private var seoSection: some View {
        sectionCard("تحسين محركات البحث (SEO)", icon: "magnifyingglass") {
            Button {
                Task {
                    let html = await htmlController.currentHTML()
                    await vm.runSEO(contentText: Self.stripHTML(html.isEmpty ? vm.contentHTML : html))
                }
            } label: {
                toolLabel(vm.isGeneratingSEO ? "جارٍ التوليد…" : "توليد SEO والكلمات",
                          systemImage: "sparkles",
                          loading: vm.isGeneratingSEO)
            }
            .buttonStyle(.plain)
            .disabled(vm.isGeneratingSEO)
            field("عنوان Meta") {
                TextField("≤ 70 حرفاً", text: $vm.seoTitle, axis: .vertical)
                    .font(SabqType.excerpt.font)
            }
            field("وصف Meta") {
                TextField("≤ 160 حرفاً", text: $vm.seoDescription, axis: .vertical)
                    .font(SabqType.excerpt.font)
                    .lineLimit(2...4)
            }
            keywordsField
        }
    }

    private var keywordsField: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            fieldLabel("الكلمات المفتاحية")
            if !vm.keywords.isEmpty {
                FlowChips(items: vm.keywords) { kw in
                    HStack(spacing: SabqLayout.space4) {
                        Text(kw).sabqText(SabqType.tag)
                        Button { vm.removeKeyword(kw) } label: {
                            Image(systemName: "xmark")
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                                .frame(width: 24, height: 24)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .foregroundStyle(SabqTheme.textPrimary)
                    .padding(.leading, SabqLayout.space8).padding(.trailing, SabqLayout.space4).padding(.vertical, SabqLayout.space4)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
                }
            }
            HStack(spacing: SabqLayout.space8) {
                TextField("أضف كلمة", text: $newKeyword)
                    .font(SabqType.excerpt.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .onSubmit { vm.addKeyword(newKeyword); newKeyword = "" }
                Button {
                    vm.addKeyword(newKeyword); newKeyword = ""
                } label: {
                    Image(systemName: "plus")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.primary)
                        .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, SabqLayout.space16)
            .frame(minHeight: SabqLayout.controlHeight)
            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surface))
            .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
        }
    }

    private var summarySection: some View {
        sectionCard("الموجز الذكي", icon: "sparkles") {
            Button {
                Task {
                    let html = await htmlController.currentHTML()
                    await vm.runSummary(contentText: Self.stripHTML(html.isEmpty ? vm.contentHTML : html))
                }
            } label: {
                toolLabel(vm.isSummarizing ? "جارٍ التوليد…" : "توليد الموجز",
                          systemImage: "sparkles",
                          loading: vm.isSummarizing)
            }
            .buttonStyle(.plain)
            .disabled(vm.isSummarizing)
            field("الموجز") {
                TextField("ملخّص ذكي للخبر", text: $vm.aiSummary, axis: .vertical)
                    .font(SabqType.excerpt.font)
                    .lineLimit(2...5)
            }
        }
    }

    private var publishSection: some View {
        sectionCard("النشر", icon: "paperplane") {
            AdminPublishingOptions(vm: vm)
        }
    }

    // MARK: Save

    private var saveButton: some View {
        Button {
            Task {
                let html = await htmlController.currentHTML()
                let finalHTML = html.isEmpty ? vm.contentHTML : html
                if vm.isPublishNowAction || vm.status == .scheduled {
                    if vm.saveGuard() != nil {
                        _ = await vm.save(html: finalHTML)
                    } else {
                        pendingSaveHTML = finalHTML
                        showSaveConfirmation = true
                    }
                } else {
                    await completeSave(html: finalHTML)
                }
            }
        } label: {
            if vm.isSaving {
                ProgressView()
            } else {
                Text(vm.isPublishNowAction ? "نشر الآن" : (vm.status == .scheduled ? "تأكيد الجدولة" : "حفظ"))
                    .font(SabqType.button.font)
            }
        }
        .disabled(vm.isSaving || vm.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func completeSave(html: String) async {
        if await vm.save(html: html) {
            pendingSaveHTML = nil
            showSaveConfirmation = false
            onSaved()
            dismiss()
        }
    }

    private var errorState: some View {
        VStack(spacing: SabqLayout.space16) {
            Image(systemName: "exclamationmark.triangle")
                .font(SabqFonts.app(size: 40, weight: .light))
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text(vm.error ?? "تعذّر تحميل الخبر")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
            Button { Task { await vm.load() } } label: {
                Text("إعادة المحاولة")
                    .sabqText(SabqType.button)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.actionFill))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, minHeight: 320)
    }

    // MARK: Building blocks

    private var sectionDivider: some View {
        Divider().overlay(SabqTheme.separator)
    }

    /// Unboxed form section: a plain icon + heading, then its fields on the page.
    @ViewBuilder
    private func sectionCard<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text(title)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text).sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
    }

    /// Secondary action button for an AI/upload tool (with optional spinner).
    nonisolated private func toolLabel(_ title: String, systemImage: String, loading: Bool) -> some View {
        HStack(spacing: SabqLayout.space8) {
            if loading {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: systemImage).font(SabqFonts.app(size: 14, weight: .semibold))
            }
            Text(title).font(SabqType.metaEmphasis.font)
        }
        .foregroundStyle(SabqTheme.primary)
        .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
        .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
        .contentShape(Rectangle())
    }

    /// Strip HTML tags to plain text for the AI tools.
    static func stripHTML(_ html: String) -> String {
        html.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Apply every proofreading suggestion to the live HTML, then reload it.
    private func applyProofreadAll() {
        Task {
            var html = await htmlController.currentHTML()
            if html.isEmpty { html = vm.contentHTML }
            for issue in proofIssues where !issue.original.isEmpty {
                html = html.replacingOccurrences(of: issue.original, with: issue.suggestion)
            }
            vm.contentHTML = html
            htmlController.setHTML(html)
            vm.liveHTMLLength = html.count
            showProofSheet = false
        }
    }

    /// Downscale to ≤2000px longest edge + JPEG 0.8 before upload.
    static func prepareImageData(_ data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let maxEdge: CGFloat = 2000
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxEdge ? maxEdge / longest : 1
        let target = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }

    @ViewBuilder
    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            fieldLabel(label)
            content()
                .foregroundStyle(SabqTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .modifier(SabqInputSurface())
        }
    }
}

// MARK: - Rich text toolbar

/// Formatting toolbar that drives the `SabqHTMLEditor` via its controller.
struct SabqEditorToolbar: View {
    let controller: SabqHTMLEditorController
    let onLink: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space4) {
                button("bold", "bold") { controller.exec("bold") }
                button("italic", "italic") { controller.exec("italic") }
                button("underline", "underline") { controller.exec("underline") }
                divider
                button("h2", nil, label: "H2") { controller.formatBlock("H2") }
                button("h3", nil, label: "H3") { controller.formatBlock("H3") }
                button("p", nil, label: "P") { controller.formatBlock("P") }
                divider
                button("list.bullet", "list.bullet") { controller.exec("insertUnorderedList") }
                button("list.number", "list.number") { controller.exec("insertOrderedList") }
                button("quote", "text.quote") { controller.formatBlock("BLOCKQUOTE") }
                button("link", "link", action: onLink)
            }
            .padding(SabqLayout.space4)
        }
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    private var divider: some View {
        Rectangle().fill(SabqTheme.outline).frame(width: 1, height: 24)
    }

    private func button(_ id: String, _ systemImage: String?, label: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if let systemImage {
                    Image(systemName: systemImage).font(SabqFonts.app(size: 15, weight: .semibold))
                } else if let label {
                    Text(label).sabqText(SabqType.metaEmphasis)
                }
            }
            .foregroundStyle(SabqTheme.textPrimary)
            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Simple wrapping chips layout

/// Lightweight wrapping layout for keyword chips (iOS 16+ `Layout`).
struct FlowChips<Item: Hashable, Content: View>: View {
    let items: [Item]
    @ViewBuilder let content: (Item) -> Content

    var body: some View {
        AdminFlowLayout(spacing: 8) {
            ForEach(items, id: \.self) { content($0) }
        }
    }
}

struct AdminFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0; y += rowHeight + spacing; rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0; y += rowHeight + spacing; rowHeight = 0
            }
            sub.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - Proofread issues sheet

/// Lists the spelling issues from تدقيق لغوي with an "apply all" action.
struct AdminProofIssuesSheet: View {
    let issues: [AdminProofIssue]
    let onApplyAll: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if issues.isEmpty {
                    VStack(spacing: SabqLayout.space12) {
                        Image(systemName: "checkmark.seal")
                            .font(SabqFonts.app(size: 40, weight: .light))
                            .foregroundStyle(SabqTheme.success)
                            .accessibilityHidden(true)
                        Text("لا توجد أخطاء إملائية")
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(issues) { issue in
                                if issue.id != issues.first?.id {
                                    Divider().overlay(SabqTheme.separator)
                                }
                                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                                    HStack(spacing: SabqLayout.space8) {
                                        Text(issue.original)
                                            .font(SabqType.excerpt.font)
                                            .strikethrough()
                                            .foregroundStyle(SabqTheme.danger)
                                        Image(systemName: "arrow.left")
                                            .font(SabqFonts.app(size: 12, weight: .semibold))
                                            .foregroundStyle(SabqTheme.textSecondary)
                                        Text(issue.suggestion)
                                            .font(SabqType.rowTitle.font)
                                            .foregroundStyle(SabqTheme.success)
                                    }
                                    if let ex = issue.explanation, !ex.isEmpty {
                                        Text(ex)
                                            .sabqText(SabqType.meta)
                                            .foregroundStyle(SabqTheme.textSecondary)
                                    }
                                }
                                .padding(.vertical, SabqLayout.space12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .padding(.horizontal, SabqLayout.pageMargin)
                        .padding(.vertical, SabqLayout.space8)
                    }
                }
            }
            .background(SabqTheme.background)
            .navigationTitle(issues.isEmpty ? "تدقيق لغوي" : "تدقيق لغوي (\(issues.count))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() } }
                if !issues.isEmpty {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("تطبيق الكل") { onApplyAll() }.fontWeight(.bold)
                    }
                }
            }
            .sabqRTL()
        }
    }
}

// MARK: - Reporter / opinion-author picker

/// Searchable list of staff (reporters / opinion authors) for the byline.
struct AdminUserPickerSheet: View {
    let role: String
    let title: String
    let fetch: (String) async -> [AdminUser]
    let onPick: (AdminUser) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var users: [AdminUser] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(SabqTheme.textSecondary)
                    TextField("بحث بالاسم", text: $query)
                        .font(SabqType.excerpt.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .onSubmit { Task { await reload() } }
                }
                .modifier(SabqInputSurface())
                .padding(SabqLayout.pageMargin)

                if isLoading {
                    ProgressView().tint(SabqTheme.primary).frame(maxWidth: .infinity, minHeight: 200)
                } else if users.isEmpty {
                    Text("لا توجد نتائج")
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(users) { user in
                                if user.id != users.first?.id {
                                    Divider().overlay(SabqTheme.separator)
                                }
                                Button { onPick(user); dismiss() } label: {
                                    HStack(spacing: SabqLayout.space12) {
                                        Image(systemName: "person.circle")
                                            .font(SabqFonts.app(size: 26, weight: .light)).foregroundStyle(SabqTheme.textSecondary)
                                            .accessibilityHidden(true)
                                        VStack(alignment: .leading, spacing: SabqLayout.space4) {
                                            Text(user.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                                            if let e = user.email, !e.isEmpty {
                                                Text(e).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                                            }
                                        }
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.vertical, SabqLayout.space12)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, SabqLayout.pageMargin)
                        .padding(.bottom, SabqLayout.space24)
                    }
                }
            }
            .background(SabqTheme.background)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() } } }
            .sabqRTL()
            .task { await reload() }
        }
    }

    private func reload() async {
        isLoading = true
        users = await fetch(query.trimmingCharacters(in: .whitespacesAndNewlines))
        isLoading = false
    }
}

/// Shared live publishing controls, also rendered by the schedule UI tests.
struct AdminPublishingOptions: View {
    @ObservedObject var vm: AdminEditorViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                fieldLabel("الحالة")
                AdminSegmentedControl(selected: vm.status) { vm.setStatus($0) }
            }
            if vm.status == .scheduled {
                Text("الجدولة تعني نشر المادة تلقائيًا في الموعد المختار. اختر موعدًا مستقبليًا واحفظ لتأكيدها.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                DatePicker("موعد النشر", selection: vm.scheduleDateBinding)
                    .font(SabqType.excerpt.font)
                    .tint(SabqTheme.primary)
                    .environment(\.locale, Locale(identifier: "ar"))
                    .environment(\.calendar, Calendar(identifier: .gregorian))
                    .environment(\.timeZone, TimeZone(identifier: "Asia/Riyadh")!)
                if let overdue = vm.overdueSavedSchedule {
                    Text("الموعد المحفوظ السابق فات: \(SabqFormatters.riyadhWeekdayDate.string(from: overdue)) · \(SabqFormatters.riyadhTime.string(from: overdue)). تم اختيار الموعد القادم حسب جدول الكاتب ويمكنك تعديله.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let nextSlot = vm.writerWeeklySlot?.nextSlot, nextSlot > Date(),
                   !vm.scheduleWasExplicitlySelected || vm.schedulePresentation?.isOverdue == true {
                    Button {
                        vm.setStatus(.scheduled)
                    } label: {
                        Label(
                            "استخدام الموعد القادم للكاتب",
                            systemImage: "calendar.badge.clock"
                        )
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.primary)
                        .padding(.horizontal, SabqLayout.space12)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                if !vm.scheduleWasExplicitlySelected {
                    Text("لم يُعتمد الموعد بعد — غيّر التاريخ أو الوقت صراحةً قبل الحفظ.")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.warning)
                } else if let schedule = vm.schedulePresentation, schedule.isOverdue {
                    Text("هذا الموعد محفوظ لكنه فات. اختر موعدًا مستقبليًا لإعادة الجدولة.")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.danger)
                }
            }
            if let schedule = vm.schedulePresentation {
                editorScheduleCue(schedule)
            }
            if !vm.isOpinion {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    fieldLabel("نوع الخبر")
                    Picker("", selection: $vm.newsType) {
                        Text("عادي").tag("regular")
                        Text("عاجل").tag("breaking")
                    }
                    .pickerStyle(.segmented)
                }
            }
            VStack(spacing: 0) {
                Toggle("خبر مميّز", isOn: $vm.isFeatured)
                    .frame(minHeight: SabqLayout.controlHeight)
                Divider().overlay(SabqTheme.separator)
                Toggle("قراءة من سبق", isOn: $vm.isReading)
                    .frame(minHeight: SabqLayout.controlHeight)
                Divider().overlay(SabqTheme.separator)
                Toggle("إخفاء من الصفحة الرئيسية", isOn: $vm.hideFromHomepage)
                    .frame(minHeight: SabqLayout.controlHeight)
            }
            .font(SabqType.excerpt.font)
            .foregroundStyle(SabqTheme.textPrimary)
            .tint(SabqTheme.actionFill)
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text).sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
    }

    private func editorScheduleCue(_ schedule: AdminSchedulePresentation) -> some View {
        let tint: Color = schedule.isOverdue ? SabqTheme.danger : SabqTheme.primary
        return HStack(alignment: .center, spacing: SabqLayout.space8) {
            Image(systemName: schedule.isOverdue ? "exclamationmark.triangle" : "clock")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(schedule.title)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(tint)
                Text(schedule.fullLabel ?? schedule.detail)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer(minLength: 0)
            if schedule.source == .saved {
                Button { vm.clearSchedule() } label: {
                    Text("مسح")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.danger)
                        .frame(minWidth: SabqLayout.touchTarget, minHeight: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, SabqLayout.space12)
        .padding(.vertical, SabqLayout.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

}
