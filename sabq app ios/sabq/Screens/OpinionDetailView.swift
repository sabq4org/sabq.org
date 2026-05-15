import SwiftUI

struct OpinionDetailView: View {
    let opinion: OpinionArticle
    @Environment(\.dismiss) private var dismiss
    @State private var fullOpinion: OpinionArticle?
    @State private var moreOpinions: [OpinionArticle] = []
    @State private var isExcerptExpanded = false
    @State private var shortlinkURL: URL?
    @State private var shortlinkTask: Task<URL?, Never>?
    @State private var isCopyFeedbackVisible = false
    @State private var copyFeedbackTask: Task<Void, Never>?
    @AppStorage("articleFontSize") private var fontSize: Double = 17

    private var displayOpinion: OpinionArticle { fullOpinion ?? opinion }
    private var displayTags: [String] {
        var seen = Set<String>()
        return displayOpinion.tags
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { seen.insert($0).inserted }
    }

    var body: some View {
        GeometryReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    heroImage
                        .frame(width: proxy.size.width)

                    VStack(alignment: .leading, spacing: 24) {
                        opinionMeta
                        opinionTitle

                        if !displayOpinion.excerpt.isEmpty && displayOpinion.excerpt != displayOpinion.body {
                            opinionExcerpt
                        }

                        Divider()
                            .foregroundStyle(SabqTheme.outline)

                        opinionBody
                        actionBar

                        if !displayTags.isEmpty {
                            tagsSection
                        }

                        if !moreOpinions.isEmpty {
                            moreOpinionsSection
                        }
                    }
                    .frame(width: max(0, proxy.size.width - 40), alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                    .padding(.bottom, 60)
                }
                .frame(width: proxy.size.width, alignment: .leading)
            }
        }
        .background(SabqTheme.surface)
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

            ToolbarItem(placement: .primaryAction) {
                Button {
                    shareOpinion()
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                .buttonStyle(.plain)
            }
        }
        .task {
            await loadOpinion()
        }
        .navigationDestination(for: OpinionArticle.self) { opinion in
            OpinionDetailView(opinion: opinion)
        }
    }

    private var fallbackShareURL: URL {
        if let urlString = displayOpinion.articleURL, let url = URL(string: urlString) {
            return url
        }
        return URL(string: "https://sabq.org")!
    }

    @MainActor
    private func loadOpinion() async {
        if let fetched = await NewsService.fetchOpinionDetail(opinion) {
            fullOpinion = fetched
        }

        let opinions = await NewsService.fetchOpinions()
        moreOpinions = opinions
            .filter { $0.id != displayOpinion.id }
            .prefix(4)
            .map { $0 }

        _ = await prepareShareURL()
    }

    private var heroImage: some View {
        ZStack(alignment: .bottom) {
            if let urlString = displayOpinion.imageURL, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    heroPlaceholder
                }
                .frame(maxWidth: .infinity, maxHeight: 260)
                .clipped()
            } else {
                heroPlaceholder
            }

            LinearGradient(
                colors: [.black.opacity(0.6), .black.opacity(0.2), .clear],
                startPoint: .bottom,
                endPoint: .top
            )
            .frame(maxWidth: .infinity, maxHeight: 140, alignment: .bottom)
            .allowsHitTesting(false)

            HStack(spacing: 8) {
                StatusChip(title: "مقال رأي", tint: .white)
                StatusChip(title: displayOpinion.authorName, tint: .white.opacity(0.86))
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 260)
        .clipped()
    }

    private var heroPlaceholder: some View {
        LinearGradient(
            colors: [SabqTheme.primaryEnd.opacity(0.16), SabqTheme.primaryStart.opacity(0.05)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(height: 260)
        .overlay {
            Image(systemName: "text.quote")
                .font(.system(size: 92, weight: .ultraLight))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.15))
        }
    }

    private var opinionMeta: some View {
        HStack(spacing: 14) {
            HStack(spacing: 10) {
                OpinionAuthorAvatar(
                    name: displayOpinion.authorName,
                    imageURL: displayOpinion.authorImageURL,
                    size: 38
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(displayOpinion.authorName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)

                    Text("كاتب المقال")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 5) {
                    Image(systemName: "clock")
                        .font(.system(size: 12, weight: .medium))
                    Text(displayOpinion.readingTime)
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .monospacedDigit()
                }
                .foregroundStyle(SabqTheme.tertiaryInk)

                HStack(spacing: 5) {
                    Image(systemName: "calendar")
                        .font(.system(size: 12, weight: .medium))
                    Text(displayOpinion.dateFormatted)
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundStyle(SabqTheme.tertiaryInk)
            }
        }
    }

    private var opinionTitle: some View {
        Text(displayOpinion.title)
            .font(.system(size: CGFloat(fontSize + 6), weight: .bold))
            .foregroundStyle(SabqTheme.ink)
            .multilineTextAlignment(.leading)
            .lineSpacing(6)
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
    }

    private var opinionExcerpt: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(SabqTheme.primaryEnd)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.primaryEnd.opacity(0.7))
                    Text("الموجز الذكي")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }

                Text(displayOpinion.excerpt)
                    .font(.system(size: CGFloat(fontSize - 1), weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(6)
                    .lineLimit(isExcerptExpanded ? nil : 3)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .animation(.easeInOut(duration: 0.25), value: isExcerptExpanded)

                Button {
                    withAnimation(.spring(response: 0.3)) {
                        isExcerptExpanded.toggle()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(isExcerptExpanded ? "عرض أقل" : "عرض المزيد")
                            .font(.system(size: 13, weight: .medium))
                        Image(systemName: isExcerptExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 9, weight: .semibold))
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var opinionBody: some View {
        Group {
            let body = displayOpinion.body
            if body.isEmpty {
                EmptyStateView(
                    icon: "doc.text.magnifyingglass",
                    tint: SabqTheme.secondaryInk,
                    title: "لا يتوفر نص المقال بعد",
                    subtitle: "سنُظهر محتوى المقال الكامل فور وصوله من الخدمة"
                )
            } else {
                let paragraphs = Article.displayParagraphs(for: body)

                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                        Text(paragraph)
                            .font(.system(size: CGFloat(fontSize), weight: .regular))
                            .foregroundStyle(SabqTheme.ink.opacity(0.90))
                            .multilineTextAlignment(.leading)
                            .lineSpacing(8)
                            .lineLimit(nil)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 6)
            }
        }
    }

    private var actionBar: some View {
        HStack(spacing: 0) {
            Button {
                shareOpinion()
            } label: {
                actionButton(icon: "square.and.arrow.up", label: "مشاركة")
            }
            .buttonStyle(.plain)

            Divider()
                .frame(height: 28)

            Button {
                copyShareLink()
            } label: {
                actionButton(
                    icon: isCopyFeedbackVisible ? "checkmark.circle.fill" : "link",
                    label: isCopyFeedbackVisible ? "تم النسخ" : "نسخ الرابط",
                    isActive: isCopyFeedbackVisible
                )
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(SabqTheme.paleFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 0.5)
        )
    }

    private func actionButton(icon: String, label: String, isActive: Bool = false) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
            Text(label)
                .font(.system(size: 12, weight: .bold, design: .rounded))
        }
        .foregroundStyle(isActive ? SabqTheme.primaryEnd : SabqTheme.secondaryInk)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
    }

    private func shareOpinion() {
        Task {
            let url = await prepareShareURL()
            presentShareSheet(with: url)
        }
    }

    private func copyShareLink() {
        Task {
            let url = await prepareShareURL()
            await MainActor.run {
                UIPasteboard.general.string = url.absoluteString
                showCopyFeedback()
            }
        }
    }

    @MainActor
    private func showCopyFeedback() {
        copyFeedbackTask?.cancel()

        let feedback = UINotificationFeedbackGenerator()
        feedback.notificationOccurred(.success)

        withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
            isCopyFeedbackVisible = true
        }

        copyFeedbackTask = Task {
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isCopyFeedbackVisible = false
                }
                copyFeedbackTask = nil
            }
        }
    }

    @MainActor
    private func prepareShareURL() async -> URL {
        // Same reasoning as ArticleDetailView: skip the shortlink path and
        // share the canonical `/opinion/<slug>` URL so crawlers unfurl with
        // the proper og:image / og:title / og:description from seoInjector.
        return fallbackShareURL
    }

    private func resolveShortlinkURL(opinionId: String) async -> URL? {
        await SabqShareHelper.resolveShortlink(articleId: opinionId)
    }

    @MainActor
    private func presentShareSheet(with url: URL) {
        SabqShareHelper.presentShareSheet(with: url)
    }

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("الوسوم")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.secondaryInk)

            FlowLayout(spacing: 8) {
                ForEach(displayTags, id: \.self) { tag in
                    NavigationLink(value: KeywordRoute(keyword: tag)) {
                        Text(tag)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(SabqTheme.primaryStart)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(SabqTheme.primaryEnd.opacity(0.08))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var moreOpinionsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider()
                .foregroundStyle(SabqTheme.outline)

            SectionHeader(
                title: "مقالات أخرى",
                subtitle: "مقالات رأي قد ترغب بقراءتها بعد هذا المقال",
                icon: "text.quote",
                tint: SabqTheme.primaryEnd
            )

            ForEach(moreOpinions) { opinion in
                NavigationLink(value: opinion) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(opinion.title)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)

                            Text(opinion.authorName)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(SabqTheme.secondaryInk)

                            Text(opinion.relativeDate)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        OpinionAuthorAvatar(
                            name: opinion.authorName,
                            imageURL: opinion.authorImageURL,
                            size: 48
                        )
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
            }
        }
    }
}
