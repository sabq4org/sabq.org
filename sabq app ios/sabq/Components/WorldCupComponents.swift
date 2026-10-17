import SwiftUI

// MARK: - World Cup — مكونات مشتركة

/// صورة بعيدة (شعار منتخب / صورة لاعب) مع بديل أثناء التحميل.
/// تستخدم `CachedAsyncImage` (كاش ذاكرة NSCache + قرص 256MB + جلسة تحميل
/// موازية + تصغير عند فك الترميز) بدل `AsyncImage` العادي — فالشعارات وصور
/// اللاعبين صغيرة، ومع الكاش تظهر فورًا عند إعادة الظهور بدل التحميل المتأخّر.
struct WCRemoteImage: View {
    let url: String
    var contentMode: ContentMode = .fit
    /// الصور هنا صغيرة (شعار ≤50pt، صورة لاعب 46pt) فيكفي سقف 300px.
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
struct WCTeamLogo: View {
    let team: WCTeam
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

/// شارة حالة المباراة: مباشر (نبض أحمر) / انتهت / وقت الانطلاق.
struct WCStatusPill: View {
    let fixture: WCFixture
    var onDark: Bool = false

    var body: some View {
        if fixture.status.live {
            // نص أحمر ونقطة على سطح هادئ: الأبيض على الأحمر يسقط تباينه في الليلي
            HStack(spacing: SabqLayout.space4) {
                Circle().fill(SabqTheme.breaking).frame(width: 6, height: 6)
                Text(elapsedText)
            }
            .sabqText(SabqType.tag)
            .foregroundStyle(SabqTheme.breaking)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(Capsule().fill(SabqTheme.surfaceMuted))
        } else if fixture.status.finished {
            Text(fixture.status.label)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
                .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                .background(Capsule().fill(SabqTheme.surfaceMuted))
        } else {
            Text(WCFormat.time(fixture))
                .sabqText(SabqType.tag)
                .foregroundStyle(WCTheme.emeraldDeep)
                .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                .background(Capsule().fill(SabqTheme.surfaceMuted))
        }
    }

    private var elapsedText: String {
        let s = fixture.status
        // عدّاد المباراة يجري فعلًا في أشواط اللعب فقط (لا الاستراحة/الترجيح/التوقف)
        let running = ["1H", "2H", "ET", "LIVE"].contains(s.code) && s.elapsed != nil
        if running, let e = s.elapsed {
            // الوقت بدل الضائع: 90+8' بدل 90' المجمدة في أكثر دقائق المباراة توترًا
            let minute = (s.extra ?? 0) > 0 ? "\(e)+\(s.extra!)'" : "\(e)'"
            // اسم الشوط يسبق الدقيقة: «الشوط الأول · 23'»
            return s.label.isEmpty ? minute : "\(s.label) · \(minute)"
        }
        // الاستراحات/التوقف/الترجيح: نص الحالة («استراحة الشوطين») لا دقيقة مجمّدة
        return s.label.isEmpty ? "مباشر" : s.label
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
                HStack(spacing: SabqLayout.space8) {
                    Circle()
                        .fill(WCTheme.emeraldDeep)
                        .frame(width: 8, height: 8)
                    Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.textPrimary)
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
        VStack(spacing: 0) {
            Text("\(value)")
                .font(SabqFonts.app(size: 18, weight: .semibold))
                .foregroundStyle(SabqTheme.textPrimary)
            Text(label)
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(WCTheme.emeraldDeep)
        }
        .frame(minWidth: 52)
        .padding(.vertical, SabqLayout.space8)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
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
        VStack(spacing: SabqLayout.space8) {
            HStack {
                Text("فوز \(fixture.home.name) \(h)%")
                Spacer()
                Text("تعادل \(d)%").foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Text("فوز \(fixture.away.name) \(a)%")
            }
            .font(SabqFonts.app(size: 12, weight: .regular))
            .foregroundStyle(WCTheme.emeraldDeep)

            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(WCTheme.royal).frame(width: geo.size.width * CGFloat(h) / 100)
                    Rectangle().fill(SabqTheme.textSecondary.opacity(0.5)).frame(width: geo.size.width * CGFloat(d) / 100)
                    Rectangle().fill(WCTheme.sky)
                }
            }
            .frame(height: 10)
            .clipShape(Capsule())

            Text("توقعات خوارزمية للاستئناس من مزود البيانات")
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(SabqTheme.textSecondary)
        }
    }
}

/// شريط الاحتمالات لبطاقة الهيرو. التوقع يأتي جاهزًا من overview.predictions
/// للمباراة المميّزة؛ وعند غيابه (البطاقة الثانية المتزامنة) نتراجع إلى
/// /world-cup/forecast/:id — نفس مصدر مركز المباراة، مطابق لمكوّن الويب
/// HeroPrediction — حتى تُظهر كل البطاقات توقعها لا المميّزة وحدها.
struct WCHeroPrediction: View {
    let fixture: WCFixture
    let prediction: WCPrediction?
    @State private var fetched: WCForecast?

    private var resolved: WCPrediction? {
        if let p = prediction { return p }
        if let ft = fetched?.fulltime {
            return WCPrediction(home: ft.home, draw: ft.draw, away: ft.away, advice: nil)
        }
        return nil
    }

    var body: some View {
        Group {
            if let p = resolved {
                WCProbabilityBar(fixture: fixture, prediction: p)
            }
        }
        .task(id: fixture.id) {
            if prediction == nil, !fixture.status.finished {
                fetched = try? await APIClient.shared.fetchWorldCupForecast(fixtureId: fixture.id)
            }
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
        // عنوان قسم بلا صندوق: أيقونة بلون الهوية بلا خلفية، ثم العنوان والوصف.
        HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
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
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 28))
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text(title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(subtitle)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space32)
    }
}

/// مؤشر تحميل بلون العلامة. الأخضر العميق لا الأبيض: يُعرض غالبًا على
/// sectionBackground شبه الأبيض في النمط الفاتح، وكان الأبيض غير مرئي عمليًا.
struct WCLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(WCTheme.emeraldDeep); Spacer() }
            .padding(.vertical, 32)
    }
}

// MARK: - أسطح النموذج المعتمد

extension View {
    /// بلوك هادئ (معلومة/لوحة خاصة): تعبئة surfaceMuted بلا حدّ ولا ظل، زاوية 12.
    func wcQuietBlock() -> some View {
        background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
            .fill(SabqTheme.surfaceMuted))
    }
}

/// خط فاصل رفيع بين صفوف قائمة غير مؤطّرة.
struct WCRowSeparator: View {
    var body: some View {
        Rectangle().fill(SabqTheme.separator).frame(height: 1)
    }
}
