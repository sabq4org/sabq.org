import SwiftUI

struct GcMajlisMatchdayView: View {
    let store: GcMajlisDetailStore
    let focusFixtureId: Int?

    var body: some View {
        VStack(spacing: 12) {
            if let data = store.matchday {
                dayNavigator(data)
                championBanner(data.dayChampion)
                if data.matches.isEmpty {
                    GcEmptyState(
                        icon: "calendar.badge.clock",
                        title: L("majlis.matchday.empty.title"),
                        subtitle: L("majlis.matchday.empty.body")
                    )
                    .gcCard()
                } else {
                    ForEach(data.matches) { match in
                        GcMajlisMatchCard(match: match, focused: match.fixture.id == focusFixtureId)
                            .id("gc-majlis-fixture-\(match.fixture.id)")
                    }
                }
            } else {
                stateView
            }
        }
    }

    private func dayNavigator(_ data: GcMajlisMatchdayResponse) -> some View {
        HStack(spacing: 10) {
            dayButton(icon: "chevron.right", date: adjacentDay(data.date, offset: -1), label: L("majlis.matchday.previous"))
            VStack(spacing: 2) {
                Text(L("majlis.matchday.title"))
                    .font(GulfCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(GcTheme.inkDim)
                Text(dayLabel(data.date))
                    .font(GulfCupFonts.headline(size: 16))
                    .foregroundStyle(GcTheme.ink)
            }
            .frame(maxWidth: .infinity)
            dayButton(icon: "chevron.left", date: adjacentDay(data.date, offset: 1), label: L("majlis.matchday.next"))
        }
        .padding(11)
        .gcCard()
    }

    private func dayButton(icon: String, date: String?, label: String) -> some View {
        Button {
            if let date { Task { await store.loadMatchday(date: date, force: true) } }
        } label: {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(GcTheme.skyDeep)
                .frame(width: 44, height: 44)
                .background(Circle().fill(GcTheme.sky.opacity(0.12)))
        }
        .buttonStyle(GcPressStyle())
        .disabled(date == nil || store.matchdayState.isLoading)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private func championBanner(_ champion: GcMajlisDayChampion) -> some View {
        if champion.status == "final", !champion.winners.isEmpty {
            VStack(alignment: .leading, spacing: 11) {
                HStack(spacing: 8) {
                    Image(systemName: "trophy.fill")
                        .foregroundStyle(GcTheme.skyLite)
                    Text(champion.winners.count > 1
                         ? L("majlis.champion.tie")
                         : L("majlis.champion.today"))
                        .font(GulfCupFonts.headline(size: 16))
                        .foregroundStyle(.white)
                    Spacer()
                    Text("\(champion.settledMatches)/\(champion.totalMatches)")
                        .font(GulfCupFonts.app(size: 10, weight: .bold))
                        .foregroundStyle(GcTheme.onHeroDim)
                        .monospacedDigit()
                }
                ForEach(champion.winners) { winner in
                    HStack(spacing: 9) {
                        GcPlayerPhoto(url: winner.avatar, size: 32)
                        Text(winner.name)
                            .font(GulfCupFonts.app(size: 13.5, weight: .bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Spacer()
                        Text("+\(winner.points)")
                            .font(GulfCupFonts.app(size: 16, weight: .bold))
                            .foregroundStyle(GcTheme.skyLite)
                            .monospacedDigit()
                    }
                }
            }
            .padding(15)
            .background(
                RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous)
                    .fill(GcTheme.heroGradient)
                    .overlay(GcHeroDecor().clipShape(RoundedRectangle(cornerRadius: GcTheme.cardRadius)))
            )
            .accessibilityElement(children: .combine)
        } else if champion.status == "in_progress" {
            HStack(spacing: 9) {
                GcLiveDot(color: GcTheme.liveRed, size: 7)
                Text(L("majlis.champion.inProgress", [
                    "settled": "\(champion.settledMatches)",
                    "total": "\(champion.totalMatches)",
                ]))
                    .font(GulfCupFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(GcTheme.ink)
                Spacer()
            }
            .padding(13)
            .gcCard()
        }
    }

    @ViewBuilder private var stateView: some View {
        switch store.matchdayState {
        case .idle, .loading:
            GcLoadingPanel(title: L("majlis.matchday.loading"), rows: 3)
        case .failed(let message):
            GcErrorCard(message: message) { await store.loadMatchday(force: true) }
        case .empty:
            GcEmptyState(
                icon: "calendar.badge.clock",
                title: L("majlis.matchday.empty.title"),
                subtitle: L("majlis.matchday.empty.body")
            )
            .gcCard()
        case .loaded:
            EmptyView()
        }
    }

    private func adjacentDay(_ raw: String, offset: Int) -> String? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Riyadh")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: raw),
              let next = formatter.calendar.date(byAdding: .day, value: offset, to: date) else { return nil }
        return formatter.string(from: next)
    }

    private func dayLabel(_ raw: String) -> String {
        let input = DateFormatter()
        input.calendar = Calendar(identifier: .gregorian)
        input.locale = Locale(identifier: "en_US_POSIX")
        input.timeZone = TimeZone(identifier: "Asia/Riyadh")
        input.dateFormat = "yyyy-MM-dd"
        guard let date = input.date(from: raw) else { return raw }
        let output = DateFormatter()
        output.calendar = Calendar(identifier: .gregorian)
        output.locale = Locale(identifier: "ar_SA@calendar=gregorian;numbers=latn")
        output.timeZone = input.timeZone
        output.dateFormat = "EEEE d MMMM"
        return output.string(from: date)
    }
}

private struct GcMajlisMatchCard: View {
    let match: GcMajlisMatchdayMatch
    let focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 11) {
                HStack {
                    GcChip(text: match.fixture.round, tint: GcTheme.inkDim)
                    Spacer()
                    visibilityPill
                }
                GcScoreRow(fixture: match.fixture)
                if voided && !match.fixture.status.isVoid {
                    GcVoidMatchNotice(compact: true)
                }
            }
            .padding(13)

            Rectangle().fill(GcTheme.outline).frame(height: 1)

            VStack(spacing: 0) {
                ForEach(Array(sortedMembers.enumerated()), id: \.element.id) { index, member in
                    if index > 0 {
                        Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 52)
                    }
                    memberRow(member)
                }
            }
        }
        .gcCard()
        .overlay(
            RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous)
                .stroke(focused ? GcTheme.sky : Color.clear, lineWidth: 2)
        )
        .accessibilityHint(focused ? L("majlis.match.focused") : "")
    }

    private var sortedMembers: [GcMajlisMemberPrediction] {
        match.members.sorted {
            if $0.isViewer != $1.isViewer { return $0.isViewer }
            return $0.name.localizedCompare($1.name) == .orderedAscending
        }
    }

    private var visibilityPill: some View {
        let sealed = match.visibility == .sealed
        return Label(
            voided ? L("state.void.short") : sealed ? L("majlis.match.sealed") : L("majlis.match.revealed"),
            systemImage: voided ? "minus.circle.fill" : sealed ? "lock.fill" : "lock.open.fill"
        )
        .font(GulfCupFonts.app(size: 10.5, weight: .bold))
        .foregroundStyle(voided ? GcTheme.inkDim : sealed ? GcTheme.inkDim : GcTheme.emeraldDeep)
        .padding(.horizontal, 9)
        .frame(minHeight: 28)
        .background(Capsule().fill((voided || sealed ? GcTheme.inkFaint : GcTheme.emerald).opacity(0.12)))
    }

    private var voided: Bool {
        match.fixture.status.isVoid ||
        GcMatchDisposition.isVoid(match.result?.status) ||
        match.members.contains { GcMatchDisposition.isVoid($0.prediction?.evaluation) }
    }

    private func memberRow(_ member: GcMajlisMemberPrediction) -> some View {
        HStack(spacing: 9) {
            GcPlayerPhoto(url: member.avatar, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(member.name)
                        .font(GulfCupFonts.app(size: 12.5, weight: member.isViewer ? .bold : .semibold))
                        .foregroundStyle(GcTheme.ink)
                        .lineLimit(1)
                    if member.isViewer { GcChip(text: L("majlis.me"), tint: GcTheme.skyDeep) }
                    if member.isOwner {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(GcTheme.skyDeep)
                            .accessibilityLabel(L("majlis.owner"))
                    }
                }
                if let prediction = member.prediction {
                    Text(evaluationLabel(prediction.evaluation))
                        .font(GulfCupFonts.app(size: 9.5))
                        .foregroundStyle(evaluationColor(prediction.evaluation))
                } else if match.visibility != .sealed, !member.hasPredicted {
                    Text(L("majlis.match.noPrediction"))
                        .font(GulfCupFonts.app(size: 9.5))
                        .foregroundStyle(GcTheme.inkFaint)
                }
            }
            Spacer(minLength: 6)

            if match.visibility == .sealed {
                Label(
                    member.hasPredicted ? L("majlis.match.predicted") : L("majlis.match.notYet"),
                    systemImage: member.hasPredicted ? "checkmark.circle.fill" : "circle.dashed"
                )
                .font(GulfCupFonts.app(size: 10.5, weight: .bold))
                .foregroundStyle(member.hasPredicted ? GcTheme.emerald : GcTheme.inkFaint)
            } else if let prediction = member.prediction {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(verbatim: "\(prediction.away) - \(prediction.home)")
                        .font(GulfCupFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(GcTheme.ink)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                    if prediction.points > 0 {
                        Text("+\(prediction.points)")
                            .font(GulfCupFonts.app(size: 10.5, weight: .bold))
                            .foregroundStyle(GcTheme.skyDeep)
                            .monospacedDigit()
                    }
                }
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 9)
        .frame(minHeight: 52)
        .background(member.isViewer ? GcTheme.sky.opacity(0.06) : Color.clear)
        .accessibilityElement(children: .combine)
    }

    private func evaluationLabel(_ value: String) -> String {
        if GcMatchDisposition.isVoid(value) { return L("state.void") }
        switch value {
        case "exact": return L("predictions.tier.exact")
        case "margin": return L("predictions.tier.margin")
        case "outcome": return L("predictions.tier.outcome")
        case "pending": return L("mine.pending")
        default: return L("predictions.tier.none")
        }
    }

    private func evaluationColor(_ value: String) -> Color {
        if GcMatchDisposition.isVoid(value) { return GcTheme.inkDim }
        switch value {
        case "exact", "margin", "outcome": return GcTheme.emerald
        case "pending": return GcTheme.inkDim
        default: return GcTheme.inkFaint
        }
    }
}
