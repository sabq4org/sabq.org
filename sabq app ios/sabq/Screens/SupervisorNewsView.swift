import SwiftUI

/// «بانتظار قرارك» — لوحة المشرف في تطبيق «سبق»: أخبار المراسلين والبريد
/// وطلبات التعديل التي تنتظر قرارًا، بنفس ترتيب الويب و«مكتب سبق».
/// المصدر: GET /api/v1/editorial/news (articles.publish).
struct SupervisorNewsView: View {
    @Environment(AuthStore.self) private var authStore
    private var showsFullDashboard: Bool { authStore.currentUser?.isPlatformAdmin == true }

    @State private var board = EditorialNewsBoard()
    @State private var filter: EditorialNewsFilter
    @State private var error: EditorialError?
    /// الفلتر والحساب اللذان تخصهما `board` المعروضة (nil قبل أول تحميل ناجح).
    @State private var boardFilter: EditorialNewsFilter?
    @State private var boardAccountId: String?
    /// «الأحدث يفوز»: رد فلتر سابق أو حساب سابق لا يبدّل القائمة الحالية.
    @State private var gate = EditorialRequestGate<EditorialNewsFilter>()
    /// المحرر بلا دور مراسل أو كاتب: هذه لوحته الوحيدة، فالإنشاء هنا.
    @State private var showNewChoice = false
    @State private var submissionKind: ArticleSubmissionKind?

    init(initialFilter: EditorialNewsFilter = .all) {
        _filter = State(initialValue: initialFilter)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(EditorialText.todayLine())
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    // للإدارة الكاملة هذه صفحة فرعية من «لوحة التحكم»؛ للمحرر هي لوحته.
                    Text(showsFullDashboard ? "بانتظار قرارك" : "لوحة التحكم")
                        .font(SabqType.pageTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                }

                if boardFilter == nil || error?.keepsVisibleContent == false {
                    EditorialStatusView(error: error, loading: error == nil) { Task { await load() } }
                } else {
                    summary
                    chips
                    if let error, boardFilter == filter {
                        // فشل التحديث: تبقى القائمة الحالية ومعها السبب.
                        Text(error.localizedDescription)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.warning)
                    }
                    if boardFilter != filter {
                        // فلتر جديد قيد التحميل: لا نعرض قائمة فلتر آخر تحته.
                        EditorialStatusView(error: error, loading: error == nil) { Task { await load() } }
                    } else if board.items.isEmpty {
                        Text("لا شيء ينتظر قرارك الآن.")
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, SabqLayout.space32)
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(board.items) { item in
                                if item.id != board.items.first?.id {
                                    Divider().overlay(SabqTheme.separator)
                                }
                                row(item)
                            }
                        }
                        .padding(.horizontal, SabqLayout.cardInset)
                        .sabqNewsSurface()
                    }

                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, 64)
        }
        .background(SabqTheme.background)
        .refreshable { await load() }
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !showsFullDashboard {
                ToolbarItem(placement: .primaryAction) {
                    Button { showNewChoice = true } label: {
                        Image(systemName: "plus")
                            .font(SabqFonts.app(size: 17, weight: .semibold))
                    }
                    .accessibilityLabel("محتوى جديد")
                }
            }
        }
        .confirmationDialog("نوع المحتوى", isPresented: $showNewChoice, titleVisibility: .visible) {
            Button("خبر") { submissionKind = .news }
            Button("مقال رأي") { submissionKind = .opinion }
            Button("إلغاء", role: .cancel) {}
        }
        .sheet(item: $submissionKind, onDismiss: { Task { await load() } }) { kind in
            ArticleSubmissionView(kind: kind)
        }
        // يُلغى طلب الفلتر (أو الحساب) السابق تلقائيًا عند تبديله.
        .task(id: "\(filter.rawValue)|\(authStore.currentUser?.id ?? "")") { await load() }
    }

    private var summary: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text("\(board.counts.all) بانتظار قرارك")
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                if !board.breakdown.isEmpty {
                    Text(board.breakdown)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
            Spacer()
            if let oldest = board.oldestAt {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("أقدمها")
                        .sabqText(SabqType.timestamp)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Text(EditorialText.relative(oldest))
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.primary)
                }
            }
        }
        .editorialGroup()
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
                ForEach(EditorialNewsFilter.allCases) { option in
                    EditorialChip(title: option.title, count: board.counts.count(for: option), selected: filter == option) {
                        guard filter != option else { return }
                        filter = option
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ item: EditorialNewsItem) -> some View {
        switch item {
        case .draft(let draft):
            NavigationLink(value: SupervisorNewsPreviewRoute(id: draft.id)) {
                HStack(alignment: .top, spacing: SabqLayout.space12) {
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        if draft.isBreaking {
                            Text("عاجل من المراسل")
                                .sabqText(SabqType.tag)
                                .foregroundStyle(SabqTheme.breaking)
                        }
                        Text([EditorialText.relative(draft.submittedAt), draft.categoryName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                        Text(draft.title)
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Text([draft.reporterName, draft.channel.title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                        if let lockedBy = draft.lockedBy {
                            Label("مفتوح الآن عند \(lockedBy)", systemImage: "lock")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.warning)
                        }
                    }
                    Spacer(minLength: 0)
                    if draft.thumbnailURL != nil {
                        ZStack(alignment: .bottomTrailing) {
                            EditorialThumbnail(url: draft.thumbnailURL, size: 64)
                            if draft.albumCount > 0 {
                                Text("+\(draft.albumCount)")
                                    .sabqText(SabqType.timestamp)
                                    .foregroundStyle(Color.white)
                                    .padding(.horizontal, 5)
                                    .background(Capsule().fill(Color.black.opacity(0.55)))
                                    .padding(4)
                            }
                        }
                    }
                }
                .padding(.vertical, SabqLayout.space12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        case .editRequest(let request):
            NavigationLink(value: EditRequestReviewRoute(id: request.id)) {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text(request.title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text([request.requesterName, request.onWhat, EditorialText.relative(request.submittedAt)]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    // نفس ملصق الويب: نابض، وأحمر إن كان عاجلًا.
                    EditRequestBadge(outcome: .pending, detail: request.label ?? "", urgent: request.urgent)
                    Text(EditorialStates.reviewRequest)
                        .sabqText(SabqType.button)
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, SabqLayout.space16)
                        .frame(minHeight: 40)
                        .background(Capsule().fill(SabqTheme.actionFill))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, SabqLayout.space12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        case .unknown:
            EmptyView()
        }
    }

    private func load() async {
        // هوية الطلب قبل await: الحساب والفلتر والتسلسل.
        let ticket = gate.begin(filter)
        error = nil
        if ticket.accountId != boardAccountId {
            // حساب آخر: لا يبقى شيء من قائمة السابق.
            board = EditorialNewsBoard()
            boardFilter = nil
            boardAccountId = ticket.accountId
        }
        do {
            let fresh = try await EditorialAPI.newsBoard(filter: ticket.key)
            guard gate.accepts(ticket, currentKey: filter) else { return }
            board = fresh
            boardFilter = ticket.key
            error = nil
        } catch {
            guard gate.accepts(ticket, currentKey: filter), !Task.isCancelled else { return }
            self.error = (error as? EditorialError) ?? .message(error.localizedDescription)
        }
    }
}

// MARK: - استعراض الخبر

/// استعراض خبر ينتظر القرار: انشر الآن، جدول، أو أعده للمراسل، مع اختيار القسم.
struct SupervisorNewsPreviewView: View {
    let id: String

    @Environment(\.dismiss) private var dismiss
    @State private var article: EditorialNewsPreview?
    @State private var categories: [EditorialCategory] = []
    @State private var categoryId: String?
    @State private var error: EditorialError?
    @State private var busy = false
    @State private var actionError: String?
    @State private var confirmPublish = false
    @State private var showSchedule = false
    @State private var scheduleAt = Date().addingTimeInterval(3600)
    @State private var showReturn = false
    @State private var returnNote = ""
    @State private var doneMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                if let article {
                    content(article)
                } else {
                    EditorialStatusView(error: error, loading: error == nil) { Task { await load() } }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, 200)
        }
        .background(SabqTheme.background)
        .safeAreaInset(edge: .bottom) {
            if let article { actionBar(article) }
        }
        .sabqRTL()
        .navigationTitle("استعراض الخبر")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .confirmationDialog("نشر الخبر الآن؟", isPresented: $confirmPublish, titleVisibility: .visible) {
            Button("انشر الآن") { Task { await publish() } }
            Button("تراجع", role: .cancel) {}
        } message: {
            Text("يظهر للقراء فورًا على الموقع والتطبيقات.")
        }
        .sheet(isPresented: $showSchedule) { scheduleSheet }
        .sheet(isPresented: $showReturn) { returnSheet }
    }

    @ViewBuilder
    private func content(_ article: EditorialNewsPreview) -> some View {
        if let hero = article.heroURL {
            CachedAsyncImage(url: hero, contentMode: .fill, maxPixelSize: 1400) {
                Rectangle().fill(SabqTheme.surfaceStrong)
            }
            .frame(height: 220)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .accessibilityLabel("الصورة البارزة")
        }
        if !article.albumURLs.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(article.albumURLs, id: \.self) { url in
                        EditorialThumbnail(url: url, size: 64)
                    }
                }
            }
        }

        HStack(spacing: SabqLayout.space8) {
            if !categories.isEmpty && article.isDecidable {
                Menu {
                    ForEach(categories) { category in
                        Button(category.name) { categoryId = category.id }
                    }
                } label: {
                    HStack(spacing: SabqLayout.space4) {
                        Text(categoryName(article))
                        Image(systemName: "chevron.down").font(SabqFonts.app(size: 11, weight: .semibold))
                    }
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.primary)
                    .padding(.horizontal, SabqLayout.space12)
                    .frame(minHeight: 34)
                    .background(Capsule().fill(SabqTheme.surfaceMuted))
                }
            } else if let name = article.category?.name {
                Text(name).sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.primary)
            }
            if article.isBreaking {
                Text("المراسل يراه عاجلًا")
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.breaking)
            }
        }

        Text(article.title)
            .sabqText(SabqType.articleTitle)
            .foregroundStyle(SabqTheme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)

        Text([article.reporterName, article.submittedAt.map { "وصل \(EditorialText.dayTime($0))" }, article.readinessLine]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
            .sabqText(SabqType.meta)
            .foregroundStyle(SabqTheme.textSecondary)

        if let lockedBy = article.lockedBy {
            Label("مفتوح الآن عند \(lockedBy) على الويب", systemImage: "lock")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.warning)
        }

        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            ForEach(Array(article.paragraphs.enumerated()), id: \.offset) { _, paragraph in
                Text(paragraph)
                    .sabqText(SabqType.articleBody)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private func actionBar(_ article: EditorialNewsPreview) -> some View {
        VStack(spacing: SabqLayout.space8) {
            if let doneMessage {
                Label(doneMessage, systemImage: "checkmark.circle.fill")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.success)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            } else if article.isDecidable {
                if let actionError {
                    Text(actionError)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                EditorialActionButton(title: "انشر الآن", busy: busy) { confirmPublish = true }
                HStack(spacing: SabqLayout.space8) {
                    EditorialActionButton(title: "جدول", style: .secondary, enabled: !busy) { showSchedule = true }
                    EditorialActionButton(title: "أعده للمراسل", style: .secondary, enabled: !busy) { showReturn = true }
                }
                Text("نفس القرار يظهر فورًا على الويب و«مكتب سبق»")
                    .sabqText(SabqType.timestamp)
                    .foregroundStyle(SabqTheme.textSecondary)
            } else {
                Text("هذا الخبر لم يعد ينتظر قرارًا (\(article.status)).")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space12)
        .padding(.bottom, SabqLayout.space8)
        .background(SabqTheme.surface.shadow(color: SabqTheme.shadow, radius: 12, y: -4))
    }

    private var scheduleSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                DatePicker("وقت النشر", selection: $scheduleAt, in: Date()..., displayedComponents: [.date, .hourAndMinute])
                    .datePickerStyle(.graphical)
                    .environment(\.calendar, Calendar(identifier: .gregorian))
                    .environment(\.locale, Locale(identifier: "ar_SA@numbers=latn;calendar=gregorian"))
                    .environment(\.timeZone, TimeZone(identifier: "Asia/Riyadh") ?? .current)
                EditorialActionButton(title: "جدول النشر", busy: busy) {
                    Task { await schedule() }
                }
                Spacer()
            }
            .padding(SabqLayout.pageMargin)
            .navigationTitle("جدولة الخبر")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { showSchedule = false } } }
            .sabqRTL()
        }
        .presentationDetents([.large])
    }

    private var returnSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                Text("ملاحظتك تصل للمراسل مع الإشعار.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                TextField("مثال: أضف موعد الافتتاح ومكانه", text: $returnNote, axis: .vertical)
                    .lineLimit(3...8)
                    .sabqText(SabqType.excerpt)
                    .modifier(SabqInputSurface())
                EditorialActionButton(title: "أعده للمراسل", busy: busy,
                                      enabled: returnNote.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3) {
                    Task { await returnToReporter() }
                }
                Spacer()
            }
            .padding(SabqLayout.pageMargin)
            .navigationTitle("إعادة للمراسل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { showReturn = false } } }
            .sabqRTL()
        }
        .presentationDetents([.medium, .large])
    }

    private func categoryName(_ article: EditorialNewsPreview) -> String {
        if let categoryId, let match = categories.first(where: { $0.id == categoryId }) { return match.name }
        return article.category?.name ?? "اختر القسم"
    }

    private var chosenCategory: String? {
        guard let categoryId, categoryId != article?.category?.id else { return nil }
        return categoryId
    }

    private func load() async {
        do {
            async let a = EditorialAPI.preview(id: id)
            async let c = EditorialAPI.categories()
            article = try await a
            categories = (try? await c) ?? []
            error = nil
        } catch let e as EditorialError {
            error = e
        } catch {
            self.error = .message(error.localizedDescription)
        }
    }

    private func publish() async {
        guard let article else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await EditorialAPI.publish(id: id, expectedUpdatedAt: article.updatedAt, categoryId: chosenCategory)
            actionError = nil
            doneMessage = "نُشر الخبر"
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func schedule() async {
        guard let article else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await EditorialAPI.schedule(id: id, at: scheduleAt, expectedUpdatedAt: article.updatedAt, categoryId: chosenCategory)
            actionError = nil
            showSchedule = false
            doneMessage = "جُدول للنشر \(EditorialText.dayTime(scheduleAt))"
        } catch {
            actionError = error.localizedDescription
            showSchedule = false
        }
    }

    private func returnToReporter() async {
        busy = true
        defer { busy = false }
        do {
            try await EditorialAPI.returnToReporter(id: id, note: returnNote.trimmingCharacters(in: .whitespacesAndNewlines))
            actionError = nil
            showReturn = false
            doneMessage = "أُعيد للمراسل"
        } catch {
            actionError = error.localizedDescription
            showReturn = false
        }
    }
}
