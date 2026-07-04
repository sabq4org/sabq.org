import SwiftUI
import Combine

// مركز الانتقالات — نظير 1:1 لصفحة /sports/transfers على الويب بثيم VARA:
//   • Hero: أضخم القصص الجارية  • عدّادا نافذتي الانتقالات
//   • تبويبا نطاق (سعودية/عالمية) × نوع (مؤكّدة/إشاعات/إعارات/تجديد)
//   • مقياس احتمال بصري + مصدر إلزامي بمؤشر موثوقية + وسم مؤكّد/إشاعة صريح
//   • إحصائيات السوق: مقارنة روشن/البريميرليغ + ميزان أندية روشن
// المؤكّد السعودي من /sports/transfers، والباقي من /transfer-center/*.
// الأرقام: الرقم ثم رمز العملة (TcMoney) — «85 مليون €».

// MARK: - عناصر مشتركة صغيرة

/// مقياس الاحتمال — أربع خانات تمتلئ حسب الدرجة (وشيكة تنبض).
struct TcProbabilityMeter: View {
    let probability: TcProbability
    var showLabel: Bool = true
    @State private var pulse = false

    private var color: Color {
        switch probability {
        case .imminent: return SpTheme.crimson
        case .high: return SpTheme.dyn(Color(red: 0.85, green: 0.45, blue: 0.10), Color(red: 0.96, green: 0.60, blue: 0.30))
        case .medium: return SpTheme.dyn(Color(red: 0.80, green: 0.62, blue: 0.10), Color(red: 0.94, green: 0.78, blue: 0.32))
        case .low: return SpTheme.onDarkFaint
        }
    }

    var body: some View {
        HStack(spacing: 7) {
            HStack(spacing: 3) {
                ForEach(0..<4, id: \.self) { i in
                    Capsule()
                        .fill(i < probability.segments ? color : SpTheme.outline)
                        .frame(width: 13, height: 5)
                        .opacity(probability == .imminent && i < probability.segments && pulse ? 0.4 : 1)
                }
            }
            .environment(\.layoutDirection, .leftToRight)
            if showLabel {
                Text(probability.label)
                    .font(SportsFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(color)
            }
        }
        .onAppear {
            if probability == .imminent {
                withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { pulse = true }
            }
        }
    }
}

/// شارة المصدر: مؤشر موثوقية تحريري + الاسم + أيقونة رابط خارجي.
struct TcSourceBadge: View {
    let source: TcSource

    private var meta: (icon: String, color: Color, label: String) {
        switch source.tier {
        case "high": return ("checkmark.shield.fill", SpTheme.dyn(Color(red: 0.05, green: 0.55, blue: 0.35), Color(red: 0.30, green: 0.80, blue: 0.55)), "موثوقية عالية")
        case "low": return ("exclamationmark.shield.fill", SpTheme.dyn(Color(red: 0.75, green: 0.52, blue: 0.05), Color(red: 0.92, green: 0.70, blue: 0.30)), "تعامل بحذر")
        default: return ("shield.lefthalf.filled", SpTheme.onDarkDim, "موثوقية متوسطة")
        }
    }

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: meta.icon).font(.system(size: 10, weight: .semibold))
            Text(source.name).font(SportsFonts.app(size: 11, weight: .bold)).lineLimit(1)
            if source.url != nil {
                Image(systemName: "arrow.up.forward.square").font(.system(size: 9)).opacity(0.6)
            }
        }
        .foregroundStyle(meta.color)
    }
}

/// وسم صريح يفصل المؤكّد عن الإشاعة — لا يلتبس على القارئ أبدًا.
struct TcCertaintyTag: View {
    let confirmed: Bool
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: confirmed ? "checkmark.seal.fill" : "circle.dashed")
                .font(.system(size: 9, weight: .bold))
            Text(confirmed ? "مؤكّدة" : "إشاعة")
                .font(SportsFonts.app(size: 10, weight: .heavy))
        }
        .foregroundStyle(confirmed ? SpTheme.dyn(Color(red: 0.05, green: 0.55, blue: 0.35), Color(red: 0.30, green: 0.80, blue: 0.55)) : SpTheme.dyn(Color(red: 0.66, green: 0.20, blue: 0.55), Color(red: 0.90, green: 0.52, blue: 0.80)))
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(
            Capsule().fill((confirmed ? Color.green : Color.purple).opacity(0.12))
        )
    }
}

/// شارة «Here we go!» للصفقات الوشيكة.
struct TcHereWeGoBadge: View {
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "flame.fill").font(.system(size: 9, weight: .bold))
            Text("Here we go!").font(SportsFonts.app(size: 10, weight: .heavy))
                .environment(\.layoutDirection, .leftToRight)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(Capsule().fill(SpTheme.crimson))
    }
}

/// مبلغ الصفقة — «85 مليون €» (الرقم ثم رمز العملة)، بخلفية كهرمانية.
struct TcMoneyPill: View {
    let amount: Double?
    let currency: String?
    var body: some View {
        if let text = TcMoney.format(amount, currency: currency) {
            Text(text)
                .font(SportsFonts.app(size: 12, weight: .heavy))
                .foregroundStyle(SpTheme.goldDeep)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.gold.opacity(0.14)))
        }
    }
}

/// شعار نادٍ صغير + اسم (لعرض «من ← إلى»).
struct TcPartyChip: View {
    let party: TcParty
    var emphasize: Bool = false
    var body: some View {
        HStack(spacing: 5) {
            if let img = party.image, !img.isEmpty {
                SpRemoteImage(url: img).frame(width: 18, height: 18)
            }
            Text(party.name)
                .font(SportsFonts.app(size: 13, weight: emphasize ? .bold : .semibold))
                .foregroundStyle(emphasize ? SpTheme.onDark : SpTheme.onDarkDim)
                .lineLimit(1)
        }
    }
}

// MARK: - بطاقة إشاعة

struct TcRumourCard: View {
    let rumour: TcRumour
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 10) {
                if rumour.hereWeGo { TcHereWeGoBadge() }
                HStack(alignment: .top, spacing: 11) {
                    SpAvatarImage(url: rumour.player.image, size: 44,
                                  ring: SpTheme.cardStroke, placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
                    VStack(alignment: .leading, spacing: 7) {
                        HStack(spacing: 6) {
                            Text(rumour.player.name)
                                .font(SportsFonts.app(size: 15, weight: .bold))
                                .foregroundStyle(SpTheme.onDark).lineLimit(1)
                            if let pos = rumour.player.position {
                                Text(pos).font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
                            }
                            Spacer(minLength: 0)
                            TcCertaintyTag(confirmed: false)
                        }
                        HStack(spacing: 7) {
                            TcPartyChip(party: rumour.from)
                            Image(systemName: "arrow.left").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                            TcPartyChip(party: rumour.to, emphasize: true)
                            Spacer(minLength: 0)
                            TcMoneyPill(amount: rumour.amount, currency: rumour.currency)
                        }
                        HStack(spacing: 12) {
                            TcProbabilityMeter(probability: rumour.probability)
                            TcSourceBadge(source: rumour.source)
                            Spacer(minLength: 0)
                            Text(TcDate.medium(rumour.date))
                                .font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
                        }
                    }
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .stroke(rumour.hereWeGo ? SpTheme.crimson.opacity(0.45) : SpTheme.cardStroke, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }
}

// MARK: - صف مؤكّد عالمي

struct TcConfirmedRow: View {
    let item: TcConfirmed
    var body: some View {
        HStack(spacing: 11) {
            SpAvatarImage(url: item.player.image, size: 38,
                          ring: SpTheme.cardStroke, placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.player.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                HStack(spacing: 6) {
                    TcPartyChip(party: item.from)
                    Image(systemName: "arrow.left").font(.system(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                    TcPartyChip(party: item.to, emphasize: true)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 4) {
                TcCertaintyTag(confirmed: true)
                if item.kind == .loan {
                    Text("إعارة").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.teal)
                } else if item.kind == .free {
                    Text("انتقال حر").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.dyn(Color(red: 0.05, green: 0.55, blue: 0.35), Color(red: 0.30, green: 0.80, blue: 0.55)))
                }
                TcMoneyPill(amount: item.amount, currency: item.currency)
            }
        }
        .padding(.horizontal, 13).padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }
}

// MARK: - بطاقة Hero (أضخم القصص)

struct TcHeroCard: View {
    let rumour: TcRumour
    let rank: Int
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    if rumour.hereWeGo { TcHereWeGoBadge() }
                    Spacer(minLength: 0)
                    Text("#\(rank)").font(SportsFonts.app(size: 26, weight: .heavy)).foregroundStyle(SpTheme.onDarkFaint.opacity(0.4))
                        .environment(\.layoutDirection, .leftToRight)
                }
                HStack(spacing: 10) {
                    SpAvatarImage(url: rumour.player.image, size: 52,
                                  ring: SpTheme.cardStroke, placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(rumour.player.name).font(SportsFonts.app(size: 17, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Text(rumour.player.position ?? "—").font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkFaint)
                    }
                    Spacer(minLength: 0)
                }
                if let money = TcMoney.format(rumour.amount, currency: rumour.currency) {
                    Text(money).font(SportsFonts.app(size: 24, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                }
                HStack(spacing: 7) {
                    TcPartyChip(party: rumour.from)
                    Image(systemName: "arrow.left").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                    TcPartyChip(party: rumour.to, emphasize: true)
                }
                HStack {
                    TcProbabilityMeter(probability: rumour.probability)
                    Spacer(minLength: 0)
                    Text(TcDate.medium(rumour.date)).font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
                }
            }
            .padding(15)
            .frame(width: 280, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(SpTheme.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(LinearGradient(colors: [(rumour.hereWeGo ? SpTheme.crimson : SpTheme.green).opacity(0.07), .clear],
                                                 startPoint: .topTrailing, endPoint: .bottomLeading))
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(rumour.hereWeGo ? SpTheme.crimson.opacity(0.4) : SpTheme.cardStroke, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }
}

// MARK: - عدّاد نافذة الانتقالات

struct TcWindowCountdown: View {
    let window: TcWindow
    @State private var now = Date()
    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f
    }()

    private func remaining(_ target: Date) -> String {
        let secs = max(0, Int(target.timeIntervalSince(now)))
        let days = secs / 86_400, hours = (secs % 86_400) / 3_600
        if days > 0 { return "\(days) يومًا و\(hours) ساعة" }
        let mins = (secs % 3_600) / 60
        return "\(hours) ساعة و\(mins) دقيقة"
    }

    var body: some View {
        let opens = Self.iso.date(from: window.opensAt) ?? Date()
        let closes = Self.iso.date(from: window.closesAt) ?? Date()
        let (status, pct): (String, Double) = {
            if now < opens { return ("تفتح بعد \(remaining(opens))", 0) }
            if now < closes {
                let p = closes.timeIntervalSince(opens) > 0 ? (now.timeIntervalSince(opens) / closes.timeIntervalSince(opens)) : 0
                return ("تُغلق بعد \(remaining(closes))", min(1, max(0, p)))
            }
            return ("أُغلقت النافذة", 1)
        }()

        return VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 6) {
                Image(systemName: "hourglass").font(.system(size: 12, weight: .bold)).foregroundStyle(SpTheme.green)
                Text(window.label).font(SportsFonts.app(size: 12, weight: .heavy)).foregroundStyle(SpTheme.onDark)
            }
            Text(status).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1).minimumScaleFactor(0.8)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(SpTheme.chipFill).frame(height: 5)
                    Capsule().fill(SpTheme.green).frame(width: geo.size.width * pct, height: 5)
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: 5)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        .onReceive(timer) { now = $0 }
    }
}

// MARK: - إحصائيات السوق

struct TcComparisonCard: View {
    let comparison: TcComparison
    private var rumoured: Bool { comparison.basis == "rumoured" }

    private func bar(label: String, side: TcComparisonSide, color: Color, maxTotal: Double) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label).font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                HStack(spacing: 5) {
                    Text(TcMoney.format(side.total, currency: "EUR") ?? "0 €")
                        .font(SportsFonts.app(size: 12, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    Text("· \(side.deals) \(rumoured ? "إشاعة" : "صفقة")")
                        .font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(SpTheme.chipFill).frame(height: 10)
                    Capsule().fill(color).frame(width: geo.size.width * CGFloat(maxTotal > 0 ? max(0.02, side.total / maxTotal) : 0.02), height: 10)
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: 10)
        }
    }

    var body: some View {
        let maxTotal = max(comparison.roshn.total, comparison.premierLeague.total, 1)
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 7) {
                Image(systemName: "chart.bar.fill").font(.system(size: 14)).foregroundStyle(SpTheme.onDark)
                Text(rumoured ? "قيم الميركاتو المتداولة: روشن مقابل البريميرليغ" : "إنفاق الميركاتو: روشن مقابل البريميرليغ")
                    .font(SportsFonts.app(size: 14, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                if rumoured { TcCertaintyTag(confirmed: false) }
            }
            bar(label: "🇸🇦 دوري روشن السعودي", side: comparison.roshn, color: SpTheme.green, maxTotal: maxTotal)
            bar(label: "🏴 البريميرليغ", side: comparison.premierLeague, color: SpTheme.dyn(Color(red: 0.42, green: 0.33, blue: 0.62), Color(red: 0.68, green: 0.58, blue: 0.87)), maxTotal: maxTotal)
            Text(rumoured
                 ? "قيم متداولة في إشاعات المصادر منذ مطلع يونيو — تتحوّل إلى الصفقات الرسمية فور توفّر سجل النافذة."
                 : "الصفقات المُعلَنة المبالغ فقط منذ مطلع يونيو.")
                .font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }
}

struct TcClubBalanceCard: View {
    let rows: [TcClubBalance]
    var body: some View {
        let maxVal = max(rows.map { max($0.spent, $0.earned) }.max() ?? 1, 1)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Image(systemName: "arrow.left.arrow.right.circle.fill").font(.system(size: 14)).foregroundStyle(SpTheme.onDark)
                Text("ميزان السوق — أندية روشن هذا الميركاتو")
                    .font(SportsFonts.app(size: 14, weight: .heavy)).foregroundStyle(SpTheme.onDark)
            }
            ForEach(rows) { r in
                HStack(spacing: 10) {
                    HStack(spacing: 5) {
                        if !r.logo.isEmpty { SpRemoteImage(url: r.logo).frame(width: 18, height: 18) }
                        Text(r.club).font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                    }
                    .frame(width: 96, alignment: .leading)
                    VStack(spacing: 4) {
                        balanceBar(value: r.spent, color: SpTheme.crimson, maxVal: maxVal)
                        balanceBar(value: r.earned, color: SpTheme.dyn(Color(red: 0.05, green: 0.55, blue: 0.35), Color(red: 0.30, green: 0.80, blue: 0.55)), maxVal: maxVal)
                    }
                }
            }
            HStack(spacing: 14) {
                legend(color: SpTheme.crimson, text: "صرف")
                legend(color: SpTheme.dyn(Color(red: 0.05, green: 0.55, blue: 0.35), Color(red: 0.30, green: 0.80, blue: 0.55)), text: "دخل")
            }
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func balanceBar(value: Double, color: Color, maxVal: Double) -> some View {
        HStack(spacing: 6) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(SpTheme.chipFill).frame(height: 7)
                    Capsule().fill(color).frame(width: geo.size.width * CGFloat(max(0.01, value / maxVal)), height: 7)
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: 7)
            Text(TcMoney.format(value, currency: "EUR") ?? "—")
                .font(SportsFonts.app(size: 9.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
                .frame(width: 68, alignment: .trailing)
        }
    }

    private func legend(color: Color, text: String) -> some View {
        HStack(spacing: 5) {
            Capsule().fill(color).frame(width: 16, height: 7)
            Text(text).font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkDim)
        }
    }
}

// MARK: - الشاشة الرئيسية للمركز

struct TransferCenterView: View {
    enum Scope: String, CaseIterable { case saudi = "🇸🇦 سعودية", global = "🌍 عالمية" }
    enum Tab: String, CaseIterable {
        case confirmed = "مؤكّدة", rumours = "إشاعات", loans = "إعارات", extensions = "تجديد"
    }
    enum ProbFilter: Hashable { case all, level(TcProbability) }

    @State private var rumours: [TcRumour] = []
    @State private var globalConfirmed: [TcConfirmed] = []
    @State private var saudiConfirmed: [SpLeagueTransfer] = []
    @State private var overview: TcOverviewResponse?
    @State private var leagues: [TcLeagueRef] = []

    @State private var scope: Scope = .saudi
    @State private var tab: Tab = .confirmed
    @State private var probFilter: ProbFilter = .all
    @State private var majorsOnly = true

    @State private var loading = true
    @State private var loadedGlobal = false
    @State private var selectedStory: IDBox?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                if let hero = overview?.hero, !hero.isEmpty { heroStrip(hero) }
                if let windows = overview?.windows { windowsRow(windows) }
                scopeTabs
                contentTabs
                filterBar
                content
                marketStats
                disclaimer
            }
            .padding(.vertical, 12)
        }
        .background(SpAmbientBackground())
        .navigationTitle("مركز الانتقالات")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $selectedStory) { box in
            TransferStoryView(playerId: box.id)
        }
        .task { await loadInitial() }
        .onChange(of: tab) { _, _ in Task { await loadGlobalIfNeeded() } }
        .onChange(of: scope) { _, _ in Task { await loadGlobalIfNeeded() } }
        .refreshable { await loadInitial(force: true) }
    }

    // MARK: أقسام العرض

    private func heroStrip(_ hero: [TcRumour]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle(icon: "flame.fill", "أضخم القصص الجارية")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(hero.enumerated()), id: \.element.id) { i, r in
                        TcHeroCard(rumour: r, rank: i + 1) { selectedStory = IDBox(id: r.player.id) }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func windowsRow(_ windows: TcWindows) -> some View {
        VStack(spacing: 10) {
            TcWindowCountdown(window: windows.saudi)
            TcWindowCountdown(window: windows.europe)
        }
        .padding(.horizontal, 16)
    }

    private var scopeTabs: some View {
        HStack(spacing: 8) {
            ForEach(Scope.allCases, id: \.self) { s in
                Button { scope = s } label: {
                    Text(s.rawValue)
                        .font(SportsFonts.app(size: 14, weight: .heavy))
                        .foregroundStyle(scope == s ? SpTheme.onDarkStrong : SpTheme.onDarkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(scope == s ? SpTheme.card : .clear)
                                .shadow(color: scope == s ? SpTheme.cardShadow : .clear, radius: 4, y: 2)
                        )
                }
                .buttonStyle(SpPressStyle())
            }
        }
        .padding(5)
        .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(SpTheme.chipFill))
        .padding(.horizontal, 16)
    }

    private var contentTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Tab.allCases, id: \.self) { t in
                    Button { tab = t } label: {
                        Text(t.rawValue)
                            .font(SportsFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(tab == t ? .white : SpTheme.onDarkDim)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Capsule().fill(tab == t ? SpTheme.green : SpTheme.card))
                            .overlay(Capsule().stroke(tab == t ? .clear : SpTheme.cardStroke, lineWidth: 1))
                    }
                    .buttonStyle(SpPressStyle())
                }
            }
            .padding(.horizontal, 16)
        }
    }

    @ViewBuilder private var filterBar: some View {
        if showRumours {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    probChip("كل الدرجات", .all)
                    probChip("وشيكة", .level(.imminent))
                    probChip("قوية", .level(.high))
                    probChip("متوسطة", .level(.medium))
                    probChip("ضعيفة", .level(.low))
                }
                .padding(.horizontal, 16)
            }
        } else if showGlobalConfirmed {
            HStack(spacing: 8) {
                majorChip("أبرز الأندية", true)
                majorChip("كل الانتقالات", false)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
        }
    }

    private func probChip(_ label: String, _ value: ProbFilter) -> some View {
        Button { probFilter = value } label: {
            Text(label)
                .font(SportsFonts.app(size: 12, weight: .bold))
                .foregroundStyle(probFilter == value ? .white : SpTheme.onDarkDim)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Capsule().fill(probFilter == value ? SpTheme.green : SpTheme.card))
                .overlay(Capsule().stroke(probFilter == value ? .clear : SpTheme.cardStroke, lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }

    private func majorChip(_ label: String, _ value: Bool) -> some View {
        Button { majorsOnly = value } label: {
            Text(label)
                .font(SportsFonts.app(size: 12, weight: .bold))
                .foregroundStyle(majorsOnly == value ? .white : SpTheme.onDarkDim)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Capsule().fill(majorsOnly == value ? SpTheme.green : SpTheme.card))
                .overlay(Capsule().stroke(majorsOnly == value ? .clear : SpTheme.cardStroke, lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }

    @ViewBuilder private var content: some View {
        if loading && rumours.isEmpty && saudiConfirmed.isEmpty {
            SpLoading().padding(.top, 30)
        } else if showSaudiConfirmed {
            saudiConfirmedList
        } else if showGlobalConfirmed {
            globalConfirmedList
        } else {
            rumoursList
        }
    }

    // سعودية › مؤكّدة / إعارات مؤكّدة (من /sports/transfers)
    private var saudiConfirmedList: some View {
        let items = saudiConfirmed.filter { t in
            tab == .loans ? (t.kind == "loan" || t.kind == "loanend") : true
        }
        return Group {
            if items.isEmpty {
                SpEmptyState(icon: "arrow.left.arrow.right", title: "لا صفقات مؤكّدة",
                             subtitle: "لا حركة انتقالات مؤكّدة في النافذة الحالية.")
            } else {
                VStack(spacing: 9) {
                    listCount(items.count, "صفقة مؤكّدة")
                    ForEach(items) { t in saudiRow(t) }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func saudiRow(_ t: SpLeagueTransfer) -> some View {
        HStack(spacing: 11) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t.player.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                Text(TcDate.medium(t.date)).font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
            }
            .frame(width: 130, alignment: .leading)
            HStack(spacing: 6) {
                clubMini(t.from, roshn: t.outClubId != nil)
                Image(systemName: "arrow.left").font(.system(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                clubMini(t.to, roshn: t.inClubId != nil)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 4) {
                TcCertaintyTag(confirmed: true)
                Text(t.type).font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green).lineLimit(1)
            }
        }
        .padding(.horizontal, 13).padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func clubMini(_ c: SpTransferClub, roshn: Bool) -> some View {
        HStack(spacing: 4) {
            if !c.logo.isEmpty { SpRemoteImage(url: c.logo).frame(width: 16, height: 16) }
            Text(c.name).font(SportsFonts.app(size: 12, weight: roshn ? .bold : .semibold))
                .foregroundStyle(roshn ? SpTheme.onDark : SpTheme.onDarkDim).lineLimit(1)
        }
    }

    // عالمية › مؤكّدة / إعارات مؤكّدة (من /transfer-center/global-confirmed)
    private var globalConfirmedList: some View {
        let items = globalConfirmed
            .filter { tab == .loans ? $0.kind == .loan : true }
            .filter { majorsOnly ? $0.major : true }
        return Group {
            if !loadedGlobal {
                SpLoading().padding(.top, 30)
            } else if items.isEmpty {
                SpEmptyState(icon: "globe", title: "لا نتائج",
                             subtitle: "جرّب «كل الانتقالات».")
            } else {
                VStack(spacing: 9) {
                    listCount(items.count, "انتقالًا")
                    ForEach(items.prefix(60)) { TcConfirmedRow(item: $0) }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // الإشاعات (انتقال/إعارة/تجديد بحسب التبويب)
    private var rumoursList: some View {
        let items = filteredRumours
        return Group {
            if items.isEmpty {
                SpEmptyState(icon: "sparkles", title: "لا إشاعات مطابقة",
                             subtitle: scope == .saudi
                                ? "تغطية المصادر العالمية للدوري السعودي تتحرّك مع اشتعال السوق."
                                : "جرّب تغيير الفلاتر.")
            } else {
                VStack(spacing: 11) {
                    listCount(items.count, "إشاعة — كل إشاعة بمصدرها ودرجة احتمالها")
                    ForEach(items.prefix(60)) { r in
                        TcRumourCard(rumour: r) { selectedStory = IDBox(id: r.player.id) }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    @ViewBuilder private var marketStats: some View {
        if let ov = overview {
            VStack(spacing: 16) {
                if let comparison = ov.comparison { TcComparisonCard(comparison: comparison) }
                if let balance = ov.clubBalance, !balance.isEmpty { TcClubBalanceCard(rows: balance) }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }
    }

    private var disclaimer: some View {
        Text("الصفقات المؤكّدة من سجل API-Football، والإشاعات من رصد SportMonks لمصادر عالمية (فابريزيو رومانو، الغارديان، ESPN…) وتبقى إشاعةً حتى إعلانها رسميًّا. مؤشر الموثوقية تصنيف تحريري من سبق، ولا نعرض مبلغًا لم يُعلَن.")
            .font(SportsFonts.app(size: 10.5))
            .foregroundStyle(SpTheme.onDarkFaint)
            .lineSpacing(3)
            .padding(.horizontal, 18).padding(.top, 6)
    }

    // MARK: مساعدات

    private var showRumours: Bool { tab == .rumours || tab == .extensions || (tab == .loans) }
    private var showSaudiConfirmed: Bool { scope == .saudi && tab == .confirmed }
    private var showGlobalConfirmed: Bool { scope == .global && tab == .confirmed }

    private var filteredRumours: [TcRumour] {
        var list = rumours.filter { scope == .saudi ? $0.saudi : !$0.saudi }
        switch tab {
        case .rumours: list = list.filter { $0.kind == .transfer }
        case .loans: list = list.filter { $0.kind == .loan }
        case .extensions: list = list.filter { $0.kind == .extensionDeal }
        case .confirmed: break
        }
        if case let .level(p) = probFilter { list = list.filter { $0.probability == p } }
        return list
    }

    private func sectionTitle(icon: String, _ text: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon).font(.system(size: 15)).foregroundStyle(SpTheme.onDark)
            Text(text).font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark)
        }
        .padding(.horizontal, 16)
    }

    private func listCount(_ n: Int, _ suffix: String) -> some View {
        Text("\(n) \(suffix)")
            .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: التحميل

    private func loadInitial(force: Bool = false) async {
        loading = true
        async let overviewOpt = try? APIClient.shared.fetchTransferOverview(ignoreCache: force)
        async let rumoursOpt = try? APIClient.shared.fetchTransferRumours(ignoreCache: force)
        async let saudiOpt = try? APIClient.shared.fetchLeagueTransfers(ignoreCache: force)

        let ov = await overviewOpt
        let ru = await rumoursOpt
        let sa = await saudiOpt

        if let ov { self.overview = ov }
        if let ru {
            self.rumours = ru.rumours ?? []
            self.leagues = ru.leagues ?? []
        }
        if let sa { self.saudiConfirmed = sa.transfers ?? sa.topDeals ?? [] }
        loading = false
        await loadGlobalIfNeeded(force: force)
    }

    private func loadGlobalIfNeeded(force: Bool = false) async {
        guard showGlobalConfirmed, !loadedGlobal || force else { return }
        if let res = try? await APIClient.shared.fetchTransferGlobalConfirmed(ignoreCache: force) {
            self.globalConfirmed = res.transfers ?? []
        }
        loadedGlobal = true
    }
}

// MARK: - شاشة قصة الانتقال

struct TransferStoryView: View {
    let playerId: Int

    private struct ReaderLink: Identifiable { let id = UUID(); let url: URL }

    @State private var story: TcStoryResponse?
    @State private var related: [TcRelatedArticle] = []
    @State private var loading = true
    @State private var readerLink: ReaderLink?

    private var timeline: [TcRumour] { story?.timeline ?? [] }
    private var latest: TcRumour? { timeline.last }
    private var player: TcPlayer? { story?.player }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if loading && story == nil {
                    SpLoading().padding(.top, 40)
                } else if story?.found != true || player == nil || latest == nil {
                    SpEmptyState(icon: "circle.dashed", title: "لا قصة موثّقة",
                                 subtitle: "لا توجد قصة انتقال موثّقة لهذا اللاعب حاليًا.")
                        .padding(.top, 30)
                } else {
                    profileHeader(player!)
                    currentStateCard(latest!)
                    timelineCard
                    if !related.isEmpty { relatedCard }
                    storyDisclaimer
                }
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
        }
        .background(SpAmbientBackground())
        .navigationTitle("قصة الانتقال")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $readerLink) { link in SpSafariView(url: link.url).ignoresSafeArea() }
        .task { await load() }
    }

    // بروفايل اللاعب
    private func profileHeader(_ p: TcPlayer) -> some View {
        HStack(spacing: 14) {
            SpAvatarImage(url: p.image, size: 72,
                          ring: SpTheme.cardStroke, placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
            VStack(alignment: .leading, spacing: 5) {
                Text(p.name).font(SportsFonts.app(size: 22, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(2)
                HStack(spacing: 10) {
                    if let pos = p.position { Text(pos).font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim) }
                    if let age = p.age { Text("\(age) عامًا").font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim) }
                }
                HStack(spacing: 4) {
                    Image(systemName: "circle.dashed").font(.system(size: 10, weight: .bold))
                    Text("قصة إشاعات — لم تتأكّد بعد").font(SportsFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(SpTheme.dyn(Color(red: 0.66, green: 0.20, blue: 0.55), Color(red: 0.90, green: 0.52, blue: 0.80)))
            }
            Spacer(minLength: 0)
        }
    }

    // بطاقة الحالة الراهنة
    private func currentStateCard(_ r: TcRumour) -> some View {
        VStack(spacing: 14) {
            if r.hereWeGo {
                HStack { TcHereWeGoBadge(); Spacer(minLength: 0) }
            }
            HStack(alignment: .top, spacing: 8) {
                clubColumn(r.from)
                VStack(spacing: 6) {
                    Image(systemName: "arrow.left")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(r.hereWeGo ? SpTheme.crimson : SpTheme.green)
                    if let money = TcMoney.format(r.amount, currency: r.currency) {
                        Text(money).font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    }
                    kindBadge(r.kind)
                }
                clubColumn(r.to)
            }
            Divider().background(SpTheme.outline)
            HStack(spacing: 14) {
                TcProbabilityMeter(probability: r.probability)
                TcSourceBadge(source: r.source)
                Spacer(minLength: 0)
                Text("آخر تحديث: \(TcDate.medium(r.date))").font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
            .stroke(r.hereWeGo ? SpTheme.crimson.opacity(0.45) : SpTheme.cardStroke, lineWidth: 1))
    }

    private func clubColumn(_ p: TcParty) -> some View {
        VStack(spacing: 7) {
            if let img = p.image, !img.isEmpty {
                SpRemoteImage(url: img).frame(width: 58, height: 58)
            } else {
                Circle().fill(SpTheme.chipFill).frame(width: 58, height: 58)
            }
            Text(p.name).font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark)
                .multilineTextAlignment(.center).lineLimit(2)
            if let league = p.leagueName {
                Text(league).font(SportsFonts.app(size: 9.5)).foregroundStyle(SpTheme.onDarkFaint).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func kindBadge(_ kind: TcRumourKind) -> some View {
        HStack(spacing: 3) {
            Image(systemName: kind.icon).font(.system(size: 9, weight: .bold))
            Text(kind.label).font(SportsFonts.app(size: 10, weight: .bold))
        }
        .foregroundStyle(SpTheme.onDarkDim)
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(Capsule().fill(SpTheme.chipFill))
    }

    // الخط الزمني
    private var timelineCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("تسلسل القصة").font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark)
            Text("\(timeline.count) تطوّرًا — تصاعديًّا مع درجة احتمال كل مرحلة ومصدرها")
                .font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkFaint)
                .padding(.bottom, 8)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(timeline.enumerated()), id: \.element.id) { i, r in
                    timelineNode(r, isLast: i == timeline.count - 1)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func timelineNode(_ r: TcRumour, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: 11) {
            VStack(spacing: 0) {
                Circle().fill(dotColor(r.probability))
                    .frame(width: 13, height: 13)
                    .overlay(Circle().stroke(dotColor(r.probability).opacity(0.25), lineWidth: 4))
                if !isLast {
                    Rectangle().fill(SpTheme.outline).frame(width: 2).frame(maxHeight: .infinity)
                }
            }
            .frame(width: 13)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(TcDate.medium(r.date)).font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                    Text(r.probability.label).font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(dotColor(r.probability))
                    if r.hereWeGo { TcHereWeGoBadge() }
                }
                HStack(spacing: 6) {
                    TcPartyChip(party: r.from)
                    Image(systemName: "arrow.left").font(.system(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                    TcPartyChip(party: r.to, emphasize: true)
                    Spacer(minLength: 0)
                    TcMoneyPill(amount: r.amount, currency: r.currency)
                }
                TcSourceBadge(source: r.source)
            }
            .padding(.bottom, isLast ? 0 : 16)
        }
    }

    private func dotColor(_ p: TcProbability) -> Color {
        switch p {
        case .imminent: return SpTheme.crimson
        case .high: return SpTheme.dyn(Color(red: 0.85, green: 0.45, blue: 0.10), Color(red: 0.96, green: 0.60, blue: 0.30))
        case .medium: return SpTheme.dyn(Color(red: 0.80, green: 0.62, blue: 0.10), Color(red: 0.94, green: 0.78, blue: 0.32))
        case .low: return SpTheme.onDarkFaint
        }
    }

    // أخبار ذات صلة
    private var relatedCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Image(systemName: "newspaper.fill").font(.system(size: 14)).foregroundStyle(SpTheme.onDark)
                Text("أخبار ذات صلة").font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark)
            }
            ForEach(related) { a in
                Button { openArticle(a) } label: {
                    HStack(spacing: 11) {
                        if let img = a.imageUrl, !img.isEmpty {
                            SpRemoteImage(url: img, contentMode: .fill)
                                .frame(width: 62, height: 62)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(a.title).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                                .lineLimit(2).multilineTextAlignment(.leading)
                            if let d = a.publishedAt { Text(TcDate.medium(d)).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint) }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.chipFill.opacity(0.5)))
                    .contentShape(Rectangle())
                }
                .buttonStyle(SpPressStyle())
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private var storyDisclaimer: some View {
        Text("درجة الاحتمال والمبلغ المتداول من المصدر المذكور في كل مرحلة (رصد SportMonks)، ومؤشر الموثوقية تصنيف تحريري من سبق. تبقى القصة إشاعةً حتى إعلانها رسميًّا من الناديين.")
            .font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint).lineSpacing(3)
            .padding(.top, 4)
    }

    private func openArticle(_ a: TcRelatedArticle) {
        guard let slug = a.slug, !slug.isEmpty,
              let url = URL(string: "\(URLConstants.webOrigin)/article/\(slug)") else { return }
        readerLink = ReaderLink(url: url)
    }

    private func load() async {
        loading = true
        let res = try? await APIClient.shared.fetchTransferStory(playerId: playerId)
        self.story = res
        loading = false
        if let name = res?.player?.name, name.count >= 2,
           let rel = try? await APIClient.shared.fetchTransferRelated(query: name) {
            self.related = rel.results ?? []
        }
    }
}
