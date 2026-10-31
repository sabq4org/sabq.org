import PhotosUI
import SwiftUI

/// «طلب تعديل» من المراسل على خبره: ملاحظة، عنوان مقترح، تعديل فقرات،
/// صور للألبوم، استبدال الصورة البارزة، وعاجل. نفس الطلب الذي يظهر على الويب
/// و«مكتب سبق»، ولا يتغير شيء في الخبر حتى يعتمده المحرر.
struct EditRequestComposeView: View {
    let articleId: String
    let articleTitle: String
    let stateLabel: String

    @Environment(\.dismiss) private var dismiss

    @State private var context: EditRequestContext?
    @State private var loadError: EditorialError?
    @State private var note = ""
    @State private var proposedTitle = ""
    /// Paragraph index → replacement text.
    @State private var paragraphEdits: [Int: String] = [:]
    @State private var openParagraph: Int?
    @State private var appendParagraph = ""
    @State private var albumItems: [PhotosPickerItem] = []
    /// خانة لكل صورة مختارة بترتيب الاختيار؛ حالتها (رفع/مرفوعة/فشل) تُعرض
    /// على مصغّرتها، ولا تسقط صورة بصمت.
    /// كل رفع للألبوم (الدفعة وإعادة المحاولة) يمرّ بهذا المجدول وحده،
    /// فيبقى الحد 3 رفعات متزامنة في كل الأحوال.
    @State private var uploader = AlbumUploader(limit: EditRequestComposeView.albumUploadWidth)
    private var album: AlbumUploadQueue { uploader.queue }
    @State private var albumPreviews: [UUID: UIImage] = [:]
    /// ما يلزم لإعادة المحاولة: البيانات إن قُرئت، وإلا عنصر المكتبة نفسه.
    @State private var albumData: [UUID: Data] = [:]
    @State private var albumPickerItems: [UUID: PhotosPickerItem] = [:]
    @State private var heroItem: PhotosPickerItem?
    @State private var heroURL: String?
    @State private var heroPreview: UIImage?
    @State private var heroFailed = false
    /// الألبوم والصورة البارزة قد يُرفعان معًا؛ لكل منهما حالته حتى لا
    /// يُفعَّل الإرسال قبل اكتمال الاثنين.
    @State private var heroUploading = false
    private var uploading: String? {
        if album.uploadingCount > 0 { return "رفع الصور · بقي \(album.uploadingCount)" }
        return heroUploading ? "رفع الصورة البارزة" : nil
    }
    /// صورة اختيرت ولم تُرفع: لا يُرسل الطلب ناقصًا حتى يعيد المراسل المحاولة أو يحذفها.
    private var hasFailedImages: Bool { album.failedCount > 0 || heroFailed }
    @State private var urgent = false
    @State private var sending = false
    @State private var sendError: String?

    private static let albumLimit = 10
    private static let albumUploadWidth = 3

    private var hasProposal: Bool {
        !note.trimmed.isEmpty
            || (titleChanged)
            || !paragraphEdits.isEmpty
            || !appendParagraph.trimmed.isEmpty
            || !album.uploadedURLs.isEmpty
            || heroURL != nil
    }

    private var titleChanged: Bool {
        let t = proposedTitle.trimmed
        return !t.isEmpty && t != (context?.article.title ?? articleTitle)
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: SabqLayout.space16) {
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        Text(context?.article.title ?? articleTitle)
                            .sabqText(SabqType.leadTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("\(stateLabel) · لن يتغير شيء حتى يعتمده المحرر")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }

                    if let loadError {
                        EditorialStatusView(error: loadError, loading: false) { Task { await load() } }
                    } else if context == nil {
                        EditorialStatusView(error: nil, loading: true) {}
                    } else if context?.pendingRequestId != nil {
                        Text("لديك طلب قيد المراجعة على هذه المادة. انتظر قرار المحرر، أو ألغِه أولًا لإرسال طلب جديد.")
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .editorialGroup()
                    } else {
                        form
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space8)
                .padding(.bottom, 140)
            }
            .background(SabqTheme.background)
            .safeAreaInset(edge: .bottom) {
                if context != nil && context?.pendingRequestId == nil && loadError == nil {
                    VStack(spacing: SabqLayout.space8) {
                        if hasFailedImages {
                            Text("صورة لم تُرفع. أعد المحاولة بلمسها أو احذفها قبل الإرسال.")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        if let sendError {
                            Text(sendError)
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        EditorialActionButton(title: uploading ?? "أرسل الطلب", busy: sending || uploading != nil,
                                              enabled: hasProposal && !hasFailedImages) {
                            Task { await send() }
                        }
                        Text("نفس الطلب الذي يظهر على الويب، وتصلك نتيجته بإشعار")
                            .sabqText(SabqType.timestamp)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    .padding(.horizontal, SabqLayout.pageMargin)
                    .padding(.top, SabqLayout.space12)
                    .padding(.bottom, SabqLayout.space8)
                    .background(SabqTheme.surface.shadow(color: SabqTheme.shadow, radius: 12, y: -4))
                }
            }
            .navigationTitle("طلب تعديل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
            .sabqRTL()
            .task { await load() }
            .onChange(of: albumItems) { _, items in Task { await uploadAlbum(items) } }
            .onChange(of: heroItem) { _, item in Task { await uploadHero(item) } }
        }
    }

    // MARK: - Form

    private var form: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                label("ما الذي تريد تعديله؟")
                TextField("مثال: عدد دور النشر تغيّر بعد إعلان الهيئة", text: $note, axis: .vertical)
                    .lineLimit(3...6)
                    .sabqText(SabqType.excerpt)
                    .modifier(SabqInputSurface())
            }

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                label("العنوان المقترح")
                TextField("العنوان", text: $proposedTitle, axis: .vertical)
                    .lineLimit(1...3)
                    .sabqText(SabqType.rowTitle)
                    .modifier(SabqInputSurface())
            }

            if let paragraphs = context?.paragraphs, !paragraphs.isEmpty {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    label("تعديل فقرة · اختر الفقرة ثم اكتب البديل")
                    VStack(spacing: 0) {
                        ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, paragraph in
                            if index > 0 { Divider().overlay(SabqTheme.separator) }
                            paragraphRow(index: index, text: paragraph)
                        }
                    }
                    .padding(.horizontal, SabqLayout.cardInset)
                    .sabqNewsSurface()
                }
            }

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                label("فقرة جديدة في آخر النص (اختياري)")
                TextField("أضف معلومة جديدة", text: $appendParagraph, axis: .vertical)
                    .lineLimit(2...6)
                    .sabqText(SabqType.excerpt)
                    .modifier(SabqInputSurface())
            }

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                label("صور للألبوم · \(album.slots.count) من \(Self.albumLimit)")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: SabqLayout.space8) {
                        // الصور الموجودة في الخبر الآن (للعلم فقط)، ثم الجديدة.
                        ForEach(context?.article.albumImages ?? [], id: \.self) { url in
                            CachedAsyncImage(url: URL(string: url), contentMode: .fill, maxPixelSize: 200) {
                                SabqTheme.surfaceMuted
                            }
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                            .opacity(0.75)
                            .accessibilityLabel("صورة موجودة في الخبر")
                        }
                        ForEach(album.slots) { slot in
                            albumThumbnail(slot)
                        }
                        if album.slots.count < Self.albumLimit {
                            PhotosPicker(selection: $albumItems,
                                         maxSelectionCount: Self.albumLimit - album.slots.count,
                                         matching: .images) {
                                Image(systemName: "plus")
                                    .font(SabqFonts.app(size: 20, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primary)
                                    .frame(width: 64, height: 64)
                                    .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(SabqTheme.surfaceMuted))
                            }
                            .accessibilityLabel("أضف صورًا للألبوم")
                            // دفعة واحدة في كل مرة يبقي التوازي عند حدّه.
                            .disabled(album.uploadingCount > 0)
                        }
                    }
                }
            }

            VStack(spacing: 0) {
                PhotosPicker(selection: $heroItem, matching: .images) {
                    HStack {
                        Text("استبدال الصورة البارزة")
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                        Spacer()
                        if heroFailed {
                            Text("تعذر الرفع — اختر مجددًا")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.danger)
                        } else if let heroPreview {
                            Image(uiImage: heroPreview)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 44, height: 44)
                                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                        } else {
                            Text("اختر")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                    .frame(minHeight: 48)
                }
                .buttonStyle(.plain)
                if heroFailed {
                    Button("تجاهل الصورة البارزة") {
                        heroFailed = false
                    }
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.primary)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget, alignment: .leading)
                    .buttonStyle(.plain)
                }
                Divider().overlay(SabqTheme.separator)
                Toggle(isOn: $urgent) {
                    Text("عاجل")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                .tint(SabqTheme.actionFill)
                .frame(minHeight: 48)
            }
            .padding(.horizontal, SabqLayout.cardInset)
            .sabqNewsSurface()
        }
    }

    private func albumThumbnail(_ slot: AlbumUploadSlot) -> some View {
        let shape = RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
        return ZStack {
            if let image = albumPreviews[slot.id] {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                SabqTheme.surfaceMuted
            }
            switch slot.phase {
            case .waiting, .uploading:
                Color.black.opacity(0.35)
                ProgressView().tint(.white)
            case .uploaded:
                EmptyView()
            case .failed:
                Color.black.opacity(0.45)
                Image(systemName: "arrow.clockwise")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: 64, height: 64)
        .clipShape(shape)
        .overlay(shape.stroke(slot.isFailed ? SabqTheme.danger : .clear, lineWidth: 2))
        .overlay(alignment: .topLeading) {
            if !slot.isPending {
                Button {
                    removeAlbumSlot(slot.id)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(SabqFonts.app(size: 18, weight: .semibold))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Color.black.opacity(0.6))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("احذف الصورة")
            }
        }
        .contentShape(shape)
        .onTapGesture {
            if slot.isFailed { retryAlbumSlot(slot.id) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(slot.accessibilityText)
        .accessibilityAddTraits(slot.isFailed ? .isButton : [])
    }

    private func paragraphRow(index: Int, text: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    if openParagraph == index {
                        openParagraph = nil
                    } else {
                        openParagraph = index
                        if paragraphEdits[index] == nil { paragraphEdits[index] = text }
                    }
                }
            } label: {
                HStack(alignment: .top, spacing: SabqLayout.space8) {
                    Image(systemName: paragraphEdits[index].map { $0.trimmed != text } == true ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(SabqTheme.primary)
                        .accessibilityHidden(true)
                    Text(text)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(paragraphEdits[index] != nil && paragraphEdits[index]?.trimmed != text
                                         ? SabqTheme.textTertiary : SabqTheme.textPrimary)
                        .strikethrough(paragraphEdits[index] != nil && paragraphEdits[index]?.trimmed != text)
                        .lineLimit(openParagraph == index ? nil : 3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)

            if openParagraph == index {
                TextField("البديل", text: Binding(
                    get: { paragraphEdits[index] ?? text },
                    set: { paragraphEdits[index] = $0 }
                ), axis: .vertical)
                .lineLimit(2...10)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.success)
                .modifier(SabqInputSurface())
            }
        }
        .padding(.vertical, SabqLayout.space12)
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .sabqText(SabqType.metaEmphasis)
            .foregroundStyle(SabqTheme.textSecondary)
    }

    // MARK: - Actions

    private func load() async {
        do {
            let ctx = try await EditorialAPI.editRequestContext(articleId: articleId)
            context = ctx
            if proposedTitle.isEmpty { proposedTitle = ctx.article.title }
            loadError = nil
        } catch let e as EditorialError {
            loadError = e
        } catch {
            loadError = .message(error.localizedDescription)
        }
    }

    private func uploadAlbum(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        albumItems = []
        sendError = nil
        let ids = uploader.add(count: items.count, cap: Self.albumLimit)
        for (id, item) in zip(ids, items) { albumPickerItems[id] = item }
        uploader.perform = { id in await performAlbumUpload(id) }
        uploader.start()
    }

    private func retryAlbumSlot(_ id: UUID) {
        uploader.perform = { id in await performAlbumUpload(id) }
        uploader.retry(id)
    }

    /// رفع خانة واحدة: قراءة الصورة من المكتبة (أو بياناتها المحفوظة من محاولة
    /// سابقة) ثم الرفع. يعيد الحالة النهائية؛ المجدول يحدّث الخانة ويبدأ التالية.
    private func performAlbumUpload(_ id: UUID) async -> AlbumUploadSlot.Phase {
        let data: Data
        if let cached = albumData[id] {
            data = cached
        } else {
            guard let loaded = try? await albumPickerItems[id]?.loadTransferable(type: Data.self) else {
                return .failed("تعذر قراءة الصورة من المكتبة")
            }
            data = loaded
            albumData[id] = loaded
            if albumPreviews[id] == nil { albumPreviews[id] = UIImage(data: loaded) }
        }
        do {
            let url = try await APIClient.shared.uploadSubmissionImage(data, slot: "edit-album")
            return .uploaded(url: url)
        } catch {
            return .failed("تعذر رفع الصورة")
        }
    }

    private func removeAlbumSlot(_ id: UUID) {
        uploader.remove(id)
        albumPreviews[id] = nil
        albumData[id] = nil
        albumPickerItems[id] = nil
    }

    private func uploadHero(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        sendError = nil
        heroFailed = false
        heroUploading = true
        defer { heroUploading = false }
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            markHeroFailed()
            return
        }
        do {
            heroURL = try await APIClient.shared.uploadSubmissionImage(data, slot: "edit-hero")
            heroPreview = UIImage(data: data)
        } catch {
            markHeroFailed()
        }
    }

    /// فشل اختيار جديد لا يُبقي صورة بارزة سابقة تُرسل دون علم المستخدم، ويفرّغ
    /// المنتقي كي يطلق اختيار الصورة نفسها مرة أخرى `onChange`.
    private func markHeroFailed() {
        heroFailed = true
        heroURL = nil
        heroPreview = nil
        heroItem = nil
    }

    private func send() async {
        guard let context, uploading == nil, !hasFailedImages else { return }
        let albumURLs = album.uploadedURLs
        sending = true
        sendError = nil
        defer { sending = false }

        let edits = paragraphEdits.sorted { $0.key < $1.key }.compactMap { index, after -> EditRequestDraft.ContentEdit? in
            guard context.paragraphs.indices.contains(index) else { return nil }
            let before = context.paragraphs[index]
            let next = after.trimmed
            return next == before ? nil : EditRequestDraft.ContentEdit(before: before, after: next)
        }
        let append = appendParagraph.trimmed
        let draft = EditRequestDraft(
            articleId: context.article.id,
            urgent: urgent,
            note: note.trimmed,
            proposed: .init(
                title: titleChanged ? proposedTitle.trimmed : nil,
                contentEdits: edits.isEmpty ? nil : edits,
                appendParagraph: append.isEmpty ? nil : append,
                imageUrl: heroURL,
                albumAdd: albumURLs.isEmpty ? nil : albumURLs
            )
        )
        do {
            try await EditorialAPI.createEditRequest(draft)
            dismiss()
        } catch {
            sendError = error.localizedDescription
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

// MARK: - رفع الألبوم (منطق خالص قابل للاختبار)

nonisolated struct AlbumUploadSlot: Identifiable, Equatable, Sendable {
    enum Phase: Equatable, Sendable {
        /// بانتظار مكان ضمن حد الرفع المتزامن.
        case waiting
        case uploading
        case uploaded(url: String)
        case failed(String)
    }

    let id: UUID
    var phase: Phase

    var isFailed: Bool { if case .failed = phase { return true } else { return false } }
    var isPending: Bool { phase == .waiting || phase == .uploading }

    var accessibilityText: String {
        switch phase {
        case .waiting, .uploading: return "صورة قيد الرفع"
        case .uploaded: return "صورة مرفوعة"
        case .failed(let reason): return "\(reason). المس لإعادة المحاولة"
        }
    }
}

/// خانات الألبوم بترتيب اختيار المراسل. الترتيب ثابت مهما اختلف ترتيب
/// اكتمال الرفع، والفشل يبقى ظاهرًا في خانته حتى يُعاد أو يُحذف.
nonisolated struct AlbumUploadQueue: Equatable, Sendable {
    private(set) var slots: [AlbumUploadSlot] = []

    /// يضيف خانات جديدة «بانتظار الرفع» ضمن سقف الألبوم، ويعيد معرّفاتها بالترتيب.
    mutating func enqueue(count: Int, limit: Int) -> [UUID] {
        let room = max(0, min(count, limit - slots.count))
        let added = (0..<room).map { _ in AlbumUploadSlot(id: UUID(), phase: .waiting) }
        slots.append(contentsOf: added)
        return added.map(\.id)
    }

    /// يعيد خانة فاشلة إلى الانتظار. false إن لم تكن فاشلة (مرفوعة أو جارية أو محذوفة).
    mutating func requestUpload(_ id: UUID) -> Bool {
        guard let index = slots.firstIndex(where: { $0.id == id }), slots[index].isFailed else { return false }
        slots[index].phase = .waiting
        return true
    }

    /// ينقل خانات الانتظار (بترتيب الخانات) إلى «رفع» ما دام عدد الجاري أقل من الحد،
    /// ويعيد ما يجب بدؤه الآن. هذا هو الموضع الوحيد الذي يقرر بدء رفع.
    mutating func nextToStart(limit: Int) -> [UUID] {
        var room = max(1, limit) - activeCount
        var started: [UUID] = []
        for index in slots.indices where room > 0 && slots[index].phase == .waiting {
            slots[index].phase = .uploading
            started.append(slots[index].id)
            room -= 1
        }
        return started
    }

    mutating func apply(_ id: UUID, _ phase: AlbumUploadSlot.Phase) {
        guard let index = slots.firstIndex(where: { $0.id == id }) else { return }
        slots[index].phase = phase
    }

    mutating func remove(_ id: UUID) {
        slots.removeAll { $0.id == id }
    }

    var uploadedURLs: [String] {
        slots.compactMap { if case .uploaded(let url) = $0.phase { return url } else { return nil } }
    }

    /// المتبقي (جارٍ + بانتظار) — لما يُعرض على زر الإرسال.
    var uploadingCount: Int { slots.filter(\.isPending).count }
    /// الجاري فعلًا الآن؛ لا يتجاوز حد المجدول.
    var activeCount: Int { slots.filter { $0.phase == .uploading }.count }
    var failedCount: Int { slots.filter(\.isFailed).count }
}

/// مجدول رفع الألبوم: حد واحد مشترك بين الدفعة وإعادة المحاولة.
@MainActor
@Observable
final class AlbumUploader {
    private(set) var queue = AlbumUploadQueue()
    let limit: Int
    /// يرفع خانة واحدة ويعيد حالتها النهائية (`.uploaded` أو `.failed`).
    @ObservationIgnored var perform: (UUID) async -> AlbumUploadSlot.Phase = { _ in .failed("") }

    init(limit: Int) {
        self.limit = max(1, limit)
    }

    func add(count: Int, cap: Int) -> [UUID] {
        queue.enqueue(count: count, limit: cap)
    }

    /// يبدأ ما يسمح به الحد؛ كل رفع ينتهي يستدعيه من جديد ليأخذ التالي.
    func start() {
        for id in queue.nextToStart(limit: limit) {
            Task {
                let phase = await perform(id)
                queue.apply(id, phase)
                start()
            }
        }
    }

    func retry(_ id: UUID) {
        guard queue.requestUpload(id) else { return }
        start()
    }

    func remove(_ id: UUID) {
        queue.remove(id)
    }
}
