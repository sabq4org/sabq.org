import SwiftUI

struct LiveCoverageView: View {
    @State private var liveData: APILiveResponse?
    @State private var allEvents: [APILiveEvent] = []
    @State private var isLoading = true
    @State private var selectedCountry: String? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                headerSection

                if isLoading {
                    loadingSection
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
        .navigationBarBackButtonHidden(true)
        .toolbar {
            // `.cancellationAction` — app-wide convention, leading edge
            // (visual right in RTL). Matches Article, Opinion, Settings,
            // and the rest of the navigation surfaces.
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                .buttonStyle(.plain)
            }
            ToolbarItem(placement: .principal) {
                // "لحظة بلحظة" is the brand label the user picked for live
                // coverage on the homepage — surface the same wording here.
                Text("لحظة بلحظة")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
        .task { await loadData() }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                livePulse
                Text(liveData?.titleAr ?? "لحظة بلحظة")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
            }

            if liveData?.isLive == true {
                HStack(spacing: 8) {
                    Circle()
                        .fill(SabqTheme.coral)
                        .frame(width: 8, height: 8)

                    Text("مباشر")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(SabqTheme.coral)

                    if let lastUpdated = liveData?.stats?.lastUpdated {
                        Text("·")
                            .foregroundStyle(SabqTheme.tertiaryInk)
                        Text("آخر تحديث: \(formatRelativeTime(lastUpdated))")
                            .font(.system(size: 12, weight: .medium))
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
                .font(.system(size: 16, weight: .semibold))
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
                    .font(.system(size: 13, weight: isSelected ? .bold : .medium))

                Text("\(count)")
                    .font(.system(size: 11, weight: .bold))
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
                .font(.system(size: 13, weight: .bold))
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
                                .font(.system(size: 6, weight: .bold))
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
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundStyle(SabqTheme.tertiaryInk)

                    if event.priority == "urgent" {
                        Text("عاجل")
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(SabqTheme.coral))
                    }

                    Text(event.eventTypeLabelAr)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(severityColor(event.severity))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule().fill(severityColor(event.severity).opacity(0.12))
                        )

                    if event.isUpdate {
                        Text("تحديث")
                            .font(.system(size: 10, weight: .bold))
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
                        .font(.system(size: 14))
                    Text(event.countryNameAr)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }

                Text(event.content)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.ink)
                    .lineSpacing(5)
                    .lineLimit(nil)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let source = event.sourceName, !source.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "quote.opening")
                            .font(.system(size: 9))
                        Text(source)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)
                }

                if event.isPinned {
                    HStack(spacing: 4) {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 10))
                        Text("مثبت")
                            .font(.system(size: 11, weight: .bold))
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                }

                Button {
                    shareEvent(event)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12))
                        Text("شارك")
                            .font(.system(size: 12, weight: .medium))
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
                .font(.system(size: 14, weight: .medium))
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
            }
        } catch {
            await MainActor.run { isLoading = false }
        }
    }
}

