import SwiftUI

// مكوّنات «خليجي 27» v3 — «ليالي الخليج»: ترويسات غامرة بزخرفة هندسية، بطاقات
// مرفوعة بظلّ ناعم، هياكل تحميل shimmer بدل المؤشّرات الدوّارة، وصفّ نتيجة موحّد
// RTL-آمن (الأرقام LTR: «ضيف - مضيف» فيقع رقم المضيف بجوار شعاره يمينًا).

// MARK: - نقطة المباشر النابضة

struct GcLiveDot: View {
    var color: Color = .white
    var size: CGFloat = 6
    @State private var pulse = false
    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .scaleEffect(pulse ? 1.0 : 0.5)
            .opacity(pulse ? 1.0 : 0.5)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true)) { pulse = true }
            }
    }
}

// MARK: - شعار البطولة

struct GcEmblem: View {
    var height: CGFloat = 92
    var glow: Bool = true
    @State private var entered = false

    var body: some View {
        Image("Emblem")
            .resizable()
            .scaledToFit()
            .frame(height: height)
            .shadow(color: glow ? GcTheme.goldLite.opacity(0.35) : .clear, radius: 18, y: 2)
            .scaleEffect(entered ? 1 : 0.92)
            .opacity(entered ? 1 : 0)
            .onAppear {
                withAnimation(.easeOut(duration: 0.45)) { entered = true }
            }
    }
}

// MARK: - زخرفة لوحة الليل (أقواس متّحدة المركز + توهّج ذهبي خفيف)

struct GcHeroDecor: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack {
                // توهّج ورقي أعلى الزاوية (توقيع المونديال)
                RadialGradient(
                    colors: [GcTheme.leaf.opacity(0.22), .clear],
                    center: .topTrailing, startRadius: 0, endRadius: w * 0.55
                )
                // أقواس متّحدة المركز حول الزاوية العليا
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .stroke(Color.white.opacity(0.05 - Double(i) * 0.008), lineWidth: 1.2)
                        .frame(width: w * (0.5 + CGFloat(i) * 0.28))
                        .position(x: w * 0.96, y: 0)
                }
                // نجمة/معيّن خليجي صغير
                Image(systemName: "diamond.fill")
                    .font(.system(size: 8))
                    .foregroundStyle(GcTheme.goldLite.opacity(0.30))
                    .position(x: w * 0.14, y: 26)
                Image(systemName: "diamond.fill")
                    .font(.system(size: 5))
                    .foregroundStyle(Color.white.opacity(0.18))
                    .position(x: w * 0.24, y: 54)
            }
        }
        .allowsHitTesting(false)
    }
}

/// لوحة غامرة زمردية ليلية — حاوية الترويسات البطلة الموحّدة عبر التطبيق.
struct GcHeroPanel<Content: View>: View {
    var radius: CGFloat = GcTheme.heroRadius
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(GcTheme.heroGradient)
                    .overlay(GcHeroDecor().clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous)))
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
            .shadow(color: GcTheme.heroShadow, radius: 18, y: 8)
    }
}

struct GcHeroBadge: View {
    let icon: String
    let text: String
    var tint: Color = GcTheme.goldLite
    var onDark: Bool = true

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 10, weight: .bold))
            Text(text).font(GulfCupFonts.app(size: 11, weight: .bold))
        }
        .foregroundStyle(onDark ? tint : GcTheme.ink)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Capsule().fill(tint.opacity(onDark ? 0.16 : 0.13)))
        .overlay(Capsule().stroke(tint.opacity(onDark ? 0.25 : 0), lineWidth: 1))
    }
}

// MARK: - صورة بعيدة بكاش ثابت عبر إعادة الرسم

struct GcRemoteImage: View {
    let url: String
    var contentMode: ContentMode = .fit
    @State private var image: UIImage?
    private static let cache = NSCache<NSString, UIImage>()

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
            } else {
                Color.clear
            }
        }
        .task(id: url) {
            guard !url.isEmpty, let u = URL(string: url) else { image = nil; return }
            if let cached = Self.cache.object(forKey: url as NSString) {
                image = cached
                return
            }
            if let (data, _) = try? await URLSession.shared.data(from: u),
               let img = UIImage(data: data) {
                Self.cache.setObject(img, forKey: url as NSString)
                image = img
            }
        }
    }
}

struct GcTeamLogo: View {
    let logo: String
    var size: CGFloat = GcTheme.logoMd
    var body: some View {
        Group {
            if logo.isEmpty {
                Image(systemName: "shield.lefthalf.filled")
                    .font(.system(size: size * 0.45))
                    .foregroundStyle(GcTheme.inkFaint)
            } else {
                GcRemoteImage(url: logo).padding(size * 0.13)
            }
        }
        .frame(width: size, height: size)
        .background(Circle().fill(.white))
        .overlay(Circle().stroke(GcTheme.outline, lineWidth: 1))
    }
}

/// صورة لاعب دائرية (هدّافون/تشكيلات) — احتياط برمز شخص.
struct GcPlayerPhoto: View {
    let url: String?
    var size: CGFloat = 40
    var body: some View {
        Group {
            if let url, !url.isEmpty {
                GcRemoteImage(url: url, contentMode: .fill)
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.44))
                    .foregroundStyle(GcTheme.inkFaint)
            }
        }
        .frame(width: size, height: size)
        .background(Circle().fill(GcTheme.chipFill))
        .clipShape(Circle())
        .overlay(Circle().stroke(GcTheme.outline, lineWidth: 1))
    }
}

// MARK: - حالة المباراة

struct GcStatusPill: View {
    let fixture: GcFixture
    var body: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                GcLiveDot()
                Text(fixture.status.elapsed.map { "\($0)'" } ?? L("state.live"))
            }
            .font(GulfCupFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(GcTheme.liveRed))
        } else if fixture.status.finished {
            Text(L("state.finished"))
                .font(GulfCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(GcTheme.inkDim)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(GcTheme.chipFill))
        } else {
            Text(GcFormat.kickoffTime(fixture.date))
                .font(GulfCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(GcTheme.emerald)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(GcTheme.emerald.opacity(0.12)))
        }
    }
}

// MARK: - رقاقة عامة

struct GcChip: View {
    let text: String
    var icon: String? = nil
    var tint: Color = GcTheme.emerald
    var filled: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon).font(.system(size: 10, weight: .bold)) }
            Text(text).font(GulfCupFonts.app(size: 11, weight: .bold))
        }
        .foregroundStyle(filled ? .white : tint)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Capsule().fill(filled ? tint : tint.opacity(0.12)))
    }
}

// MARK: - عناوين الأقسام

struct GcSectionHeader: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var count: Int? = nil
    var tint: Color = GcTheme.emerald
    var action: (() -> Void)? = nil
    var actionLabel: String = "الكل"

    var body: some View {
        HStack(alignment: .center, spacing: 11) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 34, height: 34)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(tint.opacity(0.12)))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(GulfCupFonts.headline(size: 17)).foregroundStyle(GcTheme.ink)
                if let subtitle {
                    Text(subtitle).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkDim)
                }
            }
            Spacer(minLength: 0)
            if let count {
                Text("\(count)")
                    .font(GulfCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(tint)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(tint.opacity(0.12)))
            }
            if let action {
                Button(action: action) {
                    HStack(spacing: 2) {
                        Text(actionLabel).font(GulfCupFonts.app(size: 12, weight: .bold))
                        Image(systemName: "chevron.left").font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(tint)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct GcEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(spacing: 9) {
            Image(systemName: icon)
                .font(.system(size: 30))
                .foregroundStyle(GcTheme.emerald.opacity(0.75))
            Text(title).font(GulfCupFonts.subhead(size: 14)).foregroundStyle(GcTheme.ink)
            Text(subtitle).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.inkDim).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 30)
    }
}

// MARK: - هياكل تحميل shimmer

private struct GcShimmer: ViewModifier {
    @State private var phase: CGFloat = -1
    func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geo in
                    LinearGradient(
                        colors: [.clear, Color.white.opacity(0.45), .clear],
                        startPoint: .leading, endPoint: .trailing
                    )
                    .frame(width: geo.size.width * 0.6)
                    .offset(x: phase * geo.size.width * 1.6)
                }
                .allowsHitTesting(false)
            )
            .clipped()
            .onAppear {
                withAnimation(.linear(duration: 1.25).repeatForever(autoreverses: false)) { phase = 1 }
            }
    }
}

struct GcSkeletonBlock: View {
    var height: CGFloat = 72
    var radius: CGFloat = GcTheme.tileRadius
    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(GcTheme.chipFill.opacity(0.7))
            .frame(height: height)
            .modifier(GcShimmer())
    }
}

/// لوحة تحميل — صفوف هيكلية تتنفّس بدل مؤشّر دوّار.
struct GcLoadingPanel: View {
    let title: String
    var rows: Int = 3
    var body: some View {
        VStack(spacing: 10) {
            ForEach(0..<rows, id: \.self) { _ in GcSkeletonBlock(height: 64) }
            Text(title).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkFaint)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - إطار الشاشة

struct GcAmbientBackground: View {
    var animated: Bool = true
    var body: some View {
        GcTheme.screenGradient.ignoresSafeArea()
    }
}

struct GcScreenScaffold<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ZStack {
            GcAmbientBackground()
            ScrollView {
                content.padding(.horizontal, 16).padding(.bottom, 28)
            }
        }
    }
}

// MARK: - صفّ نتيجة موحّد (المرجع الوحيد لعرض مباراة)
//
// الترتيب (ضيف‑مضيف) صحيح بصريًّا في RTL مع تثبيت الاتجاه LTR للأرقام فقط —
// رقم المضيف يقع دائمًا بجوار شعار المضيف (يمين الشاشة). لا تغيّر هذا النمط.

struct GcScoreRow: View {
    let fixture: GcFixture
    private let logoSize: CGFloat = 34
    private let centerWidth: CGFloat = 56

    private var started: Bool { fixture.status.live || fixture.status.finished }

    var body: some View {
        HStack(spacing: 6) {
            teamSide(fixture.home, home: true)
            centerColumn
            teamSide(fixture.away, home: false)
        }
    }

    private func teamSide(_ team: GcTeam, home: Bool) -> some View {
        let logo = GcTeamLogo(logo: team.logo, size: logoSize)
        let name = Text(team.name)
            .font(GulfCupFonts.app(size: 13, weight: .semibold))
            .foregroundStyle(GcTheme.ink)
            .lineLimit(1).minimumScaleFactor(0.76)
        return HStack(spacing: 7) {
            if home { Spacer(minLength: 4); name; logo }
            else { logo; name; Spacer(minLength: 4) }
        }
        .frame(maxWidth: .infinity)
    }

    private var centerColumn: some View {
        VStack(spacing: 2) {
            if started {
                Text("\(fixture.goals.away ?? 0)-\(fixture.goals.home ?? 0)")
                    .font(GulfCupFonts.app(size: 17, weight: .bold))
                    .foregroundStyle(fixture.status.live ? GcTheme.liveRed : GcTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(GcFormat.kickoffTime(fixture.date))
                    .font(GulfCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
            statusSub
        }
        .frame(width: centerWidth)
    }

    @ViewBuilder private var statusSub: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(GcTheme.liveRed).frame(width: 5, height: 5)
                Text(fixture.status.elapsed.map { "\($0)'" } ?? L("state.live"))
            }
            .font(GulfCupFonts.app(size: 10, weight: .bold))
            .foregroundStyle(GcTheme.liveRed)
        } else if fixture.status.finished {
            Text(L("state.finished")).font(GulfCupFonts.app(size: 10, weight: .semibold)).foregroundStyle(GcTheme.inkDim)
        } else {
            Text(GcFormat.kickoffDayShort(fixture.date)).font(GulfCupFonts.app(size: 10, weight: .semibold)).foregroundStyle(GcTheme.inkFaint)
        }
    }
}

// MARK: - بطاقة مباراة → مركز المباراة

struct GcMatchCard: View {
    let fixture: GcFixture
    var showCard: Bool = true

    var body: some View {
        NavigationLink {
            GcMatchCenterScreen(fixture: fixture)
        } label: {
            VStack(spacing: 9) {
                HStack {
                    Text(fixture.round)
                        .font(GulfCupFonts.app(size: 10, weight: .semibold))
                        .foregroundStyle(GcTheme.inkFaint).lineLimit(1)
                    Spacer()
                    if !fixture.venue.name.isEmpty {
                        HStack(spacing: 3) {
                            Image(systemName: "mappin.and.ellipse").font(.system(size: 9))
                            Text(fixture.venue.name).lineLimit(1)
                        }
                        .font(GulfCupFonts.app(size: 10))
                        .foregroundStyle(GcTheme.inkFaint)
                    }
                }
                GcScoreRow(fixture: fixture)
            }
            .padding(13)
            .modifier(GcMatchCardChrome(show: showCard))
            .contentShape(Rectangle())
        }
        .buttonStyle(GcPressStyle())
    }
}

private struct GcMatchCardChrome: ViewModifier {
    let show: Bool
    func body(content: Content) -> some View {
        if show { content.gcCard() } else { content }
    }
}

/// قائمة مباريات مجمّعة في بطاقة واحدة بفواصل شعرية.
struct GcMatchListCard: View {
    let fixtures: [GcFixture]
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(fixtures.enumerated()), id: \.element.id) { idx, fx in
                if idx > 0 {
                    Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.horizontal, 13)
                }
                GcMatchCard(fixture: fx, showCard: false)
                    .padding(.horizontal, 13).padding(.vertical, 4)
            }
        }
        .padding(.vertical, 7)
        .gcCard()
    }
}

// MARK: - جدول الترتيب

struct GcGroupCard: View {
    let group: GcGroup
    var highlightTeamId: Int? = GulfCupConstants.saudiTeamId

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(group.name).font(GulfCupFonts.headline(size: 14.5)).foregroundStyle(GcTheme.ink)
                Spacer()
                HStack(spacing: 4) {
                    Rectangle().fill(GcTheme.qualifyBar).frame(width: 8, height: 8).clipShape(Capsule())
                    Text(L("standings.qualifyLine")).font(GulfCupFonts.app(size: 10, weight: .semibold)).foregroundStyle(GcTheme.inkDim)
                }
            }
            .padding(.horizontal, 13).padding(.vertical, 11)

            columnHeader

            VStack(spacing: 0) {
                ForEach(Array(group.rows.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 16) }
                    NavigationLink {
                        GcTeamProfileScreen(teamId: row.team.id, fallback: row.team)
                    } label: {
                        standingRow(row)
                    }
                    .buttonStyle(.plain)
                    .disabled(row.team.id <= 0)
                }
            }
        }
        .gcCard()
    }

    private var columnHeader: some View {
        HStack(spacing: 0) {
            Text(L("standings.col.team")).font(GulfCupFonts.app(size: 10, weight: .bold)).foregroundStyle(GcTheme.inkFaint)
                .frame(maxWidth: .infinity, alignment: .leading)
            col("ل"); col("ف"); col("ت"); col("خ"); col("+/-", width: 32)
            Text(L("standings.col.points")).font(GulfCupFonts.app(size: 10, weight: .bold)).foregroundStyle(GcTheme.inkFaint).frame(width: 30)
        }
        .padding(.horizontal, 13).padding(.bottom, 6)
    }

    private func col(_ s: String, width: CGFloat = 22) -> some View {
        Text(s).font(GulfCupFonts.app(size: 10, weight: .bold)).foregroundStyle(GcTheme.inkFaint).frame(width: width)
    }

    private func standingRow(_ row: GcStandingRow) -> some View {
        let qualifies = row.rank <= 2
        let isLive = row.live == true
        let delta = row.liveDelta ?? 0
        return HStack(spacing: 0) {
            HStack(spacing: 8) {
                Rectangle()
                    .fill(qualifies ? GcTheme.qualifyBar : Color.clear)
                    .frame(width: 3, height: 26).clipShape(Capsule())
                HStack(spacing: 2) {
                    Text("\(row.rank)")
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(qualifies ? GcTheme.emerald : GcTheme.inkFaint)
                        .frame(width: 14)
                    if isLive {
                        Image(systemName: delta > 0 ? "arrow.up" : delta < 0 ? "arrow.down" : "minus")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(delta > 0 ? GcTheme.emerald : delta < 0 ? GcTheme.crimson : GcTheme.inkFaint)
                    }
                }
                GcTeamLogo(logo: row.team.logo, size: 24)
                Text(row.team.name)
                    .font(GulfCupFonts.app(size: 12.5, weight: qualifies ? .bold : .regular))
                    .foregroundStyle(GcTheme.ink).lineLimit(1)
                if isLive {
                    Text(L("state.live"))
                        .font(GulfCupFonts.app(size: 8, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(Capsule().fill(GcTheme.liveRed))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            statCol("\(row.played)")
            statCol("\(row.win)")
            statCol("\(row.draw)")
            statCol("\(row.lose)")
            Text(row.goalsDiff >= 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)")
                .font(GulfCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(row.goalsDiff > 0 ? GcTheme.emerald : row.goalsDiff < 0 ? GcTheme.crimson : GcTheme.inkDim)
                .frame(width: 32)
            Text("\(row.points)")
                .font(GulfCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(GcTheme.ink)
                .frame(width: 30)
        }
        .padding(.horizontal, 13).padding(.vertical, 9)
        .background(
            isLive ? GcTheme.liveRed.opacity(0.05)
                : row.team.id == highlightTeamId ? GcTheme.gold.opacity(0.07) : Color.clear
        )
        .contentShape(Rectangle())
    }

    private func statCol(_ s: String) -> some View {
        Text(s).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkDim).frame(width: 22).monospacedDigit()
    }
}

// MARK: - شريط إحصائي

struct GcStatStrip: View {
    let items: [(value: String, label: String, color: Color)]
    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                VStack(spacing: 3) {
                    Text(item.value).font(GulfCupFonts.app(size: 19, weight: .bold)).foregroundStyle(item.color).monospacedDigit()
                    Text(item.label).font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkDim)
                }
                .frame(maxWidth: .infinity)
                if idx != items.count - 1 {
                    Rectangle().fill(GcTheme.outline).frame(width: 1, height: 30)
                }
            }
        }
        .padding(.vertical, 12)
        .gcCard()
    }
}

// MARK: - نقاط الفورمة (آخر النتائج)

struct GcFormDots: View {
    /// أحدث نتيجة أولًا: "W" | "D" | "L"
    let form: [String]
    var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(form.enumerated()), id: \.offset) { _, r in
                Text(r == "W" ? "ف" : r == "D" ? "ت" : "خ")
                    .font(GulfCupFonts.app(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 20, height: 20)
                    .background(Circle().fill(r == "W" ? GcTheme.formWin : r == "D" ? GcTheme.formDraw : GcTheme.formLose))
            }
        }
    }
}

// MARK: - شريط مزدوج (إحصاءات مضيف/ضيف)

struct GcDuoBar: View {
    let label: String
    let home: String
    let away: String

    private func numeric(_ s: String) -> Double {
        Double(s.replacingOccurrences(of: "%", with: "")) ?? 0
    }

    var body: some View {
        let h = numeric(home)
        let a = numeric(away)
        let total = max(h + a, 0.001)
        VStack(spacing: 5) {
            HStack {
                Text(home).font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(h >= a ? GcTheme.emerald : GcTheme.ink).monospacedDigit()
                Spacer()
                Text(label).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkDim)
                Spacer()
                Text(away).font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(a > h ? GcTheme.emerald : GcTheme.ink).monospacedDigit()
            }
            // RTL: الطرف الأول (المضيف) يبدأ من اليمين تلقائيًّا
            GeometryReader { geo in
                HStack(spacing: 3) {
                    Capsule().fill(GcTheme.emerald)
                        .frame(width: max(geo.size.width * h / total - 1.5, 2))
                    Capsule().fill(GcTheme.teal.opacity(0.55))
                        .frame(width: max(geo.size.width * a / total - 1.5, 2))
                }
            }
            .frame(height: 5)
        }
    }
}

// MARK: - بطاقة خطأ/إعادة محاولة

struct GcErrorCard: View {
    let message: String
    let retry: () async -> Void
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark").font(.system(size: 22)).foregroundStyle(GcTheme.crimson)
            Text(L("refresh.error.title")).font(GulfCupFonts.app(size: 14, weight: .bold)).foregroundStyle(GcTheme.ink)
            Text(message).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.inkDim).multilineTextAlignment(.center)
            Button(L("refresh.retry")) { Task { await retry() } }
                .font(GulfCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 22).padding(.vertical, 9)
                .background(Capsule().fill(GcTheme.emerald))
                .buttonStyle(GcPressStyle())
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .gcCard()
    }
}

struct GcFooterSignature: View {
    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "trophy.fill").font(.system(size: 10)).foregroundStyle(GcTheme.gold)
                Text("\(GulfCupConstants.tournamentName) · \(L("app.host"))")
                    .font(GulfCupFonts.app(size: 11, weight: .semibold))
            }
            Text(L("brand.by"))
                .font(GulfCupFonts.app(size: 10))
        }
        .foregroundStyle(GcTheme.inkFaint)
        .frame(maxWidth: .infinity)
        .padding(.top, 10)
    }
}

// MARK: - ظهور متدرّج (نعومة VARA: تلاشٍ + صعود 18pt بـ easeOut 0.55s)

private struct GcRevealModifier: ViewModifier {
    var delay: Double
    @State private var shown = false
    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 18)
            .onAppear {
                withAnimation(.easeOut(duration: 0.55).delay(delay)) { shown = true }
            }
    }
}

extension View {
    /// ظهور القسم بتلاشٍ وصعود خفيف — مرّر تأخيرًا متدرّجًا للأقسام العلوية فقط.
    func gcReveal(delay: Double = 0) -> some View { modifier(GcRevealModifier(delay: delay)) }
}

// MARK: - إخفاء شريط التبويب مع التمرير (iOS 18+ — يبقى ظاهرًا فيما دونه)

@Observable
final class GcTabBarVisibility {
    static let shared = GcTabBarVisibility()
    var hidden = false
}

private struct GcAutoHideTabBar: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentOffset.y
            } action: { oldY, newY in
                let delta = newY - oldY
                if newY < 36 { set(false) }
                else if delta > 6 { set(true) }
                else if delta < -6 { set(false) }
            }
        } else {
            content
        }
    }

    private func set(_ hidden: Bool) {
        guard GcTabBarVisibility.shared.hidden != hidden else { return }
        withAnimation(.easeInOut(duration: 0.25)) { GcTabBarVisibility.shared.hidden = hidden }
    }
}

extension View {
    func gcAutoHideTabBar() -> some View { modifier(GcAutoHideTabBar()) }
}
