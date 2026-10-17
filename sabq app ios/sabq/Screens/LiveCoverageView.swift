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
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                headerSection

                if isLoading {
                    loadingSection
                } else if liveData == nil, loadFailed {
                    // فشل الجلب الأول كان يترك الشاشة بيضاء بلا تفسير ولا زر —
                    // السحب للتحديث ليس مسارًا مكتشفًا لصفحة فارغة.
                    EmptyStateView(
                        icon: "wifi.exclamationmark",
                        tint: SabqTheme.danger,
                        title: "تعذر تحميل التغطية",
                        subtitle: "تحقق من اتصالك بالإنترنت ثم أعد المحاولة",
                        action: {
                            isLoading = true
                            Task { await loadData() }
                        },
                        actionTitle: "إعادة المحاولة"
                    )
                    .padding(.top, SabqLayout.space40)
                } else if let data = liveData {
                    if !data.isLive {
                        EmptyStateView(
                            icon: "antenna.radiowaves.left.and.right.slash",
                            tint: SabqTheme.textTertiary,
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
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
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
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                livePulse
                Text(liveData?.titleAr ?? "لحظة بلحظة")
                    .font(SabqType.leadTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }

            if liveData?.isLive == true {
                HStack(spacing: SabqLayout.space8) {
                    Circle()
                        .fill(SabqTheme.breaking)
                        .frame(width: 8, height: 8)

                    Text("مباشر")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.breaking)

                    if let lastUpdated = liveData?.stats?.lastUpdated {
                        Text("·")
                            .foregroundStyle(SabqTheme.textTertiary)
                        Text("آخر تحديث: \(formatRelativeTime(lastUpdated))")
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                    }
                }
            }
        }
    }

    private var livePulse: some View {
        Image(systemName: "antenna.radiowaves.left.and.right")
            .font(SabqFonts.app(size: 18, weight: .semibold))
            .foregroundStyle(SabqTheme.breaking)
            .accessibilityHidden(true)
    }

    // MARK: - Country Filter

    private func countryFilter(_ countries: [APILiveCountry]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
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
            HStack(spacing: SabqLayout.space8) {
                Text(label)
                    .font(SabqType.metaEmphasis.font)

                Text("\(count)")
                    .font(SabqType.tag.font)
                    .monospacedDigit()
            }
            .foregroundStyle(isSelected ? SabqTheme.onAction : SabqTheme.textPrimary)
            .padding(.horizontal, SabqLayout.space16)
            .frame(minHeight: 36)
            .background(
                Capsule().fill(isSelected ? SabqTheme.actionFill : SabqTheme.surfaceMuted)
            )
            .frame(minHeight: SabqLayout.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
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
        HStack(spacing: SabqLayout.space8) {
            Rectangle()
                .fill(SabqTheme.separator)
                .frame(height: 1)
            Text(formatDateHeader(dateString))
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize()
            Rectangle()
                .fill(SabqTheme.separator)
                .frame(height: 1)
        }
        .padding(.vertical, SabqLayout.space12)
    }

    private func eventCard(_ event: APILiveEvent) -> some View {
        // حدث على الصفحة مباشرة بلا بطاقة: نقطة وخط زمني، ثم المحتوى.
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(spacing: 0) {
                Circle()
                    .fill(event.priority == "urgent" ? SabqTheme.breaking : severityColor(event.severity))
                    .frame(width: 10, height: 10)
                    .padding(.top, SabqLayout.space4)

                Rectangle()
                    .fill(SabqTheme.separator)
                    .frame(width: 2)
                    .frame(minHeight: 40)
            }

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                FlowLayout(spacing: SabqLayout.space8) {
                    Text(formatEventTime(event.publishedAt))
                        .font(SabqType.meta.font)
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.textTertiary)

                    if event.priority == "urgent" {
                        Text("عاجل")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.breaking)
                    }

                    StatusChip(title: event.eventTypeLabelAr, tint: severityColor(event.severity))

                    if event.isUpdate {
                        StatusChip(title: "تحديث", tint: SabqTheme.primary)
                    }
                }

                HStack(spacing: SabqLayout.space4) {
                    Text(countryFlag(event.country))
                        .font(SabqType.meta.font)
                    Text(event.countryNameAr)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }

                Text(event.content)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(nil)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let source = event.sourceName, !source.isEmpty {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: "quote.opening")
                            .font(SabqType.tag.font)
                        Text(source)
                            .font(SabqType.meta.font)
                    }
                    .foregroundStyle(SabqTheme.textTertiary)
                }

                if event.isPinned {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: "pin.fill")
                            .font(SabqType.tag.font)
                        Text("مثبت")
                            .font(SabqType.tag.font)
                    }
                    .foregroundStyle(SabqTheme.primary)
                }

                Button {
                    shareEvent(event)
                } label: {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: "square.and.arrow.up")
                            .font(SabqType.meta.font)
                        Text("شارك")
                            .font(SabqType.metaEmphasis.font)
                    }
                    .foregroundStyle(SabqTheme.primary)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, SabqLayout.space12)
        }
    }

    // MARK: - Loading

    private var loadingSection: some View {
        VStack(spacing: SabqLayout.space16) {
            ProgressView()
                .tint(SabqTheme.primary)
            Text("جاري تحميل البث الحي...")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space40)
    }

    // MARK: - Helpers

    private func severityColor(_ severity: String) -> Color {
        switch severity {
        case "success":  return SabqTheme.success
        case "info":     return SabqTheme.primary
        case "warning":  return SabqTheme.warning
        case "danger":   return SabqTheme.danger
        case "critical": return SabqTheme.danger
        default:         return SabqTheme.textTertiary
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

