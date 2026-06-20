import SwiftUI

// MARK: - World Cup — مكونات مشتركة

/// صورة بعيدة (شعار منتخب / صورة لاعب) مع بديل أثناء التحميل.
/// شعارات api-sports صغيرة ويكفيها كاش URLSession الافتراضي.
struct WCRemoteImage: View {
    let url: String
    var contentMode: ContentMode = .fit

    var body: some View {
        AsyncImage(url: URL(string: url)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: contentMode)
            case .failure:
                Color.clear
            default:
                Color.clear
            }
        }
    }
}

/// شعار منتخب داخل دائرة بيضاء (الشعارات شفافة فتحتاج خلفية).
struct WCTeamLogo: View {
    let team: WCTeam
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
struct WCStatusPill: View {
    let fixture: WCFixture
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
            Text(fixture.status.label)
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(onDark ? Color.white.opacity(0.85) : WCTheme.onDarkDim)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(onDark ? Color.white.opacity(0.12) : WCTheme.chipFill))
        } else {
            Text(WCFormat.time(fixture))
                .font(SabqFonts.app(size: 11, weight: .bold))
                .foregroundStyle(WCTheme.emeraldDeep)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(WCTheme.emerald.opacity(0.16)))
        }
    }

    private var elapsedText: String {
        guard let e = fixture.status.elapsed else { return fixture.status.label }
        // الوقت بدل الضائع: 90+8' بدل 90' المجمدة في أكثر دقائق المباراة توترًا
        if let x = fixture.status.extra, x > 0 { return "\(e)+\(x)'" }
        return "\(e)'"
    }
}

/// عدّ تنازلي حي يتحرّك كل ثانية (TimelineView).
struct WCCountdownChips: View {
    let timestamp: Int

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let total = max(0, Double(timestamp) - Date().timeIntervalSince1970)
            if total <= 0 {
                // الموعد حان والمزود لم يرفع إشارة «حية» بعد — لا أصفار مجمدة
                HStack(spacing: 6) {
                    Circle()
                        .fill(WCTheme.emerald)
                        .frame(width: 8, height: 8)
                    Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات")
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(.white)
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
                .foregroundStyle(.white)
            Text(label)
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(WCTheme.emerald.opacity(0.85))
        }
        .frame(minWidth: 52)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white.opacity(0.10)))
    }
}

/// شريط احتمالات الفوز الثلاثي.
struct WCProbabilityBar: View {
    let fixture: WCFixture
    let prediction: WCPrediction

    var body: some View {
        let total = max(1, prediction.home + prediction.draw + prediction.away)
        let h = Int(Double(prediction.home) / Double(total) * 100)
        let d = Int(Double(prediction.draw) / Double(total) * 100)
        let a = Int(Double(prediction.away) / Double(total) * 100)
        VStack(spacing: 6) {
            HStack {
                Text("فوز \(fixture.home.name) \(h)%")
                Spacer()
                Text("تعادل \(d)%").foregroundStyle(.white.opacity(0.6))
                Spacer()
                Text("فوز \(fixture.away.name) \(a)%")
            }
            .font(SabqFonts.app(size: 11, weight: .semibold))
            .foregroundStyle(WCTheme.emerald.opacity(0.9))

            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(WCTheme.emerald).frame(width: geo.size.width * CGFloat(h) / 100)
                    Rectangle().fill(Color.white.opacity(0.55)).frame(width: geo.size.width * CGFloat(d) / 100)
                    Rectangle().fill(WCTheme.sky)
                }
            }
            .frame(height: 10)
            .clipShape(Capsule())

            Text("توقعات خوارزمية للاستئناس من مزود البيانات")
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(.white.opacity(0.4))
        }
    }
}

/// ترويسة قسم: أيقونة + عنوان + وصف.
struct WCSectionHeader: View {
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

/// حالة فارغة لطيفة داخل بطاقة.
struct WCEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 30))
                .foregroundStyle(WCTheme.emeraldDeep)
            Text(title)
                .font(SabqFonts.subhead(size: 15))
                .foregroundStyle(WCTheme.onDark)
            Text(subtitle)
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

/// مؤشر تحميل بلون العلامة.
struct WCLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(.white); Spacer() }
            .padding(.vertical, 32)
    }
}
