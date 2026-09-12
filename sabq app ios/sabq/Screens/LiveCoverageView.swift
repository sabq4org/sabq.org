import SwiftUI

struct LiveCoverageView: View {
    @State private var liveData: APILiveResponse?
    @State private var allEvents: [APILiveEvent] = []
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var selectedCountry: String? = nil
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                headerSection

                if isLoading {
                    loadingSection
                } else if liveData == nil, loadFailed {
                    // فشل الجلب الأول كان يترك الشاشة بيضاء بلا تفسير ولا زر —
                    // السحب للتحديث ليس مسارًا مكتشفًا لصفحة فارغة.
                    EmptyStateView(
                        icon: "wifi.exclamationmark",
                        tint: SabqTheme.coral,
                        title: "تعذر تحميل التغطية",
                        subtitle: "تحقق من اتصالك بالإنترنت ثم أعد المحاولة",
                        action: {
                            isLoading = true
                            Task { await loadData() }
                        },
                        actionTitle: "إعادة المحاولة"
                    )
                    .padding(.top, 60)
                } else if let data = liveData {
                    if !data.isLive {
                        EmptyStateView(
                            icon: "antenna.radiowaves.left.and.right.slash",
                            tint: SabqTheme.tertiaryInk,
                            title: "لا يوجد بث حي حالياً",
                            subtitle: "تابعنا لاحقاً للتغطيات المباشرة"
                        )
                    } else {
                        if !data.countries.isEmpty {
                            countryFilter(data.countries)
                        }

                        timelineSection(data)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable { await loadData() }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("لحظة بلحظة")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
        // «لحظة بلحظة» كانت ثابتة تمامًا رغم شارة «مباشر» النابضة — لا تلتقط
        // أي حدث جديد إلا بسحب يدوي. استطلاع كل 30ث أثناء البث الحي فقط
        // (بلا شبكة وهو خامل أو بالخلفية)، مع تحديث فوري عند العودة للمقدمة.
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                if Task.isCancelled { break }
                guard liveData?.isLive == true else { continue }
                await loadData()
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                livePulse
                Text(liveData?.titleAr ?? "لحظة بلحظة")
                    .font(SabqFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }

            if liveData?.isLive == true {
                HStack(spacing: 8) {
                    Circle()
                        .fill(SabqTheme.coral)
                        .frame(width: 8, height: 8)

                    Text("مباشر")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.coral)

                    if let lastUpdated = liveData?.stats?.lastUpdated {
                        Text("·")
                            .foregroundStyle(SabqTheme.tertiaryInk)
                        Text("آخر تحديث: \(formatRelativeTime(lastUpdated))")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
        }
    }

    private var livePulse: some View {
        ZStack {
            Circle()
                .fill(SabqTheme.coral.opacity(0.2))
                .frame(width: 32, height: 32)

            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(SabqTheme.coral)
        }
    }

    // MARK: - Country Filter

    private func countryFilter(_ countries: [APILiveCountry]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterPill(label: "الكل", count: liveData?.total ?? 0, isSelected: selectedCountry == nil) {
                    withAnimation(.spring(response: 0.3)) { selectedCountry = nil }
                }

                ForEach(countries) { country in
                    filterPill(
                        label: country.nameAr,
                        count: country.count,
                        isSelected: selectedCountry == country.key
                    ) {
                        withAnimation(.spring(response: 0.3)) {
                            selectedCountry = country.key
                        }
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func filterPill(label: String, count: Int, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(label)
                    .font(SabqFonts.app(size: 13, weight: isSelected ? .bold : .medium))

                Text("\(count)")
                    .font(SabqFonts.app(size: 10, weight: .regular))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(isSelected ? Color.white.opacity(0.25) : SabqTheme.outline)
                    )
            }
            .foregroundStyle(isSelected ? .white : SabqTheme.ink)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(
                Capsule().fill(isSelected ? SabqTheme.primaryEnd : SabqTheme.paleFill)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Timeline

    private func timelineSection(_ data: APILiveResponse) -> some View {
        let filteredEvents: [APILiveEvent]
        if let country = selectedCountry {
            filteredEvents = allEvents.filter { $0.country == country }
        } else {
            filteredEvents = allEvents
        }

        let grouped = groupEventsByDate(filteredEvents)

        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(grouped.enumerated()), id: \.element.date) { _, group in
                dateHeader(group.date)

                ForEach(group.events) { event in
                    eventCard(event)
                }
            }

            
        }
    }

    private func dateHeader(_ dateString: String) -> some View {
        HStack {
            Rectangle()
                .fill(SabqTheme.outline)
                .frame(height: 0.5)
            Text(formatDateHeader(dateString))
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .fixedSize()
            Rectangle()
                .fill(SabqTheme.outline)
                .frame(height: 0.5)
        }
        .padding(.vertical, 12)
    }

    private func eventCard(_ event: APILiveEvent) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Circle()
                    .fill(event.priority == "urgent" ? SabqTheme.coral : severityColor(event.severity))
                    .frame(width: 12, height: 12)
                    .overlay {
                        if event.priority == "urgent" {
                            Image(systemName: "bolt.fill")
                                .font(SabqFonts.app(size: 6, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }

                Rectangle()
                    .fill(SabqTheme.outline)
                    .frame(width: 1.5)
                    .frame(minHeight: 40)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(formatEventTime(event.publishedAt))
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)

                    if event.priority == "urgent" {
                        Text("عاجل")
                            .font(SabqFonts.app(size: 10, weight: .regular))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(SabqTheme.coral))
                    }

                    Text(event.eventTypeLabelAr)
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(severityColor(event.severity))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule().fill(severityColor(event.severity).opacity(0.12))
                        )

                    if event.isUpdate {
                        Text("تحديث")
                            .font(SabqFonts.app(size: 10, weight: .regular))
                            .foregroundStyle(SabqTheme.primaryEnd)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule().fill(SabqTheme.primaryEnd.opacity(0.1))
                            )
                    }
                }

                HStack(spacing: 6) {
                    Text(countryFlag(event.country))
                        .font(SabqFonts.app(size: 14))
                    Text(event.countryNameAr)
                        .font(SabqFonts.app(size: 11, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }

                Text(event.content)
                    .font(SabqFonts.app(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.ink)
                    .lineSpacing(5)
                    .lineLimit(nil)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let source = event.sourceName, !source.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "quote.opening")
                            .font(SabqFonts.app(size: 9))
                        Text(source)
                            .font(SabqFonts.app(size: 10, weight: .regular))
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)
                }

                if event.isPinned {
                    HStack(spacing: 4) {
                        Image(systemName: "pin.fill")
                            .font(SabqFonts.app(size: 10))
                        Text("مثبت")
                            .font(SabqFonts.app(size: 10, weight: .regular))
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                }

                Button {
                    shareEvent(event)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "square.and.arrow.up")
                            .font(SabqFonts.app(size: 12))
                        Text("شارك")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.secondaryInk)
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(event.priority == "urgent" ? SabqTheme.coral.opacity(0.04) : SabqTheme.paleFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(event.priority == "urgent" ? SabqTheme.coral.opacity(0.2) : Color.clear, lineWidth: 1)
            )
        }
        .padding(.bottom, 4)
    }

    // MARK: - Loading

    private var loadingSection: some View {
        VStack(spacing: 20) {
            ProgressView()
                .tint(SabqTheme.primaryEnd)
                .scaleEffect(1.2)
            Text("جاري تحميل البث الحي...")
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Helpers

    private func severityColor(_ severity: String) -> Color {
        switch severity {
        case "success":  return Color(red: 0.13, green: 0.77, blue: 0.37)
        case "info":     return Color(red: 0.23, green: 0.51, blue: 0.96)
        case "warning":  return Color(red: 0.92, green: 0.70, blue: 0.03)
        case "danger":   return Color(red: 0.98, green: 0.45, blue: 0.09)
        case "critical": return Color(red: 0.86, green: 0.15, blue: 0.15)
        default:         return SabqTheme.tertiaryInk
        }
    }

    private func countryFlag(_ key: String) -> String {
        switch key {
        case "saudi_arabia": return "🇸🇦"
        case "uae":          return "🇦🇪"
        case "bahrain":      return "🇧🇭"
        case "kuwait":       return "🇰🇼"
        case "qatar":        return "🇶🇦"
        case "oman":         return "🇴🇲"
        case "yemen":        return "🇾🇪"
        default:             return "🏳️"
        }
    }

    private func formatEventTime(_ isoString: String) -> String {
        guard let date = SabqFormatters.parseISO8601(isoString) else { return "" }
        return SabqFormatters.riyadhTime.string(from: date)
    }

    private func formatDateHeader(_ dateString: String) -> String {
        guard let date = SabqFormatters.dayFormatter.date(from: dateString) else { return dateString }
        return SabqFormatters.arabicFullDate.string(from: date)
    }

    private func formatRelativeTime(_ isoString: String) -> String {
        guard let date = SabqFormatters.parseISO8601(isoString) else { return "" }
        let diff = Date().timeIntervalSince(date)
        if diff < 60 { return "الآن" }
        if diff < 3600 { return "قبل \(Int(diff / 60)) د" }
        if diff < 86400 { return "قبل \(Int(diff / 3600)) س" }
        return "قبل \(Int(diff / 86400)) ي"
    }

    private struct DateGroup: Identifiable {
        var id: String { date }
        let date: String
        let events: [APILiveEvent]
    }

    private func groupEventsByDate(_ events: [APILiveEvent]) -> [DateGroup] {
        var groups: [String: [APILiveEvent]] = [:]
        var order: [String] = []

        for event in events {
            let dateKey: String
            if let date = SabqFormatters.parseISO8601(event.publishedAt) {
                dateKey = SabqFormatters.dayFormatter.string(from: date)
            } else {
                dateKey = "unknown"
            }

            if groups[dateKey] == nil {
                order.append(dateKey)
            }
            groups[dateKey, default: []].append(event)
        }

        return order.map { DateGroup(date: $0, events: groups[$0] ?? []) }
    }

    private func shareEvent(_ event: APILiveEvent) {
        let text = """
        \(countryFlag(event.country)) \(event.countryNameAr) | \(event.eventTypeLabelAr)
        \(event.content)

        المصدر: صحيفة سبق
        """
        let av = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first,
              let root = scene.windows.first?.rootViewController else { return }
        if let popover = av.popoverPresentationController {
            popover.sourceView = root.view
            popover.sourceRect = CGRect(x: root.view.bounds.midX, y: root.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        root.present(av, animated: true)
    }

    // MARK: - Data

    private func loadData() async {
        do {
            let response = try await APIClient.shared.fetchLive(country: selectedCountry)
            await MainActor.run {
                liveData = response
                allEvents = response.events
                isLoading = false
                loadFailed = false
            }
        } catch {
            await MainActor.run {
                isLoading = false
                loadFailed = true
            }
        }
    }
}

