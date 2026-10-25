import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// One of the approved preset reasons and/or a note. A reason is required
/// (the server refuses a blank one with 400), so confirm stays disabled
/// until the preset or the note supplies it.
struct RejectSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onConfirm: (String) -> Void

    @State private var preset: SocialRejectionPreset?
    @State private var note = ""

    private var reason: String? { SocialRejectionPreset.composeReason(preset: preset, note: note) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(SocialRejectionPreset.allCases) { option in
                        Button {
                            preset = preset == option ? nil : option
                        } label: {
                            HStack {
                                Text(option.title)
                                    .deskText(DeskType.excerpt)
                                    .foregroundStyle(DeskTheme.textPrimary)
                                Spacer()
                                if preset == option {
                                    Image(systemName: "checkmark").foregroundStyle(DeskTheme.primary)
                                }
                            }
                        }
                        .accessibilityAddTraits(preset == option ? .isSelected : [])
                    }
                } header: {
                    Text("سبب الرفض")
                } footer: {
                    Text("اختر سبباً أو اكتب ملاحظة — السبب مطلوب ويصل إلى الكاتب أو الوكالة مع إشعار الرفض.")
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                }

                Section("ملاحظة") {
                    TextField("أضف توضيحاً لصاحب المقترح", text: $note, axis: .vertical)
                        .lineLimit(3...8)
                        .deskText(DeskType.excerpt)
                        .onChange(of: note) { _, value in
                            if value.count > 900 { note = String(value.prefix(900)) }
                        }
                }

                Section {
                    Button("رفض المقترح") {
                        guard let reason else { return }
                        onConfirm(reason)
                        dismiss()
                    }
                    .buttonStyle(DeskPrimaryButtonStyle(destructive: true))
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .disabled(reason == nil)
                }
            }
            .navigationTitle("رفض المقترح")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
