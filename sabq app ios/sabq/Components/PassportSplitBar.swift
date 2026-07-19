import SwiftUI

// Mirrors the web's SplitBar (client/src/components/passport/ArticlePassportPage.tsx:411).
// One horizontal bar split into amber (AI contribution) and emerald (human = 100 - AI).
// Labels above the bar show the side a square indicator + percent.
struct PassportSplitBar: View {
    let aiPct: Int

    private var clamped: Int { max(0, min(100, aiPct)) }
    private var humanPct: Int { 100 - clamped }

    private static let amber = Color(red: 0.96, green: 0.62, blue: 0.04)
    private static let emerald = Color(red: 0.16, green: 0.68, blue: 0.40)

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Self.amber)
                        .frame(width: 8, height: 8)
                    Text("ذكاء اصطناعي \(clamped)%")
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Self.amber)
                }

                Spacer(minLength: 8)

                HStack(spacing: 5) {
                    Text("\(humanPct)% بشري")
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Self.emerald)
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Self.emerald)
                        .frame(width: 8, height: 8)
                }
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Background = emerald (human portion always visible when AI < 100)
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Self.emerald.opacity(0.30))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .stroke(Self.emerald.opacity(0.50), lineWidth: 0.5)
                        )

                    if clamped > 0 {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(Self.amber)
                            .frame(width: geo.size.width * CGFloat(clamped) / 100)
                    }
                }
            }
            .frame(height: 8)
        }
    }
}
