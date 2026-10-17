import SwiftUI

/// شريط ترددات «نشرة سَبْق»: أعمدة رفيعة تتراقص أثناء التشغيل وتسكن عند
/// الإيقاف، وتؤدي دور شريط التقدم (الجزء المسموع بلون الهوية، والباقي باهت).
///
/// الحركة محاكاة لا قياس فعلي للصوت: قياس المستويات يحتاج نقرة معالجة على
/// مشغّل البث المشترك (Now Playing/القفل)، وهو مخاطرة لا تستحقها زينة بصرية.
/// كل عمود يجمع موجتين بسرعتين مختلفتين فلا يتكرر النمط بشكل آلي.
/// يحترم «تقليل الحركة»: تبقى الأعمدة ساكنة بشكلها الأساسي.
struct BulletinWaveform: View {
    let progress: Double
    let isPlaying: Bool
    var barCount = 42
    var height: CGFloat = 26

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.layoutDirection) private var layoutDirection

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !isPlaying || reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let animate = isPlaying && !reduceMotion
            Canvas { gc, size in
                let step = size.width / CGFloat(barCount)
                let barWidth = max(1.5, step * 0.55)
                let played = SabqTheme.primary
                let pending = SabqTheme.primary.opacity(0.22)
                for i in 0..<barCount {
                    let level = Self.level(index: i, time: t, animate: animate)
                    let h = max(3, size.height * level)
                    // بداية النشرة من جهة بداية السطر (اليمين في RTL)
                    let slot = layoutDirection == .rightToLeft ? barCount - 1 - i : i
                    let x = CGFloat(slot) * step + (step - barWidth) / 2
                    let rect = CGRect(x: x, y: (size.height - h) / 2, width: barWidth, height: h)
                    let isPlayed = Double(i) / Double(barCount) < progress
                    gc.fill(Path(roundedRect: rect, cornerRadius: barWidth / 2), with: .color(isPlayed ? played : pending))
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }

    /// ارتفاع العمود (0…1): شكل أساسي ثابت يشبه موجة كلام، تضربه حركة حين التشغيل.
    static func level(index i: Int, time t: Double, animate: Bool) -> CGFloat {
        let x = Double(i)
        let base = 0.38 + 0.32 * abs(sin(x * 0.73)) * (0.6 + 0.4 * abs(cos(x * 0.29)))
        guard animate else { return CGFloat(base) }
        let a = sin(t * (6.1 + (x.truncatingRemainder(dividingBy: 5)) * 1.1) + x * 1.37)
        let b = sin(t * (2.7 + (x.truncatingRemainder(dividingBy: 3)) * 0.8) + x * 0.61)
        let motion = 0.5 + 0.5 * (0.65 * a + 0.35 * b) // 0…1
        // مدى واسع (من نقطة إلى كامل الارتفاع) يقرأ كترددات حية لا كاهتزاز خفيف
        return CGFloat(min(1, max(0.14, 0.14 + 0.86 * motion * (0.55 + 0.45 * base / 0.7))))
    }
}
