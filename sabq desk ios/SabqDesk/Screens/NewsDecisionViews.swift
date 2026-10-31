import SabqDeskDesign
import SabqDeskKit
import SwiftUI

// «الأخبار» decision screens (approved mockup 2026-10-31): the news preview
// with publish / schedule / return, and the edit-request review where the
// supervisor picks what to apply. Full text editing stays on the web editor
// («افتح في الويب»).

// MARK: - Preview and decide

struct NewsPreviewSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(AppLockController.self) private var appLock
    @Environment(\.dismiss) private var dismiss

    let articleID: String
    let fallbackTitle: String
    /// A one-line result for the list after the sheet closes.
    let onDone: (String) -> Void

    @State private var preview: StaffNewsPreview?
    @State private var errorText: String?
    @State private var categories: [StaffNewsCategory] = []
    @State private var category: StaffNewsCategory?
    @State private var isBusy = false
    @State private var confirmsPublish = false
    @State private var showsSchedule = false
    @State private var showsReturn = false
    @State private var webPage: DeskWebPage?
    @State private var editRequest: NewsView.NewsTarget?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DeskLayout.space16) {
                    if let preview {
                        article(preview)
                    } else if let errorText {
                        ErrorLine(message: errorText)
                        Button("أعد المحاولة") { Task { await load() } }
                            .buttonStyle(DeskPrimaryButtonStyle())
                    } else {
                        Text(fallbackTitle)
                            .deskText(DeskType.sectionHeading)
                            .foregroundStyle(DeskTheme.textPrimary)
                        HStack { Spacer(); ProgressView(); Spacer() }
                            .padding(.vertical, DeskLayout.space32)
                    }
                }
                .padding(.horizontal, DeskLayout.pageMargin + 4)
                .padding(.top, DeskLayout.space8)
                .padding(.bottom, 200)
            }
            .background(DeskTheme.background)
            .safeAreaInset(edge: .bottom) { actionBar }
            .navigationTitle("استعراض الخبر")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() } }
                if let url = preview?.webEditURL {
                    ToolbarItem(placement: .primaryAction) {
                        Button { webPage = DeskWebPage(url: url) } label: {
                            Image(systemName: "arrow.up.forward.square")
                        }
                        .accessibilityLabel("افتح في الويب")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
        }
        .fullScreenCover(item: $webPage, onDismiss: { Task { await load() } }) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
        .confirmationDialog("نشر «\(preview?.title ?? fallbackTitle)» الآن؟", isPresented: $confirmsPublish,
                            titleVisibility: .visible) {
            Button("انشر الآن") { Task { await publish() } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("يُنشر الخبر فورًا على سبق بعد التحقق بـ Face ID، ويصل المراسل تنبيه بالنشر.")
        }
        .sheet(isPresented: $showsSchedule) {
            ScheduleSheet(initial: nil, title: "موعد الخبر",
                          prompt: "متى يُنشر الخبر؟ الأوقات بتوقيت الرياض مهما كان توقيت جهازك.") { date in
                Task { await schedule(at: date) }
            }
        }
        .sheet(isPresented: $showsReturn) {
            NewsNoteSheet(title: "إعادة الخبر للمراسل",
                          header: "ملاحظتك إلى \(preview?.reporterName ?? "المراسل")",
                          footer: "الملاحظة مطلوبة وتصل إلى المراسل مع إشعار وبريد.",
                          placeholder: "ما الذي يحتاج تعديلًا؟",
                          confirm: "أعده للمراسل",
                          limit: 2000) { note in
                Task { await returnToReporter(note: note) }
            }
        }
        .sheet(item: $editRequest, onDismiss: { Task { await load() } }) { target in
            EditRequestReviewSheet(requestID: target.id, fallbackTitle: preview?.title ?? "", onDone: onDone)
        }
    }

    // MARK: Parts

    private func article(_ preview: StaffNewsPreview) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            if let lockedBy = preview.lockedBy {
                banner("مفتوح للتحرير عند \(lockedBy) الآن · انتظر انتهاءه قبل القرار", systemImage: "lock", tone: .warning)
            } else if !preview.isDecidable {
                banner(preview.status == "published" ? "منشور على سبق" : (preview.status == "scheduled" ? "مجدول" : "لم يعد بانتظار القرار"),
                       systemImage: "checkmark.seal", tone: .success)
            }
            if let requestID = preview.pendingEditRequestId {
                Button { editRequest = NewsView.NewsTarget(id: requestID) } label: {
                    banner("على الخبر طلب تعديل مفتوح · راجعه", systemImage: "square.and.pencil", tone: .warning)
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 0) {
                if let url = preview.heroURL {
                    remoteImage(url, height: 200)
                        .overlay(alignment: .topTrailing) {
                            Text("الصورة البارزة")
                                .deskText(DeskType.tag)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 3)
                                .background(Color.white.opacity(0.92), in: Capsule())
                                .padding(10)
                        }
                }
                if !preview.albumURLs.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(Array(preview.albumURLs.prefix(3).enumerated()), id: \.offset) { _, url in
                            remoteImage(url, height: 58).frame(width: 58)
                        }
                        if preview.albumURLs.count > 3 {
                            Text(verbatim: "+\(preview.albumURLs.count - 3)")
                                .deskText(DeskType.metaEmphasis)
                                .foregroundStyle(DeskTheme.textSecondary)
                                .frame(width: 58, height: 58)
                                .background(DeskTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        Spacer(minLength: 0)
                        Text("الألبوم \(preview.albumURLs.count)")
                            .deskText(DeskType.meta)
                            .foregroundStyle(DeskTheme.textTertiary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 10)
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        categoryMenu(preview)
                        if preview.isBreaking {
                            Text("المراسل يراه عاجلًا")
                                .deskText(DeskType.tag)
                                .foregroundStyle(DeskTone.danger.ink)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 3)
                                .background(DeskTone.danger.fill, in: Capsule())
                        }
                    }
                    Text(preview.title)
                        .deskText(DeskType.pageTitle)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if let subtitle = preview.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .deskText(DeskType.excerpt)
                            .foregroundStyle(DeskTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text(metaLine(preview))
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textTertiary)
                    NewsArticleBlocks(html: preview.content)
                        .padding(.top, 6)
                }
                .padding(16)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DeskCardBackground(radius: DeskRadius.large))
            .clipShape(RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous))
            .textSelection(.enabled)
        }
    }

    private func metaLine(_ preview: StaffNewsPreview) -> String {
        var parts: [String] = []
        if let name = preview.reporterName { parts.append(name) }
        if let at = preview.submittedAt { parts.append("وصل \(RiyadhTime.timeString(at))") }
        if let ready = preview.readinessLine { parts.append(ready) }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private func categoryMenu(_ preview: StaffNewsPreview) -> some View {
        let current = category ?? preview.category
        Menu {
            ForEach(categories) { item in
                Button(item.name) { category = item }
            }
        } label: {
            Text("\(current?.name ?? "اختر القسم") ▾")
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskInk.link)
                .padding(.horizontal, 12)
                .frame(minHeight: 30)
                .background(DeskTheme.skyTint, in: Capsule())
                .overlay(Capsule().strokeBorder(DeskTheme.skyOutline, lineWidth: 1))
        }
        .disabled(!preview.isDecidable || categories.isEmpty)
        .accessibilityLabel("القسم: \(current?.name ?? "غير محدد")")
    }

    private func banner(_ text: String, systemImage: String, tone: DeskTone) -> some View {
        Label(text, systemImage: systemImage)
            .deskText(DeskType.metaEmphasis)
            .foregroundStyle(tone.ink)
            .padding(.horizontal, DeskLayout.space12)
            .padding(.vertical, DeskLayout.space8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tone.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func remoteImage(_ url: URL, height: CGFloat) -> some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                DeskTheme.surfaceMuted
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: height > 100 ? 0 : 12, style: .continuous))
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var actionBar: some View {
        if let preview, preview.isDecidable {
            VStack(spacing: 10) {
                Button("انشر الآن") { confirmsPublish = true }
                    .buttonStyle(DeskPrimaryButtonStyle())
                HStack(spacing: 10) {
                    Button("جدول") { showsSchedule = true }
                        .buttonStyle(DeskSecondaryButtonStyle())
                    Button("أعده للمراسل") { showsReturn = true }
                        .buttonStyle(DeskSecondaryButtonStyle())
                }
                Text("التعديل الكامل للنص من «افتح في الويب» أعلى الشاشة")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
            }
            .disabled(isBusy || preview.lockedBy != nil)
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            .padding(.top, 14)
            .padding(.bottom, 8)
            .background(.bar)
        }
    }

    // MARK: Actions

    private func load() async {
        errorText = nil
        do {
            preview = try await app.client.newsPreview(id: articleID)
            if categories.isEmpty { categories = (try? await app.client.newsCategories()) ?? [] }
        } catch {
            if !app.handle(error) {
                errorText = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    /// The category only travels when the supervisor changed it.
    private var changedCategoryID: String? {
        guard let category, category.id != preview?.category?.id else { return nil }
        return category.id
    }

    private func perform(done: String, _ call: () async throws -> Void) async {
        isBusy = true
        errorText = nil
        defer { isBusy = false }
        do {
            try await call()
            onDone(done)
            dismiss()
        } catch {
            if !app.handle(error) {
                errorText = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
                await load()
            }
        }
    }

    private func publish() async {
        guard let preview else { return }
        switch await appLock.confirmSensitiveAction(reason: "تأكيد نشر الخبر الآن") {
        case .confirmed:
            await perform(done: "نُشر «\(preview.title)»") {
                _ = try await app.client.publishNews(id: preview.id, expectedUpdatedAt: preview.updatedAt,
                                                     categoryID: changedCategoryID)
            }
        case .cancelled:
            break
        case .failed(let message):
            errorText = message
        }
    }

    private func schedule(at date: Date) async {
        guard let preview else { return }
        await perform(done: "جُدول الخبر \(RiyadhTime.displayString(date))") {
            _ = try await app.client.scheduleNews(id: preview.id, at: date, expectedUpdatedAt: preview.updatedAt,
                                                  categoryID: changedCategoryID)
        }
    }

    private func returnToReporter(note: String) async {
        guard let preview else { return }
        await perform(done: "أُعيد الخبر إلى \(preview.reporterName ?? "المراسل")") {
            _ = try await app.client.returnNewsToReporter(id: preview.id, note: note)
        }
    }
}

/// The article body as readers will see it (paragraphs, headings, quotes, lists).
struct NewsArticleBlocks: View {
    let html: String

    var body: some View {
        let blocks = StaffArticleBlock.parse(html: html)
        VStack(alignment: .leading, spacing: 14) {
            if blocks.isEmpty {
                Text("لا نص في الخبر بعد.")
                    .deskText(DeskType.body)
                    .foregroundStyle(DeskTheme.textTertiary)
            }
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block.kind {
                case .heading:
                    Text(block.text)
                        .deskText(DeskType.sectionHeading)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                case .quote:
                    HStack(alignment: .top, spacing: DeskLayout.space12) {
                        RoundedRectangle(cornerRadius: 2).fill(DeskInk.action).frame(width: 3)
                        Text(block.text)
                            .deskText(DeskType.body)
                            .foregroundStyle(DeskTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                case .listItem:
                    HStack(alignment: .firstTextBaseline, spacing: DeskLayout.space8) {
                        Text(verbatim: "•").foregroundStyle(DeskInk.link)
                        Text(block.text)
                            .deskText(DeskType.body)
                            .foregroundStyle(DeskTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                case .paragraph:
                    Text(block.text)
                        .deskText(DeskType.body)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - Edit request review

struct EditRequestReviewSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    let requestID: String
    let fallbackTitle: String
    let onDone: (String) -> Void

    @State private var detail: StaffEditRequestDetail?
    @State private var selected: Set<StaffEditRequestField> = []
    @State private var updateLine = ""
    @State private var regenerate = true
    @State private var errorText: String?
    @State private var isBusy = false
    @State private var showsReject = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let detail {
                        content(detail)
                    } else if let errorText {
                        ErrorLine(message: errorText)
                        Button("أعد المحاولة") { Task { await load() } }
                            .buttonStyle(DeskPrimaryButtonStyle())
                    } else {
                        Text(fallbackTitle)
                            .deskText(DeskType.sectionHeading)
                            .foregroundStyle(DeskTheme.textPrimary)
                        HStack { Spacer(); ProgressView(); Spacer() }
                            .padding(.vertical, DeskLayout.space32)
                    }
                }
                .padding(.horizontal, DeskLayout.pageMargin + 4)
                .padding(.top, DeskLayout.space8)
                .padding(.bottom, 180)
            }
            .background(DeskTheme.background)
            .safeAreaInset(edge: .bottom) { actionBar }
            .navigationTitle("طلب تعديل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() } }
            }
            .task { await load() }
        }
        .sheet(isPresented: $showsReject) {
            NewsNoteSheet(title: "رفض طلب التعديل",
                          header: "سبب الرفض إلى \(detail?.request.requesterName ?? "المراسل")",
                          footer: "يصل السبب إلى المراسل مع تنبيه. لا يتغير شيء في الخبر.",
                          placeholder: "لماذا لا يُعتمد الطلب؟",
                          confirm: "ارفض الطلب",
                          limit: 1000) { reason in
                Task { await reject(reason: reason) }
            }
        }
    }

    @ViewBuilder
    private func content(_ detail: StaffEditRequestDetail) -> some View {
        let request = detail.request
        VStack(alignment: .leading, spacing: 4) {
            Text("\(detail.article.status == "published" ? "خبر منشور" : "مسودة") · \(request.requesterName) · \(RiyadhTime.ago(request.createdAt))")
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
            Text(detail.article.title)
                .deskText(DeskTextRole(size: 17, weight: .bold, style: .headline, lineSpacing: 3))
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 4)

        if !request.isPending {
            Label(closedLine(request), systemImage: "checkmark.seal")
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskTone.success.ink)
        }

        if let note = request.note, !note.isEmpty {
            Text("«\(note)»")
                .deskText(DeskType.excerpt)
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(DeskInk.bubble, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }

        if !detail.fields.isEmpty {
            Text("اختر ما تطبّقه")
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
                .padding(.horizontal, 4)
            VStack(spacing: 0) {
                ForEach(Array(detail.fields.enumerated()), id: \.element) { index, field in
                    fieldRow(field, detail: detail)
                    if index < detail.fields.count - 1 {
                        Divider().overlay(DeskInk.hairline)
                    }
                }
            }
            .background(DeskCardBackground(radius: DeskRadius.large))

            if detail.article.status == "published" {
                TextField("سطر «تحديث» يظهر على الخبر (اختياري)", text: $updateLine)
                    .deskText(DeskType.excerpt)
                    .padding(12)
                    .background(DeskCardBackground(radius: 14))
            }
            if selected.contains(.title) || selected.contains(.subtitle) || selected.contains(.content) {
                Toggle("أعد توليد الموجز والسيو بعد التطبيق", isOn: $regenerate)
                    .deskText(DeskType.excerpt)
                    .tint(DeskInk.action)
                    .padding(.horizontal, 4)
            }
        }
        if let errorText {
            ErrorLine(message: errorText)
        }
        Text("يُحفظ التعديل في سجل الخبر باسم المراسل واسمك")
            .deskText(DeskType.meta)
            .foregroundStyle(DeskTheme.textTertiary)
            .padding(.horizontal, 4)
    }

    private func closedLine(_ request: StaffEditRequestDetail.Request) -> String {
        guard request.status == "approved" else { return "حُسم هذا الطلب ولم يعد مفتوحًا" }
        if let name = request.decidedByName { return "اعتُمد هذا الطلب · \(name)" }
        return "اعتُمد هذا الطلب"
    }

    private func fieldRow(_ field: StaffEditRequestField, detail: StaffEditRequestDetail) -> some View {
        let proposed = detail.request.proposed
        return VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: Binding(get: { selected.contains(field) },
                                 set: { on in if on { selected.insert(field) } else { selected.remove(field) } })) {
                Text(field == .albumImages ? "\(proposed.albumAdd?.count ?? 0) صور للألبوم" : field.title)
                    .deskText(DeskTextRole(size: 15, weight: .semibold, style: .subheadline, lineSpacing: 0))
                    .foregroundStyle(DeskTheme.textPrimary)
            }
            .tint(DeskInk.action)
            .disabled(!detail.request.isPending)

            switch field {
            case .title:
                change(before: detail.article.title, after: proposed.title)
            case .subtitle:
                change(before: detail.article.subtitle, after: proposed.subtitle)
            case .content:
                ForEach(Array(detail.contentEdits.enumerated()), id: \.offset) { _, edit in
                    change(before: edit.before, after: edit.after)
                    if !edit.found {
                        QuietLine(systemImage: "exclamationmark.triangle", text: "تغيّرت هذه الفقرة بعد الطلب · عدّلها من الويب")
                    }
                }
                if let added = proposed.appendParagraph, !added.isEmpty {
                    change(before: nil, after: added)
                }
            case .imageUrl:
                imageStrip([proposed.imageUrl].compactMap { $0 })
            case .albumImages:
                imageStrip(proposed.albumAdd ?? [])
            case .unknown:
                EmptyView()
            }
        }
        .padding(14)
    }

    @ViewBuilder
    private func change(before: String?, after: String?) -> some View {
        if let before, !before.isEmpty {
            Text(before)
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textTertiary)
                .strikethrough()
                .fixedSize(horizontal: false, vertical: true)
        }
        if let after, !after.isEmpty {
            Text(after)
                .deskText(DeskType.excerpt)
                .foregroundStyle(DeskTone.success.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(DeskTone.success.fill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func imageStrip(_ raw: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(raw.compactMap { DeskAvatarURL.https($0) }, id: \.absoluteString) { url in
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            DeskTheme.surfaceMuted
                        }
                    }
                    .frame(width: 70, height: 70)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)
                }
            }
        }
    }

    @ViewBuilder
    private var actionBar: some View {
        if let detail, detail.request.isPending {
            VStack(spacing: 10) {
                Button(StaffEditRequestDetail.approveTitle(selected: selected.count, total: detail.fields.count)) {
                    Task { await approve() }
                }
                .buttonStyle(DeskPrimaryButtonStyle())
                .disabled(!detail.fields.isEmpty && selected.isEmpty)
                Button("ارفض مع سبب") { showsReject = true }
                    .buttonStyle(DeskSecondaryButtonStyle())
                    .foregroundStyle(DeskTheme.danger)
            }
            .disabled(isBusy)
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            .padding(.top, 14)
            .padding(.bottom, 8)
            .background(.bar)
        }
    }

    private func load() async {
        errorText = nil
        do {
            let loaded = try await app.client.editRequest(id: requestID)
            if detail == nil {
                // Everything on by default, except a rewrite whose paragraph moved on.
                selected = Set(loaded.fields.filter { $0 != .content || !loaded.hasMissingParagraphs })
            }
            detail = loaded
        } catch {
            if !app.handle(error) {
                errorText = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    private func approve() async {
        guard let detail else { return }
        isBusy = true
        errorText = nil
        defer { isBusy = false }
        do {
            let fields = detail.fields.filter { selected.contains($0) }
            let textChanged = fields.contains(.title) || fields.contains(.subtitle) || fields.contains(.content)
            _ = try await app.client.approveEditRequest(id: requestID, fields: fields,
                                                        updateLine: updateLine,
                                                        regenerate: regenerate && textChanged)
            onDone("اعتُمد طلب \(detail.request.requesterName) وطُبّق على الخبر")
            dismiss()
        } catch {
            if !app.handle(error) {
                errorText = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
                await load()
            }
        }
    }

    private func reject(reason: String) async {
        guard let detail else { return }
        isBusy = true
        errorText = nil
        defer { isBusy = false }
        do {
            try await app.client.rejectEditRequest(id: requestID, reason: reason)
            onDone("رُفض طلب \(detail.request.requesterName) ووصله السبب")
            dismiss()
        } catch {
            if !app.handle(error) {
                errorText = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}
