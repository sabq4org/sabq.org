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

    // Equatable conformance required because the existing submit-button
    // code compares `screenState == .submitting`. Adding the new
    // associated-value case below would have removed auto-Equatable
    // synthesis silently; we keep the conformance explicit so refactors
    // don't break the comparison sites.
    enum Stage: Equatable {
        case loading
        case form
        case submitting
        case success
        /// Writer reopened the same revision notification after they'd
        /// already resubmitted. The server's `reviewStatus` is
        /// `pending_review` (or `approved`/`rejected`); we surface a
        /// status panel instead of the edit form to avoid the reported
        /// bug of letting the writer "resubmit" what's effectively the
        /// same revision twice.
        case alreadyResubmitted(status: String)
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
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                case .alreadyResubmitted(let status):
                    alreadyResubmittedHero(status: status)
                    Button { dismiss() } label: {
                        Text("رجوع")
                            .font(.system(size: 16, weight: .bold))
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
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("تم") { focusedField = nil }
                    .font(.system(size: 15, weight: .semibold))
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
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            if let loadingError {
                Text(loadingError)
                    .font(.system(size: 12, weight: .medium))
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
                    .font(.system(size: 32, weight: .regular))
                    .foregroundStyle(pageTint)
            }
            Text(isOpinion ? "إعادة إرسال المقال" : "إعادة إرسال الخبر")
                .font(SabqFonts.headline(size: 20))
                .foregroundStyle(SabqTheme.ink)
            Text("راجع ملاحظة فريق التحرير ثم أعد الإرسال")
                .font(.system(size: 13, weight: .medium))
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
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(RevisionPalette.accent)
                Text("ملاحظة هيئة التحرير")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(RevisionPalette.accent)
                Spacer(minLength: 0)
                if noteCollapsed {
                    Button { withAnimation(.easeInOut(duration: 0.22)) { noteCollapsed = false } } label: {
                        Image(systemName: "chevron.down.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(RevisionPalette.accent.opacity(0.6))
                    }
                    .buttonStyle(.plain)
                }
            }
            if !noteCollapsed {
                Text(note)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
                    .lineSpacing(5)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    withAnimation(.easeInOut(duration: 0.22)) { noteCollapsed = true }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .heavy))
                        Text("فهمت")
                            .font(.system(size: 12, weight: .semibold))
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
                    .font(.system(size: 16, weight: .bold))
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
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
            if required {
                Text("*")
                    .font(.system(size: 14, weight: .heavy))
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
                                .font(.system(size: 11, weight: .heavy))
                            Text("تغيير")
                                .font(.system(size: 12, weight: .semibold))
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
                            .font(.system(size: 22))
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
                            .font(.system(size: 22, weight: .light))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                        Text("اضغط لاختيار صورة")
                            .font(.system(size: 13, weight: .medium))
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
                    .font(.system(size: 17, weight: .bold))
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
                .font(.system(size: 14))
            Text(text)
                .font(.system(size: 13, weight: .medium))
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

    private var successHero: some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 30)
            ZStack {
                Circle()
                    .fill(SabqTheme.leaf.opacity(0.15))
                    .frame(width: 110, height: 110)
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(SabqTheme.leaf)
            }
            Text("تم إرسال التعديل")
                .font(SabqFonts.headline(size: 22))
                .foregroundStyle(SabqTheme.ink)
            Text("سيراجع فريق التحرير التعديل قريباً ويصلك إشعار بالقرار.")
                .font(.system(size: 14))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .frame(maxWidth: .infinity)
    }

    /// Status panel for writers who reopen the same notification after
    /// they'd already resubmitted. Icon + headline + descriptive copy
    /// vary by `reviewStatus` value so an approved or rejected article
    /// also has a sensible message — though the common case is the
    /// `pending_review` one the bug report described.
    private func alreadyResubmittedHero(status: String) -> some View {
        let icon: String
        let tint: Color
        let headline: String
        let detail: String
        switch status {
        case "pending_review":
            icon = "hourglass"
            tint = SabqTheme.teal
            headline = "تعديلك قيد المراجعة"
            detail = "تم استلام تعديلك ويفحصه فريق التحرير حالياً. سيصلك إشعار فور صدور القرار."
        case "approved":
            icon = "checkmark.seal.fill"
            tint = SabqTheme.leaf
            headline = "تم اعتماد التعديل"
            detail = "اعتمد فريق التحرير تعديلك وسيُنشر قريباً."
        case "rejected":
            icon = "xmark.octagon.fill"
            tint = SabqTheme.coral
            headline = "تم رفض التعديل"
            detail = "اعتذر فريق التحرير عن قبول هذا التعديل. راجع إشعارات الرفض لمعرفة التفاصيل."
        default:
            icon = "info.circle.fill"
            tint = SabqTheme.secondaryInk
            headline = "هذا المقال لم يعد في حالة طلب تعديل"
            detail = "تغيّرت حالة المقال منذ آخر إشعار وصلك. راجع إشعاراتك لمعرفة آخر تحديث."
        }
        return VStack(spacing: 14) {
            Spacer().frame(height: 30)
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 110, height: 110)
                Image(systemName: icon)
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(headline)
                .font(SabqFonts.headline(size: 22))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.center)
            Text(detail)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(5)
                .padding(.horizontal, 24)

            // If the editor's original note still has content, show it
            // below so the writer can refresh their memory of what was
            // asked. Collapsed visual style matches the form's note
            // banner.
            if let note = draft?.reviewNotes, !note.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: "quote.opening")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(RevisionPalette.accent)
                        Text("ملاحظة المراجعة السابقة")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundStyle(RevisionPalette.accent)
                    }
                    Text(note)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(SabqTheme.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(RevisionPalette.accent.opacity(0.08))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(RevisionPalette.accent.opacity(0.25), lineWidth: 1)
                )
                .padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Networking

    @MainActor
    private func loadDraft() async {
        do {
            let payload = try await APIClient.shared.fetchArticleDraft(id: articleId)
            draft = payload
            title = payload.title
            bodyText = payload.body
            existingHeroURL = payload.imageURL
            existingAlbumURLs = payload.albumImages ?? []
            // If the writer reopens this notification after they've
            // already resubmitted, the server still serves a draft
            // payload (the row exists) but reviewStatus has flipped
            // from "needs_changes" to "pending_review" (or further).
            // Surface the current status instead of letting them
            // edit the same content again — server would 409 the
            // PUT anyway with "ليس في حالة يحتاج تعديل" (mobile API
            // route /articles/:id/resubmit, line ~4603).
            if payload.isAwaitingReview {
                withAnimation {
                    screenState = .alreadyResubmitted(status: payload.reviewStatus ?? "pending_review")
                }
            } else {
                withAnimation { screenState = .form }
            }
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
        if isOpinion {
            if let first = items.first {
                if let data = try? await first.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    newHeroData = data
                    newHeroPreview = img
                    replacedHero = true
                }
            }
        } else {
            var datas: [Data] = []
            var previews: [UIImage] = []
            for item in items {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    datas.append(data)
                    previews.append(img)
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
