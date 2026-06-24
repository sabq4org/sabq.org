import SwiftUI

// المباشر — لوحة شاملة لكل مباريات الأندية السعودية المباشرة الآن عبر كل
// البطولات في نداء واحد. تتحدّث تلقائيًا كل 30 ثانية أثناء العرض.
struct LiveView: View {
    @State private var live: [SpFixture] = []
    @State private var loading = true
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if loading {
                        SpLoading()
                    } else if let loadError {
                        SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                    } else if live.isEmpty {
                        SpEmptyState(icon: "dot.radiowaves.left.and.right",
                                     title: "لا مباريات مباشرة الآن",
                                     subtitle: "ستظهر هنا كل المباريات الجارية فور انطلاقها")
                    } else {
                        SpSectionHeader(icon: "dot.radiowaves.left.and.right", title: "المباشر الآن",
                                        count: live.count, tint: SpTheme.crimson)
                        ForEach(live) { f in SpMatchCard(fixture: f, showsCompetition: true) }
                    }
                }
                .padding(16)
            }
            .background(SpAmbientBackground())
            .navigationTitle("المباشر")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private func load(force: Bool = false) async {
        if !force { loading = true }
        do {
            self.live = try await APIClient.shared.fetchLive(ignoreCache: force).live
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
        self.loading = false
    }
}
