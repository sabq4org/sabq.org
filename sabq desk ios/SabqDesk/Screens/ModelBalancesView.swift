import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «أرصدة النماذج» (admins, from «حالة النظام»): one row per AI provider with
/// what is left, sorted by urgency. DeepSeek and ElevenLabs report a real
/// balance; OpenAI and Anthropic are an estimate (last top-up − tracked spend);
/// Gemini is this month's tracked spend against a budget.
struct ModelBalancesView: View {
    @Environment(AppModel.self) private var app

    @State private var balances: StaffAIBalances?
    @State private var loadError: String?
    @State private var updateTarget: StaffAIBalance?
    @State private var showsLimits = false

    /// Read-only supervisors (no `ai_hub.manage`) see the balances but no edit controls.
    private var canEdit: Bool { balances?.allowsEditing(app.me?.capabilities) ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DeskLayout.space16) {
                header
                if let loadError {
                    ErrorLine(message: loadError)
                }
                if let balances {
                    content(balances)
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
        // The title names the back button on the detail («الأرصدة»); the page
        // shows its own large title instead.
        .navigationTitle("الأرصدة")
        .navigationBarTitleDisplayMode(.inline)
        // «النظام» hides the bar on its root; pushed screens show it again.
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Color.clear.frame(width: 1, height: 1).accessibilityHidden(true)
            }
            if canEdit {
                ToolbarItem(placement: .primaryAction) {
                    Button { showsLimits = true } label: {
                        Text("حدود التنبيه")
                            .deskText(DeskType.button)
                            .foregroundStyle(DeskInk.link)
                    }
                    .disabled(balances?.items.isEmpty ?? true)
                }
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $updateTarget) { balance in
            UpdateBalanceSheet(balance: balance) { _ in Task { await load() } }
        }
        .sheet(isPresented: $showsLimits) {
            AlertLimitsSheet(balances: balances?.items ?? []) { _ in Task { await load() } }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("أرصدة النماذج")
                .deskText(DeskType.pageTitle)
                .foregroundStyle(DeskTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
        }
    }

    /// «آخر تحديث 22:20 · بتوقيت الرياض · اسحب للتحديث»
    private var subtitle: String {
        guard let at = balances?.generatedAt else { return "جارٍ التحديث…" }
        return "آخر تحديث \(RiyadhTime.timeString(at)) · بتوقيت الرياض · اسحب للتحديث"
    }

    @ViewBuilder
    private func content(_ balances: StaffAIBalances) -> some View {
        if let text = balances.summary?.text, !text.isEmpty {
            HStack(alignment: .top, spacing: DeskLayout.space12) {
                DeskMascot(size: 44)
                AssistantBubble(text: text)
            }
        }
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            HStack(alignment: .firstTextBaseline) {
                DeskSectionHeader(title: "المزوّدون · \(balances.items.count)")
                Spacer(minLength: DeskLayout.space8)
                Text("مرتّبة حسب الأولوية")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
            }
            VStack(spacing: 0) {
                ForEach(Array(balances.items.enumerated()), id: \.element.id) { index, balance in
                    NavigationLink(value: DeskDeepLink.balance(provider: balance.provider)) {
                        BalanceRow(balance: balance, canEdit: canEdit) { updateTarget = balance }
                    }
                    .buttonStyle(.plain)
                    if index < balances.items.count - 1 {
                        Rectangle().fill(DeskTheme.hairline).frame(height: 1)
                    }
                }
            }
            .modifier(DeskOutlinedGroup())
        }
        Text(DeskBalanceCopy.kindsFootnote)
            .deskText(DeskType.timestamp)
            .foregroundStyle(DeskTheme.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func load() async {
        do {
            balances = try await app.client.systemBalances()
            loadError = nil
        } catch {
            guard !Task.isCancelled else { return }
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}

/// One provider: initial with a state dot, name, kind and state tags, the
/// figure, one detail line and a thin bar coloured by state.
private struct BalanceRow: View {
    let balance: StaffAIBalance
    let canEdit: Bool
    let configure: () -> Void

    private var showsConfigure: Bool {
        canEdit && balance.effectiveState == .notConfigured && (balance.canUpdateBalance ?? false)
    }

    var body: some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            ProviderInitialTile(balance: balance)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(verbatim: balance.displayName)
                        .deskText(DeskType.rowTitle)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .layoutPriority(1)
                    BalanceKindTag(kind: balance.effectiveKind)
                    Spacer(minLength: DeskLayout.space4)
                    BalanceFigure(balance: balance, role: DeskType.sectionHeading)
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    BalanceStateTag(balance: balance)
                    if showsConfigure {
                        Button("اضبطه", action: configure)
                            .deskText(DeskType.metaEmphasis)
                            .foregroundStyle(DeskInk.link)
                            .buttonStyle(.borderless)
                    }
                    // «اضبطه» already says what to do (approved list); the hint
                    // line is for readers who cannot set it.
                    let detail = showsConfigure ? "" : DeskBalanceCopy.rowDetail(balance)
                    if !detail.isEmpty {
                        Text(detail)
                            .deskText(DeskType.meta)
                            .foregroundStyle(DeskTheme.textSecondary)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let fraction = balance.clampedFraction, balance.effectiveState.hasFigure {
                    BalanceBar(fraction: fraction, tone: balance.tone)
                        .padding(.top, 2)
                }
            }
            Image(systemName: "chevron.forward")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(DeskTheme.textTertiary)
                .padding(.top, 12)
                .accessibilityHidden(true)
        }
        .padding(DeskLayout.cardInset)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Shared pieces (list, detail, banner)

extension StaffBalanceState {
    /// Whether there is a figure worth drawing a bar for.
    var hasFigure: Bool { self == .healthy || self == .low || self == .critical }
}

extension StaffAIBalance {
    var tone: DeskTone {
        switch effectiveState {
        case .critical, .unavailable: return .danger
        case .low: return .warning
        case .healthy: return .success
        case .notConfigured, .unknown: return .neutral
        }
    }
}

/// The provider's initial in a grey square, with a dot in the state's colour.
struct ProviderInitialTile: View {
    let balance: StaffAIBalance
    var side: CGFloat = 40

    var body: some View {
        Text(verbatim: balance.initial)
            .deskText(DeskTextRole(size: 16, weight: .bold, style: .headline, lineSpacing: 0))
            .foregroundStyle(DeskTheme.textPrimary)
            .frame(width: side, height: side)
            .background(DeskInk.chip, in: RoundedRectangle(cornerRadius: DeskRadius.medium, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Circle()
                    .fill(balance.effectiveState == .notConfigured ? DeskTheme.textTertiary : balance.tone.ink)
                    .frame(width: 10, height: 10)
                    .overlay(Circle().stroke(DeskTheme.background, lineWidth: 2))
                    .offset(x: 3, y: -3)
            }
            .accessibilityHidden(true)
    }
}

/// «فعلي» / «تقديري» / «ميزانية» in link blue on the bubble tint.
struct BalanceKindTag: View {
    let kind: StaffBalanceKind

    var body: some View {
        let title = DeskBalanceCopy.kindTitle(kind)
        if !title.isEmpty {
            Text(title)
                .deskText(DeskType.tag)
                .foregroundStyle(DeskInk.link)
                .padding(.horizontal, DeskLayout.space8)
                .padding(.vertical, 2)
                .background(DeskInk.bubble, in: Capsule())
                .fixedSize()
        }
    }
}

/// «حرج» / «منخفض» / «جيد» / «لم يُضبط الرصيد بعد» as a tinted chip.
struct BalanceStateTag: View {
    let balance: StaffAIBalance

    var body: some View {
        StatusChip(title: DeskBalanceCopy.stateTitle(balance), tone: balance.tone)
            .fixedSize()
    }
}

/// The figure: `$86.30`, or `182.4K` with «حرف» after it.
struct BalanceFigure: View {
    let balance: StaffAIBalance
    var role: DeskTextRole = DeskType.sectionHeading

    var body: some View {
        if balance.effectiveUnit == .characters, let value = balance.measuredAmount {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                LTRText(text: DeskBalanceCopy.compact(value), role: role, color: figureColor)
                Text("حرف")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
            .fixedSize()
        } else {
            LTRText(text: DeskBalanceCopy.amountText(balance), role: role, color: figureColor)
                .fixedSize()
        }
    }

    /// The figure stays ink; the state tag and bar carry the colour (concept).
    private var figureColor: Color {
        balance.effectiveState == .unknown || balance.amount == nil ? DeskTheme.textTertiary : DeskTheme.textPrimary
    }
}

/// Thin progress bar coloured by state, with an optional threshold marker.
/// Fills from the leading edge, so from the right in Arabic.
struct BalanceBar: View {
    let fraction: Double
    let tone: DeskTone
    var marker: Double?
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(DeskInk.chip)
                    .frame(height: height)
                Capsule().fill(tone.ink)
                    .frame(width: fraction > 0 ? max(height, proxy.size.width * fraction) : 0, height: height)
                if let marker {
                    Capsule().fill(DeskInk.strong)
                        .frame(width: 2, height: height + 10)
                        .padding(.leading, max(0, proxy.size.width * min(marker, 1) - 1))
                }
            }
            .frame(maxHeight: .infinity)
        }
        .frame(height: marker == nil ? height : height + 10)
        .accessibilityHidden(true)
    }
}

#if DEBUG
#Preview("أرصدة النماذج") {
    NavigationStack {
        ModelBalancesView()
            .navigationDestination(for: DeskDeepLink.self) { link in
                if case .balance(let provider) = link { ProviderBalanceDetailView(provider: provider) }
            }
    }
    .deskPreviewEnvironment()
}
#endif
