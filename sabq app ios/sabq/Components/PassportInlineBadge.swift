import SwiftUI

// Inline trust badge shown on the article page itself — mirrors the web's
// PassportTrustBadge (client/src/components/passport/PassportTrustBadge.tsx).
// Always-visible green pill: tapping it opens the full Content Passport sheet.
// Distinct from the "موثَّق" action-bar button (which mirrors the web's larger
// DigitalPassportButton CTA) — both entry points coexist by design.
struct PassportInlineBadge: View {
    let slug: String

    @State private var isPresented = false

    private static let emerald = Color(red: 0.16, green: 0.68, blue: 0.40)

    var body: some View {
        Button {
            SabqHaptics.light()
            isPresented = true
        } label: {
            DetailLabelPill(
                title: "موثَّق",
                tint: Self.emerald,
                icon: "checkmark.shield.fill"
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("جواز المحتوى — موثَّق")
        .sheet(isPresented: $isPresented) {
            PassportSheetView(slug: slug)
        }
    }
}
