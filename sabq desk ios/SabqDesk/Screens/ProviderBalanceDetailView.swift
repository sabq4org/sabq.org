import Charts
import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// One provider's balance: the figure and how it is worked out, the alert
/// threshold, today's and this month's spend, and 30 days of daily spend.
struct ProviderBalanceDetailView: View {
    @Environment(AppModel.self) private var app
    let provider: String

    @State private var balance: StaffAIBalance?
    @State private var loadError: String?
    @State private var showsUpdate = false
    @State private var showsThreshold = false
    @State private var showsHistory = false

    var body: some View {
        Group {
            if let balance {
                ScrollView {
                    content(balance)
                        .padding(.horizontal, DeskLayout.pageMargin + 4)
                        .padding(.top, DeskLayout.space8)
                }
                .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
                .refreshable { await load() }
            } else if let loadError {
                DeskMessageView(title: "تعذّر جلب الرصيد", message: loadError) {
                    Button("أعد المحاولة") { Task { await load() } }
                        .buttonStyle(DeskPillButtonStyle())
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(DeskTheme.background)
        .navigationTitle(balance?.displayName ?? "")
        // «النظام» hides the bar on its root; pushed screens show it again.
        .toolbar(.visible, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Color.clear.frame(width: 1, height: 1).accessibilityHidden(true)
            }
            if let balance, balance.effectiveKind != .actual {
                ToolbarItem(placement: .primaryAction) {
                    Button { showsHistory = true } label: {
                        Text("سجل الشحنات")
                            .deskText(DeskType.button)
                            .foregroundStyle(DeskInk.link)
                    }
                }
            }
        }
        .task { await load() }
        .sheet(isPresented: $showsUpdate) {
            if let balance {
                UpdateBalanceSheet(balance: balance) { updated in self.balance = updated }
            }
        }
        .sheet(isPresented: $showsThreshold) {
            if let balance {
                AlertLimitsSheet(balances: [balance]) { updated in
                    if let first = updated.first { self.balance = first }
                }
            }
        }
        .sheet(isPresented: $showsHistory) {
            if let balance { TopupHistorySheet(balance: balance) }
        }
    }

    private func content(_ balance: StaffAIBalance) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space24) {
            HStack(alignment: .firstTextBaseline, spacing: DeskLayout.space8) {
                Text(verbatim: balance.displayName)
                    .deskText(DeskType.pageTitle)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                BalanceKindTag(kind: balance.effectiveKind)
                BalanceStateTag(balance: balance)
                Spacer(minLength: 0)
            }
            balanceCard(balance)
            statsRow(balance)
            if let series = balance.series, !series.isEmpty {
                SpendChartSection(balance: balance, series: series)
            }
        }
    }

    // MARK: - Card

    private func balanceCard(_ balance: StaffAIBalance) -> some View {
        let unit = balance.effectiveUnit
        return VStack(alignment: .leading, spacing: DeskLayout.space12) {
            HStack(alignment: .firstTextBaseline) {
                Text(cardTitle(balance))
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textSecondary)
                Spacer(minLength: DeskLayout.space8)
                if let at = balance.fetchedAt {
                    Text("آخر تحديث \(RiyadhTime.timeString(at))")
                        .deskText(DeskType.timestamp)
                        .foregroundStyle(DeskTheme.textTertiary)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: DeskLayout.space8) {
                BalanceFigure(balance: balance, role: DeskType.timelineTime)
                if let source = sourceLine(balance) {
                    Text(source)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let fraction = balance.clampedFraction, balance.effectiveState.hasFigure {
                VStack(spacing: 6) {
                    BalanceBar(fraction: fraction, tone: balance.tone, marker: markerFraction(balance), height: 8)
                    if let total = balance.total, balance.effectiveKind != .budget {
                        HStack {
                            LTRText(text: DeskBalanceCopy.amount(0, unit: unit, whole: true))
                            Spacer()
                            if let low = balance.lowThreshold {
                                Text("الحد \(DeskBalanceCopy.amount(low, unit: unit, whole: true))")
                                    .deskText(DeskType.timestamp)
                                    .foregroundStyle(DeskTheme.textTertiary)
                                Spacer()
                            }
                            LTRText(text: DeskBalanceCopy.amount(total, unit: unit, whole: true))
                        }
                    }
                }
            }
            if let line = DeskBalanceCopy.thresholdLine(balance) {
                HStack(alignment: .firstTextBaseline) {
                    Text(line)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                    Spacer(minLength: DeskLayout.space8)
                    if balance.allowsEditing(app.me?.capabilities) {
                        Button("تعديل") { showsThreshold = true }
                            .deskText(DeskType.metaEmphasis)
                            .foregroundStyle(DeskInk.link)
                            .buttonStyle(.borderless)
                    }
                }
            }
            let note = DeskBalanceCopy.estimationNote(balance)
            if !note.isEmpty {
                Text(note)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(DeskLayout.space12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(DeskInk.chip, in: RoundedRectangle(cornerRadius: DeskRadius.medium, style: .continuous))
            }
            if let error = balance.error, !error.isEmpty {
                ErrorLine(message: error)
            }
            if balance.allowsBalanceUpdate(app.me?.capabilities) {
                Button(balance.effectiveKind == .budget ? "تعديل الميزانية" : "تحديث الرصيد") { showsUpdate = true }
                    .buttonStyle(DeskBigButtonStyle())
                    .padding(.top, DeskLayout.space4)
            }
        }
        .padding(DeskLayout.cardInset)
        .modifier(DeskOutlinedGroup())
    }

    private func cardTitle(_ balance: StaffAIBalance) -> String {
        switch balance.effectiveKind {
        case .actual: return balance.effectiveUnit == .characters ? "الأحرف المتبقية" : "الرصيد الفعلي"
        case .estimated: return "الرصيد التقديري"
        case .budget: return "المتبقي من الميزانية"
        case .unknown: return "الرصيد"
        }
    }

    /// «من شحنة $500 في 2 أكتوبر», «من ميزانية $120», «من 500K · يتجدد 3 نوفمبر».
    private func sourceLine(_ balance: StaffAIBalance) -> String? {
        let unit = balance.effectiveUnit
        switch balance.effectiveKind {
        case .estimated:
            guard let baseline = balance.baseline else { return nil }
            var text = "من شحنة \(DeskBalanceCopy.amount(baseline.amount, unit: unit, whole: true))"
            if let at = baseline.at { text += " في \(DeskBalanceCopy.dayMonth(at))" }
            return text
        case .budget:
            return balance.total.map { "من ميزانية \(DeskBalanceCopy.amount($0, unit: unit, whole: true))" }
        case .actual where unit == .characters:
            let detail = DeskBalanceCopy.rowDetail(balance)
            return detail.isEmpty ? nil : detail
        case .actual, .unknown:
            return nil
        }
    }

    /// Where the alert threshold sits on the bar (only when the bar has a known end).
    private func markerFraction(_ balance: StaffAIBalance) -> Double? {
        guard balance.effectiveKind != .budget, let total = balance.total, total > 0,
              let low = balance.lowThreshold, low < total else { return nil }
        return low / total
    }

    // MARK: - Stats

    private func statsRow(_ balance: StaffAIBalance) -> some View {
        let spendUnit = balance.spendUnit ?? balance.effectiveUnit
        var cells: [(String, String)] = []
        cells.append(("صرف اليوم", balance.todaySpend.map { DeskBalanceCopy.amount($0, unit: spendUnit) } ?? "—"))
        cells.append(("صرف الشهر", balance.monthSpend.map { DeskBalanceCopy.amount($0, unit: spendUnit) } ?? "—"))
        if balance.effectiveKind == .budget {
            cells.append(("المتبقي", balance.remaining.map { DeskBalanceCopy.amount($0, unit: .usd) } ?? "—"))
        } else {
            cells.append(("يكفي بمعدل الصرف الأخير", balance.daysLeft.map { "نحو \(DeskBalanceCopy.days($0))" } ?? "—"))
        }
        return HStack(spacing: 0) {
            ForEach(Array(cells.enumerated()), id: \.offset) { index, cell in
                // Concept: centred 16pt semibold figure over an 11pt grey label.
                VStack(spacing: 2) {
                    Text(verbatim: cell.1)
                        .deskText(DeskTextRole(size: 16, weight: .semibold, style: .headline, lineSpacing: 0))
                        .foregroundStyle(DeskTheme.textPrimary)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(cell.0)
                        .deskText(DeskType.timestamp)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, DeskLayout.space8)
                .padding(.vertical, 10)
                .accessibilityElement(children: .combine)
                if index < cells.count - 1 {
                    Rectangle().fill(DeskTheme.hairline).frame(width: 1)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .modifier(DeskOutlinedGroup())
    }

    // MARK: - Data

    private func load() async {
        do {
            balance = try await app.client.systemBalance(provider: provider)
            loadError = nil
            #if DEBUG
            if DeskScreenshotScene.current == .update { showsUpdate = true }
            #endif
        } catch {
            guard !Task.isCancelled else { return }
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}

/// «الصرف اليومي · آخر 30 يومًا»: light-blue bars, today in dark blue, a
/// dashed line at the recent daily average and a green rule on the top-up day.
private struct SpendChartSection: View {
    let balance: StaffAIBalance
    let series: [StaffBalancePoint]

    /// Secondary chart blue from the concept (bars other than today).
    private static let barBlue = Color(red: 0xBB / 255, green: 0xD7 / 255, blue: 0xEA / 255)

    private struct ChartDay: Identifiable {
        let day: Date
        let value: Double
        let isToday: Bool
        var id: Date { day }
    }

    private var points: [ChartDay] {
        let days = series.compactMap { point in point.day.map { ($0, point.value) } }
        return days.enumerated().map { index, item in
            ChartDay(day: item.0, value: item.1, isToday: index == days.count - 1)
        }
    }

    private var unit: StaffBalanceUnit { balance.spendUnit ?? balance.effectiveUnit }

    /// Average of the last seven full days (today is still running).
    private var average: Double? {
        let full = points.dropLast().suffix(7).map(\.value)
        guard !full.isEmpty else { return nil }
        let avg = full.reduce(0, +) / Double(full.count)
        return avg > 0 ? avg : nil
    }

    private var topupDay: Date? {
        guard balance.effectiveKind == .estimated, let at = balance.baseline?.at,
              let first = points.first?.day, at >= first.addingTimeInterval(-86_400) else { return nil }
        return at
    }

    private var axisDays: [Date] {
        guard points.count > 1 else { return points.map(\.day) }
        let last = points.count - 1
        return Array(Set([0, last / 3, (2 * last) / 3, last])).sorted().map { points[$0].day }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            DeskSectionHeader(title: unit == .characters
                              ? "الأحرف المستهلكة يوميًا · آخر 30 يومًا"
                              : "الصرف اليومي · آخر 30 يومًا")
            VStack(alignment: .leading, spacing: DeskLayout.space12) {
                legend
                Chart {
                    ForEach(points) { point in
                        BarMark(x: .value("اليوم", point.day, unit: .day),
                                y: .value("الصرف", point.value))
                            .foregroundStyle(point.isToday ? DeskTheme.link : Self.barBlue)
                            .cornerRadius(2)
                    }
                    if let average {
                        RuleMark(y: .value("المعدل", average))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                            .foregroundStyle(DeskTheme.textTertiary)
                    }
                    if let topupDay {
                        RuleMark(x: .value("الشحنة", topupDay, unit: .day))
                            .lineStyle(StrokeStyle(lineWidth: 1.5))
                            .foregroundStyle(DeskTheme.success)
                    }
                }
                .chartYAxis(.hidden)
                .chartXAxis {
                    AxisMarks(values: axisDays) { value in
                        AxisValueLabel {
                            if let day = value.as(Date.self) {
                                Text(label(for: day))
                                    .deskText(DeskType.timestamp)
                                    .foregroundStyle(DeskTheme.textTertiary)
                            }
                        }
                    }
                }
                .frame(height: 150)
                // Day bins in Riyadh time, like the server's series.
                .environment(\.calendar, RiyadhTime.calendar)
                .environment(\.timeZone, RiyadhTime.timeZone)
                .accessibilityLabel(accessibilitySummary)
            }
            .padding(DeskLayout.cardInset)
            .modifier(DeskOutlinedGroup())
        }
    }

    private var legend: some View {
        HStack(spacing: DeskLayout.space12) {
            legendItem(color: DeskTheme.link, title: "اليوم")
            if let topupDay, let amount = balance.baseline?.amount {
                legendItem(color: DeskTheme.success,
                           title: "شحنة \(DeskBalanceCopy.amount(amount, unit: .usd, whole: true)) · \(DeskBalanceCopy.dayMonth(topupDay))")
            }
            Spacer(minLength: 0)
            if let average {
                Text("--- \(DeskBalanceCopy.amount(average, unit: unit, whole: unit != .characters))/يوم")
                    .deskText(DeskType.timestamp)
                    .foregroundStyle(DeskTheme.textTertiary)
            }
        }
    }

    private func legendItem(color: Color, title: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 8, height: 8)
            Text(title)
                .deskText(DeskType.timestamp)
                .foregroundStyle(DeskTheme.textSecondary)
        }
    }

    private func label(for day: Date) -> String {
        if let last = points.last?.day, RiyadhTime.calendar.isDate(day, inSameDayAs: last) { return "اليوم" }
        return DeskBalanceCopy.dayMonth(day)
    }

    private var accessibilitySummary: String {
        var parts = ["الصرف اليومي آخر 30 يومًا"]
        if let today = points.last?.value { parts.append("اليوم \(DeskBalanceCopy.amount(today, unit: unit))") }
        if let average { parts.append("المعدل \(DeskBalanceCopy.amount(average, unit: unit)) في اليوم") }
        return parts.joined(separator: "، ")
    }
}

/// «سجل الشحنات»: what was entered, when, by whom and the balance after.
struct TopupHistorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let balance: StaffAIBalance

    private var records: [StaffBalanceTopupRecord] { balance.topups ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DeskLayout.space16) {
                    if records.isEmpty {
                        DeskEmptyState(title: "لا شحنات بعد",
                                       message: "يظهر هنا كل رصيد أو ميزانية تحفظها لـ \(balance.displayName).")
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(records.enumerated()), id: \.element.id) { index, record in
                                row(record)
                                if index < records.count - 1 {
                                    Rectangle().fill(DeskTheme.hairline).frame(height: 1)
                                }
                            }
                        }
                        .modifier(DeskOutlinedGroup())
                    }
                }
                .padding(.horizontal, DeskLayout.pageMargin + 4)
                .padding(.vertical, DeskLayout.space16)
            }
            .background(DeskTheme.background)
            .navigationTitle("سجل الشحنات · \(balance.displayName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إغلاق") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func row(_ record: StaffBalanceTopupRecord) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(modeTitle(record.mode))
                    .deskText(DeskType.rowTitle)
                    .foregroundStyle(DeskTheme.textPrimary)
                Spacer(minLength: DeskLayout.space8)
                LTRText(text: DeskBalanceCopy.amount(record.amountUsd, unit: .usd),
                        role: DeskType.metaEmphasis, color: DeskTheme.textPrimary)
            }
            Text(detail(record))
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(DeskLayout.cardInset)
        .accessibilityElement(children: .combine)
    }

    private func modeTitle(_ mode: StaffBalanceTopupMode?) -> String {
        switch mode {
        case .add?: return "شحنة جديدة"
        case .set?: return "الرصيد من اللوحة"
        case .budget?: return "ميزانية شهرية"
        default: return "تحديث"
        }
    }

    private func detail(_ record: StaffBalanceTopupRecord) -> String {
        var parts: [String] = []
        if let at = record.topupAt ?? record.savedAt { parts.append(RiyadhTime.displayString(at)) }
        if let name = record.byName, !name.isEmpty { parts.append(name) }
        if let after = record.balanceAfterUsd { parts.append("الرصيد بعدها \(DeskBalanceCopy.amount(after, unit: .usd))") }
        return parts.joined(separator: " · ")
    }
}

#if DEBUG
#Preview("رصيد OpenAI") {
    NavigationStack {
        ProviderBalanceDetailView(provider: "openai")
    }
    .deskPreviewEnvironment()
}

#Preview("رصيد DeepSeek") {
    NavigationStack {
        ProviderBalanceDetailView(provider: "deepseek")
    }
    .deskPreviewEnvironment()
}
#endif
