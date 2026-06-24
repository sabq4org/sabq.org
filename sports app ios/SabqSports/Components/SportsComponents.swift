import SwiftUI

// مكوّنات UI أساسية لتطبيق سبق الرياضي — مبنية على نمط WorldCupComponents/
// AsianCupComponents لكن بألوان SpTheme. تُستعمل عبر الشاشات.

// MARK: - أجواء الخلفية (توهّجات خضراء/ذهبية + نقشة هندسية خفيفة)

struct SpLatticePattern: View {
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

struct SpAmbientBackground: View {
    var animated: Bool = true
    @State private var drift = false

    var body: some View {
        ZStack {
            SpTheme.screenGradient

            Circle()
                .fill(SpTheme.greenSoft.opacity(0.22))
                .frame(width: 480, height: 480)
                .blur(radius: 130)
                .offset(x: drift ? 50 : -30, y: -300)

            Circle()
                .fill(SpTheme.gold.opacity(0.10))
                .frame(width: 360, height: 360)
                .blur(radius: 120)
                .offset(x: 160, y: 360)

            Circle()
                .fill(SpTheme.teal.opacity(0.12))
                .frame(width: 340, height: 340)
                .blur(radius: 120)
                .offset(x: -160, y: 440)

            SpLatticePattern().opacity(0.05)
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

// MARK: - حركة دخول الأقسام (ظهور تدريجي + انزياح خفيف)

private struct SpRevealModifier: ViewModifier {
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
    func spReveal(delay: Double = 0) -> some View { modifier(SpRevealModifier(delay: delay)) }
}

// MARK: - شعار التطبيق (مرسوم برمجيًا — لا يعتمد على أصل صورة)
//
// كرة قدم ذهبية داخل قرص أخضر متدرّج بحلقة ذهبية مزدوجة. يضمن وضوحًا
// حادًّا على كل المقاسات بلا أي خطر «صورة مفقودة/خلفية شطرنجية».

struct SpEmblem: View {
    var size: CGFloat = 96

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(colors: [SpTheme.green, SpTheme.greenDeep],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                )
            Circle()
                .fill(
                    RadialGradient(colors: [SpTheme.greenSoft.opacity(0.45), .clear],
                                   center: .top, startRadius: 0, endRadius: size * 0.7)
                )
            Circle()
                .strokeBorder(SpTheme.gold, lineWidth: size * 0.045)
            Circle()
                .strokeBorder(SpTheme.gold.opacity(0.30), lineWidth: 1)
                .padding(size * 0.11)

            Image(systemName: "soccerball")
                .font(.system(size: size * 0.46, weight: .medium))
                .foregroundStyle(SpTheme.gold)
                .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
        }
        .frame(width: size, height: size)
        .shadow(color: SpTheme.green.opacity(0.55), radius: size * 0.22, y: 6)
    }
}

// MARK: - الصور البعيدة والشعارات

struct SpRemoteImage: View {
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

struct SpTeamLogo: View {
    let logo: String
    var size: CGFloat = 40

    var body: some View {
        SpRemoteImage(url: logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(SpTheme.outline, lineWidth: 1.5))
    }
}

// MARK: - شارة حالة المباراة (مباشر/منتهية/موعد)

struct SpStatusPill: View {
    let fixture: SpFixture

    var body: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(elapsedText)
            }
            .font(SportsFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(SpTheme.crimson))
        } else if fixture.status.finished {
            Text(fixture.status.label)
                .font(SportsFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkDim)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.chipFill))
        } else {
            Text(SpFormat.kickoffTime(fixture.date))
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.gold)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.gold.opacity(0.16)))
        }
    }

    private var elapsedText: String {
        guard let e = fixture.status.elapsed else { return fixture.status.label }
        if let extra = fixture.status.extra, extra > 0 { return "\(e)+\(extra)'" }
        return "\(e)'"
    }
}

// MARK: - رأس قسم موحّد

struct SpSectionHeader: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var count: Int? = nil
    var tint: Color = SpTheme.gold

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(SportsFonts.app(size: 19, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(SportsFonts.headline(size: 20))
                    .foregroundStyle(SpTheme.onDark)
                if let subtitle {
                    Text(subtitle)
                        .font(SportsFonts.app(size: 12))
                        .foregroundStyle(SpTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
            if let count {
                Text("\(count)")
                    .font(SportsFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(tint.opacity(0.14)))
            }
        }
    }
}

struct SpEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(SportsFonts.app(size: 30))
                .foregroundStyle(SpTheme.gold)
            Text(title)
                .font(SportsFonts.subhead(size: 15))
                .foregroundStyle(SpTheme.onDark)
            Text(subtitle)
                .font(SportsFonts.app(size: 12))
                .foregroundStyle(SpTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

struct SpLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(SpTheme.gold); Spacer() }
            .padding(.vertical, 32)
    }
}

// MARK: - بطاقة مباراة واحدة (الجدول/اليوم/المباشر)

struct SpMatchCard: View {
    let fixture: SpFixture
    /// إظهار اسم البطولة أعلى البطاقة (للوحات متعدّدة البطولات: اليوم/المباشر).
    var showsCompetition: Bool = false
    @State private var pressed = false

    private var started: Bool { fixture.started }

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                Text(topLabel)
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
                Spacer(minLength: 6)
                SpStatusPill(fixture: fixture)
            }

            HStack(spacing: 8) {
                teamSide(fixture.home, leading: true)
                scoreBox
                teamSide(fixture.away, leading: false)
            }

            if !fixture.venue.name.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse").font(.system(size: 10))
                    Text(venueText)
                        .font(SportsFonts.app(size: 11))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.cardGradient)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .stroke(fixture.status.live ? SpTheme.crimson.opacity(0.55) : SpTheme.cardStroke,
                        lineWidth: fixture.status.live ? 1.5 : 1)
        )
        .shadow(color: fixture.status.live ? SpTheme.crimson.opacity(0.22) : SpTheme.cardShadow,
                radius: fixture.status.live ? 16 : 10, x: 0, y: 6)
        .scaleEffect(pressed ? 0.97 : 1)
        .contentShape(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous))
    }

    private var topLabel: String {
        if showsCompetition, let c = fixture.competition, !c.isEmpty { return c }
        return fixture.round
    }

    private var venueText: String {
        fixture.venue.city.isEmpty ? fixture.venue.name : "\(fixture.venue.name) — \(fixture.venue.city)"
    }

    private func teamSide(_ team: SpTeam, leading: Bool) -> some View {
        HStack(spacing: 8) {
            if leading {
                SpTeamLogo(logo: team.logo, size: 30)
                teamName(team, align: .leading)
            } else {
                teamName(team, align: .trailing)
                SpTeamLogo(logo: team.logo, size: 30)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private func teamName(_ team: SpTeam, align: TextAlignment) -> some View {
        Text(team.name)
            .font(SportsFonts.app(size: 13, weight: .semibold))
            .foregroundStyle(SpTheme.onDark)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .multilineTextAlignment(align)
    }

    private var scoreBox: some View {
        Group {
            if started {
                Text("\(fixture.goals.home ?? 0) - \(fixture.goals.away ?? 0)")
                    .font(SportsFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                VStack(spacing: 3) {
                    Text(SpFormat.kickoffTime(fixture.date))
                        .font(SportsFonts.app(size: 16, weight: .heavy))
                        .foregroundStyle(SpTheme.gold)
                        .environment(\.layoutDirection, .leftToRight)
                    Text("التوقيت")
                        .font(SportsFonts.app(size: 9))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
            }
        }
        .frame(minWidth: 56)
    }
}
