import SwiftUI

// حسابي — مركز الإعدادات: ملف العضو + «فِرقي» (المفضّل محلّي بلا دخول + المتابَعة)
// + تنبيهات المباريات (مجمّعة) + عن التطبيق (روابط فعلية). تصميم قوائم مجمّعة
// نظيفة (بطاقة بيضاء واحدة لكل قسم بفواصل خفيفة) باللمسة الخضراء المقتصدة.
struct AccountView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpFavorites.self) private var favorites
    @Environment(SpThemeMode.self) private var themeMode
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

                    VaraInsightCard(context: VaraInsightContext(
                        isLoggedIn: auth.isLoggedIn,
                        favoriteName: favorites.team?.name,
                        followsCount: followedTeams.count,
                        activeAlerts: activeAlertsCount
                    ))

                    predictionsSection
                    servicesSection
                    appearanceSection
                    notificationsSection
                    aboutSection
                    dangerZoneSection

                    if auth.isLoggedIn { signOutButton }

                    Text("VARA · تطبيقك الرياضي")
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
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                avatarView
                VStack(alignment: .leading, spacing: 3) {
                    Text(auth.member?.name ?? "عضو VARA")
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

            HStack(spacing: 8) {
                profileMetric("\(favorites.team == nil ? 0 : 1)", "مفضل")
                profileMetric("\(followedTeams.count)", "متابعة")
                profileMetric("\(activeAlertsCount)", "تنبيهات")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(cardBg)
    }

    private var activeAlertsCount: Int {
        [auth.alertPrefs.kickoff, auth.alertPrefs.goals, auth.alertPrefs.cards, auth.alertPrefs.varReview, auth.alertPrefs.fulltime]
            .filter { $0 }.count
    }

    private func profileMetric(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(SportsFonts.app(size: 15, weight: .heavy))
                .foregroundStyle(SpTheme.green)
                .monospacedDigit()
            Text(label)
                .font(SportsFonts.app(size: 10, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.chipFill))
    }

    private var loyaltyLine: String {
        let teams = followedTeams.count
        if let fav = favorites.team { return "مشجّع \(fav.name)" }
        if teams > 0 { return "تتابع \(teams) فريقًا" }
        return "أهلًا بك في VARA"
    }

    // MARK: - التوقّعات (نظام البركة المتدرّجة المعمّم — يُفتح من هنا)

    private var predictionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("التوقّعات")
            NavigationLink {
                PredictionsHubView()
            } label: {
                HStack(spacing: 14) {
                    Image(systemName: "rosette")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(SpTheme.gold)
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(SpTheme.gold.opacity(0.14)))
                    VStack(alignment: .leading, spacing: 3) {
                        Text("توقّعات VARA")
                            .font(SportsFonts.app(size: 16, weight: .heavy))
                            .foregroundStyle(SpTheme.onDark)
                        Text("توقّع نتائج كأس العالم والبطولات وتنافس على النقاط والجوائز")
                            .font(SportsFonts.app(size: 11.5, weight: .semibold))
                            .foregroundStyle(SpTheme.onDarkDim)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.backward")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
                .padding(14)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                        .fill(SpTheme.card)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(SpPressStyle())
        }
    }

    // MARK: - المظهر (تلقائي / فاتح / داكن)

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("المظهر")
            HStack(spacing: 8) {
                ForEach(SpThemeMode.Mode.allCases) { m in
                    appearanceChip(m)
                }
            }
            hint("«تلقائي» يتبع إعداد جهازك؛ أو اختر الفاتح/الداكن يدويًّا.")
        }
    }

    private func appearanceChip(_ m: SpThemeMode.Mode) -> some View {
        let active = themeMode.mode == m
        return Button {
            withAnimation(.easeInOut(duration: 0.25)) { themeMode.mode = m }
        } label: {
            VStack(spacing: 7) {
                Image(systemName: m.icon).font(.system(size: 18, weight: .bold))
                Text(m.label).font(SportsFonts.app(size: 12.5, weight: .bold))
            }
            .foregroundStyle(active ? .white : SpTheme.onDarkDim)
            .frame(maxWidth: .infinity).frame(height: 66)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                    .fill(active ? SpTheme.green : SpTheme.card)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                        .stroke(active ? Color.clear : SpTheme.cardStroke, lineWidth: 1))
            )
            .contentShape(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous))
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - خدماتي

    private var servicesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("خدماتي")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                serviceTile("مبارياتي", "calendar.badge.clock", "\(auth.isLoggedIn ? followedTeams.count : 0) فريق", SpTheme.green)
                serviceTile("تنبيهات مباشرة", "bell.badge.fill", "\(activeAlertsCount) مفعّلة", SpTheme.green)
                serviceTile("الدعم", "questionmark.circle.fill", "تواصل", SpTheme.onDarkDim)
            }
        }
    }

    private func serviceTile(_ title: String, _ icon: String, _ subtitle: String, _ tint: Color) -> some View {
        Button {
            if title == "الدعم", let url = URL(string: "https://sabq.org/contact") { openURL(url) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: 34, height: 34)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(tint.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(SportsFonts.app(size: 13, weight: .heavy))
                        .foregroundStyle(SpTheme.onDark)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(SportsFonts.app(size: 10.5, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(minHeight: 68)
            .background(cardBg)
        }
        .buttonStyle(SpPressStyle())
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
                    alertRow("بداية المباراة", "play.circle.fill", \.kickoff)
                    rowDivider
                    alertRow("الأهداف", "soccerball", \.goals)
                    rowDivider
                    alertRow("البطاقات", "rectangle.portrait.fill", \.cards)
                    rowDivider
                    alertRow("حالات الفار (VAR)", "tv.fill", \.varReview)
                    rowDivider
                    alertRow("نهاية المباراة", "flag.checkered", \.fulltime)
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

    private func alertRow(_ title: String, _ icon: String, _ keyPath: WritableKeyPath<SpAlertPrefs, Bool>) -> some View {
        let active = auth.alertPrefs[keyPath: keyPath]
        return Button {
            var p = auth.alertPrefs
            p[keyPath: keyPath].toggle()
            Task { await auth.setAlertPrefs(p) }
        } label: {
            HStack(spacing: 12) {
                iconTile(icon, active ? SpTheme.green : SpTheme.onDarkFaint)
                Text(title)
                    .font(SportsFonts.app(size: 14.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Circle()
                        .fill(active ? SpTheme.green : SpTheme.onDarkFaint)
                        .frame(width: 7, height: 7)
                    Text(active ? "مفعّل" : "متوقف")
                        .font(SportsFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(active ? SpTheme.green : SpTheme.onDarkFaint)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(active ? SpTheme.green.opacity(0.10) : SpTheme.chipFill))
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - عن التطبيق

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("عن التطبيق")
            settingsCard {
                navRow("info.circle.fill", "عن التطبيق") { AboutAppView() }
                rowDivider
                navRow("checkmark.shield.fill", "سياسة الاستخدام") { UsagePolicyView() }
                rowDivider
                navRow("doc.text.fill", "شروط الاستخدام") { TermsView() }
                rowDivider
                infoRow("number", "الإصدار", appVersion)
            }
        }
    }

    private var appVersion: String {
        let b = Bundle.main
        let v = (b.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0"
        let n = (b.infoDictionary?["CFBundleVersion"] as? String) ?? "1"
        return "\(v) (\(n))"
    }

    private func navRow<D: View>(_ icon: String, _ title: String, _ tint: Color = SpTheme.onDarkDim,
                                 @ViewBuilder destination: @escaping () -> D) -> some View {
        NavigationLink { destination() } label: {
            HStack(spacing: 12) {
                iconTile(icon, tint)
                Text(title).font(SportsFonts.app(size: 14.5, weight: .semibold)).foregroundStyle(tint == SpTheme.crimson ? SpTheme.crimson : SpTheme.onDark)
                Spacer(minLength: 8)
                Image(systemName: "chevron.backward").font(.system(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - منطقة الخطر (حذف الحساب)

    @ViewBuilder private var dangerZoneSection: some View {
        if auth.isLoggedIn {
            VStack(alignment: .leading, spacing: 10) {
                sectionHeader("منطقة الخطر")
                settingsCard {
                    navRow("trash.fill", "حذف الحساب", SpTheme.crimson) { DeleteAccountView() }
                }
                hint("حذف الحساب يزيل ملفّك وبياناتك نهائيًّا ولا يمكن التراجع عنه.")
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
            Text("بحساب VARA لمتابعة فِرقك وتلقّي تنبيهات المباريات والمشاركة في المجتمع.")
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
