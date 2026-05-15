import SwiftUI

struct DailyBriefRoute: Hashable {}

// Authenticated personal-analytics dashboard. Source: GET /api/ai/daily-summary.
// Guests see the membership landing page immediately instead of a failed API state.
struct DailyBriefView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore
    @State private var summary: APIDailySummary?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var needsAuth = false
    @State private var showLogin = false
    @State private var loginInitialMode = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                if isLoading {
                    skeleton
                } else if needsAuth {
                    guestLanding
                } else if let errorMessage {
                    EmptyStateView(
                        icon: "exclamationmark.shield",
                        tint: SabqTheme.coral,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if let summary {
                    if let greeting = summary.personalizedGreeting {
                        greetingCard(greeting)
                    }
                    if let metrics = summary.metrics {
                        metricsGrid(metrics)
                    }
                    if let interests = summary.interestAnalysis {
                        interestsCard(interests)
                    }
                    if let time = summary.timeActivity {
                        timeCard(time)
                    }
                    if let ai = summary.aiInsights {
                        aiCard(ai)
                    }
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
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .sheet(isPresented: $showLogin, onDismiss: {
            if authStore.isLoggedIn {
                Task { await load() }
            }
        }) {
            LoginSheet(initialMode: loginInitialMode)
        }
        .task { await load() }
    }

    private var skeleton: some View {
        VStack(spacing: 14) {
            SkeletonBox(height: 130, radius: SabqTheme.tileRadius)
            HStack(spacing: 12) {
                SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
                SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
            }
            SkeletonBox(height: 150, radius: SabqTheme.tileRadius)
            SkeletonBox(height: 110, radius: SabqTheme.tileRadius)
        }
    }

    private var guestLanding: some View {
        VStack(alignment: .leading, spacing: 18) {
            guestHero
            guestValueGrid
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
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .symbolRenderingMode(.hierarchical)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("موجزك في سبق")
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                Text("صفحة شخصية تبدأ من اهتماماتك: تختار ما يهمك، وسبق ترتّب لك موجزاً يومياً، توصيات، وإحصاءات قراءة واضحة.")
                    .font(.system(size: 14))
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

    private var guestValueGrid: some View {
        let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        return LazyVGrid(columns: columns, spacing: 12) {
            guestFeatureTile(title: "اهتماماتك", subtitle: "محليات، اقتصاد، رياضة وأكثر", icon: "slider.horizontal.3", tint: SabqTheme.primaryEnd)
            guestFeatureTile(title: "موجز يومي", subtitle: "أهم ما يهمك في دقائق", icon: "doc.text.magnifyingglass", tint: SabqTheme.teal)
            guestFeatureTile(title: "إحصاءات القراءة", subtitle: "مقالاتك، وقتك، ومحفوظاتك", icon: "chart.bar.fill", tint: SabqTheme.gold)
            guestFeatureTile(title: "اقتراحات ذكية", subtitle: "توصيات من سبق AI", icon: "sparkles", tint: SabqTheme.coral)
        }
    }

    private func guestFeatureTile(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            ZStack {
                Circle().fill(tint.opacity(0.13)).frame(width: 34, height: 34)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(title)
                .font(.system(size: 14, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
            Text(subtitle)
                .font(.system(size: 11))
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

    private var guestInterestsPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Image(systemName: "person.text.rectangle.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("ابدأ باختيار ما يهمك")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 74), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(["محليات", "اقتصاد", "رياضة", "تقنية", "رأي", "لحظة بلحظة", "العالم", "صحة"], id: \.self) { item in
                    Text(item)
                        .font(.system(size: 12, weight: .semibold))
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
                .font(.system(size: 15, weight: .heavy, design: .rounded))
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
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(width: 18)
            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Action row at the bottom of the landing. For genuine guests we show
    /// register + login CTAs. For already-authenticated users (who land here
    /// only because the Arabic /api/ai/daily-summary endpoint doesn't exist
    /// yet) we show a single "back to the homepage" CTA instead so they
    /// aren't asked to re-register.
    @ViewBuilder
    private var guestActions: some View {
        if authStore.isLoggedIn {
            Button {
                SabqHaptics.light()
                dismiss()
            } label: {
                Text("العودة للصفحة الرئيسية")
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            }
            .buttonStyle(.plain)
        } else {
            VStack(spacing: 10) {
                Button {
                    loginInitialMode = true
                    showLogin = true
                } label: {
                    Text("أنشئ حسابك")
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                }
                .buttonStyle(.plain)

                Button {
                    loginInitialMode = false
                    showLogin = true
                } label: {
                    Text("لديك حساب؟ تسجيل الدخول")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func greetingCard(_ g: APIDailySummary.PersonalizedGreeting) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("موجزك اليومي")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
            if let name = g.userName, !name.isEmpty {
                Text("مرحباً، \(name)")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
            }
            if let mood = g.readingMood, !mood.isEmpty {
                Text("نمط قراءتك اليوم: \(mood)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(SabqTheme.primaryEnd.opacity(0.05))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 0.5)
        )
    }

    private func metricsGrid(_ m: APIDailySummary.Metrics) -> some View {
        let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        return LazyVGrid(columns: columns, spacing: 12) {
            metricTile(label: "مقالات قُرأت", value: "\(m.articlesRead ?? 0)", icon: "newspaper", tint: SabqTheme.primaryEnd)
            metricTile(label: "دقائق القراءة", value: "\(m.readingTimeMinutes ?? 0)", icon: "clock", tint: SabqTheme.teal)
            metricTile(label: "نسبة الإكمال", value: "\(m.completionRate ?? 0)%", icon: "checkmark.circle", tint: SabqTheme.leaf)
            metricTile(label: "محفوظات", value: "\(m.articlesBookmarked ?? 0)", icon: "bookmark", tint: SabqTheme.gold)
        }
    }

    private func metricTile(label: String, value: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                Circle().fill(tint.opacity(0.12)).frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(value)
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(SabqTheme.ink)
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(tint.opacity(0.04))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.18), lineWidth: 0.5)
        )
    }

    private func interestsCard(_ i: APIDailySummary.InterestAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.fill").font(.system(size: 12)).foregroundStyle(SabqTheme.primaryEnd)
                Text("اهتماماتك").font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundStyle(SabqTheme.ink)
            }
            if let cats = i.topCategories, !cats.isEmpty {
                ForEach(cats.prefix(5)) { cat in
                    HStack(spacing: 10) {
                        Text(cat.name)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Spacer(minLength: 0)
                        Text("\(cat.count)")
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
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
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
    }

    private func timeCard(_ t: APIDailySummary.TimeActivity) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "clock.badge.fill").font(.system(size: 12)).foregroundStyle(SabqTheme.teal)
                Text("نشاطك خلال اليوم").font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundStyle(SabqTheme.ink)
            }
            if let peak = t.peakReadingTime {
                Text("أوقات الذروة: الساعة \(peak):00")
                    .font(.system(size: 12))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            if let s = t.aiSuggestion, !s.isEmpty {
                Text(s)
                    .font(.system(size: 12))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
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
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
    }

    private func aiCard(_ ai: APIDailySummary.AIInsights) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles").font(.system(size: 12)).foregroundStyle(SabqTheme.sky)
                Text("توصية الذكاء الاصطناعي").font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundStyle(SabqTheme.ink)
            }
            if let goal = ai.dailyGoal, !goal.isEmpty {
                Text(goal)
                    .font(.system(size: 13))
                    .foregroundStyle(SabqTheme.ink.opacity(0.9))
                    .lineSpacing(3)
            }
            if let focus = ai.focusScore {
                HStack(spacing: 6) {
                    Text("درجة التركيز").font(.system(size: 11, weight: .medium)).foregroundStyle(SabqTheme.tertiaryInk)
                    Text("\(focus)/100")
                        .font(.system(size: 12, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.sky)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.sky.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.sky.opacity(0.18), lineWidth: 0.5)
        )
    }

    private func load() async {
        guard authStore.isLoggedIn else {
            summary = nil
            errorMessage = nil
            needsAuth = true
            isLoading = false
            return
        }

        isLoading = true
        errorMessage = nil
        do {
            summary = try await APIClient.shared.fetchDailySummary()
            needsAuth = false
        } catch {
            // The Arabic `/api/ai/daily-summary` endpoint isn't implemented
            // yet — only `/api/en/ai/daily-summary` exists, so iOS always
            // 404s here. Show the membership value-prop landing instead of
            // a bare error: it's a useful screen on its own ("here's what
            // your account unlocks") and avoids a dead-end UX for logged-in
            // users. The previous `errorMessage = "تحقّق من الاتصال…"`
            // branch is gone because hitting Retry just 404s again.
            needsAuth = true
        }
        isLoading = false
    }
}
