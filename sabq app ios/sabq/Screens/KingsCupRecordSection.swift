import SwiftUI

// MARK: - سجلّ البطولة (كأس الملك)
//
// جدار الألقاب + شبكة النسخ من /kings-cup/record — بيانات المزوّد الحقيقية
// للنهائيات (بطل/وصيف/نتيجة/ترجيح) للمواسم المتاحة. مرآة قسم سجلّ الويب
// بنموذج سبق: حامل اللقب بلوك هادئ، والجدار والنسخ صفوف بفواصل رفيعة،
// وبلا تمرير أفقي: النسخ شبكة ملتفّة.

struct KcRecordSection: View {
    @State private var record: KcRecord?

    var body: some View {
        Group {
            if let record, !record.editions.isEmpty {
                VStack(alignment: .leading, spacing: SabqLayout.space16) {
                    KcSectionHeader(
                        icon: "building.columns.fill",
                        title: "سجلّ البطولة",
                        subtitle: record.sinceSeason.map { "أبطال النسخ منذ \(KcFormat.seasonLabel($0)) — من بيانات المزوّد" } ?? "أبطال النسخ الأخيرة",
                        tint: KcTheme.gold
                    )

                    if let holder = record.editions.first, let champion = holder.champion {
                        holderCard(holder, champion)
                    }

                    if !record.titles.isEmpty { titlesWall(record.titles) }

                    editionsGrid(record.editions)

                    Text("البطولة أُطلقت عام 1957 ولها تاريخ أعرق من المدى المعروض")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }
        }
        .task {
            record = try? await APIClient.shared.fetchKingsCupRecord()
        }
    }

    // MARK: حامل اللقب

    private func holderCard(_ e: KcRecordEdition, _ champion: KcHistoryChampion) -> some View {
        HStack(spacing: SabqLayout.space16) {
            ZStack(alignment: .topTrailing) {
                WCRemoteImage(url: champion.logo)
                    .padding(SabqLayout.space8).frame(width: 64, height: 64)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
                Image(systemName: "crown.fill")
                    .font(SabqType.metaEmphasis.font).foregroundStyle(KcTheme.gold)
                    .offset(x: 4, y: -6)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("حامل اللقب — نسخة \(KcFormat.seasonLabel(e.season))")
                    .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                Text(champion.name)
                    .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                if let runnerUp = e.runnerUp {
                    HStack(spacing: SabqLayout.space4) {
                        Text("على حساب \(runnerUp.name)")
                        if let score = e.score {
                            Text(score).fontWeight(.semibold).foregroundStyle(SabqTheme.textPrimary)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                        if let pens = e.penalties {
                            Text("(\(pens) ر.ت)")
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
    }

    // MARK: جدار الألقاب

    private func titlesWall(_ titles: [KcRecordTitleRow]) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: SabqLayout.space16)], spacing: 0) {
            ForEach(titles) { row in
                VStack(spacing: 0) {
                    HStack(spacing: SabqLayout.space12) {
                        WCRemoteImage(url: row.logo)
                            .padding(SabqLayout.space4).frame(width: 36, height: 36)
                            .background(Circle().fill(.white))
                            .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
                        VStack(alignment: .leading, spacing: 0) {
                            Text(row.name)
                                .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                                .lineLimit(1)
                            Text(titleCount(row.titles) + " · آخرها \(KcFormat.seasonLabel(row.lastSeason))")
                                .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, SabqLayout.space12)
                    KcRowSeparator()
                }
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
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: SabqLayout.space8)], spacing: SabqLayout.space8) {
            ForEach(editions) { e in
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text("نسخة \(KcFormat.seasonLabel(e.season))")
                        .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                    if let champion = e.champion {
                        HStack(spacing: SabqLayout.space8) {
                            WCRemoteImage(url: champion.logo)
                                .padding(3).frame(width: 28, height: 28)
                                .background(Circle().fill(.white))
                            VStack(alignment: .leading, spacing: 0) {
                                Text(champion.name)
                                    .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                                    .lineLimit(1)
                                if let score = e.score {
                                    Text(score + (e.penalties.map { " (\($0) ر.ت)" } ?? ""))
                                        .font(SabqType.tag.font.monospacedDigit())
                                        .foregroundStyle(SabqTheme.textSecondary)
                                        .environment(\.layoutDirection, .leftToRight)
                                }
                            }
                        }
                    }
                    if let runnerUp = e.runnerUp {
                        Text("الوصيف: \(runnerUp.name)")
                            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(1)
                    }
                }
                .padding(SabqLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .sabqBlockSurface()
            }
        }
    }
}
