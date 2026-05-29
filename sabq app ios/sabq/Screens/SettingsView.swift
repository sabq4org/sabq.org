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

    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(AuthStore.self) private var authStore
    /// Pending-revision count drives the "مقالات تنتظر التعديل" card
    /// visibility inside `submissionCards(for:)`.
    @Environment(ArticleRevisionsStore.self) private var revisionsStore
    @Environment(FollowedKeywordsStore.self) private var followedKeywords
    @AppStorage("appAppearance") private var appearanceRaw: String = AppAppearance.system.rawValue
    @AppStorage("articleFontSize") private var textSize: Double = 17
    @AppStorage("appAccent") private var accentRaw: String = AppAccent.blue.rawValue
    @AppStorage("homeCardStyle") private var cardStyleRaw: String = "classic"
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
            VStack(alignment: .leading, spacing: 20) {
                CompactScreenHeader(
                    title: "المزيد",
                    subtitle: "إعدادات التطبيق وعن سبق"
                )

                profileSection
                if authStore.isLoggedIn {
                    if let user = authStore.currentUser, user.isWriter || user.isReporter || user.isAdminLike {
                        contributorDashboardEntrySection
                    }
                    loyaltyEntrySection
                    pressCardEntrySection
                }
                displaySection
                browsingExperienceSection
                subscriptionSection
                aboutSection
                if authStore.isLoggedIn {
                    accountDangerSection
                }
                appInfoSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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
    /// dark mode, or the accent colour — those are explicit user
    /// settings that aren't considered "data" for this control.
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

    private var profileSection: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            if authStore.isLoggedIn, let user = authStore.currentUser {
                VStack(spacing: 16) {
                    HStack(spacing: 14) {
                        profileAvatar(user: user, size: 64)

                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Text(user.displayName)
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundStyle(SabqTheme.ink)

                                if user.isVerified {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(.system(size: 14))
                                        .foregroundStyle(SabqTheme.primaryEnd)
                                }
                            }

                            HStack(spacing: 6) {
                                Image(systemName: roleIcon(for: user.primaryRoleKey))
                                    .font(.system(size: 11))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                                Text(user.localizedRole)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                            }
                            // Long-press the role label to surface the raw
                            // role-payload the backend sent. Temporary
                            // diagnostic for the "قارئ" mismatch report.
                            .contentShape(Rectangle())
                            .onLongPressGesture(minimumDuration: 0.6) {
                                roleDebugMessage = user.roleDebugSummary
                                showRoleDebug = true
                            }

                            if let email = user.email, !email.isEmpty {
                                Text(email)
                                    .font(.system(size: 12, weight: .regular))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let jobTitle = user.jobTitle, !jobTitle.isEmpty, jobTitle != user.localizedRole {
                        HStack(spacing: 8) {
                            Image(systemName: "briefcase.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                            Text(jobTitle)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(SabqTheme.secondaryInk)
                            if let dept = user.department, !dept.isEmpty {
                                Text("·")
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                                Text(dept)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let bio = user.bio, !bio.isEmpty {
                        Text(bio)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineSpacing(4)
                            .lineLimit(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if user.emailVerified == false {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 13))
                            Text("لم يتم تأكيد البريد الإلكتروني بعد")
                                .font(.system(size: 13, weight: .medium))
                        }
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color.orange.opacity(0.08))
                        )
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
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 12) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                                    .frame(width: 32, height: 32)
                                    .background(
                                        Circle()
                                            .fill(SabqTheme.primaryEnd.opacity(0.12))
                                    )

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("أكمل بياناتك")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundStyle(SabqTheme.ink)
                                    Text(completionBannerHint(needsBasics: needsBasics, needsInterests: needsInterests))
                                        .font(.system(size: 12, weight: .regular))
                                        .foregroundStyle(SabqTheme.secondaryInk)
                                        .lineLimit(2)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }

                            HStack(spacing: 8) {
                                if needsBasics {
                                    Button { showEditProfile = true } label: {
                                        HStack(spacing: 6) {
                                            Image(systemName: "person.text.rectangle")
                                                .font(.system(size: 12, weight: .semibold))
                                            Text("البيانات الشخصية")
                                                .font(.system(size: 13, weight: .semibold))
                                        }
                                        .foregroundStyle(.white)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 9)
                                        .background(
                                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                                .fill(SabqTheme.primaryEnd)
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
                                        HStack(spacing: 6) {
                                            Image(systemName: "slider.horizontal.3")
                                                .font(.system(size: 12, weight: .semibold))
                                            Text("اهتماماتك")
                                                .font(.system(size: 13, weight: .semibold))
                                        }
                                        .foregroundStyle(needsBasics ? SabqTheme.primaryEnd : .white)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 9)
                                        .background(
                                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                                .fill(needsBasics ? SabqTheme.primaryEnd.opacity(0.10) : SabqTheme.primaryEnd)
                                        )
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                                .stroke(needsBasics ? SabqTheme.primaryEnd.opacity(0.35) : Color.clear, lineWidth: 1)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(SabqTheme.primaryEnd.opacity(0.06))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 1)
                        )
                    }

                    HStack(spacing: 10) {
                        Button { showEditProfile = true } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "pencil")
                                    .font(.system(size: 13, weight: .semibold))
                                Text("تعديل الملف الشخصي")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundStyle(SabqTheme.primaryEnd)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(
                                Capsule().fill(SabqTheme.primaryEnd.opacity(0.1))
                            )
                        }
                        .buttonStyle(.plain)

                        Spacer()
                    }

                    // Role-gated submission cards. Visible only when the
                    // signed-in user has writer / reporter / admin-like
                    // roles. Writers see opinion submission, reporters see
                    // news submission, admin-likes see both.
                    submissionCards(for: user)

                    accountActionsSection
                }
            } else {
                HStack(spacing: 14) {
                    Circle()
                        .fill(SabqTheme.primaryEnd.opacity(0.1))
                        .frame(width: 56, height: 56)
                        .overlay {
                            Image(systemName: "person.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(SabqTheme.primaryEnd)
                        }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("تسجيل الدخول")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("سجّل دخولك لتجربة شخصية أفضل")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onTapGesture { showLogin = true }

                Button { showLogin = true } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 16))
                        Text("تسجيل الدخول")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
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
            .fill(SabqTheme.primaryEnd.opacity(0.15))
            .frame(width: size, height: size)
            .overlay {
                Text(String(user.displayName.prefix(1)))
                    .font(.system(size: size * 0.38, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    // MARK: - Submission cards (writers + reporters)

    /// Renders the "send to editorial" entry-point cards inside the profile
    /// section. Visibility is role-gated:
    /// - Writers (opinion_author / columnist / article_author / writer /
    ///   author): "إرسال مقالة للنشر"
    /// - Reporters (reporter / correspondent / journalist): "إرسال خبر"
    /// - Admin / editor roles see both — they may submit either kind.
    /// Regular readers see nothing.
    @ViewBuilder
    private func submissionCards(for user: APIUser) -> some View {
        let writerVisible = user.isWriter || user.isAdminLike
        let reporterVisible = user.isReporter || user.isAdminLike

        if writerVisible || reporterVisible {
            VStack(spacing: 10) {
                if writerVisible {
                    submissionCard(
                        title: "إرسال مقالة للنشر",
                        subtitle: "اكتب رأيك أو مقالتك وسنراجعها للنشر",
                        icon: "square.and.pencil",
                        tint: SabqTheme.primaryEnd
                    ) {
                        submissionKind = .opinion
                    }
                }
                if reporterVisible {
                    submissionCard(
                        title: "إرسال خبر",
                        subtitle: "أرسل خبرك مع الصور — يصل لغرفة الأخبار",
                        icon: "newspaper.fill",
                        tint: SabqTheme.coral
                    ) {
                        submissionKind = .news
                    }
                }

                // Revision queue — surfaces only when the editor sent
                // articles back for changes. Tapping opens the list of
                // pending revisions, each of which leads to the
                // ArticleRevisionView form.
                if revisionsStore.count > 0 {
                    NavigationLink(value: ArticleRevisionsRoute()) {
                        submissionCardContent(
                            title: "مقالات تنتظر التعديل",
                            subtitle: "\(revisionsStore.count) مقال بحاجة لإعادة الإرسال",
                            icon: "pencil.and.list.clipboard",
                            tint: RevisionPalette.accent,
                            badgeCount: revisionsStore.count
                        )
                    }
                    .buttonStyle(.plain)
                }

                // Editorial notification center for writers/reporters/admins
                // — shows scheduled / published / rejected / needs_revision
                // events on their submissions. Uses the value-based form
                // so this push is recorded in ContentView's
                // `navigationPath` — without that, the floating tab bar
                // couldn't pop the screen (selectedTab changed but the
                // pushed view stayed on the stack).
                NavigationLink(value: EditorialNotificationsRoute()) {
                    submissionCardContent(
                        title: "إشعاراتي التحريرية",
                        subtitle: "متابعة جدولة ونشر ومراجعة محتواك",
                        icon: "bell.badge.fill",
                        tint: SabqTheme.teal
                    )
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 4)
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
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(tint.opacity(0.14))
                    .frame(width: 44, height: 44)
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(tint)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                    if let badgeCount, badgeCount > 0 {
                        Text("\(badgeCount)")
                            .font(.system(size: 11, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(tint))
                    }
                }
                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.left")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(tint.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.20), lineWidth: 0.5)
        )
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

    @ViewBuilder
    private var accountActionsSection: some View {
        VStack(spacing: 0) {
            Divider()
                .padding(.vertical, 4)

            Button { showChangePassword = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "lock.rotation")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .frame(width: 20)
                    Text("تغيير كلمة المرور")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                    Spacer()
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
        }
    }

    private var accountDangerSection: some View {
        SurfaceCard(accent: SabqTheme.coral) {
            SectionHeader(
                title: "منطقة الخطر",
                subtitle: "إجراءات تخصّ حسابك وبياناتك",
                icon: "exclamationmark.triangle.fill",
                tint: SabqTheme.coral
            )

            Button { showClearDataConfirm = true } label: {
                dangerRow(
                    title: "مسح البيانات المحلية",
                    subtitle: "إزالة المقالات المحفوظة وعمليات البحث والكلمات المتابعة من هذا الجهاز. لن يتأثر حسابك.",
                    icon: "tray.2.fill"
                )
            }
            .buttonStyle(.plain)

            Button { showDeleteAccount = true } label: {
                dangerRow(
                    title: "حذف الحساب",
                    subtitle: "حذف نهائي لحسابك وكل بياناتك من سبق. لا يمكن التراجع عن هذه الخطوة.",
                    icon: "person.crop.circle.badge.xmark"
                )
            }
            .buttonStyle(.plain)

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
        HStack(spacing: 12) {
            SmallSquareBadge(systemImage: icon, tint: SabqTheme.coral)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.coral)

                Text(subtitle)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "chevron.left")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(.vertical, 3)
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

    private func roleIcon(for role: String?) -> String {
        switch role {
        case "admin": return "shield.fill"
        case "system_admin": return "shield.lefthalf.filled"
        case "editor", "editor-in-chief", "editor_in_chief", "senior-editor", "senior_editor", "managing_editor", "managing-editor", "editorial_manager", "editorial-manager": return "pencil.circle.fill"
        case "journalist", "reporter", "correspondent", "writer", "author", "article_writer", "article-writer", "article_author", "article-author", "opinion_author", "opinion-author": return "newspaper.fill"
        case "columnist": return "text.quote"
        case "photographer": return "camera.fill"
        case "moderator", "comments_moderator", "comments-moderator": return "flag.fill"
        case "publisher": return "megaphone.fill"
        case "contributor": return "person.text.rectangle"
        default: return "person.fill"
        }
    }

    // MARK: - Loyalty entry

    // MARK: - Contributor Dashboard entry

    private var contributorDashboardEntrySection: some View {
        NavigationLink(value: ContributorDashboardRoute()) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(red: 0.30, green: 0.69, blue: 0.31).opacity(0.14))
                        .frame(width: 44, height: 44)
                    Image(systemName: "chart.bar.xaxis.ascending")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Color(red: 0.30, green: 0.69, blue: 0.31))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("مركز الأداء")
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                    Text("إحصائيات مقالاتك وتفاعل جمهورك")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.backward")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    // Quick-tap row that pushes LoyaltyAccountView. Sits right under
    // profileSection so signed-in users see their loyalty surface before
    // the display/subscription rows. Avoids duplicating the full hero
    // card here — that lives inside LoyaltyAccountView.
    private var loyaltyEntrySection: some View {
        NavigationLink(value: LoyaltyAccountRoute()) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.14))
                        .frame(width: 44, height: 44)
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Color(red: 0.96, green: 0.62, blue: 0.04))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("نقاطي والمكافآت")
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                    Text("تابع مستواك واستبدل نقاطك")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.backward")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Press card entry

    // Shown to every signed-in user; the row itself is harmless for
    // non-eligible users — tapping it surfaces the server's "غير مصرّح
    // لك" message inside PressCardActivationView rather than silently
    // hiding the feature.
    private var pressCardEntrySection: some View {
        NavigationLink(value: PressCardRoute()) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(red: 0.11, green: 0.64, blue: 0.94).opacity(0.14))
                        .frame(width: 44, height: 44)
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Color(red: 0.11, green: 0.64, blue: 0.94))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("بطاقتي الصحفية")
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                    Text("أضف بطاقتك إلى Apple Wallet")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.backward")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Display


    private var browsingExperienceSection: some View {
        SurfaceCard {
            SectionHeader(
                title: "تجربة التصفح",
                subtitle: "تحكّم بكثافة الواجهة",
                icon: "bolt.fill",
                tint: SabqTheme.primaryEnd
            )

            let lite = LiteModeManager.shared

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("وضع التصفح")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Text(lite.browsingMode.arabicSubtitle)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    Spacer(minLength: 0)
                    SmallSquareBadge(systemImage: "bolt.fill", tint: SabqTheme.primaryEnd)
                }

                Picker("وضع التصفح", selection: Bindable(lite).browsingMode) {
                    ForEach(SabqBrowsingMode.allCases) { mode in
                        Text(mode.arabicLabel).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var displaySection: some View {
        SurfaceCard {
            SectionHeader(
                title: "العرض",
                subtitle: "تخصيص مظهر التطبيق",
                icon: "paintbrush.fill",
                tint: SabqTheme.primaryEnd
            )

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("المظهر")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("اختر مظهر التطبيق أو اتبع إعداد الجهاز")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    Spacer(minLength: 0)
                    SmallSquareBadge(systemImage: "moon.fill", tint: SabqTheme.primaryEnd)
                }

                Picker("المظهر", selection: $appearanceRaw) {
                    ForEach(AppAppearance.allCases) { mode in
                        Text(mode.arabicLabel).tag(mode.rawValue)
                    }
                }
                .pickerStyle(.segmented)
            }


            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("نمط بطاقات الأخبار")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("اختر شكل عرض الأخبار في الواجهة")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    Spacer(minLength: 0)
                    SmallSquareBadge(systemImage: "rectangle.stack.fill", tint: SabqTheme.primaryEnd)
                }

                Picker("نمط البطاقة", selection: $cardStyleRaw) {
                    Text("موسّع").tag("spacious")
                    Text("كلاسيكي").tag("classic")
                }
                .pickerStyle(.segmented)
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("لون التطبيق")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                HStack(spacing: 0) {
                    ForEach(AppAccent.allCases) { accent in
                        let isSelected = accentRaw == accent.rawValue
                        Button {
                            withAnimation(.spring(response: 0.3)) {
                                accentRaw = accent.rawValue
                            }
                        } label: {
                            VStack(spacing: 8) {
                                Circle()
                                    .fill(accent.color)
                                    .frame(width: 40, height: 40)
                                    .overlay(
                                        Circle()
                                            .stroke(Color.white, lineWidth: isSelected ? 3 : 0)
                                    )
                                    .overlay(
                                        Circle()
                                            .stroke(isSelected ? accent.color : Color.clear, lineWidth: isSelected ? 2 : 0)
                                            .padding(-3)
                                    )
                                    .shadow(color: accent.color.opacity(isSelected ? 0.4 : 0.15), radius: isSelected ? 6 : 3, y: 2)

                                Text(accent.title)
                                    .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                                    .foregroundStyle(isSelected ? accent.color : SabqTheme.tertiaryInk)
                            }
                        }
                        .buttonStyle(.plain)
                        .frame(maxWidth: .infinity)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("حجم الخط")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)

                        Text("حجم النص: \(Int(textSize))")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }

                    Spacer(minLength: 0)

                    SmallSquareBadge(systemImage: "textformat.size", tint: SabqTheme.primaryEnd)
                }

                HStack(spacing: 12) {
                    Text("أ")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(SabqTheme.tertiaryInk)

                    Slider(value: $textSize, in: 14...24, step: 1)
                        .tint(SabqTheme.primaryEnd)

                    Text("أ")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }

                Text("معاينة حجم الخط في المقالات")
                    .font(.system(size: CGFloat(textSize), weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(5)
                    .padding(.top, 4)
            }
        }
    }

    // MARK: - Subscription

    private var subscriptionSection: some View {
        SurfaceCard(accent: SabqTheme.teal) {
            SectionHeader(
                title: "اشتراكات",
                subtitle: "ابقَ على اطلاع دائم",
                icon: "envelope.fill",
                tint: SabqTheme.teal
            )

            Button { showNewsletter = true } label: {
                settingsRow(
                    title: "النشرة البريدية",
                    subtitle: "اشترك في ملخص الأخبار اليومي",
                    icon: "envelope.open.fill",
                    tint: SabqTheme.teal
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            SectionHeader(
                title: "عن سبق",
                subtitle: "صحيفة إلكترونية سعودية",
                icon: "info.circle.fill",
                tint: SabqTheme.primaryEnd
            )

            (Text("سبق.. حيث يلتقي الخبر الموثوق بذكاء المستقبل ")
             + Text(Image(systemName: "sparkles"))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
             + Text(". تغطية لحظية لا تتوقف، بتقنيات الذكاء الاصطناعي وأقلام محررين من قلب الحدث."))
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.leading)
                .lineSpacing(5)

            NavigationLink(destination: PrivacyPolicyView()) {
                settingsRow(
                    title: "خصوصيتك أولاً",
                    subtitle: "كيف نحمي بياناتك الشخصية؟",
                    icon: "shield.lefthalf.filled",
                    tint: SabqTheme.leaf
                )
            }
            .buttonStyle(.plain)

            NavigationLink(destination: TermsOfUseView()) {
                settingsRow(
                    title: "شروط الاستخدام",
                    subtitle: "اعرف حقوقك وحقوقنا",
                    icon: "doc.text.fill",
                    tint: SabqTheme.sky
                )
            }
            .buttonStyle(.plain)

            Link(destination: URL(string: URLConstants.webOrigin)!) {
                settingsRow(
                    title: "اقرأ أكثر على موقعنا",
                    subtitle: "sabq.org",
                    icon: "globe",
                    tint: SabqTheme.primaryEnd
                )
            }
            .buttonStyle(.plain)

            Link(destination: URL(string: "https://x.com/sabqorg")!) {
                settingsRow(
                    title: "تابعنا على إكس",
                    subtitle: "@sabqorg آخر الأخبار لحظة بلحظة",
                    icon: "at",
                    tint: SabqTheme.sky
                )
            }
            .buttonStyle(.plain)

            Button { showContact = true } label: {
                settingsRow(
                    title: "راسلنا",
                    subtitle: "آراؤك تهمنا، نرد في أقرب وقت",
                    icon: "envelope.fill",
                    tint: SabqTheme.teal
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - App Info

    private var appInfoSection: some View {
        VStack(spacing: 16) {
            Image("SabqLogo")
                .renderingMode(.original)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 56)

            // Reads CFBundleShortVersionString + CFBundleVersion from the
            // bundle's Info.plist so the displayed version always matches
            // what's actually shipping — no more hard-coded "1.0.0".
            Text(Self.versionLabel)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)

            Text("صنع بكل حب في السعودية 🇸🇦")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 10)
        .padding(.bottom, 20)
    }

    // MARK: - Helpers

    private func settingsToggle(title: String, subtitle: String, icon: String, tint: Color, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Toggle("", isOn: isOn)
                .tint(SabqTheme.primaryEnd)
                .labelsHidden()
        }
    }

    private func settingsRow(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            SmallSquareBadge(systemImage: icon, tint: tint)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "chevron.left")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(.vertical, 3)
    }
}

// MARK: - Login Sheet

struct LoginSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    /// Legacy register form is gone — kept the flag only to honour the
    /// `LoginSheet(initialMode: true)` callers (DailyBriefView CTAs). When
    /// true on appear we immediately swap to the conversational signup.
    @State private var isRegisterMode: Bool
    @State private var showForgotPassword = false
    @State private var showAISignUp = false

    init(initialMode: Bool = false) {
        _isRegisterMode = State(initialValue: initialMode)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if authStore.registrationPending {
                        registrationSuccessView
                    } else {
                        loginFormView
                    }
                }
                .padding(24)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        authStore.clearMessages()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .sheet(isPresented: $showForgotPassword) {
                ForgotPasswordSheet()
            }
            .sheet(isPresented: $showAISignUp, onDismiss: {
                // Conversational signup auto-logs the user in. If it
                // succeeded, close this login sheet too so the user lands
                // back on the dashboard logged in.
                if authStore.isLoggedIn {
                    dismiss()
                }
            }) {
                SignUpFlowView()
                    .environment(authStore)
            }
            .onAppear {
                // Callers that wanted the register form (initialMode=true)
                // now skip straight to the conversational signup sheet.
                if isRegisterMode {
                    isRegisterMode = false
                    showAISignUp = true
                }
            }
        }
    }

    private var registrationSuccessView: some View {
        VStack(spacing: 20) {
            Spacer().frame(height: 40)

            Image(systemName: "envelope.badge.shield.half.filled")
                .font(.system(size: 60, weight: .light))
                .foregroundStyle(SabqTheme.leaf)

            Text("تم إنشاء الحساب")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.ink)

            Text(authStore.successMessage ?? "يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(5)

            Button {
                authStore.clearMessages()
                isRegisterMode = false
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 16))
                    Text("تسجيل الدخول")
                        .font(.system(size: 16, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
    }

    private var loginFormView: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(spacing: 12) {
                Image("SabqLogo")
                    .renderingMode(.original)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 48)

                Text("تسجيل الدخول")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)

                Text("سجّل دخولك للاستفادة من جميع الميزات")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)

            SocialAuthButtons(onSuccess: { dismiss() })

            VStack(spacing: 16) {
                inputField(icon: "envelope", placeholder: "البريد الإلكتروني", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                inputField(icon: "lock", placeholder: "كلمة المرور", text: $password, isSecure: true)
                    .textContentType(.password)
            }

            if let error = authStore.errorMessage {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 14))
                        Text(error)
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.coral)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    // Account is pending activation — offer to resend
                    // the activation email so the user can finish
                    // verifying without leaving the login sheet.
                    if authStore.pendingActivationUserId != nil
                        || authStore.pendingActivationEmail != nil {
                        Button {
                            Task { await authStore.resendActivation() }
                        } label: {
                            HStack(spacing: 6) {
                                if authStore.isResendingActivation {
                                    ProgressView()
                                        .controlSize(.mini)
                                        .tint(SabqTheme.coral)
                                } else {
                                    Image(systemName: "envelope.arrow.triangle.branch")
                                        .font(.system(size: 12, weight: .bold))
                                }
                                Text("إعادة إرسال رمز التفعيل")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundStyle(SabqTheme.coral)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(SabqTheme.coral.opacity(0.35), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(authStore.isResendingActivation)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(SabqTheme.coral.opacity(0.08))
                )
            }

            if let success = authStore.successMessage,
               authStore.pendingActivationEmail != nil || authStore.pendingActivationUserId != nil {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14))
                    Text(success)
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundStyle(SabqTheme.leaf)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(SabqTheme.leaf.opacity(0.10))
                )
            }

            Button {
                Task {
                    await authStore.login(email: email, password: password)
                    if authStore.isLoggedIn { dismiss() }
                }
            } label: {
                HStack(spacing: 10) {
                    if authStore.isLoading {
                        ProgressView().tint(.white)
                    }
                    Text("تسجيل الدخول")
                        .font(.system(size: 17, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(authStore.isLoading)

            Button {
                authStore.clearMessages()
                showAISignUp = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 12, weight: .heavy))
                    Text("ليس لديك حساب؟ ابدأ التسجيل مع SABQ AI")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)

            Button { showForgotPassword = true } label: {
                Text("نسيت كلمة المرور؟")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
        }
    }

    private func inputField(icon: String, placeholder: String, text: Binding<String>, isSecure: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.6))
                .frame(width: 20)

            if isSecure {
                SecureField(placeholder, text: text)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
            } else {
                TextField(placeholder, text: text)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(SabqTheme.paleFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 0.5)
        )
    }
}

// MARK: - Contact Sheet

/// Contact form that mirrors sabq.org/contact end-to-end:
/// - Two contact-method cards at the top (WhatsApp + Email) for users who
///   prefer those channels over the form.
/// - 5-field form (name/phone/email/subject/message) submitted to
///   `POST /api/contact` (NOT under /api/v1), with messages landing in the
///   dashboard's "رسائل التواصل" inbox.
/// - `@FocusState` + `ScrollViewReader` ensures the focused field is always
///   above the keyboard, with `scrollDismissesKeyboard(.interactively)` so
///   the user can swipe to hide it.
/// - Submit errors auto-dismiss the keyboard and scroll the banner into view.
struct ContactSheet: View {
    /// Logical IDs for each scroll anchor — the focus listener uses these to
    /// scroll the active field above the keyboard.
    private enum Field: Hashable {
        case name, phone, email, subject, message, errorBanner
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var name = ""
    @State private var phone = "+966"
    @State private var email = ""
    @State private var subject: String = ""
    @State private var message = ""
    @State private var isSending = false
    @State private var isSent = false
    @State private var errorMessage: String?

    /// Tracks which form field has focus. We watch this and use a
    /// ScrollViewReader to bring the active field above the keyboard.
    @FocusState private var focusedField: Field?

    /// Canonical subjects — MUST match the backend Zod enum exactly, otherwise
    /// the POST returns 400 "بيانات غير صالحة". See `server/routes.ts` contact
    /// schema at the /api/contact handler.
    private static let subjectOptions = [
        "استفسار عام",
        "شراكات إعلامية",
        "شكوى",
        "اقتراح",
        "أخرى"
    ]

    /// Canonical contact methods — mirrors the two cards at the top of
    /// sabq.org/contact.
    private let whatsAppNumber = "+966 500 226 622"
    private let whatsAppURL = URL(string: "https://wa.me/966500226622")!
    private let supportEmail = "info@sabq.org"
    private var emailURL: URL { URL(string: "mailto:\(supportEmail)")! }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedMessage: String { message.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedPhone: String { phone.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Local mirror of the backend Zod constraints so we surface validation
    /// errors immediately instead of waiting on a round trip.
    private var isFormValid: Bool {
        guard trimmedName.count >= 2 else { return false }
        guard trimmedPhone.range(of: #"^\+966[0-9]{9}$"#, options: .regularExpression) != nil else { return false }
        guard trimmedEmail.contains("@"), trimmedEmail.contains(".") else { return false }
        guard Self.subjectOptions.contains(subject) else { return false }
        guard trimmedMessage.count >= 10 else { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    // Outer column: page header → contact-method cards →
                    // (visual gap) → form card. The form lives inside its
                    // own SurfaceCard with a separate SectionHeader so it
                    // reads as a distinct "send a message" surface, clearly
                    // separated from the quick-channel cards above.
                    VStack(alignment: .leading, spacing: 24) {
                        SectionHeader(
                            title: "تواصل معنا",
                            subtitle: "اختر طريقة التواصل الأنسب لك",
                            icon: "envelope.fill",
                            tint: SabqTheme.teal
                        )

                        // Two contact-method cards at the top — matches the
                        // web /contact page. Tapping opens WhatsApp / Mail.
                        contactMethodCards

                        // Extra breathing room above the form so the cards
                        // feel like their own row, not a header for the form.
                        Color.clear.frame(height: 8)

                        if isSent {
                            SurfaceCard(accent: SabqTheme.leaf) {
                                EmptyStateView(
                                    icon: "checkmark.circle.fill",
                                    tint: SabqTheme.leaf,
                                    title: "تم استلام رسالتك",
                                    subtitle: "شكراً لتواصلك معنا، سيتم الرد عليك قريباً"
                                )
                            }
                        } else {
                            SurfaceCard(accent: SabqTheme.primaryEnd) {
                                VStack(alignment: .leading, spacing: 16) {
                                    SectionHeader(
                                        title: "أرسل رسالة",
                                        subtitle: "املأ النموذج وسنرد عليك في أقرب وقت",
                                        icon: "square.and.pencil",
                                        tint: SabqTheme.primaryEnd
                                    )

                                    if let errorMessage {
                                        errorBanner(errorMessage)
                                            .id(Field.errorBanner)
                                    }

                                    labeledField(
                                        label: "الاسم الكامل",
                                        placeholder: "أدخل اسمك الكامل",
                                        text: $name,
                                        field: .name
                                    )
                                    .id(Field.name)

                                    labeledField(
                                        label: "رقم الهاتف",
                                        placeholder: "+966500000000",
                                        text: $phone,
                                        keyboard: .phonePad,
                                        disableAutocap: true,
                                        field: .phone
                                    )
                                    .id(Field.phone)

                                    labeledField(
                                        label: "البريد الإلكتروني",
                                        placeholder: "example@email.com",
                                        text: $email,
                                        keyboard: .emailAddress,
                                        disableAutocap: true,
                                        field: .email
                                    )
                                    .id(Field.email)

                                    subjectPicker
                                        .id(Field.subject)

                                    messageEditor
                                        .id(Field.message)

                                    sendButton
                                        .padding(.top, 4)
                                }
                            }

                            // Trailing spacer so the message editor's bottom
                            // edge can clear the keyboard when focused near
                            // the bottom of the sheet.
                            Color.clear.frame(height: 80)
                        }
                    }
                    .padding(20)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: focusedField) { _, newField in
                    guard let newField else { return }
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        proxy.scrollTo(newField, anchor: .center)
                    }
                }
                .onChange(of: errorMessage) { _, newError in
                    guard newError != nil else { return }
                    focusedField = nil // dismiss keyboard so banner is visible
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            proxy.scrollTo(Field.errorBanner, anchor: .top)
                        }
                    }
                }
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("تم") { focusedField = nil }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
            }
            .onAppear { prefillFromUser() }
        }
    }

    // MARK: - Contact-method cards (WhatsApp + Email — matches the web)

    private var contactMethodCards: some View {
        HStack(spacing: 12) {
            Link(destination: whatsAppURL) {
                contactMethodCard(
                    icon: "message.fill",
                    title: "واتساب",
                    value: whatsAppNumber,
                    tint: Color(red: 0.16, green: 0.74, blue: 0.42)
                )
            }
            .buttonStyle(.plain)

            Link(destination: emailURL) {
                contactMethodCard(
                    icon: "envelope.fill",
                    title: "البريد الإلكتروني",
                    value: supportEmail,
                    tint: SabqTheme.primaryEnd
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func contactMethodCard(icon: String, title: String, value: String, tint: Color) -> some View {
        VStack(spacing: 10) {
            Circle()
                .fill(tint)
                .frame(width: 44, height: 44)
                .overlay {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }

            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            Text(value)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)
                .environment(\.layoutDirection, .leftToRight)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(tint.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.20), lineWidth: 0.5)
        )
    }

    // MARK: - Field helpers

    private func labeledField(
        label: String,
        placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        disableAutocap: Bool = false,
        field: Field
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextField(placeholder, text: text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .keyboardType(keyboard)
                .textInputAutocapitalization(disableAutocap ? .never : .sentences)
                .autocorrectionDisabled(disableAutocap)
                .focused($focusedField, equals: field)
                .submitLabel(.next)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(
                            focusedField == field ? SabqTheme.primaryEnd.opacity(0.4) : SabqTheme.outline,
                            lineWidth: focusedField == field ? 1 : 0.5
                        )
                )
        }
    }

    private var subjectPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("موضوع الرسالة")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            Menu {
                ForEach(Self.subjectOptions, id: \.self) { option in
                    Button(option) { subject = option }
                }
            } label: {
                HStack(spacing: 10) {
                    Text(subject.isEmpty ? "اختر موضوع الرسالة" : subject)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(subject.isEmpty ? SabqTheme.tertiaryInk : SabqTheme.ink)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var messageEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الرسالة")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextEditor(text: $message)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.ink)
                .focused($focusedField, equals: .message)
                .frame(minHeight: 140)
                .scrollContentBackground(.hidden)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(
                            focusedField == .message ? SabqTheme.primaryEnd.opacity(0.4) : SabqTheme.outline,
                            lineWidth: focusedField == .message ? 1 : 0.5
                        )
                )
                .overlay(alignment: .topLeading) {
                    if message.isEmpty {
                        Text("اكتب رسالتك هنا...")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 20)
                            .allowsHitTesting(false)
                    }
                }
        }
    }

    private var sendButton: some View {
        Button {
            Task { await send() }
        } label: {
            HStack(spacing: 8) {
                if isSending { ProgressView().tint(.white) }
                Text("إرسال الرسالة")
                    .font(.system(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            .opacity(isFormValid ? 1.0 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!isFormValid || isSending)
    }

    // MARK: - Behaviour

    private func prefillFromUser() {
        guard let user = authStore.currentUser else { return }
        if name.isEmpty {
            let combined = [user.firstName, user.lastName]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            name = combined
        }
        if email.isEmpty, let userEmail = user.email, !userEmail.isEmpty {
            email = userEmail
        }
        if phone == "+966", let userPhone = user.phoneNumber, userPhone.hasPrefix("+966") {
            phone = userPhone
        }
    }

    private func send() async {
        isSending = true
        errorMessage = nil
        do {
            try await APIClient.shared.sendContactMessage(
                name: trimmedName,
                phone: trimmedPhone,
                email: trimmedEmail,
                subject: subject,
                message: trimmedMessage
            )
            isSent = true
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14))
            Text(text)
                .font(.system(size: 13, weight: .medium))
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

// MARK: - Newsletter Sheet

/// Pitch + subscribe surface for the smart newsletter. Communicates the AI
/// pipeline (interest-driven persona, daily summaries) via four feature
/// chips, prefills the email from the signed-in user, and gives a single
/// celebratory success state with a prominent one-tap unsubscribe button so
/// users never feel locked in.
struct NewsletterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var email = ""
    @State private var firstName = ""
    @State private var screenState: ScreenState = .form
    @State private var errorMessage: String?
    @State private var celebrationScale: CGFloat = 0.0

    enum ScreenState {
        case form           // Pitch + email field + subscribe button
        case subscribing    // Loading
        case subscribed     // Success celebration
        case alreadyMember  // Email already subscribed (different copy)
        case unsubscribing
        case unsubscribed
    }

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isEmailValid: Bool {
        trimmedEmail.contains("@") && trimmedEmail.contains(".")
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 22) {
                    switch screenState {
                    case .form, .subscribing:
                        pitchHero
                        featureGrid
                        formCard
                    case .subscribed:
                        successHero(
                            title: "أهلاً بك في النشرة الذكية! 🎉",
                            message: "سيصلك أول إصدار قريباً مع أهم الأخبار المختارة لك بواسطة SABQ AI."
                        )
                        manageCard
                    case .alreadyMember:
                        infoHero(
                            icon: "checkmark.seal.fill",
                            tint: SabqTheme.leaf,
                            title: "أنت مشترك بالفعل 👋",
                            message: "هذا البريد مسجّل في نشرتنا الذكية. تقدر تلغي الاشتراك متى ما تبي بدون أي التزام."
                        )
                        manageCard
                    case .unsubscribing:
                        ProgressView()
                            .padding(.top, 80)
                    case .unsubscribed:
                        successHero(
                            title: "تم إلغاء الاشتراك 👋",
                            message: "نأمل عودتك قريباً. تقدر تشترك من جديد في أي وقت."
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 60)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onAppear { prefillFromUser() }
        }
    }

    // MARK: - Hero variants

    private var pitchHero: some View {
        VStack(spacing: 14) {
            // Animated envelope with subtle pulse
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd.opacity(0.08))
                    .frame(width: 110, height: 110)
                Image(systemName: "sparkles")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .offset(x: 38, y: -34)
                Image(systemName: "envelope.open.fill")
                    .font(.system(size: 52, weight: .regular))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }

            HStack(spacing: 5) {
                Image(systemName: "sparkles")
                    .font(.system(size: 10, weight: .heavy))
                Text("SABQ AI")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .tracking(0.8)
            }
            .foregroundStyle(SabqTheme.primaryEnd)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(SabqTheme.primaryEnd.opacity(0.10)))
            .overlay(Capsule().stroke(SabqTheme.primaryEnd.opacity(0.25), lineWidth: 0.5))

            Text("النشرة الذكية")
                .font(SabqFonts.headline(size: 24))
                .foregroundStyle(SabqTheme.ink)

            Text("أخبار مختارة بعناية، يصيغها الذكاء الاصطناعي لذوقك تحديداً.")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
    }

    private func successHero(title: String, message: String) -> some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.leaf.opacity(0.10))
                    .frame(width: 110, height: 110)
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 56, weight: .regular))
                    .foregroundStyle(SabqTheme.leaf)
                    .scaleEffect(celebrationScale)
            }

            Text(title)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.center)

            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) {
                celebrationScale = 1.0
            }
            let feedback = UINotificationFeedbackGenerator()
            feedback.notificationOccurred(.success)
        }
    }

    private func infoHero(icon: String, tint: Color, title: String, message: String) -> some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.10))
                    .frame(width: 110, height: 110)
                Image(systemName: icon)
                    .font(.system(size: 50, weight: .regular))
                    .foregroundStyle(tint)
            }

            Text(title)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.ink)

            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
    }

    // MARK: - Feature grid (the AI value proposition)

    private var featureGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            featureCard(
                icon: "brain.head.profile",
                tint: SabqTheme.primaryEnd,
                title: "اختيار ذكي",
                desc: "SABQ AI يحلل المحتوى ويختار لك الأهم"
            )
            featureCard(
                icon: "person.crop.circle.badge.checkmark",
                tint: SabqTheme.teal,
                title: "مخصصة لك",
                desc: "ملخصات تناسب اهتماماتك وتطورها مع تفاعلك"
            )
            featureCard(
                icon: "clock.badge.checkmark.fill",
                tint: SabqTheme.sky,
                title: "توقيت ذكي",
                desc: "تصل في الوقت الذي يناسب يومك"
            )
            featureCard(
                icon: "hand.thumbsup.fill",
                tint: SabqTheme.leaf,
                title: "إلغاء بنقرة",
                desc: "تحكم كامل، بدون رسائل مزعجة"
            )
        }
    }

    private func featureCard(icon: String, tint: Color, title: String, desc: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(tint)
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
            }
            Text(desc)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineSpacing(3)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(tint.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(tint.opacity(0.20), lineWidth: 0.5)
        )
    }

    // MARK: - Form card

    private var formCard: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            VStack(alignment: .leading, spacing: 14) {
                Text("ابدأ الاشتراك")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)

                Text("اشتراك مجاني · بدون رسائل ترويجية · إلغاء فوري")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)

                if let errorMessage {
                    errorBanner(errorMessage)
                }

                TextField("البريد الإلكتروني", text: $email)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                            .fill(SabqTheme.paleFill)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                            .stroke(SabqTheme.outline, lineWidth: 0.5)
                    )

                Button {
                    Task { await subscribe() }
                } label: {
                    HStack(spacing: 8) {
                        if screenState == .subscribing {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "sparkles")
                                .font(.system(size: 14, weight: .heavy))
                        }
                        Text(screenState == .subscribing ? "جاري الاشتراك..." : "اشترك في النشرة")
                            .font(.system(size: 16, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    .opacity((isEmailValid && screenState != .subscribing) ? 1.0 : 0.55)
                }
                .buttonStyle(.plain)
                .disabled(!isEmailValid || screenState == .subscribing)

                Text("نحترم خصوصيتك. مزيد من التفاصيل في سياسة الخصوصية.")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: - Manage subscription card (post-subscribe / already-member)

    private var manageCard: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "envelope.badge.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text("إدارة الاشتراك")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("البريد المشترك")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    Text(trimmedEmail)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill.opacity(0.6))
                )

                if let errorMessage {
                    errorBanner(errorMessage)
                }

                Button {
                    Task { await unsubscribe() }
                } label: {
                    HStack(spacing: 8) {
                        if screenState == .unsubscribing {
                            ProgressView().tint(SabqTheme.coral)
                        } else {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14, weight: .heavy))
                        }
                        Text("إلغاء الاشتراك")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .foregroundStyle(SabqTheme.coral)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                            .fill(SabqTheme.coral.opacity(0.08))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                            .stroke(SabqTheme.coral.opacity(0.30), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
                .disabled(screenState == .unsubscribing)

                Text("سيتم إيقاف جميع الرسائل فوراً. تقدر تشترك مرة ثانية في أي وقت.")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: - Behaviour

    private func prefillFromUser() {
        guard let user = authStore.currentUser, let userEmail = user.email, !userEmail.isEmpty else { return }
        if email.isEmpty { email = userEmail }
        let first = user.firstName ?? ""
        if firstName.isEmpty, !first.isEmpty { firstName = first }

        // Check whether the signed-in user is already subscribed so we land
        // on the manage screen instead of the pitch.
        Task {
            let isSubscribed = await APIClient.shared.checkNewsletterStatus(email: userEmail)
            if isSubscribed {
                await MainActor.run {
                    withAnimation { screenState = .alreadyMember }
                }
            }
        }
    }

    private func subscribe() async {
        errorMessage = nil
        screenState = .subscribing
        do {
            try await APIClient.shared.subscribeNewsletter(
                email: trimmedEmail,
                firstName: firstName.isEmpty ? nil : firstName
            )
            await MainActor.run {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                    screenState = .subscribed
                }
            }
        } catch APIClient.NewsletterError.alreadySubscribed {
            await MainActor.run {
                withAnimation { screenState = .alreadyMember }
            }
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
            screenState = .form
        } catch {
            errorMessage = error.localizedDescription
            screenState = .form
        }
    }

    private func unsubscribe() async {
        errorMessage = nil
        screenState = .unsubscribing
        do {
            try await APIClient.shared.unsubscribeNewsletter(email: trimmedEmail)
            await MainActor.run {
                celebrationScale = 0
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                    screenState = .unsubscribed
                }
            }
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
            screenState = .alreadyMember
        } catch {
            errorMessage = error.localizedDescription
            screenState = .alreadyMember
        }
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14))
            Text(text)
                .font(.system(size: 13, weight: .medium))
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

// MARK: - Edit Profile Sheet

struct EditProfileSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var bio = ""
    @State private var city = ""
    @State private var gender = ""
    @State private var saved = false
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showAvatarPicker = false
    @State private var selectedImage: UIImage?
    @State private var showUploadNotice = false
    /// True when the user already has a non-empty firstName/lastName.
    /// Names are write-once for comment-integrity reasons — once set the
    /// backend silently drops further updates, so the UI mirrors that by
    /// disabling the inputs and surfacing a lock helper.
    @State private var firstNameLocked = false
    @State private var lastNameLocked = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    avatarSection

                    if saved {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 16))
                            Text("تم حفظ التغييرات بنجاح")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.leaf)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(SabqTheme.leaf.opacity(0.08))
                        )
                    }

                    VStack(spacing: 16) {
                        if firstNameLocked {
                            readOnlyField(label: "الاسم الأول", value: firstName, icon: "person.fill")
                        } else {
                            editField(label: "الاسم الأول", placeholder: "أدخل الاسم الأول", text: $firstName)
                        }
                        if lastNameLocked {
                            readOnlyField(label: "اسم العائلة", value: lastName, icon: "person.fill")
                        } else {
                            editField(label: "اسم العائلة", placeholder: "أدخل اسم العائلة", text: $lastName)
                        }
                        if firstNameLocked || lastNameLocked {
                            HStack(spacing: 6) {
                                Image(systemName: "info.circle.fill")
                                    .font(.system(size: 11))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                                Text("لا يمكن تعديل الاسم بعد التسجيل لاعتبارات أمنية ومصداقية التعليقات")
                                    .font(.system(size: 11, weight: .regular))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        editField(label: "المدينة", placeholder: "أدخل مدينتك", text: $city)
                        genderPicker

                        if let email = authStore.currentUser?.email, !email.isEmpty {
                            readOnlyField(label: "البريد الإلكتروني", value: email, icon: "envelope.fill")
                        }
                        if let phone = authStore.currentUser?.phoneNumber, !phone.isEmpty {
                            readOnlyField(label: "رقم الجوال", value: phone, icon: "phone.fill")
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("نبذة عنك")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            TextEditor(text: $bio)
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(SabqTheme.ink)
                                .frame(minHeight: 80)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .fill(SabqTheme.paleFill)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                                )
                                .overlay(alignment: .topLeading) {
                                    if bio.isEmpty {
                                        Text("اكتب نبذة مختصرة عنك...")
                                            .font(.system(size: 15, weight: .regular))
                                            .foregroundStyle(SabqTheme.tertiaryInk)
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 20)
                                            .allowsHitTesting(false)
                                    }
                                }
                        }
                    }

                    if let error = authStore.errorMessage {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 14))
                            Text(error)
                                .font(.system(size: 13, weight: .medium))
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

                    Button {
                        Task {
                            await authStore.updateProfile(
                                firstName: firstName,
                                lastName: lastName,
                                bio: bio.isEmpty ? nil : bio,
                                city: city.isEmpty ? nil : city,
                                gender: gender.isEmpty ? nil : gender
                            )
                            if authStore.errorMessage == nil {
                                withAnimation { saved = true }
                                try? await Task.sleep(for: .seconds(1.5))
                                dismiss()
                            }
                        }
                    } label: {
                        HStack(spacing: 10) {
                            if authStore.isLoading {
                                ProgressView().tint(.white)
                            }
                            Text("حفظ التغييرات")
                                .font(.system(size: 16, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(firstName.isEmpty || authStore.isLoading)
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onAppear {
                if let user = authStore.currentUser {
                    firstName = user.firstName ?? ""
                    lastName = user.lastName ?? ""
                    bio = user.bio ?? ""
                    city = user.city ?? ""
                    let normalizedGender = (user.gender ?? "").lowercased()
                    gender = (normalizedGender == "male" || normalizedGender == "female") ? normalizedGender : ""
                    firstNameLocked = !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    lastNameLocked = !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                }
            }
        }
    }

    private var avatarSection: some View {
        VStack(spacing: 16) {
            ZStack(alignment: .bottomTrailing) {
                if let selectedImage {
                    Image(uiImage: selectedImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 90, height: 90)
                        .clipShape(Circle())
                } else if let user = authStore.currentUser, let avatarURL = user.avatar, let url = URL(string: avatarURL) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        avatarPlaceholder
                    }
                    .frame(width: 90, height: 90)
                    .clipShape(Circle())
                } else {
                    avatarPlaceholder
                }

                Button {
                    Task {
                        // App Store review expects the platform's
                        // photo-library permission alert to appear at
                        // the moment the user invokes a photo flow —
                        // PhotosUI.PhotosPicker alone bypasses it
                        // because it runs out-of-process.
                        await SabqPhotoPermission.ensureRequested()
                        showAvatarPicker = true
                    }
                } label: {
                    Circle()
                        .fill(SabqTheme.primaryEnd)
                        .frame(width: 30, height: 30)
                        .overlay {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        .shadow(color: .black.opacity(0.15), radius: 3, y: 1)
                }
                .buttonStyle(.plain)
                .photosPicker(isPresented: $showAvatarPicker, selection: $selectedPhoto, matching: .images)
            }
            .onChange(of: selectedPhoto) { _, newValue in
                Task {
                    if let data = try? await newValue?.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: data) {
                        selectedImage = uiImage
                        if let pngData = uiImage.pngData() {
                            await authStore.uploadAvatar(imageData: pngData)
                            if authStore.errorMessage == nil {
                                withAnimation { showUploadNotice = true }
                            }
                        }
                    }
                }
            }

            Text(authStore.currentUser?.displayName ?? "")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            if authStore.isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("جاري رفع الصورة...")
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundStyle(SabqTheme.secondaryInk)
            }

            if showUploadNotice {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14))
                    Text("تم تحديث الصورة الشخصية بنجاح")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.leaf)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(SabqTheme.leaf.opacity(0.08))
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var avatarPlaceholder: some View {
        Circle()
            .fill(SabqTheme.primaryEnd.opacity(0.12))
            .frame(width: 90, height: 90)
            .overlay {
                Text(String((authStore.currentUser?.displayName ?? "م").prefix(1)))
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    private func editField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextField(placeholder, text: text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                )
        }
    }

    private var genderPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الجنس")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            Picker("الجنس", selection: $gender) {
                Text("غير محدد").tag("")
                Text("ذكر").tag("male")
                Text("أنثى").tag("female")
            }
            .pickerStyle(.segmented)
        }
    }

    private func readOnlyField(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Text(value)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 0)
                Image(systemName: "lock.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(SabqTheme.paleFill.opacity(0.6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
        }
    }
}

// MARK: - Change Password Sheet

struct ChangePasswordSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var success = false

    private var isValid: Bool {
        !currentPassword.isEmpty && newPassword.count >= 6 && newPassword == confirmPassword
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(spacing: 12) {
                        Image(systemName: "lock.rotation")
                            .font(.system(size: 48, weight: .light))
                            .foregroundStyle(SabqTheme.primaryEnd)

                        Text("تغيير كلمة المرور")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundStyle(SabqTheme.ink)
                    }
                    .frame(maxWidth: .infinity)

                    if success {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 16))
                            Text("تم تغيير كلمة المرور بنجاح")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.leaf)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(SabqTheme.leaf.opacity(0.08))
                        )
                    } else {
                        VStack(spacing: 16) {
                            secureField(label: "كلمة المرور الحالية", placeholder: "أدخل كلمة المرور الحالية", text: $currentPassword)
                            secureField(label: "كلمة المرور الجديدة", placeholder: "6 أحرف على الأقل", text: $newPassword)
                            secureField(label: "تأكيد كلمة المرور", placeholder: "أعد إدخال كلمة المرور الجديدة", text: $confirmPassword)

                            if !newPassword.isEmpty && !confirmPassword.isEmpty && newPassword != confirmPassword {
                                HStack(spacing: 6) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .font(.system(size: 12))
                                    Text("كلمتا المرور غير متطابقتين")
                                        .font(.system(size: 13, weight: .medium))
                                }
                                .foregroundStyle(SabqTheme.coral)
                            }
                        }

                        if let error = authStore.errorMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 14))
                                Text(error)
                                    .font(.system(size: 13, weight: .medium))
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

                        Button {
                            Task {
                                await authStore.changePassword(currentPassword: currentPassword, newPassword: newPassword)
                                if authStore.errorMessage == nil {
                                    withAnimation { success = true }
                                    try? await Task.sleep(for: .seconds(1.5))
                                    dismiss()
                                }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                if authStore.isLoading {
                                    ProgressView().tint(.white)
                                }
                                Text("تغيير كلمة المرور")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(!isValid || authStore.isLoading)
                        .opacity(isValid ? 1 : 0.5)
                    }
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onDisappear { authStore.clearMessages() }
        }
    }

    private func secureField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            SecureField(placeholder, text: text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .textContentType(.password)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                )
        }
    }
}

// MARK: - Delete Account Sheet

struct DeleteAccountSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(FollowedKeywordsStore.self) private var followedKeywords
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirmText = ""
    @State private var showConfirmation = false

    private let confirmWord = "حذف"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 48, weight: .light))
                            .foregroundStyle(SabqTheme.coral)

                        Text("حذف الحساب")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundStyle(SabqTheme.coral)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 12) {
                        Text("تحذير: هذا الإجراء لا يمكن التراجع عنه")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(SabqTheme.coral)

                        Text("سيتم حذف حسابك وجميع بياناتك بشكل نهائي. لن تتمكن من استعادة الحساب بعد الحذف.")
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineSpacing(5)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(SabqTheme.coral.opacity(0.06))
                    )

                    if !showConfirmation {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("كلمة المرور")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            SecureField("أدخل كلمة المرور للتأكيد", text: $password)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(SabqTheme.ink)
                                .textContentType(.password)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .fill(SabqTheme.paleFill)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                                )
                        }

                        Button {
                            withAnimation { showConfirmation = true }
                        } label: {
                            Text("متابعة")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 15)
                                .background(SabqTheme.coral, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(password.isEmpty)
                        .opacity(password.isEmpty ? 0.5 : 1)
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("اكتب \"\(confirmWord)\" للتأكيد")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            TextField(confirmWord, text: $confirmText)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(SabqTheme.ink)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .fill(SabqTheme.paleFill)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .stroke(SabqTheme.coral.opacity(0.3), lineWidth: 1)
                                )
                        }

                        if let error = authStore.errorMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 14))
                                Text(error)
                                    .font(.system(size: 13, weight: .medium))
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

                        Button {
                            Task {
                                await authStore.deleteAccount(password: password)
                                if authStore.isLoggedIn == false && authStore.errorMessage == nil {
                                    // Account is gone on the server — make sure
                                    // no shred of the user's data lingers on
                                    // this device either. Bookmarks, followed
                                    // keywords, recent searches and the image
                                    // cache all get wiped so the next user on
                                    // this device sees a clean slate.
                                    bookmarksStore.clear()
                                    followedKeywords.clear()
                                    UserDefaults.standard.removeObject(forKey: "sabq_recent_searches")
                                    ImageCache.clear()
                                    URLCache.shared.removeAllCachedResponses()
                                    dismiss()
                                }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                if authStore.isLoading {
                                    ProgressView().tint(.white)
                                }
                                Text("حذف الحساب نهائياً")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.coral, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(confirmText != confirmWord || authStore.isLoading)
                        .opacity(confirmText == confirmWord ? 1 : 0.5)
                    }
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onDisappear { authStore.clearMessages() }
        }
    }
}

// MARK: - Forgot Password Sheet

struct ForgotPasswordSheet: View {
    enum Step { case email, code, done }

    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var step: Step = .email
    @State private var email = ""
    @State private var code = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""

    private var canSendEmail: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !authStore.isLoading
    }

    private var canSubmitReset: Bool {
        code.count == 6
            && newPassword.count >= 6
            && newPassword == confirmPassword
            && !authStore.isLoading
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    Spacer().frame(height: 20)

                    Image(systemName: step == .done ? "checkmark.circle.fill" : "envelope.badge.shield.half.filled")
                        .font(.system(size: 48, weight: .light))
                        .foregroundStyle(step == .done ? SabqTheme.leaf : SabqTheme.primaryEnd)

                    Text(step == .done ? "تم تغيير كلمة المرور" : "نسيت كلمة المرور؟")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)

                    switch step {
                    case .email: emailStep
                    case .code:  codeStep
                    case .done:  doneStep
                    }
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onDisappear { authStore.clearMessages() }
        }
    }

    // MARK: Step 1 — email

    @ViewBuilder
    private var emailStep: some View {
        Text("أدخل بريدك الإلكتروني وسنرسل لك رمز التحقق لإعادة تعيين كلمة المرور")
            .font(.system(size: 15, weight: .regular))
            .foregroundStyle(SabqTheme.secondaryInk)
            .multilineTextAlignment(.center)
            .lineSpacing(5)

        textInput("البريد الإلكتروني", text: $email, keyboard: .emailAddress, capitalize: false)
            .padding(.horizontal, 24)

        inlineError

        Button {
            Task {
                await authStore.forgotPassword(email: email)
                if authStore.errorMessage == nil {
                    withAnimation { step = .code }
                }
            }
        } label: {
            primaryLabel(text: "إرسال رمز التحقق")
        }
        .buttonStyle(.plain)
        .disabled(!canSendEmail)
        .opacity(canSendEmail ? 1 : 0.5)
        .padding(.horizontal, 24)
    }

    // MARK: Step 2 — code + new password

    @ViewBuilder
    private var codeStep: some View {
        VStack(spacing: 4) {
            Text("أدخل الرمز المرسَل إلى:")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            Text(email)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
        }

        textInput(
            "رمز التحقق (6 أرقام)",
            text: $code,
            keyboard: .numberPad,
            // .oneTimeCode lets iOS auto-fill the code from Mail/SMS
            // AND fixes the paste-doesn't-render-until-tap SwiftUI
            // bug the editor reported on 2026-05-19. Confirmed by
            // pasting then immediately scrolling: the value appears
            // straight away.
            contentType: .oneTimeCode
        )
        .padding(.horizontal, 24)
        .onChange(of: code) { _, new in
            let digits = new.filter(\.isNumber)
            code = String(digits.prefix(6))
        }

        textInput(
            "كلمة المرور الجديدة (٦ أحرف فأكثر)",
            text: $newPassword,
            isSecure: true,
            contentType: .newPassword
        )
        .padding(.horizontal, 24)

        textInput(
            "تأكيد كلمة المرور",
            text: $confirmPassword,
            isSecure: true,
            contentType: .newPassword
        )
        .padding(.horizontal, 24)

        if !confirmPassword.isEmpty && newPassword != confirmPassword {
            Text("كلمتا المرور غير متطابقتين")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.coral)
        }

        inlineError

        Button {
            Task {
                let ok = await authStore.resetPasswordWithCode(
                    email: email, code: code, newPassword: newPassword
                )
                if ok {
                    withAnimation { step = .done }
                }
            }
        } label: {
            primaryLabel(text: "تعيين كلمة المرور")
        }
        .buttonStyle(.plain)
        .disabled(!canSubmitReset)
        .opacity(canSubmitReset ? 1 : 0.5)
        .padding(.horizontal, 24)

        Button("إعادة إرسال الرمز") {
            Task {
                code = ""
                await authStore.forgotPassword(email: email)
            }
        }
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(SabqTheme.primaryEnd)
        .padding(.top, 4)
    }

    // MARK: Step 3 — done

    @ViewBuilder
    private var doneStep: some View {
        Text(authStore.successMessage ?? "تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.")
            .font(.system(size: 15, weight: .regular))
            .foregroundStyle(SabqTheme.secondaryInk)
            .multilineTextAlignment(.center)
            .lineSpacing(5)
            .padding(.horizontal, 24)

        Button {
            dismiss()
        } label: {
            primaryLabel(text: "حسناً")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
    }

    // MARK: Shared bits

    @ViewBuilder
    private var inlineError: some View {
        if let error = authStore.errorMessage {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 14))
                Text(error)
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundStyle(SabqTheme.coral)
            .padding(.horizontal, 36)
        }
    }

    private func primaryLabel(text: String) -> some View {
        HStack(spacing: 10) {
            if authStore.isLoading {
                ProgressView().tint(.white)
            }
            Text(text)
                .font(.system(size: 16, weight: .bold))
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
    }

    @ViewBuilder
    private func textInput(
        _ placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        capitalize: Bool = true,
        isSecure: Bool = false,
        contentType: UITextContentType? = nil
    ) -> some View {
        Group {
            if isSecure {
                SecureField(placeholder, text: text)
                    .textContentType(contentType)
            } else {
                TextField(placeholder, text: text)
                    .keyboardType(keyboard)
                    .textInputAutocapitalization(capitalize ? .sentences : .never)
                    .autocorrectionDisabled()
                    .textContentType(contentType)
            }
        }
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(SabqTheme.ink)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(SabqTheme.paleFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 0.5)
        )
    }
}
