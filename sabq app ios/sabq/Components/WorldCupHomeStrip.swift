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
}

// MARK: - شريط المونديال في الواجهة الرئيسية
//
// بطاقة بثيم الملعب الليلي تعرض مباراة اليوم (نتيجة حية أو عدّ تنازلي) مع
// رابط لقسم كأس العالم الكامل. تختفي كليًا عند غياب البيانات — صفر أثر.

struct WorldCupHomeStrip: View {
    private let store = WorldCupHomeStore.shared

    var body: some View {
        // حامل مكان Color.clear يمنع SwiftUI من إلغاء العرض (وبالتالي .task)
        // عندما لا تكون البيانات قد وصلت بعد — فخ Group+EmptyView المعروف.
        ZStack {
            Color.clear.frame(width: 0, height: 0)
            if let f = store.overview?.matchOfTheDay?.fixture {
                NavigationLink(value: WorldCupRoute()) {
                    card(f)
                }
                .buttonStyle(.plain)
            }
        }
        .task {
            // تحميل أولي ثم استطلاع لحظي أثناء جريان مباراة اليوم — تتحدّث
            // النتيجة/الدقيقة على الواجهة دون مغادرة الصفحة (كما في الويب).
            await store.loadIfNeeded()
            while !Task.isCancelled {
                guard store.matchOfTheDayLive else { return }
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                if Task.isCancelled { return }
                await store.refreshLive()
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
        HStack(spacing: 12) {
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
                        .font(SabqFonts.app(size: 15, weight: .black)).foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    statusLine(f)
                }
                .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 6)

            HStack(spacing: 8) {
                logo(f.home.logo)
                centerColumn(f)
                logo(f.away.logo)
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.left")
                .font(SabqFonts.app(size: 13, weight: .bold))
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

    /// السطر الثاني تحت العنوان: «مباشر» عند البث، أو شعار التغطية.
    @ViewBuilder private func statusLine(_ f: WCFixture) -> some View {
        if f.status.live {
            HStack(spacing: 4) {
                Circle().fill(WCTheme.liveRed).frame(width: 6, height: 6)
                Text("مباشر الآن")
                    .font(SabqFonts.app(size: 9, weight: .bold)).foregroundStyle(.white)
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
                    .font(SabqFonts.app(size: 19, weight: .black)).foregroundStyle(.white)
                    .environment(\.layoutDirection, .leftToRight)
                WCStatusPill(fixture: f, onDark: true)
            }
        } else {
            VStack(spacing: 2) {
                Text(WCFormat.time(f))
                    .font(SabqFonts.app(size: 14, weight: .black))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .fixedSize()
                // عدّاد يتحرّك كل ثانية (TimelineView) كما في الهيرو
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    Text("تنطلق بعد \(WCFormat.countdown(to: f.timestamp))")
                        .font(SabqFonts.app(size: 10, weight: .semibold))
                        .foregroundStyle(WCTheme.leaf)
                        .lineLimit(1).fixedSize()
                }
            }
        }
    }
}
