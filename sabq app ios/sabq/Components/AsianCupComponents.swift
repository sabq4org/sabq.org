import SwiftUI

// MARK: - كأس آسيا — مكونات مشتركة (نظير WorldCupComponents)
//
// نموذج سبق المعتمد: صفحة بيضاء، أقسام بلا صناديق تفصلها خطوط رفيعة، زوايا
// 8/12/كبسولة، ومقياس الخط الموحّد. تبقى هوية البطولة التركوازية لكنةً فقط.

/// أدوار لون البطولة فوق نظام سبق.
nonisolated enum AcStyle {
    /// نص ولكنة (العنوان النشط، النقاط، الوقت) — متكيّف وآمن التباين في الوضعين.
    static let accent = AcTheme.emeraldDeep
    /// تعبئة ثابتة داكنة تحمل نصًا أبيض (التبويب النشط، شريط الهوية، زر المتابعة).
    static let accentFill = AcTheme.royal
}

extension View {
    /// بلوك هادئ: تعبئة رمادية خفيفة بلا حدود، زاوية 12.
    func acQuietBlock() -> some View {
        background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    /// شريحة/تبويب: المختار بلون الهوية ونص أبيض، والباقي رمادي هادئ.
    func acChip(selected: Bool) -> some View {
        self
            .font(SabqType.tag.font)
            .foregroundStyle(selected ? SabqTheme.onAction : SabqTheme.textPrimary)
            .padding(.horizontal, SabqLayout.space12)
            .frame(minHeight: SabqLayout.touchTarget)
            .background(Capsule().fill(selected ? AcStyle.accentFill : SabqTheme.surfaceMuted))
            .contentShape(Capsule())
    }
}

/// خط فاصل رفيع بين صفوف القائمة.
struct AcRowDivider: View {
    var body: some View {
        Rectangle()
            .fill(SabqTheme.separator)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

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
            SabqImagePlaceholder()
        }
    }
}

/// شعار منتخب داخل دائرة بيضاء (الشعارات شفافة فتحتاج خلفية).
struct AcTeamLogo: View {
    let team: AcTeam
    var size: CGFloat = 40
    var ring: Color = SabqTheme.separator

    var body: some View {
        AcRemoteImage(url: team.logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .clipShape(Circle())
            .overlay(Circle().stroke(ring, lineWidth: 1))
    }
}

/// صورة لاعب دائرية، وحين تغيب صورته دائرة رمادية هادئة.
struct AcPlayerAvatar: View {
    let photo: String
    var size: CGFloat = 40
    var initials: String? = nil

    var body: some View {
        Group {
            if photo.isEmpty {
                Circle().fill(SabqTheme.surfaceMuted)
                    .overlay {
                        if let initials, !initials.isEmpty {
                            Text(initials)
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
            } else {
                AcRemoteImage(url: photo, contentMode: .fill)
                    .clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
    }
}

/// شارة حالة المباراة: مباشر / انتهت / وقت الانطلاق.
struct AcStatusPill: View {
    let fixture: AcFixture
    /// فوق شريط الهوية الداكن: نص أبيض على تعبئة شفافة.
    var onDark: Bool = false

    var body: some View {
        Group {
            if fixture.status.live {
                HStack(spacing: SabqLayout.space4) {
                    Circle().fill(onDark ? Color.white : SabqTheme.danger).frame(width: 6, height: 6)
                    Text(elapsedText)
                }
                .foregroundStyle(onDark ? Color.white : SabqTheme.danger)
            } else if fixture.status.finished {
                Text(fixture.status.label)
                    .foregroundStyle(onDark ? Color.white : SabqTheme.textSecondary)
            } else {
                Text(AcFormat.time(fixture))
                    .foregroundStyle(onDark ? Color.white : AcStyle.accent)
            }
        }
        .font(SabqType.tag.font)
        .padding(.horizontal, SabqLayout.space8)
        .padding(.vertical, SabqLayout.space4)
        .background(Capsule().fill(onDark ? Color.white.opacity(0.16) : SabqTheme.surfaceMuted))
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
                HStack(spacing: SabqLayout.space8) {
                    Circle().fill(AcStyle.accent).frame(width: 8, height: 8)
                    Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
            } else {
                let days = Int(total) / 86_400
                let hours = (Int(total) % 86_400) / 3_600
                let minutes = (Int(total) % 3_600) / 60
                let seconds = Int(total) % 60
                HStack(spacing: SabqLayout.space8) {
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
        VStack(spacing: 0) {
            Text("\(value)")
                .font(SabqType.sectionHeading.font.monospacedDigit())
                .foregroundStyle(SabqTheme.textPrimary)
            Text(label)
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(minWidth: 56)
        .padding(.vertical, SabqLayout.space8)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
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
        VStack(spacing: SabqLayout.space8) {
            HStack {
                Text("فوز \(fixture.home.name) \(h)%")
                Spacer()
                Text("تعادل \(d)%")
                Spacer()
                Text("فوز \(fixture.away.name) \(a)%")
            }
            .font(SabqFonts.app(size: 12))
            .foregroundStyle(SabqTheme.textSecondary)

            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(AcStyle.accentFill).frame(width: geo.size.width * CGFloat(h) / 100)
                    Rectangle().fill(SabqTheme.outline).frame(width: geo.size.width * CGFloat(d) / 100)
                    Rectangle().fill(AcTheme.sky)
                }
            }
            .frame(height: 8)
            .clipShape(Capsule())

            Text("توقعات خوارزمية للاستئناس من مزود البيانات")
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(SabqTheme.textTertiary)
        }
    }
}

/// ترويسة قسم: عنوان 20 عريض، وأيقونة بسيطة بلون الهوية، ووصف اختياري.
struct AcSectionHeader: View {
    let icon: String
    let title: String
    let subtitle: String
    var tint: Color = AcStyle.accent

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: icon)
                    .font(SabqType.button.font)
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                Text(title)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
            }
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
    }
}

/// حالة فارغة داخل بلوك هادئ.
struct AcEmptyDark: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqType.sectionHeading.font)
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text(title).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
            Text(subtitle).font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space24)
        .padding(.horizontal, SabqLayout.space16)
        .acQuietBlock()
    }
}

/// مؤشر تحميل بلون العلامة.
struct AcLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(AcStyle.accent); Spacer() }
            .padding(.vertical, SabqLayout.space32)
    }
}

/// بلاطة حقيقة: قيمة فوق وصف صغير، في بلوك هادئ.
struct AcFactTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: SabqLayout.space4) {
            Text(value)
                .font(SabqType.rowTitle.font.monospacedDigit())
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.75)
            Text(label)
                .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12).padding(.horizontal, SabqLayout.space8)
        .acQuietBlock()
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
        switch ch {
        case "W": return SabqTheme.success
        case "D": return SabqTheme.textTertiary
        case "L": return SabqTheme.danger
        default: return SabqTheme.outline
        }
    }
}

/// شارة تقييم اللاعب: الرقم بلون الحالة على تعبئة هادئة (آمن التباين في الوضعين).
struct AcRatingBadge: View {
    let rating: Double

    var body: some View {
        Text(String(format: "%.1f", rating))
            .font(SabqType.tag.font.monospacedDigit())
            .foregroundStyle(color)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
            .environment(\.layoutDirection, .leftToRight)
    }

    private var color: Color {
        if rating >= 8 { return SabqTheme.success }
        if rating >= 7 { return SabqTheme.teal }
        if rating >= 6 { return SabqTheme.warning }
        return SabqTheme.danger
    }
}

/// شارة رمادية صغيرة (عدد، تشكيلة، قناة).
struct AcTag: View {
    let text: String

    var body: some View {
        Text(text)
            .font(SabqType.tag.font)
            .foregroundStyle(SabqTheme.textSecondary)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
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
        .font(SabqType.meta.font)
        .foregroundStyle(SabqTheme.textSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space24)
}
