import SwiftUI

// Inline trust badge shown on the article page itself — mirrors the web's
// PassportTrustBadge (client/src/components/passport/PassportTrustBadge.tsx).
// Always-visible green pill: tapping it opens the full Content Passport sheet.
// Distinct from the "موثَّق" action-bar button (which mirrors the web's larger
// DigitalPassportButton CTA) — both entry points coexist by design.
struct PassportInlineBadge: View {
    let slug: String

    @State private var isPresented = false


    var body: some View {
        Button {
            SabqHaptics.light()
            isPresented = true
        } label: {
            DetailLabelPill(
                title: "موثَّق",
                tint: SabqTheme.success,
                icon: "checkmark.shield.fill"
            )
        }
        .contentShape(Rectangle().inset(by: -10))
        .buttonStyle(.plain)
        .accessibilityLabel("جواز المحتوى — موثَّق")
        .sheet(isPresented: $isPresented) {
            PassportSheetView(slug: slug)
        }
    }
}
