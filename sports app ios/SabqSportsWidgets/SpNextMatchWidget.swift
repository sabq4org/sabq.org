import WidgetKit
import SwiftUI

// ودجت الشاشة الرئيسية «المباراة القادمة» — يقرأ لقطة يكتبها التطبيق عبر
// App Group (بلا شبكة): الفريقان + البطولة + عدّ تنازلي ذاتي حتى الانطلاق.
// النتائج الحيّة مسؤولية Live Activity؛ هذا الودجت للترقّب، وبعد الانطلاق
// يعرض «انطلقت» حتى يكتب التطبيق لقطة المباراة التالية.

struct SpNextMatchEntry: TimelineEntry {
    let date: Date
    let snapshot: SpWidgetSnapshot?
}

struct SpNextMatchProvider: TimelineProvider {
    func placeholder(in context: Context) -> SpNextMatchEntry {
        SpNextMatchEntry(date: .now, snapshot: .spPreview)
    }

    func getSnapshot(in context: Context, completion: @escaping (SpNextMatchEntry) -> Void) {
        completion(SpNextMatchEntry(date: .now, snapshot: SpWidgetSnapshot.load() ?? .spPreview))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SpNextMatchEntry>) -> Void) {
        let snap = SpWidgetSnapshot.load()
        var entries = [SpNextMatchEntry(date: .now, snapshot: snap)]
        var refresh = Date().addingTimeInterval(3 * 3600)
        if let k = snap?.kickoff {
            if k > .now {
                // مدخل ثانٍ لحظة الانطلاق — تنقلب الواجهة إلى «انطلقت» دون تحديث خط.
                entries.append(SpNextMatchEntry(date: k, snapshot: snap))
                refresh = min(refresh, k.addingTimeInterval(2 * 3600))
            } else {
                refresh = Date().addingTimeInterval(30 * 60)
            }
        }
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }
}

extension SpWidgetSnapshot {
    /// عيّنة للمعاينة في معرض الودجات.
    static let spPreview = SpWidgetSnapshot(
        fixtureId: 0, homeName: "الهلال", awayName: "النصر",
        homeLogoFile: nil, awayLogoFile: nil, competition: "دوري روشن",
        kickoff: .now.addingTimeInterval(26 * 3600), isFavoriteTeam: true)
}

// ألوان متكيّفة خاصة بودجت الشاشة الرئيسية (أبيض نظيف نهارًا، فحمي ليلًا) —
// UIColor ديناميكي كي يتكيّف السطح تلقائيًّا بلا فرض مظهر.
private enum SpHW {
    static func adaptive(_ light: UIColor, _ dark: UIColor) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }
    static let green = adaptive(UIColor(red: 0.09, green: 0.43, blue: 0.32, alpha: 1),
                                UIColor(red: 0.24, green: 0.68, blue: 0.50, alpha: 1))
    static let ink = adaptive(UIColor(red: 0.10, green: 0.12, blue: 0.15, alpha: 1), .white)
    static let dim = adaptive(UIColor(red: 0.42, green: 0.46, blue: 0.52, alpha: 1),
                              UIColor(white: 1, alpha: 0.66))
    static let faint = adaptive(UIColor(red: 0.62, green: 0.66, blue: 0.72, alpha: 1),
                                UIColor(white: 1, alpha: 0.42))
    static let chip = adaptive(UIColor(red: 0.95, green: 0.96, blue: 0.97, alpha: 1),
                               UIColor(white: 1, alpha: 0.10))
}

struct SpNextMatchWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SpNextMatchEntry

    var body: some View {
        Group {
            if let snap = entry.snapshot {
                if family == .systemMedium { medium(snap) } else { small(snap) }
            } else {
                emptyState
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .containerBackground(for: .widget) { Color(uiColor: .systemBackground) }
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "soccerball").font(.system(size: 22)).foregroundStyle(SpHW.faint)
            Text("افتح VARA لتحميل مبارياتك")
                .font(.system(size: 11, weight: .semibold)).foregroundStyle(SpHW.dim)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: الصغير — البطولة ثم الفريقان ثم الموعد/العدّ.
    private func small(_ s: SpWidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            headerRow(s)
            Spacer(minLength: 0)
            teamRow(name: s.homeName, file: s.homeLogoFile)
            teamRow(name: s.awayName, file: s.awayLogoFile)
            Spacer(minLength: 0)
            kickoffLine(s)
        }
    }

    // MARK: المتوسّط — شعاران متقابلان وعدّ تنازلي بالمنتصف.
    private func medium(_ s: SpWidgetSnapshot) -> some View {
        VStack(spacing: 10) {
            headerRow(s)
            HStack(spacing: 10) {
                teamColumn(name: s.homeName, file: s.homeLogoFile)
                VStack(spacing: 4) {
                    if started(s) {
                        Text("انطلقت").font(.system(size: 15, weight: .heavy)).foregroundStyle(SpHW.green)
                    } else {
                        Text(s.kickoff, style: .timer)
                            .font(.system(size: 19, weight: .heavy).monospacedDigit())
                            .foregroundStyle(SpHW.green)
                            .multilineTextAlignment(.center)
                            .environment(\.layoutDirection, .leftToRight)
                        Text(dayLabel(s.kickoff))
                            .font(.system(size: 10.5, weight: .semibold)).foregroundStyle(SpHW.dim)
                    }
                }
                .frame(maxWidth: .infinity)
                teamColumn(name: s.awayName, file: s.awayLogoFile)
            }
        }
    }

    private func headerRow(_ s: SpWidgetSnapshot) -> some View {
        HStack(spacing: 5) {
            Image(systemName: s.isFavoriteTeam ? "star.fill" : "trophy.fill")
                .font(.system(size: 9, weight: .bold)).foregroundStyle(SpHW.green)
            Text(s.isFavoriteTeam ? "مباراة فريقك" : s.competition)
                .font(.system(size: 10, weight: .bold)).foregroundStyle(SpHW.green)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
    }

    private func teamRow(name: String, file: String?) -> some View {
        HStack(spacing: 7) {
            logoView(file: file, name: name, size: 22)
            Text(name)
                .font(.system(size: 12.5, weight: .bold)).foregroundStyle(SpHW.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
    }

    private func teamColumn(name: String, file: String?) -> some View {
        VStack(spacing: 6) {
            logoView(file: file, name: name, size: 38)
            Text(name)
                .font(.system(size: 11.5, weight: .bold)).foregroundStyle(SpHW.ink)
                .lineLimit(1).minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func kickoffLine(_ s: SpWidgetSnapshot) -> some View {
        if started(s) {
            Text("انطلقت — تابعها في VARA")
                .font(.system(size: 10.5, weight: .heavy)).foregroundStyle(SpHW.green)
                .lineLimit(1).minimumScaleFactor(0.8)
        } else {
            HStack(spacing: 5) {
                Text(dayLabel(s.kickoff))
                    .font(.system(size: 10.5, weight: .semibold)).foregroundStyle(SpHW.dim)
                Spacer(minLength: 0)
                Text(s.kickoff, style: .time)
                    .font(.system(size: 12, weight: .heavy).monospacedDigit())
                    .foregroundStyle(SpHW.green)
                    .environment(\.layoutDirection, .leftToRight)
            }
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(SpHW.chip))
        }
    }

    @ViewBuilder private func logoView(file: String?, name: String, size: CGFloat) -> some View {
        if let img = SpSharedContainer.image(named: file) {
            Image(uiImage: img)
                .resizable().scaledToFit()
                .frame(width: size, height: size)
                .padding(2)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(SpHW.chip, lineWidth: 1))
        } else {
            Text(SpLA.shortName(name))
                .font(.system(size: size * 0.4, weight: .heavy)).foregroundStyle(SpHW.dim)
                .frame(width: size + 4, height: size + 4)
                .background(Circle().fill(SpHW.chip))
        }
    }

    private func started(_ s: SpWidgetSnapshot) -> Bool { entry.date >= s.kickoff }

    /// «اليوم» / «غدًا» / اسم اليوم — بتقويم الرياض.
    private func dayLabel(_ d: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Riyadh") ?? .current
        if cal.isDateInToday(d) { return "اليوم" }
        if cal.isDateInTomorrow(d) { return "غدًا" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "ar")
        fmt.timeZone = cal.timeZone
        fmt.dateFormat = "EEEE d MMM"
        return fmt.string(from: d)
    }
}

struct SpNextMatchWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: SpWidgetBridgeKind.kind, provider: SpNextMatchProvider()) { entry in
            SpNextMatchWidgetView(entry: entry)
        }
        .configurationDisplayName("المباراة القادمة")
        .description("مباراة فريقك المفضّل القادمة مع عدّ تنازلي حتى الانطلاق.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// معرّف نوع الودجت — مشترك اسمًا مع `SpWidgetBridge.widgetKind` في التطبيق.
enum SpWidgetBridgeKind {
    static let kind = "SpNextMatchWidget"
}
