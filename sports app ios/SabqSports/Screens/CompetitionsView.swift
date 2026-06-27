import SwiftUI

// البطولات — قائمة مجمّعة حسب الفئة (السعودية أولًا). كل فئة بطاقة بيضاء واحدة
// نظيفة بصفوف مفصولة بخطوط خفيفة (لا كروت مؤطّرة منفصلة، لا غمر أخضر). لمسة
// خضراء واحدة فقط في رؤوس الأقسام. كل بطولة تفتح صفحة تفاصيلها.
struct CompetitionsView: View {
    @State private var competitions: [SpCompetition] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var selectedCategory = "all"

    private var grouped: [(category: String, items: [SpCompetition])] {
        let source = selectedCategory == "all"
            ? competitions
            : competitions.filter { $0.category == selectedCategory }
        let byCat = Dictionary(grouping: source) { $0.category }
        return SportsConstants.categoryOrder.compactMap { cat in
            guard let items = byCat[cat], !items.isEmpty else { return nil }
            return (cat, items)
        }
    }

    private var availableFilters: [(String, String, String)] {
        var filters: [(String, String, String)] = [("all", "الكل", "square.grid.2x2.fill")]
        for cat in SportsConstants.categoryOrder where competitions.contains(where: { $0.category == cat }) {
            filters.append((cat, SportsConstants.categoryLabel(cat), categoryIcon(cat)))
        }
        return filters
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    if loading {
                        SpLoading()
                    } else if let loadError {
                        SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                    } else {
                        overview
                        filters
                        ForEach(grouped, id: \.category) { group in
                            categorySection(group.category, group.items)
                        }
                    }
                }
                .padding(16)
            }
            .autoHideTabBar()
            .background(SpAmbientBackground())
            .navigationTitle("البطولات")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private var overview: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("دليل البطولات")
                    .font(SportsFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                HStack(spacing: 8) {
                    metricChip("\(competitions.count)", "بطولة")
                    metricChip("\(competitions.filter { $0.status == "ongoing" }.count)", "جارية")
                    metricChip("\(competitions.filter { $0.hasStandings }.count)", "ترتيب")
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "trophy.fill")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(SpTheme.green)
                .frame(width: 56, height: 56)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(SpTheme.green.opacity(0.10)))
        }
        .padding(16)
        .background(cardBg)
    }

    private func metricChip(_ value: String, _ label: String) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(SportsFonts.app(size: 15, weight: .heavy))
                .foregroundStyle(SpTheme.green)
                .monospacedDigit()
            Text(label)
                .font(SportsFonts.app(size: 9.5, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
        }
        .frame(minWidth: 54)
        .padding(.vertical, 7)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.chipFill))
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(availableFilters, id: \.0) { filter in
                    filterChip(key: filter.0, title: filter.1, icon: filter.2)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func filterChip(key: String, title: String, icon: String) -> some View {
        let active = selectedCategory == key
        return Button {
            withAnimation(.easeOut(duration: 0.2)) { selectedCategory = key }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .bold))
                Text(title)
                    .font(SportsFonts.app(size: 12.5, weight: .bold))
            }
            .foregroundStyle(active ? .white : SpTheme.onDark)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Capsule().fill(active ? SpTheme.green : SpTheme.card))
            .overlay(Capsule().stroke(active ? Color.clear : SpTheme.cardStroke, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func categorySection(_ category: String, _ items: [SpCompetition]) -> some View {
        let isSaudi = category == "saudi"
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: categoryIcon(category))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(isSaudi ? SpTheme.green : SpTheme.onDarkFaint)
                Text(SportsConstants.categoryLabel(category))
                    .font(SportsFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text("\(items.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                    .monospacedDigit()
            }
            .padding(.horizontal, 4)

            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { idx, comp in
                    if idx > 0 {
                        Rectangle().fill(SpTheme.outline.opacity(0.6)).frame(height: 1).padding(.leading, 62)
                    }
                    NavigationLink {
                        CompetitionDetailView(comp: comp)
                    } label: {
                        CompetitionRow(comp: comp)
                    }
                    .buttonStyle(SpPressStyle())
                }
            }
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .stroke(SpTheme.cardStroke.opacity(0.7), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous))
        }
    }

    private func categoryIcon(_ category: String) -> String {
        switch category {
        case "saudi": return "star.fill"
        case "gulf": return "trophy.fill"
        case "arab": return "flag.fill"
        case "european": return "globe.europe.africa.fill"
        case "world": return "globe"
        default: return "sportscourt.fill"
        }
    }

    private var cardBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
            .fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func load(force: Bool = false) async {
        if !force { loading = true }
        do {
            let resp = try await APIClient.shared.fetchCompetitions(ignoreCache: force)
            self.competitions = resp.competitions
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
        self.loading = false
    }
}

// صفّ بطولة — شعار + اسم + شارة الحالة + سهم. بلا خلفية/إطار خاصّ (يعيش داخل
// بطاقة الفئة المجمّعة)، فالمظهر مسطّح هادئ بفواصل خفيفة بين الصفوف.
struct CompetitionRow: View {
    let comp: SpCompetition

    var body: some View {
        HStack(spacing: 12) {
            logo
            VStack(alignment: .leading, spacing: 5) {
                Text(comp.name)
                    .font(SportsFonts.app(size: 14.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.8)
                HStack(spacing: 5) {
                    capability("مباريات", true)
                    capability("ترتيب", comp.hasStandings)
                    capability("هدافون", comp.hasScorers)
                }
            }
            Spacer(minLength: 8)
            if let status = comp.status { statusBadge(status) }
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var logo: some View {
        if comp.slug == SportsConstants.defaultComp {
            // دوري روشن — الشعار الرسمي (أصل محلّي) بدل شعار الخادم.
            Image("RSLLogo")
                .resizable().scaledToFit()
                .padding(4)
                .frame(width: 36, height: 36)
                .background(Circle().fill(.white))
        } else if let url = comp.logo, !url.isEmpty {
            SpRemoteImage(url: url)
                .padding(5)
                .frame(width: 36, height: 36)
                .background(Circle().fill(SpTheme.chipFill))
        } else {
            Image(systemName: comp.type == "cup" ? "trophy.fill" : "sportscourt.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SpTheme.green)
                .frame(width: 36, height: 36)
                .background(Circle().fill(SpTheme.green.opacity(0.10)))
        }
    }

    private func capability(_ label: String, _ enabled: Bool) -> some View {
        Text(label)
            .font(SportsFonts.app(size: 9.5, weight: .bold))
            .foregroundStyle(enabled ? SpTheme.green : SpTheme.onDarkFaint)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(enabled ? SpTheme.green.opacity(0.08) : SpTheme.chipFill))
    }

    private func statusBadge(_ status: String) -> some View {
        let (label, color): (String, Color) = {
            switch status {
            case "ongoing": return ("جارٍ", SpTheme.leaf)
            case "upcoming": return ("قريبًا", SpTheme.green)
            case "finished": return ("انتهى", SpTheme.onDarkFaint)
            default: return ("", SpTheme.onDarkFaint)
            }
        }()
        return Group {
            if !label.isEmpty {
                Text(label)
                    .font(SportsFonts.app(size: 10, weight: .bold))
                    .foregroundStyle(color)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(color.opacity(0.12)))
            }
        }
    }
}
