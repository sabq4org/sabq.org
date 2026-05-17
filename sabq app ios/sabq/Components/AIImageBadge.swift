import SwiftUI

/// Compact pill that overlays hero/thumbnail images produced by the
/// dashboard's AI image generator. Matches the web disclosure
/// convention from `client/src/components/ImageWithCaption.tsx`.
///
/// Position the caller-side using `.overlay(alignment: .topTrailing)`
/// so the badge sits in the top-LEFT of the hero visually (in an RTL
/// app, `.topTrailing` resolves to top-left). This matches the web,
/// which uses an explicit `left-3` class regardless of layout
/// direction.
///
/// The model name is intentionally NOT shown — it pushed the pill
/// past the visible width on hero photos and the average reader
/// doesn't need to know whether it was nano-banana vs gemini.
struct AIImageBadge: View {
    let model: String?

    init(model: String? = nil) {
        self.model = model
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "sparkles")
                .font(.system(size: 9, weight: .bold))
            Text("ذكاء اصطناعي")
                .font(.system(size: 10, weight: .heavy))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(
            Capsule().fill(.black.opacity(0.55))
        )
        .overlay(
            Capsule().stroke(.white.opacity(0.18), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.18), radius: 4, x: 0, y: 1)
        .padding(8)
    }
}
