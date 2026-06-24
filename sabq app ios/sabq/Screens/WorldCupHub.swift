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
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "rosette", title: "حقائق البطولة",
                            subtitle: "أرقام وذاكرة كأس العالم", tint: WCTheme.gold)
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
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
                .padding(.horizontal, 16)
            }
        }
    }

    private func factCard(icon: String, caption: String, logo: String?, title: String, detail: String?) -> some View {
        HStack(spacing: 8) {
            if let logo, !logo.isEmpty {
                WCRemoteImage(url: logo).padding(3).frame(width: 30, height: 30)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(WCTheme.gold.opacity(0.35), lineWidth: 1))
            } else {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .bold)).foregroundStyle(WCTheme.gold)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(WCTheme.gold.opacity(0.14)))
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(caption).font(SabqFonts.app(size: 9, weight: .bold)).foregroundStyle(WCTheme.gold)
                Text(title)
                    .font(SabqFonts.app(size: 12, weight: .heavy)).foregroundStyle(WCTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if let detail {
                    Text(detail).font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
        .frame(width: 168, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(WCTheme.gold.opacity(0.20), lineWidth: 0.5))
    }
}

// MARK: - الأدوار الإقصائية (/world-cup/bracket)
//
// شجرة الويب الأفقية لا تناسب شاشة الهاتف، فنعرض اختيار دور أفقيًا ثم
// مباريات الدور المختار كبطاقات (مطابق سلوك الويب على الموبايل). يُختار
// افتراضيًا أول دور فيه مباراة حيّة، ثم قادمة، ثم أول دور غير فارغ.

struct WCKnockoutSection: View {
    let onOpenMatch: (Int) -> Void

    @State private var bracket: WCBracket?
    @State private var userRound: String?   // roundEn المختار يدويًا

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
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "trophy", title: "الأدوار الإقصائية",
                            subtitle: "طريق اللقب من دور الـ32 حتى النهائي")
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(playableRounds) { round in
                        let active = round.roundEn == selectedEn
                        Button { withAnimation(.easeOut(duration: 0.2)) { userRound = round.roundEn } } label: {
                            Text(round.round)
                                .font(SabqFonts.app(size: 13, weight: .semibold))
                                .foregroundStyle(active ? .white : WCTheme.onDarkDim)
                                .padding(.horizontal, 13).padding(.vertical, 7)
                                .background(Capsule().fill(active ? WCTheme.emeraldDeep : WCTheme.chipFill))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }

            if let round = selectedRound {
                LazyVStack(spacing: 12) {
                    ForEach(round.matches) { f in
                        WCMatchCard(fixture: f) { onOpenMatch(f.id) }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // قبل اعتماد القرعة/انطلاق الأدوار — بطاقة معرّفة بالمراحل بدل إخفاء كامل
    private var emptyCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "trophy", title: "الأدوار الإقصائية",
                            subtitle: "تبدأ بعد اكتمال دور المجموعات")
                .padding(.horizontal, 16)

            VStack(spacing: 10) {
                ForEach(["دور الـ32", "دور الـ16", "دور الـ8", "دور الـ4", "النهائي"], id: \.self) { label in
                    HStack {
                        Image(systemName: "flag.checkered").font(.system(size: 12)).foregroundStyle(WCTheme.gold)
                        Text(label).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark)
                        Spacer()
                        Text("يُحدَّد لاحقًا").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
                }
            }
            .padding(.horizontal, 16)
        }
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
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "newspaper.fill", title: "أخبار المونديال",
                            subtitle: "آخر مستجدّات كأس العالم 2026")
                .padding(.horizontal, 16)

            LazyVStack(spacing: 12) {
                ForEach(news) { item in
                    NavigationLink(value: ArticleSlugRoute(slug: item.slug)) {
                        newsCard(item)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func newsCard(_ item: WCNewsItem) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            visual(item)
                .frame(height: 168)
                .frame(maxWidth: .infinity)
                .clipped()
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 0,
                                                  bottomTrailingRadius: 0, topTrailingRadius: 18,
                                                  style: .continuous))

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text(kindLabel(item.kind))
                        .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(WCTheme.emerald.opacity(0.14)))
                    Spacer()
                    if let d = item.publishedDate {
                        Text(Self.relativeTime(d))
                            .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
                Text(item.title)
                    .font(SabqFonts.app(size: 16, weight: .bold)).foregroundStyle(WCTheme.onDark)
                    .lineLimit(2).multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let excerpt = item.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                        .lineLimit(2).multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(14)
        }
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    @ViewBuilder private func visual(_ item: WCNewsItem) -> some View {
        if let urlString = item.imageUrl, !urlString.isEmpty, let url = URL(string: urlString) {
            FocalCachedAsyncImage(
                url: url,
                focalPoint: ImageFocalPoint(rawX: item.imageFocalPoint?.x, rawY: item.imageFocalPoint?.y)
            ) {
                matchupVisual(item)
            }
        } else {
            matchupVisual(item)
        }
    }

    // بديل بصري بشعارَي المنتخبين على تدرّج الملعب عند غياب الصورة.
    private func matchupVisual(_ item: WCNewsItem) -> some View {
        ZStack {
            LinearGradient(colors: [WCTheme.heroTop, WCTheme.heroBottom],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
            if let home = item.home, let away = item.away {
                HStack(spacing: 22) {
                    logoBubble(home.logo)
                    Text("VS").font(SabqFonts.app(size: 16, weight: .black)).foregroundStyle(WCTheme.gold)
                        .environment(\.layoutDirection, .leftToRight)
                    logoBubble(away.logo)
                }
            } else {
                Image(systemName: "trophy.fill").font(.system(size: 40)).foregroundStyle(WCTheme.gold.opacity(0.85))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func logoBubble(_ url: String) -> some View {
        WCRemoteImage(url: url).padding(8).frame(width: 56, height: 56)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 1.5))
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
