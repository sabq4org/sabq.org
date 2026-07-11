import WidgetKit
import SwiftUI

// ويدجت الشاشة الرئيسية لخليجي 27 — يقرأ لقطة App Group التي يكتبها التطبيق:
// المباراة المميّزة (قادمة/حية) + ترتيب مجموعة السعودية. بلا شبكة داخل الويدجت
// (التطبيق هو المصدر) فيبقى خفيفًا ويحدّث كل 15 دقيقة أو عند فتح التطبيق.

private enum GcW {
    static let emerald = Color(red: 0.055, green: 0.455, blue: 0.420)
    static let emeraldDeep = Color(red: 0.035, green: 0.340, blue: 0.320)
    static let heroTop = Color(red: 0.016, green: 0.110, blue: 0.133)
    static let heroBottom = Color(red: 0.030, green: 0.200, blue: 0.220)
    static let sky = Color(red: 0.220, green: 0.741, blue: 0.973)
    static let live = Color(red: 0.87, green: 0.17, blue: 0.24)
    static let ink = Color(red: 0.055, green: 0.110, blue: 0.125)
    static let dim = Color(red: 0.340, green: 0.410, blue: 0.430)
}

struct GcWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: GcWidgetSnapshot?
}

struct GcHomeProvider: TimelineProvider {
    func placeholder(in context: Context) -> GcWidgetEntry {
        GcWidgetEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (GcWidgetEntry) -> Void) {
        completion(GcWidgetEntry(date: Date(), snapshot: GcWidgetStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GcWidgetEntry>) -> Void) {
        let entry = GcWidgetEntry(date: Date(), snapshot: GcWidgetStore.read())
        // تحديث كل 15 دقيقة (التطبيق يكتب اللقطة الأحدث عند كل فتح/تحديث).
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - العرض

struct GcHomeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: GcWidgetEntry

    var body: some View {
        ZStack {
            LinearGradient(colors: [GcW.heroTop, GcW.emerald, GcW.heroBottom], startPoint: .topTrailing, endPoint: .bottomLeading)
            content
                .padding(family == .systemSmall ? 11 : 14)
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    @ViewBuilder private var content: some View {
        if let match = entry.snapshot?.match {
            switch family {
            case .systemSmall: smallMatch(match)
            default: mediumLayout(match)
            }
        } else {
            placeholder
        }
    }

    // ودجت صغير: المباراة المميّزة فقط
    private func smallMatch(_ m: GcWidgetMatch) -> some View {
        VStack(spacing: 8) {
            header
            Spacer(minLength: 0)
            HStack(alignment: .center, spacing: 6) {
                teamBadge(m.home)
                centerScore(m)
                teamBadge(m.away)
            }
            Spacer(minLength: 0)
            statusLine(m)
        }
    }

    // ودجت متوسط: المباراة + ترتيب مصغّر لمجموعة السعودية
    private func mediumLayout(_ m: GcWidgetMatch) -> some View {
        HStack(spacing: 12) {
            VStack(spacing: 7) {
                header
                Spacer(minLength: 0)
                HStack(alignment: .center, spacing: 6) {
                    teamBadge(m.home)
                    centerScore(m)
                    teamBadge(m.away)
                }
                Spacer(minLength: 0)
                statusLine(m)
            }
            .frame(maxWidth: .infinity)

            if let rows = entry.snapshot?.rows, !rows.isEmpty {
                miniStandings(rows)
                    .frame(width: 128)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 5) {
            Image(systemName: "trophy.fill").font(.system(size: 9)).foregroundStyle(GcW.sky)
            Text("خليجي 27").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
            Spacer(minLength: 0)
        }
    }

    private func teamBadge(_ t: GcWidgetTeam) -> some View {
        VStack(spacing: 4) {
            Text(t.code)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(GcW.emeraldDeep)
                .frame(width: 34, height: 34)
                .background(Circle().fill(.white))
            Text(t.name)
                .font(.system(size: 9.5, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private func centerScore(_ m: GcWidgetMatch) -> some View {
        Group {
            if m.live || m.finished {
                Text("\(m.awayGoals ?? 0) - \(m.homeGoals ?? 0)")
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(kickoffTime(m.kickoff))
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(GcW.sky)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
    }

    private func statusLine(_ m: GcWidgetMatch) -> some View {
        Group {
            if m.live {
                HStack(spacing: 4) {
                    Circle().fill(.white).frame(width: 4, height: 4)
                    Text(m.elapsed.map { "مباشر · \($0)'" } ?? "مباشر")
                }
                .font(.system(size: 9.5, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(GcW.live))
            } else if m.finished {
                Text("انتهت").font(.system(size: 9.5, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
            } else {
                Text(m.round.isEmpty ? relativeDay(m.kickoff) : m.round)
                    .font(.system(size: 9.5, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
            }
        }
    }

    private func miniStandings(_ rows: [GcWidgetStandingRow]) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(entry.snapshot?.groupName ?? "الترتيب")
                .font(.system(size: 9.5, weight: .bold))
                .foregroundStyle(GcW.sky)
            ForEach(Array(rows.prefix(4).enumerated()), id: \.offset) { _, r in
                HStack(spacing: 5) {
                    Text("\(r.rank)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white.opacity(0.7))
                        .frame(width: 10)
                    Text(r.name)
                        .font(.system(size: 10, weight: r.isSaudi ? .bold : .regular))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Spacer(minLength: 2)
                    Text("\(r.points)")
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                }
                .padding(.horizontal, 7).padding(.vertical, 3)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(r.isSaudi ? Color.white.opacity(0.14) : Color.clear)
                )
            }
        }
        .padding(9)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.black.opacity(0.14)))
    }

    private var placeholder: some View {
        VStack(spacing: 6) {
            Image(systemName: "sparkles").font(.system(size: 18)).foregroundStyle(GcW.sky)
            Text("خليجي 27").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
            Text("افتح التطبيق لعرض المباراة القادمة")
                .font(.system(size: 9.5))
                .foregroundStyle(.white.opacity(0.8))
                .multilineTextAlignment(.center)
        }
    }

    private func kickoffTime(_ ts: TimeInterval) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar-SA@calendar=gregorian;numbers=latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "HH:mm"
        return f.string(from: Date(timeIntervalSince1970: ts))
    }

    private func relativeDay(_ ts: TimeInterval) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar-SA@calendar=gregorian;numbers=latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "EEEE HH:mm"
        return f.string(from: Date(timeIntervalSince1970: ts))
    }
}

struct GcHomeWidget: Widget {
    let kind = "GcHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GcHomeProvider()) { entry in
            GcHomeWidgetView(entry: entry)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("خليجي 27")
        .description("المباراة المميّزة وترتيب مجموعة الأخضر.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
