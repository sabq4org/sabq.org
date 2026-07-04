import SwiftUI

// MARK: - سجلّ البطولة (كأس الملك)
//
// جدار الألقاب + شبكة النسخ من /kings-cup/record — بيانات المزوّد الحقيقية
// للنهائيات (بطل/وصيف/نتيجة/ترجيح) للمواسم المتاحة. مرآة قسم سجلّ الويب
// وبنمط أقسام المونديال (ترويسة WCSectionHeader + بطاقات WCTheme)،
// وبلا تمرير أفقي: النسخ شبكة ملتفّة.

struct KcRecordSection: View {
    @State private var record: KcRecord?

    var body: some View {
        Group {
            if let record, !record.editions.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    WCSectionHeader(
                        icon: "building.columns.fill",
                        title: "سجلّ البطولة",
                        subtitle: record.sinceSeason.map { "أبطال النسخ منذ \(KcFormat.seasonLabel($0)) — من بيانات المزوّد" } ?? "أبطال النسخ الأخيرة",
                        tint: WCTheme.gold
                    )

                    if let holder = record.editions.first, let champion = holder.champion {
                        holderCard(holder, champion)
                    }

                    if !record.titles.isEmpty { titlesWall(record.titles) }

                    editionsGrid(record.editions)

                    Text("البطولة أُطلقت عام 1957 ولها تاريخ أعرق من المدى المعروض")
                        .font(SabqFonts.app(size: 10))
                        .foregroundStyle(WCTheme.onDarkDim)
                }
                .padding(.horizontal, 20)
            }
        }
        .task {
            record = try? await APIClient.shared.fetchKingsCupRecord()
        }
    }

    // MARK: حامل اللقب

    private func holderCard(_ e: KcRecordEdition, _ champion: KcHistoryChampion) -> some View {
        HStack(spacing: 14) {
            ZStack(alignment: .topTrailing) {
                WCRemoteImage(url: champion.logo)
                    .padding(8).frame(width: 64, height: 64)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(WCTheme.gold.opacity(0.7), lineWidth: 2))
                Image(systemName: "crown.fill")
                    .font(.system(size: 13)).foregroundStyle(WCTheme.gold)
                    .offset(x: 4, y: -6)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text("حامل اللقب — نسخة \(KcFormat.seasonLabel(e.season))")
                    .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.gold)
                Text(champion.name)
                    .font(SabqFonts.app(size: 19, weight: .black)).foregroundStyle(WCTheme.onDark)
                if let runnerUp = e.runnerUp {
                    HStack(spacing: 4) {
                        Text("على حساب \(runnerUp.name)")
                        if let score = e.score {
                            Text(score).fontWeight(.black).foregroundStyle(WCTheme.gold)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                        if let pens = e.penalties {
                            Text("(\(pens) ر.ت)")
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                    .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.gold.opacity(0.08)))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.gold.opacity(0.35), lineWidth: 1))
    }

    // MARK: جدار الألقاب

    private func titlesWall(_ titles: [KcRecordTitleRow]) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], spacing: 8) {
            ForEach(titles) { row in
                HStack(spacing: 10) {
                    WCRemoteImage(url: row.logo)
                        .padding(4).frame(width: 36, height: 36)
                        .background(Circle().fill(.white))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.name)
                            .font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.onDark)
                            .lineLimit(1)
                        Text(titleCount(row.titles) + " · آخرها \(KcFormat.seasonLabel(row.lastSeason))")
                            .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .wcElevatedCard(cornerRadius: 14)
            }
        }
    }

    private func titleCount(_ n: Int) -> String {
        switch n {
        case 1: return "لقب"
        case 2: return "لقبان"
        default: return "\(n) ألقاب"
        }
    }

    // MARK: شبكة النسخ — ملتفّة بلا تمرير أفقي

    private func editionsGrid(_ editions: [KcRecordEdition]) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 8)], spacing: 8) {
            ForEach(editions) { e in
                VStack(alignment: .leading, spacing: 6) {
                    Text("نسخة \(KcFormat.seasonLabel(e.season))")
                        .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                    if let champion = e.champion {
                        HStack(spacing: 8) {
                            WCRemoteImage(url: champion.logo)
                                .padding(3).frame(width: 28, height: 28)
                                .background(Circle().fill(.white))
                            VStack(alignment: .leading, spacing: 0) {
                                Text(champion.name)
                                    .font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(WCTheme.onDark)
                                    .lineLimit(1)
                                if let score = e.score {
                                    Text(score + (e.penalties.map { " (\($0) ر.ت)" } ?? ""))
                                        .font(SabqFonts.app(size: 10).monospacedDigit())
                                        .foregroundStyle(WCTheme.onDarkDim)
                                        .environment(\.layoutDirection, .leftToRight)
                                }
                            }
                        }
                    }
                    if let runnerUp = e.runnerUp {
                        Text("الوصيف: \(runnerUp.name)")
                            .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                            .lineLimit(1)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .wcElevatedCard(cornerRadius: 14)
            }
        }
    }
}
