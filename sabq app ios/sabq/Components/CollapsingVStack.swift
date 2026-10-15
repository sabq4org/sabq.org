import SwiftUI

/// عمود رأسي لا يحجز مسافة للعناصر الفارغة.
///
/// شرائط الرئيسية التي تختفي ذاتيًا (المونديال، كأس الملك، روشن، مُقترب، الحج)
/// تُبقي حامل مكان بحجم صفر داخل `ZStack` كي يعيش `.task` قبل وصول البيانات —
/// فخ Group+EmptyView المعروف. لكن `VStack` العادي يعامل الحامل عنصرًا كاملًا
/// فيضيف مسافته (20) قبله وبعده، وتراكمت ثلاث مسافات فارغة تحت بطاقة الاقتصاد
/// عندما كانت شرائط البطولات الثلاث مخفية. هذا التخطيط يتجاهل كل عنصر ارتفاعه
/// المقترح صفر عند حساب المسافات، ويترك ما عداه كما يفعل `VStack(alignment: .leading)`.
/// الحشو السالب لا يفي بالغرض لأن SwiftUI لا يسمح بحجم سالب.
struct CollapsingVStack: Layout {
    var spacing: CGFloat = 20

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        var height: CGFloat = 0
        var placed = 0
        for subview in subviews {
            let h = subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
            guard h > 0 else { continue }
            height += (placed > 0 ? spacing : 0) + h
            placed += 1
        }
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        var placed = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            guard size.height > 0 else {
                subview.place(at: CGPoint(x: bounds.minX, y: y), anchor: .topLeading,
                              proposal: ProposedViewSize(width: bounds.width, height: 0))
                continue
            }
            if placed > 0 { y += spacing }
            subview.place(at: CGPoint(x: bounds.minX, y: y), anchor: .topLeading,
                          proposal: ProposedViewSize(width: bounds.width, height: size.height))
            y += size.height
            placed += 1
        }
    }
}
