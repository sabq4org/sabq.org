import SwiftUI

// المجتمع — لوحة المتصدّرين (نقاط التوقّعات). تعمل عبر /api/sports/leaderboard
// العامّة. تُبرز ترتيب المستخدم الحالي إن كان ضمن اللوحة. إرسال التوقّعات يأتي
// لاحقًا (يلزم نقطة موبايل بجلسة العضو).
struct CommunityView: View {
    @Environment(SpAuthStore.self) private var auth
    @State private var entries: [SpLeaderboardEntry] = []
    @State private var period: Period = .all
    @State private var loading = true
    @State private var loadError: String?

    enum Period: String, CaseIterable {
        case all, month, week
        var label: String {
            switch self {
            case .all: return "الكل"
            case .month: return "هذا الشهر"
            case .week: return "هذا الأسبوع"
            }
        }
    }

    private var myEntry: SpLeaderboardEntry? {
        guard let uid = auth.member?.id else { return nil }
        return entries.first { $0.userId == uid }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    banner
                    periodPicker
                    standingCard

                    if loading {
                        SpLoading()
                    } else if let loadError {
                        SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                    } else if entries.isEmpty {
                        SpEmptyState(icon: "trophy", title: "لا متصدّرين بعد",
                                     subtitle: "كن أول من يتصدّر بتوقّعاتك هذا الموسم")
                    } else {
                        leaderboardList
                    }

                    howItWorks
                }
                .padding(16)
            }
            .background(SpAmbientBackground())
            .navigationTitle("المجتمع")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    // MARK: - لافتة

    private var banner: some View {
        HStack(spacing: 12) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 20))
                .foregroundStyle(SpTheme.green)
                .frame(width: 46, height: 46)
                .background(Circle().fill(SpTheme.green.opacity(0.12)))
            VStack(alignment: .leading, spacing: 2) {
                Text("لوحة المتصدّرين")
                    .font(SportsFonts.headline(size: 20))
                    .foregroundStyle(SpTheme.onDark)
                Text("نافِس الجمهور بتوقّعاتك واصعد القمة")
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
    }

    private var periodPicker: some View {
        Picker("", selection: $period) {
            ForEach(Period.allCases, id: \.self) { p in Text(p.label).tag(p) }
        }
        .pickerStyle(.segmented)
        .onChange(of: period) { Task { await load() } }
    }

    // MARK: - ترتيبك

    @ViewBuilder private var standingCard: some View {
        if !auth.isLoggedIn {
            promptCard(icon: "person.crop.circle.badge.plus",
                       text: "سجّل الدخول من «حسابي» للمنافسة على لوحة المتصدّرين.")
        } else if let me = myEntry {
            HStack(spacing: 14) {
                VStack(spacing: 1) {
                    Text("#\(me.rank)")
                        .font(SportsFonts.app(size: 22, weight: .heavy))
                        .foregroundStyle(SpTheme.green)
                        .environment(\.layoutDirection, .leftToRight)
                    Text("ترتيبك").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim)
                }
                .frame(width: 64)
                Rectangle().fill(SpTheme.outline).frame(width: 1, height: 40)
                statCell("\(me.totalPoints)", "نقطة")
                statCell("\(me.predictions)", "توقّع")
                statCell("\(me.correct)", "صحيح")
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .fill(SpTheme.green.opacity(0.10))
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.green.opacity(0.35), lineWidth: 1))
            )
        } else {
            promptCard(icon: "soccerball",
                       text: "لم تتوقّع بعد — ستظهر هنا بمجرد أول توقّع لك. (التوقّع قريبًا)")
        }
    }

    private func promptCard(icon: String, text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(SpTheme.emeraldDeep)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(SpTheme.chipFill))
            Text(text).font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        )
    }

    private func statCell(_ value: String, _ label: String) -> some View {
        VStack(spacing: 1) {
            Text(value).font(SportsFonts.app(size: 18, weight: .heavy)).foregroundStyle(SpTheme.onDark).monospacedDigit()
            Text(label).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - القائمة

    private var leaderboardList: some View {
        VStack(spacing: 8) {
            ForEach(entries) { entry in
                row(entry, isMe: entry.userId == auth.member?.id)
            }
        }
    }

    private func row(_ entry: SpLeaderboardEntry, isMe: Bool) -> some View {
        HStack(spacing: 12) {
            rankBadge(entry.rank)
            SpAvatarImage(url: entry.avatar, size: 42, ring: SpTheme.outline,
                          placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(SportsFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SpTheme.onDark).lineLimit(1)
                Text("\(entry.predictions) توقّع · \(entry.correct) صحيح · \(entry.exact) مطابق")
                    .font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
            }
            Spacer(minLength: 0)
            VStack(spacing: 1) {
                Text("\(entry.totalPoints)").font(SportsFonts.app(size: 18, weight: .bold)).foregroundStyle(SpTheme.green).monospacedDigit()
                Text("نقطة").font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(isMe ? SpTheme.green.opacity(0.10) : SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                    .stroke(isMe ? SpTheme.green.opacity(0.40) : SpTheme.outline, lineWidth: 1))
        )
    }

    private func rankBadge(_ rank: Int) -> some View {
        let color: Color = {
            switch rank {
            // الذهبي للميداليات (استثناء المالك الدلالي) — موحّد مع لوحة متصدّري التوقّعات.
            case 1: return SpTheme.gold
            case 2: return SpTheme.medalSilver
            case 3: return SpTheme.medalBronze
            default: return SpTheme.onDarkFaint
            }
        }()
        return Group {
            if rank <= 3 {
                Image(systemName: "medal.fill").font(.system(size: 20)).foregroundStyle(color)
            } else {
                Text("\(rank)").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(color).monospacedDigit()
            }
        }
        .frame(width: 28)
    }

    // MARK: - كيف تُحتسب النقاط

    private var howItWorks: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "info.circle.fill").font(.system(size: 14)).foregroundStyle(SpTheme.greenSoft)
                Text("كيف تُحتسب النقاط؟").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
            }
            pointRule("نتيجة مطابقة تمامًا", "٣ نقاط", SpTheme.green)
            pointRule("اتجاه صحيح (فوز/تعادل/خسارة)", "نقطة واحدة", SpTheme.greenSoft)
            pointRule("توقّع خاطئ", "٠", SpTheme.onDarkFaint)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        )
    }

    private func pointRule(_ text: String, _ value: String, _ color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(text).font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            Spacer(minLength: 0)
            Text(value).font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(color)
        }
    }

    private func load(force: Bool = false) async {
        if !force { loading = true }
        do {
            self.entries = try await APIClient.shared.fetchLeaderboard(period: period.rawValue, ignoreCache: force)
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
        self.loading = false
    }
}
