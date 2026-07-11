import SwiftUI

/// مسار ترحيب المجلس — يُعرض عبر fullScreenCover(item:) لتفادي صفحة بيضاء.
private struct GcMajlisOnboardingRoute: Identifiable, Hashable {
    let majlis: GcMajlisSummary
    let fixtureId: Int?
    var id: String { majlis.id }
}

/// مسار تفاصيل المجلس — خارج ScrollView الأب عبر غطاء كامل الشاشة.
private struct GcMajlisDetailRoute: Identifiable, Hashable {
    let majlis: GcMajlisSummary
    let fixtureId: Int?
    var id: String { majlis.id }
}

struct GcMajlisListScreen: View {
    @Environment(GcAuthStore.self) private var auth
    @Environment(GcAppRouter.self) private var router

    @State private var store = GcMajlisStore()
    @State private var notifications = GcMajlisNotificationPreferenceStore.shared
    @State private var detailRoute: GcMajlisDetailRoute?
    @State private var onboardingRoute: GcMajlisOnboardingRoute?
    @State private var showCreate = false
    @State private var showJoin = false
    @State private var shareMajlis: GcMajlisSummary?

    var body: some View {
        @Bindable var router = router
        VStack(spacing: 14) {
            hero

            if !auth.isLoggedIn {
                signedOutCard
            } else {
                quickActions
                notificationCard
                notice
                listContent
            }
        }
        .task(id: auth.isLoggedIn) {
            guard auth.isLoggedIn else { return }
            async let list: Void = store.load(force: true)
            async let preference: Void = notifications.load(force: true)
            _ = await (list, preference)
            openPendingMajlisIfAvailable()
        }
        .onChange(of: router.pendingMajlisId) { _, _ in openPendingMajlisIfAvailable() }
        .fullScreenCover(item: $detailRoute) { route in
            NavigationStack {
                GcMajlisDetailScreen(majlis: route.majlis, focusFixtureId: route.fixtureId)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(L("auth.close")) { detailRoute = nil }
                        }
                    }
            }
        }
        .sheet(isPresented: $showCreate) {
            GcMajlisCreateSheet(store: store) { majlis in
                showCreate = false
                openAfterMembership(majlis)
            }
        }
        .sheet(isPresented: $showJoin) {
            GcMajlisManualJoinSheet(store: store) { majlis in
                showJoin = false
                openAfterMembership(majlis)
            }
        }
        .sheet(item: $router.pendingMajlisInvite) { route in
            GcMajlisDeepLinkJoinSheet(route: route, store: store) { majlis in
                router.completeMajlisInvite()
                openAfterMembership(majlis)
            } onCancel: {
                router.completeMajlisInvite()
            }
        }
        .sheet(item: $shareMajlis) { majlis in
            GcMajlisInviteSheet(majlis: majlis)
        }
        .fullScreenCover(item: $onboardingRoute) { route in
            Group {
                if let userId = auth.member?.id {
                    GcMajlisOnboardingView(
                        userId: userId,
                        majlisId: route.majlis.id,
                        onFinish: {
                            let next = route
                            onboardingRoute = nil
                            detailRoute = GcMajlisDetailRoute(majlis: next.majlis, fixtureId: next.fixtureId)
                        },
                        onPredictNow: {
                            onboardingRoute = nil
                            router.openPredictions(.matches)
                        }
                    )
                } else {
                    // احتياط: لا نترك غطاءً أبيضًا فارغًا
                    Color.clear.onAppear {
                        onboardingRoute = nil
                        detailRoute = GcMajlisDetailRoute(majlis: route.majlis, fixtureId: route.fixtureId)
                    }
                }
            }
        }
    }

    /// ترويسة خفيفة بأسلوب حسابي — بلا هيرو ليلي.
    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(L("majlis.title"))
                        .font(GulfCupFonts.headline(size: 20))
                        .foregroundStyle(GcTheme.ink)
                    Text(L("majlis.hero.subtitle"))
                        .font(GulfCupFonts.app(size: 12.5))
                        .foregroundStyle(GcTheme.inkDim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: "person.3.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(GcTheme.skyDeep)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(GcTheme.sky.opacity(0.14)))
                    .accessibilityHidden(true)
            }

            HStack(spacing: 6) {
                heroChip(L("majlis.hero.private"), icon: "lock.fill")
                heroChip(L("majlis.hero.reveal"), icon: "eye.fill")
                heroChip(L("majlis.hero.limit"), icon: "person.2.fill")
            }
        }
        .padding(16)
        .gcCard()
        .padding(.top, 2)
        .accessibilityElement(children: .combine)
    }

    private func heroChip(_ title: String, icon: String) -> some View {
        Label(title, systemImage: icon)
            .font(GulfCupFonts.app(size: 9.5, weight: .semibold))
            .foregroundStyle(GcTheme.skyDeep)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(Capsule().fill(GcTheme.sky.opacity(0.10)))
    }

    private var signedOutCard: some View {
        VStack(spacing: 13) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(.system(size: 29))
                .foregroundStyle(GcTheme.sky)
                .accessibilityHidden(true)
            Text(L("majlis.signin.title"))
                .font(GulfCupFonts.headline(size: 17))
                .foregroundStyle(GcTheme.ink)
            Text(L("majlis.signin.body"))
                .font(GulfCupFonts.app(size: 12.5))
                .foregroundStyle(GcTheme.inkDim)
                .multilineTextAlignment(.center)
            GcSignInPromptButton()
        }
        .padding(17)
        .gcCard()
    }

    private var quickActions: some View {
        HStack(spacing: 10) {
            actionButton(
                title: L("majlis.create.title"),
                subtitle: L("majlis.create.short"),
                icon: "plus",
                filled: true
            ) { showCreate = true }

            actionButton(
                title: L("majlis.join.title"),
                subtitle: L("majlis.join.short"),
                icon: "number",
                filled: false
            ) { showJoin = true }
        }
    }

    private func actionButton(
        title: String,
        subtitle: String,
        icon: String,
        filled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(filled ? Color.white.opacity(0.22) : GcTheme.sky.opacity(0.12)))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(GulfCupFonts.app(size: 13, weight: .bold))
                    Text(subtitle).font(GulfCupFonts.app(size: 9.5))
                        .opacity(0.72)
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(filled ? Color.white : GcTheme.ink)
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 60)
            .background(
                RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous)
                    .fill(filled ? GcTheme.sky : GcTheme.cardBg)
            )
            .overlay(
                RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous)
                    .stroke(filled ? Color.clear : GcTheme.line, lineWidth: 1)
            )
        }
        .buttonStyle(GcPressStyle())
    }

    private var notificationCard: some View {
        Toggle(isOn: Binding(
            get: { notifications.enabled },
            set: { value in Task { _ = await notifications.setEnabled(value) } }
        )) {
            HStack(spacing: 11) {
                Image(systemName: "bell.badge.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(GcTheme.sky)
                    .frame(width: 34, height: 34)
                    .background(RoundedRectangle(cornerRadius: 10).fill(GcTheme.sky.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("majlis.notifications.title"))
                        .font(GulfCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(GcTheme.ink)
                    Text(L("majlis.notifications.body"))
                        .font(GulfCupFonts.app(size: 10.5))
                        .foregroundStyle(GcTheme.inkDim)
                }
            }
        }
        .tint(GcTheme.sky)
        .disabled(notifications.state.isLoading)
        .padding(13)
        .gcCard()
        .accessibilityHint(L("majlis.notifications.a11y"))
    }

    @ViewBuilder private var notice: some View {
        if let text = store.notice ?? notifications.message {
            HStack(spacing: 7) {
                Image(systemName: "checkmark.circle.fill")
                Text(text)
            }
            .font(GulfCupFonts.app(size: 11.5, weight: .semibold))
            .foregroundStyle(GcTheme.skyDeep)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
        }
    }

    @ViewBuilder private var listContent: some View {
        switch store.state {
        case .idle, .loading:
            GcLoadingPanel(title: L("majlis.loading"), rows: 2)
        case .empty:
            GcEmptyState(
                icon: "person.3",
                title: L("majlis.empty.title"),
                subtitle: L("majlis.empty.body")
            )
            .padding(.vertical, 2)
            .gcCard()
        case .failed(let message):
            GcErrorCard(message: message) { await store.load(force: true) }
        case .loaded:
            VStack(spacing: 10) {
                HStack {
                    Text(L("majlis.mine.title"))
                        .font(GulfCupFonts.headline(size: 17))
                        .foregroundStyle(GcTheme.ink)
                    Spacer()
                    Text("\(store.majalis.count)")
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(GcTheme.skyDeep)
                        .frame(minWidth: 28, minHeight: 28)
                        .background(Circle().fill(GcTheme.sky.opacity(0.12)))
                }
                ForEach(store.majalis) { majlis in
                    majlisRow(majlis)
                }
            }
        }
    }

    private func majlisRow(_ majlis: GcMajlisSummary) -> some View {
        HStack(spacing: 0) {
            Button { openAfterMembership(majlis) } label: {
                HStack(spacing: 11) {
                    Image(systemName: majlis.isOwner ? "crown.fill" : "person.3.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(GcTheme.skyDeep)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(GcTheme.sky.opacity(0.12)))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(majlis.name)
                            .font(GulfCupFonts.app(size: 14, weight: .bold))
                            .foregroundStyle(GcTheme.ink)
                            .lineLimit(1)
                        HStack(spacing: 5) {
                            Text(L("majlis.members.count", ["n": "\(majlis.membersCount)"]))
                            if majlis.isOwner {
                                Text("·")
                                Text(L("majlis.owner"))
                            }
                        }
                        .font(GulfCupFonts.app(size: 10.5))
                        .foregroundStyle(GcTheme.inkDim)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.left")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(GcTheme.inkFaint)
                }
                .padding(.leading, 8)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(majlis.name)، \(L("majlis.members.count", ["n": "\(majlis.membersCount)"]))")

            Button { shareMajlis = majlis } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(GcTheme.skyDeep)
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(GcTheme.sky.opacity(0.12)))
            }
            .buttonStyle(GcPressStyle())
            .accessibilityLabel(L("majlis.invite.share"))
            .padding(.horizontal, 8)
        }
        .padding(.horizontal, 5)
        .gcCard()
    }

    private func openAfterMembership(_ majlis: GcMajlisSummary, fixtureId: Int? = nil) {
        guard let userId = auth.member?.id else {
            detailRoute = GcMajlisDetailRoute(majlis: majlis, fixtureId: fixtureId)
            return
        }
        if GcMajlisOnboarding.shouldShow(userId: userId, majlisId: majlis.id) {
            onboardingRoute = GcMajlisOnboardingRoute(majlis: majlis, fixtureId: fixtureId)
        } else {
            detailRoute = GcMajlisDetailRoute(majlis: majlis, fixtureId: fixtureId)
        }
    }

    private func openPendingMajlisIfAvailable() {
        guard auth.isLoggedIn,
              let id = router.pendingMajlisId else { return }
        if let majlis = store.majalis.first(where: { $0.id == id }) {
            let fixtureId = router.pendingMajlisFixtureId
            router.completeMajlisNavigation()
            openAfterMembership(majlis, fixtureId: fixtureId)
            return
        }
        // لا نُسقط الرابط بسبب فشل شبكة مؤقت؛ نمسحه فقط بعد قائمة ناجحة تؤكد
        // أن المجلس حُذف أو أن العضو لم يعد ضمنه.
        if store.state == .loaded || store.state == .empty {
            router.completeMajlisNavigation()
        }
    }
}

// MARK: - إنشاء مجلس

private struct GcMajlisCreateSheet: View {
    let store: GcMajlisStore
    let onCreated: (GcMajlisSummary) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                GcSheetIntro(
                    icon: "person.3.fill",
                    title: L("majlis.create.title"),
                    message: L("majlis.create.body")
                )

                VStack(alignment: .leading, spacing: 7) {
                    Text(L("majlis.create.field"))
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(GcTheme.inkDim)
                    TextField(L("majlis.create.placeholder"), text: $name)
                        .font(GulfCupFonts.app(size: 15))
                        .textInputAutocapitalization(.words)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 50)
                        .background(RoundedRectangle(cornerRadius: 14).fill(GcTheme.chipFill))
                        .accessibilityLabel(L("majlis.create.field"))
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(GulfCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(GcTheme.crimson)
                }

                Button { Task { await create() } } label: {
                    GcPrimaryButtonLabel(
                        title: L("majlis.create.action"),
                        icon: "plus",
                        loading: store.isMutating
                    )
                }
                .buttonStyle(GcPressStyle())
                .disabled(store.isMutating || !(2...60).contains(cleanName.count))

                Spacer()
            }
            .padding(20)
            .background(GcTheme.appBg.ignoresSafeArea())
            .navigationTitle(L("majlis.create.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("auth.close")) { dismiss() } } }
        }
        .presentationDetents([.medium])
    }

    private var cleanName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func create() async {
        errorMessage = nil
        do { onCreated(try await store.create(name: cleanName)) }
        catch { errorMessage = LError(error) }
    }
}

// MARK: - انضمام يدوي

private struct GcMajlisManualJoinSheet: View {
    let store: GcMajlisStore
    let onJoined: (GcMajlisSummary) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                GcSheetIntro(icon: "number", title: L("majlis.join.title"), message: L("majlis.join.body"))
                GcMajlisCodeField(code: $code)
                if let errorMessage {
                    Text(errorMessage)
                        .font(GulfCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(GcTheme.crimson)
                }
                Button { Task { await join() } } label: {
                    GcPrimaryButtonLabel(title: L("majlis.join.action"), icon: "arrow.left", loading: store.isMutating)
                }
                .buttonStyle(GcPressStyle())
                .disabled(store.isMutating || !(4...8).contains(code.count))
                Spacer()
            }
            .padding(20)
            .background(GcTheme.appBg.ignoresSafeArea())
            .navigationTitle(L("majlis.join.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("auth.close")) { dismiss() } } }
        }
        .presentationDetents([.medium])
    }

    private func join() async {
        errorMessage = nil
        do { onJoined(try await store.join(code: code)) }
        catch { errorMessage = LError(error) }
    }
}

// MARK: - موافقة الرابط العميق

private struct GcMajlisDeepLinkJoinSheet: View {
    let route: GcMajlisInviteRoute
    let store: GcMajlisStore
    let onJoined: (GcMajlisSummary) -> Void
    let onCancel: () -> Void

    @Environment(GcAuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var preview: GcMajlisInvitePreview?
    @State private var state: GcLoadState = .loading
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    inviteHeader
                    if !auth.isLoggedIn {
                        Text(L("majlis.invite.signinFirst"))
                            .font(GulfCupFonts.app(size: 12.5))
                            .foregroundStyle(GcTheme.inkDim)
                            .multilineTextAlignment(.center)
                        GcMembershipLogin(showWelcome: false)
                            .padding(16)
                            .gcCard()
                    } else {
                        consent
                    }
                }
                .padding(20)
            }
            .background(GcTheme.appBg.ignoresSafeArea())
            .navigationTitle(L("majlis.invite.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("auth.close")) { cancel() }
                }
            }
        }
        .presentationDetents([.large])
        // Keep the invite pending until the member explicitly accepts or closes it.
        // This avoids losing a deep link to an accidental sheet swipe.
        .interactiveDismissDisabled()
        .task { await loadPreview() }
    }

    private var inviteHeader: some View {
        VStack(spacing: 11) {
            Image(systemName: "envelope.open.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(GcTheme.sky)
                .accessibilityHidden(true)
            Text(preview?.name ?? L("majlis.invite.received"))
                .font(GulfCupFonts.headline(size: 21))
                .foregroundStyle(GcTheme.ink)
                .multilineTextAlignment(.center)
            Text(verbatim: route.code)
                .font(.system(size: 18, weight: .heavy, design: .rounded).monospaced())
                .tracking(2)
                .foregroundStyle(GcTheme.skyDeep)
                .environment(\.layoutDirection, .leftToRight)
            if let preview {
                Text(L("majlis.invite.members", ["n": "\(preview.membersCount)", "max": "\(preview.maxMembers)"]))
                    .font(GulfCupFonts.app(size: 11.5))
                    .foregroundStyle(GcTheme.inkDim)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(18)
        .gcCard()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var consent: some View {
        switch state {
        case .idle, .loading:
            GcLoadingPanel(title: L("majlis.invite.loading"), rows: 1)
        case .failed(let message):
            GcErrorCard(message: message) { await loadPreview() }
        default:
            VStack(spacing: 12) {
                Text(L("majlis.invite.consent"))
                    .font(GulfCupFonts.app(size: 13))
                    .foregroundStyle(GcTheme.inkDim)
                    .multilineTextAlignment(.center)
                if let errorMessage {
                    Text(errorMessage)
                        .font(GulfCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(GcTheme.crimson)
                }
                Button { Task { await confirmJoin() } } label: {
                    GcPrimaryButtonLabel(title: L("majlis.invite.confirm"), icon: "checkmark", loading: store.isMutating)
                }
                .buttonStyle(GcPressStyle())
                // الخادم يعيد العضوية الحالية idempotently حتى إن بلغ المجلس
                // 50 عضوًا؛ لذلك لا نحجب الرابط عن عضو يريد العودة لمجلسه.
                .disabled(store.isMutating)
                if preview?.full == true {
                    Text(L("majlis.invite.full"))
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(GcTheme.crimson)
                }
            }
        }
    }

    private func loadPreview() async {
        state = .loading
        do {
            preview = try await APIClient.shared.fetchGcMajlisInvite(route.code)
            state = .loaded
        } catch {
            state = .failed(LError(error))
        }
    }

    private func confirmJoin() async {
        errorMessage = nil
        do {
            let majlis = try await store.join(code: route.code)
            dismiss()
            onJoined(majlis)
        } catch {
            errorMessage = LError(error)
        }
    }

    private func cancel() {
        onCancel()
        dismiss()
    }
}

// MARK: - مكوّنات الأوراق

private struct GcMajlisCodeField: View {
    @Binding var code: String

    var body: some View {
        TextField(L("majlis.join.placeholder"), text: $code)
            .font(.system(size: 21, weight: .heavy, design: .rounded).monospaced())
            .tracking(2)
            .multilineTextAlignment(.center)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .environment(\.layoutDirection, .leftToRight)
            .padding(.horizontal, 14)
            .frame(minHeight: 54)
            .background(RoundedRectangle(cornerRadius: 14).fill(GcTheme.chipFill))
            .onChange(of: code) { _, value in
                let clean = String(value.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(8))
                if clean != value { code = clean }
            }
            .accessibilityLabel(L("majlis.join.field"))
    }
}

private struct GcSheetIntro: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 9) {
            Image(systemName: icon)
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(GcTheme.sky)
                .accessibilityHidden(true)
            Text(title).font(GulfCupFonts.headline(size: 19)).foregroundStyle(GcTheme.ink)
            Text(message)
                .font(GulfCupFonts.app(size: 12.5))
                .foregroundStyle(GcTheme.inkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

private struct GcPrimaryButtonLabel: View {
    let title: String
    let icon: String
    let loading: Bool

    var body: some View {
        HStack(spacing: 8) {
            if loading { ProgressView().tint(.white) }
            else { Image(systemName: icon) }
            Text(title)
        }
        .font(GulfCupFonts.app(size: 15, weight: .bold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 50)
        .background(RoundedRectangle(cornerRadius: GcTheme.buttonRadius).fill(GcTheme.sky))
    }
}
