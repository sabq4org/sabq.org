import SwiftUI

// البطولات — قائمة مجمّعة حسب الفئة (السعودية أولًا). كل فئة بطاقة بيضاء واحدة
// نظيفة بصفوف مفصولة بخطوط خفيفة (لا كروت مؤطّرة منفصلة، لا غمر أخضر). لمسة
// خضراء واحدة فقط في رؤوس الأقسام. كل بطولة تفتح صفحة تفاصيلها.
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
                VStack(alignment: .leading, spacing: 26) {
                    if loading {
                        SpLoading()
                    } else if let loadError {
                        SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                    } else {
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

    private func categorySection(_ category: String, _ items: [SpCompetition]) -> some View {
        let isSaudi = category == "saudi"
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: isSaudi ? "star.fill" : "trophy.fill")
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
            Text(comp.name)
                .font(SportsFonts.app(size: 14.5, weight: .bold))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.85)
            Spacer(minLength: 8)
            if let status = comp.status { statusBadge(status) }
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
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
                .font(.system(size: 15))
                .foregroundStyle(SpTheme.onDarkDim)
                .frame(width: 36, height: 36)
                .background(Circle().fill(SpTheme.chipFill))
        }
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
