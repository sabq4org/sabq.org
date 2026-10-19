import SwiftUI
import PhotosUI

import UIKit

struct SettingsView: View {
    /// "الإصدار {short} ({build})" sourced from the bundle's Info.plist,
    /// so the about-section label tracks the actual TestFlight / App
    /// Store build instead of the previously hard-coded "1.0.0".
    static var versionLabel: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? ""
        return build.isEmpty ? "الإصدار \(short)" : "الإصدار \(short) (\(build))"
    }

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(AuthStore.self) private var authStore
    /// Pending-revision count drives the "مقالات تنتظر التعديل" card
    /// visibility inside `submissionCards(for:)`.
    @Environment(ArticleRevisionsStore.self) private var revisionsStore
    @Environment(FollowedKeywordsStore.self) private var followedKeywords
    @AppStorage("appAppearance") private var appearanceRaw: String = AppAppearance.system.rawValue
    @AppStorage("articleFontSize") private var textSize: Double = Double(SabqType.articleBody.size)
    @AppStorage("homeCardStyle") private var cardStyleRaw: String = "classic"
    @AppStorage("sabq.analytics.consent") private var analyticsConsent = false
    @State private var showLogin = false
    @State private var showRoleDebug = false
    @State private var roleDebugMessage = ""
    @State private var showContact = false
    @State private var showNewsletter = false
    @State private var showEditProfile = false
    @State private var showInterestsPicker = false
    @State private var interestsCategories: [APICategory] = []
    @State private var showChangePassword = false
    @State private var showDeleteAccount = false
    @State private var showForgotPassword = false
    @State private var submissionKind: ArticleSubmissionKind?
    @State private var showClearDataConfirm = false
    @State private var showLogoutConfirm = false
    @State private var didClearData = false
    /// Live observable so the toggle reflects the current state +
    /// reacts to changes from elsewhere (e.g. scenePhase recompute
    /// when the user opens the app at the start of the window).

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                profileSection
                if authStore.isLoggedIn, let user = authStore.currentUser {
                    editorialAndAdminSection(for: user)
                }
                SabqSectionBand()
                displaySection
                SabqSectionBand()
                browsingExperienceSection
                SabqSectionBand()
                analyticsPrivacySection
                if authStore.isLoggedIn {
                    SabqSectionBand()
                    matchAlertsSection
                }
                SabqSectionBand()
                subscriptionSection
                SabqSectionBand()
                aboutSection
                if authStore.isLoggedIn {
                    SabqSectionBand()
                    accountDangerSection
                }
                SabqSectionBand()
                appInfoSection
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space12)
            .padding(.bottom, 108)
            .frame(maxWidth: SabqLayout.readingWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .sabqNavigationEdge()
        .sabqAutoHideTabBar()
        .navigationTitle("حسابي")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SabqTheme.background, for: .navigationBar)
        .background(SabqTheme.background)
        .sabqRTL()
        .sabqScreen("More")
        .sheet(isPresented: $showLogin) {
            LoginSheet()
        }
        .alert("بيانات الدور المستلمة", isPresented: $showRoleDebug) {
            Button("نسخ") {
                UIPasteboard.general.string = roleDebugMessage
            }
            Button("إغلاق", role: .cancel) { }
        } message: {
            Text(roleDebugMessage)
        }
        .sheet(isPresented: $showContact) {
            ContactSheet()
        }
        .sheet(isPresented: $showNewsletter) {
            NewsletterSheet()
        }
        .sheet(isPresented: $showEditProfile) {
            EditProfileSheet()
        }
        .sheet(isPresented: $showInterestsPicker) {
            InterestsPickerSheet(
                allCategories: interestsCategories,
                selectedIds: Set(authStore.currentUser?.interests.map(\.id) ?? [])
            )
            .environment(authStore)
        }
        .task {
            // Warm the shared cache so the interests sheet opens
            // instantly when the OAuth-completion banner is tapped.
            await InterestsCategoryCache.shared.loadIfStale()
            interestsCategories = InterestsCategoryCache.shared.get()
        }
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordSheet()
        }
        .sheet(isPresented: $showDeleteAccount) {
            DeleteAccountSheet()
        }
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordSheet()
        }
        .sheet(item: $submissionKind) { kind in
            ArticleSubmissionView(kind: kind)
        }
        .alert("مسح البيانات المحلية؟", isPresented: $showClearDataConfirm) {
            Button("مسح", role: .destructive) { clearLocalData() }
            Button("إلغاء", role: .cancel) { }
        } message: {
            Text("سيتم حذف المقالات المحفوظة، عمليات البحث الأخيرة، والكلمات المتابعة من هذا الجهاز. لن يتأثر حسابك ولن يتم تسجيل خروجك.")
        }
        .alert("تم المسح", isPresented: $didClearData) {
            Button("حسناً", role: .cancel) { }
        } message: {
            Text("تم مسح البيانات المحلية بنجاح.")
        }
        .alert("تسجيل الخروج؟", isPresented: $showLogoutConfirm) {
            Button("خروج", role: .destructive) {
                Task { await authStore.logout() }
            }
            Button("إلغاء", role: .cancel) { }
        } message: {
            Text("سيتم إنهاء جلستك على هذا الجهاز.")
        }
    }

    /// Clears bookmarks, recent searches, followed keywords, and the
    /// in-memory image cache. Does NOT touch auth, reading preferences,
    /// or dark mode — those are explicit user settings that aren't
    /// considered "data" for this control.
    private func clearLocalData() {
        // Drop in-memory state on the live stores too — clearing only
        // UserDefaults left the Observable bookmarks/followed lists
        // populated until the next launch, so the user saw "nothing
        // changed" right after tapping the button.
        bookmarksStore.clear()
        followedKeywords.clear()
        UserDefaults.standard.removeObject(forKey: "sabq_recent_searches")
        ImageCache.clear()
        URLCache.shared.removeAllCachedResponses()
        didClearData = true
    }

    // MARK: - Profile / Auth

    /// Identity card + quick member cards (Loyalty & Press Card).
    private var profileSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            profileHeaderBlock

            if authStore.isLoggedIn {
                memberQuickCards
            }
        }
        .padding(.bottom, SabqLayout.space12)
    }

    private var memberQuickCards: some View {
        HStack(spacing: 10) {
            NavigationLink(value: LoyaltyAccountRoute()) {
                memberQuickCard(
                    title: "نقاطي والمكافآت",
                    subtitle: "تابع مستواك واستبدل نقاطك",
                    icon: "trophy.fill",
                    tint: SabqTheme.primary
                )
            }
            .buttonStyle(.plain)

            NavigationLink(value: PressCardRoute()) {
                memberQuickCard(
                    title: "بطاقتي الصحفية",
                    subtitle: "أضف بطاقتك إلى Apple Wallet",
                    icon: "checkmark.seal.fill",
                    tint: SabqTheme.primary
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func memberQuickCard(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 34, height: 34)
                    .background(SabqTheme.skyTint, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .accessibilityHidden(true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.backward")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
        .contentShape(Rectangle())
    }

    private var profileHeaderBlock: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            if authStore.isLoggedIn, let user = authStore.currentUser {
                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: SabqLayout.space12) {
                            profileIdentity(user: user)
                        }
                    } else {
                        profileIdentity(user: user)
                    }
                }

                if let bio = user.bio, !bio.isEmpty {
                    Text(bio)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if user.emailVerified == false {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(SabqType.meta.font)
                        Text("لم يتم تأكيد البريد الإلكتروني بعد")
                            .sabqText(SabqType.metaEmphasis)
                    }
                    .foregroundStyle(SabqTheme.warning)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                // Profile-completion nudge — computed live from the
                // user's actual fields so the banner stays accurate
                // even for legacy accounts whose stale
                // `isProfileComplete` flag was wrong. Each CTA is
                // gated independently: missing city/gender shows
                // البيانات الشخصية, empty interests shows اهتماماتك,
                // and the whole banner collapses once both are done.
                let needsBasics = !user.hasMinimumBasicProfile
                let needsInterests = !user.hasAtLeastOneInterest
                if needsBasics || needsInterests {
                    VStack(alignment: .leading, spacing: SabqLayout.space12) {
                        HStack(alignment: .top, spacing: SabqLayout.space8) {
                            Image(systemName: "sparkles")
                                .font(SabqType.rowTitle.font)
                                .foregroundStyle(SabqTheme.primary)
                                .accessibilityHidden(true)

                            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                                Text("أكمل بياناتك")
                                    .sabqText(SabqType.rowTitle)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                Text(completionBannerHint(needsBasics: needsBasics, needsInterests: needsInterests))
                                    .sabqText(SabqType.meta)
                                    .foregroundStyle(SabqTheme.textSecondary)
                                    .lineLimit(2)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        HStack(spacing: SabqLayout.space8) {
                            if needsBasics {
                                Button { showEditProfile = true } label: {
                                    completionButtonLabel(
                                        title: "البيانات الشخصية",
                                        icon: "person.text.rectangle",
                                        filled: true
                                    )
                                }
                                .buttonStyle(.plain)
                            }

                            if needsInterests {
                                Button {
                                    // Refresh categories on tap in case the
                                    // initial .task hasn't completed yet
                                    // (cold start, slow network).
                                    if interestsCategories.isEmpty {
                                        interestsCategories = InterestsCategoryCache.shared.get()
                                    }
                                    showInterestsPicker = true
                                } label: {
                                    completionButtonLabel(
                                        title: "اهتماماتك",
                                        icon: "slider.horizontal.3",
                                        filled: !needsBasics
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(SabqLayout.space12)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(SabqTheme.surface)
                    )
                }

                HStack(spacing: SabqLayout.space8) {
                    Button { showEditProfile = true } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "pencil")
                                .font(.system(size: 13, weight: .semibold))
                            Text("تعديل الملف الشخصي")
                                .sabqText(SabqType.metaEmphasis)
                        }
                        .foregroundStyle(SabqTheme.primary)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(SabqTheme.skyTint)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)

                    Button { showChangePassword = true } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "lock.rotation")
                                .font(.system(size: 13, weight: .semibold))
                            Text("كلمة المرور")
                                .sabqText(SabqType.metaEmphasis)
                        }
                        .foregroundStyle(SabqTheme.textSecondary)
                        .padding(.horizontal, SabqLayout.space12)
                        .frame(minHeight: 38)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            } else {
                guestIdentity
                .onTapGesture { showLogin = true }

                Button { showLogin = true } label: {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "arrow.forward.circle.fill")
                            .font(SabqType.button.font)
                        Text("تسجيل الدخول")
                            .sabqText(SabqType.button)
                    }
                    .foregroundStyle(SabqTheme.onAction)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityHint("يفتح شاشة تسجيل الدخول")
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
    }

    /// Primary (filled) or secondary (outlined) button label used by the
    /// profile-completion nudge.
    private func completionButtonLabel(title: String, icon: String, filled: Bool) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqType.meta.font)
            Text(title)
                .sabqText(SabqType.button)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .foregroundStyle(filled ? SabqTheme.onAction : SabqTheme.primary)
        .frame(maxWidth: .infinity)
        .frame(minHeight: SabqLayout.touchTarget)
        .padding(.horizontal, SabqLayout.space8)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(filled ? SabqTheme.actionFill : SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(filled ? Color.clear : SabqTheme.outline, lineWidth: 1)
        )
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var guestIdentity: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    guestAvatar
                    guestCopy
                }
            } else {
                HStack(alignment: .center, spacing: SabqLayout.space12) {
                    guestAvatar
                    guestCopy
                }
            }
        }
    }

    private var guestAvatar: some View {
        Circle()
            .fill(SabqTheme.surface)
            .frame(width: 56, height: 56)
            .overlay {
                Image(systemName: "person.fill")
                    .font(SabqFonts.app(size: 22, weight: .semibold))
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            .accessibilityHidden(true)
    }

    private var guestCopy: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text("حسابك في سبق")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
            Text("احفظ أخبارك وتابع اهتماماتك عبر أجهزتك.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func profileIdentity(user: APIUser) -> some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    profileAvatar(user: user, size: 56)
                    profileDetails(user: user)
                }
            } else {
                HStack(alignment: .top, spacing: SabqLayout.space12) {
                    profileAvatar(user: user, size: 56)
                    profileDetails(user: user)
                }
            }
        }
    }

    @ViewBuilder
    private func profileDetails(user: APIUser) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(user.displayName)
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(SabqTheme.textPrimary)

                    if user.isVerified {
                        Image(systemName: "checkmark.seal.fill")
                            .font(SabqType.excerpt.font)
                            .foregroundStyle(SabqTheme.success)
                            .accessibilityLabel("حساب موثّق")
                    }
                }

                if let email = user.email, !email.isEmpty {
                    Text(email)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            VStack(alignment: .center, spacing: 3) {
                HStack(spacing: 4) {
                    Image(systemName: "person.fill")
                        .font(.system(size: 10, weight: .semibold))
                    Text(user.localizedRole)
                        .sabqText(SabqType.tag)
                }
                .foregroundStyle(SabqTheme.primary)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    Capsule(style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .contentShape(Rectangle())
                #if DEBUG
                .onLongPressGesture(minimumDuration: 0.6) {
                    roleDebugMessage = user.roleDebugSummary
                    showRoleDebug = true
                }
                #endif

                if user.isWriter || user.isReporter || user.isAdminLike || !(user.department ?? "").isEmpty {
                    Text("هيئة التحرير")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.textTertiary)
                        .lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func profileAvatar(user: APIUser, size: CGFloat) -> some View {
        if let avatarURL = user.avatar, let url = URL(string: avatarURL) {
            CachedAsyncImage(url: url, contentMode: .fill) {
                profileInitial(user: user, size: size)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            profileInitial(user: user, size: size)
        }
    }

    private func profileInitial(user: APIUser, size: CGFloat) -> some View {
        Circle()
            .fill(SabqTheme.surface)
            .frame(width: size, height: size)
            .overlay {
                Text(String(user.displayName.prefix(1)))
                    .font(SabqFonts.app(size: size * 0.38, weight: .bold))
                    .foregroundStyle(SabqTheme.primary)
            }
    }

    // MARK: - Editorial & Admin Section

    @ViewBuilder
    private func editorialAndAdminSection(for user: APIUser) -> some View {
        let writerVisible = user.isWriter || user.isAdminLike
        let reporterVisible = user.isReporter || user.isAdminLike
        let hasEditorialOrAdmin = writerVisible || reporterVisible || user.isPlatformAdmin

        if hasEditorialOrAdmin {
            SabqSectionBand()
            SettingsSection(title: "الأدوات التحريرية والإدارة", subtitle: "إدارة المحتوى والمراسلات التحريرية") {
                if user.isPlatformAdmin {
                    NavigationLink(value: AdminDashboardRoute()) {
                        submissionCardContent(
                            title: "لوحة التحكم",
                            subtitle: "إدارة الأخبار والمؤشّرات",
                            icon: "shield.lefthalf.filled",
                            tint: SabqTheme.primary
                        )
                    }
                    .buttonStyle(.plain)
                    SettingsRowDivider()
                }

                if writerVisible || reporterVisible {
                    NavigationLink(value: ContributorDashboardRoute()) {
                        submissionCardContent(
                            title: "لوحة الكاتب",
                            subtitle: "مساحتك من الفكرة إلى النشر — أفكار، مقالات، أداء",
                            icon: "doc.richtext",
                            tint: SabqTheme.primary
                        )
                    }
                    .buttonStyle(.plain)
                    SettingsRowDivider()
                }

                if reporterVisible {
                    submissionCard(
                        title: "إرسال خبر",
                        subtitle: "أرسل خبرك مع الصور — يصل لغرفة الأخبار",
                        icon: "newspaper",
                        tint: SabqTheme.primary
                    ) {
                        submissionKind = .news
                    }
                    SettingsRowDivider()
                }

                if writerVisible {
                    submissionCard(
                        title: "إرسال مقالة للنشر",
                        subtitle: "اكتب رأيك أو مقالتك وسنراجعها للنشر",
                        icon: "square.and.pencil",
                        tint: SabqTheme.primary
                    ) {
                        submissionKind = .opinion
                    }
                    SettingsRowDivider()
                }

                if revisionsStore.count > 0 {
                    NavigationLink(value: ArticleRevisionsRoute()) {
                        submissionCardContent(
                            title: "مقالات تنتظر التعديل",
                            subtitle: "\(revisionsStore.count) مقال بحاجة لإعادة الإرسال",
                            icon: "pencil.and.list.clipboard",
                            tint: SabqTheme.warning,
                            badgeCount: revisionsStore.count
                        )
                    }
                    .buttonStyle(.plain)
                    SettingsRowDivider()
                }

                if writerVisible || reporterVisible {
                    NavigationLink(value: EditorialNotificationsRoute()) {
                        submissionCardContent(
                            title: "إشعاراتي التحريرية",
                            subtitle: "متابعة جدولة ونشر ومراجعة محتواك",
                            icon: "bell.badge",
                            tint: SabqTheme.primary
                        )
                    }
                    .buttonStyle(.plain)
                }

                if user.isPlatformAdmin {
                    if writerVisible || reporterVisible {
                        SettingsRowDivider()
                    }
                    NavigationLink(value: SabqPlusRoute()) {
                        submissionCardContent(
                            title: "سبق بلس (معاينة)",
                            subtitle: "محاكاة الاستبدال عبر ولاء ون",
                            icon: "plus.diamond",
                            tint: SabqTheme.primary
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// Visual shell for a submission-style row — reusable inside Button or
    /// NavigationLink wrappers without nesting tap handlers.
    /// `badgeCount` paints a small numeric chip beside the title for
    /// queue-style rows (e.g. pending revisions).
    private func submissionCardContent(
        title: String,
        subtitle: String,
        icon: String,
        tint: Color,
        badgeCount: Int? = nil
    ) -> some View {
        HStack(alignment: .center, spacing: SabqLayout.space12) {
            SettingsRowIcon(systemImage: icon, tint: tint)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: SabqLayout.space8) {
                    Text(title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let badgeCount, badgeCount > 0 {
                        Text("\(badgeCount)")
                            .sabqText(SabqType.tag)
                            .monospacedDigit()
                            .foregroundStyle(SabqTheme.onAction)
                            .padding(.horizontal, SabqLayout.space8)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(SabqTheme.actionFill))
                    }
                }
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SettingsChevron()
        }
        .padding(.vertical, SabqLayout.space12)
        .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func submissionCard(
        title: String,
        subtitle: String,
        icon: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            submissionCardContent(title: title, subtitle: subtitle, icon: icon, tint: tint)
        }
        .buttonStyle(.plain)
    }

    private var accountDangerSection: some View {
        SettingsSection(title: "منطقة الخطر", subtitle: "إجراءات تخصّ حسابك وبياناتك") {
            Button { showClearDataConfirm = true } label: {
                dangerRow(
                    title: "مسح البيانات المحلية",
                    subtitle: "إزالة المقالات المحفوظة وعمليات البحث والكلمات المتابعة من هذا الجهاز. لن يتأثر حسابك.",
                    icon: "tray.2"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            Button { showDeleteAccount = true } label: {
                dangerRow(
                    title: "حذف الحساب",
                    subtitle: "حذف نهائي لحسابك وكل بياناتك من سبق. لا يمكن التراجع عن هذه الخطوة.",
                    icon: "person.crop.circle.badge.xmark"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            Button { showLogoutConfirm = true } label: {
                dangerRow(
                    title: "تسجيل الخروج",
                    subtitle: "إنهاء جلستك على هذا الجهاز. يمكنك تسجيل الدخول مجددًا في أي وقت.",
                    icon: "rectangle.portrait.and.arrow.right"
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func dangerRow(title: String, subtitle: String, icon: String) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            SettingsRowIcon(systemImage: icon, tint: SabqTheme.danger)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.danger)

                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SettingsChevron()
        }
        .padding(.vertical, SabqLayout.space12)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
    }

    /// Sub-headline copy for the profile-completion banner. Tailored to
    /// exactly which gate the user is missing so the message stays honest
    /// — "اختر اهتماماتك" reads weird if they've already picked some, and
    /// the generic "نقدّم لك تجربة أذكى" is fine for the mixed case.
    private func completionBannerHint(needsBasics: Bool, needsInterests: Bool) -> String {
        switch (needsBasics, needsInterests) {
        case (true, true):
            return "ساعدنا نقدّم لك تجربة شخصية أذكى"
        case (true, false):
            return "أكمل بياناتك الشخصية لتجربة أدق"
        case (false, true):
            return "اختر اهتماماتك لنرشّح لك ما يهمّك"
        case (false, false):
            return ""
        }
    }

    // MARK: - Display

    /// تنبيهات المباريات تصل من فارا وحده؛ الصف يوجّه إليه.
    private var matchAlertsSection: some View {
        SettingsSection {
            NavigationLink(value: ReaderNotificationSettingsRoute()) {
                settingsRow(
                    title: "إعدادات الإشعارات",
                    subtitle: "الملخص اليومي والتوصيات وأوقات الهدوء",
                    icon: "bell.badge"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            NavigationLink(destination: WCMatchEventNotificationsView()) {
                settingsRow(
                    title: "تنبيهات المباريات",
                    subtitle: "تصلك من تطبيق فارا حتى لا تتكرر",
                    icon: "soccerball"
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var browsingExperienceSection: some View {
        SettingsSection(title: "تجربة التصفح", subtitle: "تحكّم بكثافة الواجهة") {
            let lite = LiteModeManager.shared

            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                settingLabel(title: "وضع التصفح", subtitle: lite.browsingMode.arabicSubtitle)

                Picker("وضع التصفح", selection: Bindable(lite).browsingMode) {
                    ForEach(SabqBrowsingMode.allCases) { mode in
                        Text(mode.arabicLabel).tag(mode)
                    }
                }
                .modifier(SabqAdaptivePickerStyle())
            }
            .padding(.vertical, SabqLayout.space12)
        }
    }

    private var analyticsPrivacySection: some View {
        SettingsSection(title: "الخصوصية والبيانات", subtitle: "تحكم في إرسال بيانات الاستخدام لتحسين التطبيق.") {
            Toggle(isOn: Binding(
                get: { analyticsConsent },
                set: {
                    analyticsConsent = $0
                    SabqAnalytics.setAnalyticsConsent($0)
                }
            )) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("تحليلات الاستخدام")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("تساعدنا على تحسين الأخبار، ويمكنك سحب الاختيار في أي وقت.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
            .tint(SabqTheme.actionFill)
            .padding(.vertical, SabqLayout.space12)
            .frame(minHeight: SabqLayout.touchTarget)

            if authStore.isLoggedIn {
                SettingsRowDivider()

                NavigationLink(destination: BlockedUsersView()) {
                    settingsRow(
                        title: "المستخدمون المحظورون",
                        subtitle: "من حظرتهم لا تظهر لك تعليقاتهم",
                        icon: "hand.raised"
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var displaySection: some View {
        SettingsSection(title: "العرض", subtitle: "تخصيص مظهر التطبيق") {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                settingLabel(title: "المظهر", subtitle: "اختر مظهر التطبيق أو اتبع إعداد الجهاز")

                Picker("المظهر", selection: $appearanceRaw) {
                    ForEach(AppAppearance.allCases) { mode in
                        Text(mode.arabicLabel).tag(mode.rawValue)
                    }
                }
                .modifier(SabqAdaptivePickerStyle())
            }
            .padding(.vertical, SabqLayout.space12)

            SettingsRowDivider()

            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                settingLabel(title: "نمط بطاقات الأخبار", subtitle: "اختر شكل عرض الأخبار في الواجهة")

                Picker("نمط البطاقة", selection: $cardStyleRaw) {
                    Text("موسّع").tag("spacious")
                    Text("كلاسيكي").tag("classic")
                }
                .modifier(SabqAdaptivePickerStyle())
            }
            .padding(.vertical, SabqLayout.space12)

            SettingsRowDivider()

            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                HStack(alignment: .center) {
                    settingLabel(title: "حجم الخط", subtitle: "تحكّم بحجم النص داخل المقالات")
                    Spacer(minLength: 0)
                    Text("\(Int(textSize)) نقطة")
                        .sabqText(SabqType.tag)
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule(style: .continuous).fill(SabqTheme.skyTint))
                }

                HStack(spacing: SabqLayout.space12) {
                    Text("أ")
                        .font(SabqFonts.app(size: 13, weight: .medium))
                        .foregroundStyle(SabqTheme.textTertiary)

                    Slider(value: $textSize, in: 14...24, step: 1)
                        .accessibilityLabel("حجم خط المقالات")
                        .accessibilityValue("\(Int(textSize)) نقطة")
                        .tint(SabqTheme.primary)

                    Text("أ")
                        .font(SabqFonts.app(size: 22, weight: .bold))
                        .foregroundStyle(SabqTheme.textPrimary)
                }

                Text("معاينة حجم الخط في المقالات الإخبارية لتجربة قراءة مريحة وواضحة.")
                    .font(SabqFonts.app(size: CGFloat(textSize), weight: .regular))
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineSpacing(5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(SabqLayout.space12)
                    .sabqBlockSurface()
            }
            .padding(.vertical, SabqLayout.space12)
        }
    }

    // MARK: - Subscription

    private var subscriptionSection: some View {
        SettingsSection(title: "اشتراكات", subtitle: "ابقَ على اطلاع دائم") {
            Button { showNewsletter = true } label: {
                settingsRow(
                    title: "النشرة البريدية",
                    subtitle: "اشترك في ملخص الأخبار اليومي",
                    icon: "envelope.open"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            NavigationLink(value: MyKeywordsRoute()) {
                settingsRow(
                    title: "كلماتي",
                    subtitle: followedKeywords.followed.isEmpty
                        ? "تابع الكلمات المفتاحية لتصلك أخبارها"
                        : "تتابع \(followedKeywords.followed.count.formatted()) كلمة",
                    icon: "number"
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        SettingsSection(title: "عن سبق", subtitle: "صحيفة إلكترونية سعودية") {
            (Text("سبق.. حيث يلتقي الخبر الموثوق بذكاء المستقبل ")
             + Text(Image(systemName: "sparkles"))
                .foregroundStyle(SabqTheme.primary)
             + Text(". تغطية لحظية لا تتوقف، بتقنيات الذكاء الاصطناعي وأقلام محررين من قلب الحدث."))
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, SabqLayout.space8)

            SettingsRowDivider()

            NavigationLink(value: SabqAIRoute()) {
                settingsRow(
                    title: "عقل سبق",
                    subtitle: "منظومة الذكاء في سبق وفريقها الرقمي — والقرار للمحرر",
                    icon: "brain"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            NavigationLink(destination: PrivacyPolicyView()) {
                settingsRow(
                    title: "خصوصيتك أولاً",
                    subtitle: "كيف نحمي بياناتك الشخصية؟",
                    icon: "shield.lefthalf.filled"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            NavigationLink(destination: TermsOfUseView()) {
                settingsRow(
                    title: "شروط الاستخدام",
                    subtitle: "اعرف حقوقك وحقوقنا",
                    icon: "doc.text"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            Link(destination: URL(string: URLConstants.webOrigin)!) {
                settingsRow(
                    title: "اقرأ أكثر على موقعنا",
                    subtitle: "sabq.org",
                    icon: "globe"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            Link(destination: URL(string: "https://x.com/sabqorg")!) {
                settingsRow(
                    title: "تابعنا على إكس",
                    subtitle: "@sabqorg آخر الأخبار لحظة بلحظة",
                    icon: "at"
                )
            }
            .buttonStyle(.plain)

            SettingsRowDivider()

            Button { showContact = true } label: {
                settingsRow(
                    title: "راسلنا",
                    subtitle: "آراؤك تهمنا، نرد في أقرب وقت",
                    icon: "envelope"
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - App Info

    private var appInfoSection: some View {
        VStack(spacing: SabqLayout.space16) {
            SabqBrandLogo(height: 56)

            // Reads CFBundleShortVersionString + CFBundleVersion from the
            // bundle's Info.plist so the displayed version always matches
            // what's actually shipping — no more hard-coded "1.0.0".
            Text(Self.versionLabel)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textTertiary)

            Text("صنع بكل حب في السعودية 🇸🇦")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space32)
        .padding(.bottom, SabqLayout.space24)
    }

    // MARK: - Helpers

    private func settingLabel(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text(title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(subtitle)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func settingsRow(title: String, subtitle: String, icon: String) -> some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    settingsRowContent(title: title, subtitle: subtitle, icon: icon)
                }
            } else {
                HStack(alignment: .center, spacing: SabqLayout.space12) {
                    settingsRowContent(title: title, subtitle: subtitle, icon: icon)
                }
            }
        }
        .padding(.vertical, SabqLayout.space12)
        .frame(minHeight: SabqLayout.touchTarget, alignment: .leading)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func settingsRowContent(title: String, subtitle: String, icon: String) -> some View {
        SettingsRowIcon(systemImage: icon, tint: SabqTheme.primary)

        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)

            Text(subtitle)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        SettingsChevron()
    }
}

// MARK: - Grouped-row building blocks

/// A section on the white page: a 20pt heading, optional meta subtitle,
/// then rows separated by thin lines. Sections are not boxed.
private struct SettingsSection<Content: View>: View {
    var title: String?
    var subtitle: String?
    @ViewBuilder var content: Content

    init(title: String? = nil, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(title)
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    if let subtitle {
                        Text(subtitle)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, SabqLayout.space4)
            }
            content
        }
        .padding(.vertical, SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Thin line between rows of a section.
private struct SettingsRowDivider: View {
    var body: some View {
        Rectangle()
            .fill(SabqTheme.separator)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// Rounded-square icon badge for a settings row.
private struct SettingsRowIcon: View {
    let systemImage: String
    let tint: Color

    var body: some View {
        Image(systemName: systemImage)
            .font(SabqFonts.app(size: 15, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 34, height: 34)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(tint == SabqTheme.primary ? SabqTheme.skyTint : tint.opacity(0.12))
            )
            .accessibilityHidden(true)
    }
}

private struct SettingsChevron: View {
    var body: some View {
        Image(systemName: "chevron.forward")
            .font(SabqType.meta.font)
            .foregroundStyle(SabqTheme.textTertiary)
            .frame(height: 24)
            .accessibilityHidden(true)
    }
}
