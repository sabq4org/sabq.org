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
                        LazyVStack(alignment: .leading, spacing: 14) {
                            ForEach(messages) { bubble in
                                bubbleRow(bubble)
                                    .id(bubble.id)
                            }

                            if case .submitting = step {
                                HStack {
                                    ProgressView().tint(SabqTheme.primaryEnd)
                                    Text("ننشئ حسابك…")
                                        .font(SabqFonts.app(size: 12, weight: .medium))
                                        .foregroundStyle(SabqTheme.secondaryInk)
                                }
                                .padding(.vertical, 8)
                            }
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 20)
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
        VStack(alignment: .leading, spacing: 28) {
            Spacer(minLength: 30)

            // Hero: animated SABQ AI orb
            HStack {
                Spacer()
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        .frame(width: 96, height: 96)
                    Circle()
                        .stroke(SabqTheme.primaryEnd.opacity(0.4), lineWidth: 3)
                        .frame(width: 124, height: 124)
                        .scaleEffect(buildProgress < Self.buildSteps.count ? 1.18 : 1.0)
                        .opacity(buildProgress < Self.buildSteps.count ? 0.0 : 0.6)
                        .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: false), value: buildProgress)
                    Image(systemName: buildProgress < Self.buildSteps.count ? "sparkles" : "checkmark")
                        .font(SabqFonts.app(size: 36, weight: .heavy))
                        .foregroundStyle(.white)
                }
                Spacer()
            }

            // Headline
            VStack(alignment: .center, spacing: 6) {
                if buildProgress < Self.buildSteps.count {
                    Text("نُجهّز ملفّك الذكي…")
                        .font(SabqFonts.app(size: 22, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    Text("لحظات قليلة وتصبح سبق أقرب إليك")
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(SabqTheme.secondaryInk)
                } else {
                    Text("أهلاً \(name) 🎉")
                        .font(SabqFonts.app(size: 26, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    Text("ملفّك الذكي جاهز. كل خبر من الآن مرتّب لك أنت.")
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)

            // Steps progressing one by one
            VStack(alignment: .leading, spacing: 14) {
                ForEach(Array(Self.buildSteps.enumerated()), id: \.offset) { idx, item in
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(idx < buildProgress
                                      ? SabqTheme.primaryEnd
                                      : SabqTheme.paleFill)
                                .frame(width: 28, height: 28)
                            if idx < buildProgress {
                                Image(systemName: "checkmark")
                                    .font(SabqFonts.app(size: 12, weight: .heavy))
                                    .foregroundStyle(.white)
                            } else if idx == buildProgress {
                                ProgressView()
                                    .tint(SabqTheme.primaryEnd)
                                    .scaleEffect(0.7)
                            } else {
                                Image(systemName: item.icon)
                                    .font(SabqFonts.app(size: 12, weight: .semibold))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                            }
                        }
                        Text(item.label)
                            .font(SabqFonts.app(size: 14, weight: idx <= buildProgress ? .bold : .medium))
                            .foregroundStyle(idx <= buildProgress ? SabqTheme.ink : SabqTheme.tertiaryInk)
                        Spacer(minLength: 0)
                    }
                    .opacity(idx <= buildProgress ? 1.0 : 0.55)
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                            .fill(SabqTheme.primaryEnd.opacity(0.04))
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 0.5)
            )
            .padding(.horizontal, 18)

            Spacer(minLength: 16)

            // CTA appears only after all steps complete
            if buildProgress >= Self.buildSteps.count {
                Button {
                    SabqHaptics.success()
                    dismiss()
                } label: {
                    Text("ابدأ التصفّح")
                        .font(SabqFonts.app(size: 16, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 18)
                .padding(.bottom, 18)
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
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 36, height: 36)
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("SABQ AI")
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text("مرشدك إلى ملفّك")
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            Spacer(minLength: 0)
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .padding(8)
                    .background(Circle().fill(SabqTheme.paleFill))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .fill(SabqTheme.outline.opacity(0.4))
                .frame(height: 0.5),
            alignment: .bottom
        )
    }

    // MARK: - Bubble

    @ViewBuilder
    private func bubbleRow(_ bubble: Bubble) -> some View {
        HStack(alignment: .top, spacing: 8) {
            switch bubble.role {
            case .ai:
                aiAvatar
                aiBubble(bubble.text)
                Spacer(minLength: 30)
            case .user:
                Spacer(minLength: 30)
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
                .fill(LinearGradient(
                    colors: [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 26, height: 26)
            Image(systemName: "sparkles")
                .font(SabqFonts.app(size: 11, weight: .bold))
                .foregroundStyle(.white)
        }
    }

    private func aiBubble(_ text: String) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 14, weight: .medium))
            .foregroundStyle(SabqTheme.ink)
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
            )
    }

    private func userBubble(_ text: String) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(SabqTheme.primaryEnd)
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
        HStack(spacing: 10) {
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
            .font(SabqFonts.app(size: 14, weight: .medium))
            .focused($inputFocused)
            .submitLabel(.send)
            .onSubmit { Task { await handleSubmit() } }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(SabqTheme.paleFill)
            )

            Button {
                Task { await handleSubmit() }
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(
                        Circle().fill(canSubmit ? SabqTheme.primaryEnd : SabqTheme.tertiaryInk)
                    )
                    .rotationEffect(.degrees(180))
            }
            .buttonStyle(.plain)
            .disabled(!canSubmit)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .fill(SabqTheme.outline.opacity(0.4))
                .frame(height: 0.5),
            alignment: .top
        )
    }

    private var interestsPicker: some View {
        VStack(spacing: 10) {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                    ForEach(allCategories) { category in
                        interestChip(category: category)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
            .frame(maxHeight: 220)

            Button {
                Task { await handleSubmit() }
            } label: {
                HStack(spacing: 6) {
                    Text(selectedInterests.isEmpty
                        ? "تخطّي"
                        : "تأكيد \(selectedInterests.count) تصنيفاً")
                        .font(SabqFonts.app(size: 14, weight: .heavy))
                    Image(systemName: "checkmark.circle.fill")
                        .font(SabqFonts.app(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .fill(SabqTheme.outline.opacity(0.4))
                .frame(height: 0.5),
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
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(isOn ? .white : SabqTheme.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity)
                .background(
                    Capsule().fill(isOn ? SabqTheme.primaryEnd : SabqTheme.paleFill)
                )
        }
        .buttonStyle(.plain)
    }

    private func errorRetry(_ msg: String) -> some View {
        VStack(spacing: 10) {
            Text(msg)
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.coral)
                .multilineTextAlignment(.center)
            Button {
                step = .askName
                messages = []
                Task { await startConversation() }
            } label: {
                Text("إعادة المحاولة")
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(SabqTheme.primaryEnd))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
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
        case .askPassword: return input.count >= 6
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
