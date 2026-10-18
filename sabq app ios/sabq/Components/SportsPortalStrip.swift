import SwiftUI

/// شريط المدخل إلى الرياضة تحت الهيرو — نقل SportsPortalStrip.tsx: سطر واحد بارتفاع ثابت
/// يعرض أهم مباراة سعودية أو كبرى جارية أو قادمة اليوم، وإلا عدّاد أقرب بطولة.
struct SportsPortalStrip: View {
    @Environment(\.homeSideColumn) private var compactType
    @State private var headline: SportsHeadline.Headline?
    /// عمود Duo: بطاقة بهوامش الصفحة وإطار بطاقات العمود (كشريط النشرة) بدل
    /// الشريط الممتد من حافة إلى حافة الذي يناسب الهاتف — بطلب المالك
    /// 2026-10-18 («يحتاج توازن مع بقية العناصر»).
    @Environment(\.opensArticlesInReader) private var inColumn
    @Environment(\.homeSpreadLayout) private var inSpread

    var body: some View {
        ReaderLink(value: SportsTodayRoute()) {
            HStack(spacing: SabqLayout.space8) {
                if headline?.live == true {
                    HStack(spacing: 4) {
                        Circle().fill(SabqTheme.breaking).frame(width: 6, height: 6)
                        Text("مباشر")
                    }
                    .font(SabqType.tag.scaled(compactType).font)
                    .foregroundStyle(SabqTheme.breaking)
                    .padding(.horizontal, SabqLayout.space8)
                    .padding(.vertical, 2)
                    .background(SabqTheme.breaking.opacity(0.1), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                } else {
                    Text("الرياضة")
                        .font(SabqType.tag.scaled(compactType).font)
                        .foregroundStyle(SabqTheme.primary)
                        .padding(.horizontal, SabqLayout.space8)
                        .padding(.vertical, 2)
                        .background(SabqTheme.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                }

                if let match = headline?.match {
                    HStack(spacing: 6) {
                        Text(match.home.name).lineLimit(1)
                        if headline?.live == true {
                            Text(verbatim: "\(match.goals?.away ?? 0) - \(match.goals?.home ?? 0)")
                                .monospacedDigit()
                                .environment(\.layoutDirection, .leftToRight)
                        } else {
                            Text("×").foregroundStyle(SabqTheme.textTertiary)
                        }
                        Text(match.away.name).lineLimit(1)
                    }
                    .font(SabqType.metaEmphasis.scaled(compactType).font)
                    .foregroundStyle(SabqTheme.textPrimary)
                } else {
                    Text(headline?.text ?? "مباريات اليوم لكل البطولات")
                        .font(SabqType.metaEmphasis.scaled(compactType).font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1)
                }
                Spacer(minLength: SabqLayout.space4)
                Image(systemName: "chevron.left")
                    .font(SabqType.tag.scaled(compactType).font)
                    .foregroundStyle(SabqTheme.primary)
            }
            .frame(height: 48)
            .padding(.horizontal, inColumn ? 12 : SabqLayout.pageMargin)
            .modifier(StripSurface(card: inColumn || inSpread))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint("يفتح مباريات اليوم لكل البطولات")
        .task {
            // مباريات اليوم تحمل حالة المباشر، فلا نبض سريع على الرئيسية (دقيقة مع مباريات، وإلا خمس).
            while !Task.isCancelled {
                async let today = try? APIClient.shared.fetchSportsToday()
                async let comps = try? APIClient.shared.fetchSportsCompetitions()
                let fixtures = await today?.today ?? []
                headline = SportsHeadline.pick(fixtures, competitions: await comps ?? [])
                try? await Task.sleep(for: .seconds(fixtures.isEmpty ? 300 : 60))
            }
        }
    }

    private var accessibilityText: String {
        guard let h = headline else { return "الرياضة: مباريات اليوم" }
        if let m = h.match {
            return h.live
                ? "مباشر: \(m.home.name) \(m.goals?.home ?? 0)، \(m.away.name) \(m.goals?.away ?? 0)"
                : "\(m.home.name) ضد \(m.away.name)، \(h.tail)"
        }
        return h.text ?? "الرياضة"
    }
}

private struct StripSurface: ViewModifier {
    let card: Bool

    func body(content: Content) -> some View {
        if card {
            content.sabqSkyCardSurface()
        } else {
            // لون صلب يتمدد افتراضيًا في حواف الأمان: في عمود Duo مفتوحًا امتد إلى
            // شريط الحسّاس تحت الساعة (بلاغ المالك 2026-10-18). الحافة حافة المحتوى.
            content.background(SabqTheme.surfaceMuted, ignoresSafeAreaEdges: [])
        }
    }
}
