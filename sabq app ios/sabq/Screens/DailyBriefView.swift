import SwiftUI

struct DailyBriefRoute: Hashable {}

/// «موجز سبق» — five published must-know stories in roughly two minutes.
/// Guests receive the shared edition; members can receive up to two
/// interest-based stories without hiding the common top news.
struct DailyBriefView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(ArticlesStore.self) private var articlesStore
    @State private var showLogin = false
    @State private var showSignUp = false
    @State private var showInterestsPicker = false
    @State private var allCategories: [APICategory] = []
    @State private var brief: APIDailyBrief?
    @State private var isBriefLoading = true
    @State private var briefError: String?
    @State private var didLogBriefOpen = false
    @AppStorage("sabq_daily_brief_progress_edition") private var progressEdition = ""
    @AppStorage("sabq_daily_brief_progress_count") private var progressCount = 0

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if isBriefLoading, brief == nil {
                        dailyBriefLoadingState
                    } else if let briefError, brief == nil {
                        EmptyStateView(
                            icon: "wifi.exclamationmark",
                            tint: SabqTheme.coral,
                            title: "تعذّر تحميل موجز سبق",
                            subtitle: briefError,
                            action: { Task { await loadDailyBrief(ignoreCache: true) } },
                            actionTitle: "إعادة المحاولة"
                        )
                        .padding(.top, 70)
                    } else if let brief, brief.items.isEmpty {
                        EmptyStateView(
                            icon: "newspaper",
                            tint: SabqTheme.primaryEnd,
                            title: "لا توجد أخبار في الموجز الآن",
                            subtitle: "سنحدّث الموجز فور وصول أخبار جديدة."
                        )
                        .padding(.top, 70)
                    } else if let brief {
                        dailyBriefHero(brief)
                        ForEach(Array(brief.items.enumerated()), id: \.element.id) { index, item in
                            dailyBriefStory(item, index: index, brief: brief)
                                .id(item.id)
                        }
                        dailyBriefPersonalizationFooter(brief)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 60)
            }
            .refreshable { await loadDailyBrief(ignoreCache: true) }
            .task {
                await loadDailyBrief()
                await InterestsCategoryCache.shared.loadIfStale()
                allCategories = InterestsCategoryCache.shared.get()
                await resumeDailyBriefIfNeeded(using: proxy)
            }
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .sabqScreen("Daily Brief")
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
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await loadDailyBrief(ignoreCache: true) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
                .disabled(isBriefLoading)
                .accessibilityLabel("تحديث موجز سبق")
            }
        }
        .sheet(isPresented: $showLogin, onDismiss: {
            Task { await loadDailyBrief(ignoreCache: true) }
        }) {
            LoginSheet(initialMode: false)
        }
        .sheet(isPresented: $showSignUp) {
            SignUpFlowView()
                .environment(authStore)
        }
        .sheet(isPresented: $showInterestsPicker, onDismiss: {
            Task { await loadDailyBrief(ignoreCache: true) }
        }) {
            InterestsPickerSheet(allCategories: allCategories, selectedIds: Set(authStore.currentUser?.interests.map(\.id) ?? []))
                .environment(authStore)
        }
    }

    // MARK: - Daily brief

    private func dailyBriefHero(_ brief: APIDailyBrief) -> some View {
        let progress = dailyBriefProgress(brief)
        let complete = progress >= brief.itemCount && brief.itemCount > 0

        return VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 13) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(SabqTheme.brandGradient)
                        .frame(width: 58, height: 58)
                    Image(systemName: "newspaper.fill")
                        .font(SabqFonts.app(size: 24, weight: .semibold))
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("موجز سبق")
                        .font(SabqFonts.app(size: 24, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    Text("\(brief.editionLabel) • \(dailyBriefUpdatedText(brief.updatedAt))")
                        .font(SabqFonts.app(size: 11.5, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }

                Spacer(minLength: 0)
            }

            Text(brief.headline)
                .font(SabqFonts.app(size: 18, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)

            HStack(spacing: 14) {
                dailyBriefMeta(icon: "doc.text", text: "\(brief.itemCount) أخبار")
                dailyBriefMeta(
                    icon: "clock",
                    text: dailyBriefDurationText(brief.estimatedReadingSeconds)
                )
                if brief.personalization.isPersonalized {
                    dailyBriefMeta(
                        icon: "person.crop.circle.badge.checkmark",
                        text: "\(brief.personalization.personalizedItemCount) لك"
                    )
                }
            }

            if progress > 0 {
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Text(complete ? "اكتمل موجزك" : "تقدمك")
                            .font(SabqFonts.app(size: 11.5, weight: .semibold))
                            .foregroundStyle(complete ? SabqTheme.teal : SabqTheme.secondaryInk)
                        Spacer()
                        Text("\(min(progress, brief.itemCount)) من \(brief.itemCount)")
                            .font(SabqFonts.app(size: 11, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(SabqTheme.primaryEnd)
                    }
                    ProgressView(
                        value: Double(min(progress, brief.itemCount)),
                        total: Double(max(1, brief.itemCount))
                    )
                    .tint(complete ? SabqTheme.teal : SabqTheme.primaryEnd)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    SabqTheme.primaryEnd.opacity(0.10),
                                    SabqTheme.sky.opacity(0.035),
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.primaryEnd.opacity(0.20), lineWidth: 0.75)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "موجز سبق، \(brief.editionLabel)، \(brief.itemCount) أخبار، \(dailyBriefDurationText(brief.estimatedReadingSeconds))"
        )
    }

    private func dailyBriefMeta(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 10, weight: .medium))
            Text(text)
                .font(SabqFonts.app(size: 10.5, weight: .medium))
                .lineLimit(1)
        }
        .foregroundStyle(SabqTheme.secondaryInk)
    }

    private func dailyBriefStory(
        _ item: APIDailyBrief.Item,
        index: Int,
        brief: APIDailyBrief
    ) -> some View {
        let tint = ArticleCategory(fromSection: item.category.name).tint
        let isRead = dailyBriefProgress(brief) > index

        return VStack(alignment: .leading, spacing: 0) {
            if let imageUrl = item.imageUrl,
               let url = URL(string: imageUrl) {
                FocalCachedAsyncImage(url: url, focalPoint: item.imageFocalPoint) {
                    Rectangle().fill(tint.opacity(0.12))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 188)
                .clipped()
                .aiImageBadgeOverlay(
                    isVisible: item.isAiGeneratedImage,
                    model: item.aiImageModel,
                    inset: 8,
                    sizeScale: 0.8
                )
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 7) {
                    Text("\(index + 1) من \(brief.itemCount)")
                        .font(SabqFonts.app(size: 10, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.primaryEnd)

                    Circle()
                        .fill(SabqTheme.outline)
                        .frame(width: 3, height: 3)

                    Text(item.category.name)
                        .font(SabqFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(tint)

                    if item.isBreaking {
                        Text("عاجل")
                            .font(SabqFonts.app(size: 9, weight: .heavy))
                            .foregroundStyle(SabqTheme.coral)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(SabqTheme.coral.opacity(0.10)))
                    } else if item.isPersonalized {
                        Text("مختار لك")
                            .font(SabqFonts.app(size: 9, weight: .bold))
                            .foregroundStyle(SabqTheme.primaryEnd)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(SabqTheme.primaryEnd.opacity(0.09)))
                    }

                    Spacer(minLength: 4)

                    if let relative = dailyBriefRelativeDate(item.publishedAt) {
                        Text(relative)
                            .font(SabqFonts.app(size: 9.5))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .lineLimit(1)
                    }
                }

                Text(item.title)
                    .font(SabqFonts.app(size: 18, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)

                if item.bullets.isEmpty {
                    Text(item.summary)
                        .font(SabqFonts.app(size: 13.5, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                } else {
                    VStack(alignment: .leading, spacing: 9) {
                        ForEach(Array(item.bullets.enumerated()), id: \.offset) { _, bullet in
                            HStack(alignment: .top, spacing: 8) {
                                Circle()
                                    .fill(tint)
                                    .frame(width: 5, height: 5)
                                    .padding(.top, 7)
                                Text(bullet)
                                    .font(SabqFonts.app(size: 13.5, weight: .regular))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                    .lineSpacing(4)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }

                Rectangle()
                    .fill(SabqTheme.outline.opacity(0.55))
                    .frame(height: 0.5)

                HStack(spacing: 10) {
                    NavigationLink(value: ArticleSlugRoute(slug: item.slug)) {
                        HStack(spacing: 5) {
                            Text("اقرأ الخبر")
                            Image(systemName: "arrow.left")
                        }
                        .font(SabqFonts.app(size: 12.5, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 9)
                        .background(
                            Capsule().fill(SabqTheme.primaryEnd)
                        )
                    }
                    .buttonStyle(.plain)
                    .simultaneousGesture(TapGesture().onEnded {
                        markDailyBriefProgress(index + 1, brief: brief)
                        SabqAnalytics.log("daily_brief_article_open", parameters: [
                            "brief_id": brief.id,
                            "article_id": item.id,
                            "position": index + 1,
                            "personalized": item.isPersonalized,
                        ])
                    })

                    Spacer(minLength: 0)

                    Button {
                        markDailyBriefProgress(index + 1, brief: brief)
                        SabqHaptics.light()
                    } label: {
                        Image(systemName: isRead ? "checkmark.circle.fill" : "checkmark.circle")
                            .foregroundStyle(isRead ? SabqTheme.teal : SabqTheme.secondaryInk)
                    }
                    .accessibilityLabel(isRead ? "تمت قراءة الخبر" : "تحديد الخبر كمقروء")

                    Button {
                        let article = dailyBriefArticle(item)
                        bookmarksStore.toggle(item.id, article: article)
                        SabqHaptics.light()
                    } label: {
                        Image(systemName: bookmarksStore.isBookmarked(item.id) ? "bookmark.fill" : "bookmark")
                            .foregroundStyle(
                                bookmarksStore.isBookmarked(item.id)
                                    ? SabqTheme.primaryEnd
                                    : SabqTheme.secondaryInk
                            )
                    }
                    .accessibilityLabel(
                        bookmarksStore.isBookmarked(item.id) ? "إزالة من المحفوظات" : "حفظ الخبر"
                    )

                    Button {
                        shareDailyBriefItem(item)
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .accessibilityLabel("مشاركة الخبر")
                }
                .font(SabqFonts.app(size: 17, weight: .medium))
                .buttonStyle(.plain)
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .clipShape(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(
                    isRead ? SabqTheme.teal.opacity(0.25) : SabqTheme.outline.opacity(0.45),
                    lineWidth: isRead ? 1 : 0.5
                )
        )
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func dailyBriefPersonalizationFooter(_ brief: APIDailyBrief) -> some View {
        if brief.personalization.isPersonalized {
            HStack(alignment: .top, spacing: 9) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(SabqTheme.teal)
                Text("أبقينا أهم الأخبار للجميع، واخترنا لك \(brief.personalization.personalizedItemCount) حسب اهتماماتك.")
                    .font(SabqFonts.app(size: 11.5))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 4)
        } else if authStore.isLoggedIn {
            Button {
                showInterestsPicker = true
            } label: {
                HStack(spacing: 9) {
                    Image(systemName: "slider.horizontal.3")
                    VStack(alignment: .leading, spacing: 2) {
                        Text("خصّص خبرين من الموجز")
                            .font(SabqFonts.app(size: 12.5, weight: .bold))
                        Text("اختر اهتماماتك، وستبقى الأخبار الأساسية كما هي.")
                            .font(SabqFonts.app(size: 10.5))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.left")
                        .font(SabqFonts.app(size: 10, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.primaryEnd)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(SabqTheme.primaryEnd.opacity(0.06))
                )
            }
            .buttonStyle(.plain)
        } else {
            Button {
                showLogin = true
            } label: {
                HStack(spacing: 9) {
                    Image(systemName: "person.crop.circle.badge.plus")
                    VStack(alignment: .leading, spacing: 2) {
                        Text("اجعل الموجز أقرب لك")
                            .font(SabqFonts.app(size: 12.5, weight: .bold))
                        Text("سجّل الدخول لتخصيص خبرين، والموجز العام سيبقى متاحاً دائماً.")
                            .font(SabqFonts.app(size: 10.5))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.left")
                        .font(SabqFonts.app(size: 10, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.primaryEnd)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(SabqTheme.primaryEnd.opacity(0.06))
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var dailyBriefLoadingState: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(SabqTheme.paleFill)
                    .frame(width: 58, height: 58)
                VStack(alignment: .leading, spacing: 8) {
                    Text("موجز سبق")
                        .font(SabqFonts.app(size: 23, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    Text("نرتب أهم الأخبار لك…")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
            }

            ForEach(0..<3, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 10) {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(SabqTheme.paleFill)
                        .frame(height: 160)
                    RoundedRectangle(cornerRadius: 5)
                        .fill(SabqTheme.paleFill)
                        .frame(height: 16)
                    RoundedRectangle(cornerRadius: 5)
                        .fill(SabqTheme.paleFill)
                        .frame(width: 250, height: 13)
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(SabqTheme.surface)
                )
            }
        }
        .accessibilityLabel("جارٍ تحميل موجز سبق")
    }

    private func dailyBriefProgress(_ brief: APIDailyBrief) -> Int {
        guard progressEdition == brief.id else { return 0 }
        return min(max(progressCount, 0), brief.itemCount)
    }

    private func markDailyBriefProgress(_ count: Int, brief: APIDailyBrief) {
        let previous = progressEdition == brief.id ? progressCount : 0
        if progressEdition != brief.id {
            progressEdition = brief.id
            progressCount = 0
        }
        progressCount = max(progressCount, min(count, brief.itemCount))
        if previous < brief.itemCount, progressCount >= brief.itemCount {
            SabqAnalytics.log("daily_brief_complete", parameters: [
                "brief_id": brief.id,
                "item_count": brief.itemCount,
            ])
        }
    }

    private func resumeDailyBriefIfNeeded(using proxy: ScrollViewProxy) async {
        guard let brief,
              progressEdition == brief.id,
              progressCount > 0,
              progressCount < brief.itemCount,
              brief.items.indices.contains(progressCount) else { return }

        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.25)) {
            proxy.scrollTo(brief.items[progressCount].id, anchor: .top)
        }
    }

    private func dailyBriefDurationText(_ seconds: Int) -> String {
        let minutes = max(1, Int(ceil(Double(seconds) / 60)))
        switch minutes {
        case 1: return "دقيقة"
        case 2: return "دقيقتان"
        default: return "\(minutes) دقائق"
        }
    }

    private func dailyBriefUpdatedText(_ raw: String) -> String {
        guard let date = SabqFormatters.parseISO8601(raw) else { return "محدّث الآن" }
        return "حُدّث \(SabqFormatters.riyadhTime.string(from: date))"
    }

    private func dailyBriefRelativeDate(_ raw: String?) -> String? {
        guard let raw, let date = SabqFormatters.parseISO8601(raw) else { return nil }
        return SabqFormatters.relativeArabic.localizedString(for: date, relativeTo: Date())
    }

    private func dailyBriefArticle(_ item: APIDailyBrief.Item) -> Article {
        var article = Article(
            id: item.id,
            title: item.title,
            excerpt: item.summary,
            aiSummary: item.summary,
            body: item.summary,
            bodyHTML: "",
            category: ArticleCategory(fromSection: item.category.name),
            author: "سبق",
            publishDate: item.publishedAt.flatMap(SabqFormatters.parseISO8601) ?? Date(),
            isBreaking: item.isBreaking,
            isFeatured: false,
            tags: [],
            imageURL: item.imageUrl,
            slug: item.slug,
            articleURL: item.articleUrl
        )
        article.imageFocalPoint = item.imageFocalPoint
        article.isAiGeneratedImage = item.isAiGeneratedImage
        article.aiImageModel = item.aiImageModel
        return article
    }

    private func shareDailyBriefItem(_ item: APIDailyBrief.Item) {
        guard let url = URL(string: item.articleUrl) else { return }
        SabqAnalytics.log("daily_brief_share", parameters: ["article_id": item.id])
        SabqShareHelper.presentShareSheet(with: url)
    }

    @MainActor
    private func loadDailyBrief(ignoreCache: Bool = false) async {
        if brief == nil { isBriefLoading = true }
        briefError = nil
        defer { isBriefLoading = false }

        do {
            let loaded = try await APIClient.shared.fetchDailyBrief(ignoreCache: ignoreCache)
            brief = loaded
            if progressEdition != loaded.id {
                progressEdition = loaded.id
                progressCount = 0
            }
            if !didLogBriefOpen {
                didLogBriefOpen = true
                SabqAnalytics.log("daily_brief_open", parameters: [
                    "brief_id": loaded.id,
                    "edition": loaded.edition,
                    "item_count": loaded.itemCount,
                    "personalized": loaded.personalization.isPersonalized,
                ])
            }
        } catch {
            if brief == nil {
                briefError = "تحقّق من اتصالك بالإنترنت ثم أعد المحاولة."
            }
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
