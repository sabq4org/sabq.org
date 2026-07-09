import SwiftUI

// MARK: - مخزن نظرة المونديال المشترك
//
// مخزن حيّ على مستوى التطبيق يحتفظ بآخر نظرة مونديال جُلبت. بدونه كانت
// البطاقة تحفظ بياناتها في @State داخل الـ View نفسه، فتختفي عند إعادة
// إنشاء الواجهة الرئيسية أو إلغاء مهمة الجلب أثناء التنقل (الدخول للملف
// الشخصي/لوحة التحكم والرجوع) — ولا تعود إلا بإعادة تشغيل التطبيق. الآن
// البيانات تبقى هنا فتظهر البطاقة فورًا عند العودة، مع تحديث انتهازي.

@Observable
@MainActor
final class WorldCupHomeStore {
    static let shared = WorldCupHomeStore()
    private init() {}

    private(set) var overview: WCOverview?
    private var lastFetch: Date?
    private var fetching = false

    /// يجلب النظرة عند الحاجة فقط: لا بيانات بعد، أو مرّ أكثر من 30 ثانية
    /// على آخر جلب (لتحديث النتيجة/الدقيقة دون إرهاق الخادم).
    func loadIfNeeded() async {
        if fetching { return }
        if overview != nil, let last = lastFetch, Date().timeIntervalSince(last) < 30 { return }
        fetching = true
        defer { fetching = false }
        if let result = try? await APIClient.shared.fetchWorldCupOverview() {
            overview = result
            lastFetch = Date()
        }
    }

    /// تحديث لحظي أثناء اللعب — يتجاوز عتبة الـ30ث ويتجاهل الكاش كي تتحرّك
    /// النتيجة/الدقيقة على الواجهة الرئيسية تلقائيًّا (كما يفعل الويب).
    func refreshLive() async {
        if fetching { return }
        fetching = true
        defer { fetching = false }
        if let result = try? await APIClient.shared.fetchWorldCupOverview(ignoreCache: true) {
            overview = result
            lastFetch = Date()
        }
    }

    /// هل مباراة اليوم جارية الآن؟ (لتقرير الحاجة للاستطلاع الدوري).
    var matchOfTheDayLive: Bool {
        overview?.matchOfTheDay?.fixture.status.live ?? false
    }

    /// أقرب انطلاقة قادمة لمباراة اليوم أو شقيقاتها المتزامنة — تُستخدم لإبقاء
    /// حلقة الاستطلاع حيّة قبل الصافرة فتلتقط التحوّل قادمة→مباشر دون مغادرة الرئيسية.
    var nextKickoffTimestamp: Int? {
        guard let ov = overview else { return nil }
        let candidates = [ov.matchOfTheDay?.fixture].compactMap { $0 } + (ov.matchOfDayPeers ?? [])
        return candidates
            .filter { !$0.status.live && !$0.status.finished }
            .map(\.timestamp)
            .min()
    }
}

// MARK: - شريط المونديال في الواجهة الرئيسية
//
// بطاقة بثيم الملعب الليلي تعرض مباراة اليوم (نتيجة حية أو عدّ تنازلي) مع
// رابط لقسم كأس العالم الكامل. تختفي كليًا عند غياب البيانات — صفر أثر.

struct WorldCupHomeStrip: View {
    private let store = WorldCupHomeStore.shared

    // المباريات المتزامنة: مباراتان (أو أكثر) تجريان الآن، أو قادمتان تنطلقان في
    // التوقيت نفسه (ختام دور المجموعات). الشقيقات تأتي من الخادم (matchOfDayPeers)
    // لا من today فقط، لأنها قد تكون في يوم تقويمي تالٍ. مطابق منطق الهيرو.
    private var matches: [WCFixture] {
        guard let ov = store.overview, let featured = ov.matchOfTheDay?.fixture else { return [] }
        let live = ov.live.filter { $0.status.live }
        if live.count >= 2 { return live }
        if !featured.status.live, !featured.status.finished {
            let peers = (ov.matchOfDayPeers ?? []).filter {
                $0.id != featured.id && !$0.status.live && !$0.status.finished
                    && $0.timestamp == featured.timestamp
            }
            if !peers.isEmpty { return [featured] + peers }
        }
        return [featured]
    }

    var body: some View {
        // حامل مكان Color.clear يمنع SwiftUI من إلغاء العرض (وبالتالي .task)
        // عندما لا تكون البيانات قد وصلت بعد — فخ Group+EmptyView المعروف.
        ZStack {
            Color.clear.frame(width: 0, height: 0)
            // البطل (بعد حسم النهائي) يتقدّم على مربع المباراة — يبقي البانر
            // حيًّا بعد انتهاء آخر مباراة حتى يُطفأ البلوك من لوحة التحكم.
            if let champion = store.overview?.champion {
                NavigationLink(value: WorldCupRoute()) {
                    championCard(champion)
                }
                .buttonStyle(.plain)
            } else if !matches.isEmpty {
                NavigationLink(value: WorldCupRoute()) {
                    VStack(spacing: 10) {
                        ForEach(matches) { f in
                            card(f)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .task {
            // تحميل أولي ثم استطلاع لحظي أثناء جريان مباراة اليوم — تتحدّث
            // النتيجة/الدقيقة على الواجهة دون مغادرة الصفحة (كما في الويب).
            // الحلقة لا تخرج لمجرد أن المباراة «ليست حيّة الآن»: قبل الصافرة
            // تستطلع بوتيرة أبطأ كي تلتقط التحوّل قادمة→مباشر (كان العدّاد
            // يتجمّد على 00:00:00 لمن بقي على الرئيسية لحظة الانطلاق).
            await store.loadIfNeeded()
            while !Task.isCancelled {
                let interval: UInt64
                var lightRefresh = false
                if store.matchOfTheDayLive {
                    interval = 15_000_000_000
                } else if let ts = store.nextKickoffTimestamp {
                    let untilKickoff = TimeInterval(ts) - Date().timeIntervalSince1970
                    if untilKickoff <= -900 {
                        return          // مضى ربع ساعة بلا بث: تأجيل/إلغاء — لا نستطلع للأبد
                    } else if untilKickoff <= 600 {
                        interval = 20_000_000_000   // وشيكة/انطلقت للتو: التقاط التحوّل
                    } else {
                        interval = 60_000_000_000   // بعيدة: نبضة دقيقة صديقة للكاش تكفي
                        lightRefresh = true
                    }
                } else {
                    return              // لا حيّة ولا قادمة — لا شيء يُستطلع
                }
                try? await Task.sleep(nanoseconds: interval)
                if Task.isCancelled { return }
                if lightRefresh { await store.loadIfNeeded() } else { await store.refreshLive() }
            }
        }
    }

    // هوية المونديال: أخضر زمردي حيّ مع توهّج أخضر فاتح خفيف في الزاوية،
    // والشعار الرسمي يوفّر اللمسة الذهبية بدل اللون المنفصل.
    private var cardGradient: LinearGradient {
        LinearGradient(
            colors: [WCTheme.heroTop, WCTheme.royal, WCTheme.heroBottom],
            startPoint: .topTrailing, endPoint: .bottomLeading
        )
    }

    private func card(_ f: WCFixture) -> some View {
        HStack(spacing: 10) {
            // شعار البطولة الرسمي (على خلفية بيضاء لإبراز الرقم الأسود) + الهوية
            HStack(spacing: 10) {
                Image("WorldCupEmblem")
                    .resizable().scaledToFit()
                    .frame(height: 32)
                    .padding(.horizontal, 6).padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(.white))
                    .shadow(color: .black.opacity(0.20), radius: 5, y: 2)

                VStack(alignment: .leading, spacing: 2) {
                    Text("مونديال 2026")
                        .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    statusLine(f)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 126, alignment: .leading)

            Spacer(minLength: 4)

            HStack(spacing: 7) {
                logo(f.home.logo)
                centerColumn(f)
                logo(f.away.logo)
            }

            Spacer(minLength: 2)

            Image(systemName: "chevron.left")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.9))
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(
            cardGradient
                .overlay(alignment: .topLeading) {
                    // توهّج أخضر فاتح ناعم يضيف عمقًا دون لون دخيل
                    Circle()
                        .fill(WCTheme.leaf.opacity(0.20))
                        .frame(width: 140, height: 140)
                        .blur(radius: 50)
                        .offset(x: -30, y: -50)
                }
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(.white.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: WCTheme.royal.opacity(0.30), radius: 14, x: 0, y: 7)
    }

    private func logo(_ url: String) -> some View {
        WCRemoteImage(url: url)
            .padding(3).frame(width: 32, height: 32)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1))
    }

    /// بطاقة البطل — تحل محل مربع المباراة بعد حسم النهائي. سطر النتيجة
    /// بصيغة «فاز على {الوصيف} W-L» الموحّدة (الفائز أولًا من الخادم).
    private func championCard(_ c: WCChampion) -> some View {
        HStack(spacing: 10) {
            HStack(spacing: 10) {
                Image("WorldCupEmblem")
                    .resizable().scaledToFit()
                    .frame(height: 32)
                    .padding(.horizontal, 6).padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(.white))
                    .shadow(color: .black.opacity(0.20), radius: 5, y: 2)

                VStack(alignment: .leading, spacing: 2) {
                    Text("مونديال 2026")
                        .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    Text("اكتملت البطولة")
                        .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.leaf)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 126, alignment: .leading)

            Spacer(minLength: 4)

            HStack(spacing: 8) {
                ZStack(alignment: .bottomLeading) {
                    WCRemoteImage(url: c.team.logo)
                        .padding(4).frame(width: 40, height: 40)
                        .background(Circle().fill(.white))
                        .overlay(Circle().stroke(WCTheme.gold.opacity(0.8), lineWidth: 1.5))
                    Image(systemName: "trophy.fill")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(WCTheme.gold)
                        .shadow(color: .black.opacity(0.35), radius: 2)
                        .offset(x: -4, y: 3)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("🏆 بطل كأس العالم 2026")
                        .font(SabqFonts.app(size: 10, weight: .medium))
                        .foregroundStyle(WCTheme.gold)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(c.team.name)
                        .font(SabqFonts.app(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.75)
                    if let runnerUp = c.runnerUp, let score = c.score {
                        Text("فاز على \(runnerUp.name) \(score)\(c.penalties.map { " (ركلات الترجيح \($0))" } ?? "")")
                            .font(SabqFonts.app(size: 9, weight: .regular))
                            .foregroundStyle(WCTheme.leaf)
                            .lineLimit(1).minimumScaleFactor(0.65)
                    }
                }
            }

            Spacer(minLength: 2)

            Image(systemName: "chevron.left")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.9))
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(
            cardGradient
                .overlay(alignment: .topLeading) {
                    // توهّج ذهبي احتفالي بدل الأخضر — لحظة التتويج
                    Circle()
                        .fill(WCTheme.gold.opacity(0.22))
                        .frame(width: 140, height: 140)
                        .blur(radius: 50)
                        .offset(x: -30, y: -50)
                }
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(WCTheme.gold.opacity(0.35), lineWidth: 1)
        )
        .shadow(color: WCTheme.royal.opacity(0.30), radius: 14, x: 0, y: 7)
    }

    /// السطر الثاني تحت العنوان: «مباشر» عند البث، أو شعار التغطية.
    @ViewBuilder private func statusLine(_ f: WCFixture) -> some View {
        if f.status.live {
            HStack(spacing: 4) {
                Circle().fill(WCTheme.liveRed).frame(width: 6, height: 6)
                Text("مباشر الآن")
                    .font(SabqFonts.app(size: 9, weight: .medium)).foregroundStyle(.white)
            }
        } else {
            Text("تغطية حية بتوقيت الرياض")
                .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.leaf)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
    }

    @ViewBuilder private func centerColumn(_ f: WCFixture) -> some View {
        if f.started {
            VStack(spacing: 2) {
                // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .font(SabqFonts.app(size: 18, weight: .semibold)).foregroundStyle(.white)
                    .environment(\.layoutDirection, .leftToRight)
                homeLiveStatus(f)
            }
            .frame(minWidth: 82)
        } else {
            VStack(spacing: 2) {
                Text(WCFormat.time(f))
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .fixedSize()
                // عدّاد يتحرّك كل ثانية (TimelineView) كما في الهيرو
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    Text("تنطلق بعد \(WCFormat.countdown(to: f.timestamp))")
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(WCTheme.leaf)
                        .lineLimit(1).fixedSize()
                }
            }
            .frame(minWidth: 82)
        }
    }

    /// شارة مخصصة لبطاقة الرئيسية. لا نستخدم WCStatusPill هنا لأن نص
    /// «الشوط الأول · 4'» طويل على مساحة البطاقة الصغيرة فينكسر كسطرين.
    private func homeLiveStatus(_ f: WCFixture) -> some View {
        let period = f.status.label.isEmpty ? "مباشر" : f.status.label
        let minute = liveMinute(f)

        return HStack(spacing: 5) {
            Text(period)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            if let minute {
                Circle()
                    .fill(.white.opacity(0.85))
                    .frame(width: 3.5, height: 3.5)
                Text(minute)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .font(SabqFonts.app(size: 10, weight: .medium))
        .foregroundStyle(.white)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .frame(minWidth: 78, maxWidth: 94)
        .background(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(WCTheme.liveRed)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(.white.opacity(0.12), lineWidth: 1)
        )
    }

    private func liveMinute(_ f: WCFixture) -> String? {
        guard let elapsed = f.status.elapsed, elapsed > 0 else { return nil }
        let extra = (f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : ""
        return "\(elapsed)\(extra)'"
    }
}
