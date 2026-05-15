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
            HStack(spacing: 5) {
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 11, weight: .bold))
                Text("موثَّق")
                    .font(.system(size: 12, weight: .bold))
            }
            .foregroundStyle(Self.emerald)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule(style: .continuous)
                    .fill(Self.emerald.opacity(0.10))
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(Self.emerald.opacity(0.40), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("جواز المحتوى — موثَّق")
        .sheet(isPresented: $isPresented) {
            PassportSheetView(slug: slug)
        }
    }
}
