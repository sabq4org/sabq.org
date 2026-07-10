import SwiftUI

// حسابي — مركز الإعدادات: ملف العضو + «فِرقي» (المفضّل محلّي بلا دخول + المتابَعة)
// + تنبيهات المباريات (مجمّعة) + عن التطبيق (روابط فعلية). تصميم قوائم مجمّعة
// نظيفة (بطاقة بيضاء واحدة لكل قسم بفواصل خفيفة) باللمسة الخضراء المقتصدة.
struct AccountView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpFavorites.self) private var favorites
    @Environment(SpThemeMode.self) private var themeMode
    @Environment(SpAccentTheme.self) private var accent
    @Environment(SpLanguage.self) private var language
    @Environment(SpAppRouter.self) private var router
    @Environment(\.openURL) private var openURL
    @AppStorage("vara.smartSnaps.visible") private var showSmartSnaps = true
    @State private var selectedTeam: IDBox?
    @State private var showSignOutConfirm = false
    @State private var showEditProfile = false

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

                    if showSmartSnaps, !language.isEnglish {
                        VaraInsightCard(context: VaraInsightContext(
                            isLoggedIn: auth.isLoggedIn,
                            favoriteName: favorites.team?.name,
                            followsCount: followedTeams.count,
                            activeAlerts: activeAlertsCount
                        ))
                    }

                    predictionsSection
                    languageSection
                    appearanceSection
                    notificationsEntrySection
                    aboutSection
                    dangerZoneSection

                    if auth.isLoggedIn { signOutButton }

                    HStack(spacing: 7) {
                        SpWordmark(size: 11, color: SpTheme.onDarkFaint)
                        Text(L("· دقّة الرياضة"))
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
            .navigationTitle(L("حسابي"))
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
            .alert(L("تسجيل الخروج"), isPresented: $showSignOutConfirm) {
                Button(L("تسجيل الخروج"), role: .destructive) { auth.signOut() }
                Button(L("إلغاء"), role: .cancel) {}
            } message: {
                Text(L("سيتم إنهاء جلستك على هذا الجهاز. يبقى فريقك المفضّل ومبارياتك المتابَعة كما هي."))
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
                    Text(auth.member?.name ?? L("عضو VARA"))
                        .font(SportsFonts.app(size: 18, weight: .heavy))
                        .foregroundStyle(SpTheme.onDark)
                        .lineLimit(1)
                    // لا نعرض البريد الاصطناعي @phone.sabq.org — نفضّل الجوال أو البريد الحقيقي.
                    if let email = auth.member?.displayEmail {
                        Text(email)
                            .font(SportsFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(SpTheme.onDarkDim)
                            .lineLimit(1)
                    } else if let phone = auth.member?.phone, !phone.isEmpty {
                        Text(phone)
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

            // حسابات الجوال تُنشأ بلا اسم — نحثّ على إكماله داخل التطبيق (نفس حقل الويب).
            if needsNameCompletion {
                Button { showEditProfile = true } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "person.crop.circle.badge.exclamationmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(SpTheme.gold)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L("أكمل اسمك"))
                                .font(SportsFonts.app(size: 13, weight: .heavy))
                                .foregroundStyle(SpTheme.onDark)
                            Text(L("حسابك بلا اسم — أضفه ليظهر في عضويتك"))
                                .font(SportsFonts.app(size: 11, weight: .semibold))
                                .foregroundStyle(SpTheme.onDarkDim)
                                .lineLimit(2)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.backward")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(SpTheme.onDarkFaint)
                    }
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(SpTheme.gold.opacity(0.10))
                    )
                }
                .buttonStyle(.plain)
            }

        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(cardBg)
        .sheet(isPresented: $showEditProfile) {
            EditProfileView()
                .environment(auth)
        }
    }

    private var needsNameCompletion: Bool {
        auth.needsDisplayName
    }

    // شارة العضوية «عضو سبق» + تعديل الملف داخل التطبيق.
    private var membershipRow: some View {
        HStack(spacing: 8) {
            // شارة العضوية لمسة ذهبية بلا كبسولة — أيقونة الختم + النص يكفيان.
            HStack(spacing: 6) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 13, weight: .bold))
                Text(L("عضو سبق"))
                    .font(SportsFonts.app(size: 12, weight: .heavy))
            }
            .foregroundStyle(SpTheme.gold)

            Spacer(minLength: 0)

            Button { showEditProfile = true } label: {
                HStack(spacing: 3) {
                    Text(L("تعديل الملف الشخصي"))
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
        if let fav = favorites.team { return Lf("مشجّع %@", fav.name) }
        if teams > 0 { return Lf("تتابع %d فريقًا", teams) }
        return L("أهلًا بك في VARA")
    }

    // MARK: - التوقّعات (نظام البركة المتدرّجة المعمّم — يُفتح من هنا)

    private var predictionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("التوقّعات"))
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
                        Text(L("توقّعات VARA"))
                            .font(SportsFonts.app(size: 16, weight: .heavy))
                            .foregroundStyle(SpTheme.onDark)
                        Text(L("توقّع نتائج كأس العالم والبطولات وتنافس على النقاط والجوائز"))
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

    // MARK: - اللغة (عربي / إنجليزي)

    private var languageSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("اللغة"))
            HStack(spacing: 8) {
                ForEach(SpLanguage.Lang.allCases) { lang in
                    languageChip(lang)
                }
            }
            hint(L("اختر لغة الواجهة. قد تبقى بيانات المباريات بالعربية حتى تدعمها البوابة بالإنجليزية."))
        }
    }

    private func languageChip(_ lang: SpLanguage.Lang) -> some View {
        let active = language.lang == lang
        return Button {
            withAnimation(.easeInOut(duration: 0.25)) { language.lang = lang }
        } label: {
            VStack(spacing: 7) {
                Text(lang.flag).font(.system(size: 20))
                Text(lang.nativeName).font(SportsFonts.app(size: 12.5, weight: .bold))
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

    // MARK: - المظهر (تلقائي / فاتح / داكن + لون التطبيق)

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("المظهر"))
            HStack(spacing: 8) {
                ForEach(SpThemeMode.Mode.allCases) { m in
                    appearanceChip(m)
                }
            }
            hint(L("«تلقائي» يتبع إعداد جهازك؛ أو اختر الفاتح/الداكن يدويًّا."))
            appColorPicker
        }
    }

    // مُنتقي لون التطبيق — المستخدم يختار لونًا محوريًا بدون صبغ البطولات بألوان مختلفة.
    private var appColorPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("لون التطبيق"))
                .font(SportsFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5), spacing: 14) {
                ForEach(SpTeamPalette.all) { p in colorSwatch(p) }
            }
            hint(L("اختر لونك المفضل للأزرار والأيقونات والترويسات؛ البطولات تبقى بنفس قالب التطبيق."))
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
                Text(L(m.label)).font(SportsFonts.app(size: 12.5, weight: .bold))
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
            sectionHeader(L("فِرقي"))
            settingsCard {
                favoriteRow
                if auth.isLoggedIn && !followedTeams.isEmpty {
                    rowDivider
                    followedRow
                }
            }
            if !auth.isLoggedIn {
                hint(L("الفريق المفضّل يعمل بلا تسجيل دخول ويتصدّر صفحتك الرئيسية. سجّل الدخول لمتابعة عدّة فِرق وتلقّي تنبيهاتها."))
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
                        Text(L("الفريق المفضّل"))
                            .font(SportsFonts.app(size: 14.5, weight: .bold))
                            .foregroundStyle(SpTheme.onDark)
                        Text(favorites.team?.name ?? L("اختره من نجمة صفحة أي نادٍ"))
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
                .accessibilityLabel(L("إزالة الفريق المفضّل"))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    // الفِرق المتابَعة — تمرير أفقي للشعارات (تفتح صفحة النادي).
    private var followedRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                iconTile("heart.fill", SpTheme.green)
                Text(L("الفِرق المتابَعة"))
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

    // MARK: - الإشعارات (مدخل لصفحة التفاصيل)

    private var notificationsEntrySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("الإشعارات"))
            settingsCard {
                NavigationLink { NotificationsSettingsView() } label: {
                    HStack(spacing: 12) {
                        iconTile("bell.badge.fill", SpTheme.green)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L("إدارة الإشعارات"))
                                .font(SportsFonts.app(size: 14.5, weight: .bold))
                                .foregroundStyle(SpTheme.onDark)
                            Text(notificationsEntrySubtitle)
                                .font(SportsFonts.app(size: 11.5, weight: .semibold))
                                .foregroundStyle(SpTheme.onDarkFaint)
                                .lineLimit(2)
                        }
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
            hint(L("تصلك إشعارات الفِرق المتابَعة والمباريات في «مبارياتي»."))
        }
    }

    private var notificationsEntrySubtitle: String {
        let teams = followedTeams.count
        let matches = SpMatchFollows.shared.visibleItems.count
        if !auth.isLoggedIn {
            return L("إذن النظام · مبارياتي · تسجيل الدخول للتنبيهات اللحظية")
        }
        return String(format: L("%d فِرق · %d مباريات · أنواع الأحداث"), teams, matches)
    }

    // MARK: - عن التطبيق

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("عن التطبيق"))
            settingsCard {
                navRow("info.circle.fill", L("عن التطبيق")) { AboutAppView() }
                rowDivider
                navRow("checkmark.shield.fill", L("سياسة الاستخدام")) { UsagePolicyView() }
                rowDivider
                navRow("doc.text.fill", L("شروط الاستخدام")) { TermsView() }
                rowDivider
                linkRow("questionmark.circle.fill", L("الدعم"), "https://sabq.org/contact")
                rowDivider
                infoRow("number", L("الإصدار"), appVersion)
            }
        }
    }

    private var appVersion: String {
        let b = Bundle.main
        let v = (b.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0"
        let n = (b.infoDictionary?["CFBundleVersion"] as? String) ?? "1"
        return "\(v) (\(n))"
    }

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
                sectionHeader(L("منطقة الخطر"))
                settingsCard {
                    navRow("trash.fill", L("حذف الحساب"), SpTheme.crimson) { DeleteAccountView() }
                }
                hint(L("حذف الحساب يزيل ملفّك وبياناتك نهائيًّا ولا يمكن التراجع عنه."))
            }
        }
    }

    // MARK: - تسجيل الخروج

    private var signOutButton: some View {
        Button { showSignOutConfirm = true } label: {
            Text(L("تسجيل الخروج"))
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
        // يشمل مباريات «عالمية» (id سالب) — مركزها يُحلّ خادميًّا من لوحة TheSports.
        guard fixtureId != 0 else { return }
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
enum SpLoginMode { case phone, membership }

struct SpMembershipLogin: View {
    @Environment(SpAuthStore.self) private var auth
    @State private var mode: SpLoginMode = .phone
    @State private var identifier = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 14) {
            header
            modeTabs
            // المحتوى حسب التبويب: الجوال (OTP) أو عضوية سبق (بريد/كلمة مرور).
            if mode == .phone {
                SpPhoneLoginFlow()
            } else {
                membershipFields
            }

            dividerOr

            // بديل مشترك — المتابعة عبر Apple (أسفل كلا التبويبين).
            Button { auth.startAppleSignIn() } label: {
                HStack(spacing: 10) {
                    Image(systemName: "applelogo").font(.system(size: 18, weight: .semibold))
                    Text(L("المتابعة عبر Apple")).font(SportsFonts.app(size: 15, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous).fill(.black))
            }
            .buttonStyle(.plain)
            .disabled(auth.isLoading)

            errorText(for: .apple)
        }
    }

    // الترويسة — ترحيب + ختم «من سبق» + سطر تعريفي.
    private var header: some View {
        VStack(spacing: 14) {
            HStack(spacing: 6) {
                Text(L("مرحبًا بك في"))
                    .font(SportsFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                SpWordmark(size: 20)
            }
            HStack(spacing: 7) {
                Text(L("أحد منتجات"))
                    .font(SportsFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                Rectangle().fill(SpTheme.outline).frame(width: 1, height: 11)
                Text(L("صحيفة سبق"))
                    .font(SportsFonts.app(size: 11, weight: .heavy))
                    .foregroundStyle(SpTheme.green)
            }
            .padding(.top, -4)
            Text(L("سجّل دخولك لتحفظ فريقك، وترسل توقّعاتك، وتصلك تنبيهات المباريات على كل أجهزتك."))
                .font(SportsFonts.app(size: 13))
                .foregroundStyle(SpTheme.onDarkDim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // مبدّل التبويبين — [الجوال] [عضوية سبق].
    private var modeTabs: some View {
        HStack(spacing: 6) {
            modeTab(L("الجوال"), icon: "iphone", value: .phone)
            modeTab(L("عضوية سبق"), icon: "person.text.rectangle", value: .membership)
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.cardFill))
    }

    private func modeTab(_ title: String, icon: String, value: SpLoginMode) -> some View {
        let active = mode == value
        return Button {
            withAnimation(.easeOut(duration: 0.2)) { mode = value }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12, weight: .bold))
                Text(title).font(SportsFonts.app(size: 13.5, weight: .bold))
            }
            .foregroundStyle(active ? .white : SpTheme.onDarkDim)
            .frame(maxWidth: .infinity).frame(height: 38)
            .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius - 2, style: .continuous)
                .fill(active ? SpTheme.green : Color.clear))
        }
        .buttonStyle(.plain)
    }

    // تبويب عضوية سبق — بريد/جوال + كلمة مرور.
    private var membershipFields: some View {
        VStack(spacing: 12) {
            VStack(spacing: 10) {
                field(text: $identifier, placeholder: L("البريد الإلكتروني أو الجوال"), icon: "person", secure: false)
                field(text: $password, placeholder: L("كلمة المرور"), icon: "lock", secure: true)
            }
            Button {
                Task { await auth.loginWithCredentials(identifier: identifier, password: password) }
            } label: {
                HStack(spacing: 8) {
                    if auth.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text(L("سبق"))
                            .font(SportsFonts.app(size: 11, weight: .heavy))
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(Color.white.opacity(0.18)))
                    }
                    Text(L("الدخول بعضوية سبق")).font(SportsFonts.app(size: 16, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous).fill(SpTheme.green))
            }
            .buttonStyle(.plain)
            .disabled(auth.isLoading)

            errorText(for: .credentials)
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
            Text(L("أو")).font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
            Rectangle().fill(SpTheme.outline).frame(height: 1)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - تدفّق الدخول بالجوال (Twilio Verify)

/// إدخال الجوال (🇸🇦 +966 افتراضيًا، رقم بلا صفر) ← رمز تحقّق من 6 أرقام مع تعبئة
/// آلية عند وصول الرسالة. النجاح يُصدر جلسة عضو (يُنشئ الحساب إن لزم).
struct SpPhoneLoginFlow: View {
    @Environment(SpAuthStore.self) private var auth
    private enum Step { case phone, code }
    @State private var step: Step = .phone
    @State private var number = ""     // أرقام المشترك فقط (5XXXXXXXX)
    @State private var code = ""
    @State private var resend = 0      // عدّاد إعادة الإرسال (ثوانٍ)
    @FocusState private var phoneFocused: Bool

    private var normalized: String { String(number.filter(\.isNumber).prefix(9)) }
    private var phoneValid: Bool { normalized.count == 9 && normalized.first == "5" }
    private var e164Display: String { "+966 " + normalized }

    var body: some View {
        VStack(spacing: 12) {
            if step == .phone { phoneStep } else { codeStep }
        }
    }

    // خطوة إدخال الرقم
    private var phoneStep: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                HStack(spacing: 5) {
                    Text("🇸🇦").font(.system(size: 16))
                    Text("+966").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                }
                .environment(\.layoutDirection, .leftToRight)
                Rectangle().fill(SpTheme.outline).frame(width: 1, height: 22)
                // خط النظام الموحّد للأرقام — الخط العربي المخصّص كان يخفي الأحرف أثناء الكتابة أحيانًا.
                TextField("", text: $number, prompt: Text(verbatim: "5XXXXXXXX").foregroundStyle(SpTheme.onDarkFaint))
                    .keyboardType(.numberPad)
                    .textContentType(.telephoneNumber)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(SpTheme.onDark)
                    .tint(SpTheme.green)
                    .multilineTextAlignment(.leading)
                    .focused($phoneFocused)
                    .onChange(of: number) { _, v in number = String(v.filter(\.isNumber).prefix(9)) }
            }
            // الصفّ كاملًا LTR: المفتاح +966 يسار، الرقم يمينه (كالويب).
            .environment(\.layoutDirection, .leftToRight)
            .padding(.horizontal, 14).padding(.vertical, 13)
            .background(fieldBg)
            .contentShape(Rectangle())
            .onTapGesture { phoneFocused = true }
            .onAppear { phoneFocused = true }

            Text(L("سنرسل رمز تحقّق برسالة نصية إلى جوالك."))
                .font(SportsFonts.app(size: 11.5)).foregroundStyle(SpTheme.onDarkFaint)
                .frame(maxWidth: .infinity, alignment: .center)

            primaryButton(L("أرسل رمز التحقق"), enabled: phoneValid) { Task { await send() } }
            errorText
        }
    }

    // خطوة الرمز
    private var codeStep: some View {
        VStack(spacing: 14) {
            VStack(spacing: 4) {
                Text(L("أدخل رمز التحقق"))
                    .font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                HStack(spacing: 5) {
                    Text(L("أُرسل إلى"))
                    Text(e164Display).environment(\.layoutDirection, .leftToRight)
                    Button(L("تعديل")) { withAnimation { step = .phone; code = "" } }
                        .foregroundStyle(SpTheme.green)
                }
                .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            }

            SpOtpBoxes(code: $code) { Task { await verify() } }

            if resend > 0 {
                Text(String(format: L("إعادة الإرسال خلال %d ثانية"), resend))
                    .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkFaint)
            } else {
                Button(L("إعادة إرسال الرمز")) { Task { await send() } }
                    .buttonStyle(.plain)
                    .font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.green)
            }

            primaryButton(L("تحقّق ودخول"), enabled: code.count == 6) { Task { await verify() } }
            errorText
        }
    }

    // MARK: أفعال

    private func send() async {
        let r = await auth.sendPhoneCode(normalized)
        if r.ok {
            withAnimation { step = .code }
            startResend()
        }
    }

    private func verify() async {
        guard code.count == 6 else { return }
        _ = await auth.verifyPhoneCode(normalized, code: code)
        // النجاح يُغلق الورقة عبر onChange(isLoggedIn) في SpLoginSheet.
    }

    private func startResend() {
        resend = 60
        Task { @MainActor in
            while resend > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if resend > 0 { resend -= 1 }
            }
        }
    }

    // MARK: عناصر مشتركة

    private var fieldBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
            .fill(SpTheme.cardFill)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
    }

    private func primaryButton(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if auth.isLoading { ProgressView().tint(.white) }
                Text(title).font(SportsFonts.app(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity).frame(height: 50)
            .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous)
                .fill(enabled ? SpTheme.green : SpTheme.green.opacity(0.4)))
        }
        .buttonStyle(.plain)
        .disabled(!enabled || auth.isLoading)
    }

    @ViewBuilder private var errorText: some View {
        if auth.errorSource == .phone, let err = auth.errorMessage {
            Text(err)
                .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.crimson)
                .multilineTextAlignment(.center).frame(maxWidth: .infinity)
        }
    }
}

/// حقل رمز OTP — خانات مرئية + TextField فوقها بشفافية منخفضة جدًا ليفعّل شريط
/// «من الرسائل» (QuickType) عند وصول SMS مع `.oneTimeCode`.
struct SpOtpBoxes: View {
    @Binding var code: String
    var onComplete: () -> Void
    private let length = 6
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            HStack(spacing: 8) {
                ForEach(0..<length, id: \.self) { i in box(i) }
            }
            .environment(\.layoutDirection, .leftToRight)
            .allowsHitTesting(false)

            // فوق الخانات وبشفافية شبه معدومة — iOS يرفض opacity=0 تمامًا لاقتراح الرمز.
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(.clear)
                .tint(.clear)
                .multilineTextAlignment(.center)
                .focused($focused)
                .opacity(0.02)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .onChange(of: code) { _, v in
                    let d = String(v.filter(\.isNumber).prefix(length))
                    if d != code { code = d }
                    if d.count == length { focused = false; onComplete() }
                }
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { focused = true }
    }

    private func box(_ i: Int) -> some View {
        let chars = Array(code)
        let digit: String = i < chars.count ? String(chars[i]) : ""
        let active = i == chars.count
        return Text(digit)
            .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
            .foregroundStyle(SpTheme.onDark)
            .frame(maxWidth: .infinity).frame(height: 54)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.cardFill))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(active ? SpTheme.green : SpTheme.outline, lineWidth: active ? 2 : 1))
    }
}

/// ورقة الدخول المنبثقة (Bottom Sheet) — تُستضاف عامّةً على RootTabView وتُفتح من
/// أي محفّز عبر SpAppRouter.requestLogin(). تُغلق ذاتيًّا عند نجاح الدخول
/// (وبعد إكمال الاسم إن لزم لحسابات الجوال).
struct SpLoginSheet: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss

    private var awaitingName: Bool {
        auth.isLoggedIn && auth.needsDisplayName
    }

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(SpTheme.outline)
                .frame(width: 40, height: 4)
                .padding(.top, 10).padding(.bottom, 2)
            ScrollView {
                Group {
                    if awaitingName {
                        SpCompleteNameForm(onDone: { dismiss() })
                    } else {
                        SpMembershipLogin()
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 12)
                .padding(.bottom, 28)
            }
        }
        .background(SpTheme.surface.ignoresSafeArea())
        .presentationDetents([.height(580), .large])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(26)
        .interactiveDismissDisabled(awaitingName)
        .onChange(of: auth.isLoggedIn) { _, logged in
            if logged && !auth.needsDisplayName { dismiss() }
        }
        .onChange(of: auth.needsDisplayName) { _, needs in
            if auth.isLoggedIn && !needs { dismiss() }
        }
    }
}

/// نموذج إكمال الاسم الإلزامي بعد OTP / للجلسات القديمة بلا firstName.
struct SpCompleteNameForm: View {
    @Environment(SpAuthStore.self) private var auth
    var onDone: () -> Void = {}

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var localError: String?
    @FocusState private var focused: Bool

    private var canSave: Bool {
        firstName.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(SpTheme.green)
                .padding(.top, 8)

            Text(L("أكمل اسمك"))
                .font(SportsFonts.app(size: 22, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)

            Text(L("سجّلت بجوالك بنجاح. أضف اسمك ليظهر في عضويتك وتعليقاتك."))
                .font(SportsFonts.app(size: 13))
                .foregroundStyle(SpTheme.onDarkDim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let phone = auth.member?.phone, !phone.isEmpty {
                Text(phone)
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
            }

            VStack(spacing: 10) {
                nameField(
                    label: L("الاسم الأول"),
                    placeholder: L("أدخل الاسم الأول"),
                    text: $firstName,
                    required: true
                )
                .focused($focused)

                nameField(
                    label: L("اسم العائلة") + " (" + L("اختياري") + ")",
                    placeholder: L("أدخل اسم العائلة"),
                    text: $lastName,
                    required: false
                )
            }

            Text(L("لا يمكن تعديل الاسم بعد تعيينه لاعتبارات أمنية ومصداقية التعليقات"))
                .font(SportsFonts.app(size: 11))
                .foregroundStyle(SpTheme.onDarkFaint)
                .multilineTextAlignment(.center)

            if let err = localError ?? auth.errorMessage {
                Text(err)
                    .font(SportsFonts.app(size: 12))
                    .foregroundStyle(SpTheme.crimson)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await save() }
            } label: {
                HStack(spacing: 8) {
                    if auth.isLoading { ProgressView().tint(.white) }
                    Text(L("متابعة")).font(SportsFonts.app(size: 16, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(
                    RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous)
                        .fill(canSave ? SpTheme.green : SpTheme.green.opacity(0.4))
                )
            }
            .buttonStyle(.plain)
            .disabled(!canSave || auth.isLoading)
        }
        .onAppear { focused = true }
    }

    private func nameField(label: String, placeholder: String, text: Binding<String>, required: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text(label)
                    .font(SportsFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkDim)
                if required {
                    Text("*").foregroundStyle(SpTheme.crimson)
                        .font(SportsFonts.app(size: 12, weight: .bold))
                }
            }
            TextField("", text: text, prompt: Text(placeholder).foregroundStyle(SpTheme.onDarkFaint))
                .font(SportsFonts.app(size: 15))
                .foregroundStyle(SpTheme.onDark)
                .tint(SpTheme.green)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(.horizontal, 14).padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                        .fill(SpTheme.cardFill)
                        .overlay(
                            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                                .stroke(SpTheme.outline, lineWidth: 1)
                        )
                )
        }
    }

    private func save() async {
        localError = nil
        let fn = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard fn.count >= 2 else {
            localError = L("الاسم الأول يجب أن يكون حرفين على الأقل")
            return
        }
        let ln = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let ok = await auth.updateProfile(
            firstName: fn,
            lastName: ln.count >= 2 ? ln : nil,
            email: nil
        )
        if ok { onDone() }
    }
}
