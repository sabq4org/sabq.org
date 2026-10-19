import SwiftUI

// MARK: - أقسام مكمّلة لمونديال 2026 (تكافؤ مع صفحة الويب /world-cup)
//
// ثلاثة أقسام عامة تُستهلك من /api/world-cup/*: حقائق البطولة، شجرة الأدوار
// الإقصائية، وآخر أخبار المونديال. كلها تتبع نمط ZStack+Color.clear حتى تبقى
// الحاوية حيّة فلا يسقط معدّل .task قبل وصول البيانات (فخ Group/EmptyView).

// MARK: - حقائق البطولة (/world-cup/facts)

struct WCFactsSection: View {
    @State private var facts: WCCompetitionFacts?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(width: 0, height: 0)
            if let f = facts, f.hasContent {
                content(f)
            }
        }
        .task {
            if let r = try? await APIClient.shared.fetchWorldCupFacts() {
                await MainActor.run { facts = r }
            }
        }
    }

    private func content(_ f: WCCompetitionFacts) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            WCSectionHeader(icon: "rosette", title: "حقائق البطولة",
                            subtitle: "أرقام وذاكرة كأس العالم", tint: SabqTheme.warning)
                .padding(.horizontal, SabqLayout.pageMargin)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space12) {
                    if let champ = f.defendingChampion {
                        factCard(icon: "crown.fill",
                                 caption: "حامل اللقب",
                                 logo: champ.logo,
                                 title: champ.name,
                                 detail: f.defendingChampionTitles.map { "\($0) ألقاب عالمية" })
                    }
                    if let most = f.mostTitles, let top = most.teams.first {
                        factCard(icon: "trophy.fill",
                                 caption: "الأكثر تتويجًا",
                                 logo: top.logo,
                                 title: most.teams.map { $0.name }.joined(separator: " · "),
                                 detail: "\(most.count) ألقاب")
                    }
                    if let host = f.host, !host.isEmpty {
                        factCard(icon: "mappin.and.ellipse",
                                 caption: "الاستضافة",
                                 logo: nil,
                                 title: host,
                                 detail: "مونديال 2026")
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }
        }
    }

    private func factCard(icon: String, caption: String, logo: String?, title: String, detail: String?) -> some View {
        HStack(spacing: SabqLayout.space12) {
            if let logo, !logo.isEmpty {
                WCRemoteImage(url: logo).padding(4).frame(width: 32, height: 32)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
            } else {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 15)).foregroundStyle(SabqTheme.warning)
                    .frame(width: 32, height: 32)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surface))
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(caption).sabqText(SabqType.tag).foregroundStyle(SabqTheme.warning)
                Text(title)
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.8)
                if let detail {
                    Text(detail).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
            }
        }
        .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space12)
        .frame(width: 192, alignment: .leading)
        .wcQuietBlock()
    }
}

// MARK: - الأدوار الإقصائية (/world-cup/bracket)
//
// شجرة الويب الأفقية لا تناسب شاشة الهاتف، فنعرض اختيار دور أفقيًا ثم
// مباريات الدور المختار كبطاقات (مطابق سلوك الويب على الموبايل). يُختار
// افتراضيًا أول دور فيه مباراة حيّة، ثم قادمة، ثم أول دور غير فارغ.

struct WCKnockoutSection: View {
    // المباريات والترتيب يمرّان من الشاشة الأم لحساب «المتأهّلون حتى الآن» قبل
    // أن يوفّر المزوّد مباريات خروج المغلوب — دون نداء API إضافي.
    var fixtures: [WCFixture] = []
    var groups: [WCGroup] = []
    let onOpenMatch: (Int) -> Void

    @State private var bracket: WCBracket?
    @State private var userRound: String?   // roundEn المختار يدويًا
    @State private var selectedTeam: WCTeam?

    private var rounds: [WCBracketRound] { bracket?.rounds ?? [] }
    private var playableRounds: [WCBracketRound] { rounds.filter { !$0.matches.isEmpty } }

    private var defaultRoundEn: String? {
        if let live = playableRounds.first(where: { $0.matches.contains { $0.status.live } }) { return live.roundEn }
        if let upcoming = playableRounds.first(where: { $0.matches.contains { !$0.status.finished } }) { return upcoming.roundEn }
        return playableRounds.first?.roundEn
    }
    private var selectedEn: String? { userRound ?? defaultRoundEn }
    private var selectedRound: WCBracketRound? {
        playableRounds.first { $0.roundEn == selectedEn }
    }

    // المتأهّلون المؤكَّدون حتى الآن لكل مجموعة — منتخب يُعدّ متأهّلًا إذا حسمه
    // الخادم رياضيًّا (qualifyStatus == "qualified")، أو اكتملت كل مباريات مجموعته
    // وهو في المركزين الأوّلين (عندها qualifyStatus = null). مطابق computeQualified
    // في الويب. أفضل 8 من أصحاب المركز الثالث لا يُحسبون هنا.
    private var qualifiedGroups: [WCQualifiedGroup] {
        var out: [WCQualifiedGroup] = []
        for g in groups {
            let ids = Set(g.rows.map { $0.team.id })
            let groupMatches = fixtures.filter { ids.contains($0.home.id) && ids.contains($0.away.id) }
            let complete = !groupMatches.isEmpty && groupMatches.allSatisfy { $0.status.finished }
            let qualifiers = g.rows
                .filter { $0.qualifyStatus == "qualified" || (complete && $0.rank <= 2) }
                .sorted { $0.rank < $1.rank }
            if !qualifiers.isEmpty { out.append(WCQualifiedGroup(group: g, qualifiers: qualifiers)) }
        }
        return out
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(width: 0, height: 0)
            if bracket != nil {
                if playableRounds.isEmpty {
                    emptyCard
                } else {
                    content
                }
            }
        }
        .task {
            if let r = try? await APIClient.shared.fetchWorldCupBracket() {
                await MainActor.run { bracket = r }
            }
        }
        .sheet(item: $selectedTeam) { team in
            WCTeamSheet(team: team).presentationDetents([.large])
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            WCSectionHeader(icon: "trophy", title: "الأدوار الإقصائية",
                            subtitle: "طريق اللقب من دور الـ32 حتى النهائي")
                .padding(.horizontal, SabqLayout.pageMargin)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(playableRounds) { round in
                        let active = round.roundEn == selectedEn
                        Button { withAnimation(.easeOut(duration: 0.2)) { userRound = round.roundEn } } label: {
                            Text(round.round)
                                .font(SabqFonts.app(size: 15, weight: .semibold))
                                .foregroundStyle(active ? SabqTheme.onAction : SabqTheme.textPrimary)
                                .padding(.horizontal, SabqLayout.space16)
                                .frame(minHeight: SabqLayout.touchTarget)
                                .background(Capsule().fill(active ? WCTheme.royal : SabqTheme.surfaceMuted))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }

            if let round = selectedRound {
                LazyVStack(spacing: 0) {
                    ForEach(round.matches) { f in
                        WCRowSeparator()
                        WCMatchCard(fixture: f) { onOpenMatch(f.id) }
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }
        }
    }

    // قبل اعتماد القرعة/انطلاق الأدوار: نعرض «المتأهّلون حتى الآن» فور حسم أول
    // مجموعة، وإلا بطاقة معرّفة بالمراحل بدل إخفاء كامل.
    @ViewBuilder private var emptyCard: some View {
        if !qualifiedGroups.isEmpty {
            WCQualifiedSoFar(qualifiedGroups: qualifiedGroups) { selectedTeam = $0 }
        } else {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                WCSectionHeader(icon: "trophy", title: "الأدوار الإقصائية",
                                subtitle: "تبدأ بعد اكتمال دور المجموعات")
                    .padding(.horizontal, SabqLayout.pageMargin)

                VStack(spacing: 0) {
                    ForEach(["دور الـ32", "دور الـ16", "دور الـ8", "دور الـ4", "النهائي"], id: \.self) { label in
                        WCRowSeparator()
                        HStack {
                            Image(systemName: "flag.checkered").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.warning)
                                .accessibilityHidden(true)
                            Text(label).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                            Spacer()
                            Text("يُحدَّد لاحقًا").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                        }
                        .padding(.vertical, SabqLayout.space12)
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }
        }
    }
}

// مجموعة مع منتخباتها المتأهّلة — حامل خفيف لـ ForEach.
struct WCQualifiedGroup: Identifiable {
    let group: WCGroup
    let qualifiers: [WCStandingRow]
    var id: String { group.groupEn }
}

/// لوحة «المتأهّلون حتى الآن» — تُعرض مكان النص التحفيزي قبل توفّر مباريات خروج
/// المغلوب، وتُعبَّأ تدريجيًّا فور حسم كل مجموعة (أول/ثاني). مطابق QualifiedSoFar
/// في الويب: ترويسة بعدّاد + شارات الأدوار، شبكة بطاقات للمجموعات، وحاشية.
struct WCQualifiedSoFar: View {
    let qualifiedGroups: [WCQualifiedGroup]
    let onSelectTeam: (WCTeam) -> Void

    private let rounds = ["دور الـ32", "دور الـ16", "دور الـ8", "دور الـ4", "النهائي"]
    private var total: Int { qualifiedGroups.reduce(0) { $0 + $1.qualifiers.count } }
    private let columns = SabqGrid.adaptive(spacing: SabqLayout.space12)

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            header.padding(.horizontal, SabqLayout.pageMargin)

            LazyVGrid(columns: columns, spacing: SabqLayout.space12) {
                ForEach(qualifiedGroups) { item in
                    groupCard(item)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)

            Text("تُحدَّد المواجهات وأفضل 8 من أصحاب المركز الثالث بعد اكتمال دور المجموعات (28 يونيو 2026).")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, SabqLayout.pageMargin)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "trophy.fill").font(SabqFonts.app(size: 18)).accessibilityHidden(true)
                Text("المتأهّلون حتى الآن").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                Text("\(total)")
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                    .background(Capsule().fill(WCTheme.royal))
            }
            .foregroundStyle(WCTheme.emeraldDeep)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(rounds, id: \.self) { r in
                        Text(r)
                            .sabqText(SabqType.tag)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                            .background(Capsule().fill(SabqTheme.surfaceMuted))
                    }
                }
            }
        }
    }

    private func groupCard(_ item: WCQualifiedGroup) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(item.group.group)
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(WCTheme.emeraldDeep)
                Spacer()
                Text("متأهّل")
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space8)

            ForEach(Array(item.qualifiers.enumerated()), id: \.element.id) { index, row in
                if index > 0 { WCRowSeparator().padding(.horizontal, SabqLayout.space12) }
                Button { onSelectTeam(row.team) } label: { qualifierRow(row) }
                    .buttonStyle(.plain)
            }
        }
        .wcQuietBlock()
    }

    private func qualifierRow(_ row: WCStandingRow) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text("\(row.rank)")
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(WCTheme.emeraldDeep)
                .frame(width: 24, height: 24)
                .background(Circle().fill(SabqTheme.surface))
            WCTeamLogo(team: row.team, size: 24, ring: SabqTheme.separator)
            Text(row.team.name)
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
            Spacer(minLength: 4)
            Image(systemName: "checkmark.circle.fill")
                .font(SabqFonts.app(size: 15))
                .foregroundStyle(WCTheme.emeraldDeep)
        }
        .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space8)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
    }
}

// MARK: - أخبار المونديال (/world-cup/news)
//
// بطاقات تفتح المقال داخل التطبيق عبر ArticleSlugRoute. تُخفى كليًا عند
// غياب الأخبار. الصورة بنقطة تركيز المحرّر (FocalCachedAsyncImage)، وعند
// غيابها تظهر بطاقة بصرية بشعارَي المنتخبين.

struct WCNewsSection: View {
    @State private var news: [WCNewsItem] = []

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(width: 0, height: 0)
            if !news.isEmpty {
                content
            }
        }
        .task {
            if let r = try? await APIClient.shared.fetchWorldCupNews(limit: 8) {
                await MainActor.run { news = r }
            }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            WCSectionHeader(icon: "newspaper.fill", title: "أخبار المونديال",
                            subtitle: "آخر مستجدّات كأس العالم 2026")
                .padding(.horizontal, SabqLayout.pageMargin)

            // قائمة أخبار بنمط CompactArticleRow: عنوان ثم سطر بيانات، ومصغّرة في نهاية السطر
            LazyVStack(spacing: 0) {
                ForEach(Array(news.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { WCRowSeparator() }
                    NavigationLink(value: ArticleSlugRoute(slug: item.slug)) {
                        newsCard(item)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
        }
    }

    private func newsCard(_ item: WCNewsItem) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text(item.title)
                    .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(3).multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let excerpt = item.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(2).multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack(spacing: SabqLayout.space4) {
                    Text(kindLabel(item.kind))
                        .sabqText(SabqType.metaEmphasis).foregroundStyle(WCTheme.emeraldDeep)
                    if let d = item.publishedDate {
                        Text("·").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textTertiary)
                        Text(Self.relativeTime(d))
                            .sabqText(SabqType.timestamp).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            visual(item)
                .frame(width: 112, height: 63)
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    @ViewBuilder private func visual(_ item: WCNewsItem) -> some View {
        if let urlString = item.imageUrl, !urlString.isEmpty, let url = URL(string: urlString) {
            FocalCachedAsyncImage(
                url: url,
                focalPoint: ImageFocalPoint(rawX: item.imageFocalPoint?.x, rawY: item.imageFocalPoint?.y),
                maxPixelSize: 260
            ) {
                SabqImagePlaceholder()
            }
        } else {
            SabqImagePlaceholder()
        }
    }

    private func kindLabel(_ kind: String) -> String {
        switch kind {
        case "preview": return "ما قبل المباراة"
        case "report": return "تقرير المباراة"
        default: return "مونديال 2026"
        }
    }

    /// وقت نسبي عربي بأرقام لاتينية ("منذ 5 دقائق").
    static func relativeTime(_ date: Date) -> String {
        let seconds = max(0, Date().timeIntervalSince(date))
        let minutes = Int(seconds) / 60
        let hours = minutes / 60
        let days = hours / 24
        if minutes < 1 { return "الآن" }
        if minutes < 60 { return "منذ \(minutes) د" }
        if hours < 24 { return "منذ \(hours) س" }
        if days == 1 { return "أمس" }
        if days < 7 { return "منذ \(days) أيام" }
        return WCFormat.dayRiyadh.string(from: date)
    }
}
