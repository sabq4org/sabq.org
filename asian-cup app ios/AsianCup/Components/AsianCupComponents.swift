import SwiftUI

// مكوّنات UI أساسية لكأس آسيا — مُعاد تصميمها من WorldCupComponents لكن بألوان
// AcTheme. كلها تُستعمل عبر الشاشات.

// MARK: - أجواء الخلفية (توهّجات زمردية/ذهبية + نقشة هندسية)

// نقشة هندسية مائلة خفيفة مستوحاة من زخرفة اللوقو — تُرسم بـ Canvas لأداء عالٍ.
struct AcLatticePattern: View {
    var spacing: CGFloat = 26
    var body: some View {
        Canvas { ctx, size in
            var path = Path()
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x + size.height, y: size.height))
                x += spacing
            }
            ctx.stroke(path, with: .color(.white), lineWidth: 1)
        }
        .allowsHitTesting(false)
    }
}

// خلفية الأجواء الكاملة — تدرّج عميق + ثلاث هالات متوهّجة (واحدة تنجرف ببطء) + نقشة.
// تُوضع خلف التمرير كله لإحساس «البطولة الرسمي الفاخر».
struct AcAmbientBackground: View {
    var animated: Bool = true
    @State private var drift = false

    var body: some View {
        ZStack {
            AcTheme.screenGradient

            Circle()
                .fill(AcTheme.emeraldSoft.opacity(0.22))
                .frame(width: 480, height: 480)
                .blur(radius: 130)
                .offset(x: drift ? 50 : -30, y: -300)

            Circle()
                .fill(AcTheme.gold.opacity(0.10))
                .frame(width: 360, height: 360)
                .blur(radius: 120)
                .offset(x: 160, y: 360)

            Circle()
                .fill(AcTheme.teal.opacity(0.12))
                .frame(width: 340, height: 340)
                .blur(radius: 120)
                .offset(x: -160, y: 440)

            AcLatticePattern().opacity(0.05)
        }
        .ignoresSafeArea()
        .onAppear {
            guard animated else { return }
            withAnimation(.easeInOut(duration: 10).repeatForever(autoreverses: true)) {
                drift = true
            }
        }
    }
}

// MARK: - شعار البطولة (هالة نابضة + دخول زنبركي)
struct AcEmblem: View {
    var height: CGFloat = 134
    @State private var pulse = false
    @State private var entered = false

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [AcTheme.emeraldSoft.opacity(0.45), .clear],
                        center: .center, startRadius: 4, endRadius: height * 0.7
                    )
                )
                .frame(width: height * 1.25, height: height * 1.25)
                .blur(radius: 30)
                .scaleEffect(pulse ? 1.12 : 0.9)
                .opacity(pulse ? 0.9 : 0.5)

            Image("Emblem")
                .resizable()
                .scaledToFit()
                .frame(height: height)
                .shadow(color: .black.opacity(0.45), radius: 18, y: 10)
                .scaleEffect(entered ? 1 : 0.82)
                .rotationEffect(.degrees(entered ? 0 : -4))
        }
        .onAppear {
            withAnimation(.spring(response: 0.75, dampingFraction: 0.6)) { entered = true }
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

// شارة هيرو صغيرة (أيقونة + نص داخل كبسولة شفّافة بحدّ ملوّن).
struct AcHeroBadge: View {
    let icon: String
    let text: String
    var tint: Color = AcTheme.gold

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold))
            Text(text).font(AsianCupFonts.app(size: 12, weight: .semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Capsule().fill(tint.opacity(0.12)))
        .overlay(Capsule().stroke(tint.opacity(0.30), lineWidth: 1))
    }
}

// عنوان «كأس آسيا 2027» بتدرّج ذهبي على «2027» (مطابق لهيرو الويب).
struct AcTournamentTitle: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("كأس آسيا")
                .foregroundStyle(AcTheme.onDark)
            Text("2027")
                .foregroundStyle(AcTheme.goldTitleGradient)
        }
        .font(AsianCupFonts.app(size: 32, weight: .bold))
    }
}

// MARK: - حركة دخول الأقسام (ظهور تدريجي + انزياح خفيف)
private struct AcRevealModifier: ViewModifier {
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
    func acReveal(delay: Double = 0) -> some View { modifier(AcRevealModifier(delay: delay)) }
}

struct AcRemoteImage: View {
    let url: String
    var contentMode: ContentMode = .fit

    var body: some View {
        AsyncImage(url: URL(string: url)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: contentMode)
            case .failure:
                Color.clear
            default:
                Color.clear
            }
        }
    }
}

struct AcTeamLogo: View {
    let logo: String
    var size: CGFloat = 40

    var body: some View {
        AcRemoteImage(url: logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(AcTheme.outline, lineWidth: 1.5))
    }
}

struct AcStatusPill: View {
    let fixture: AcFixture

    var body: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(elapsedText)
            }
            .font(AsianCupFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(AcTheme.crimson))
        } else if fixture.status.finished {
            Text(fixture.status.label)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.chipFill))
        } else {
            Text(AcFormat.kickoffTime(fixture.date))
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.gold)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.gold.opacity(0.16)))
        }
    }

    private var elapsedText: String {
        guard let e = fixture.status.elapsed else { return fixture.status.label }
        return "\(e)'"
    }
}

struct AcSectionHeader: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var count: Int? = nil
    var tint: Color = AcTheme.gold

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(AsianCupFonts.app(size: 19, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.headline(size: 20))
                    .foregroundStyle(AcTheme.onDark)
                if let subtitle {
                    Text(subtitle)
                        .font(AsianCupFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
            if let count {
                Text("\(count)")
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(tint.opacity(0.14)))
            }
        }
    }
}

struct AcEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(AsianCupFonts.app(size: 30))
                .foregroundStyle(AcTheme.gold)
            Text(title)
                .font(AsianCupFonts.subhead(size: 15))
                .foregroundStyle(AcTheme.onDark)
            Text(subtitle)
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

struct AcLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(AcTheme.gold); Spacer() }
            .padding(.vertical, 32)
    }
}

// بطاقة مباراة واحدة — تُستعمل في الجدول واليوم. الضغط يفتح ورقة التفاصيل.
struct AcMatchCard: View {
    let fixture: AcFixture
    var highlightsSaudi: Bool = false
    @State private var showDetail = false
    @State private var pressed = false

    private var homeSaudi: Bool { fixture.home.id == AsianCupConstants.saudiTeamId }
    private var awaySaudi: Bool { fixture.away.id == AsianCupConstants.saudiTeamId }
    private var started: Bool { fixture.status.live || fixture.status.finished }

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                Text(fixture.round)
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                Spacer(minLength: 6)
                AcStatusPill(fixture: fixture)
            }

            HStack(spacing: 8) {
                teamSide(fixture.home, highlight: homeSaudi, leading: true)
                scoreBox
                teamSide(fixture.away, highlight: awaySaudi, leading: false)
            }

            if !fixture.venue.name.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 10))
                    Text(venueText)
                        .font(AsianCupFonts.app(size: 11))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.left")
                        .font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(highlightsSaudi ? AcTheme.gold.opacity(0.06) : AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(highlightsSaudi ? AcTheme.gold.opacity(0.5) : AcTheme.outline, lineWidth: highlightsSaudi ? 1.5 : 1)
                )
        )
        .scaleEffect(pressed ? 0.97 : 1)
        .contentShape(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous))
        .onTapGesture {
            withAnimation(.easeOut(duration: 0.12)) { pressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                withAnimation(.easeOut(duration: 0.12)) { pressed = false }
                showDetail = true
            }
        }
        .sheet(isPresented: $showDetail) {
            AcMatchDetailSheet(fixture: fixture)
        }
    }

    private var venueText: String {
        fixture.venue.city.isEmpty ? fixture.venue.name : "\(fixture.venue.name) — \(fixture.venue.city)"
    }

    // صفّ منتخب أفقي (شعار + اسم) — مطابق لـ TeamRow في الويب، مُرايا للجهتين.
    private func teamSide(_ team: AcTeam, highlight: Bool, leading: Bool) -> some View {
        HStack(spacing: 8) {
            if leading {
                AcTeamLogo(logo: team.logo, size: 30)
                teamName(team, highlight: highlight, align: .leading)
            } else {
                teamName(team, highlight: highlight, align: .trailing)
                AcTeamLogo(logo: team.logo, size: 30)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private func teamName(_ team: AcTeam, highlight: Bool, align: TextAlignment) -> some View {
        Text(team.name)
            .font(AsianCupFonts.app(size: 13, weight: highlight ? .bold : .semibold))
            .foregroundStyle(highlight ? AcTheme.gold : AcTheme.onDark)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .multilineTextAlignment(align)
    }

    private var scoreBox: some View {
        Group {
            if started {
                Text("\(fixture.goals.home ?? 0) - \(fixture.goals.away ?? 0)")
                    .font(AsianCupFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text("VS")
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .frame(minWidth: 52)
    }
}

// MARK: - ورقة تفاصيل المباراة (تُفتح بالضغط على أي بطاقة مباراة)
struct AcMatchDetailSheet: View {
    let fixture: AcFixture
    @Environment(\.dismiss) private var dismiss

    private var started: Bool { fixture.status.live || fixture.status.finished }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                scoreboardHero
                infoCard
            }
            .padding(16)
            .padding(.top, 4)
        }
        .background(AcAmbientBackground())
        .presentationDragIndicator(.visible)
        .presentationDetents([.large])
        .asianCupRTL()
    }

    // لوحة نتيجة متدرّجة فخمة (مستوحاة من سبوتلايت الأخضر في الويب).
    private var scoreboardHero: some View {
        VStack(spacing: 16) {
            HStack {
                Text(fixture.round)
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(Capsule().fill(.white.opacity(0.15)))
                Spacer()
                AcStatusPill(fixture: fixture)
            }

            HStack(alignment: .top, spacing: 8) {
                bigTeam(fixture.home, saudi: fixture.home.id == AsianCupConstants.saudiTeamId)
                centerScore
                bigTeam(fixture.away, saudi: fixture.away.id == AsianCupConstants.saudiTeamId)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [AcTheme.emerald, AcTheme.emeraldDeep, Color(red: 0.02, green: 0.14, blue: 0.10)],
                        startPoint: .topTrailing, endPoint: .bottomLeading
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(AcTheme.gold.opacity(fixture.involvesSaudi ? 0.4 : 0.18), lineWidth: 1)
                )
        )
        .shadow(color: .black.opacity(0.3), radius: 16, y: 8)
    }

    private var centerScore: some View {
        VStack(spacing: 6) {
            if started {
                Text("\(fixture.goals.home ?? 0) - \(fixture.goals.away ?? 0)")
                    .font(AsianCupFonts.app(size: 40, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(AcFormat.kickoffTime(fixture.date))
                    .font(AsianCupFonts.app(size: 30, weight: .bold))
                    .foregroundStyle(AcTheme.gold)
                Text("بتوقيت الرياض")
                    .font(AsianCupFonts.app(size: 10))
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .frame(minWidth: 96)
    }

    private func bigTeam(_ team: AcTeam, saudi: Bool) -> some View {
        VStack(spacing: 10) {
            AcTeamLogo(logo: team.logo, size: 68)
                .overlay(alignment: .topTrailing) {
                    if saudi {
                        Image(systemName: "star.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(AcTheme.gold)
                            .padding(4)
                            .background(Circle().fill(AcTheme.emeraldDeep))
                            .offset(x: 4, y: -4)
                    }
                }
            Text(team.name)
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(height: 38)
        }
        .frame(maxWidth: .infinity)
    }

    private var infoCard: some View {
        VStack(spacing: 0) {
            infoRow(icon: "calendar", label: "التاريخ", value: AcFormat.kickoffDay(fixture.date))
            divider
            infoRow(icon: "clock", label: "التوقيت", value: AcFormat.kickoffTime(fixture.date) + " (الرياض)")
            if !fixture.venue.name.isEmpty {
                divider
                infoRow(icon: "sportscourt", label: "الملعب", value: fixture.venue.name)
            }
            if !fixture.venue.city.isEmpty {
                divider
                infoRow(icon: "mappin.and.ellipse", label: "المدينة", value: fixture.venue.city)
            }
            divider
            infoRow(icon: "flag.checkered", label: "الحالة", value: fixture.status.label)
        }
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(AcTheme.outline, lineWidth: 1)
                )
        )
    }

    private func infoRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(AcTheme.gold)
                .frame(width: 22)
            Text(label)
                .font(AsianCupFonts.app(size: 13))
                .foregroundStyle(AcTheme.onDarkDim)
            Spacer()
            Text(value)
                .font(AsianCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var divider: some View {
        Rectangle().fill(AcTheme.outline).frame(height: 1).padding(.horizontal, 14)
    }
}
