import SwiftUI
import UIKit
import PhotosUI

/// Form for resubmitting an article the editor sent back. Mirrors the
/// look-and-feel of `ArticleSubmissionView` (same SurfaceCard,
/// SabqRichTextEditor, image picker), with two differences:
///
/// 1. An amber banner at the top surfaces the editor's `reviewNotes`
///    with a "✓ فهمت" button that collapses it to a small chip
///    (kept visible but unobtrusive).
/// 2. Fields are pre-populated from `/api/v1/articles/:id/draft`. The
///    hero image shows the existing CF URL until the writer picks a
///    replacement; album images same.
///
/// Submit hits `PUT /api/v1/articles/:id/resubmit`, which flips
/// `review_status` back to `pending_review` server-side. On success
/// the card is removed from `ArticleRevisionsStore` optimistically
/// and the user pops back.
struct ArticleRevisionView: View {
    let articleId: String

    @Environment(\.dismiss) private var dismiss
    @Environment(ArticleRevisionsStore.self) private var store

    @State private var draft: ArticleDraftPayload?
    @State private var loadingError: String?

    @State private var title = ""
    @State private var bodyText = ""
    @State private var existingHeroURL: String?
    @State private var existingAlbumURLs: [String] = []
    @State private var newHeroData: Data?
    @State private var newHeroPreview: UIImage?
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var newAlbumPreviews: [UIImage] = []
    @State private var newAlbumData: [Data] = []
    @State private var replacedHero = false
    @State private var replacedAlbum = false

    @State private var screenState: Stage = .loading
    @State private var errorMessage: String?
    @State private var noteCollapsed = false

    @FocusState private var focusedField: Field?

    enum Stage {
        case loading
        case form
        case submitting
        case success
        /// The article isn't in `needs_changes` anymore. Reached when
        /// the writer taps the same notification twice — instead of
        /// the form we show a "you already sent the edit" placeholder.
        case alreadyResubmitted
    }

    enum Field: Hashable { case title, body }

    private var isOpinion: Bool { draft?.isOpinion ?? true }
    private var maxImages: Int { isOpinion ? 1 : 10 }
    private var pageTint: Color { isOpinion ? SabqTheme.primaryEnd : SabqTheme.coral }

    private var isFormValid: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 &&
        bodyText.trimmingCharacters(in: .whitespacesAndNewlines).count >= 20
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                switch screenState {
                case .loading:
                    loadingState
                case .form, .submitting:
                    headerHero
                    if let draft, !draft.reviewNotes.isEmpty {
                        revisionNoteBanner(draft.reviewNotes)
                    }
                    formCard
                case .success:
                    successHero
                    Button { dismiss() } label: {
                        Text("رجوع")
                            .font(SabqFonts.app(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                case .alreadyResubmitted:
                    alreadyResubmittedView
                    Button { dismiss() } label: {
                        Text("رجوع")
                            .font(SabqFonts.app(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .scrollDismissesKeyboard(.immediately)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("تعديل المقال")
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("تم") { focusedField = nil }
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(pageTint)
            }
        }
        .task { await loadDraft() }
        .photosPicker(
            isPresented: .constant(false),  // unused; we trigger via PhotosPicker view
            selection: $pickerItems,
            maxSelectionCount: maxImages,
            matching: .images
        )
        .onChange(of: pickerItems) { _, newItems in
            Task { await loadPickedImages(newItems) }
        }
    }

    // MARK: Loading / error states

    private var loadingState: some View {
        VStack(spacing: 14) {
            ProgressView().tint(SabqTheme.primaryEnd).scaleEffect(1.2)
            Text("نجلب المقال…")
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            if let loadingError {
                Text(loadingError)
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.coral)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 80)
    }

    private var headerHero: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(pageTint.opacity(0.10))
                    .frame(width: 80, height: 80)
                Image(systemName: isOpinion ? "square.and.pencil" : "newspaper.fill")
                    .font(SabqFonts.app(size: 32, weight: .regular))
                    .foregroundStyle(pageTint)
            }
            Text(isOpinion ? "إعادة إرسال المقال" : "إعادة إرسال الخبر")
                .font(SabqFonts.headline(size: 20))
                .foregroundStyle(SabqTheme.ink)
            Text("راجع ملاحظة فريق التحرير ثم أعد الإرسال")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    // MARK: Revision-note banner

    private func revisionNoteBanner(_ note: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "quote.opening")
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(RevisionPalette.accent)
                Text("ملاحظة هيئة التحرير")
                    .font(SabqFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(RevisionPalette.accent)
                Spacer(minLength: 0)
                if noteCollapsed {
                    Button { withAnimation(.easeInOut(duration: 0.22)) { noteCollapsed = false } } label: {
                        Image(systemName: "chevron.down.circle.fill")
                            .font(SabqFonts.app(size: 18))
                            .foregroundStyle(RevisionPalette.accent.opacity(0.6))
                    }
                    .buttonStyle(.plain)
                }
            }
            if !noteCollapsed {
                Text(note)
                    .font(SabqFonts.app(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
                    .lineSpacing(5)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    withAnimation(.easeInOut(duration: 0.22)) { noteCollapsed = true }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(SabqFonts.app(size: 11, weight: .heavy))
                        Text("فهمت")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(RevisionPalette.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().stroke(RevisionPalette.accent.opacity(0.35), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(RevisionPalette.accent.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(RevisionPalette.accent.opacity(0.30), lineWidth: 1)
        )
    }

    // MARK: Form

    private var formCard: some View {
        SurfaceCard(accent: pageTint) {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    errorBanner(errorMessage)
                }

                fieldLabel("العنوان", required: true)
                TextField("عنوان المقال", text: $title, axis: .vertical)
                    .lineLimit(2...3)
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .focused($focusedField, equals: .title)
                    .submitLabel(.next)
                    .multilineTextAlignment(.trailing)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                            .fill(SabqTheme.paleFill)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                            .stroke(focusedField == .title ? pageTint.opacity(0.4) : SabqTheme.outline, lineWidth: focusedField == .title ? 1 : 0.5)
                    )

                fieldLabel("النص", required: true)
                ZStack(alignment: .topTrailing) {
                    SabqRichTextEditor(
                        text: $bodyText,
                        minHeight: 220,
                        isFocused: Binding(
                            get: { focusedField == .body },
                            set: { focusedField = $0 ? .body : nil }
                        ),
                        font: .systemFont(ofSize: 15, weight: .regular),
                        textColor: UIColor(SabqTheme.ink),
                        tintColor: UIColor(pageTint)
                    )
                    .padding(8)
                }
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(focusedField == .body ? pageTint.opacity(0.4) : SabqTheme.outline, lineWidth: focusedField == .body ? 1 : 0.5)
                )

                heroImageSection
                submitButton
            }
        }
    }

    private func fieldLabel(_ text: String, required: Bool = false) -> some View {
        HStack(spacing: 4) {
            Text(text)
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
            if required {
                Text("*")
                    .font(SabqFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(SabqTheme.coral)
            }
        }
    }

    // MARK: Image section

    private var heroImageSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            fieldLabel(isOpinion ? "صورة المقال (اختياري)" : "الصور")

            // Existing image (only shown until replaced)
            if !replacedHero, let urlStr = existingHeroURL, let url = URL(string: urlStr) {
                ZStack(alignment: .topTrailing) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        Color.gray.opacity(0.1)
                    }
                    .frame(height: 180)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    PhotosPicker(
                        selection: $pickerItems,
                        maxSelectionCount: maxImages,
                        matching: .images
                    ) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(SabqFonts.app(size: 11, weight: .heavy))
                            Text("تغيير")
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.black.opacity(0.55), in: Capsule())
                    }
                    .padding(10)
                }
            } else if let preview = newHeroPreview {
                ZStack(alignment: .topTrailing) {
                    Image(uiImage: preview)
                        .resizable()
                        .scaledToFill()
                        .frame(height: 180)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    Button {
                        withAnimation { newHeroPreview = nil; newHeroData = nil; replacedHero = false }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(SabqFonts.app(size: 22))
                            .foregroundStyle(.white, .black.opacity(0.55))
                    }
                    .padding(10)
                }
            } else {
                PhotosPicker(
                    selection: $pickerItems,
                    maxSelectionCount: maxImages,
                    matching: .images
                ) {
                    VStack(spacing: 8) {
                        Image(systemName: "photo.badge.plus")
                            .font(SabqFonts.app(size: 22, weight: .light))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                        Text("اضغط لاختيار صورة")
                            .font(SabqFonts.app(size: 13, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                    .frame(height: 100)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(SabqTheme.paleFill)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(SabqTheme.outline, style: StrokeStyle(lineWidth: 1, dash: [6]))
                    )
                }
            }
        }
    }

    // MARK: Submit

    private var submitButton: some View {
        Button {
            Task { await resubmit() }
        } label: {
            HStack(spacing: 10) {
                if screenState == .submitting {
                    ProgressView().tint(.white)
                }
                Text("إرسال التعديل")
                    .font(SabqFonts.app(size: 17, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            .opacity(isFormValid && screenState != .submitting ? 1 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!isFormValid || screenState == .submitting)
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(SabqFonts.app(size: 14))
            Text(text)
                .font(SabqFonts.app(size: 13, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(SabqTheme.coral)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(SabqTheme.coral.opacity(0.08))
        )
    }

    // MARK: Success

    /// Surface when the writer reopens a `needs_revision` notification
    /// after already resubmitting. Replaces the form so a double-edit
    /// can't happen by accident.
    private var alreadyResubmittedView: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 30)
            ZStack {
                Circle()
                    .fill(RevisionPalette.accent.opacity(0.12))
                    .frame(width: 110, height: 110)
                Image(systemName: "checkmark.seal.fill")
                    .font(SabqFonts.app(size: 56))
                    .foregroundStyle(RevisionPalette.accent)
            }
            Text("تم إرسال التعديل سابقاً")
                .font(SabqFonts.headline(size: 22))
                .foregroundStyle(SabqTheme.ink)
            Text("هذا المقال قيد المراجعة لدى هيئة التحرير. سيصلك إشعار جديد إذا طُلب تعديل إضافي أو عند النشر.")
                .font(SabqFonts.app(size: 14))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .lineSpacing(5)
        }
        .frame(maxWidth: .infinity)
    }

    private var successHero: some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 30)
            ZStack {
                Circle()
                    .fill(SabqTheme.leaf.opacity(0.15))
                    .frame(width: 110, height: 110)
                Image(systemName: "checkmark.circle.fill")
                    .font(SabqFonts.app(size: 64))
                    .foregroundStyle(SabqTheme.leaf)
            }
            Text("تم إرسال التعديل")
                .font(SabqFonts.headline(size: 22))
                .foregroundStyle(SabqTheme.ink)
            Text("سيراجع فريق التحرير التعديل قريباً ويصلك إشعار بالقرار.")
                .font(SabqFonts.app(size: 14))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Networking

    @MainActor
    private func loadDraft() async {
        do {
            let payload = try await APIClient.shared.fetchArticleDraft(id: articleId)
            draft = payload
            // Short-circuit when the article isn't actively waiting for
            // edits anymore (already resubmitted, accepted, archived,
            // or moved to a different review state). Without this gate
            // a writer could tap the same `needs_revision` notification
            // twice and edit the article a second time by accident —
            // reported 2026-05-20.
            if !payload.awaitingEdits {
                withAnimation { screenState = .alreadyResubmitted }
                // Drop the row from the local list too so the settings
                // card collapses immediately.
                store.removeOptimistically(id: articleId)
                return
            }
            title = payload.title
            bodyText = payload.body
            existingHeroURL = payload.imageURL
            existingAlbumURLs = payload.albumImages ?? []
            withAnimation { screenState = .form }
        } catch let apiError as APIError {
            loadingError = apiError.errorDescription
        } catch {
            loadingError = "تعذر تحميل المقال"
        }
    }

    @MainActor
    private func loadPickedImages(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        // Hero: single image; album mode (news): up to 10
        // التصغير قبل الرفع (نفس مسار المشاركة الجديدة) — كانت إعادة الإرسال
        // ترفع الأصل الخام: 4-8MB للصورة × 1.33 بعد base64 يتجاوز حدّ جسم
        // JSON ويرفع ذروة الذاكرة بلا أي مكسب جودة منشورة.
        if isOpinion {
            if let first = items.first {
                if let data = try? await first.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    let prepared = SabqImageUpload.prepare(img)
                    newHeroData = prepared.data
                    newHeroPreview = prepared.image
                    replacedHero = true
                }
            }
        } else {
            var datas: [Data] = []
            var previews: [UIImage] = []
            for item in items {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    let prepared = SabqImageUpload.prepare(img)
                    datas.append(prepared.data)
                    previews.append(prepared.image)
                }
            }
            if let firstData = datas.first, let firstPreview = previews.first {
                newHeroData = firstData
                newHeroPreview = firstPreview
                replacedHero = true
                newAlbumData = Array(datas.dropFirst())
                newAlbumPreviews = Array(previews.dropFirst())
                replacedAlbum = !newAlbumData.isEmpty
            }
        }
        pickerItems = []
    }

    @MainActor
    private func resubmit() async {
        guard isFormValid else { return }
        errorMessage = nil
        screenState = .submitting
        do {
            _ = try await APIClient.shared.resubmitArticle(
                id: articleId,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                content: bodyText.trimmingCharacters(in: .whitespacesAndNewlines),
                heroImageData: replacedHero ? newHeroData : nil,
                albumImageData: replacedAlbum ? newAlbumData : nil
            )
            store.removeOptimistically(id: articleId)
            await store.refresh()
            withAnimation { screenState = .success }
            SabqHaptics.success()
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription
            screenState = .form
        } catch {
            errorMessage = "تعذر إرسال التعديل. حاول لاحقاً."
            screenState = .form
        }
    }
}
