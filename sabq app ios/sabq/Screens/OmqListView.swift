import SwiftUI

struct OmqRoute: Hashable {}

struct OmqDetailRoute: Hashable {
    let id: String
    let title: String
}

// List view for the OMQ deep-analysis surface. Source: GET /api/omq.
struct OmqListView: View {
    @State private var analyses: [APIDeepAnalysis] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                header

                if isLoading {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(0..<3, id: \.self) { index in
                            if index > 0 { SidebarRowDivider() }
                            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                                SkeletonBox(width: 72, height: 20, radius: SabqRadius.small)
                                SkeletonBox(height: 16, radius: SabqRadius.small)
                                SkeletonBox(width: 220, height: 16, radius: SabqRadius.small)
                                SkeletonBox(width: 140, height: 12, radius: SabqRadius.small)
                            }
                            .padding(.vertical, SabqLayout.rowPadding)
                        }
                    }
                    .accessibilityHidden(true)
                } else if let errorMessage {
                    EmptyStateView(
                        icon: "exclamationmark.shield",
                        tint: SabqTheme.danger,
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
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(analyses.enumerated()), id: \.element.id) { index, analysis in
                            if index > 0 { SidebarRowDivider() }
                            NavigationLink(value: OmqDetailRoute(id: analysis.id, title: analysis.title)) {
                                analysisCard(analysis)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("عُمق")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var header: some View {
        SabqPageIntro("تحليلات أسبوعية لأهم القضايا بمزيج من نماذج الذكاء الاصطناعي")
    }

    /// صف تحليل على الصفحة: الوسم والمشاهدات، العنوان، الموضوع، والكلمات.
    private func analysisCard(_ a: APIDeepAnalysis) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                if let cat = a.categoryName ?? a.category, !cat.isEmpty {
                    StatusChip(title: cat, tint: SabqTheme.primary)
                }
                Spacer(minLength: 0)
                if let views = a.viewsCount, views > 0 {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: "eye")
                            .accessibilityHidden(true)
                        Text("\(views)")
                            .monospacedDigit()
                    }
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                }
            }

            Text(a.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.leading)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            if let topic = a.topic, !topic.isEmpty, topic != a.title {
                Text(topic)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
            }

            if let kw = a.keywords, !kw.isEmpty {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(kw.prefix(3), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                    }
                }
            }
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
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

    @State private var analysis: APIDeepAnalysis?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                if isLoading && analysis == nil {
                    VStack(spacing: SabqLayout.space12) {
                        SkeletonBox(height: 30, radius: SabqRadius.small)
                        SkeletonBox(height: 16, radius: SabqRadius.small)
                        SkeletonBox(height: 200, radius: SabqRadius.medium)
                    }
                } else if let errorMessage, analysis == nil {
                    EmptyStateView(
                        icon: "exclamationmark.shield",
                        tint: SabqTheme.danger,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if let a = analysis {
                    detailContent(a)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("تحليل عُمق")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private func detailContent(_ a: APIDeepAnalysis) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "brain.head.profile")
                    .accessibilityHidden(true)
                Text("تحليل عميق")
            }
            .font(SabqType.metaEmphasis.font)
            .foregroundStyle(SabqTheme.primary)

            Text(a.title)
                .sabqText(SabqType.articleTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if let topic = a.topic, !topic.isEmpty, topic != a.title {
                Text(topic)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }

        if let exec = a.executiveSummary, !exec.isEmpty {
            section(title: "الملخّص التنفيذي", body: exec)
        }

        if let merged = a.mergedAnalysis, !merged.isEmpty {
            section(title: "التحليل المُجمَّع", body: merged)
        }

        if let recs = a.recommendations, !recs.isEmpty {
            section(title: "التوصيات", body: recs)
        }

        if let gpt = a.gptAnalysis, !gpt.isEmpty {
            section(title: "تحليل GPT", body: gpt)
        }
        if let gemini = a.geminiAnalysis, !gemini.isEmpty {
            section(title: "تحليل Gemini", body: gemini)
        }
        if let claude = a.claudeAnalysis, !claude.isEmpty {
            section(title: "تحليل Claude", body: claude)
        }
    }

    /// قسم بلا صندوق: شريط فصل رمادي، ثم عنوان 20 ونص القراءة.
    private func section(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            SabqSectionBand()

            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                Text(title)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                Text(body)
                    .sabqText(SabqType.articleBody)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
