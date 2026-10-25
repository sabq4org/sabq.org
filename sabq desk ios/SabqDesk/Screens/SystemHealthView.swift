import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «حالة النظام»: the AI models behind the newsroom tools, their last
/// errors, and the monthly budgets, with the switch for instant AI alerts.
struct SystemHealthView: View {
    @Environment(AppModel.self) private var app

    @State private var health: StaffSystemHealth?
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DeskLayout.space24) {
                DeskScreenHeader(title: "حالة النظام", subtitle: subtitle)
                if let loadError {
                    ErrorLine(message: loadError)
                }
                if let health {
                    summaryCard(health)
                    modelsSection(health.models ?? [])
                    budgetsSection(health.budgets ?? [])
                } else if loadError == nil {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .padding(.vertical, DeskLayout.space32)
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            .padding(.top, DeskLayout.space8)
        }
        .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
        .background(DeskTheme.background)
        .refreshable { await load() }
        .task {
            await load()
            await app.loadAlertPrefsIfNeeded()
        }
    }

    /// «آخر فحص 18:13» in Riyadh time.
    private var subtitle: String {
        guard let health else { return "جارٍ الفحص…" }
        guard let checked = health.lastCheckAt ?? health.generatedAt else { return "لم يُسجَّل فحص بعد" }
        return "آخر فحص \(RiyadhTime.timeString(checked))"
    }

    // MARK: - Summary

    private func summaryCard(_ health: StaffSystemHealth) -> some View {
        let status = health.summary?.status ?? .unknown
        let tone = status.tone
        let alertsOn = app.alertPrefs?.aiAlerts ?? health.aiAlertsEnabled ?? true
        let shape = RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous)
        return HStack(alignment: .top, spacing: DeskLayout.space12) {
            DeskMascot(size: 52)
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                Text(health.summary?.title ?? status.fallbackTitle)
                    .deskText(DeskType.sectionHeading)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = health.summary?.detail, !detail.isEmpty {
                    Text(detail)
                        .deskText(DeskType.excerpt)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: DeskLayout.space8) {
                    Circle()
                        .fill(alertsOn ? DeskTheme.success : DeskTheme.warning)
                        .frame(width: 7, height: 7)
                        .accessibilityHidden(true)
                    Text(alertsOn ? "التنبيهات الفورية مفعّلة" : "التنبيهات الفورية متوقفة")
                        .deskText(DeskType.metaEmphasis)
                        .foregroundStyle(alertsOn ? DeskTheme.success : DeskTheme.warning)
                    Spacer(minLength: DeskLayout.space8)
                    if app.capabilities.canSystemHealth {
                        Toggle("التنبيهات الفورية", isOn: aiAlertsBinding(current: alertsOn))
                            .labelsHidden()
                            .tint(DeskInk.action)
                    }
                }
                .padding(.top, DeskLayout.space4)
                if let error = app.alertPrefsError {
                    ErrorLine(message: error)
                }
            }
        }
        .padding(DeskLayout.cardInset)
        .background(tone.fill, in: shape)
        .overlay(shape.stroke(tone.ink.opacity(0.25), lineWidth: 1))
    }

    private func aiAlertsBinding(current: Bool) -> Binding<Bool> {
        Binding(get: { current },
                set: { value in Task { await app.updateAlertPrefs(StaffAlertPrefsUpdate(aiAlerts: value)) } })
    }

    // MARK: - Models

    @ViewBuilder
    private func modelsSection(_ models: [StaffModelHealth]) -> some View {
        if !models.isEmpty {
            VStack(alignment: .leading, spacing: DeskLayout.space8) {
                DeskSectionHeader(title: "نماذج الذكاء الاصطناعي")
                VStack(spacing: 0) {
                    ForEach(Array(models.enumerated()), id: \.offset) { index, model in
                        ModelRow(model: model)
                        if index < models.count - 1 {
                            Rectangle().fill(DeskTheme.hairline).frame(height: 1)
                        }
                    }
                }
                .modifier(DeskOutlinedGroup())
            }
        }
    }

    // MARK: - Budgets

    private func budgetsSection(_ budgets: [StaffBudget]) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            DeskSectionHeader(title: "الميزانية الشهرية")
            if budgets.isEmpty {
                Text("لا توجد ميزانية محددة")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(budgets.enumerated()), id: \.offset) { index, budget in
                        BudgetRow(budget: budget)
                        if index < budgets.count - 1 {
                            Rectangle().fill(DeskTheme.hairline).frame(height: 1)
                        }
                    }
                }
                .modifier(DeskOutlinedGroup())
            }
        }
    }

    // MARK: - Data

    private func load() async {
        do {
            health = try await app.client.systemHealth()
            loadError = nil
        } catch {
            guard !Task.isCancelled else { return }
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}

/// One model: status dot, id and provider, usage, last error, status tag.
private struct ModelRow: View {
    let model: StaffModelHealth

    private var tone: DeskTone { model.isQuotaExceeded ? .danger : model.effectiveStatus.tone }

    /// «منذ 17:58» while not up, then the 24-hour usage.
    private var secondaryLine: String? {
        var parts: [String] = []
        if model.effectiveStatus != .up, let since = model.since {
            parts.append("منذ \(RiyadhTime.timeString(since))")
        }
        if let usage = DeskSystemCopy.usageLine(requests: model.requests24h, failures: model.failures24h) {
            parts.append(usage)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var errorText: String? {
        guard let error = model.lastError else { return nil }
        let parts = [error.code, error.message].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            Circle()
                .fill(tone.ink)
                .frame(width: 10, height: 10)
                .padding(.top, 7)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(verbatim: model.modelId)
                        .deskText(DeskType.rowTitle)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if let provider = model.providerLabel ?? model.provider {
                        Text(verbatim: provider)
                            .deskText(DeskType.meta)
                            .foregroundStyle(DeskTheme.textTertiary)
                            .lineLimit(1)
                    }
                }
                if let secondaryLine {
                    Text(secondaryLine)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let errorText {
                    Text(verbatim: errorText)
                        .deskText(DeskType.metaEmphasis)
                        .foregroundStyle(DeskTheme.danger)
                        .lineLimit(2)
                        .padding(.horizontal, DeskLayout.space8)
                        .padding(.vertical, DeskLayout.space4)
                        .background(DeskTheme.danger.opacity(0.08),
                                    in: RoundedRectangle(cornerRadius: DeskRadius.small, style: .continuous))
                }
            }
            Spacer(minLength: DeskLayout.space4)
            StatusChip(title: DeskSystemCopy.statusTitle(model.effectiveStatus, quotaExceeded: model.isQuotaExceeded),
                       tone: tone)
        }
        .padding(DeskLayout.cardInset)
        .accessibilityElement(children: .combine)
    }
}

/// One budget: «OpenAI · 82%», «410 من 500 دولار» and a progress bar.
private struct BudgetRow: View {
    let budget: StaffBudget

    private var tone: DeskTone {
        let fraction = budget.percent.map { $0 / 100 } ?? budget.fraction
        if fraction >= 1 { return .danger }
        if fraction >= 0.8 { return .warning }
        return .success
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: DeskSystemCopy.budgetTitle(label: budget.label, percent: budget.percent))
                    .deskText(DeskType.rowTitle)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: DeskLayout.space8)
                if let amount = DeskSystemCopy.budgetAmount(spent: budget.spentUsd, limit: budget.limitUsd) {
                    Text(verbatim: amount)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(1)
                }
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(DeskTheme.chipGrey)
                    Capsule().fill(tone.ink)
                        .frame(width: proxy.size.width * budget.fraction)
                }
            }
            .frame(height: 8)
            .accessibilityHidden(true)
        }
        .padding(DeskLayout.cardInset)
        .accessibilityElement(children: .combine)
    }
}

extension StaffSystemStatus {
    var tone: DeskTone {
        switch self {
        case .ok: return .success
        case .partial: return .warning
        case .down: return .danger
        case .unknown: return .neutral
        }
    }

    var fallbackTitle: String {
        switch self {
        case .ok: return "كل النماذج تعمل"
        case .partial: return "تعطّل جزئي"
        case .down: return "النماذج متوقفة"
        case .unknown: return "حالة النظام غير معروفة"
        }
    }
}

extension StaffModelStatus {
    var tone: DeskTone {
        switch self {
        case .up: return .success
        case .degraded: return .warning
        case .down: return .danger
        case .unknown: return .neutral
        }
    }
}

#if DEBUG
#Preview("حالة النظام") {
    SystemHealthView()
        .deskPreviewEnvironment()
}
#endif
