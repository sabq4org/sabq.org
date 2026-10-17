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

    // بلا @FocusState — معطّل في هذا السياق على iOS الحديث ويُسقط الكيبورد
    // بعد كل حرف (انظر تعليق SabqRichTextEditor في ArticleSubmissionView).
    @State private var isBodyEditing = false

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


    private var isOpinion: Bool { draft?.isOpinion ?? true }
    private var maxImages: Int { isOpinion ? 1 : 10 }

    private var isFormValid: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 &&
        bodyText.trimmingCharacters(in: .whitespacesAndNewlines).count >= 20
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
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
                    backButton
                case .alreadyResubmitted:
                    alreadyResubmittedView
                    backButton
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, 64)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .scrollDismissesKeyboard(.interactively)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("تعديل المقال")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("تم") { sabqDismissKeyboard() }
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.primary)
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

    private var backButton: some View {
        Button { dismiss() } label: {
            Text("رجوع")
                .sabqText(SabqType.button)
                .foregroundStyle(SabqTheme.onAction)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: Loading / error states

    private var loadingState: some View {
        VStack(spacing: SabqLayout.space12) {
            ProgressView().tint(SabqTheme.primary).scaleEffect(1.2)
            Text("نجلب المقال…")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
            if let loadingError {
                Text(loadingError)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.danger)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 80)
    }

    private var headerHero: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text(isOpinion ? "إعادة إرسال المقال" : "إعادة إرسال الخبر")
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("راجع ملاحظة فريق التحرير ثم أعد الإرسال")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Revision-note banner

    private func revisionNoteBanner(_ note: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "quote.opening")
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(RevisionPalette.accent)
                    .accessibilityHidden(true)
                Text("ملاحظة هيئة التحرير")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(RevisionPalette.accent)
                Spacer(minLength: 0)
                if noteCollapsed {
                    Button { withAnimation(.easeInOut(duration: 0.22)) { noteCollapsed = false } } label: {
                        Image(systemName: "chevron.down")
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.textSecondary)
                            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            if !noteCollapsed {
                Text(note)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineSpacing(5)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    withAnimation(.easeInOut(duration: 0.22)) { noteCollapsed = true }
                } label: {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: "checkmark")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                        Text("فهمت")
                            .sabqText(SabqType.tag)
                    }
                    .foregroundStyle(SabqTheme.textPrimary)
                    .padding(.horizontal, SabqLayout.space12)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .overlay(
                        Capsule().stroke(SabqTheme.outline, lineWidth: 1)
                            .frame(height: 32)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }

    // MARK: Form

    private var formCard: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            if let errorMessage {
                errorBanner(errorMessage)
            }

            fieldLabel("العنوان", required: true)
            TextField("عنوان المقال", text: $title, axis: .vertical)
                .lineLimit(2...3)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .submitLabel(.next)
                // .leading في بيئة RTL = اليمين — يضع المؤشر يمين الحقل الفارغ
                .multilineTextAlignment(.leading)
                .modifier(SabqInputSurface())

            fieldLabel("النص", required: true)
            ZStack(alignment: .topTrailing) {
                SabqRichTextEditor(
                    text: $bodyText,
                    minHeight: 220,
                    font: SabqType.excerpt.uiFont,
                    textColor: UIColor(SabqTheme.textPrimary),
                    tintColor: UIColor(SabqTheme.primary),
                    onEditingChanged: { editing in isBodyEditing = editing }
                )
                .padding(SabqLayout.space8)
            }
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(isBodyEditing ? SabqTheme.primary : SabqTheme.outline, lineWidth: 1)
            )

            heroImageSection
            submitButton
        }
    }

    private func fieldLabel(_ text: String, required: Bool = false) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Text(text)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)
            if required {
                Text("*")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.danger)
            }
        }
    }

    // MARK: Image section

    private var heroImageSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            fieldLabel(isOpinion ? "صورة المقال (اختياري)" : "الصور")

            // Existing image (only shown until replaced)
            if !replacedHero, let urlStr = existingHeroURL, let url = URL(string: urlStr) {
                ZStack(alignment: .topTrailing) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        SabqImagePlaceholder()
                    }
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))

                    PhotosPicker(
                        selection: $pickerItems,
                        maxSelectionCount: maxImages,
                        matching: .images
                    ) {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                            Text("تغيير")
                                .sabqText(SabqType.tag)
                        }
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.horizontal, SabqLayout.space12)
                        .padding(.vertical, SabqLayout.space8)
                        .background(.regularMaterial, in: Capsule())
                        .frame(minHeight: SabqLayout.touchTarget)
                    }
                    .padding(SabqLayout.space8)
                }
            } else if let preview = newHeroPreview {
                ZStack(alignment: .topTrailing) {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .aspectRatio(16.0 / 9.0, contentMode: .fit)
                        .overlay {
                            Image(uiImage: preview)
                                .resizable()
                                .scaledToFill()
                        }
                        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))

                    Button {
                        withAnimation { newHeroPreview = nil; newHeroData = nil; replacedHero = false }
                    } label: {
                        Image(systemName: "xmark")
                            .font(SabqFonts.app(size: 13, weight: .semibold))
                            .foregroundStyle(SabqTheme.textPrimary)
                            .frame(width: 32, height: 32)
                            .background(.regularMaterial, in: Circle())
                            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                            .contentShape(Rectangle())
                    }
                    .padding(SabqLayout.space4)
                }
            } else {
                PhotosPicker(
                    selection: $pickerItems,
                    maxSelectionCount: maxImages,
                    matching: .images
                ) {
                    VStack(spacing: SabqLayout.space8) {
                        Image(systemName: "photo.badge.plus")
                            .font(SabqFonts.app(size: 22, weight: .light))
                            .foregroundStyle(SabqTheme.textSecondary)
                        Text("اضغط لاختيار صورة")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    .frame(height: 104)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(SabqTheme.surfaceMuted)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .strokeBorder(SabqTheme.outline, style: StrokeStyle(lineWidth: 1, dash: [6]))
                    )
                }
            }
        }
    }

    // MARK: Submit

    private var submitButton: some View {
        let enabled = isFormValid && screenState != .submitting
        return Button {
            Task { await resubmit() }
        } label: {
            HStack(spacing: SabqLayout.space8) {
                if screenState == .submitting {
                    ProgressView().tint(SabqTheme.onAction)
                }
                Text("إرسال التعديل")
                    .sabqText(SabqType.button)
            }
            .foregroundStyle(enabled || screenState == .submitting ? SabqTheme.onAction : SabqTheme.disabledInk)
            .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            .background(
                enabled || screenState == .submitting ? SabqTheme.actionFill : SabqTheme.disabledFill,
                in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
            )
        }
        .buttonStyle(.plain)
        .disabled(!isFormValid || screenState == .submitting)
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space8) {
            Image(systemName: "exclamationmark.triangle")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.danger)
                .accessibilityHidden(true)
            Text(text)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }

    // MARK: Success

    /// Surface when the writer reopens a `needs_revision` notification
    /// after already resubmitting. Replaces the form so a double-edit
    /// can't happen by accident.
    private var alreadyResubmittedView: some View {
        VStack(spacing: SabqLayout.space16) {
            Spacer().frame(height: SabqLayout.space32)
            Image(systemName: "checkmark.seal")
                .font(SabqFonts.app(size: 56, weight: .light))
                .foregroundStyle(RevisionPalette.accent)
                .accessibilityHidden(true)
            Text("تم إرسال التعديل سابقاً")
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.center)
            Text("هذا المقال قيد المراجعة لدى هيئة التحرير. سيصلك إشعار جديد إذا طُلب تعديل إضافي أو عند النشر.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, SabqLayout.space24)
                .lineSpacing(5)
        }
        .frame(maxWidth: .infinity)
    }

    private var successHero: some View {
        VStack(spacing: SabqLayout.space12) {
            Spacer().frame(height: SabqLayout.space32)
            Image(systemName: "checkmark.circle")
                .font(SabqFonts.app(size: 56, weight: .light))
                .foregroundStyle(SabqTheme.success)
                .accessibilityHidden(true)
            Text("تم إرسال التعديل")
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text("سيراجع فريق التحرير التعديل قريباً ويصلك إشعار بالقرار.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, SabqLayout.space24)
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
