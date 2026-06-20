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
        .task { await store.loadIfNeeded() }
    }

    private func card(_ f: WCFixture) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("مونديال 2026")
                    .font(SabqFonts.app(size: 15, weight: .black)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Text("تغطية حية بتوقيت الرياض")
                    .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.emerald.opacity(0.8))
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 4)

            HStack(spacing: 8) {
                WCRemoteImage(url: f.home.logo).padding(3).frame(width: 30, height: 30).background(Circle().fill(.white))
                centerColumn(f)
                WCRemoteImage(url: f.away.logo).padding(3).frame(width: 30, height: 30).background(Circle().fill(.white))
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.left").font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(
            LinearGradient(colors: [WCTheme.stadiumTop, WCTheme.stadiumBottom],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(.white.opacity(0.08), lineWidth: 1))
    }

    @ViewBuilder private func centerColumn(_ f: WCFixture) -> some View {
        if f.started {
            VStack(spacing: 1) {
                // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .font(SabqFonts.app(size: 18, weight: .black)).foregroundStyle(.white)
                    .environment(\.layoutDirection, .leftToRight)
                WCStatusPill(fixture: f, onDark: true)
            }
        } else {
            VStack(spacing: 1) {
                Text(WCFormat.time(f))
                    .font(SabqFonts.app(size: 14, weight: .black))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .fixedSize()
                // عدّاد يتحرّك كل ثانية (TimelineView) كما في الهيرو
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    Text("تنطلق بعد \(WCFormat.countdown(to: f.timestamp))")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.emerald.opacity(0.85))
                        .lineLimit(1).fixedSize()
                }
            }
        }
    }
}
