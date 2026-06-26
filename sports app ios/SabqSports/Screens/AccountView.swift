import SwiftUI

// حسابي — مركز الإعدادات: ملف العضو + «فِرقي» (المفضّل محلّي بلا دخول + المتابَعة)
// + تنبيهات المباريات (مجمّعة) + عن التطبيق (روابط فعلية). تصميم قوائم مجمّعة
// نظيفة (بطاقة بيضاء واحدة لكل قسم بفواصل خفيفة) باللمسة الخضراء المقتصدة.
struct AccountView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpFavorites.self) private var favorites
    @Environment(\.openURL) private var openURL
    @State private var identifier = ""
    @State private var password = ""
    @State private var selectedTeam: IDBox?
    @State private var showSignOutConfirm = false

    private var followedTeams: [SpFollow] { auth.follows.filter { $0.kind == "team" } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    if auth.isLoggedIn {
                        profileHeader
                    } else {
                        signInCard
                    }

                    teamsSection
                    notificationsSection
                    aboutSection

                    if auth.isLoggedIn { signOutButton }

                    Text("VARA · تطبيق سبق الرياضي")
                        .font(SportsFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkFaint)
                        .padding(.top, 2)
                }
                .padding(16)
            }
            .autoHideTabBar()
            .background(SpAmbientBackground())
            .navigationTitle("حسابي")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
            .confirmationDialog("تسجيل الخروج", isPresented: $showSignOutConfirm, titleVisibility: .visible) {
                Button("تسجيل الخروج", role: .destructive) { auth.signOut() }
                Button("إلغاء", role: .cancel) {}
            } message: {
                Text("سيتم إنهاء جلستك على هذا الجهاز.")
            }
        }
    }

    // MARK: - الملف الشخصي (ترويسة مدمجة)

    private var profileHeader: some View {
        HStack(spacing: 14) {
            avatarView
            VStack(alignment: .leading, spacing: 3) {
                Text(auth.member?.name ?? "عضو سبق")
                    .font(SportsFonts.app(size: 18, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                if let email = auth.member?.email, !email.isEmpty {
                    Text(email)
                        .font(SportsFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .lineLimit(1)
                }
                Text(loyaltyLine)
                    .font(SportsFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(SpTheme.green)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(cardBg)
    }

    private var loyaltyLine: String {
        let teams = followedTeams.count
        if let fav = favorites.team { return "مشجّع \(fav.name)" }
        if teams > 0 { return "تتابع \(teams) فريقًا" }
        return "أهلًا بك في VARA"
    }

    // MARK: - فِرقي (المفضّل + المتابَعة)

    private var teamsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("فِرقي")
            settingsCard {
                favoriteRow
                if auth.isLoggedIn && !followedTeams.isEmpty {
                    rowDivider
                    followedRow
                }
            }
            if !auth.isLoggedIn {
                hint("الفريق المفضّل يعمل بلا تسجيل دخول ويتصدّر صفحتك الرئيسية. سجّل الدخول لمتابعة عدّة فِرق وتلقّي تنبيهاتها.")
            }
        }
    }

    // الفريق المفضّل — محلّي (SpFavorites): يُضبط من نجمة صفحة أي نادٍ، ويُمسح هنا.
    private var favoriteRow: some View {
        HStack(spacing: 12) {
            Button {
                if let id = favorites.team?.id { selectedTeam = IDBox(id: id) }
            } label: {
                HStack(spacing: 12) {
                    iconTile("star.fill", SpTheme.green)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("الفريق المفضّل")
                            .font(SportsFonts.app(size: 14.5, weight: .bold))
                            .foregroundStyle(SpTheme.onDark)
                        Text(favorites.team?.name ?? "اختره من نجمة صفحة أي نادٍ")
                            .font(SportsFonts.app(size: 11.5, weight: .semibold))
                            .foregroundStyle(favorites.team == nil ? SpTheme.onDarkFaint : SpTheme.green)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(SpPressStyle())
            .disabled(favorites.team == nil)

            if let t = favorites.team {
                SpTeamLogo(logo: t.logo ?? "", size: 30)
                Button { favorites.clear() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    // الفِرق المتابَعة — تمرير أفقي للشعارات (تفتح صفحة النادي).
    private var followedRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                iconTile("heart.fill", SpTheme.green)
                Text("الفِرق المتابَعة")
                    .font(SportsFonts.app(size: 14.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text("\(followedTeams.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                    .monospacedDigit()
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(followedTeams) { f in
                        Button { if let id = Int(f.refId) { selectedTeam = IDBox(id: id) } } label: {
                            VStack(spacing: 6) {
                                SpTeamLogo(logo: f.refLogo ?? "", size: 46)
                                Text(f.refName)
                                    .font(SportsFonts.app(size: 11, weight: .semibold))
                                    .foregroundStyle(SpTheme.onDark)
                                    .lineLimit(1).frame(width: 60)
                            }
                        }
                        .buttonStyle(SpPressStyle())
                    }
                }
                .padding(.bottom, 2)
            }
        }
        .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 12)
    }

    // MARK: - تنبيهات المباريات

    @ViewBuilder private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("تنبيهات المباريات")
            if auth.isLoggedIn {
                settingsCard {
                    toggleRow("بداية المباراة", "play.circle.fill", \.kickoff)
                    rowDivider
                    toggleRow("الأهداف", "soccerball", \.goals)
                    rowDivider
                    toggleRow("البطاقات", "rectangle.portrait.fill", \.cards)
                    rowDivider
                    toggleRow("حالات الفار (VAR)", "tv.fill", \.varReview)
                    rowDivider
                    toggleRow("نهاية المباراة", "flag.checkered", \.fulltime)
                }
                hint(followedTeams.isEmpty
                     ? "تابع فريقًا ليصلك تنبيه عند أحداث مبارياته."
                     : "تصلك هذه التنبيهات عن مباريات فِرقك المتابَعة.")
            } else {
                settingsCard {
                    Button { /* يمرّر المستخدم لأعلى لتسجيل الدخول */ } label: {
                        HStack(spacing: 12) {
                            iconTile("bell.slash.fill", SpTheme.onDarkFaint)
                            Text("سجّل الدخول لتفعيل تنبيهات فِرقك")
                                .font(SportsFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(SpTheme.onDarkDim)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(true)
                }
            }
        }
    }

    private func toggleRow(_ title: String, _ icon: String, _ keyPath: WritableKeyPath<SpAlertPrefs, Bool>) -> some View {
        HStack(spacing: 12) {
            iconTile(icon, SpTheme.green)
            Text(title)
                .font(SportsFonts.app(size: 14.5, weight: .semibold))
                .foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
            Toggle("", isOn: Binding(
                get: { auth.alertPrefs[keyPath: keyPath] },
                set: { newValue in
                    var p = auth.alertPrefs
                    p[keyPath: keyPath] = newValue
                    Task { await auth.setAlertPrefs(p) }
                }
            ))
            .labelsHidden()
            .tint(SpTheme.green)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    // MARK: - عن التطبيق

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("عن التطبيق")
            settingsCard {
                linkRow("globe", "موقع سبق", "sabq.org", url: "https://sabq.org")
                rowDivider
                linkRow("sportscourt.fill", "القسم الرياضي", "sabq.org/sports", url: "https://sabq.org/sports")
                rowDivider
                infoRow("info.circle.fill", "الإصدار", "1.0 (تجريبي)")
            }
        }
    }

    // MARK: - تسجيل الخروج

    private var signOutButton: some View {
        Button { showSignOutConfirm = true } label: {
            Text("تسجيل الخروج")
                .font(SportsFonts.app(size: 14.5, weight: .bold))
                .foregroundStyle(SpTheme.crimson)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .fill(SpTheme.card)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1)))
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - تسجيل الدخول (كما هو)

    private var signInCard: some View {
        VStack(spacing: 14) {
            Image(systemName: "person.crop.circle")
                .font(.system(size: 40))
                .foregroundStyle(SpTheme.green)
            Text("سجّل دخولك")
                .font(SportsFonts.app(size: 22, weight: .bold))
                .foregroundStyle(SpTheme.onDark)
            Text("بحساب سبق لمتابعة فِرقك وتلقّي تنبيهات المباريات والمشاركة في المجتمع.")
                .font(SportsFonts.app(size: 13))
                .foregroundStyle(SpTheme.onDarkDim)
                .multilineTextAlignment(.center)

            VStack(spacing: 10) {
                field(text: $identifier, placeholder: "البريد الإلكتروني أو الجوال", icon: "person", secure: false)
                field(text: $password, placeholder: "كلمة المرور", icon: "lock", secure: true)
            }

            Button {
                Task { await auth.loginWithCredentials(identifier: identifier, password: password) }
            } label: {
                HStack(spacing: 8) {
                    if auth.isLoading { ProgressView().tint(.white) }
                    Text("تسجيل الدخول").font(SportsFonts.app(size: 16, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous).fill(SpTheme.green))
            }
            .buttonStyle(.plain)
            .disabled(auth.isLoading)

            dividerOr

            Button { auth.startAppleSignIn() } label: {
                HStack(spacing: 10) {
                    Image(systemName: "applelogo").font(.system(size: 18, weight: .semibold))
                    Text("تسجيل الدخول بـ Apple").font(SportsFonts.app(size: 16, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous).fill(.black))
            }
            .buttonStyle(.plain)
            .disabled(auth.isLoading)

            if let err = auth.errorMessage {
                Text(err)
                    .font(SportsFonts.app(size: 12))
                    .foregroundStyle(SpTheme.crimson)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24).padding(.horizontal, 16)
        .background(cardBg)
    }

    @ViewBuilder private func field(text: Binding<String>, placeholder: String, icon: String, secure: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(SpTheme.onDarkFaint)
                .frame(width: 18)
            Group {
                if secure {
                    SecureField("", text: text, prompt: Text(placeholder).foregroundStyle(SpTheme.onDarkFaint))
                } else {
                    TextField("", text: text, prompt: Text(placeholder).foregroundStyle(SpTheme.onDarkFaint))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                }
            }
            .font(SportsFonts.app(size: 15))
            .foregroundStyle(SpTheme.onDark)
            .tint(SpTheme.green)
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        )
    }

    private var dividerOr: some View {
        HStack(spacing: 12) {
            Rectangle().fill(SpTheme.outline).frame(height: 1)
            Text("أو").font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
            Rectangle().fill(SpTheme.outline).frame(height: 1)
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private var avatarView: some View {
        if let a = auth.member?.avatar, !a.isEmpty, let url = URL(string: a) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image): image.resizable().aspectRatio(contentMode: .fill)
                default: SpTheme.chipFill
                }
            }
            .frame(width: 60, height: 60)
            .clipShape(Circle())
            .overlay(Circle().stroke(SpTheme.green.opacity(0.45), lineWidth: 2))
        } else {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(SpTheme.green)
        }
    }

    // MARK: - مكوّنات مشتركة (قوائم مجمّعة)

    private func sectionHeader(_ t: String) -> some View {
        Text(t)
            .font(SportsFonts.app(size: 13, weight: .heavy))
            .foregroundStyle(SpTheme.onDarkDim)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func settingsCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0) { content() }
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous))
    }

    private var rowDivider: some View {
        Rectangle().fill(SpTheme.outline.opacity(0.6)).frame(height: 1).padding(.leading, 56)
    }

    private func iconTile(_ name: String, _ tint: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 30, height: 30)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint.opacity(0.12)))
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(SportsFonts.app(size: 11.5, weight: .semibold))
            .foregroundStyle(SpTheme.onDarkFaint)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func linkRow(_ icon: String, _ title: String, _ value: String, url: String) -> some View {
        Button { if let u = URL(string: url) { openURL(u) } } label: {
            HStack(spacing: 12) {
                iconTile(icon, SpTheme.onDarkDim)
                Text(title).font(SportsFonts.app(size: 14.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 8)
                Text(value).font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
                    .environment(\.layoutDirection, .leftToRight)
                Image(systemName: "arrow.up.left").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    private func infoRow(_ icon: String, _ title: String, _ value: String) -> some View {
        HStack(spacing: 12) {
            iconTile(icon, SpTheme.onDarkDim)
            Text(title).font(SportsFonts.app(size: 14.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 8)
            Text(value).font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    private var cardBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
            .fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }
}
