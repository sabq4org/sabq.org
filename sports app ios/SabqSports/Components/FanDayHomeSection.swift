import SwiftUI

// MARK: - يوم المشجع (تجربة المرحلة 2)
//
// سطح واحد حول الفريق المفضّل: هيرو مباراة + ترتيب مختصر + توقع مفتوح + خبر واحد.
// يُفعَّل عبر `vara.fanDay.enabled` — إيقافه يعيد الرئيسية القديمة فورًا.

struct FanDayHomeSection: View {
    let fixture: SpFixture?
    let favoriteName: String?
    let standing: SpStandingRow?
    let leader: SpStandingRow?
    let runnerUp: SpStandingRow?
    let openPrediction: SpPredictableMatch?
    let headline: String?
    let isFavoriteMatch: Bool
    let onOpenMatch: (SpFixture) -> Void
    let onOpenPredictions: () -> Void
    let onPickTeam: () -> Void

    private var accent: Color { SpTheme.compAccent("pro-league") }

    var body: some View {
        VStack(spacing: 12) {
            if let f = fixture {
                fanHero(f)
            } else if favoriteName == nil {
                pickTeamCard
            }

            if standing != nil || leader != nil {
                rankStrip
            }

            if let open = openPrediction {
                predictionCard(open)
            }

            if let headline, !headline.isEmpty {
                newsCard(headline)
            }
        }
    }

    // MARK: - هيرو كامل العرض

    private func fanHero(_ f: SpFixture) -> some View {
        Button { onOpenMatch(f) } label: {
            VStack(spacing: 16) {
                HStack {
                    HStack(spacing: 5) {
                        if isFavoriteMatch {
                            Image(systemName: "star.fill")
                                .font(.system(size: 9, weight: .bold))
                        }
                        Text(heroLabel(f))
                            .font(SportsFonts.app(size: 11, weight: .bold))
                            .lineLimit(1)
                    }
                    .foregroundStyle(.white.opacity(0.92))
                    Spacer(minLength: 8)
                    statusChip(f)
                }

                HStack(alignment: .top, spacing: 10) {
                    fanTeam(f.home)
                    scoreBlock(f)
                    fanTeam(f.away)
                }

                if let venue = venueLine(f) {
                    Text(venue)
                        .font(SportsFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.72))
                        .lineLimit(1)
                }

                Text(L("افتح مركز المباراة"))
                    .font(SportsFonts.app(size: 12.5, weight: .heavy))
                    .foregroundStyle(SpTheme.greenDeep)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white)
                    )
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 20)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [SpTheme.greenDeep, SpTheme.green, SpTheme.green.opacity(0.92)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        }
        .buttonStyle(SpPressStyle())
        .padding(.horizontal, -16)
    }

    private func heroLabel(_ f: SpFixture) -> String {
        if isFavoriteMatch {
            let base = favoriteName.map { Lf("فريقي · %@", $0) } ?? L("فريقي")
            return f.round.isEmpty ? base : "\(base) · \(f.round)"
        }
        return f.round.isEmpty ? L("دوري روشن") : "\(L("دوري روشن")) · \(f.round)"
    }

    @ViewBuilder private func statusChip(_ f: SpFixture) -> some View {
        if f.status.live {
            Text(liveMinute(f))
                .font(SportsFonts.app(size: 11, weight: .heavy))
                .foregroundStyle(Color(red: 1, green: 0.72, blue: 0.68))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(.white.opacity(0.14)))
        } else if f.status.finished {
            Text(L("انتهت"))
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.9))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(.white.opacity(0.12)))
        } else {
            Text(SpFormat.kickoffDay(f.date) + " · " + SpFormat.kickoffTime(f.date))
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.9))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(.white.opacity(0.12)))
                .environment(\.layoutDirection, .leftToRight)
        }
    }

    private func fanTeam(_ team: SpTeam) -> some View {
        VStack(spacing: 8) {
            SpTeamLogo(logo: team.logo, size: 52)
                .padding(6)
                .background(Circle().fill(.white.opacity(0.14)))
            Text(team.name)
                .font(SportsFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.75)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func scoreBlock(_ f: SpFixture) -> some View {
        VStack(spacing: 4) {
            if f.started {
                Text("\(f.goals.home ?? 0) – \(f.goals.away ?? 0)")
                    .font(SportsFonts.app(size: 30, weight: .heavy))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text("VS")
                    .font(SportsFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(.white.opacity(0.7))
            }
            if !f.started {
                Text(SpFormat.kickoffTime(f.date))
                    .font(SportsFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.75))
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(width: 88)
    }

    private func venueLine(_ f: SpFixture) -> String? {
        var parts: [String] = []
        if !f.venue.name.isEmpty { parts.append(f.venue.name) }
        if let c = f.competition, !c.isEmpty { parts.append(c) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func liveMinute(_ f: SpFixture) -> String {
        guard let e = f.status.elapsed else { return L("مباشر") }
        if let extra = f.status.extra, extra > 0 { return "\(e)+\(extra)'" }
        return "\(e)'"
    }

    // MARK: - ترتيب مختصر

    private var rankStrip: some View {
        HStack(spacing: 8) {
            if let s = standing {
                miniStat(L("الترتيب"), "\(s.rank)", Lf("%d نقطة", s.points))
                if s.rank == 1 {
                    let gap = s.points - (runnerUp?.points ?? s.points)
                    miniStat(L("الفارق"), gap == 0 ? L("متساويان") : Lf("%d نقطة", gap), L("على الوصيف"))
                } else if let leader {
                    let gap = leader.points - s.points
                    miniStat(L("عن الصدارة"), gap == 0 ? "—" : "+\(gap)", leader.team.name)
                }
            } else if let leader {
                miniStat(L("المتصدّر"), leader.team.name, Lf("%d نقطة", leader.points))
            }
        }
    }

    private func miniStat(_ key: String, _ value: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(key)
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
            Text(value)
                .font(SportsFonts.app(size: 18, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(sub)
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(accent)
                .lineLimit(1).minimumScaleFactor(0.75)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(SpTheme.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(SpTheme.cardStroke, lineWidth: 1)
        )
    }

    // MARK: - توقع مفتوح

    private func predictionCard(_ m: SpPredictableMatch) -> some View {
        let f = m.fixture
        let points = m.poolAvailable
        return Button(action: onOpenPredictions) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(L("توقع مفتوح"))
                        .font(SportsFonts.app(size: 14, weight: .heavy))
                        .foregroundStyle(SpTheme.onDark)
                    Spacer()
                    if points > 0 {
                        Text(Lf("+%d نقطة", points))
                            .font(SportsFonts.app(size: 11, weight: .heavy))
                            .foregroundStyle(SpTheme.goldDeep)
                            .padding(.horizontal, 9).padding(.vertical, 5)
                            .background(Capsule().fill(SpTheme.gold.opacity(0.16)))
                    }
                }
                Text("\(f.home.name) × \(f.away.name)")
                    .font(SportsFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
                if m.myPrediction != nil {
                    Text(L("توقّعك مسجّل — يمكنك تعديله قبل الإغلاق"))
                        .font(SportsFonts.app(size: 11.5, weight: .semibold))
                        .foregroundStyle(accent)
                } else {
                    Text(L("أرسل توقعك قبل انطلاق المباراة"))
                        .font(SportsFonts.app(size: 11.5, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkDim)
                }
                Text(L("افتح التوقّعات"))
                    .font(SportsFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(SpTheme.green)
                    )
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .fill(SpTheme.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .stroke(SpTheme.cardStroke, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - خبر واحد

    private func newsCard(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(SpTheme.gold)
                .frame(width: 8, height: 8)
                .padding(.top, 5)
            VStack(alignment: .leading, spacing: 4) {
                Text(L("خبر واحد يهمك"))
                    .font(SportsFonts.app(size: 10.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkDim)
                Text(text)
                    .font(SportsFonts.app(size: 13.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDark)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .stroke(SpTheme.cardStroke, lineWidth: 1)
        )
    }

    // MARK: - بلا فريق

    private var pickTeamCard: some View {
        Button(action: onPickTeam) {
            VStack(alignment: .leading, spacing: 10) {
                Text(L("يوم المشجع"))
                    .font(SportsFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                Text(L("اختر فريقك المفضّل ليصبح محور شاشتك الرئيسية."))
                    .font(SportsFonts.app(size: 12.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                Text(L("اختر فريقي"))
                    .font(SportsFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(SpTheme.green)
                    )
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .fill(SpTheme.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .stroke(SpTheme.cardStroke, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }
}
