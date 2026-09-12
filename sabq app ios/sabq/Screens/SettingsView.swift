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
                SabqPageIntro("إعدادات التطبيق وعن سبق")

                profileSection
                if authStore.isLoggedIn {
                    accountShortcutsGrid
                }
                displaySection
                browsingExperienceSection
                if authStore.isLoggedIn {
                    matchAlertsSection
                }
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
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("حسابي")
        .navigationBarTitleDisplayMode(.inline)
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
                                    .font(SabqFonts.app(size: 17, weight: .bold))
                                    .foregroundStyle(SabqTheme.ink)

                                if user.isVerified {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(SabqFonts.app(size: 14))
                                        .foregroundStyle(SabqTheme.primaryEnd)
                                }
                            }

                            HStack(spacing: 6) {
                                Image(systemName: roleIcon(for: user.primaryRoleKey))
                                    .font(SabqFonts.app(size: 11))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                                Text(user.localizedRole)
                                    .font(SabqFonts.app(size: 12, weight: .medium))
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
                                    .font(SabqFonts.app(size: 12, weight: .regular))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let jobTitle = user.jobTitle, !jobTitle.isEmpty, jobTitle != user.localizedRole {
                        HStack(spacing: 8) {
                            Image(systemName: "briefcase.fill")
                                .font(SabqFonts.app(size: 12))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                            Text(jobTitle)
                                .font(SabqFonts.app(size: 13, weight: .medium))
                                .foregroundStyle(SabqTheme.secondaryInk)
                            if let dept = user.department, !dept.isEmpty {
                                Text("·")
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                                Text(dept)
                                    .font(SabqFonts.app(size: 13, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let bio = user.bio, !bio.isEmpty {
                        Text(bio)
                            .font(SabqFonts.app(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineSpacing(4)
                            .lineLimit(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if user.emailVerified == false {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(SabqFonts.app(size: 13))
                            Text("لم يتم تأكيد البريد الإلكتروني بعد")
                                .font(SabqFonts.app(size: 13, weight: .medium))
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
                                    .font(SabqFonts.app(size: 18, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                                    .frame(width: 32, height: 32)
                                    .background(
                                        Circle()
                                            .fill(SabqTheme.primaryEnd.opacity(0.12))
                                    )

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("أكمل بياناتك")
                                        .font(SabqFonts.app(size: 14, weight: .bold))
                                        .foregroundStyle(SabqTheme.ink)
                                    Text(completionBannerHint(needsBasics: needsBasics, needsInterests: needsInterests))
                                        .font(SabqFonts.app(size: 12, weight: .regular))
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
                                                .font(SabqFonts.app(size: 11, weight: .regular))
                                            Text("البيانات الشخصية")
                                                .font(SabqFonts.app(size: 12, weight: .medium))
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
                                                .font(SabqFonts.app(size: 11, weight: .regular))
                                            Text("اهتماماتك")
                                                .font(SabqFonts.app(size: 12, weight: .medium))
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
                                    .font(SabqFonts.app(size: 12, weight: .medium))
                                Text("تعديل الملف الشخصي")
                                    .font(SabqFonts.app(size: 12, weight: .medium))
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
                                .font(SabqFonts.app(size: 22, weight: .semibold))
                                .foregroundStyle(SabqTheme.primaryEnd)
                        }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("تسجيل الدخول")
                            .font(SabqFonts.app(size: 17, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("سجّل دخولك لتجربة شخصية أفضل")
                            .font(SabqFonts.app(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onTapGesture { showLogin = true }

                Button { showLogin = true } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.forward.circle.fill")
                            .font(SabqFonts.app(size: 16))
                        Text("تسجيل الدخول")
                            .font(SabqFonts.app(size: 15, weight: .bold))
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
                    .font(SabqFonts.app(size: size * 0.38, weight: .bold))
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
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(tint)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                    if let badgeCount, badgeCount > 0 {
                        Text("\(badgeCount)")
                            .font(SabqFonts.app(size: 10, weight: .regular))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(tint))
                    }
                }
                Text(subtitle)
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.forward")
                .font(SabqFonts.app(size: 12, weight: .medium))
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
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .frame(width: 20)
                    Text("تغيير كلمة المرور")
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                    Spacer()
                    Image(systemName: "chevron.forward")
                        .font(SabqFonts.app(size: 11, weight: .regular))
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
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.coral)

                Text(subtitle)
                    .font(SabqFonts.app(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "chevron.forward")
                .font(SabqFonts.app(size: 12, weight: .medium))
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

    // MARK: - Account shortcuts (2-column grid)

    /// Dashboard / loyalty / press-card entries share one compact grid so the
    /// account screen uses horizontal space instead of four full-width rows.
    private var accountShortcutsGrid: some View {
        SurfaceCard {
            if let user = authStore.currentUser, user.isPlatformAdmin {
                NavigationLink(value: AdminDashboardRoute()) {
                    accountShortcutTile(
                        title: "لوحة التحكم",
                        subtitle: "إدارة الأخبار والمؤشّرات",
                        icon: "shield.lefthalf.filled",
                        tint: SabqTheme.sky
                    )
                }
                .buttonStyle(.plain)
                NavigationLink(value: SabqPlusRoute()) {
                    accountShortcutTile(
                        title: "سبق بلس (معاينة)",
                        subtitle: "محاكاة الاستبدال عبر ولاء ون",
                        icon: "plus.diamond.fill",
                        tint: Color(red: 0.48, green: 0.42, blue: 0.88)
                    )
                }
                .buttonStyle(.plain)
            }
            if let user = authStore.currentUser, user.isWriter || user.isReporter || user.isAdminLike {
                NavigationLink(value: ContributorDashboardRoute()) {
                    accountShortcutTile(
                        title: "لوحة الكاتب",
                        subtitle: "مساحتك من الفكرة إلى النشر — أفكار، مقالات، أداء",
                        icon: "square.and.pencil",
                        tint: Color(red: 0.30, green: 0.69, blue: 0.31)
                    )
                }
                .buttonStyle(.plain)
            }
            NavigationLink(value: LoyaltyAccountRoute()) {
                accountShortcutTile(
                    title: "نقاطي والمكافآت",
                    subtitle: "تابع مستواك واستبدل نقاطك",
                    icon: "trophy.fill",
                    tint: Color(red: 0.96, green: 0.62, blue: 0.04)
                )
            }
            .buttonStyle(.plain)
            NavigationLink(value: PressCardRoute()) {
                accountShortcutTile(
                    title: "بطاقتي الصحفية",
                    subtitle: "أضف بطاقتك إلى Apple Wallet",
                    icon: "checkmark.seal.fill",
                    tint: Color(red: 0.11, green: 0.64, blue: 0.94)
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func accountShortcutTile(
        title: String,
        subtitle: String,
        icon: String,
        tint: Color
    ) -> some View {
        settingsRow(title: title, subtitle: subtitle, icon: icon, tint: tint)
            .frame(minHeight: 44)
    }

    // MARK: - Display

    /// اختصار لشاشة اختيار أنواع تنبيهات المباريات (هدف/كرت/فار…) للفِرق المتابَعة.
    private var matchAlertsSection: some View {
        SurfaceCard {
            NavigationLink(destination: WCMatchEventNotificationsView()) {
                HStack(spacing: 12) {
                    SmallSquareBadge(systemImage: "soccerball", tint: SabqTheme.leaf)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("تنبيهات المباريات")
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("اختر أنواع الأحداث (هدف/كرت/فار) للفِرق التي تتابعها")
                            .font(SabqFonts.app(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.forward")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            .buttonStyle(.plain)
        }
    }

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
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Text(lite.browsingMode.arabicSubtitle)
                            .font(SabqFonts.app(size: 13, weight: .regular))
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
                .modifier(SabqAdaptivePickerStyle())
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
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("اختر مظهر التطبيق أو اتبع إعداد الجهاز")
                            .font(SabqFonts.app(size: 13, weight: .regular))
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
                .modifier(SabqAdaptivePickerStyle())
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("نمط بطاقات الأخبار")
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("اختر شكل عرض الأخبار في الواجهة")
                            .font(SabqFonts.app(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    Spacer(minLength: 0)
                    SmallSquareBadge(systemImage: "rectangle.stack.fill", tint: SabqTheme.primaryEnd)
                }

                Picker("نمط البطاقة", selection: $cardStyleRaw) {
                    Text("موسّع").tag("spacious")
                    Text("كلاسيكي").tag("classic")
                }
                .modifier(SabqAdaptivePickerStyle())
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("لون التطبيق")
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: dynamicTypeSize.isAccessibilitySize ? 100 : 48))], spacing: 12) {
                    ForEach(AppAccent.allCases) { accent in
                        let isSelected = accentRaw == accent.rawValue
                        Button {
                            withAnimation(reduceMotion ? nil : .spring(response: 0.3)) {
                                accentRaw = accent.rawValue
                            }
                        } label: {
                            VStack(spacing: 8) {
                                Circle()
                                    .fill(accent.color)
                                    .frame(width: 40, height: 40)
                                    .overlay {
                                        if isSelected {
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 16, weight: .bold))
                                                .foregroundStyle(.white)
                                        }
                                    }
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
                                    .font(SabqFonts.app(size: 11, weight: isSelected ? .bold : .medium))
                                    .foregroundStyle(isSelected ? accent.color : SabqTheme.tertiaryInk)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(accent.title)
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                        .frame(maxWidth: .infinity, minHeight: 44)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("حجم الخط")
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)

                        Text("حجم النص: \(Int(textSize))")
                            .font(SabqFonts.app(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }

                    Spacer(minLength: 0)

                    SmallSquareBadge(systemImage: "textformat.size", tint: SabqTheme.primaryEnd)
                }

                HStack(spacing: 12) {
                    Text("أ")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)

                    Slider(value: $textSize, in: 14...24, step: 1)
                        .accessibilityLabel("حجم خط المقالات")
                        .accessibilityValue("\(Int(textSize)) نقطة")
                        .tint(SabqTheme.primaryEnd)

                    Text("أ")
                        .font(SabqFonts.app(size: 22, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }

                Text("معاينة حجم الخط في المقالات")
                    .font(SabqFonts.app(size: CGFloat(textSize), weight: .regular))
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
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
             + Text(". تغطية لحظية لا تتوقف، بتقنيات الذكاء الاصطناعي وأقلام محررين من قلب الحدث."))
                .font(SabqFonts.app(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.leading)
                .lineSpacing(5)

            NavigationLink(destination: AITeamView()) {
                settingsRow(
                    title: "فريق سبق الذكي",
                    subtitle: "زملاؤنا الرقميون بأسمائهم وأدوارهم — تحت إشراف بشري",
                    icon: "person.3.fill",
                    tint: SabqTheme.primaryEnd
                )
            }
            .buttonStyle(.plain)

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
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)

            Text("صنع بكل حب في السعودية 🇸🇦")
                .font(SabqFonts.app(size: 14, weight: .medium))
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
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .font(SabqFonts.app(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Toggle(title, isOn: isOn)
                .tint(SabqTheme.primaryEnd)
                .labelsHidden()
        }
    }

    private func settingsRow(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            SmallSquareBadge(systemImage: icon, tint: tint)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .font(SabqFonts.app(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "chevron.forward")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(.vertical, 3)
    }
}
