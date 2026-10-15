import SwiftUI

/// أعمدة الشبكات التي تتكيف مع عرض الحاوية بدل عددٍ ثابت.
///
/// `[GridItem(.flexible()), GridItem(.flexible())]` يعطي عمودين دائمًا: على
/// الهاتف مناسب، لكن على عمود القارئ في iPhone Duo مفتوحًا (600–700 نقطة)
/// أو iPad تتمدد البطاقات عريضة وفارغة. `.adaptive(minimum:)` يبقي عمودين
/// على الهاتف (343 نقطة متاحة ÷ 150 = 2) ويزيدها إلى 3–4 حين يتسع العرض.
///
/// `minimum` الافتراضي 150 مضبوط بحيث لا ينزل أي هاتف مدعوم (≥ 375 نقطة مع
/// هوامش 16) إلى عمود واحد؛ للبطاقات الأصغر (شعارات، أرقام) مرّر قيمة أقل.
enum SabqGrid {
    static func adaptive(minimum: CGFloat = 150, spacing: CGFloat = 10) -> [GridItem] {
        [GridItem(.adaptive(minimum: minimum), spacing: spacing)]
    }
}
