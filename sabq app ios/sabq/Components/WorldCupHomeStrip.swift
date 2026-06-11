import SwiftUI

// MARK: - شريط المونديال في الواجهة الرئيسية
//
// بطاقة بثيم الملعب الليلي تعرض مباراة اليوم (نتيجة حية أو عدّ تنازلي) مع
// رابط لقسم كأس العالم الكامل. تختفي كليًا عند غياب البيانات — صفر أثر.

struct WorldCupHomeStrip: View {
    @State private var overview: WCOverview?
    @State private var loaded = false

    var body: some View {
        // حامل مكان Color.clear يمنع SwiftUI من إلغاء العرض (وبالتالي .task)
        // عندما لا تكون البيانات قد وصلت بعد — فخ Group+EmptyView المعروف.
        ZStack {
            Color.clear.frame(width: 0, height: 0)
            if let f = overview?.matchOfTheDay?.fixture {
                NavigationLink(value: WorldCupRoute()) {
                    card(f)
                }
                .buttonStyle(.plain)
            }
        }
        .task {
            guard !loaded else { return }
            loaded = true
            overview = try? await APIClient.shared.fetchWorldCupOverview()
        }
    }

    private func card(_ f: WCFixture) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("مونديال 2026")
                    .font(.system(size: 16, weight: .black)).foregroundStyle(.white)
                Text("تغطية حية بتوقيت الرياض")
                    .font(.system(size: 11)).foregroundStyle(WCTheme.emerald.opacity(0.8))
            }

            Spacer(minLength: 4)

            HStack(spacing: 8) {
                WCRemoteImage(url: f.home.logo).padding(3).frame(width: 30, height: 30).background(Circle().fill(.white))
                centerColumn(f)
                WCRemoteImage(url: f.away.logo).padding(3).frame(width: 30, height: 30).background(Circle().fill(.white))
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.left").font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
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
                Text("\(f.goals.home ?? 0) - \(f.goals.away ?? 0)")
                    .font(.system(size: 18, weight: .black, design: .rounded)).foregroundStyle(.white)
                    .environment(\.layoutDirection, .leftToRight)
                WCStatusPill(fixture: f, onDark: true)
            }
        } else {
            VStack(spacing: 1) {
                Text(WCFormat.time(f))
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .fixedSize()
                Text("تنطلق بعد \(WCFormat.countdown(to: f.timestamp))")
                    .font(.system(size: 10)).foregroundStyle(WCTheme.emerald.opacity(0.85))
                    .lineLimit(1).fixedSize()
            }
        }
    }
}
