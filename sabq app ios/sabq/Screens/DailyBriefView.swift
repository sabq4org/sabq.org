import SwiftUI

struct DailyBriefRoute: Hashable {}

// Authenticated personal-analytics dashboard. Source: GET /api/ai/daily-summary.
// Falls back to a friendly "sign-in" prompt when the response is 401.
struct DailyBriefView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var summary: APIDailySummary?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var needsAuth = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                if isLoading {
                    skeleton
                } else if needsAuth {
                    authPrompt
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

    private var authPrompt: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd.opacity(0.14))
                    .frame(width: 80, height: 80)
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .font(.system(size: 36, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .symbolRenderingMode(.hierarchical)
            }
            Text("سجّل دخولك لمشاهدة موجزك")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Text("اللوحة الشخصية تعرض إحصاءات قراءتك، اهتماماتك، ومقترحات الذكاء الاصطناعي بناءً على نشاطك.")
                .font(.system(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
        }
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity)
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
        isLoading = true
        errorMessage = nil
        do {
            summary = try await APIClient.shared.fetchDailySummary()
            needsAuth = false
        } catch APIError.unauthorized {
            needsAuth = true
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
        }
        isLoading = false
    }
}
