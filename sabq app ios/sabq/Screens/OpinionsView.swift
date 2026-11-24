import SwiftUI

/// «المقالات» — صفحة الرأي العادلة، مطابقة للويب (/opinion، #2256):
///  1. شريط أيام الأسبوع (السبت → الجمعة) واليوم مختار.
///  2. مقالات اليوم المختار بحجم واحد، وترتيب اليوم يتناوب كل ساعة (من الخادم).
///  3. «يقرؤونه الآن»: الأسرع قراءة في آخر 72 ساعة، مقال واحد لكل كاتب.
///  4. «تعرّف على كاتب»: كاتب من الأقل ظهورًا يتغيّر يوميًا.
///  5. «كتّاب سبق»: كل الكتّاب أبجديًا.
/// بلا أعداد مشاهدات. البيانات من GET /api/opinion-front.
struct OpinionsView: View {
    @State private var front: APIOpinionFront?
    @State private var selectedDay: String?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showAllWriters = false

    /// أزرق التحديد في سبق (#1E9BE6) بنص أبيض.
    private static let selectBlue = Color(red: 30 / 255, green: 155 / 255, blue: 230 / 255)

    private var dayKey: String? {
        selectedDay ?? front.map { f in
            (f.articlesByDay[f.today]?.isEmpty == false ? f.today : f.latestDay) ?? f.today
        }
    }

    private var dayArticles: [APIOpinionFrontArticle] {
        guard let front, let dayKey else { return [] }
        return front.articlesByDay[dayKey] ?? []
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                if isLoading && front == nil {
                    loadingSection
                } else if let errorMessage, front == nil {
                    EmptyStateView(
                        icon: "exclamationmark.triangle",
                        tint: SabqTheme.danger,
                        title: "تعذر تحميل المقالات",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if let front {
                    weekStrip(front)
                    daySection(front)
                    if !front.hot.isEmpty { hotSection(front.hot) }
                    if let spotlight = front.spotlight { spotlightSection(spotlight) }
                    if !front.roster.isEmpty { rosterSection(front) }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.tabBarClearance)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable { await load() }
        .navigationTitle("المقالات")
        .navigationBarTitleDisplayMode(.inline)
        .background(SabqTheme.background)
        .sabqRTL()
        .task {
            guard front == nil else { return }
            await load()
        }
    }

    // MARK: - Week strip

    private func weekStrip(_ front: APIOpinionFront) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(front.days, id: \.key) { day in
                        dayChip(day)
                            .id(day.key)
                    }
                }
                .padding(.vertical, SabqLayout.space4)
            }
            .onAppear {
                if let key = dayKey { proxy.scrollTo(key, anchor: .center) }
            }
        }
    }

    private func dayChip(_ day: APIOpinionFrontDay) -> some View {
        let selected = day.key == dayKey
        let disabled = day.isFuture || day.count == 0
        return Button {
            withAnimation(.easeInOut(duration: 0.2)) { selectedDay = day.key }
        } label: {
            VStack(spacing: 2) {
                Text(OpinionText.weekdayName(day.key))
                    .font(SabqType.metaEmphasis.font)
                Text(OpinionText.dayNumber(day.key))
                    .font(SabqFonts.app(size: 22, weight: .bold))
                    .monospacedDigit()
                Text(day.isFuture ? "قريبًا" : OpinionText.count(day.count))
                    .font(SabqType.timestamp.font)
                    .opacity(selected ? 0.9 : 1)
            }
            .foregroundStyle(selected ? Color.white : (disabled ? SabqTheme.textTertiary : SabqTheme.textPrimary))
            .frame(width: 76, height: 84)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(selected ? Self.selectBlue : SabqTheme.surface)
                    .shadow(color: selected ? Self.selectBlue.opacity(0.3) : .clear, radius: 8, y: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .strokeBorder(selected ? Color.clear : SabqTheme.cardBorder, lineWidth: 0.75)
            )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel("\(OpinionText.weekdayName(day.key)) \(OpinionText.dayNumber(day.key))، \(OpinionText.count(day.count))")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: - Day articles

    private func daySection(_ front: APIOpinionFront) -> some View {
        let isToday = dayKey == front.today
        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(isToday ? "مقالات اليوم" : "مقالات \(OpinionText.dayLabel(dayKey ?? ""))")
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if isToday && dayArticles.count > 1 {
                    Label("الترتيب يتناوب كل ساعة، فيأخذ كل مقال دوره في الأعلى", systemImage: "arrow.triangle.2.circlepath")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }

            if dayArticles.isEmpty {
                Text("لا مقالات منشورة في هذا اليوم")
                    .font(SabqType.excerpt.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SabqLayout.space32)
                    .sabqNewsSurface()
            } else {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(dayArticles.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { SidebarRowDivider() }
                        dayRow(item)
                    }
                }
                .sabqNewsSurface()
            }
        }
    }

    private func dayRow(_ item: APIOpinionFrontArticle) -> some View {
        let opinion = OpinionArticle.from(item.opinion)
        let role = OpinionText.role(bio: item.authorBio, name: opinion.authorName, gender: opinion.authorGender)
        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space12) {
                NavigationLink(value: AuthorRoute(name: opinion.authorName, avatarURL: opinion.authorImageURL, role: role)) {
                    HStack(spacing: SabqLayout.space12) {
                        OpinionAuthorAvatar(name: opinion.authorName, imageURL: opinion.authorImageURL, size: 42)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(opinion.authorName)
                                .font(SabqFonts.app(size: 15, weight: .semibold))
                                .foregroundStyle(SabqTheme.textPrimary)
                                .lineLimit(1)
                            Text(role)
                                .font(SabqType.meta.font)
                                .foregroundStyle(SabqTheme.textTertiary)
                                .lineLimit(1)
                        }
                    }
                }
                .buttonStyle(.plain)

                Spacer(minLength: 0)

                Text(SabqFormatters.riyadhClock12.string(from: opinion.publishDate))
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .monospacedDigit()
            }

            NavigationLink(value: opinion) {
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                        FocalCachedAsyncImage(url: url, focalPoint: opinion.imageFocalPoint, maxPixelSize: 900) {
                            SabqImagePlaceholder()
                        }
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                    }

                    Text(opinion.title)
                        .font(SabqFonts.app(size: 19, weight: .bold))
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineSpacing(3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    if !opinion.excerpt.isEmpty {
                        Text(opinion.excerpt)
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }

                    HStack(spacing: SabqLayout.space16) {
                        if item.readMinutes > 0 {
                            Text(OpinionText.readTime(item.readMinutes))
                                .foregroundStyle(SabqTheme.textTertiary)
                        }
                        Text("اقرأ المقال")
                            .fontWeight(.semibold)
                            .foregroundStyle(SabqTheme.primary)
                    }
                    .font(SabqType.meta.font)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(SabqLayout.space16)
    }

    // MARK: - Hot

    private func hotSection(_ hot: [APIOpinionFrontArticle]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(title: "يقرؤونه الآن", subtitle: "الأسرع قراءة في آخر 72 ساعة، مقال واحد لكل كاتب")

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(hot.enumerated()), id: \.element.id) { index, item in
                    let opinion = OpinionArticle.from(item.opinion)
                    if index > 0 { SidebarRowDivider() }
                    NavigationLink(value: opinion) {
                        HStack(alignment: .top, spacing: SabqLayout.space12) {
                            Text("\(index + 1)")
                                .font(SabqFonts.app(size: 20, weight: .bold))
                                .foregroundStyle(SabqTheme.primary)
                                .monospacedDigit()
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                                Text(opinion.title)
                                    .sabqText(SabqType.rowTitle)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                    .lineLimit(3)
                                    .multilineTextAlignment(.leading)
                                Text("\(opinion.authorName) · \(opinion.relativeDate)")
                                    .font(SabqType.meta.font)
                                    .foregroundStyle(SabqTheme.textTertiary)
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, SabqLayout.space12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, SabqLayout.space16)
            .sabqNewsSurface()
        }
    }

    // MARK: - Spotlight

    private func spotlightSection(_ spotlight: APIOpinionFrontSpotlight) -> some View {
        let w = spotlight.writer
        let role = OpinionText.role(bio: w.bio, name: w.name, gender: w.gender)
        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(title: "تعرّف على كاتب")

            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                HStack(spacing: SabqLayout.space12) {
                    OpinionAuthorAvatar(name: w.name, imageURL: w.profileImageUrl, size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(w.name)
                            .font(SabqFonts.app(size: 17, weight: .bold))
                            .foregroundStyle(SabqTheme.textPrimary)
                        Text(role)
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .lineLimit(2)
                    }
                }

                if let article = spotlight.article {
                    let opinion = OpinionArticle.from(article.opinion)
                    NavigationLink(value: opinion) {
                        VStack(alignment: .leading, spacing: SabqLayout.space4) {
                            Text("آخر ما كتب")
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.primary)
                            Text(opinion.title)
                                .sabqText(SabqType.rowTitle)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .multilineTextAlignment(.leading)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(SabqLayout.space12)
                        .background(SabqTheme.skyTint, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }

                NavigationLink(value: AuthorRoute(name: w.name, avatarURL: w.profileImageUrl, role: role)) {
                    Text("صفحة الكاتب")
                        .font(SabqType.button.font)
                        .foregroundStyle(SabqTheme.primary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Capsule(style: .continuous).strokeBorder(SabqTheme.skyOutline, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            .padding(SabqLayout.space16)
            .background(
                LinearGradient(colors: [Color(red: 234 / 255, green: 246 / 255, blue: 1), SabqTheme.surface], startPoint: .top, endPoint: .bottom),
                in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .strokeBorder(SabqTheme.cardBorder, lineWidth: 0.75)
            )
        }
    }

    // MARK: - Roster

    private func rosterSection(_ front: APIOpinionFront) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .firstTextBaseline) {
                DiscoverySectionHeading(title: "كتّاب سبق", subtitle: "\(front.rosterTotal) كاتبًا، مرتبون أبجديًا")
                Button(showAllWriters ? "أقل" : "الكل") {
                    withAnimation(.easeInOut(duration: 0.2)) { showAllWriters.toggle() }
                }
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.primary)
                .frame(minHeight: 44)
            }

            if showAllWriters {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: SabqLayout.space8), count: 4), spacing: SabqLayout.space16) {
                    ForEach(front.roster) { writer in writerTile(writer) }
                }
                .padding(SabqLayout.space12)
                .sabqNewsSurface()
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: SabqLayout.space12) {
                        ForEach(front.roster) { writer in writerTile(writer) }
                    }
                    .padding(SabqLayout.space12)
                }
                .sabqNewsSurface()
            }
        }
    }

    private func writerTile(_ writer: APIOpinionFrontWriter) -> some View {
        NavigationLink(value: AuthorRoute(name: writer.name, avatarURL: writer.profileImageUrl, role: nil)) {
            VStack(spacing: SabqLayout.space8) {
                OpinionAuthorAvatar(name: writer.name, imageURL: writer.profileImageUrl, size: 56)
                Text(writer.name)
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2, reservesSpace: true)
                    .frame(width: 72, alignment: .top)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Loading

    private var loadingSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            HStack(spacing: SabqLayout.space8) {
                ForEach(0..<5, id: \.self) { _ in
                    SkeletonBox(width: 76, height: 84, radius: SabqRadius.medium)
                }
            }
            SkeletonBox(width: 140, height: 20, radius: SabqRadius.small)
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    HStack(spacing: SabqLayout.space12) {
                        SkeletonBox(width: 42, height: 42, radius: 21)
                        SkeletonBox(width: 140, height: 14, radius: SabqRadius.small)
                    }
                    SkeletonBox(height: 180, radius: SabqRadius.medium)
                    SkeletonBox(height: 18, radius: SabqRadius.small)
                }
                .padding(SabqLayout.space16)
                .sabqNewsSurface()
            }
        }
    }

    // MARK: - Data

    @MainActor
    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            front = try await APIClient.shared.fetchOpinionFront()
        } catch {
            if front == nil { errorMessage = "تحقق من الاتصال ثم أعد المحاولة" }
        }
    }
}

struct OpinionAuthorAvatar: View {
    let name: String
    let imageURL: String?
    let size: CGFloat

    var body: some View {
        Group {
            if let imageURL, let url = URL(string: imageURL) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    placeholder
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else {
                placeholder
            }
        }
    }

    private var placeholder: some View {
        Circle()
            .fill(SabqTheme.surfaceMuted)
            .frame(width: size, height: size)
            .overlay {
                Text(String(name.prefix(1)))
                    .font(SabqFonts.app(size: size * 0.42, weight: .bold))
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            // حدّ رفيع يُبقي الدائرة مرئية على الخلفية الرمادية وعلى السطح الأبيض معًا.
            .overlay(Circle().strokeBorder(SabqTheme.separator, lineWidth: 0.75))
    }
}
