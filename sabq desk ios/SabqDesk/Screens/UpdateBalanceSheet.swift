import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «تحديث رصيد OpenAI»: a new top-up or the balance shown on the provider's
/// billing page (estimated providers), or the monthly budget (Gemini), with
/// the alert threshold and a preview of the balance after saving.
struct UpdateBalanceSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let balance: StaffAIBalance
    let onSaved: (StaffAIBalance) -> Void

    @State private var mode: StaffBalanceTopupMode
    @State private var amountText = ""
    @State private var topupAt = Date()
    @State private var showsDatePicker = false
    @State private var threshold: ThresholdChoice
    @State private var saving = false
    @State private var error: String?
    @FocusState private var amountFocused: Bool

    init(balance: StaffAIBalance, onSaved: @escaping (StaffAIBalance) -> Void) {
        self.balance = balance
        self.onSaved = onSaved
        _mode = State(initialValue: balance.effectiveKind == .budget ? .budget : .add)
        _threshold = State(initialValue: ThresholdChoice(balance: balance))
        #if DEBUG
        // Simulator screenshot: the concept shows a typed $500 with the keyboard down.
        if DeskScreenshotScene.current == .update { _amountText = State(initialValue: "500.00") }
        #endif
    }

    private var isBudget: Bool { balance.effectiveKind == .budget }
    private var amount: Double? { DeskBalanceCopy.parseAmount(amountText) }
    private var canSave: Bool { amount != nil && threshold.value != nil && !saving }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DeskLayout.space24) {
                    HStack(alignment: .top, spacing: DeskLayout.space8) {
                        DeskMascot(size: 40)
                        AssistantBubble(text: bubbleText)
                    }
                    if !isBudget { modePicker }
                    amountField
                    if mode == .add { dateRow }
                    thresholdSection
                    if let amount { previewCard(amount) }
                    if let error { ErrorLine(message: error) }
                }
                .padding(DeskLayout.pageMargin + 4)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: DeskLayout.space8) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView().tint(.white) } else { Text(isBudget ? "احفظ الميزانية" : "احفظ الرصيد") }
                    }
                    .buttonStyle(DeskBigButtonStyle())
                    .disabled(!canSave)
                    Text("يُحفظ في سجل الشحنات باسم \(app.me?.firstName ?? app.me?.displayName ?? "حسابك") · للمدراء فقط")
                        .deskText(DeskType.timestamp)
                        .foregroundStyle(DeskTheme.textTertiary)
                }
                .padding(.horizontal, DeskLayout.pageMargin + 4)
                .padding(.vertical, DeskLayout.space8)
                .background(DeskTheme.background)
            }
            .background(DeskTheme.background)
            .navigationTitle(isBudget ? "ميزانية \(balance.displayName)" : "تحديث رصيد \(balance.displayName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear {
                #if DEBUG
                if DeskScreenshotScene.current == .update { return }
                #endif
                amountFocused = true
            }
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled(saving)
    }

    private var bubbleText: String {
        if isBudget {
            return "ضع ميزانية شهرية لـ \(balance.displayName)، وأقارن بها صرف الشهر المسجّل في سبق."
        }
        return "أدخل المبلغ كما يظهر في صفحة الفوترة بلوحة \(balance.displayName)، وأحسب الرصيد من الصرف المسجّل بعده."
    }

    // MARK: - Mode

    private var modePicker: some View {
        HStack(spacing: 4) {
            segment("أضفتُ شحنة جديدة", .add)
            segment("الرصيد الحالي في اللوحة", .set)
        }
        .padding(4)
        .background(DeskInk.chip, in: RoundedRectangle(cornerRadius: DeskRadius.medium, style: .continuous))
    }

    private func segment(_ title: String, _ value: StaffBalanceTopupMode) -> some View {
        let selected = mode == value
        return Button {
            mode = value
        } label: {
            Text(title)
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(selected ? Color.white : DeskTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(selected ? DeskInk.strong : Color.clear,
                            in: RoundedRectangle(cornerRadius: DeskRadius.small, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: - Amount

    private var amountLabel: String {
        switch mode {
        case .add: return "مبلغ الشحنة"
        case .set: return "الرصيد الظاهر في اللوحة الآن"
        case .budget, .unknown: return "الميزانية الشهرية"
        }
    }

    private var amountField: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            DeskSectionHeader(title: amountLabel)
            HStack(spacing: DeskLayout.space8) {
                HStack(spacing: 6) {
                    Text(verbatim: "$")
                        .deskText(DeskType.sectionHeading)
                        .foregroundStyle(DeskTheme.textSecondary)
                    TextField("0.00", text: $amountText)
                        .keyboardType(.decimalPad)
                        .focused($amountFocused)
                        .deskText(DeskType.sectionHeading)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .monospacedDigit()
                        .accessibilityLabel(amountLabel)
                        // Hug the figure so «$ 500.00» sits at the start, as in the concept.
                        .fixedSize(horizontal: true, vertical: false)
                }
                .environment(\.layoutDirection, .leftToRight)
                Spacer(minLength: DeskLayout.space8)
                Text("دولار")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
            }
            .padding(.horizontal, DeskLayout.space16)
            .frame(minHeight: 56)
            .background(DeskInk.chip, in: RoundedRectangle(cornerRadius: DeskRadius.medium, style: .continuous))
            .contentShape(Rectangle())
            .onTapGesture { amountFocused = true }
            if !amountText.isEmpty && amount == nil {
                Text("اكتب مبلغًا أكبر من صفر.")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.danger)
            }
        }
    }

    // MARK: - Date

    private var dateRow: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            DeskSectionHeader(title: "تاريخ الشحنة")
            Button {
                withAnimation { showsDatePicker.toggle() }
            } label: {
                HStack {
                    Text(dayLabel)
                        .deskText(DeskType.rowTitle)
                        .foregroundStyle(DeskTheme.textPrimary)
                    Spacer(minLength: DeskLayout.space8)
                    LTRText(text: RiyadhTime.timeString(topupAt), role: DeskType.rowTitle, color: DeskTheme.textPrimary)
                }
                .padding(.horizontal, DeskLayout.space16)
                .frame(minHeight: DeskLayout.controlHeight)
                .background(DeskInk.chip, in: RoundedRectangle(cornerRadius: DeskRadius.medium, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("يفتح اختيار التاريخ والوقت")
            if showsDatePicker {
                DatePicker("تاريخ الشحنة",
                           selection: $topupAt,
                           in: Date().addingTimeInterval(-60 * 60 * 24 * 365)...Date(),
                           displayedComponents: [.date, .hourAndMinute])
                    .datePickerStyle(.graphical)
                    .environment(\.timeZone, RiyadhTime.timeZone)
                    .environment(\.calendar, RiyadhTime.calendar)
                    .environment(\.locale, RiyadhTime.locale)
                    .tint(DeskInk.link)
            }
        }
    }

    /// «اليوم · الأحد 25 أكتوبر 2026»
    private var dayLabel: String {
        let full = DeskBalanceCopy.fullDay(topupAt)
        return RiyadhTime.calendar.isDateInToday(topupAt) ? "اليوم · \(full)" : full
    }

    // MARK: - Threshold

    private var thresholdSection: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            DeskSectionHeader(title: isBudget ? "نبّهني حين يقل المتبقي عن" : "نبّهني حين يقل الرصيد عن")
            ThresholdChips(choice: $threshold, unit: balance.effectiveUnit)
            if let low = threshold.value {
                Text("يصبح «حرجًا» تحت \(DeskBalanceCopy.amount(low / 4, unit: balance.effectiveUnit, whole: true)) (ربع الحد)، ويصلك إشعار مرة واحدة لكل مستوى.")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Preview

    private func previewCard(_ amount: Double) -> some View {
        let after = DeskBalanceCopy.balanceAfter(current: balance.amount, mode: mode, amount: amount)
        return VStack(alignment: .leading, spacing: 4) {
            Text("\(isBudget ? "الميزانية بعد الحفظ" : "الرصيد بعد الحفظ"): \(money(after))")
                .deskText(DeskType.rowTitle)
                .foregroundStyle(DeskTheme.textPrimary)
            Text(previewDetail(amount: amount, after: after))
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(DeskLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DeskCardBackground())
        .accessibilityElement(children: .combine)
    }

    /// «$86.30 الحالي + $500 الشحنة · يكفي نحو 35 يومًا»
    private func previewDetail(amount: Double, after: Double) -> String {
        switch mode {
        case .add:
            var text = balance.amount.map { "\(money($0)) الحالي + \(money(amount)) الشحنة" } ?? "أول شحنة تُسجَّل"
            if let lasts = DeskBalanceCopy.lasts(daysLeft(for: after)) { text += " · \(lasts)" }
            return text
        case .set:
            var text = "يحل محل التقدير الحالي، ويُطرح منه الصرف المسجّل من الآن"
            if let lasts = DeskBalanceCopy.lasts(daysLeft(for: after)) { text += " · \(lasts)" }
            return text
        case .budget, .unknown:
            let spent = balance.monthSpend ?? 0
            return "صُرف \(money(spent)) هذا الشهر · يتبقى \(money(max(0, amount - spent)))"
        }
    }

    /// Same daily rate the server used for today's «يكفي نحو».
    private func daysLeft(for value: Double) -> Double? {
        guard let current = balance.amount, current > 0, let days = balance.daysLeft, days > 0 else { return nil }
        return value / (current / days)
    }

    /// Isolated left-to-right so «$586.30» keeps its place in the Arabic line;
    /// whole dollars drop the cents, as in the concept («$500 الشحنة»).
    private func money(_ value: Double) -> String {
        let whole = value == value.rounded() && value >= 1
        return "\u{2066}\(DeskBalanceCopy.amount(value, unit: .usd, whole: whole))\u{2069}"
    }

    // MARK: - Save

    private func save() async {
        guard let amount, let low = threshold.value else { return }
        saving = true
        error = nil
        defer { saving = false }
        let body = StaffBalanceTopup(mode: mode,
                                     amountUsd: amount,
                                     topupAt: mode == .add ? topupAt : nil,
                                     threshold: low == balance.lowThreshold ? nil : low)
        do {
            let updated = try await app.client.topUpBalance(provider: balance.provider, body)
            onSaved(updated)
            dismiss()
        } catch {
            if !app.handle(error) {
                self.error = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}

// MARK: - Threshold choice

/// The threshold picked from the presets or typed under «مبلغ آخر».
struct ThresholdChoice: Equatable {
    var presets: [Double]
    var preset: Double?
    var custom: String
    var usesCustom: Bool

    init(balance: StaffAIBalance) {
        let presets = balance.threshold?.presets ?? []
        let current = balance.threshold?.low
        self.presets = presets
        if let current, !presets.contains(current) {
            preset = nil
            custom = DeskBalanceCopy.amount(current, unit: .usd, whole: true).replacingOccurrences(of: "$", with: "")
            usesCustom = true
        } else {
            preset = current ?? presets.first
            custom = ""
            usesCustom = false
        }
    }

    var value: Double? { usesCustom ? DeskBalanceCopy.parseAmount(custom) : preset }
}

/// Preset chips ($50 / $100 / $200) and «مبلغ آخر» with a field under it.
struct ThresholdChips: View {
    @Binding var choice: ThresholdChoice
    let unit: StaffBalanceUnit

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            HStack(spacing: DeskLayout.space8) {
                ForEach(choice.presets, id: \.self) { value in
                    chip(DeskBalanceCopy.amount(value, unit: unit, whole: true),
                         selected: !choice.usesCustom && choice.preset == value) {
                        choice.preset = value
                        choice.usesCustom = false
                    }
                }
                chip("مبلغ آخر", selected: choice.usesCustom) {
                    choice.usesCustom = true
                }
            }
            if choice.usesCustom {
                HStack(spacing: 6) {
                    if unit != .characters {
                        Text(verbatim: "$")
                            .deskText(DeskType.rowTitle)
                            .foregroundStyle(DeskTheme.textSecondary)
                    }
                    TextField(unit == .characters ? "عدد الأحرف" : "المبلغ", text: $choice.custom)
                        .keyboardType(.decimalPad)
                        .deskText(DeskType.rowTitle)
                        .monospacedDigit()
                }
                .environment(\.layoutDirection, .leftToRight)
                .padding(.horizontal, DeskLayout.space16)
                .frame(minHeight: DeskLayout.controlHeight)
                .background(DeskInk.chip, in: RoundedRectangle(cornerRadius: DeskRadius.medium, style: .continuous))
            }
        }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .deskText(DeskType.metaEmphasis)
                .monospacedDigit()
                .foregroundStyle(selected ? Color.white : DeskTheme.textPrimary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(selected ? DeskInk.strong : DeskInk.chip,
                            in: RoundedRectangle(cornerRadius: DeskRadius.medium, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Alert limits

/// «حدود التنبيه»: the low-balance threshold of each provider (one provider
/// when opened from «تعديل» on the detail). Only changed ones are saved.
struct AlertLimitsSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let balances: [StaffAIBalance]
    let onSaved: ([StaffAIBalance]) -> Void

    @State private var choices: [String: ThresholdChoice]
    @State private var saving = false
    @State private var error: String?

    init(balances: [StaffAIBalance], onSaved: @escaping ([StaffAIBalance]) -> Void) {
        self.balances = balances
        self.onSaved = onSaved
        var initial: [String: ThresholdChoice] = [:]
        for balance in balances { initial[balance.provider] = ThresholdChoice(balance: balance) }
        _choices = State(initialValue: initial)
    }

    private var changed: [(StaffAIBalance, Double)] {
        balances.compactMap { balance in
            guard let value = choices[balance.provider]?.value, value != balance.lowThreshold else { return nil }
            return (balance, value)
        }
    }

    private var hasInvalid: Bool { balances.contains { choices[$0.provider]?.value == nil } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DeskLayout.space24) {
                    HStack(alignment: .top, spacing: DeskLayout.space8) {
                        DeskMascot(size: 40)
                        AssistantBubble(text: "يصلك إشعار حين يقل الرصيد عن الحد، وآخر حين يقل عن ربعه. إشعار واحد لكل مستوى حتى تشحن.")
                    }
                    ForEach(balances) { balance in
                        VStack(alignment: .leading, spacing: DeskLayout.space8) {
                            HStack(spacing: 6) {
                                Text(verbatim: balance.displayName)
                                    .deskText(DeskType.rowTitle)
                                    .foregroundStyle(DeskTheme.textPrimary)
                                BalanceKindTag(kind: balance.effectiveKind)
                                Spacer(minLength: 0)
                            }
                            ThresholdChips(choice: binding(for: balance), unit: balance.effectiveUnit)
                            if let low = choices[balance.provider]?.value {
                                Text("حرج تحت \(DeskBalanceCopy.amount(low / 4, unit: balance.effectiveUnit, whole: true))")
                                    .deskText(DeskType.meta)
                                    .foregroundStyle(DeskTheme.textSecondary)
                            }
                        }
                    }
                    if let error { ErrorLine(message: error) }
                }
                .padding(DeskLayout.pageMargin + 4)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView().tint(.white) } else { Text("احفظ الحدود") }
                }
                .buttonStyle(DeskBigButtonStyle())
                .disabled(saving || changed.isEmpty || hasInvalid)
                .padding(.horizontal, DeskLayout.pageMargin + 4)
                .padding(.vertical, DeskLayout.space8)
                .background(DeskTheme.background)
            }
            .background(DeskTheme.background)
            .navigationTitle(balances.count == 1 ? "حد تنبيه \(balances[0].displayName)" : "حدود التنبيه")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
        .presentationDetents(detents)
        .interactiveDismissDisabled(saving)
    }

    private var detents: Set<PresentationDetent> {
        balances.count == 1 ? [.medium, .large] : [.large]
    }

    private func binding(for balance: StaffAIBalance) -> Binding<ThresholdChoice> {
        Binding(get: { choices[balance.provider] ?? ThresholdChoice(balance: balance) },
                set: { choices[balance.provider] = $0 })
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        var saved: [StaffAIBalance] = []
        for (balance, value) in changed {
            do {
                saved.append(try await app.client.updateBalanceThreshold(provider: balance.provider, threshold: value))
            } catch {
                if !app.handle(error) {
                    self.error = "\(balance.displayName): \((error as? StaffAPIError)?.userMessage ?? error.localizedDescription)"
                }
                if !saved.isEmpty { onSaved(saved) }
                return
            }
        }
        onSaved(saved)
        dismiss()
    }
}

#if DEBUG
#Preview("تحديث رصيد OpenAI") {
    UpdateBalanceSheet(balance: DeskPreviewFixtures.openAIBalance) { _ in }
        .deskPreviewEnvironment()
}

#Preview("ميزانية Gemini") {
    UpdateBalanceSheet(balance: DeskPreviewFixtures.geminiBalance) { _ in }
        .deskPreviewEnvironment()
}

#Preview("حدود التنبيه") {
    AlertLimitsSheet(balances: DeskPreviewFixtures.balances.items) { _ in }
        .deskPreviewEnvironment()
}
#endif
