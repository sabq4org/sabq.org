import SwiftUI

/// يرتّب مركز مباراة بحسب وضعية iPhone Duo (نموذج «مركز المباراة» المعتمد
/// 2026-10-15)، ويترك التخطيط الحالي كما هو في كل مكان آخر.
///
/// - **عادي** (الهاتف، iPad، الشاشة الخارجية): `standard` كما هو.
/// - **عمودان** (مفتوح أو كتاب): سير المباراة مع النتيجة يمينًا (`events`)،
///   وبقية التبويبات يسارًا (`side`). الفاصل بين العمودين يقع على المفصلة.
/// - **الطاولة** (مدار أفقيًا ونصف مطوي): النتيجة كبيرة فوق المفصلة لتُقرأ من
///   بعيد، لا شيء على شريطها، والتبويبات تحتها حيث تصل اليد (`bottom`). لا
///   تُطفأ الشاشة أثناء مباراة حية.
///
/// كل مركز يمرّر قطعه الحالية؛ الحالة (التبويب المختار، البيانات) تبقى عنده
/// فتنجو عند تغيير الوضعية.
struct DuoMatchLayout<Standard: View, Header: View, Events: View, Side: View, Bottom: View>: View {
    /// هل وصلت التفاصيل؟ قبلها يبقى `standard` (التحميل والخطأ).
    let hasDetail: Bool
    let isLive: Bool
    @ViewBuilder var standard: () -> Standard
    /// ترويسة النتيجة بمقياس: 1 في العمودين، 1.3 على الطاولة.
    @ViewBuilder var header: (_ scale: CGFloat) -> Header
    @ViewBuilder var events: () -> Events
    @ViewBuilder var side: () -> Side
    @ViewBuilder var bottom: () -> Bottom
    var columnTitle = "سير المباراة"
    var titleColor = Color.primary
    var dividerColor = Color.secondary.opacity(0.2)

    @State private var hinge = DuoHingeState()
    @AppStorage(FoldableDevice.observedDefaultsKey) private var foldableObserved = false

    var body: some View {
        GeometryReader { proxy in
            let layout = hasDetail && FoldableDevice.isFoldable(observed: foldableObserved)
                ? DuoPosture.matchLayout(width: proxy.size.width, hinge: hinge)
                : .standard
            Group {
                if layout == .columns {
                    columns
                } else if layout == .tabletop, let band = hinge.horizontalDivision {
                    tabletop(hingeBand: band)
                } else {
                    standard()
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .duoHingeState($hinge)
            .onChange(of: layout == .tabletop && isLive, initial: true) { _, keepAwake in
                UIApplication.shared.isIdleTimerDisabled = keepAwake
            }
        }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private var columns: some View {
        HStack(alignment: .top, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header(1)
                    Text(columnTitle)
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(titleColor)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 2)
                        .accessibilityAddTraits(.isHeader)
                    events()
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 24)
            }
            .frame(maxWidth: .infinity)

            Rectangle()
                .fill(dividerColor)
                .frame(width: 1)
                .padding(.vertical, 16)
                .padding(.horizontal, 12)

            ScrollView {
                VStack(spacing: 14) {
                    side()
                }
                .padding(.horizontal, 14)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func tabletop(hingeBand: ClosedRange<CGFloat>) -> some View {
        VStack(spacing: 0) {
            header(1.3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 20)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .frame(height: max(hingeBand.lowerBound, 0))

            Color.clear
                .frame(height: hingeBand.upperBound - hingeBand.lowerBound)
                .accessibilityHidden(true)

            VStack(spacing: 10) {
                bottom()
            }
            .padding(.top, 6)
            .frame(maxHeight: .infinity, alignment: .top)
        }
    }
}
