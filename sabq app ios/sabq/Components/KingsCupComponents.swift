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
