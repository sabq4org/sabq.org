import SwiftUI

// MARK: - تحسين الرئيسية (نموذج أولي محلي 2026-11-24)
//
// شكوى المالك: الرئيسية «بطاقات بطاقات بطاقات». التحسين داخل الهوية المعتمدة
// (الخلفية الرمادية المزرقة، الأسطح البيضاء، أزرق سبق) لكنه يقلّل الأشكال
// المؤطرة قبل أول خبر، ويستبدل حبوب الوسوم في القائمة بنص.
// يُفعَّل بمعامل التشغيل `-homeRefresh YES` كي يُصوَّر «قبل» و«بعد» من البناء نفسه.

enum HomeRefresh {
    static var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: "homeRefresh")
    }
}

extension EnvironmentValues {
    /// الرئيسية المحسّنة: تقرأه الصفوف والهيرو والعاجل ورأس الصفحة.
    @Entry var homeRefresh = false
    /// داخل سطح جامع: الأسطح الفرعية (رياضة، اقتصاد، دوري) ترسم بلا إطار ولا ظل.
    @Entry var sabqFlatSurface = false
}

/// سطح واحد يجمع شرائح «اليوم» (الرياضة، الاقتصاد، البطولات، روشن) بفواصل
/// رفيعة بدل ثلاث بطاقات متتالية. الشرائح التي لا بيانات لها تختفي ذاتيًا،
/// فلا يُرسم لها فاصل.
struct HomeTodayGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        if #available(iOS 18.0, *) {
            Group(subviews: content) { subviews in
                if !subviews.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        // الفاصل فوق كل شريحة لا بينها: الشريحة الفارغة بارتفاع صفر،
                        // ففاصلها ينطبق على فاصل التالية بدل أن يتراكم خطًا سميكًا.
                        ForEach(Array(subviews.enumerated()), id: \.element.id) { index, subview in
                            subview
                                .overlay(alignment: .top) {
                                    if index > 0 {
                                        SidebarRowDivider()
                                            .padding(.horizontal, SabqLayout.space16)
                                    }
                                }
                        }
                    }
                    .environment(\.sabqFlatSurface, true)
                    .sabqNewsSurface()
                }
            }
        } else {
            VStack(spacing: SabqLayout.space16) { content }
        }
    }
}

/// وسم نصي بلا كبسولة: اسم القسم بالأزرق، و«جديد» بالأخضر بنقطة.
struct HomeTextTag: View {
    let text: String
    var tint: Color = SabqTheme.primary
    var dot = false

    var body: some View {
        HStack(spacing: 4) {
            if dot {
                Circle().fill(tint).frame(width: 6, height: 6)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(SabqType.tag.font)
                .foregroundStyle(tint)
                .lineLimit(1)
        }
        .fixedSize(horizontal: true, vertical: false)
    }
}
