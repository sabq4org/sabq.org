import SwiftUI

struct DailyBriefRoute: Hashable {}

/// Two-mode landing reached by tapping the homepage greeting block.
///
/// - **Guest**: the member-value-prop landing that explains what an account
///   unlocks (interests, daily brief, saved articles, reading stats). Has
///   register + login CTAs.
/// - **Member**: a personal dashboard built from `authStore.currentUser`
///   (name, avatar, role, interests). NO call to `/api/ai/daily-summary` —
///   that endpoint only exists in `en` flavour today, so we render the
///   profile-driven view instead and let the user manage their interests.
struct DailyBriefView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(ArticlesStore.self) private var articlesStore
    @State private var showLogin = false
    @State private var showSignUp = false
    @State private var showInterestsPicker = false
    @State private var allCategories: [APICategory] = []

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                if authStore.isLoggedIn, let user = authStore.currentUser {
                    memberDashboard(user: user)
                } else {
                    guestLanding
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("لك")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showLogin, onDismiss: { }) {
            LoginSheet(initialMode: false)
        }
        .sheet(isPresented: $showSignUp) {
            SignUpFlowView()
                .environment(authStore)
        }
        .sheet(isPresented: $showInterestsPicker) {
            InterestsPickerSheet(allCategories: allCategories, selectedIds: Set(authStore.currentUser?.interests.map(\.id) ?? []))
                .environment(authStore)
        }
        .task {
            // Warm the shared cache so opening the interests sheet is
            // instant. The sheet itself also refreshes the cache, so the
            // user never sees a long blank state.
            await InterestsCategoryCache.shared.loadIfStale()
            allCategories = InterestsCategoryCache.shared.get()
        }
    }

    // MARK: - Member dashboard

    @ViewBuilder
    private func memberDashboard(user: APIUser) -> some View {
        memberHero(user: user)
        statsRow(user: user)
        interestsCard(user: user)
        if !suggestedArticles(for: user).isEmpty {
            suggestionsSection(user: user)
        }
        moodCard(user: user)
    }

    /// Three small stat tiles: bookmarks count, interests count, days as
    /// member. All numbers come from already-cached client state — no API
    /// dependency, so the dashboard is never empty for a logged-in user.
    private func statsRow(user: APIUser) -> some View {
        let bookmarks = bookmarksStore.bookmarkedIDs.count
        let interests = user.interests.count
        let days = Self.daysSinceJoined(user.createdAt)
        return HStack(spacing: SabqLayout.space8) {
            statTile(value: "\(bookmarks)", label: "محفوظ", icon: "bookmark.fill")
            statTile(value: "\(interests)", label: "اهتماماتك", icon: "slider.horizontal.3")
            statTile(value: days != nil ? "\(days!)" : "—", label: "يوم معك", icon: "calendar")
        }
    }

    /// مربع رقم هادئ: تعبئة `surfaceMuted` بلا حد ولا لون تصنيف.
    private func statTile(value: String, label: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Image(systemName: icon)
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.primary)
                .accessibilityHidden(true)
            Text(value)
                .font(SabqType.leadTitle.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
            Text(label)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
        .accessibilityElement(children: .combine)
    }

    /// Filter the homepage feed to the user's interest categories. Returns
    /// up to 8 articles. Uses client-side filtering on `allArticles` since
    /// the per-category endpoint is still in deploy queue.
    private func suggestedArticles(for user: APIUser) -> [Article] {
        let interestSlugs = Set(user.interests.compactMap { $0.slug?.lowercased() })
        guard !interestSlugs.isEmpty else { return [] }
        return articlesStore.allArticles
            .filter { interestSlugs.contains($0.category.slug.lowercased()) }
            .prefix(8)
            .map { $0 }
    }

    private func suggestionsSection(user: APIUser) -> some View {
        let suggestions = suggestedArticles(for: user)
        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionTitle("اقتراحات لك من اهتماماتك")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: SabqLayout.space16) {
                    ForEach(suggestions) { article in
                        NavigationLink(value: article) {
                            suggestionCard(article: article)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func suggestionCard(article: Article) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Group {
                if let urlString = article.imageURL, let url = URL(string: urlString) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        SabqImagePlaceholder()
                    }
                } else {
                    SabqImagePlaceholder()
                        .environment(\.sabqImageLoadFailed, true)
                }
            }
            .frame(width: 220, height: 124)
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .aiImageBadgeOverlay(
                isVisible: article.isAiGeneratedImage,
                model: article.aiImageModel,
                inset: 6,
                sizeScale: 0.75
            )
            Text(article.categoryTitle)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.primary)
            SabqRTLText(
                article.title,
                uiFont: SabqType.rowTitle.uiFont,
                color: SabqTheme.textPrimary,
                lineLimit: 3,
                lineSpacing: SabqType.rowTitle.lineSpacing,
                textStyle: SabqType.rowTitle.uiTextStyle
            )
            .frame(width: 220, alignment: .leading)
        }
        .frame(width: 220, alignment: .leading)
    }

    /// Mood/sentiment card. Until the backend exposes a real "your mood
    /// based on reading" endpoint, we infer a soft mood from the user's
    /// active interest mix — health/local-news tilts toward "متابع للأخبار",
    /// economy/tech toward "مهتم بالتحليل", culture/sports toward "متنوع
    /// الاهتمامات". Pure client-side; never empty for a logged-in user.
    private func moodCard(user: APIUser) -> some View {
        let interestSlugs = Set(user.interests.compactMap { $0.slug?.lowercased() })
        let (icon, label, subtitle, _) = Self.inferMood(from: interestSlugs)
        return HStack(alignment: .center, spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 20, weight: .regular))
                .foregroundStyle(SabqTheme.primary)
                .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text("مزاجك القرائي اليوم")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                Text(label)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(subtitle)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
        .accessibilityElement(children: .combine)
    }

    /// عنوان قسم موحّد: 20 عريض بلا مربع أيقونة.
    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(SabqType.sectionHeading.font)
            .foregroundStyle(SabqTheme.textPrimary)
            .accessibilityAddTraits(.isHeader)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private static func inferMood(from slugs: Set<String>) -> (icon: String, label: String, subtitle: String, tint: Color) {
        if slugs.isEmpty {
            return ("sparkles", "نبدأ معاً", "اختر اهتماماتك لنخصّص لك مزاج قراءة يومي", SabqTheme.primaryEnd)
        }
        if slugs.contains("technology") || slugs.contains("business") {
            return ("brain.head.profile", "مهتم بالتحليل", "تميل لقراءة الاقتصاد والتقنية والتحليلات العميقة", SabqTheme.teal)
        }
        if slugs.contains("sports") {
            return ("flame.fill", "متابع نشط", "تتابع الرياضة وأخبارها الحارة لحظة بلحظة", SabqTheme.coral)
        }
        if slugs.contains("culture") || slugs.contains("life") {
            return ("book.fill", "قارئ منوّع", "تستمتع بالثقافة والحياة وقصص الناس", SabqTheme.gold)
        }
        return ("newspaper.fill", "متابع للأخبار", "حاضر مع كل جديد من الأخبار المحلية والعالمية", SabqTheme.primaryEnd)
    }

    private static func daysSinceJoined(_ raw: String?) -> Int? {
        guard let raw, let date = SabqFormatters.parseISO8601(raw) else { return nil }
        let diff = Calendar.current.dateComponents([.day], from: date, to: Date()).day ?? 0
        return max(0, diff)
    }

    private func memberHero(user: APIUser) -> some View {
        HStack(alignment: .center, spacing: SabqLayout.space16) {
            avatar(user: user)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(user.displayName)
                    .font(SabqType.leadTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "sparkles")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                        .accessibilityHidden(true)
                    Text(user.localizedRole)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                }
                if let email = user.email, !email.isEmpty {
                    Text(email)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func avatar(user: APIUser) -> some View {
        Group {
            if let urlString = user.avatar, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    avatarPlaceholder(user: user)
                }
                .frame(width: 64, height: 64)
                .clipShape(Circle())
            } else {
                avatarPlaceholder(user: user)
            }
        }
    }

    private func avatarPlaceholder(user: APIUser) -> some View {
        Circle()
            .fill(SabqTheme.surfaceMuted)
            .frame(width: 64, height: 64)
            .overlay {
                Text(String(user.displayName.prefix(1)))
                    .font(SabqType.leadTitle.font)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
    }

    @ViewBuilder
    private func interestsCard(user: APIUser) -> some View {
        let interests = user.interests
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                sectionTitle("اهتماماتك")
                Button {
                    showInterestsPicker = true
                } label: {
                    Text(interests.isEmpty ? "اختر اهتماماتك" : "تعديل")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.primary)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .fixedSize()
            }

            if interests.isEmpty {
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    Text("لم تختر بعد اهتماماتك. اختر بضع تصنيفات لنقترح عليك أهم الأخبار في كل زيارة.")
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)

                    Button {
                        showInterestsPicker = true
                    } label: {
                        HStack(spacing: SabqLayout.space8) {
                            Image(systemName: "plus.circle.fill")
                                .font(SabqType.tag.font)
                            Text("اختر اهتماماتك الآن")
                                .font(SabqType.button.font)
                        }
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, SabqLayout.space24)
                        .frame(minHeight: SabqLayout.controlHeight)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .fill(SabqTheme.actionFill)
                        )
                    }
                    .buttonStyle(.plain)
                }
            } else {
                FlowLayout(spacing: SabqLayout.space8) {
                    ForEach(interests) { interest in
                        Text(interest.name ?? interest.slug ?? "—")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .padding(.horizontal, SabqLayout.space12)
                            .frame(minHeight: 32)
                            .background(
                                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                    .fill(SabqTheme.surfaceMuted)
                            )
                    }
                }

                Text("\(interests.count) تصنيف نختار لك منه أخباراً يومية")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var valueGrid: some View {
        let columns = SabqGrid.adaptive(spacing: SabqLayout.space12)
        return LazyVGrid(columns: columns, spacing: SabqLayout.space12) {
            featureTile(title: "موجز يومي", subtitle: "أهم ما يهمك في دقائق", icon: "doc.text.magnifyingglass")
            featureTile(title: "اقتراحات ذكية", subtitle: "توصيات من سبق AI", icon: "sparkles")
            featureTile(title: "محفوظاتك", subtitle: "اقرأها من أي جهاز", icon: "bookmark.fill")
            featureTile(title: "إحصاءات قراءتك", subtitle: "مقالاتك ووقتك", icon: "chart.bar.fill")
        }
    }

    private func featureTile(title: String, subtitle: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(SabqTheme.primary)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .accessibilityHidden(true)
            Text(title)
                .font(SabqType.rowTitle.font)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(subtitle)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(2)
        }
        .padding(SabqLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
        .accessibilityElement(children: .combine)
    }

    // MARK: - Guest landing

    private var guestLanding: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            guestHero
            valueGrid
            guestInterestsPreview
            guestBenefits
            guestActions
        }
    }

    private var guestHero: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            Image(systemName: "sparkles.rectangle.stack.fill")
                .font(SabqFonts.app(size: 26, weight: .regular))
                .foregroundStyle(SabqTheme.primary)
                .symbolRenderingMode(.hierarchical)
                .frame(width: 56, height: 56)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.surfaceMuted)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text("موجزك في سبق")
                    .font(SabqType.articleTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("صفحة شخصية تبدأ من اهتماماتك: تختار ما يهمك، وسبق ترتّب لك موجزاً يومياً، توصيات، وإحصاءات قراءة واضحة.")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var guestInterestsPreview: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionTitle("ابدأ باختيار ما يهمك")

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 74), spacing: SabqLayout.space8)], alignment: .leading, spacing: SabqLayout.space8) {
                ForEach(["محليات", "اقتصاد", "رياضة", "تقنية", "رأي", "لحظة بلحظة", "العالم", "صحة"], id: \.self) { item in
                    Text(item)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.horizontal, SabqLayout.space8)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
                        )
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var guestBenefits: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Text("بعد التسجيل تحصل على")
                .font(SabqType.rowTitle.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            benefitRow("موجز صباحي أو مسائي مبني على اهتماماتك", icon: "sun.max.fill")
            benefitRow("اقتراحات أخبار أدق كلما قرأت أكثر", icon: "wand.and.stars")
            benefitRow("حفظ المقالات والعودة لها من أي جهاز", icon: "bookmark.fill")
        }
        .padding(SabqLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
    }

    private func benefitRow(_ text: String, icon: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.primary)
                .frame(width: 20)
                .accessibilityHidden(true)
            Text(text)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var guestActions: some View {
        VStack(spacing: SabqLayout.space8) {
            Button {
                showSignUp = true
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "sparkles")
                        .font(SabqType.tag.font)
                    Text("ابدأ التسجيل مع SABQ AI")
                        .font(SabqType.button.font)
                }
                .foregroundStyle(SabqTheme.onAction)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)

            Button {
                showLogin = true
            } label: {
                Text("لديك حساب؟ تسجيل الدخول")
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.primary)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Interests picker sheet

/// Modal sheet that lets a logged-in user toggle their category interests on
/// and off. Persists via `AuthStore.updateInterests(_:)` on save.
/// Categories cache that survives sheet open/close — first launch fetches
/// once, every subsequent open shows the saved list instantly. Lives outside
/// the view so re-presenting the sheet doesn't re-fire the load.
@MainActor
final class InterestsCategoryCache {
    static let shared = InterestsCategoryCache()
    private(set) var categories: [APICategory] = []
    private(set) var lastLoaded: Date?

    func get() -> [APICategory] { categories }

    func loadIfStale(maxAge: TimeInterval = 600) async {
        if let last = lastLoaded, Date().timeIntervalSince(last) < maxAge, !categories.isEmpty {
            return
        }
        let fetched = await NewsService.fetchCategories()
        if !fetched.isEmpty {
            categories = fetched
            lastLoaded = Date()
        }
    }
}

/// Rebuilt interests picker — self-fetches categories (with a skeleton until
/// the cache is warm), shows a sticky header with the live selection counter,
/// supports "حدد الكل" / "امسح الكل" bulk actions, and uses bigger
/// category-tinted chips that read at a glance.
struct InterestsPickerSheet: View {
    let allCategories: [APICategory]
    let selectedIds: Set<String>

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore
    @State private var categories: [APICategory] = []
    @State private var selection: Set<String> = []
    @State private var isSaving = false
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                stickyHeader

                ScrollView {
                    if isLoading && categories.isEmpty {
                        skeletonGrid
                    } else if categories.isEmpty {
                        emptyState
                    } else {
                        chipGrid
                    }
                }

                bottomBar
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .navigationTitle("اهتماماتك")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
            .task {
                // Seed from the prop if the caller pre-loaded them, then
                // refresh from cache (instant if warm, fetch otherwise).
                if !allCategories.isEmpty {
                    categories = allCategories
                    isLoading = false
                }
                selection = selectedIds
                await InterestsCategoryCache.shared.loadIfStale()
                let cached = InterestsCategoryCache.shared.get()
                if !cached.isEmpty {
                    withAnimation(.easeOut(duration: 0.2)) {
                        categories = cached
                        isLoading = false
                    }
                } else if categories.isEmpty {
                    isLoading = false
                }
            }
        }
    }

    // MARK: - Sticky header (selection counter + bulk actions)

    private var stickyHeader: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("اختر ما يهمّك")
                        .font(SabqType.sectionHeading.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("سبق ترتّب موجزك اليومي على هذه التصنيفات.")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer(minLength: SabqLayout.space8)
                Text("\(selection.count)")
                    .font(SabqType.button.font)
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.onAction)
                    .frame(minWidth: 40, minHeight: 32)
                    .padding(.horizontal, SabqLayout.space8)
                    .background(Capsule().fill(SabqTheme.actionFill))
            }

            HStack(spacing: SabqLayout.space8) {
                Button {
                    SabqHaptics.light()
                    selection = Set(categories.map(\.id))
                } label: {
                    Text("حدد الكل")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.horizontal, SabqLayout.space12)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(SabqTheme.surfaceMuted))
                        .frame(minHeight: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Button {
                    SabqHaptics.light()
                    selection.removeAll()
                } label: {
                    Text("امسح الكل")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.horizontal, SabqLayout.space12)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(SabqTheme.surfaceMuted))
                        .frame(minHeight: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(selection.isEmpty)
                .opacity(selection.isEmpty ? 0.5 : 1.0)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space16)
        .padding(.bottom, SabqLayout.space8)
        .background(SabqTheme.background)
        .overlay(
            Rectangle()
                .fill(SabqTheme.separator)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    // MARK: - Chip grid

    private var chipGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: SabqLayout.space8)], alignment: .leading, spacing: SabqLayout.space8) {
            ForEach(categories) { category in
                interestChip(category: category)
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space16)
        .padding(.bottom, SabqLayout.space24)
    }

    private func interestChip(category: APICategory) -> some View {
        let id = category.id
        let isOn = selection.contains(id)
        return Button {
            SabqHaptics.light()
            withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                if isOn { selection.remove(id) } else { selection.insert(id) }
            }
        } label: {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(SabqFonts.app(size: 18, weight: .regular))
                    .foregroundStyle(isOn ? SabqTheme.onAction : SabqTheme.textTertiary)
                    .accessibilityHidden(true)
                Text(category.name.isEmpty ? (category.slug ?? "—") : category.name)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(isOn ? SabqTheme.onAction : SabqTheme.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, SabqLayout.space12)
            .padding(.vertical, SabqLayout.space12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 56)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(isOn ? SabqTheme.actionFill : SabqTheme.surfaceMuted)
            )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    // MARK: - Skeleton + empty

    private var skeletonGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: SabqLayout.space8)], alignment: .leading, spacing: SabqLayout.space8) {
            ForEach(0..<10, id: \.self) { _ in
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
                    .frame(height: 56)
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space16)
        .padding(.bottom, SabqLayout.space24)
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "square.grid.2x2.fill")
                .font(SabqFonts.app(size: 26))
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 56, height: 56)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium))
                .accessibilityHidden(true)
            Text("لم نستطع تحميل التصنيفات")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Button {
                Task {
                    isLoading = true
                    await InterestsCategoryCache.shared.loadIfStale(maxAge: 0)
                    categories = InterestsCategoryCache.shared.get()
                    isLoading = false
                }
            } label: {
                Text("إعادة المحاولة")
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(SabqTheme.actionFill)
                    )
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space40)
    }

    // MARK: - Bottom save bar

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Button {
                Task { await save() }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    if isSaving {
                        ProgressView().tint(selection.isEmpty ? SabqTheme.textPrimary : SabqTheme.onAction)
                    }
                    Text(selection.isEmpty
                         ? "تخطّي الآن"
                         : "حفظ \(selection.count) تصنيف")
                        .font(SabqType.button.font)
                }
                // «تخطّي» زر ثانوي بحد، و«حفظ» زر أساسي ممتلئ.
                .foregroundStyle(selection.isEmpty ? SabqTheme.textPrimary : SabqTheme.onAction)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(selection.isEmpty ? SabqTheme.surface : SabqTheme.actionFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(selection.isEmpty ? SabqTheme.outline : Color.clear, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space12)
            .padding(.bottom, SabqLayout.space16)
        }
        .background(SabqTheme.background)
        .overlay(
            Rectangle()
                .fill(SabqTheme.separator)
                .frame(height: 1),
            alignment: .top
        )
    }

    private func save() async {
        isSaving = true
        await authStore.updateInterests(categoryIds: Array(selection))
        isSaving = false
        dismiss()
    }
}
