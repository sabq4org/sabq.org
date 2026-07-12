import SwiftUI

/// تفضيلات تنبيهات أحداث المباريات (أسلوب VARA / سبق) —
/// GET/PUT `/api/v1/sports/alert-prefs`.
struct AcMatchEventNotificationsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var prefs: AcAlertPreferences = .allOn
    @State private var loaded = false
    @State private var saving = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(L("notifications.prefs.intro"))
                    .font(AsianCupFonts.app(size: 13))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .padding(.horizontal, 4)

                VStack(spacing: 0) {
                    toggleRow(title: L("notifications.prefs.kickoff"), subtitle: L("notifications.prefs.kickoff.subtitle"), isOn: $prefs.kickoff)
                    Divider().opacity(0.3)
                    toggleRow(title: L("notifications.prefs.goals"), subtitle: L("notifications.prefs.goals.subtitle"), isOn: $prefs.goals)
                    Divider().opacity(0.3)
                    toggleRow(title: L("notifications.prefs.cards"), subtitle: L("notifications.prefs.cards.subtitle"), isOn: $prefs.cards)
                    Divider().opacity(0.3)
                    toggleRow(title: L("notifications.prefs.var"), subtitle: L("notifications.prefs.var.subtitle"), isOn: $prefs.varReview)
                    Divider().opacity(0.3)
                    toggleRow(title: L("notifications.prefs.fulltime"), subtitle: L("notifications.prefs.fulltime.subtitle"), isOn: $prefs.fulltime)
                }
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .fill(AcTheme.cardFill)
                )

                if saving {
                    HStack(spacing: 6) {
                        ProgressView().controlSize(.small)
                        Text(L("notifications.prefs.saving"))
                            .font(AsianCupFonts.app(size: 11))
                            .foregroundStyle(AcTheme.onDarkDim)
                    }
                }
                if let errorMessage {
                    Text(errorMessage)
                        .font(AsianCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(AcTheme.crimson)
                }
            }
            .padding(16)
        }
        .background(AcAmbientBackground())
        .navigationTitle(L("notifications.prefs.title"))
        .navigationBarTitleDisplayMode(.inline)
        .asianCupRTL()
        .task {
            if let p = try? await APIClient.shared.fetchAcAlertPreferences() {
                prefs = p
                loaded = true
            }
        }
        .onChange(of: prefs) { _, newPrefs in
            guard loaded else { return }
            Task { await save(newPrefs) }
        }
    }

    private func toggleRow(title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(AcTheme.onDark)
                Text(subtitle)
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
            }
        }
        .tint(AcTheme.emerald)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private func save(_ prefs: AcAlertPreferences) async {
        saving = true
        defer { saving = false }
        do {
            try await APIClient.shared.updateAcAlertPreferences(prefs)
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
    }
}
