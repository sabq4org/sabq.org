import SwiftUI

// MARK: - كأس الملك — مكوّنات مشتركة
//
// هوية كأس الملك (أخضر زمردي + ذهبي) تبقى لونَ إبراز فقط: الترويسات والتبويب
// النشط والشارات. الصفحة نفسها بنموذج سبق: خلفية بيضاء/داكنة، قوائم بلا صناديق
// بفواصل رفيعة، زوايا 8/12/كبسولة، وسلّم SabqType. لا تدرّجات ولا ظلال.

/// أدوار ألوان كأس الملك فوق رموز سبق.
enum KcTheme {
    /// إبراز الهوية للنص والأيقونات (متكيّف، آمن التباين على الصفحة وsurfaceMuted).
    static let accent = WCTheme.emeraldDeep
    /// تعبئة مسطحة بلون الهوية تحت نص أبيض: التبويب النشط والأزرار وشريط الهوية.
    static let accentFill = WCTheme.royal
    /// ذهبي البطولة — للأيقونات والتعبئات فقط؛ لا يصلح لنص على الأبيض.
    static let gold = WCTheme.gold
    /// تعبئة شارة «مباشر» تحت نص أبيض في الوضعين.
    static let liveFill = SabqTheme.adaptive(0xC8102E, 0xB3122B)
    /// نص «مباشر/انتهت» على الصفحة.
    static let liveText = SabqTheme.breaking
    /// ملعب التشكيلات: أخضر مسطح بلا تدرّج.
    static let pitch = WCTheme.pitchTop

    /// تعبئة شارة التقييم تحت نص أبيض — داكنة بما يكفي في الوضعين.
    static func ratingFill(_ r: Double) -> Color {
        if r >= 8 { return accentFill }
        if r >= 7 { return SabqTheme.adaptive(0x13734E, 0x13734E) }
        if r >= 6 { return SabqTheme.adaptive(0x946000, 0x946000) }
        return liveFill
    }
}

/// فاصل رفيع بين صفوف القائمة.
struct KcRowSeparator: View {
    var body: some View {
        Rectangle().fill(SabqTheme.separator).frame(height: 1).accessibilityHidden(true)
    }
}

/// شريحة تبويب: كبسولة؛ النشط بلون الهوية والبقية هادئة.
struct KcChip: View {
    let title: String
    let selected: Bool
    var badge: Int = 0
    var fillWidth: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SabqLayout.space4) {
                Text(title).lineLimit(1).minimumScaleFactor(0.8)
                if badge > 0 {
                    Text("\(badge)")
                        .sabqText(SabqType.tag)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .background(Capsule().fill(KcTheme.liveFill))
                }
            }
            .font(SabqType.button.font)
            .foregroundStyle(selected ? SabqTheme.onAction : SabqTheme.textPrimary)
            .padding(.horizontal, SabqLayout.space16)
            .frame(maxWidth: fillWidth ? .infinity : nil, minHeight: 36)
            .background(Capsule().fill(selected ? KcTheme.accentFill : SabqTheme.surfaceMuted))
            .frame(minHeight: SabqLayout.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// بلاطة رقم/وصف هادئة.
struct KcFactTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space8)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
    }
}

/// عنوان فرعي داخل قسم (16 شبه عريض).
func kcSubheading(_ title: String) -> some View {
    Text(title)
        .sabqText(SabqType.rowTitle)
        .foregroundStyle(SabqTheme.textPrimary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
}

/// صورة دائرية (لاعب/مدرب) بخانة هادئة موحّدة عند غيابها.
struct KcAvatar: View {
    let url: String
    var size: CGFloat = 36

    var body: some View {
        CachedAsyncImage(url: URL(string: url), contentMode: .fill, maxPixelSize: 300) {
            SabqImagePlaceholder()
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

/// شعار نادٍ داخل دائرة بيضاء (الشعارات شفافة فتحتاج خلفية).
struct KcTeamLogo: View {
    let team: KcTeam
    var size: CGFloat = 40
    var ring: Color = SabqTheme.separator

    var body: some View {
        WCRemoteImage(url: team.logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(ring, lineWidth: 1))
    }
}

/// شارة حالة المباراة: مباشر / انتهت / وقت الانطلاق.
struct KcStatusPill: View {
    let fixture: KcFixture
    var onDark: Bool = false

    var body: some View {
        if fixture.status.live {
            HStack(spacing: SabqLayout.space4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(elapsedText)
            }
            .sabqText(SabqType.tag)
            .foregroundStyle(.white)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
            .background(Capsule().fill(KcTheme.liveFill))
        } else if fixture.status.finished {
            Text(fixture.status.label.isEmpty ? "انتهت" : fixture.status.label)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
                .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                .background(Capsule().fill(SabqTheme.surfaceMuted))
        } else {
            Text(KcFormat.time(fixture))
                .sabqText(SabqType.tag)
                .foregroundStyle(KcTheme.accent)
                .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                .background(Capsule().fill(SabqTheme.surfaceMuted))
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
                HStack(spacing: SabqLayout.space8) {
                    Circle().fill(KcTheme.accent).frame(width: 8, height: 8)
                    Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات")
                        .sabqText(SabqType.meta)
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
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
            Text(label)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(minWidth: 56)
        .padding(.vertical, SabqLayout.space8)
        // يجلس داخل بلوك الهيرو الهادئ، فيأخذ سطح الصفحة ليبقى ظاهرًا.
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surface))
    }
}

/// ترويسة قسم: أيقونة بلون الهوية بلا خلفية + عنوان 20 + وصف.
struct KcSectionHeader: View {
    let icon: String
    let title: String
    let subtitle: String
    var tint: Color = KcTheme.accent

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: icon)
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                Text(title)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            Text(subtitle)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// مؤشر تحميل بلون العلامة.
struct KcLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(KcTheme.accent); Spacer() }
            .padding(.vertical, SabqLayout.space32)
    }
}

/// شريط احتمالات الفوز الثلاثي.
/// المصدر: API-Football predictions (الخادم يُسقط العنصر الوهمي 33/33/33).
struct KcProbabilityBar: View {
    let fixture: KcFixture
    let prediction: KcPrediction

    var body: some View {
        let total = max(1, prediction.homePct + prediction.drawPct + prediction.awayPct)
        let h = Int(Double(prediction.homePct) / Double(total) * 100)
        let d = Int(Double(prediction.drawPct) / Double(total) * 100)
        let a = Int(Double(prediction.awayPct) / Double(total) * 100)
        VStack(spacing: SabqLayout.space8) {
            HStack {
                Text("فوز \(fixture.home.name) \(h)%").foregroundStyle(KcTheme.accent)
                Spacer()
                Text("تعادل \(d)%").foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Text("فوز \(fixture.away.name) \(a)%").foregroundStyle(SabqTheme.textPrimary)
            }
            .sabqText(SabqType.tag)

            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(KcTheme.accentFill).frame(width: geo.size.width * CGFloat(h) / 100)
                    Rectangle().fill(SabqTheme.outline).frame(width: geo.size.width * CGFloat(d) / 100)
                    Rectangle().fill(KcTheme.gold)
                }
            }
            .frame(height: 8)
            .clipShape(Capsule())

            Text("توقعات خوارزمية للاستئناس من مزود البيانات")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textTertiary)
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
        .sabqText(SabqType.meta)
        .foregroundStyle(SabqTheme.textSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space24)
}
