import SwiftUI

// MARK: - كأس آسيا — مكونات مشتركة (نظير WorldCupComponents)

/// صورة بعيدة (شعار منتخب / صورة لاعب) مع كاش عبر CachedAsyncImage.
struct AcRemoteImage: View {
    let url: String
    var contentMode: ContentMode = .fit
    var maxPixelSize: CGFloat = 300

    var body: some View {
        CachedAsyncImage(
            url: URL(string: url),
            contentMode: contentMode,
            maxPixelSize: maxPixelSize
        ) {
            Color.clear
        }
    }
}

/// شعار منتخب داخل دائرة بيضاء (الشعارات شفافة فتحتاج خلفية).
struct AcTeamLogo: View {
    let team: AcTeam
    var size: CGFloat = 40
    var ring: Color = Color.white.opacity(0.15)

    var body: some View {
        AcRemoteImage(url: team.logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(ring, lineWidth: 2))
    }
}

/// شارة حالة المباراة: مباشر (نبض أبيض) / انتهت / وقت الانطلاق.
struct AcStatusPill: View {
    let fixture: AcFixture
    var onDark: Bool = false

    var body: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(elapsedText)
            }
            .font(SabqFonts.app(size: 11, weight: .medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(AcTheme.liveRed))
        } else if fixture.status.finished {
            Text(fixture.status.label)
                .font(SabqFonts.app(size: 11, weight: .regular))
                .foregroundStyle(AcTheme.liveRed)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.liveRed.opacity(onDark ? 0.20 : 0.12)))
        } else {
            Text(AcFormat.time(fixture))
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(AcTheme.emeraldDeep)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.emerald.opacity(0.16)))
        }
    }

    private var elapsedText: String {
        let s = fixture.status
        let running = ["1H", "2H", "ET", "LIVE"].contains(s.code) && s.elapsed != nil
        if running, let e = s.elapsed {
            return s.label.isEmpty ? "\(e)'" : "\(s.label) · \(e)'"
        }
        return s.label.isEmpty ? "مباشر" : s.label
    }
}

/// عدّ تنازلي حي يتحرّك كل ثانية (TimelineView).
struct AcCountdownChips: View {
    let timestamp: Int

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let total = max(0, Double(timestamp) - Date().timeIntervalSince1970)
            if total <= 0 {
                HStack(spacing: 6) {
                    Circle().fill(AcTheme.emerald).frame(width: 8, height: 8)
                    Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(AcTheme.onDark)
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
                .environment(\.layoutDirection, .leftToRight)
            }
        }
    }

    private func chip(_ value: Int, _ label: String) -> some View {
        VStack(spacing: 1) {
            Text("\(value)")
                .font(SabqFonts.app(size: 18, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
            Text(label)
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(AcTheme.emeraldDeep)
        }
        .frame(minWidth: 52)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(AcTheme.chipFill))
    }
}

/// شريط احتمالات الفوز الثلاثي.
struct AcProbabilityBar: View {
    let fixture: AcFixture
    let prediction: AcMatchPrediction

    var body: some View {
        let total = max(1, prediction.home + prediction.draw + prediction.away)
        let h = Int(Double(prediction.home) / Double(total) * 100)
        let d = Int(Double(prediction.draw) / Double(total) * 100)
        let a = Int(Double(prediction.away) / Double(total) * 100)
        VStack(spacing: 6) {
            HStack {
                Text("فوز \(fixture.home.name) \(h)%")
                Spacer()
                Text("تعادل \(d)%").foregroundStyle(AcTheme.onDarkDim)
                Spacer()
                Text("فوز \(fixture.away.name) \(a)%")
            }
            .font(SabqFonts.app(size: 11, weight: .regular))
            .foregroundStyle(AcTheme.emeraldDeep)

            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(AcTheme.royal).frame(width: geo.size.width * CGFloat(h) / 100)
                    Rectangle().fill(AcTheme.onDarkDim.opacity(0.5)).frame(width: geo.size.width * CGFloat(d) / 100)
                    Rectangle().fill(AcTheme.sky)
                }
            }
            .frame(height: 10)
            .clipShape(Capsule())

            Text("توقعات خوارزمية للاستئناس من مزود البيانات")
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(AcTheme.onDarkDim)
        }
    }
}

/// ترويسة قسم: أيقونة + عنوان + وصف.
struct AcSectionHeader: View {
    let icon: String
    let title: String
    let subtitle: String
    var tint: Color = AcTheme.emeraldDeep

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
                    .foregroundStyle(AcTheme.onDark)
                Text(subtitle)
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
    }
}

/// حالة فارغة داخل بطاقة داكنة.
struct AcEmptyDark: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(SabqFonts.app(size: 30)).foregroundStyle(AcTheme.emerald)
            Text(title).font(SabqFonts.app(size: 16, weight: .semibold)).foregroundStyle(AcTheme.onDark)
            Text(subtitle).font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 24)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(AcTheme.card))
    }
}

/// مؤشر تحميل بلون العلامة.
struct AcLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(AcTheme.emeraldDeep); Spacer() }
            .padding(.vertical, 32)
    }
}

/// بلاطة حقيقة: قيمة كبيرة فوق وصف صغير.
struct AcFactTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(SabqFonts.app(size: 15, weight: .semibold).monospacedDigit())
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label)
                .font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9).padding(.horizontal, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(AcTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(AcTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }
}

/// نقاط شكل آخر 5 مباريات (سلسلة W/D/L).
struct AcFormDots: View {
    let form: [String]
    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(form.suffix(5).enumerated()), id: \.offset) { _, ch in
                Circle().fill(color(ch)).frame(width: 6, height: 6)
            }
        }
        .environment(\.layoutDirection, .leftToRight)
    }
    private func color(_ ch: String) -> Color {
        switch ch { case "W": return AcTheme.emeraldDeep; case "D": return AcTheme.onDarkDim; case "L": return AcTheme.liveRed; default: return AcTheme.cardStroke }
    }
}

/// هوية فتح بطاقة لاعب عبر .sheet(item:) — يتجاهل المعرّفات غير الصالحة (0).
nonisolated struct AcPlayerSelection: Identifiable {
    let id: Int
    init?(_ playerId: Int?) {
        guard let playerId, playerId > 0 else { return nil }
        self.id = playerId
    }
}

/// نص فارغ لطيف داخل تبويبات مركز المباراة (نظير emptyText للمونديال).
@ViewBuilder
func acEmptyText(_ message: String) -> some View {
    Text(message)
        .font(SabqFonts.app(size: 13))
        .foregroundStyle(AcTheme.onDarkDim)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
}
