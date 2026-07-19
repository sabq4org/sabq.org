import SwiftUI

struct OmqRoute: Hashable {}

struct OmqDetailRoute: Hashable {
    let id: String
    let title: String
}

// List view for the OMQ deep-analysis surface. Source: GET /api/omq.
struct OmqListView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var analyses: [APIDeepAnalysis] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                header

                if isLoading {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage {
                    EmptyStateView(
                        icon: "exclamationmark.shield",
                        tint: SabqTheme.coral,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if analyses.isEmpty {
                    EmptyStateView(
                        icon: "sparkles.rectangle.stack",
                        tint: SabqTheme.tertiaryInk,
                        title: "لا توجد تحليلات بعد",
                        subtitle: "تحليلات الذكاء الاصطناعي العميقة قيد التحضير — قريباً."
                    )
                } else {
                    ForEach(analyses) { analysis in
                        NavigationLink(value: OmqDetailRoute(id: analysis.id, title: analysis.title)) {
                            analysisCard(analysis)
                        }
                        .buttonStyle(.plain)
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
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .task { await load() }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.sky.opacity(0.14))
                    .frame(width: 56, height: 56)
                Image(systemName: "brain.head.profile")
                    .font(SabqFonts.app(size: 26, weight: .light))
                    .foregroundStyle(SabqTheme.sky)
                    .symbolRenderingMode(.hierarchical)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("تحليلات عميقة")
                    .font(SabqFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text("تحليلات أسبوعية لأهم القضايا بمزيج من نماذج الذكاء الاصطناعي")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
    }

    private func analysisCard(_ a: APIDeepAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let cat = a.categoryName ?? a.category, !cat.isEmpty {
                    Text(cat)
                        .font(SabqFonts.app(size: 10, weight: .heavy))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .foregroundStyle(SabqTheme.sky)
                        .background(Capsule().fill(SabqTheme.sky.opacity(0.10)))
                }
                Spacer(minLength: 0)
                if let views = a.viewsCount, views > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "eye.fill").font(SabqFonts.app(size: 10))
                        Text("\(views)")
                            .font(SabqFonts.app(size: 11, weight: .semibold))
                            .monospacedDigit()
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }

            Text(a.title)
                .font(SabqFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.leading)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            if let topic = a.topic, !topic.isEmpty, topic != a.title {
                Text(topic)
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
            }

            if let kw = a.keywords, !kw.isEmpty {
                HStack(spacing: 6) {
                    ForEach(kw.prefix(3), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(SabqFonts.app(size: 10, weight: .semibold))
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
                .stroke(SabqTheme.sky.opacity(0.15), lineWidth: 0.5)
        )
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await APIClient.shared.fetchOmqList(page: 1, limit: 20, status: "published")
            analyses = response.analyses
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
            analyses = []
        }
        isLoading = false
    }
}

// MARK: - Detail

struct OmqDetailView: View {
    let id: String
    let initialTitle: String

    @Environment(\.dismiss) private var dismiss
    @State private var analysis: APIDeepAnalysis?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                if isLoading && analysis == nil {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 30, radius: 6)
                        SkeletonBox(height: 16, radius: 6)
                        SkeletonBox(height: 200, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage, analysis == nil {
                    EmptyStateView(
                        icon: "exclamationmark.shield",
                        tint: SabqTheme.coral,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if let a = analysis {
                    detailContent(a)
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
        .task { await load() }
    }

    @ViewBuilder
    private func detailContent(_ a: APIDeepAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "brain.head.profile")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.sky)
                Text("تحليل عميق")
                    .font(SabqFonts.app(size: 11, weight: .heavy))
                    .foregroundStyle(SabqTheme.sky)
            }
            Text(a.title)
                .font(SabqFonts.app(size: 22, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if let topic = a.topic, !topic.isEmpty, topic != a.title {
                Text(topic)
                    .font(SabqFonts.app(size: 14))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
        }

        if let exec = a.executiveSummary, !exec.isEmpty {
            section(title: "الملخّص التنفيذي", icon: "doc.text.fill", body: exec, tint: SabqTheme.primaryEnd)
        }

        if let merged = a.mergedAnalysis, !merged.isEmpty {
            section(title: "التحليل المُجمَّع", icon: "sparkles", body: merged, tint: SabqTheme.sky)
        }

        if let recs = a.recommendations, !recs.isEmpty {
            section(title: "التوصيات", icon: "lightbulb.fill", body: recs, tint: SabqTheme.gold)
        }

        if let gpt = a.gptAnalysis, !gpt.isEmpty {
            section(title: "تحليل GPT", icon: "g.circle.fill", body: gpt, tint: SabqTheme.teal)
        }
        if let gemini = a.geminiAnalysis, !gemini.isEmpty {
            section(title: "تحليل Gemini", icon: "diamond.fill", body: gemini, tint: SabqTheme.sky)
        }
        if let claude = a.claudeAnalysis, !claude.isEmpty {
            section(title: "تحليل Claude", icon: "c.circle.fill", body: claude, tint: SabqTheme.coral)
        }
    }

    private func section(title: String, icon: String, body: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(tint)
                Text(title)
                    .font(SabqFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
            }

            Text(body)
                .font(SabqFonts.app(size: 14))
                .foregroundStyle(SabqTheme.ink.opacity(0.9))
                .lineSpacing(6)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.15), lineWidth: 0.5)
        )
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            analysis = try await APIClient.shared.fetchOmqDetail(id: id)
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
        }
        isLoading = false
    }
}
