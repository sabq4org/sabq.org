import SwiftUI

// MARK: - كأس الملك — مكوّنات مشتركة
//
// تعيد استخدام هوية كأس العالم البصرية (WCTheme: أخضر زمردي + ذهبي، تكيّفية)
// وصور WCRemoteImage المُكاشَة، مع أنواع Kc الخاصة بالبطولة. هذا يطابق ثيم
// الويب لكأس الملك (emerald + amber) دون تكرار منظومة الألوان.

/// شعار نادٍ داخل دائرة بيضاء (الشعارات شفافة فتحتاج خلفية).
struct KcTeamLogo: View {
    let team: KcTeam
    var size: CGFloat = 40
    var ring: Color = Color.white.opacity(0.15)

    var body: some View {
        WCRemoteImage(url: team.logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(ring, lineWidth: 2))
    }
}

/// شارة حالة المباراة: مباشر (نبض أحمر) / انتهت / وقت الانطلاق.
struct KcStatusPill: View {
    let fixture: KcFixture
    var onDark: Bool = false

    var body: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(elapsedText)
            }
            .font(SabqFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.liveRed))
        } else if fixture.status.finished {
            Text(fixture.status.label.isEmpty ? "انتهت" : fixture.status.label)
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(WCTheme.liveRed)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(WCTheme.liveRed.opacity(onDark ? 0.20 : 0.12)))
        } else {
            Text(KcFormat.time(fixture))
                .font(SabqFonts.app(size: 11, weight: .bold))
                .foregroundStyle(WCTheme.emeraldDeep)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(WCTheme.emerald.opacity(0.16)))
        }
    }

    private var elapsedText: String {
        let s = fixture.status
        let running = ["1H", "2H", "ET", "LIVE"].contains(s.code) && s.elapsed != nil
        if running, let e = s.elapsed {
            let minute = (s.extra ?? 0) > 0 ? "\(e)+\(s.extra!)'" : "\(e)'"
            return s.label.isEmpty ? minute : "\(s.label) · \(minute)"
        }
        return s.label.isEmpty ? "مباشر" : s.label
    }
}

/// عدّ تنازلي حي يتحرّك كل ثانية (شرائح يوم/ساعة/دقيقة/ثانية).
struct KcCountdownChips: View {
    let timestamp: Int

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let total = max(0, Double(timestamp) - Date().timeIntervalSince1970)
            if total <= 0 {
                HStack(spacing: 6) {
                    Circle().fill(WCTheme.emerald).frame(width: 8, height: 8)
                    Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات")
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(WCTheme.onDark)
                }
            } else {
                let days = Int(total) / 86_400
                let hours = (Int(total) % 86_400) / 3_600
                let minutes = (Int(total) % 3_600) / 60
                let seconds = Int(total) % 60
                HStack(spacing: 8) {
                    chip(days, "يوم")
                    chip(hours, "ساعة")
                    chip(minutes, "دقيقة")
                    chip(seconds, "ثانية")
                }
            }
        }
    }

    private func chip(_ value: Int, _ label: String) -> some View {
        VStack(spacing: 1) {
            Text("\(value)")
                .font(SabqFonts.app(size: 20, weight: .black))
                .foregroundStyle(WCTheme.onDark)
            Text(label)
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(WCTheme.emeraldDeep)
        }
        .frame(minWidth: 52)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(WCTheme.chipFill))
    }
}

/// ترويسة قسم: أيقونة + عنوان + وصف.
struct KcSectionHeader: View {
    let icon: String
    let title: String
    let subtitle: String
    var tint: Color = WCTheme.emeraldDeep

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 20, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint.opacity(0.12)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(SabqFonts.headline(size: 21))
                    .foregroundStyle(WCTheme.onDark)
                Text(subtitle)
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(WCTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
    }
}

/// مؤشر تحميل بلون العلامة.
struct KcLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(WCTheme.emeraldDeep); Spacer() }
            .padding(.vertical, 32)
    }
}

/// شريط احتمالات الفوز الثلاثي — مرآة WCProbabilityBar بألوان العائلة نفسها.
/// المصدر: API-Football predictions (الخادم يُسقط العنصر الوهمي 33/33/33).
struct KcProbabilityBar: View {
    let fixture: KcFixture
    let prediction: KcPrediction

    var body: some View {
        let total = max(1, prediction.homePct + prediction.drawPct + prediction.awayPct)
        let h = Int(Double(prediction.homePct) / Double(total) * 100)
        let d = Int(Double(prediction.drawPct) / Double(total) * 100)
        let a = Int(Double(prediction.awayPct) / Double(total) * 100)
        VStack(spacing: 6) {
            HStack {
                Text("فوز \(fixture.home.name) \(h)%")
                Spacer()
                Text("تعادل \(d)%").foregroundStyle(WCTheme.onDarkDim)
                Spacer()
                Text("فوز \(fixture.away.name) \(a)%")
            }
            .font(SabqFonts.app(size: 11, weight: .semibold))
            .foregroundStyle(WCTheme.emeraldDeep)

            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(WCTheme.royal).frame(width: geo.size.width * CGFloat(h) / 100)
                    Rectangle().fill(WCTheme.onDarkDim.opacity(0.5)).frame(width: geo.size.width * CGFloat(d) / 100)
                    Rectangle().fill(WCTheme.gold)
                }
            }
            .frame(height: 10)
            .clipShape(Capsule())

            Text("توقعات خوارزمية للاستئناس من مزود البيانات")
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(WCTheme.onDarkDim)
        }
    }
}

/// شريط احتمالات ذاتي الجلب — للمواضع التي لا يصلها التوقّع جاهزًا
/// (مركز المباراة). يختفي بصمت قبل توفّر توقّع حقيقي أو بعد نهاية المباراة.
struct KcFetchedPrediction: View {
    let fixture: KcFixture
    @State private var prediction: KcPrediction?

    var body: some View {
        Group {
            if let p = prediction, !fixture.status.finished {
                KcProbabilityBar(fixture: fixture, prediction: p)
            }
        }
        .task(id: fixture.id) {
            guard !fixture.status.finished else { return }
            prediction = try? await APIClient.shared.fetchKingsCupPrediction(fixtureId: fixture.id)
        }
    }
}

/// جلب بمحاولتين: فشل عابر (حد دقيقة المزوّد/شبكة) يعاد بعد 1.5ث تلقائيًا
/// قبل إظهار أي خطأ — يعالج «تعذر جلب التفاصيل» الخاطف على البرود.
func kcRetrying<T: Sendable>(_ op: @Sendable () async throws -> T) async -> T? {
    if let r = try? await op() { return r }
    try? await Task.sleep(nanoseconds: 1_500_000_000)
    return try? await op()
}

/// نص حالة فارغة موحّد داخل الأقسام.
@ViewBuilder
func kcEmptyText(_ message: String) -> some View {
    Text(message)
        .font(SabqFonts.app(size: 13))
        .foregroundStyle(WCTheme.onDarkDim)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
}
