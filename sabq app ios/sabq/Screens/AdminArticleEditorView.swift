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
    @Published var scheduledAt = Date()
    @Published var hasSchedule = false
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

    init(articleId: String?, newArticleType: String? = nil, service: AdminServicing? = nil) {
        self.articleId = articleId
        self.isNew = (articleId == nil)
        self.service = service ?? LiveAdminService()
        if articleId == nil {
            self.articleType = newArticleType ?? "news"
            self.status = .draft
        }
    }

    func load() async {
        isLoading = true
        error = nil
        async let cats = Self.loadCategories()
        if let id = articleId {
            do {
                let d = try await service.fetchDetail(id: id)
                title = d.title
                subtitle = d.subtitle
                excerpt = d.excerpt
                contentHTML = d.content
                liveHTMLLength = d.content.count
                status = d.status
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
                if let s = d.scheduledAt { scheduledAt = s; hasSchedule = true }
                seoTitle = d.seo.metaTitle
                seoDescription = d.seo.metaDescription
                keywords = d.seo.keywords
                loaded = true
            } catch {
                self.error = "تعذّر تحميل الخبر"
            }
        } else {
            // New article — fields start blank (configured in init).
            loaded = true
        }
        categories = await cats
        isLoading = false
    }

    /// Persist using the freshest HTML pulled from the editor at save time.
    func save(html: String) async -> Bool {
        isSaving = true
        defer { isSaving = false }
        let scheduledISO: String? = (status == .scheduled && hasSchedule)
            ? SabqFormatters.iso8601Basic.string(from: scheduledAt)
            : nil
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
            seo: seo
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

    init(articleId: String?, articleType: String? = nil, title: String = "", onSaved: @escaping () -> Void) {
        self.articleId = articleId
        self.newArticleType = articleType
        self.initialTitle = title
        self.onSaved = onSaved
        _vm = StateObject(wrappedValue: AdminEditorViewModel(articleId: articleId, newArticleType: articleType))
    }

    var body: some View {
        Group {
            if vm.isLoading {
                ProgressView()
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
                    vm.authorId = picked.id
                    vm.authorName = picked.name
                } else {
                    vm.reporterId = picked.id
                    vm.reporterName = picked.name
                }
            }
        }
        .task { await vm.load() }
        .sabqScreen("AdminArticleEditor")
    }

    // MARK: Form

    private var form: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                if vm.isOpinion { opinionPill }
                basicSection
                aiToolsSection
                contentSection
                summarySection
                categorySection
                bylineSection
                imageSection
                seoSection
                publishSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 80)
        }
        .scrollDismissesKeyboard(.immediately)
    }

    // MARK: Sections

    private var opinionPill: some View {
        HStack(spacing: 6) {
            Image(systemName: "text.quote").font(SabqFonts.app(size: 12, weight: .bold))
            Text("مقال رأي").font(SabqFonts.app(size: 13, weight: .heavy))
        }
        .foregroundStyle(SabqTheme.primaryEnd)
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background(Capsule().fill(SabqTheme.primaryEnd.opacity(0.12)))
    }

    private var basicSection: some View {
        sectionCard("الأساسي", icon: "textformat") {
            field("العنوان") {
                TextField("عنوان الخبر", text: $vm.title, axis: .vertical)
                    .font(SabqFonts.app(size: 16, weight: .bold))
            }
            if !vm.isOpinion {
                field("العنوان الفرعي") {
                    TextField("اختياري", text: $vm.subtitle, axis: .vertical)
                        .font(SabqFonts.app(size: 14))
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
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
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
        .opacity(vm.liveHTMLLength < minLength ? 0.5 : 1)
    }

    private var contentSection: some View {
        sectionCard("المحتوى", icon: "doc.richtext") {
            SabqEditorToolbar(controller: htmlController) { showLinkPrompt = true }
            SabqHTMLEditor(initialHTML: vm.contentHTML, controller: htmlController, onChange: { vm.liveHTMLLength = $0.count })
                .frame(height: 340)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5)
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
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(vm.categoryName == nil ? SabqTheme.secondaryInk : SabqTheme.ink)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.surface))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5))
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
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(((vm.isOpinion ? vm.authorName : vm.reporterName) == nil) ? SabqTheme.secondaryInk : SabqTheme.ink)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.surface))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5))
            }
            .buttonStyle(.plain)
        }
    }

    private var imageSection: some View {
        sectionCard("الصورة البارزة", icon: "photo") {
            if !vm.imageUrl.isEmpty, let url = URL(string: vm.imageUrl) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    Rectangle().fill(SabqTheme.outline.opacity(0.3))
                }
                .frame(height: 180)
                .frame(maxWidth: .infinity)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            let uploading = vm.isUploadingImage
            PhotosPicker(selection: $imagePickerItem, matching: .images) {
                toolLabel(uploading ? "جارٍ الرفع…" : "رفع صورة",
                          systemImage: "arrow.up.circle.fill",
                          loading: uploading)
            }
            .disabled(uploading)
            field("رابط الصورة") {
                TextField("https://", text: $vm.imageUrl, axis: .vertical)
                    .font(SabqFonts.app(size: 13))
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
                    .font(SabqFonts.app(size: 14))
            }
            field("وصف Meta") {
                TextField("≤ 160 حرفاً", text: $vm.seoDescription, axis: .vertical)
                    .font(SabqFonts.app(size: 14))
                    .lineLimit(2...4)
            }
            keywordsField
        }
    }

    private var keywordsField: some View {
        VStack(alignment: .leading, spacing: 8) {
            fieldLabel("الكلمات المفتاحية")
            if !vm.keywords.isEmpty {
                FlowChips(items: vm.keywords) { kw in
                    HStack(spacing: 5) {
                        Text(kw).font(SabqFonts.app(size: 12, weight: .semibold))
                        Button { vm.removeKeyword(kw) } label: {
                            Image(systemName: "xmark.circle.fill").font(SabqFonts.app(size: 12))
                        }
                        .buttonStyle(.plain)
                    }
                    .foregroundStyle(SabqTheme.sky)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Capsule().fill(SabqTheme.sky.opacity(0.12)))
                }
            }
            HStack(spacing: 8) {
                TextField("أضف كلمة", text: $newKeyword)
                    .font(SabqFonts.app(size: 14))
                    .onSubmit { vm.addKeyword(newKeyword); newKeyword = "" }
                Button {
                    vm.addKeyword(newKeyword); newKeyword = ""
                } label: {
                    Image(systemName: "plus.circle.fill").font(SabqFonts.app(size: 20)).foregroundStyle(SabqTheme.sky)
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.surface))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5))
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
                    .font(SabqFonts.app(size: 14))
                    .lineLimit(2...5)
            }
        }
    }

    private var publishSection: some View {
        sectionCard("النشر", icon: "paperplane") {
            VStack(alignment: .leading, spacing: 8) {
                fieldLabel("الحالة")
                AdminSegmentedControl(selected: vm.status) { vm.status = $0 }
            }
            if vm.status == .scheduled {
                Toggle("تحديد موعد الجدولة", isOn: $vm.hasSchedule)
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .tint(SabqTheme.sky)
                if vm.hasSchedule {
                    DatePicker("الموعد", selection: $vm.scheduledAt)
                        .font(SabqFonts.app(size: 14))
                        .environment(\.locale, Locale(identifier: "ar"))
                }
            }
            if !vm.isOpinion {
                VStack(alignment: .leading, spacing: 8) {
                    fieldLabel("نوع الخبر")
                    Picker("", selection: $vm.newsType) {
                        Text("عادي").tag("regular")
                        Text("عاجل").tag("breaking")
                    }
                    .pickerStyle(.segmented)
                }
            }
            Toggle("خبر مميّز", isOn: $vm.isFeatured)
                .font(SabqFonts.app(size: 14, weight: .semibold)).tint(SabqTheme.gold)
            Toggle("قراءة من سبق", isOn: $vm.isReading)
                .font(SabqFonts.app(size: 14, weight: .semibold)).tint(SabqTheme.teal)
            Toggle("إخفاء من الصفحة الرئيسية", isOn: $vm.hideFromHomepage)
                .font(SabqFonts.app(size: 14, weight: .semibold)).tint(SabqTheme.coral)
        }
    }

    // MARK: Save

    private var saveButton: some View {
        Button {
            Task {
                let html = await htmlController.currentHTML()
                let finalHTML = html.isEmpty ? vm.contentHTML : html
                if await vm.save(html: finalHTML) {
                    onSaved()
                    dismiss()
                }
            }
        } label: {
            if vm.isSaving {
                ProgressView()
            } else {
                Text("حفظ").font(SabqFonts.app(size: 16, weight: .bold))
            }
        }
        .disabled(vm.isSaving || vm.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private var errorState: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(SabqFonts.app(size: 40, weight: .light))
                .foregroundStyle(SabqTheme.secondaryInk.opacity(0.4))
            Text(vm.error ?? "تعذّر تحميل الخبر")
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            Button { Task { await vm.load() } } label: {
                Text("إعادة المحاولة")
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.sky)
                    .padding(.horizontal, 20).padding(.vertical, 8)
                    .background(Capsule().fill(SabqTheme.sky.opacity(0.12)))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, minHeight: 320)
    }

    // MARK: Building blocks

    @ViewBuilder
    private func sectionCard<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(SabqTheme.sky)
                Text(title).font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(SabqTheme.ink)
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(SabqTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text).font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(SabqTheme.ink)
    }

    /// Pill label for an AI/upload action button (with optional spinner).
    nonisolated private func toolLabel(_ title: String, systemImage: String, loading: Bool) -> some View {
        HStack(spacing: 7) {
            if loading {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: systemImage).font(SabqFonts.app(size: 13, weight: .bold))
            }
            Text(title).font(SabqFonts.app(size: 13, weight: .bold))
        }
        .foregroundStyle(SabqTheme.sky)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous).fill(SabqTheme.sky.opacity(0.10)))
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
        VStack(alignment: .leading, spacing: 7) {
            fieldLabel(label)
            content()
                .foregroundStyle(SabqTheme.ink)
                .padding(.horizontal, 13)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                // Inputs use the page background (distinct from the white card)
                // for a clear, high-contrast boundary.
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.background))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
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
            HStack(spacing: 6) {
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
            .padding(4)
        }
    }

    private var divider: some View {
        Rectangle().fill(SabqTheme.outline.opacity(0.6)).frame(width: 1, height: 22)
    }

    private func button(_ id: String, _ systemImage: String?, label: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if let systemImage {
                    Image(systemName: systemImage).font(SabqFonts.app(size: 15, weight: .bold))
                } else if let label {
                    Text(label).font(SabqFonts.app(size: 14, weight: .heavy))
                }
            }
            .foregroundStyle(SabqTheme.ink)
            .frame(width: 38, height: 34)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(SabqTheme.background.opacity(0.6)))
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
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(SabqFonts.app(size: 42, weight: .light))
                            .foregroundStyle(SabqTheme.teal)
                        Text("لا توجد أخطاء إملائية")
                            .font(SabqFonts.app(size: 15, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: 10) {
                            ForEach(issues) { issue in
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 8) {
                                        Text(issue.original)
                                            .strikethrough()
                                            .foregroundStyle(SabqTheme.coral)
                                        Image(systemName: "arrow.left")
                                            .font(SabqFonts.app(size: 11, weight: .bold))
                                            .foregroundStyle(SabqTheme.secondaryInk)
                                        Text(issue.suggestion)
                                            .fontWeight(.bold)
                                            .foregroundStyle(SabqTheme.teal)
                                    }
                                    .font(SabqFonts.app(size: 14))
                                    if let ex = issue.explanation, !ex.isEmpty {
                                        Text(ex)
                                            .font(SabqFonts.app(size: 12))
                                            .foregroundStyle(SabqTheme.secondaryInk)
                                    }
                                }
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.surface))
                                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
                            }
                        }
                        .padding(16)
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
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(SabqTheme.secondaryInk)
                    TextField("بحث بالاسم", text: $query)
                        .font(SabqFonts.app(size: 15))
                        .onSubmit { Task { await reload() } }
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.surface))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5))
                .padding(16)

                if isLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                } else if users.isEmpty {
                    Text("لا توجد نتائج")
                        .font(SabqFonts.app(size: 14, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(users) { user in
                                Button { onPick(user); dismiss() } label: {
                                    HStack(spacing: 10) {
                                        Image(systemName: "person.circle.fill")
                                            .font(SabqFonts.app(size: 26)).foregroundStyle(SabqTheme.secondaryInk)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(user.name).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.ink)
                                            if let e = user.email, !e.isEmpty {
                                                Text(e).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.secondaryInk)
                                            }
                                        }
                                        Spacer(minLength: 0)
                                    }
                                    .padding(12)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.surface))
                                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
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
