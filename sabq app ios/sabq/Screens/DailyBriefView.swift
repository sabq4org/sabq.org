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
            VStack(alignment: .leading, spacing: 18) {
                if authStore.isLoggedIn, let user = authStore.currentUser {
                    memberDashboard(user: user)
                } else {
                    guestLanding
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
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
        return HStack(spacing: 10) {
            statTile(value: "\(bookmarks)", label: "محفوظ", icon: "bookmark.fill", tint: SabqTheme.primaryEnd)
            statTile(value: "\(interests)", label: "اهتماماتك", icon: "slider.horizontal.3", tint: SabqTheme.teal)
            statTile(value: days != nil ? "\(days!)" : "—", label: "يوم معك", icon: "calendar", tint: SabqTheme.gold)
        }
    }

    private func statTile(value: String, label: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(tint)
                Spacer(minLength: 0)
            }
            Text(value)
                .font(SabqFonts.app(size: 22, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .monospacedDigit()
            Text(label)
                .font(SabqFonts.app(size: 10, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(1)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.16), lineWidth: 0.5)
        )
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
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.coral)
                Text("اقتراحات لك من اهتماماتك")
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(suggestions) { article in
                        NavigationLink(value: article) {
                            suggestionCard(article: article)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    private func suggestionCard(article: Article) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let urlString = article.imageURL, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    Rectangle().fill(article.category.tint.opacity(0.15))
                }
                .frame(width: 220, height: 124)
                .clipShape(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous))
                .aiImageBadgeOverlay(
                    isVisible: article.isAiGeneratedImage,
                    model: article.aiImageModel,
                    inset: 6,
                    sizeScale: 0.75
                )
            } else {
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .fill(article.category.tint.opacity(0.15))
                    .frame(width: 220, height: 124)
            }
            Text(article.category.title)
                .font(SabqFonts.app(size: 10, weight: .regular))
                .foregroundStyle(article.category.tint)
            Text(article.title)
                .font(SabqFonts.app(size: 13.5, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.leading)
                .lineLimit(3)
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
        let (icon, label, subtitle, tint) = Self.inferMood(from: interestSlugs)
        return HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle().fill(tint.opacity(0.14)).frame(width: 46, height: 46)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 20, weight: .semibold))
                    .foregroundStyle(tint)
                    .symbolRenderingMode(.hierarchical)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text("مزاجك القرائي اليوم")
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Text(label)
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text(subtitle)
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(tint.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.20), lineWidth: 0.5)
        )
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
        guard let raw, let date = ISO8601DateFormatter().date(from: raw) else { return nil }
        let diff = Calendar.current.dateComponents([.day], from: date, to: Date()).day ?? 0
        return max(0, diff)
    }

    private func memberHero(user: APIUser) -> some View {
        HStack(alignment: .center, spacing: 14) {
            avatar(user: user)
            VStack(alignment: .leading, spacing: 6) {
                Text(user.displayName)
                    .font(SabqFonts.app(size: 18, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text(user.localizedRole)
                        .font(SabqFonts.app(size: 11, weight: .regular))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .lineLimit(1)
                }
                if let email = user.email, !email.isEmpty {
                    Text(email)
                        .font(SabqFonts.app(size: 11, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(LinearGradient(
                            colors: [SabqTheme.primaryEnd.opacity(0.08), SabqTheme.sky.opacity(0.04)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 0.5)
        )
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
        .overlay(Circle().stroke(SabqTheme.primaryEnd.opacity(0.3), lineWidth: 1.5))
    }

    private func avatarPlaceholder(user: APIUser) -> some View {
        Circle()
            .fill(SabqTheme.primaryEnd.opacity(0.15))
            .frame(width: 64, height: 64)
            .overlay {
                Text(String(user.displayName.prefix(1)))
                    .font(SabqFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    @ViewBuilder
    private func interestsCard(user: APIUser) -> some View {
        let interests = user.interests
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "slider.horizontal.3")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("اهتماماتك")
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
                Button {
                    showInterestsPicker = true
                } label: {
                    Text(interests.isEmpty ? "اختر اهتماماتك" : "تعديل")
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
                .buttonStyle(.plain)
            }

            if interests.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("لم تختر بعد اهتماماتك. اختر بضع تصنيفات لنقترح عليك أهم الأخبار في كل زيارة.")
                        .font(SabqFonts.app(size: 13, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(4)

                    Button {
                        showInterestsPicker = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus.circle.fill")
                                .font(SabqFonts.app(size: 12, weight: .medium))
                            Text("اختر اهتماماتك الآن")
                                .font(SabqFonts.app(size: 12, weight: .medium))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            Capsule().fill(SabqTheme.primaryEnd)
                        )
                    }
                    .buttonStyle(.plain)
                }
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(interests) { interest in
                        Text(interest.name ?? interest.slug ?? "—")
                            .font(SabqFonts.app(size: 11, weight: .regular))
                            .foregroundStyle(SabqTheme.primaryEnd)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(
                                Capsule().fill(SabqTheme.primaryEnd.opacity(0.12))
                            )
                    }
                }

                Text("\(interests.count) تصنيف نختار لك منه أخباراً يومية")
                    .font(SabqFonts.app(size: 10, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.35), lineWidth: 0.5)
        )
    }

    private var valueGrid: some View {
        let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        return LazyVGrid(columns: columns, spacing: 12) {
            featureTile(title: "موجز يومي", subtitle: "أهم ما يهمك في دقائق", icon: "doc.text.magnifyingglass", tint: SabqTheme.teal)
            featureTile(title: "اقتراحات ذكية", subtitle: "توصيات من سبق AI", icon: "sparkles", tint: SabqTheme.coral)
            featureTile(title: "محفوظاتك", subtitle: "اقرأها من أي جهاز", icon: "bookmark.fill", tint: SabqTheme.primaryEnd)
            featureTile(title: "إحصاءات قراءتك", subtitle: "مقالاتك ووقتك", icon: "chart.bar.fill", tint: SabqTheme.gold)
        }
    }

    private func featureTile(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            ZStack {
                Circle().fill(tint.opacity(0.13)).frame(width: 34, height: 34)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(title)
                .font(SabqFonts.app(size: 14, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            Text(subtitle)
                .font(SabqFonts.app(size: 11))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.16), lineWidth: 0.5)
        )
    }

    // MARK: - Guest landing

    private var guestLanding: some View {
        VStack(alignment: .leading, spacing: 18) {
            guestHero
            valueGrid
            guestInterestsPreview
            guestBenefits
            guestActions
        }
    }

    private var guestHero: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd.opacity(0.12))
                    .frame(width: 74, height: 74)
                Image(systemName: "sparkles.rectangle.stack.fill")
                    .font(SabqFonts.app(size: 32, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .symbolRenderingMode(.hierarchical)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("موجزك في سبق")
                    .font(SabqFonts.app(size: 26, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text("صفحة شخصية تبدأ من اهتماماتك: تختار ما يهمك، وسبق ترتّب لك موجزاً يومياً، توصيات، وإحصاءات قراءة واضحة.")
                    .font(SabqFonts.app(size: 14))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(LinearGradient(
                            colors: [SabqTheme.primaryEnd.opacity(0.08), SabqTheme.sky.opacity(0.04)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 0.5)
        )
    }

    private var guestInterestsPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Image(systemName: "person.text.rectangle.fill")
                    .font(SabqFonts.app(size: 13))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("ابدأ باختيار ما يهمك")
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 74), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(["محليات", "اقتصاد", "رياضة", "تقنية", "رأي", "لحظة بلحظة", "العالم", "صحة"], id: \.self) { item in
                    Text(item)
                        .font(SabqFonts.app(size: 11, weight: .regular))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .frame(maxWidth: .infinity)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.primaryEnd.opacity(0.08))
                        )
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.35), lineWidth: 0.5)
        )
    }

    private var guestBenefits: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("بعد التسجيل تحصل على")
                .font(SabqFonts.app(size: 15, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)

            benefitRow("موجز صباحي أو مسائي مبني على اهتماماتك", icon: "sun.max.fill")
            benefitRow("اقتراحات أخبار أدق كلما قرأت أكثر", icon: "wand.and.stars")
            benefitRow("حفظ المقالات والعودة لها من أي جهاز", icon: "bookmark.fill")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.primaryEnd.opacity(0.05))
        )
    }

    private func benefitRow(_ text: String, icon: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 11, weight: .regular))
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(width: 18)
            Text(text)
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var guestActions: some View {
        VStack(spacing: 10) {
            Button {
                showSignUp = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                    Text("ابدأ التسجيل مع SABQ AI")
                        .font(SabqFonts.app(size: 16, weight: .heavy))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            }
            .buttonStyle(.plain)

            Button {
                showLogin = true
            } label: {
                Text("لديك حساب؟ تسجيل الدخول")
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
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
                        .foregroundStyle(SabqTheme.secondaryInk)
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
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("اختر ما يهمّك")
                        .font(SabqFonts.app(size: 17, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    Text("سبق ترتّب موجزك اليومي على هذه التصنيفات.")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Spacer(minLength: 8)
                Text("\(selection.count)")
                    .font(SabqFonts.app(size: 17, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(minWidth: 40, minHeight: 32)
                    .padding(.horizontal, 8)
                    .background(
                        Capsule().fill(LinearGradient(
                            colors: [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                    )
            }

            HStack(spacing: 8) {
                Button {
                    SabqHaptics.light()
                    selection = Set(categories.map(\.id))
                } label: {
                    Text("حدد الكل")
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(SabqTheme.primaryEnd.opacity(0.10)))
                }
                .buttonStyle(.plain)

                Button {
                    SabqHaptics.light()
                    selection.removeAll()
                } label: {
                    Text("امسح الكل")
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(SabqTheme.paleFill))
                }
                .buttonStyle(.plain)
                .disabled(selection.isEmpty)
                .opacity(selection.isEmpty ? 0.5 : 1.0)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .fill(SabqTheme.outline.opacity(0.35))
                .frame(height: 0.5),
            alignment: .bottom
        )
    }

    // MARK: - Chip grid

    private var chipGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 10)], alignment: .leading, spacing: 10) {
            ForEach(categories) { category in
                interestChip(category: category)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 100)
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
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                        .font(SabqFonts.app(size: 14, weight: .heavy))
                        .foregroundStyle(isOn ? Color.white : SabqTheme.tertiaryInk)
                    Spacer(minLength: 0)
                }
                Text(category.name.isEmpty ? (category.slug ?? "—") : category.name)
                    .font(SabqFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(isOn ? .white : SabqTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 72)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(isOn ? SabqTheme.primaryEnd : SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(isOn ? Color.clear : SabqTheme.outline.opacity(0.45), lineWidth: 0.8)
            )
            .shadow(color: isOn ? SabqTheme.primaryEnd.opacity(0.18) : .clear, radius: 6, y: 2)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Skeleton + empty

    private var skeletonGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 10)], alignment: .leading, spacing: 10) {
            ForEach(0..<10, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(SabqTheme.paleFill)
                    .frame(height: 72)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 100)
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "square.grid.2x2.fill")
                .font(SabqFonts.app(size: 32))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text("لم نستطع تحميل التصنيفات")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
            Button {
                Task {
                    isLoading = true
                    await InterestsCategoryCache.shared.loadIfStale(maxAge: 0)
                    categories = InterestsCategoryCache.shared.get()
                    isLoading = false
                }
            } label: {
                Text("إعادة المحاولة")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 9)
                    .background(Capsule().fill(SabqTheme.primaryEnd))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Bottom save bar

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Button {
                Task { await save() }
            } label: {
                HStack(spacing: 8) {
                    if isSaving {
                        ProgressView().tint(.white)
                    }
                    Text(selection.isEmpty
                         ? "تخطّي الآن"
                         : "حفظ \(selection.count) تصنيف")
                        .font(SabqFonts.app(size: 16, weight: .heavy))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(
                    selection.isEmpty
                    ? AnyShapeStyle(SabqTheme.tertiaryInk)
                    : AnyShapeStyle(SabqTheme.brandGradient),
                    in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                )
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .padding(.horizontal, 18)
            .padding(.top, 12)
            .padding(.bottom, 16)
        }
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .fill(SabqTheme.outline.opacity(0.35))
                .frame(height: 0.5),
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
