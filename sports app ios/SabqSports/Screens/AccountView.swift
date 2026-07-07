import SwiftUI

// حسابي — مركز الإعدادات: ملف العضو + «فِرقي» (المفضّل محلّي بلا دخول + المتابَعة)
// + تنبيهات المباريات (مجمّعة) + عن التطبيق (روابط فعلية). تصميم قوائم مجمّعة
// نظيفة (بطاقة بيضاء واحدة لكل قسم بفواصل خفيفة) باللمسة الخضراء المقتصدة.
struct AccountView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpFavorites.self) private var favorites
    @Environment(SpThemeMode.self) private var themeMode
    @Environment(SpAccentTheme.self) private var accent
    @Environment(SpAppRouter.self) private var router
    @Environment(\.openURL) private var openURL
    @AppStorage("vara.smartSnaps.visible") private var showSmartSnaps = true
    @State private var selectedTeam: IDBox?
    @State private var showSignOutConfirm = false

    private var followedTeams: [SpFollow] { auth.follows.filter { $0.kind == "team" } }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 18) {
                    // مرساة أعلى الصفحة — للقفز إليها بعد تسجيل الخروج فتظهر بطاقة الدخول.
                    Color.clear.frame(height: 0).id(Self.accountTopId)
                    if auth.isLoggedIn {
                        profileHeader
                    } else {
                        signInCard
                    }

                    teamsSection

                    if showSmartSnaps {
                        VaraInsightCard(context: VaraInsightContext(
                            isLoggedIn: auth.isLoggedIn,
                            favoriteName: favorites.team?.name,
                            followsCount: followedTeams.count,
                            activeAlerts: activeAlertsCount
                        ))
                    }

                    predictionsSection
                    appearanceSection
                    notificationsSection
                    transfersNotificationsSection
                    aboutSection
                    dangerZoneSection

                    if auth.isLoggedIn { signOutButton }

                    HStack(spacing: 7) {
                        SpWordmark(size: 11, color: SpTheme.onDarkFaint)
                        Text("· دقّة الرياضة")
                            .font(SportsFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(SpTheme.onDarkFaint)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 2)
                }
                .padding(16)
            }
            .refreshable { await auth.loadUserData() }
            .autoHideTabBar()
            .background(SpAmbientBackground())
            .navigationTitle("حسابي")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
            .alert("تسجيل الخروج", isPresented: $showSignOutConfirm) {
                Button("تسجيل الخروج", role: .destructive) { auth.signOut() }
                Button("إلغاء", role: .cancel) {}
            } message: {
                Text("سيتم إنهاء جلستك على هذا الجهاز. يبقى فريقك المفضّل ومبارياتك المتابَعة كما هي.")
            }
            // بعد تسجيل الخروج: اقفز لأعلى الصفحة فتظهر بطاقة الدخول فورًا بدل
            // البقاء عند موضع زر الخروج بالأسفل.
            .onChange(of: auth.isLoggedIn) { _, loggedIn in
                if !loggedIn {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        proxy.scrollTo(Self.accountTopId, anchor: .top)
                    }
                }
            }
            }
        }
    }

    private static let accountTopId = "account-top"

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

            membershipRow

        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(cardBg)
    }

    // شارة العضوية «عضو سبق» + رابط إدارة الحساب على سبق — الرعاية الخفيفة (الموضع الثالث).
    private var membershipRow: some View {
        HStack(spacing: 8) {
            // شارة العضوية لمسة ذهبية بلا كبسولة — أيقونة الختم + النص يكفيان.
            HStack(spacing: 6) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 13, weight: .bold))
                Text("عضو سبق")
                    .font(SportsFonts.app(size: 12, weight: .heavy))
            }
            .foregroundStyle(SpTheme.gold)

            Spacer(minLength: 0)

            Button { openURL(URL(string: "https://sabq.org/profile")!) } label: {
                HStack(spacing: 3) {
                    Text("إدارة حساب سبق")
                        .font(SportsFonts.app(size: 11.5, weight: .bold))
                    Image(systemName: "chevron.backward")
                        .font(.system(size: 9, weight: .bold))
                }
                .foregroundStyle(SpTheme.green)
            }
            .buttonStyle(.plain)
        }
    }

    private var activeAlertsCount: Int {
        [auth.alertPrefs.kickoff, auth.alertPrefs.goals, auth.alertPrefs.cards, auth.alertPrefs.varReview, auth.alertPrefs.fulltime]
            .filter { $0 }.count
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

    // MARK: - المظهر (تلقائي / فاتح / داكن + لون التطبيق)

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("المظهر")
            HStack(spacing: 8) {
                ForEach(SpThemeMode.Mode.allCases) { m in
                    appearanceChip(m)
                }
            }
            hint("«تلقائي» يتبع إعداد جهازك؛ أو اختر الفاتح/الداكن يدويًّا.")
            appColorPicker
        }
    }

    // مُنتقي لون التطبيق — المستخدم يختار لونًا محوريًا بدون صبغ البطولات بألوان مختلفة.
    private var appColorPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("لون التطبيق")
                .font(SportsFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5), spacing: 14) {
                ForEach(SpTeamPalette.all) { p in colorSwatch(p) }
            }
            hint("اختر لونك المفضل للأزرار والأيقونات والترويسات؛ البطولات تبقى بنفس قالب التطبيق.")
        }
        .padding(.top, 6)
    }

    private func colorSwatch(_ p: SpTeamPalette) -> some View {
        let active = accent.paletteId == p.id
        return Button {
            withAnimation(.easeInOut(duration: 0.25)) { accent.paletteId = p.id }
        } label: {
            Circle()
                .fill(SpTheme.dyn(p.primaryLight, p.primaryDark))
                .frame(width: 42, height: 42)
                .overlay(
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(.white)
                        .opacity(active ? 1 : 0)
                )
                .overlay(
                    Circle().strokeBorder(Color.white, lineWidth: active ? 2 : 0)
                )
                .frame(maxWidth: .infinity)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
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

    // «خدماتي» حُذف — كان يكرّر عددَي المتابَعة/التنبيهات المعروضين في «فِرقي»
    // وبطاقة ذكاء VARA، وبطاقتاه ساكنتان بلا نقر. «الدعم» انتقل إلى «عن التطبيق».

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
                .accessibilityLabel("إزالة الفريق المفضّل")
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
                    rowDivider
                    alertRow("لقطات ذكية", "sparkles", \.smartSnaps)
                    rowDivider
                    localSmartSnapsRow
                }
                hint(followedTeams.isEmpty
                     ? "تابع فريقًا ليصلك تنبيه عند أحداث مبارياته."
                     : "تصلك هذه التنبيهات عن مباريات فِرقك المتابَعة.")
            } else {
                settingsCard {
                    Button { router.requestLogin() } label: {
                        HStack(spacing: 12) {
                            iconTile("bell.badge.fill", SpTheme.green)
                            Text("سجّل الدخول بعضوية سبق لتفعيل تنبيهات فِرقك")
                                .font(SportsFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(SpTheme.onDark)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.backward")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(SpTheme.onDarkFaint)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SpPressStyle())
                }
            }
        }
    }

    // MARK: - تنبيهات الانتقالات (بثّ عام — لا يتطلّب متابعة فريق)

    @ViewBuilder private var transfersNotificationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("تنبيهات الانتقالات")
            if auth.isLoggedIn {
                settingsCard {
                    alertRow("انتقالات سعودية", "flag.fill", \.transfersSaudi)
                    rowDivider
                    alertRow("انتقالات عالمية بارزة", "globe", \.transfersGlobal)
                }
                hint("تصلك الصفقات المؤكّدة فور تأكيدها — تنبيهات سوق عامّة لا تتطلّب متابعة فريق.")
            } else {
                settingsCard {
                    Button { router.requestLogin() } label: {
                        HStack(spacing: 12) {
                            iconTile("bell.badge.fill", SpTheme.green)
                            Text("سجّل الدخول بعضوية سبق لتفعيل تنبيهات الانتقالات")
                                .font(SportsFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(SpTheme.onDark)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.backward")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(SpTheme.onDarkFaint)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SpPressStyle())
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
                // نقطة + نص بلا كبسولة ملوّنة — الحالة لمسة لا صندوق (×7 صفوف).
                HStack(spacing: 6) {
                    Circle()
                        .fill(active ? SpTheme.green : SpTheme.onDarkFaint)
                        .frame(width: 7, height: 7)
                    Text(active ? "مفعّل" : "متوقف")
                        .font(SportsFonts.app(size: 11.5, weight: .bold))
                }
                .foregroundStyle(active ? SpTheme.green : SpTheme.onDarkFaint)
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
                linkRow("questionmark.circle.fill", "الدعم", "https://sabq.org/contact")
                rowDivider
                infoRow("number", "الإصدار", appVersion)
            }
        }
    }

    private var localSmartSnapsRow: some View {
        Button {
            showSmartSnaps.toggle()
        } label: {
            HStack(spacing: 12) {
                iconTile("eye", showSmartSnaps ? SpTheme.green : SpTheme.onDarkFaint)
                Text("إظهار اللقطات داخل التطبيق")
                    .font(SportsFonts.app(size: 14.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Circle()
                        .fill(showSmartSnaps ? SpTheme.green : SpTheme.onDarkFaint)
                        .frame(width: 7, height: 7)
                    Text(showSmartSnaps ? "ظاهر" : "مخفي")
                        .font(SportsFonts.app(size: 11.5, weight: .bold))
                }
                .foregroundStyle(showSmartSnaps ? SpTheme.green : SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // صفّ يفتح رابطًا خارجيًّا (بنفس هيئة navRow).
    private func linkRow(_ icon: String, _ title: String, _ urlString: String) -> some View {
        Button {
            if let url = URL(string: urlString) { openURL(url) }
        } label: {
            HStack(spacing: 12) {
                iconTile(icon, SpTheme.onDarkDim)
                Text(title).font(SportsFonts.app(size: 14.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 8)
                Image(systemName: "arrow.up.forward").font(.system(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
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

    // MARK: - تسجيل الدخول (بعضوية سبق — عبر المكوّن المشترك SpMembershipLogin)

    private var signInCard: some View {
        SpMembershipLogin()
            .frame(maxWidth: .infinity)
            .padding(.vertical, 22).padding(.horizontal, 16)
            .background(cardBg)
    }

    @ViewBuilder private var avatarView: some View {
        if let a = auth.member?.avatar, !a.isEmpty {
            // SpAvatarImage (كاش @State) بدل AsyncImage — يمنع وميض الصورة عند إعادة الرسم.
            SpAvatarImage(url: a, size: 60, ring: SpTheme.green.opacity(0.45),
                          placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
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

// MARK: - موجّه التطبيق (تبويب مُختار + ورقة الدخول العامّة)

/// تبويبات الجذر (RootTabView) — تسمح بالتنقّل البرمجي بين التبويبات.
enum SpTab: Hashable { case matches, roshn, competitions, world, account }

/// موجّه بسيط مشترك يُحقن بالبيئة: يفتح ورقة الدخول من أي شاشة (`requestLogin`)
/// وينقل للتبويب المطلوب (`openAccount`). حامل مفرد كي يصمد أمام إعادة بناء الشجرة.
@Observable final class SpAppRouter {
    static let shared = SpAppRouter()
    // وسيط إقلاع للأتمتة (لقطات المحاكي): -tab <matches|roshn|competitions|world|account>.
    var selectedTab: SpTab = SpAppRouter.launchTab()
    var showLogin = false
    var pendingMatchId: Int?
    private init() {}
    func requestLogin() { showLogin = true }
    func openAccount() { selectedTab = .account }
    func openMatch(_ fixtureId: Int) {
        selectedTab = .matches
        pendingMatchId = fixtureId
    }

    func handle(url: URL) {
        if (url.scheme == "sabqsports" || url.scheme == "sabq"), url.host == "match" {
            let id = Int(url.pathComponents.dropFirst().first ?? "")
            if let id { openMatch(id) }
            return
        }
        if url.scheme == "sabqsports",
           url.host == "sports",
           url.pathComponents.count >= 3,
           url.pathComponents[1] == "match",
           let id = Int(url.pathComponents[2]) {
            openMatch(id)
            return
        }
        if url.pathComponents.count >= 3,
           url.pathComponents[1] == "sports",
           url.pathComponents[2] == "match",
           let id = Int(url.pathComponents.dropFirst(3).first ?? "") {
            openMatch(id)
        }
    }

    private static func launchTab() -> SpTab {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-tab-roshn") { return .roshn }
        if let i = args.firstIndex(of: "-tab"), i + 1 < args.count {
            switch args[i + 1] {
            case "roshn": return .roshn
            case "competitions": return .competitions
            case "world": return .world
            case "account": return .account
            default: return .matches
            }
        }
        return .matches
    }
}

// MARK: - مكوّن الدخول بعضوية سبق (مشترك بين تبويب «حسابي» وورقة الدخول العامّة)

/// نموذج الدخول بعضوية سبق: عنوان + حقول + زر «الدخول بعضوية سبق» الأساسي +
/// Apple بديلًا + ختم «من سبق». يُستخدم داخل بطاقة «حسابي» (SpMembershipLogin في
/// signInCard) وداخل SpLoginSheet المنبثقة.
struct SpMembershipLogin: View {
    @Environment(SpAuthStore.self) private var auth
    @State private var identifier = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 6) {
                Text("مرحبًا بك في")
                    .font(SportsFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                SpWordmark(size: 20)
            }
            // ختم «من سبق» أسفل الترحيب مباشرةً — الرعاية الخفيفة أعلى البطاقة.
            HStack(spacing: 7) {
                Text("أحد منتجات")
                    .font(SportsFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                Rectangle().fill(SpTheme.outline).frame(width: 1, height: 11)
                Text("صحيفة سبق")
                    .font(SportsFonts.app(size: 11, weight: .heavy))
                    .foregroundStyle(SpTheme.green)
            }
            .padding(.top, -4)
            Text("سجّل بعضويتك في سبق لتحفظ فريقك، وترسل توقّعاتك، وتصلك تنبيهات المباريات على كل أجهزتك.")
                .font(SportsFonts.app(size: 13))
                .foregroundStyle(SpTheme.onDarkDim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 10) {
                field(text: $identifier, placeholder: "البريد الإلكتروني أو الجوال", icon: "person", secure: false)
                field(text: $password, placeholder: "كلمة المرور", icon: "lock", secure: true)
            }

            // الزر الأساسي — الدخول بعضوية سبق (نفس حساب سبق).
            Button {
                Task { await auth.loginWithCredentials(identifier: identifier, password: password) }
            } label: {
                HStack(spacing: 8) {
                    if auth.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text("سبق")
                            .font(SportsFonts.app(size: 11, weight: .heavy))
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(Color.white.opacity(0.18)))
                    }
                    Text("الدخول بعضوية سبق").font(SportsFonts.app(size: 16, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous).fill(SpTheme.green))
            }
            .buttonStyle(.plain)
            .disabled(auth.isLoading)

            // خطأ دخول العضوية — تحت الزر الأخضر مباشرةً كي يعرف المستخدم أنه يخصّ
            // حقول البريد/كلمة المرور لا زر Apple.
            errorText(for: .credentials)

            dividerOr

            // بديل — المتابعة عبر Apple.
            Button { auth.startAppleSignIn() } label: {
                HStack(spacing: 10) {
                    Image(systemName: "applelogo").font(.system(size: 18, weight: .semibold))
                    Text("المتابعة عبر Apple").font(SportsFonts.app(size: 15, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous).fill(.black))
            }
            .buttonStyle(.plain)
            .disabled(auth.isLoading)

            // خطأ دخول Apple — تحت زر Apple.
            errorText(for: .apple)
        }
    }

    /// رسالة الخطأ تظهر فقط تحت الزر الذي أنتجها (العضوية/Apple).
    @ViewBuilder private func errorText(for source: SpAuthErrorSource) -> some View {
        if auth.errorSource == source, let err = auth.errorMessage {
            Text(err)
                .font(SportsFonts.app(size: 12))
                .foregroundStyle(SpTheme.crimson)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, alignment: .center)
        }
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
}

/// ورقة الدخول المنبثقة (Bottom Sheet) — تُستضاف عامّةً على RootTabView وتُفتح من
/// أي محفّز عبر SpAppRouter.requestLogin(). تُغلق ذاتيًّا عند نجاح الدخول.
struct SpLoginSheet: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(SpTheme.outline)
                .frame(width: 40, height: 4)
                .padding(.top, 10).padding(.bottom, 2)
            ScrollView {
                SpMembershipLogin()
                    .padding(.horizontal, 22)
                    .padding(.top, 12)
                    .padding(.bottom, 28)
            }
        }
        .background(SpTheme.surface.ignoresSafeArea())
        .presentationDetents([.height(580), .large])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(26)
        .onChange(of: auth.isLoggedIn) { _, logged in
            if logged { dismiss() }
        }
    }
}
