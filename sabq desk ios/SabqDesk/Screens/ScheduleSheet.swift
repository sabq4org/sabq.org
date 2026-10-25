import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// Quick slots first («بعد ساعة»، «الليلة»، «غدًا صباحًا»), a full Riyadh-time
/// picker behind «وقت آخر…», and a plain summary with a clash hint before
/// anything is sent.
struct ScheduleSheet: View {
    @Environment(\.dismiss) private var dismiss
    let scheduledTimes: [Date]
    let onConfirm: (Date) -> Void

    @State private var date: Date
    @State private var selectedPreset: String?
    @State private var showsPicker: Bool
    private let earliest: Date
    private let presets: [SchedulePreset]

    init(initial: Date?, scheduledTimes: [Date] = [], onConfirm: @escaping (Date) -> Void) {
        let now = Date()
        let earliest = RiyadhTime.earliestSchedulableDate(now: now)
        let presets = SchedulePreset.defaults(now: now)
        self.earliest = earliest
        self.presets = presets
        // Rescheduling must not warn about the post's own current slot.
        self.scheduledTimes = scheduledTimes.filter { $0 != initial }
        self.onConfirm = onConfirm
        if let initial, initial >= earliest {
            _date = State(initialValue: initial)
            _selectedPreset = State(initialValue: nil)
            _showsPicker = State(initialValue: true)
        } else {
            let first = presets.first
            _date = State(initialValue: first?.date ?? earliest)
            _selectedPreset = State(initialValue: first?.id)
            _showsPicker = State(initialValue: false)
        }
    }

    private var clash: Date? { ScheduleClash.nearest(to: date, among: scheduledTimes) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DeskLayout.space16) {
                    HStack(alignment: .top, spacing: DeskLayout.space8) {
                        DeskMascot(size: 40)
                        AssistantBubble(text: "متى تُنشر التغريدة؟ الأوقات بتوقيت الرياض مهما كان توقيت جهازك.")
                    }
                    presetGrid
                    if showsPicker {
                        DatePicker("موعد النشر",
                                   selection: $date,
                                   in: earliest...earliest.addingTimeInterval(60 * 60 * 24 * 60),
                                   displayedComponents: [.date, .hourAndMinute])
                            .datePickerStyle(.graphical)
                            .environment(\.timeZone, RiyadhTime.timeZone)
                            .environment(\.calendar, RiyadhTime.calendar)
                            .environment(\.locale, RiyadhTime.locale)
                            .tint(DeskInk.link)
                            .onChange(of: date) { _, _ in selectedPreset = nil }
                    }
                    summary
                }
                .padding(DeskLayout.pageMargin + 4)
            }
            .safeAreaInset(edge: .bottom) {
                Button("جدولة") {
                    onConfirm(date)
                    dismiss()
                }
                .buttonStyle(DeskBigButtonStyle())
                .disabled(!RiyadhTime.isSchedulable(date))
                .padding(.horizontal, DeskLayout.pageMargin + 4)
                .padding(.vertical, DeskLayout.space8)
                .background(DeskTheme.background)
            }
            .background(DeskTheme.background)
            .navigationTitle("جدولة التغريدة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
        .presentationDetents([.large])
    }

    private var presetGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: DeskLayout.space8),
                            GridItem(.flexible(), spacing: DeskLayout.space8)],
                  spacing: DeskLayout.space8) {
            ForEach(presets) { preset in
                SlotButton(title: preset.title,
                           detail: RiyadhTime.timeString(preset.date),
                           isSelected: selectedPreset == preset.id) {
                    date = preset.date
                    showsPicker = false
                    // Set after `date` so the picker's onChange cannot clear it.
                    DispatchQueue.main.async { selectedPreset = preset.id }
                }
            }
            SlotButton(title: "وقت آخر…", detail: nil, isSelected: showsPicker && selectedPreset == nil) {
                selectedPreset = nil
                withAnimation { showsPicker = true }
            }
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            Text("ستُنشر \(RiyadhTime.dayTitle(date)) الساعة \(RiyadhTime.timeString(date))")
                .deskText(DeskType.rowTitle)
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let countdown = RiyadhTime.countdown(to: date) {
                Text(countdown)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskInk.link)
            }
            if let clash {
                Label("قريبة من تغريدة مجدولة الساعة \(RiyadhTime.timeString(clash)). يمكنك المتابعة أو اختيار وقت آخر.",
                      systemImage: "exclamationmark.triangle")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTone.warning.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !RiyadhTime.isSchedulable(date) {
                Text("اختر وقتًا بعد خمس دقائق على الأقل.")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.danger)
            }
        }
        .padding(.top, DeskLayout.space4)
        .accessibilityElement(children: .combine)
    }
}

/// One quick slot: title and its time, dark when picked.
private struct SlotButton: View {
    let title: String
    let detail: String?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(title)
                    .deskText(DeskType.metaEmphasis)
                if let detail {
                    Text(verbatim: detail)
                        .deskText(DeskType.meta)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            .foregroundStyle(isSelected ? Color.white : DeskTheme.textPrimary)
            .frame(maxWidth: .infinity, minHeight: 60)
            .background(isSelected ? DeskInk.strong : DeskInk.chip,
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
