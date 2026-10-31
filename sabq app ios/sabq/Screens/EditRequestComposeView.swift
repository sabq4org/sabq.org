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
    @State private var albumURLs: [String] = []
    @State private var albumPreviews: [UIImage] = []
    @State private var heroItem: PhotosPickerItem?
    @State private var heroURL: String?
    @State private var heroPreview: UIImage?
    /// الألبوم والصورة البارزة قد يُرفعان معًا؛ لكل منهما حالته حتى لا
    /// يُفعَّل الإرسال قبل اكتمال الاثنين.
    @State private var albumUploading: String?
    @State private var heroUploading = false
    private var uploading: String? { albumUploading ?? (heroUploading ? "رفع الصورة البارزة" : nil) }
    @State private var urgent = false
    @State private var sending = false
    @State private var sendError: String?

    private static let albumLimit = 10

    private var hasProposal: Bool {
        !note.trimmed.isEmpty
            || (titleChanged)
            || !paragraphEdits.isEmpty
            || !appendParagraph.trimmed.isEmpty
            || !albumURLs.isEmpty
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
                        Text("لديك طلب قيد المراجعة على هذا الخبر. ألغِه من «أخباري» أولًا لإرسال طلب جديد.")
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
                        if let sendError {
                            Text(sendError)
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        EditorialActionButton(title: uploading ?? "أرسل الطلب", busy: sending || uploading != nil,
                                              enabled: hasProposal) {
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
                label("فقرة جديدة في آخر الخبر (اختياري)")
                TextField("أضف معلومة جديدة", text: $appendParagraph, axis: .vertical)
                    .lineLimit(2...6)
                    .sabqText(SabqType.excerpt)
                    .modifier(SabqInputSurface())
            }

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                label("صور للألبوم · \(albumURLs.count) من \(Self.albumLimit)")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: SabqLayout.space8) {
                        ForEach(Array(albumPreviews.enumerated()), id: \.offset) { _, image in
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 64, height: 64)
                                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                        }
                        if albumURLs.count < Self.albumLimit {
                            PhotosPicker(selection: $albumItems,
                                         maxSelectionCount: Self.albumLimit - albumURLs.count,
                                         matching: .images) {
                                Image(systemName: "plus")
                                    .font(SabqFonts.app(size: 20, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primary)
                                    .frame(width: 64, height: 64)
                                    .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(SabqTheme.surfaceMuted))
                            }
                            .accessibilityLabel("أضف صورًا للألبوم")
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
                        if let heroPreview {
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
        sendError = nil
        for (index, item) in items.enumerated() {
            guard albumURLs.count < Self.albumLimit else { break }
            albumUploading = "رفع الصور \(index + 1) من \(items.count)"
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            do {
                let url = try await APIClient.shared.uploadSubmissionImage(data, slot: "edit-album")
                albumURLs.append(url)
                if let image = UIImage(data: data) { albumPreviews.append(image) }
            } catch {
                sendError = "تعذر رفع إحدى الصور. حاول مجددًا."
            }
        }
        albumUploading = nil
        albumItems = []
    }

    private func uploadHero(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        sendError = nil
        heroUploading = true
        defer { heroUploading = false }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        do {
            heroURL = try await APIClient.shared.uploadSubmissionImage(data, slot: "edit-hero")
            heroPreview = UIImage(data: data)
        } catch {
            sendError = "تعذر رفع الصورة البارزة. حاول مجددًا."
        }
    }

    private func send() async {
        guard let context, uploading == nil else { return }
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
