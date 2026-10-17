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
    /// العناصر المحمّلة فعلًا (بترتيب مصفوفتَي المعاينة/البيانات) — أساس
    /// التحميل التفاضلي في loadImages.
    @State private var loadedItems: [PhotosPickerItem] = []
    @State private var showImagePicker = false
    @State private var previewImages: [UIImage] = []
    @State private var imageData: [Data] = []
    @State private var loadingImages = false

    @State private var screenState: Stage = .form
    @State private var errorMessage: String?
    @State private var celebrationScale: CGFloat = 0
    @State private var sparkleOpacity: Double = 0
    @State private var sparkleScale: CGFloat = 0.4

    // كان هنا @FocusState — معطّل داخل هذه الـ sheet على iOS الحديث: كتابات
    // focusedField لا تصل أبداً (أثبتته سجلات EditorFocus)، فتظل SwiftUI ترى
    // «لا حقل مركّزاً» وتُسقط الكيبورد مع أول إعادة رسم بعد كل حرف.
    // البديل: UIKit يدير التركيز بنفسه، والإغلاق عبر سلسلة المستجيبين،
    // وحالة @State عادية لتلوين إطار المحرر فقط.
    @State private var isBodyEditing = false

    // بوابة اليوم الأسبوعي: كاتب رأي بلا يوم محدد يختاره قبل أول إرسال،
    // ثم يُستكمل الإرسال تلقائياً بعد التثبيت.
    @State private var writerSchedule: WriterScheduleResponse?
    @State private var showDayGate = false
    @State private var savingDay = false
    @State private var dayGateError: String?
    /// true فقط عندما تُفتح البوابة من زر الإرسال — عندها يُستكمل الإرسال
    /// تلقائياً بعد التثبيت. الفتح من التنبيه المبكر لا يُرسل شيئاً.
    @State private var dayGateShouldContinue = false

    enum Stage {
        case form, submitting, success
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
                VStack(alignment: .leading, spacing: SabqLayout.space24) {
                    switch screenState {
                    case .form, .submitting:
                        // لمسة على الترويسة (خارج حقول الإدخال) تُنزل الكيبورد
                        headerHero
                            .contentShape(Rectangle())
                            .onTapGesture { sabqDismissKeyboard() }
                        if kind == .opinion, writerSchedule?.canChoose == true {
                            dayNoticeBanner
                        }
                        formCard
                    case .success:
                        successHero
                        encouragementCard
                        Button { dismiss() } label: {
                            Text("تمام")
                                .sabqText(SabqType.button)
                                .foregroundStyle(SabqTheme.onAction)
                                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                                .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space16)
                .padding(.bottom, 64)
            }
            // كانت `.immediately` وتسببت في خروج المؤشر مع كل حرف: أي
            // كتابة/حذف يحرّك iOS الصفحة تلقائياً ليُبقي المؤشر ظاهراً فوق
            // الكيبورد، و`.immediately` تعامل هذا التمرير البرمجي كطلب
            // إسقاط للكيبورد. `.interactively` تُسقطه فقط بسحب الإصبع نحو
            // الأسفل (إيماءة فعلية لا تمريراً برمجياً) — وهو السلوك الذي
            // يتوقعه الكاتب.
            .scrollDismissesKeyboard(.interactively)
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(SabqFonts.app(size: 16, weight: .semibold))
                            .foregroundStyle(SabqTheme.textSecondary)
                            .frame(minWidth: SabqLayout.touchTarget, minHeight: SabqLayout.touchTarget)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text(pageTitle)
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
            .task {
                guard kind == .opinion else { return }
                writerSchedule = try? await APIClient.shared.get(WriterScheduleResponse.self, path: "/contributor/schedule", ignoreCache: true)
            }
            .sheet(isPresented: $showDayGate, onDismiss: { dayGateShouldContinue = false }) {
                dayGateSheet
            }
        }
    }

    // MARK: - Day gate (تحديد اليوم الأسبوعي قبل أول إرسال)

    /// إشارة مبكرة من لحظة فتح الشاشة: الكتابة حرة، لكن الإرسال يتطلب تحديد اليوم
    private var dayNoticeBanner: some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Image(systemName: "calendar.badge.exclamationmark")
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(SabqTheme.warning)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text("لم تحدد يومك الأسبوعي للنشر بعد")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text("اكتب مقالك بحرية — وسيُطلب تحديد اليوم قبل الإرسال.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button { showDayGate = true } label: {
                    Text("تحديد اليوم الآن")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.primary)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SabqLayout.space16)
        .padding(.top, SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    private var dayGateSheet: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "calendar.badge.exclamationmark")
                        .font(SabqFonts.app(size: 20, weight: .semibold))
                        .foregroundStyle(SabqTheme.primary)
                        .accessibilityHidden(true)
                    Text("قبل إرسال مقالتك")
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                Text("حدد يومك الأسبوعي للنشر أولاً — ستُنشر مقالاتك في هذا اليوم من كل أسبوع. بعد التثبيت يُستكمل إرسال مقالتك تلقائياً.")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                WriterDayPickerCard(
                    dayLoads: writerSchedule?.dayLoads ?? [],
                    saving: savingDay,
                    errorText: dayGateError
                ) { day in
                    Task { await pickDayAndContinue(day) }
                }
            }
            .padding(SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .presentationDetents([.medium, .large])
    }

    private func pickDayAndContinue(_ weekday: Int) async {
        savingDay = true
        dayGateError = nil
        struct Body: Encodable { let weekday: Int }
        do {
            _ = try await APIClient.shared.post(WriterSchedulePostResponse.self, path: "/contributor/schedule", body: Body(weekday: weekday))
            writerSchedule = try? await APIClient.shared.get(WriterScheduleResponse.self, path: "/contributor/schedule", ignoreCache: true)
            savingDay = false
            showDayGate = false
            if dayGateShouldContinue {
                dayGateShouldContinue = false
                await submit()
            }
        } catch {
            savingDay = false
            dayGateError = "تعذر حفظ اليوم — حاول مرة أخرى"
        }
    }

    // MARK: - Header hero

    private var headerHero: some View {
        HStack(spacing: 10) {
            Image(systemName: kind == .opinion ? "square.and.pencil" : "newspaper.fill")
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(SabqTheme.primary)
                .frame(width: 34, height: 34)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .accessibilityHidden(true)

            Text(pageSubtitle)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.leading)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, SabqLayout.space12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqSkyCardSurface()
    }

    // MARK: - Form

    private var formCard: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            if let errorMessage {
                errorBanner(errorMessage)
            }

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                fieldLabel("العنوان", required: true)
                TextField(titlePlaceholder, text: $title, axis: .vertical)
                    .lineLimit(1...3)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .submitLabel(.next)
                    // .leading في بيئة RTL = اليمين — يضع المؤشر يمين الحقل الفارغ
                    .multilineTextAlignment(.leading)
                    .modifier(SabqInputSurface())
            }

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                fieldLabel("النص", required: true)
                ZStack(alignment: .topLeading) {
                    SabqRichTextEditor(
                        text: $articleContent,
                        minHeight: 180,
                        font: SabqType.excerpt.uiFont,
                        textColor: UIColor(SabqTheme.textPrimary),
                        tintColor: UIColor(SabqTheme.primary),
                        onEditingChanged: { editing in isBodyEditing = editing }
                    )
                    .padding(SabqLayout.space8)

                    if articleContent.isEmpty {
                        Text(bodyPlaceholder)
                            .font(SabqType.excerpt.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .multilineTextAlignment(.leading)
                            .padding(.horizontal, SabqLayout.space12)
                            .padding(.vertical, SabqLayout.space12)
                            .allowsHitTesting(false)
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(isBodyEditing ? SabqTheme.primary : SabqTheme.outline, lineWidth: 1)
                )
            }

            imagesSection

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

    // MARK: - Images section

    private var imagesSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                fieldLabel(imagesSectionTitle)
                Spacer(minLength: 0)
                if !previewImages.isEmpty {
                    Text("\(previewImages.count) / \(maxImages)")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .environment(\.layoutDirection, .leftToRight)
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
                await SabqPhotoPermission.ensureRequested()
                showImagePicker = true
            }
        } label: {
            VStack(spacing: SabqLayout.space8) {
                ZStack {
                    Circle()
                        .fill(SabqTheme.skyTint)
                        .frame(width: 44, height: 44)
                    Image(systemName: "photo.badge.plus")
                        .font(SabqFonts.app(size: 20, weight: .semibold))
                        .foregroundStyle(SabqTheme.primary)
                }
                Text(kind == .opinion ? "اختر صورة" : "اختر الصور")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text("جودة عالية تُحفظ كما هي بدون ضغط")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, SabqLayout.space16)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [5]))
                    .foregroundStyle(SabqTheme.skyOutline)
            )
        }
        .buttonStyle(.plain)
    }

    private var imagePreviewGrid: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88, maximum: 110), spacing: SabqLayout.space8)], spacing: SabqLayout.space8) {
                ForEach(Array(previewImages.enumerated()), id: \.offset) { index, image in
                    ZStack(alignment: .topLeading) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 100, height: 100)
                            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                        if index == 0 && kind == .news {
                            Text("الرئيسية")
                                .sabqText(SabqType.tag)
                                .foregroundStyle(SabqTheme.onAction)
                                .padding(.horizontal, SabqLayout.space8)
                                .padding(.vertical, SabqLayout.space4)
                                .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.actionFill))
                                .padding(SabqLayout.space4)
                        }
                        Button {
                            removeImage(at: index)
                        } label: {
                            Image(systemName: "xmark")
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                                .foregroundStyle(SabqTheme.textPrimary)
                                .frame(width: 28, height: 28)
                                .background(.regularMaterial, in: Circle())
                                .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
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
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .fill(SabqTheme.surfaceMuted)
                            .frame(width: 100, height: 100)
                            .overlay {
                                Image(systemName: "plus")
                                    .font(SabqFonts.app(size: 22, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primary)
                            }
                            .overlay(
                                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [4]))
                                    .foregroundStyle(SabqTheme.outline)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            if loadingImages {
                HStack(spacing: SabqLayout.space8) {
                    ProgressView().controlSize(.small)
                    Text("جاري تحميل الصور...")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }
        }
    }

    private func loadImages(from items: [PhotosPickerItem]) async {
        guard !items.isEmpty else {
            previewImages = []
            imageData = []
            loadedItems = []
            return
        }

        // خريطة المحمَّل سابقًا — الحذف/الإضافة يعيدان استخدام الجاهز ويفكّان
        // ترميز الجديد فقط. قبلها كان حذف صورة واحدة (يُعدِّل pickerItems
        // فيُطلق onChange) يعيد تحميل وتصغير وضغط كل الصور المتبقية.
        var known: [PhotosPickerItem: (data: Data, image: UIImage)] = [:]
        for (i, item) in loadedItems.enumerated()
        where i < imageData.count && i < previewImages.count {
            known[item] = (imageData[i], previewImages[i])
        }

        let hasNew = items.contains { known[$0] == nil }
        if hasNew { loadingImages = true }
        defer { if hasNew { loadingImages = false } }

        var loadedData: [Data] = []
        var loadedImages: [UIImage] = []
        var successfulItems: [PhotosPickerItem] = []
        for item in items {
            if let existing = known[item] {
                loadedData.append(existing.data)
                loadedImages.append(existing.image)
                successfulItems.append(item)
            } else if let data = try? await item.loadTransferable(type: Data.self),
                      let img = UIImage(data: data) {
                // Downscale + recompress before we ship base64 to the server.
                // Raw phone photos are 4-8 MB each; base64 inflates them ~33%
                // and the server JSON body cap is 10 MB. Two originals could
                // blow the limit AND drag the upload past the timeout. A
                // 2000px / 0.7 JPEG keeps print-grade quality for web display
                // while cutting payload to a few hundred KB per image.
                let prepared = SabqImageUpload.prepare(img)
                loadedData.append(prepared.data)
                loadedImages.append(prepared.image)
                successfulItems.append(item)
            }
        }
        await MainActor.run {
            imageData = loadedData
            previewImages = loadedImages
            loadedItems = successfulItems
        }
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
        let enabled = isFormValid && screenState != .submitting
        let filled = enabled || screenState == .submitting
        return Button {
            Task { await submit() }
        } label: {
            HStack(spacing: SabqLayout.space8) {
                if screenState == .submitting {
                    ProgressView().tint(SabqTheme.onAction)
                } else {
                    Image(systemName: "paperplane")
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                }
                Text(screenState == .submitting
                     ? "جاري الإرسال..."
                     : (kind == .opinion ? "إرسال المقالة" : "إرسال الخبر"))
                    .sabqText(SabqType.button)
            }
            .foregroundStyle(filled ? SabqTheme.onAction : SabqTheme.disabledInk)
            .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            .background(filled ? SabqTheme.actionFill : SabqTheme.disabledFill,
                        in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
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
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .opacity(sparkleOpacity)
                    .scaleEffect(sparkleScale)
                    .offset(sparkleOffset(for: index))
                    .accessibilityHidden(true)
            }

            Image(systemName: "checkmark.circle")
                .font(SabqFonts.app(size: 72, weight: .light))
                .foregroundStyle(SabqTheme.success)
                .scaleEffect(celebrationScale)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 176)
        .padding(.top, SabqLayout.space12)
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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            Text(kind == .opinion ? "شكراً لك على إثرائنا ✨" : "شكراً لك على إثراء غرفة الأخبار 📰")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .center)
                .multilineTextAlignment(.center)

            Text(kind == .opinion
                 ? "وصلت مقالتك إلى فريق التحرير. كل كلمة كتبتها تستحق المراجعة بعناية، وسنبذل جهدنا لإبرازها بأفضل صورة."
                 : "وصل خبرك إلى غرفة الأخبار. كل تفصيلة شاركتها تساعدنا على تقديم تغطية أدق وأسرع لقرائنا.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(5)
                .frame(maxWidth: .infinity)

            // Status timeline — three small steps showing what happens
            // next so the user understands the journey of their content.
            VStack(alignment: .leading, spacing: 0) {
                timelineStep(
                    icon: "tray.full",
                    tint: SabqTheme.primary,
                    title: "وصل إلى المسودات",
                    desc: "محفوظ في لوحة التحكم بأمان"
                )
                Divider().overlay(SabqTheme.separator)
                timelineStep(
                    icon: "person.crop.rectangle.stack",
                    tint: SabqTheme.teal,
                    title: "قيد المراجعة التحريرية",
                    desc: "يفحصه المحرر ويضيف التصنيف والكلمات المفتاحية"
                )
                Divider().overlay(SabqTheme.separator)
                timelineStep(
                    icon: "bell.badge",
                    tint: SabqTheme.success,
                    title: "إشعار بالبريد عند النشر",
                    desc: "سيصلك بريد فور الموافقة على النشر أو الجدولة"
                )
            }
        }
    }

    private func timelineStep(icon: String, tint: Color, title: String, desc: String) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 15, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surfaceMuted)
                )
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(desc)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, SabqLayout.space12)
    }

    // MARK: - Submit action

    private func submit() async {
        // كاتب رأي بلا يوم أسبوعي محدد: بوابة اختيار اليوم أولاً
        if kind == .opinion, writerSchedule?.canChoose == true {
            sabqDismissKeyboard()
            dayGateShouldContinue = true
            showDayGate = true
            return
        }
        errorMessage = nil
        sabqDismissKeyboard()
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
//   • Focus is OWNED BY UIKIT: the user's tap grants it, and
//     sabqDismissKeyboard() (responder-chain resign) takes it away.
//     There is deliberately NO @FocusState bridge — FocusState writes
//     never land inside these sheets on modern iOS, which made SwiftUI
//     revoke focus after every keystroke (EditorFocus logs, 2026-07-18).
/// يُسقط الكيبورد عبر سلسلة المستجيبين مباشرة — بديل موثوق عن @FocusState
/// المعطّل داخل الـ sheets على iOS الحديث (زر «تم»، لمسة الترويسة، والإرسال).
func sabqDismissKeyboard() {
    UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil
    )
}

struct SabqRichTextEditor: UIViewRepresentable {
    @Binding var text: String
    var minHeight: CGFloat = 180
    var font: UIFont
    var textColor: UIColor
    var tintColor: UIColor
    /// لتلوين إطار الحقل فقط — لا يُستخدم لإدارة التركيز
    var onEditingChanged: ((Bool) -> Void)? = nil

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
        // Keep the coordinator's copy fresh so its bindings never go stale
        // across SwiftUI re-renders.
        context.coordinator.parent = self
        // لا نكتب فوق نص UITextView إلا إذا تغيّر من خارج المحرر فعلاً
        // (مسح النموذج بعد الإرسال مثلاً). أثناء الكتابة الحية قد تصل تمريرة
        // render بقيمة SwiftUI أقدم من حرفٍ كتبه المستخدم للتو — الكتابة
        // فوقها كانت تمسح الحرف. المرجع الحي أثناء التحرير هو UITextView.
        if uiView.text != text, !uiView.isFirstResponder {
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
        // لا إدارة تركيز هنا إطلاقاً: UIKit يملك التركيز (لمسة المستخدم تمنحه،
        // وsabqDismissKeyboard() يسحبه). @FocusState معطّل داخل هذه الـ sheets
        // على iOS الحديث وكان الاعتماد عليه يُسقط الكيبورد بعد كل حرف.
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
            parent.onEditingChanged?(true)
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            // مزامنة أخيرة عند مغادرة الحقل — تضمن أن SwiftUI ترى آخر نص حتى
            // لو فاتتها تمريرة أثناء التحرير الحي
            if parent.text != textView.text {
                parent.text = textView.text
            }
            parent.onEditingChanged?(false)
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

        private var lastLayoutWidth: CGFloat = 0

        override func layoutSubviews() {
            super.layoutSubviews()
            // When the width changes (rotation / split-view), the
            // intrinsic height must be recomputed against the new
            // wrap point. Only then — invalidating on EVERY layout pass
            // created a relayout loop that nudged the outer ScrollView
            // on each keystroke (and with scroll-based keyboard
            // dismissal, kicked the caret out of the editor).
            if abs(bounds.width - lastLayoutWidth) > 0.5 {
                lastLayoutWidth = bounds.width
                invalidateIntrinsicContentSize()
            }
        }
    }
}
