import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// Picks a Riyadh-time slot, then confirms a plain-language summary before
/// anything is sent.
struct ScheduleSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onConfirm: (Date) -> Void

    @State private var date: Date
    @State private var confirming = false
    private let earliest: Date

    init(initial: Date?, onConfirm: @escaping (Date) -> Void) {
        let earliest = RiyadhTime.earliestSchedulableDate()
        self.earliest = earliest
        self.onConfirm = onConfirm
        _date = State(initialValue: max(initial ?? earliest, earliest))
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: DeskLayout.space16) {
                Text("الوقت بتوقيت الرياض مهما كان توقيت جهازك.")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                DatePicker("موعد النشر",
                           selection: $date,
                           in: earliest...earliest.addingTimeInterval(60 * 60 * 24 * 60),
                           displayedComponents: [.date, .hourAndMinute])
                    .datePickerStyle(.graphical)
                    .environment(\.timeZone, RiyadhTime.timeZone)
                    .environment(\.calendar, RiyadhTime.calendar)
                Text(RiyadhTime.displayString(date))
                    .deskText(DeskType.rowTitle)
                    .foregroundStyle(DeskTheme.textPrimary)
                Spacer()
                Button("متابعة") { confirming = true }
                    .buttonStyle(DeskPrimaryButtonStyle())
                    .disabled(!RiyadhTime.isSchedulable(date))
            }
            .padding(DeskLayout.pageMargin)
            .navigationTitle("جدولة التغريدة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .confirmationDialog("تأكيد الجدولة", isPresented: $confirming, titleVisibility: .visible) {
                Button("جدولة") {
                    onConfirm(date)
                    dismiss()
                }
                Button("تعديل الموعد", role: .cancel) {}
            } message: {
                Text("ستُنشر التغريدة \(RiyadhTime.displayString(date)) بتوقيت الرياض.")
            }
        }
        .presentationDetents([.large])
    }
}
