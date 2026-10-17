import SwiftUI

// Mirrors the web's SplitBar (client/src/components/passport/ArticlePassportPage.tsx:411).
// One horizontal bar split into amber (AI contribution) and green (human = 100 - AI).
// Labels above the bar show the side a dot indicator + percent.
struct PassportSplitBar: View {
    let aiPct: Int

    private var clamped: Int { max(0, min(100, aiPct)) }
    private var humanPct: Int { 100 - clamped }

    /// Status roles keep the amber/green meaning with text-safe contrast.
    private static let amber = SabqTheme.warning
    private static let emerald = SabqTheme.success

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space4) {
                    Circle()
                        .fill(Self.amber)
                        .frame(width: 8, height: 8)
                    Text("ذكاء اصطناعي \(clamped)%")
                        .sabqText(SabqType.tag)
                        .monospacedDigit()
                        .foregroundStyle(Self.amber)
                }

                Spacer(minLength: SabqLayout.space8)

                HStack(spacing: SabqLayout.space4) {
                    Text("\(humanPct)% بشري")
                        .sabqText(SabqType.tag)
                        .monospacedDigit()
                        .foregroundStyle(Self.emerald)
                    Circle()
                        .fill(Self.emerald)
                        .frame(width: 8, height: 8)
                }
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Background = green (human portion always visible when AI < 100)
                    Capsule()
                        .fill(Self.emerald)

                    if clamped > 0 {
                        Capsule()
                            .fill(Self.amber)
                            .frame(width: geo.size.width * CGFloat(clamped) / 100)
                    }
                }
            }
            .frame(height: 8)
        }
    }
}
