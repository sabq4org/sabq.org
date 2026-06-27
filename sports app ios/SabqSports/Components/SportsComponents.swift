import SwiftUI
import SafariServices

// مكوّنات UI أساسية لتطبيق سبق الرياضي — مبنية على نمط WorldCupComponents/
// AsianCupComponents لكن بألوان SpTheme. تُستعمل عبر الشاشات.

// صورة دائرية بكاش @State — تبقى ثابتة عبر إعادة رسم الأب المتكرر (بخلاف
// AsyncImage التي ترتدّ للبديل عند كل تحديث، كهيدر الرئيسية الحيّ).
struct SpAvatarImage: View {
    let url: String?
    var size: CGFloat = 46
    var ring: Color = Color.white.opacity(0.6)
    var placeholderFg: Color = Color.white.opacity(0.92)
    var placeholderBg: Color = Color.white.opacity(0.18)
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.44, weight: .medium))
                    .foregroundStyle(placeholderFg)
                    .frame(width: size, height: size)
                    .background(Circle().fill(placeholderBg))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(ring, lineWidth: 2))
        .task(id: url) {
            guard let s = url, !s.isEmpty, let u = URL(string: s) else { image = nil; return }
            if let (data, _) = try? await URLSession.shared.data(from: u),
               let img = UIImage(data: data) {
                image = img
            }
        }
    }
}

// نمط ضغط موحّد للبطاقات القابلة للنقر — انكماش خفيف عند اللمس.
struct SpPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

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

// نسيج نقطي ذهبي خفيف جدًا — يطابق نقشة هيرو روشن على الويب (radial-dot).
// يوضع فوق الكتل الفحمية/البترولية (الهيدر، الهيرو) لإحساس فاخر هادئ.
struct SpDotTexture: View {
    var spacing: CGFloat = 22
    var dot: CGFloat = 1.4
    var color: Color = SpTheme.green
    var opacity: Double = 0.10

    var body: some View {
        Canvas { ctx, size in
            var y: CGFloat = spacing / 2
            while y < size.height {
                var x: CGFloat = spacing / 2
                while x < size.width {
                    let rect = CGRect(x: x, y: y, width: dot, height: dot)
                    ctx.fill(Path(ellipseIn: rect), with: .color(color))
                    x += spacing
                }
                y += spacing
            }
        }
        .opacity(opacity)
        .allowsHitTesting(false)
    }
}

// خلفية نظيفة: رمادي فاتح جدًّا فقط — لا توهّجات ولا نقشة (تصميم كأس آسيا الأبيض
// النظيف على الويب: مساحات بيضاء واسعة، الأخضر لمسة في البطاقات لا في الخلفية).
struct SpAmbientBackground: View {
    var animated: Bool = true

    var body: some View {
        SpTheme.screenGradient.ignoresSafeArea()
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
                .strokeBorder(SpTheme.green, lineWidth: size * 0.045)
            Circle()
                .strokeBorder(SpTheme.green.opacity(0.30), lineWidth: 1)
                .padding(size * 0.11)

            Image(systemName: "soccerball")
                .font(.system(size: size * 0.46, weight: .medium))
                .foregroundStyle(SpTheme.green)
                .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
        }
        .frame(width: size, height: size)
        .shadow(color: SpTheme.green.opacity(0.55), radius: size * 0.22, y: 6)
    }
}

// MARK: - الصور البعيدة والشعارات

// صورة بعيدة بكاش @State — تبقى ثابتة عبر إعادة رسم الأب المتكرر (بخلاف
// AsyncImage التي ترتدّ للفراغ عند كل تحديث، كالرئيسية الحيّة → اختفاء الصور).
struct SpRemoteImage: View {
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
            Text("انتهت")
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.crimson)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.crimson.opacity(0.12)))
        } else {
            Text("قادمة")
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.green)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.green.opacity(0.12)))
        }
    }

    private var elapsedText: String {
        // أوقات بلا عدّاد دقائق: الاستراحة/ركلات الترجيح → ليبل قصير بدل الدقيقة.
        switch fixture.status.code {
        case "HT": return "استراحة"
        case "BT": return "استراحة إضافي"
        case "P", "PEN": return "ركلات"
        case "SUSP": return "موقوفة"
        case "INT": return "متوقّفة"
        default: break
        }
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
    var tint: Color = SpTheme.green

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
                .foregroundStyle(SpTheme.green)
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
        HStack { Spacer(); ProgressView().tint(SpTheme.green); Spacer() }
            .padding(.vertical, 32)
    }
}

// MARK: - بطاقة مباراة واحدة (الجدول/اليوم/المباشر)

struct SpMatchCard: View {
    let fixture: SpFixture
    /// إظهار اسم البطولة أعلى البطاقة (للوحات متعدّدة البطولات: اليوم/المباشر).
    var showsCompetition: Bool = false

    @Environment(SpMatchFollows.self) private var matchFollows

    private var started: Bool { fixture.started }

    // البطاقة رابط يدفع مركز المباراة. نجمة المتابعة **شقيقة** للرابط داخل ZStack
    // (لا متداخلة) كي تلتقط نقرتها بدل أن يبتلعها الرابط — مكانها يطابق فراغًا
    // محجوزًا في صدر البطاقة.
    var body: some View {
        ZStack(alignment: .topLeading) {
            NavigationLink {
                SpMatchCenter(fixtureId: fixture.id, preview: fixture)
            } label: { cardBody }
                .buttonStyle(SpPressStyle())

            followButton
                .padding(.top, 14)
                .padding(.leading, 14)
        }
    }

    // هل حُسمت المباراة بفائز؟ (للنتائج المنتهية — لإبراز الفائز وتعتيم الخاسر)
    private var decided: Bool {
        fixture.status.finished && (fixture.home.winner == true || fixture.away.winner == true)
    }
    private func isWinner(_ team: SpTeam) -> Bool { decided && team.winner == true }
    private func isLoser(_ team: SpTeam) -> Bool { decided && team.winner != true }

    private var cardBody: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                Color.clear.frame(width: 28, height: 28)   // فراغ محجوز لنجمة المتابعة (overlay)
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
            // اسم الملعب مُخفى — المزوّد يرسله إنجليزيًّا بلا تعريب.
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.cardGradient)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .stroke(SpTheme.cardStroke, lineWidth: 1)
        )
        // بطاقة هادئة موحّدة لكل الحالات (كنتائج البطولة) — لا إطار/ظلّ أحمر
        // للمباشر؛ تبقى إشارة البثّ في قُريص الدقيقة الأحمر الصغير فقط.
        .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
        .contentShape(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous))
    }

    // نجمة المتابعة — متابعة/إلغاء متابعة المباراة. زرّ مستقلّ داخل البطاقة (يلتقط
    // نقرته قبل رابط البطاقة) — يعمل بلا تسجيل دخول، ويُضيف المباراة لـ«مبارياتي».
    private var followButton: some View {
        let following = matchFollows.isFollowing(fixture.id)
        return Button {
            matchFollows.toggle(fixture)
        } label: {
            Image(systemName: following ? "star.fill" : "star")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(following ? SpTheme.gold : SpTheme.onDarkFaint)
                .frame(width: 28, height: 28)
                .background(Circle().fill(following ? SpTheme.gold.opacity(0.12) : SpTheme.chipFill))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
    }

    private var topLabel: String {
        if showsCompetition, let c = fixture.competition, !c.isEmpty { return c }
        if fixture.status.finished {
            let dm = SpFormat.dayMonth(fixture.date)
            return dm.isEmpty ? fixture.round : "\(fixture.round) · \(dm)"
        }
        return fixture.round
    }

    private var venueText: String {
        fixture.venue.city.isEmpty ? fixture.venue.name : "\(fixture.venue.name) — \(fixture.venue.city)"
    }

    private func teamSide(_ team: SpTeam, leading: Bool) -> some View {
        let loser = isLoser(team)
        return HStack(spacing: 8) {
            if leading {
                logo(team, dim: loser)
                teamName(team, align: .leading)
            } else {
                teamName(team, align: .trailing)
                logo(team, dim: loser)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private func logo(_ team: SpTeam, dim: Bool) -> some View {
        SpTeamLogo(logo: team.logo, size: 30).opacity(dim ? 0.5 : 1)
    }

    private func teamName(_ team: SpTeam, align: TextAlignment) -> some View {
        let winner = isWinner(team)
        let loser = isLoser(team)
        return HStack(spacing: 5) {
            if winner, align == .trailing {
                Image(systemName: "chevron.left").font(.system(size: 9, weight: .black)).foregroundStyle(SpTheme.green)
            }
            Text(team.name)
                .font(SportsFonts.app(size: 13, weight: winner ? .heavy : .semibold))
                .foregroundStyle(loser ? SpTheme.onDarkDim : SpTheme.onDark)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .multilineTextAlignment(align)
            if winner, align == .leading {
                Image(systemName: "chevron.right").font(.system(size: 9, weight: .black)).foregroundStyle(SpTheme.green)
            }
        }
    }

    private var scoreBox: some View {
        Group {
            if started {
                HStack(spacing: 5) {
                    scoreNumber(fixture.goals.away ?? 0, team: fixture.away)
                    Text("-").font(SportsFonts.app(size: 18, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                    scoreNumber(fixture.goals.home ?? 0, team: fixture.home)
                }
                .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(SpFormat.kickoffTime(fixture.date))
                    .font(SportsFonts.app(size: 18, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(minWidth: 56)
    }

    private func scoreNumber(_ value: Int, team: SpTeam) -> some View {
        Text("\(value)")
            .font(SportsFonts.app(size: 22, weight: .heavy))
            .foregroundStyle(isLoser(team) ? SpTheme.onDarkFaint : SpTheme.onDark)
            .monospacedDigit()
    }
}

// MARK: - بطاقة «مبارياتي» (المباريات المتابَعة + عدّاد تنازلي حيّ)
//
// تتصدّر الرئيسية حين يتابع المستخدم مباراةً أو أكثر. كل صفّ: الفريقان + مركز
// يتغيّر بالحالة — عدّاد تنازليّ للانطلاق (يُحدَّث كل ثانية عبر TimelineView)،
// نتيجة + «مباشر» للجارية، أو نتيجة + «انتهت» للمنتهية. نجمة ذهبية لإلغاء المتابعة.
struct SpMyMatchesCard: View {
    @Environment(SpMatchFollows.self) private var follows
    @Environment(SpAuthStore.self) private var auth

    var body: some View {
        let matches = follows.items
        if !matches.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                header(count: matches.count)
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    VStack(spacing: 0) {
                        ForEach(Array(matches.enumerated()), id: \.element.id) { idx, f in
                            if idx > 0 {
                                Rectangle().fill(SpTheme.outline).frame(height: 1)
                                    .padding(.leading, 14)
                            }
                            row(f, now: ctx.date)
                        }
                    }
                }
                .padding(.top, 4)
                .padding(.bottom, 6)
                if !auth.isLoggedIn { loginHint }
            }
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .fill(SpTheme.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .stroke(SpTheme.cardStroke, lineWidth: 1)
            )
            .task { await pollLive() }
        }
    }

    // تحديث دوري لحالة/نتيجة المباريات المتابَعة أثناء عرض البطاقة — كي تنتقل
    // «لم تبدأ» → «مباشر» وتتقدّم الدقيقة دون انتظار تحديث الصفحة يدويًا.
    // يتسارع حين توجد مباراة جارية/قريبة، ويتباطأ حين لا شيء نشط.
    private func pollLive() async {
        while !Task.isCancelled {
            let hasActive = follows.items.contains { f in
                f.status.live || abs(f.kickoff.timeIntervalSinceNow) < 2 * 3600
            }
            let delay: UInt64 = hasActive ? 15_000_000_000 : 60_000_000_000
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            await follows.refresh()
        }
    }

    // تلميح: الإشعارات اللحظية (هدف/نهاية) تتطلّب تسجيل الدخول.
    private var loginHint: some View {
        HStack(spacing: 7) {
            Image(systemName: "bell.badge")
                .font(.system(size: 11, weight: .semibold)).foregroundStyle(SpTheme.green)
            Text("سجّل الدخول لتصلك إشعارات الأهداف والنتيجة لحظيًّا")
                .font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .background(SpTheme.green.opacity(0.06))
    }

    private func header(count: Int) -> some View {
        HStack(spacing: 8) {
            Text("مبارياتي")
                .font(SportsFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
            Text("\(count)")
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.green)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(Capsule().fill(SpTheme.green.opacity(0.12)))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.top, 14)
    }

    private func row(_ f: SpFixture, now: Date) -> some View {
        ZStack(alignment: .leading) {
            NavigationLink {
                SpMatchCenter(fixtureId: f.id, preview: f)
            } label: {
                HStack(spacing: 10) {
                    Color.clear.frame(width: 24, height: 24)   // فراغ محجوز لنجمة الإلغاء
                    teamMini(f.home, leading: true)
                    centerStatus(f, now: now)
                    teamMini(f.away, leading: false)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(SpPressStyle())

            unfollowButton(f).padding(.leading, 14)
        }
    }

    private func unfollowButton(_ f: SpFixture) -> some View {
        Button {
            follows.remove(f.id)
        } label: {
            Image(systemName: "star.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(SpTheme.gold)
                .frame(width: 24, height: 24)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
    }

    private func teamMini(_ t: SpTeam, leading: Bool) -> some View {
        HStack(spacing: 7) {
            if leading {
                SpTeamLogo(logo: t.logo, size: 24)
                name(t)
            } else {
                name(t)
                SpTeamLogo(logo: t.logo, size: 24)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private func name(_ t: SpTeam) -> some View {
        Text(t.name)
            .font(SportsFonts.app(size: 12.5, weight: .semibold))
            .foregroundStyle(SpTheme.onDark)
            .lineLimit(1).minimumScaleFactor(0.75)
    }

    @ViewBuilder private func centerStatus(_ f: SpFixture, now: Date) -> some View {
        if f.started {
            VStack(spacing: 3) {
                HStack(spacing: 5) {
                    Text("\(f.goals.away ?? 0)").font(SportsFonts.app(size: 18, weight: .heavy)).monospacedDigit()
                    Text("-").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                    Text("\(f.goals.home ?? 0)").font(SportsFonts.app(size: 18, weight: .heavy)).monospacedDigit()
                }
                .foregroundStyle(SpTheme.onDark)
                .environment(\.layoutDirection, .leftToRight)
                statusBadge(f)
            }
            .frame(minWidth: 92)
        } else if f.kickoff.timeIntervalSince(now) <= 2 * 3600 {
            // باقٍ ساعتان أو أقل → عدّ تنازليّ حيّ (خط أصغر من السابق).
            VStack(spacing: 2) {
                Text(countdown(to: f.kickoff, now: now))
                    .font(SportsFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(SpTheme.green)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text("تبدأ بعد")
                    .font(SportsFonts.app(size: 9))
                    .foregroundStyle(SpTheme.onDarkFaint)
            }
            .frame(minWidth: 92)
        } else {
            // أبعد من ساعتين → توقيت المباراة بخط صغير + اليوم.
            VStack(spacing: 2) {
                Text(SpFormat.kickoffTime(f.date))
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text(SpFormat.dayMonth(f.date))
                    .font(SportsFonts.app(size: 9))
                    .foregroundStyle(SpTheme.onDarkFaint)
            }
            .frame(minWidth: 92)
        }
    }

    @ViewBuilder private func statusBadge(_ f: SpFixture) -> some View {
        if f.status.live {
            HStack(spacing: 4) {
                Circle().fill(SpTheme.crimson).frame(width: 6, height: 6)
                Text(liveLabel(f))
                    .font(SportsFonts.app(size: 9.5, weight: .bold))
                    .foregroundStyle(SpTheme.crimson)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
        } else {
            Text("انتهت")
                .font(SportsFonts.app(size: 9.5, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
        }
    }

    // نصّ الحالة الجارية: دقيقة الشوط («45+2'») إن توفّرت، وإلا حالة الشوط
    // («بين الشوطين»/«الشوط الأول»…) من الخادم، وإلا «مباشر».
    private func liveLabel(_ f: SpFixture) -> String {
        if let m = f.status.elapsed, m > 0 {
            let extra = (f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : ""
            return "\(m)\(extra)'"
        }
        return f.status.label.isEmpty ? "مباشر" : f.status.label
    }

    // عدّاد تنازليّ بأرقام لاتينية: «2ي 04س» إن بقي أكثر من يوم، وإلا «HH:MM:SS».
    private func countdown(to date: Date, now: Date) -> String {
        let total = max(0, Int(date.timeIntervalSince(now)))
        let days = total / 86_400
        let h = (total % 86_400) / 3_600
        let m = (total % 3_600) / 60
        let s = total % 60
        if days > 0 { return "\(days)ي \(h)س" }
        return String(format: "%02d:%02d:%02d", h, m, s)
    }
}

// MARK: - عدّ تنازلي حي (TimelineView) — لانطلاق الموسم القادم

struct SpCountdownChips: View {
    let timestampMs: Int

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let total = max(0, Double(timestampMs) / 1000 - Date().timeIntervalSince1970)
            if total <= 0 {
                HStack(spacing: 6) {
                    Circle().fill(SpTheme.greenSoft).frame(width: 8, height: 8)
                    Text("انطلق الموسم — تابع المباريات الآن")
                        .font(SportsFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SpTheme.onDark)
                }
            } else {
                let days = Int(total) / 86_400
                let hours = (Int(total) % 86_400) / 3_600
                let mins = (Int(total) % 3_600) / 60
                let secs = Int(total) % 60
                HStack(spacing: 8) {
                    chip(days, "يوم"); chip(hours, "ساعة"); chip(mins, "دقيقة"); chip(secs, "ثانية")
                }
            }
        }
    }

    private func chip(_ value: Int, _ label: String) -> some View {
        VStack(spacing: 1) {
            Text("\(value)")
                .font(SportsFonts.app(size: 20, weight: .heavy))
                .foregroundStyle(SpTheme.onDark).monospacedDigit()
            Text(label)
                .font(SportsFonts.app(size: 10))
                .foregroundStyle(SpTheme.onDarkDim)
        }
        .frame(minWidth: 52)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.chipFill))
    }
}

// MARK: - كتلة «نظرة الموسم» (عطلة/ما قبل الموسم) — بطل + عدّ تنازلي + افتتاح
//
// كتلة خضراء سعودية بارزة تملأ الرئيسية بمحتوى سعودي طوال السنة حين لا توجد
// مباريات اليوم — على طراز «مشوار الأخضر» في قسم المونديال. نصوصها بيضاء.

struct SpOutlookCard: View {
    let outlook: SpOutlook

    var body: some View {
        VStack(spacing: 16) {
            // ترويسة: عنوان البطولة + شارة الحالة
            HStack(spacing: 8) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(SpTheme.green)
                Text("دوري روشن")
                    .font(SportsFonts.headline(size: 19))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                statusPill
            }

            if let c = outlook.champion {
                championShowcase(c)
            }

            Text(subtitle)
                .font(SportsFonts.app(size: 12))
                .foregroundStyle(SpTheme.onDarkDim)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            if let ts = outlook.firstKickoff {
                VStack(spacing: 8) {
                    Text("انطلاق الموسم القادم")
                        .font(SportsFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkDim)
                    SpCountdownChips(timestampMs: ts)
                }
            }

            if !outlook.openers.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("مباريات الافتتاح")
                        .font(SportsFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    ForEach(outlook.openers.prefix(3)) { f in openerRow(f) }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .stroke(SpTheme.cardStroke, lineWidth: 1)
        )
    }

    private var statusPill: some View {
        let info: (String, String) = {
            switch outlook.phase {
            case "off-season": return ("في العطلة", "sun.max.fill")
            case "pre-season": return ("استعداد للموسم", "calendar.badge.clock")
            default: return ("نظرة الموسم", "sportscourt.fill")
            }
        }()
        return HStack(spacing: 5) {
            Image(systemName: info.1).font(.system(size: 10, weight: .bold))
            Text(info.0).font(SportsFonts.app(size: 11, weight: .bold))
        }
        .foregroundStyle(SpTheme.green)
        .padding(.horizontal, 11).padding(.vertical, 5)
        .background(Capsule().fill(SpTheme.green.opacity(0.12)))
    }

    // منصّة تتويج: تاج + شعار البطل في حلقة ذهبية مزدوجة + اسم البطل بارز.
    private func championShowcase(_ c: SpOutlookChampion) -> some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(SpTheme.green.opacity(0.22))
                    .frame(width: 108, height: 108).blur(radius: 12)
                SpRemoteImage(url: c.logo)
                    .padding(14)
                    .frame(width: 94, height: 94)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(SpTheme.green, lineWidth: 3))
                    .overlay(Circle().stroke(SpTheme.green.opacity(0.25), lineWidth: 1).padding(5))
                Image(systemName: "crown.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(SpTheme.green)
                    .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                    .offset(y: -58)
            }
            .padding(.top, 10)

            Text("بطل موسم \(seasonLabel(outlook.season))")
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.green)
                .padding(.horizontal, 12).padding(.vertical, 4)
                .background(Capsule().fill(SpTheme.green.opacity(0.15)))

            Text(c.name)
                .font(SportsFonts.app(size: 26, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private var subtitle: String {
        switch outlook.phase {
        case "off-season": return "بانتظار جدول الموسم الجديد — وإليك بطل الموسم الماضي."
        case "pre-season": return "العدّ التنازلي لانطلاق الموسم الجديد ومبارياته الأولى."
        default: return "كل ما يخصّ الموسم في مكان واحد."
        }
    }

    private func seasonLabel(_ year: Int) -> String { "\(year)/\(year + 1)" }

    private func openerRow(_ f: SpFixture) -> some View {
        HStack(spacing: 10) {
            SpTeamLogo(logo: f.home.logo, size: 28)
            Text(f.home.name)
                .font(SportsFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 4)
            Text(SpFormat.kickoffTime(f.date))
                .font(SportsFonts.app(size: 12, weight: .bold))
                .foregroundStyle(SpTheme.green)
                .environment(\.layoutDirection, .leftToRight)
            Spacer(minLength: 4)
            Text(f.away.name)
                .font(SportsFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.8)
            SpTeamLogo(logo: f.away.logo, size: 28)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.chipFill))
    }
}

// MARK: - بطاقة خبر رياضي (صورة + عنوان + كاتب/وقت) — تفتح قارئًا داخليًّا

struct SpNewsCard: View {
    let article: SpArticle
    @State private var showReader = false

    var body: some View {
        Button { showReader = true } label: { cardBody }
            .buttonStyle(SpPressStyle())
            .sheet(isPresented: $showReader) {
                if let s = article.articleUrl, let url = URL(string: s) {
                    SpSafariView(url: url).ignoresSafeArea()
                }
            }
    }

    private var cardBody: some View {
        HStack(spacing: 12) {
            thumb
            VStack(alignment: .leading, spacing: 6) {
                if article.isBreaking == true {
                    Text("عاجل")
                        .font(SportsFonts.app(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(SpTheme.crimson))
                }
                Text(article.title)
                    .font(SportsFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(3).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text(article.author ?? "صحيفة سبق")
                        .font(SportsFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SpTheme.emeraldDeep)
                    if let m = article.readingMinutes, m > 0 {
                        Text("· \(m) دقيقة")
                            .font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkFaint)
                    }
                    Spacer(minLength: 0)
                    Text(SpFormat.relativeArabic(article.publishedAt))
                        .font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkFaint)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
        .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
    }

    @ViewBuilder private var thumb: some View {
        if let s = article.imageUrl, !s.isEmpty {
            SpRemoteImage(url: s, contentMode: .fill)
                .frame(width: 92, height: 92)
                .background(SpTheme.chipFill)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SpTheme.chipFill)
                .frame(width: 92, height: 92)
                .overlay(Image(systemName: "newspaper").font(.system(size: 22)).foregroundStyle(SpTheme.onDarkFaint))
        }
    }
}

// قارئ داخلي (SFSafariViewController) لفتح مقالات سبق دون مغادرة التطبيق.
struct SpSafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let cfg = SFSafariViewController.Configuration()
        cfg.entersReaderIfAvailable = false
        let vc = SFSafariViewController(url: url, configuration: cfg)
        vc.preferredControlTintColor = UIColor(SpTheme.green)
        return vc
    }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

// MARK: - إخفاء شريط التبويب عند التمرير (تحرير مساحة القراءة)
//
// حالة مشتركة يقودها اتجاه التمرير في الشاشات الرئيسية: تمرير لأسفل (قراءة) يخفي
// الشريط، وتمرير لأعلى/قرب القمة يُظهره. `RootTabView` يطبّق
// `.toolbar(.hidden, for: .tabBar)` بناءً عليها.
@MainActor
@Observable
final class SpTabBarVisibility {
    static let shared = SpTabBarVisibility()
    var hidden = false
    private init() {}
}

private struct AutoHideTabBar: ViewModifier {
    @Environment(SpTabBarVisibility.self) private var vis
    @State private var lastY: CGFloat = 0

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content
                .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, newY in
                    let delta = newY - lastY
                    if newY < 36 { set(false) }              // قرب القمة → أظهر دائمًا
                    else if delta > 6 { set(true) }          // تمرير لأسفل (قراءة) → أخفِ
                    else if delta < -6 { set(false) }        // تمرير لأعلى → أظهر
                    lastY = newY
                }
                .onAppear { set(false) }
        } else {
            content
        }
    }

    private func set(_ h: Bool) {
        guard vis.hidden != h else { return }
        withAnimation(.easeInOut(duration: 0.25)) { vis.hidden = h }
    }
}

extension View {
    /// تُطبَّق على ScrollView رئيسية: تخفي شريط التبويب عند التمرير لأسفل وتُظهره
    /// عند التمرير لأعلى/قرب القمة (iOS 18+؛ بلا أثر على ما دونه).
    func autoHideTabBar() -> some View { modifier(AutoHideTabBar()) }
}
