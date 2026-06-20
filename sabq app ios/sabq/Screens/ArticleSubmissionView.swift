import SwiftUI
import UIKit
import PhotosUI

/// Writer / reporter submission flow. Opinion writers send a single hero
/// image + body; reporters can attach up to 10 images. Both land in the
/// dashboard's drafts via `POST /api/v1/articles/submit`.
///
/// Images flow through PhotosPicker → original `Data` (loadTransferable) →
/// base64 data URI on the wire. We never re-encode pixels, so whatever
/// the picker yields is what CF Images stores. That preserves the original
/// quality the user expected (no aggressive client-side compression).
struct ArticleSubmissionView: View {
    let kind: ArticleSubmissionKind

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var title: String = ""
    @State private var articleContent: String = ""
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showImagePicker = false
    @State private var previewImages: [UIImage] = []
    @State private var imageData: [Data] = []
    @State private var loadingImages = false

    @State private var screenState: Stage = .form
    @State private var errorMessage: String?
    @State private var celebrationScale: CGFloat = 0
    @State private var sparkleOpacity: Double = 0
    @State private var sparkleScale: CGFloat = 0.4

    @FocusState private var focusedField: Field?

    enum Stage {
        case form, submitting, success
    }

    enum Field: Hashable {
        case title, body
    }

    // MARK: - Kind-specific copy

    private var pageTitle: String {
        kind == .opinion ? "إرسال مقالة للنشر" : "إرسال خبر"
    }

    private var pageSubtitle: String {
        kind == .opinion
            ? "اكتب مقالتك وسنراجعها للنشر بإذن الله"
            : "أرسل خبرك مع الصور وسنراجعه قبل النشر"
    }

    private var pageIcon: String {
        kind == .opinion ? "square.and.pencil" : "newspaper.fill"
    }

    private var pageTint: Color {
        kind == .opinion ? SabqTheme.primaryEnd : SabqTheme.coral
    }

    private var titlePlaceholder: String {
        kind == .opinion ? "عنوان المقالة" : "عنوان الخبر"
    }

    private var bodyPlaceholder: String {
        kind == .opinion
            ? "اكتب نص المقالة هنا..."
            : "اكتب تفاصيل الخبر هنا..."
    }

    private var maxImages: Int {
        kind == .opinion ? 1 : 10
    }

    private var imagesSectionTitle: String {
        kind == .opinion ? "صورة المقالة (اختياري)" : "الصور (يمكن إضافة عدة صور)"
    }

    private var minBodyLength: Int { 20 }
    private var minTitleLength: Int { 3 }

    private var isFormValid: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines).count >= minTitleLength &&
        articleContent.trimmingCharacters(in: .whitespacesAndNewlines).count >= minBodyLength
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    switch screenState {
                    case .form, .submitting:
                        headerHero
                        formCard
                    case .success:
                        successHero
                        encouragementCard
                        Color.clear.frame(height: 8)
                        Button { dismiss() } label: {
                            Text("تمام")
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
            // `.interactively` adds a pan-to-dismiss gesture that races
            // with UITextView's long-press-to-select. Users reported
            // the magnifier never appearing and copy/paste menu being
            // unreliable. `.immediately` removes the pan gesture so
            // selection / edit menu work like the OS Notes app.
            .scrollDismissesKeyboard(.immediately)
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(SabqFonts.app(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text(pageTitle)
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
        }
    }

    // MARK: - Header hero

    private var headerHero: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(pageTint.opacity(0.10))
                    .frame(width: 88, height: 88)
                Image(systemName: pageIcon)
                    .font(SabqFonts.app(size: 36, weight: .regular))
                    .foregroundStyle(pageTint)
            }
            Text(pageTitle)
                .font(SabqFonts.headline(size: 22))
                .foregroundStyle(SabqTheme.ink)
            Text(pageSubtitle)
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    // MARK: - Form card

    private var formCard: some View {
        SurfaceCard(accent: pageTint) {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    errorBanner(errorMessage)
                }

                fieldLabel("العنوان", required: true)
                TextField(titlePlaceholder, text: $title, axis: .vertical)
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
                // The body uses a UITextView-backed editor instead of
                // SwiftUI's `TextEditor`. Reader feedback (2026-05-20):
                // selection + copy/paste were unreliable on the
                // built-in editor — magnifier never appeared, edit
                // menu didn't surface — because the inner UITextView's
                // long-press gesture lost to the outer ScrollView. The
                // UITextView wrapper disables its own scroll (so the
                // outer ScrollView still handles vertical scrolling)
                // and forces RTL natural alignment so Arabic caret
                // placement is consistent.
                ZStack(alignment: .topTrailing) {
                    SabqRichTextEditor(
                        text: $articleContent,
                        minHeight: 180,
                        isFocused: Binding(
                            get: { focusedField == .body },
                            set: { focusedField = $0 ? .body : nil }
                        ),
                        font: .systemFont(ofSize: 15, weight: .regular),
                        textColor: UIColor(SabqTheme.ink),
                        tintColor: UIColor(pageTint)
                    )
                    .padding(8)

                    if articleContent.isEmpty {
                        Text(bodyPlaceholder)
                            .font(SabqFonts.app(size: 15, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 16)
                            .allowsHitTesting(false)
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(focusedField == .body ? pageTint.opacity(0.4) : SabqTheme.outline, lineWidth: focusedField == .body ? 1 : 0.5)
                )

                imagesSection

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

    // MARK: - Images section

    private var imagesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                fieldLabel(imagesSectionTitle)
                Spacer(minLength: 0)
                if !previewImages.isEmpty {
                    Text("\(previewImages.count) / \(maxImages)")
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .monospacedDigit()
                }
            }

            if previewImages.isEmpty {
                imagePickerPlaceholder
            } else {
                imagePreviewGrid
            }
        }
        // Mount the photo picker at the section root so both the initial
        // placeholder Button and the "add more" Button in the grid can
        // open it via the shared `showImagePicker` flag.
        .photosPicker(
            isPresented: $showImagePicker,
            selection: $pickerItems,
            maxSelectionCount: maxImages,
            matching: .images,
            preferredItemEncoding: .current
        )
        .onChange(of: pickerItems) { _, newItems in
            Task { await loadImages(from: newItems) }
        }
    }

    private var imagePickerPlaceholder: some View {
        Button {
            Task {
                // Surface the photo-library permission alert before
                // opening the picker — required by App Store review even
                // though PhotosUI.PhotosPicker doesn't strictly need it.
                await SabqPhotoPermission.ensureRequested()
                showImagePicker = true
            }
        } label: {
            VStack(spacing: 10) {
                Image(systemName: "photo.badge.plus")
                    .font(SabqFonts.app(size: 32, weight: .light))
                    .foregroundStyle(pageTint)
                Text(kind == .opinion ? "اختر صورة" : "اختر الصور")
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Text("جودة عالية تُحفظ كما هي بدون ضغط")
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(pageTint.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [5]))
                    .foregroundStyle(pageTint.opacity(0.30))
            )
        }
        .buttonStyle(.plain)
        // The `.photosPicker` modifier + `pickerItems.onChange` listener
        // are mounted on the parent section so the same `showImagePicker`
        // flag works for both this initial placeholder and the
        // "add more" Button inside `imagePreviewGrid`.
    }

    private var imagePreviewGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88, maximum: 110), spacing: 8)], spacing: 8) {
                ForEach(Array(previewImages.enumerated()), id: \.offset) { index, image in
                    ZStack(alignment: .topLeading) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 100, height: 100)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        if index == 0 && kind == .news {
                            Text("الرئيسية")
                                .font(SabqFonts.app(size: 9, weight: .heavy))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(pageTint))
                                .padding(6)
                        }
                        Button {
                            removeImage(at: index)
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(SabqFonts.app(size: 18, weight: .bold))
                                .foregroundStyle(.white, .black.opacity(0.6))
                        }
                        .buttonStyle(.plain)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(6)
                    }
                    .frame(width: 100, height: 100)
                }

                if previewImages.count < maxImages {
                    Button {
                        Task {
                            await SabqPhotoPermission.ensureRequested()
                            showImagePicker = true
                        }
                    } label: {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(pageTint.opacity(0.06))
                            .frame(width: 100, height: 100)
                            .overlay {
                                Image(systemName: "plus")
                                    .font(SabqFonts.app(size: 22, weight: .bold))
                                    .foregroundStyle(pageTint)
                            }
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [4]))
                                    .foregroundStyle(pageTint.opacity(0.3))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            if loadingImages {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("جاري تحميل الصور...")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
        }
    }

    private func loadImages(from items: [PhotosPickerItem]) async {
        guard !items.isEmpty else {
            previewImages = []
            imageData = []
            return
        }

        loadingImages = true
        defer { loadingImages = false }

        var loadedData: [Data] = []
        var loadedImages: [UIImage] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                // Downscale + recompress before we ship base64 to the server.
                // Raw phone photos are 4-8 MB each; base64 inflates them ~33%
                // and the server JSON body cap is 10 MB. Two originals could
                // blow the limit AND drag the upload past the timeout. A
                // 2000px / 0.7 JPEG keeps print-grade quality for web display
                // while cutting payload to a few hundred KB per image.
                let prepared = Self.prepareForUpload(img)
                loadedData.append(prepared.data)
                loadedImages.append(prepared.image)
            }
        }
        await MainActor.run {
            imageData = loadedData
            previewImages = loadedImages
        }
    }

    /// Resize so the longest edge is <= maxDimension, then JPEG-encode at
    /// `quality`. Returns both the bytes we'll upload and a UIImage for the
    /// preview so what the user sees matches what we send.
    private static func prepareForUpload(
        _ image: UIImage,
        maxDimension: CGFloat = 2000,
        quality: CGFloat = 0.7
    ) -> (data: Data, image: UIImage) {
        let size = image.size
        let longest = max(size.width, size.height)
        let scaled: UIImage
        if longest > maxDimension {
            let factor = maxDimension / longest
            let newSize = CGSize(width: size.width * factor, height: size.height * factor)
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
            scaled = renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: newSize))
            }
        } else {
            scaled = image
        }
        let data = scaled.jpegData(compressionQuality: quality)
            ?? image.jpegData(compressionQuality: quality)
            ?? Data()
        return (data, scaled)
    }

    private func removeImage(at index: Int) {
        guard index < previewImages.count else { return }
        previewImages.remove(at: index)
        if index < imageData.count {
            imageData.remove(at: index)
        }
        if index < pickerItems.count {
            pickerItems.remove(at: index)
        }
    }

    // MARK: - Submit button

    private var submitButton: some View {
        Button {
            Task { await submit() }
        } label: {
            HStack(spacing: 8) {
                if screenState == .submitting {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: kind == .opinion ? "paperplane.fill" : "paperplane.fill")
                        .font(SabqFonts.app(size: 14, weight: .heavy))
                }
                Text(screenState == .submitting
                     ? "جاري الإرسال..."
                     : (kind == .opinion ? "إرسال المقالة" : "إرسال الخبر"))
                    .font(SabqFonts.app(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            .opacity((isFormValid && screenState != .submitting) ? 1.0 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!isFormValid || screenState == .submitting)
    }

    // MARK: - Success state — the celebration

    private var successHero: some View {
        ZStack {
            // Five sparkles radiating around the checkmark — fade-in + scale
            // animation on appear. Decoupled from the main checkmark spring
            // so the eye reads the checkmark first, then the celebration.
            ForEach(0..<5, id: \.self) { index in
                Image(systemName: "sparkle")
                    .font(SabqFonts.app(size: 18, weight: .bold))
                    .foregroundStyle(pageTint)
                    .opacity(sparkleOpacity)
                    .scaleEffect(sparkleScale)
                    .offset(sparkleOffset(for: index))
            }

            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [pageTint.opacity(0.20), pageTint.opacity(0.05)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 130, height: 130)
                Image(systemName: "checkmark.circle.fill")
                    .font(SabqFonts.app(size: 80, weight: .regular))
                    .foregroundStyle(pageTint)
                    .scaleEffect(celebrationScale)
                    .symbolRenderingMode(.hierarchical)
            }
        }
        .frame(height: 180)
        .padding(.top, 12)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.62)) {
                celebrationScale = 1.0
            }
            withAnimation(.easeOut(duration: 0.6).delay(0.18)) {
                sparkleOpacity = 1
                sparkleScale = 1
            }
            let feedback = UINotificationFeedbackGenerator()
            feedback.notificationOccurred(.success)
        }
    }

    /// Hand-positioned offsets so the sparkles read as a soft burst around
    /// the check rather than a uniform ring.
    private func sparkleOffset(for index: Int) -> CGSize {
        switch index {
        case 0: return CGSize(width: -78, height: -50)
        case 1: return CGSize(width: 80, height: -42)
        case 2: return CGSize(width: -64, height: 56)
        case 3: return CGSize(width: 72, height: 62)
        case 4: return CGSize(width: 0, height: -82)
        default: return .zero
        }
    }

    private var encouragementCard: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                Text(kind == .opinion ? "شكراً لك على إثرائنا ✨" : "شكراً لك على إثراء غرفة الأخبار 📰")
                    .font(SabqFonts.app(size: 19, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .multilineTextAlignment(.center)

                Text(kind == .opinion
                     ? "وصلت مقالتك إلى فريق التحرير. كل كلمة كتبتها تستحق المراجعة بعناية، وسنبذل جهدنا لإبرازها بأفضل صورة."
                     : "وصل خبرك إلى غرفة الأخبار. كل تفصيلة شاركتها تساعدنا على تقديم تغطية أدق وأسرع لقرائنا.")
                    .font(SabqFonts.app(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
                    .lineSpacing(5)
                    .frame(maxWidth: .infinity)

                // Status timeline — three small steps showing what happens
                // next so the user understands the journey of their content.
                VStack(alignment: .leading, spacing: 14) {
                    timelineStep(
                        icon: "tray.full.fill",
                        tint: SabqTheme.primaryEnd,
                        title: "وصل إلى المسودات",
                        desc: "محفوظ في لوحة التحكم بأمان"
                    )
                    timelineStep(
                        icon: "person.crop.rectangle.stack.fill",
                        tint: SabqTheme.teal,
                        title: "قيد المراجعة التحريرية",
                        desc: "يفحصه المحرر ويضيف التصنيف والكلمات المفتاحية"
                    )
                    timelineStep(
                        icon: "bell.badge.fill",
                        tint: SabqTheme.leaf,
                        title: "إشعار بالبريد عند النشر",
                        desc: "سيصلك بريد فور الموافقة على النشر أو الجدولة"
                    )
                }
                .padding(.top, 4)
            }
        }
    }

    private func timelineStep(icon: String, tint: Color, title: String, desc: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(tint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Text(desc)
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Submit action

    private func submit() async {
        errorMessage = nil
        focusedField = nil
        screenState = .submitting
        do {
            let resp = try await APIClient.shared.submitArticleDraft(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                content: articleContent.trimmingCharacters(in: .whitespacesAndNewlines),
                kind: kind,
                imageData: imageData
            )
            await MainActor.run {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                    screenState = .success
                }
            }
            _ = resp // server message is also encouraging — we use the locally
                     // crafted success copy for richer visual treatment.
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
            screenState = .form
        } catch {
            errorMessage = error.localizedDescription
            screenState = .form
        }
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
}

// MARK: - SabqRichTextEditor (UITextView wrapper)
//
// SwiftUI's `TextEditor` is backed by a UITextView, but it doesn't
// expose enough hooks to make selection + copy/paste reliable inside
// an outer `ScrollView`. The inner editor's `isScrollEnabled` stays
// `true`, which means its long-press-to-select gesture competes with
// the outer ScrollView's pan gesture — and the outer one tends to win,
// so the magnifier never appears and the edit menu is intermittent.
//
// This wrapper:
//   • Turns OFF the inner UITextView scroll (`isScrollEnabled = false`)
//     and grows the view via `intrinsicContentSize`, so the OUTER
//     ScrollView handles vertical scrolling and the editor only owns
//     its own selection gestures.
//   • Forces RTL natural alignment so Arabic caret placement +
//     selection handles land where the reader expects.
//   • Bridges first-responder state with SwiftUI's `@FocusState` via
//     the `isFocused` binding so the keyboard toolbar's "تم" still
//     dismisses correctly.
struct SabqRichTextEditor: UIViewRepresentable {
    @Binding var text: String
    var minHeight: CGFloat = 180
    @Binding var isFocused: Bool
    var font: UIFont
    var textColor: UIColor
    var tintColor: UIColor

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> SelfSizingTextView {
        let view = SelfSizingTextView()
        view.delegate = context.coordinator
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.font = font
        view.textColor = textColor
        view.tintColor = tintColor
        view.adjustsFontForContentSizeCategory = true
        view.dataDetectorTypes = []
        view.keyboardDismissMode = .none
        view.autocorrectionType = .default
        view.smartDashesType = .default
        view.smartQuotesType = .default
        view.spellCheckingType = .default
        // Natural alignment + RTL: Arabic + numerals + Latin all sit in
        // the same paragraph and the caret stays correct.
        view.textAlignment = .natural
        view.semanticContentAttribute = .forceRightToLeft
        view.minimumHeight = minHeight
        view.text = text
        return view
    }

    func updateUIView(_ uiView: SelfSizingTextView, context: Context) {
        if uiView.text != text {
            uiView.text = text
        }
        if uiView.minimumHeight != minHeight {
            uiView.minimumHeight = minHeight
            uiView.invalidateIntrinsicContentSize()
        }
        if uiView.font != font {
            uiView.font = font
        }
        if uiView.textColor != textColor {
            uiView.textColor = textColor
        }
        if uiView.tintColor != tintColor {
            uiView.tintColor = tintColor
        }

        let shouldBeFirstResponder = isFocused
        let isCurrentlyFirstResponder = uiView.isFirstResponder
        if shouldBeFirstResponder, !isCurrentlyFirstResponder {
            DispatchQueue.main.async { uiView.becomeFirstResponder() }
        } else if !shouldBeFirstResponder, isCurrentlyFirstResponder {
            DispatchQueue.main.async { uiView.resignFirstResponder() }
        }
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: SabqRichTextEditor

        init(_ parent: SabqRichTextEditor) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            if parent.text != textView.text {
                parent.text = textView.text
            }
            textView.invalidateIntrinsicContentSize()
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            if !parent.isFocused { parent.isFocused = true }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            if parent.isFocused { parent.isFocused = false }
        }
    }

    /// UITextView that reports its content height as `intrinsicContentSize`
    /// so SwiftUI's layout can grow vertically as the user types — instead
    /// of relying on the inner scroll view.
    final class SelfSizingTextView: UITextView {
        var minimumHeight: CGFloat = 0 {
            didSet { invalidateIntrinsicContentSize() }
        }

        override var intrinsicContentSize: CGSize {
            let targetWidth = bounds.width > 0 ? bounds.width : UIView.layoutFittingExpandedSize.width
            let size = sizeThatFits(CGSize(width: targetWidth, height: .greatestFiniteMagnitude))
            return CGSize(width: UIView.noIntrinsicMetric, height: max(minimumHeight, ceil(size.height)))
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            // When the width changes (rotation / split-view), the
            // intrinsic height must be recomputed against the new
            // wrap point.
            invalidateIntrinsicContentSize()
        }
    }
}
