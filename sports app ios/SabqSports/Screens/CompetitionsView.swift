import SwiftUI

// البطولات — قائمة مجمّعة حسب الفئة (السعودية أولًا)، كل بطولة تفتح صفحة تفاصيلها
// (مباريات/ترتيب/هدّافون). روشن في المقدّمة دائمًا.
struct CompetitionsView: View {
    @State private var competitions: [SpCompetition] = []
    @State private var loading = true
    @State private var loadError: String?

    private var grouped: [(category: String, items: [SpCompetition])] {
        let byCat = Dictionary(grouping: competitions) { $0.category }
        return SportsConstants.categoryOrder.compactMap { cat in
            guard let items = byCat[cat], !items.isEmpty else { return nil }
            return (cat, items)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if loading {
                        SpLoading()
                    } else if let loadError {
                        SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                    } else {
                        ForEach(grouped, id: \.category) { group in
                            section(group.category, group.items)
                        }
                    }
                }
                .padding(16)
            }
            .background(SpAmbientBackground())
            .navigationTitle("البطولات")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private func section(_ category: String, _ items: [SpCompetition]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SpSectionHeader(
                icon: category == "saudi" ? "star.fill" : "trophy",
                title: SportsConstants.categoryLabel(category),
                count: items.count,
                tint: category == "saudi" ? SpTheme.gold : SpTheme.greenSoft
            )
            VStack(spacing: 10) {
                ForEach(items) { comp in
                    NavigationLink {
                        CompetitionDetailView(comp: comp)
                    } label: {
                        CompetitionRow(comp: comp)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
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

// صفّ بطولة — شعار (إن توفّر) + اسم + شارة الحالة.
struct CompetitionRow: View {
    let comp: SpCompetition

    var body: some View {
        HStack(spacing: 14) {
            logo
            VStack(alignment: .leading, spacing: 3) {
                Text(comp.name)
                    .font(SportsFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                if let status = comp.status {
                    statusBadge(status)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                        .stroke(SpTheme.outline, lineWidth: 1)
                )
        )
    }

    @ViewBuilder private var logo: some View {
        if let url = comp.logo, !url.isEmpty {
            SpRemoteImage(url: url)
                .padding(6)
                .frame(width: 44, height: 44)
                .background(Circle().fill(.white))
        } else {
            Image(systemName: comp.type == "cup" ? "trophy.fill" : "sportscourt.fill")
                .font(.system(size: 18))
                .foregroundStyle(SpTheme.gold)
                .frame(width: 44, height: 44)
                .background(Circle().fill(SpTheme.gold.opacity(0.12)))
        }
    }

    private func statusBadge(_ status: String) -> some View {
        let (label, color): (String, Color) = {
            switch status {
            case "ongoing": return ("جارٍ الآن", SpTheme.greenSoft)
            case "upcoming": return ("قريبًا", SpTheme.gold)
            case "finished": return ("انتهى الموسم", SpTheme.onDarkFaint)
            default: return ("", SpTheme.onDarkFaint)
            }
        }()
        return Group {
            if !label.isEmpty {
                Text(label)
                    .font(SportsFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(color)
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(Capsule().fill(color.opacity(0.14)))
            }
        }
    }
}
