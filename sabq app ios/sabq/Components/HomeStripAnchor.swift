import SwiftUI

/// حامل مكان بحجم صفر لشرائط الرئيسية التي تختفي ذاتيًا بلا بيانات.
///
/// وجوده داخل `ZStack` يمنع SwiftUI من إلغاء العرض (وبالتالي `.task`) قبل
/// وصول البيانات — فخ Group+EmptyView المعروف. مسافة العمود لا تُحجز له لأن
/// الرئيسية ترصّ عناصرها بـ`CollapsingVStack` الذي يتجاهل الارتفاع الصفري.
struct HomeStripAnchor: View {
    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
    }
}
