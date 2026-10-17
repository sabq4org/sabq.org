import SwiftUI

/// Conversational SABQ-AI sign-up flow. Replaces the form-style register
/// mode on `LoginSheet` whenever a CTA opts users into the new path. The UI
/// pattern follows the TRENDX-AI sign-up the user shared as reference:
/// AI-side bubbles drive the conversation, the user replies via a single
/// input that swaps between keyboard / secure-field / chip suggestions
/// depending on the current question.
struct SignUpFlowView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    enum Step: Equatable {
        case askName
        case askEmail
        case askPassword
        case askInterests
        case submitting
        case building   // animated "نبني ملفك الذكي" sequence after register
        case done
        case error(String)
    }

    enum BubbleRole { case ai, user }

    struct Bubble: Identifiable, Equatable {
        let id = UUID()
        let role: BubbleRole
        let text: String
        let isHero: Bool
    }

    @State private var step: Step = .askName
    @State private var messages: [Bubble] = []
    @State private var input: String = ""
    @State private var selectedInterests: Set<String> = []
    @State private var allCategories: [APICategory] = []
    @State private var name: String = ""
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var didStart = false
    @FocusState private var inputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header

            // Building / done states take over the whole content area
            // because they're not part of the chat — they're a celebration
            // of finishing onboarding, with their own visual rhythm.
            if step == .building {
                buildingProfile
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: SabqLayout.space12) {
                            ForEach(messages) { bubble in
                                bubbleRow(bubble)
                                    .id(bubble.id)
                            }

                            if case .submitting = step {
                                HStack {
                                    ProgressView().tint(SabqTheme.primary)
                                    Text("ننشئ حسابك…")
                                        .sabqText(SabqType.tag)
                                        .foregroundStyle(SabqTheme.textSecondary)
                                }
                                .padding(.vertical, SabqLayout.space8)
                            }
                        }
                        .padding(.horizontal, SabqLayout.space16)
                        .padding(.vertical, SabqLayout.space24)
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let last = messages.last {
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }

                inputBar
            }
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .presentationDragIndicator(.visible)
        .task {
            if !didStart {
                didStart = true
                // Shared cache — instant when warm, network only on cold
                // start. Same pool the InterestsPickerSheet uses, so the
                // signup interests step and the dashboard sheet stay in
                // sync once any of them loads.
                await InterestsCategoryCache.shared.loadIfStale()
                allCategories = InterestsCategoryCache.shared.get()
                await startConversation()
            }
        }
    }

    // MARK: - Building profile animation

    @State private var buildProgress: Int = 0
    private static let buildSteps: [(icon: String, label: String)] = [
        ("checkmark.seal.fill", "ربط البريد بحسابك"),
        ("sparkles.rectangle.stack.fill", "تحضير اهتماماتك"),
        ("brain.head.profile", "تدريب موجزك اليومي"),
        ("newspaper.fill", "تخصيص الصفحة الرئيسية"),
    ]

    @ViewBuilder
    private var buildingProfile: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space32) {
            Spacer(minLength: SabqLayout.space32)

            // Hero: animated SABQ AI orb
            HStack {
                Spacer()
                ZStack {
                    Circle()
                        .fill(SabqTheme.actionFill)
                        .frame(width: 96, height: 96)
                    Circle()
                        .stroke(SabqTheme.primary.opacity(0.4), lineWidth: 3)
                        .frame(width: 124, height: 124)
                        .scaleEffect(buildProgress < Self.buildSteps.count ? 1.18 : 1.0)
                        .opacity(buildProgress < Self.buildSteps.count ? 0.0 : 0.6)
                        .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: false), value: buildProgress)
                    Image(systemName: buildProgress < Self.buildSteps.count ? "sparkles" : "checkmark")
                        .font(SabqFonts.app(size: 36, weight: .heavy))
                        .foregroundStyle(SabqTheme.onAction)
                }
                Spacer()
            }

            // Headline
            VStack(alignment: .center, spacing: SabqLayout.space8) {
                if buildProgress < Self.buildSteps.count {
                    Text("نُجهّز ملفّك الذكي…")
                        .sabqText(SabqType.leadTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("لحظات قليلة وتصبح سبق أقرب إليك")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                } else {
                    Text("أهلاً \(name) 🎉")
                        .sabqText(SabqType.articleTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("ملفّك الذكي جاهز. كل خبر من الآن مرتّب لك أنت.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, SabqLayout.space24)

            // Steps progressing one by one
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                ForEach(Array(Self.buildSteps.enumerated()), id: \.offset) { idx, item in
                    HStack(spacing: SabqLayout.space12) {
                        ZStack {
                            Circle()
                                .fill(idx < buildProgress
                                      ? SabqTheme.actionFill
                                      : SabqTheme.surfaceMuted)
                                .frame(width: 28, height: 28)
                            if idx < buildProgress {
                                Image(systemName: "checkmark")
                                    .font(SabqFonts.app(size: 12, weight: .heavy))
                                    .foregroundStyle(SabqTheme.onAction)
                            } else if idx == buildProgress {
                                ProgressView()
                                    .tint(SabqTheme.primary)
                                    .scaleEffect(0.7)
                            } else {
                                Image(systemName: item.icon)
                                    .sabqText(SabqType.tag)
                                    .foregroundStyle(SabqTheme.textTertiary)
                            }
                        }
                        Text(item.label)
                            .font(SabqFonts.app(size: 15, weight: idx <= buildProgress ? .semibold : .regular))
                            .foregroundStyle(idx <= buildProgress ? SabqTheme.textPrimary : SabqTheme.textTertiary)
                        Spacer(minLength: 0)
                    }
                    .opacity(idx <= buildProgress ? 1.0 : 0.55)
                }
            }
            .padding(SabqLayout.space24)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
            )
            .padding(.horizontal, SabqLayout.space16)

            Spacer(minLength: SabqLayout.space16)

            // CTA appears only after all steps complete
            if buildProgress >= Self.buildSteps.count {
                Button {
                    SabqHaptics.success()
                    dismiss()
                } label: {
                    Text("ابدأ التصفّح")
                        .sabqText(SabqType.button)
                        .foregroundStyle(SabqTheme.onAction)
                        .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                        .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, SabqLayout.space16)
                .padding(.bottom, SabqLayout.space16)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else {
                Color.clear.frame(height: 80)
            }
        }
        .task(id: step == .building) {
            // Step progress is paced so the user has time to read each
            // line. Total ~3.4 seconds; feels considered, not staged.
            guard step == .building else { return }
            for i in 1...Self.buildSteps.count {
                try? await Task.sleep(nanoseconds: 800_000_000)
                await MainActor.run {
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) {
                        buildProgress = i
                    }
                }
            }
            try? await Task.sleep(nanoseconds: 200_000_000)
            await MainActor.run { SabqHaptics.success() }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: SabqLayout.space8) {
            ZStack {
                Circle()
                    .fill(SabqTheme.actionFill)
                    .frame(width: 36, height: 36)
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(SabqTheme.onAction)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("SABQ AI")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text("مرشدك إلى ملفّك")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer(minLength: 0)
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("إغلاق")
            .buttonStyle(.plain)
        }
        .padding(.horizontal, SabqLayout.space16)
        .padding(.vertical, SabqLayout.space12)
        .background(SabqTheme.background)
        .overlay(
            Rectangle()
                .fill(SabqTheme.separator)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    // MARK: - Bubble

    @ViewBuilder
    private func bubbleRow(_ bubble: Bubble) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space8) {
            switch bubble.role {
            case .ai:
                aiAvatar
                aiBubble(bubble.text)
                Spacer(minLength: SabqLayout.space32)
            case .user:
                Spacer(minLength: SabqLayout.space32)
                userBubble(bubble.text)
            }
        }
        .transition(.asymmetric(
            insertion: .opacity.combined(with: .move(edge: .bottom)),
            removal: .opacity
        ))
    }

    private var aiAvatar: some View {
        ZStack {
            Circle()
                .fill(SabqTheme.actionFill)
                .frame(width: 26, height: 26)
            Image(systemName: "sparkles")
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.onAction)
        }
    }

    private func aiBubble(_ text: String) -> some View {
        Text(text)
            .sabqText(SabqType.excerpt)
            .foregroundStyle(SabqTheme.textPrimary)
            .multilineTextAlignment(.leading)
            .padding(.horizontal, SabqLayout.space12)
            .padding(.vertical, SabqLayout.space12)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(SabqTheme.outline, lineWidth: 1)
            )
    }

    private func userBubble(_ text: String) -> some View {
        Text(text)
            .sabqText(SabqType.excerpt)
            .foregroundStyle(SabqTheme.onAction)
            .multilineTextAlignment(.leading)
            .padding(.horizontal, SabqLayout.space12)
            .padding(.vertical, SabqLayout.space12)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.actionFill)
            )
    }

    // MARK: - Input

    @ViewBuilder
    private var inputBar: some View {
        switch step {
        case .askInterests:
            interestsPicker
        case .submitting, .done:
            EmptyView()
        case .error(let msg):
            errorRetry(msg)
        default:
            textInputBar
        }
    }

    private var textInputBar: some View {
        HStack(spacing: SabqLayout.space8) {
            Group {
                if step == .askPassword {
                    SecureField("اكتب كلمة المرور", text: $input)
                } else {
                    TextField(inputPlaceholder, text: $input)
                        .textInputAutocapitalization(step == .askEmail ? .never : .sentences)
                        .keyboardType(step == .askEmail ? .emailAddress : .default)
                        .autocorrectionDisabled(step == .askEmail || step == .askPassword)
                }
            }
            .sabqText(SabqType.excerpt)
            .focused($inputFocused)
            .submitLabel(.send)
            .onSubmit { Task { await handleSubmit() } }
            .modifier(SabqInputSurface())

            Button {
                Task { await handleSubmit() }
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(canSubmit ? SabqTheme.onAction : SabqTheme.disabledInk)
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .background(
                        Circle().fill(canSubmit ? SabqTheme.actionFill : SabqTheme.disabledFill)
                    )
                    .rotationEffect(.degrees(180))
            }
            .buttonStyle(.plain)
            .disabled(!canSubmit)
        }
        .padding(.horizontal, SabqLayout.space16)
        .padding(.vertical, SabqLayout.space8)
        .background(SabqTheme.background)
        .overlay(
            Rectangle()
                .fill(SabqTheme.separator)
                .frame(height: 1),
            alignment: .top
        )
    }

    private var interestsPicker: some View {
        VStack(spacing: SabqLayout.space8) {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: SabqLayout.space8)], spacing: SabqLayout.space8) {
                    ForEach(allCategories) { category in
                        interestChip(category: category)
                    }
                }
                .padding(.horizontal, SabqLayout.space12)
                .padding(.vertical, SabqLayout.space8)
            }
            .frame(maxHeight: 220)

            Button {
                Task { await handleSubmit() }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    Text(selectedInterests.isEmpty
                        ? "تخطّي"
                        : "تأكيد \(selectedInterests.count) تصنيفاً")
                        .sabqText(SabqType.button)
                    Image(systemName: "checkmark.circle.fill")
                        .sabqText(SabqType.metaEmphasis)
                }
                .foregroundStyle(SabqTheme.onAction)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space12)
        }
        .background(SabqTheme.background)
        .overlay(
            Rectangle()
                .fill(SabqTheme.separator)
                .frame(height: 1),
            alignment: .top
        )
    }

    private func interestChip(category: APICategory) -> some View {
        let id = category.id
        let isOn = selectedInterests.contains(id)
        return Button {
            SabqHaptics.light()
            if isOn { selectedInterests.remove(id) } else { selectedInterests.insert(id) }
        } label: {
            Text(category.name.isEmpty ? (category.slug ?? "—") : category.name)
                .sabqText(SabqType.tag)
                .foregroundStyle(isOn ? SabqTheme.onAction : SabqTheme.textPrimary)
                .padding(.horizontal, SabqLayout.space8)
                .padding(.vertical, SabqLayout.space8)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)
                .background(
                    Capsule().fill(isOn ? SabqTheme.actionFill : SabqTheme.surfaceMuted)
                )
        }
        .buttonStyle(.plain)
    }

    private func errorRetry(_ msg: String) -> some View {
        VStack(spacing: SabqLayout.space8) {
            Text(msg)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.danger)
                .multilineTextAlignment(.center)
            Button {
                // إعادة المحاولة تعيد الإرسال بالبيانات نفسها — لا تمسح المحادثة
                // ولا تعود إلى الاسم (ضمان «بياناتك ما زالت في النموذج»، نقل #1530).
                SabqHaptics.light()
                step = .submitting
                Task { await submit() }
            } label: {
                Text("إعادة المحاولة")
                    .sabqText(SabqType.button)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)

            Button {
                step = .askName
                messages = []
                Task { await startConversation() }
            } label: {
                Text("تعديل البيانات والبدء من جديد")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.primary)
                    .frame(minHeight: SabqLayout.touchTarget)
            }
            .buttonStyle(.plain)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity)
        .background(SabqTheme.background)
    }

    // MARK: - State machine

    private var inputPlaceholder: String {
        switch step {
        case .askName: return "اكتب اسمك"
        case .askEmail: return "you@example.com"
        case .askPassword: return "اختر كلمة مرور قوية"
        default: return ""
        }
    }

    private var canSubmit: Bool {
        switch step {
        case .askName: return !input.trimmingCharacters(in: .whitespaces).isEmpty
        case .askEmail: return input.contains("@") && input.contains(".")
        case .askPassword: return input.count >= 8 // حد الخادم الموحد (passwordPolicy)
        case .askInterests: return true
        default: return false
        }
    }

    private func startConversation() async {
        // SABQ-flavoured opening — anchored in the newspaper's identity
        // rather than the generic "AI assistant" tone the TRENDX reference
        // used. Each line earns its place: brand → promise → first ask.
        await typeAI("مرحباً بك في سبق ✨")
        await typeAI("خلف كل خبر هنا ذكاءٌ. وخلف ملفّك… ذكاءٌ مخصّص لك وحدك.")
        await typeAI("نبدأ من شيء واحد — كيف نناديك؟")
        await MainActor.run { inputFocused = true }
    }

    @MainActor
    private func handleSubmit() async {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        switch step {
        case .askName:
            guard !trimmed.isEmpty else { return }
            name = trimmed
            messages.append(Bubble(role: .user, text: trimmed, isHero: false))
            input = ""
            await typeAI("تشرّفنا \(trimmed) 🌟")
            await typeAI("على أي بريد نلتقي من جديد؟ سيكون مفتاحك إلى سبق.")
            step = .askEmail
        case .askEmail:
            guard canSubmit else { return }
            email = trimmed
            messages.append(Bubble(role: .user, text: trimmed, isHero: false))
            input = ""
            await typeAI("ممتاز. كلمة مرور قويّة الآن — حسابك بأمان عندنا 🔒")
            step = .askPassword
        case .askPassword:
            guard canSubmit else { return }
            password = trimmed
            messages.append(Bubble(role: .user, text: String(repeating: "•", count: trimmed.count), isHero: false))
            input = ""
            await typeAI("الخطوة الأخيرة 🎯")
            await typeAI("اختر ما يشدّك من التصنيفات، أعِد ترتيب الأخبار حولك أنت.")
            step = .askInterests
            inputFocused = false
        case .askInterests:
            // Submit and finish the conversation. Interests are persisted
            // separately after the register call succeeds, since the public
            // register endpoint only accepts name/email/password.
            if !selectedInterests.isEmpty {
                let names = allCategories
                    .filter { selectedInterests.contains($0.id) }
                    .map { $0.name }
                    .joined(separator: " · ")
                messages.append(Bubble(role: .user, text: names, isHero: false))
            }
            step = .submitting
            await submit()
        default:
            break
        }
    }

    private func submit() async {
        await authStore.register(name: name, email: email, password: password)
        if let err = authStore.errorMessage {
            await MainActor.run {
                step = .error(err)
            }
            return
        }
        // Persist interests if the user picked any AND they're now logged
        // in. Register may require email verification first (depending on
        // backend config) — in that case interests are saved on next login.
        if !selectedInterests.isEmpty && authStore.isLoggedIn {
            await authStore.updateInterests(categoryIds: Array(selectedInterests))
        }
        // Transition into the animated "building your smart profile"
        // sequence instead of dismissing the sheet immediately. The
        // sequence gives the user a sense of "something happened" + a
        // proper named welcome — matching the reference TRENDX flow.
        await MainActor.run {
            step = .building
        }
    }

    /// Mimic a small typing delay between AI bubbles so the conversation
    /// feels considered, not a wall of text. Keeps the user oriented.
    @MainActor
    private func typeAI(_ text: String) async {
        try? await Task.sleep(nanoseconds: 400_000_000)
        withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) {
            messages.append(Bubble(role: .ai, text: text, isHero: false))
        }
    }
}
