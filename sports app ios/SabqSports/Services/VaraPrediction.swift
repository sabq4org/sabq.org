import SwiftUI

// MARK: - محرّك توقّع VARA الديناميكي
//
// «توقّع VARA» يستبدل التوقّعات الثابتة بخوارزمية احتمالية حقيقية:
//   • نموذج بواسون (Poisson) لاحتمال عدد الأهداف لكلّ فريق.
//   • قوّة كلّ فريق مشتقّة من بيانات حيّة: معدّل النقاط/المباراة + الهجوم/الدفاع
//     (أهداف له/عليه) + الفورمة (آخر ٥) + أفضلية الأرض + (اختياريًّا) المواجهات.
//   • النتيجة: احتمال فوز المضيف/تعادل/فوز الضيف (مجموعها 100٪) + النتيجة الأرجح
//     + درجة ثقة + سبب موجز بالعربية.
//
// المحرّك **حتمي بالكامل** (لا عشوائية، لا اعتماد على الوقت) فيعطي نفس النتيجة
// لنفس المدخلات. حين تغيب بيانات الترتيب يتراجع بهدوء إلى أفضلية الأرض فقط
// (توقّع منطقي ومتكافئ بدل رقمٍ ثابت).

/// قوّة فريق مُجمَّعة من الترتيب/الفورمة — مدخل المحرّك.
nonisolated struct VaraTeamStrength: Equatable {
    var played: Int = 0
    var points: Int = 0
    var goalsFor: Int = 0
    var goalsAgainst: Int = 0
    /// سلسلة فورمة مثل "WWDLW" (تُقرأ آخر ٥ أحرف؛ ترتيبها لا يؤثّر على العدّ).
    var form: String? = nil
    var rank: Int? = nil

    var hasData: Bool { played > 0 }

    var pointsPerGame: Double { played > 0 ? Double(points) / Double(played) : 1.35 }
    var goalsForPerGame: Double { played > 0 ? Double(goalsFor) / Double(played) : VaraPredict.leagueAvg }
    var goalsAgainstPerGame: Double { played > 0 ? Double(goalsAgainst) / Double(played) : VaraPredict.leagueAvg }

    /// نقاط الفورمة في [-1, 1] من آخر ٥ مباريات (فوز +1، تعادل 0، خسارة -1).
    var formScore: Double {
        guard let form, !form.isEmpty else { return 0 }
        let last = form.uppercased().suffix(5)
        guard !last.isEmpty else { return 0 }
        var sum = 0.0
        for ch in last {
            if ch == "W" { sum += 1 } else if ch == "L" { sum -= 1 }
        }
        return sum / Double(last.count)
    }
}

/// الطرف المُرجَّح.
nonisolated enum VaraFavored { case home, draw, away }

/// مخرجات التوقّع.
nonisolated struct VaraPick: Equatable {
    let home: Int          // ٪
    let draw: Int          // ٪
    let away: Int          // ٪
    let scoreHome: Int     // النتيجة الأرجح
    let scoreAway: Int
    let confidence: Int    // ٪ (أعلى الاحتمالات الثلاثة)
    let favored: VaraFavored
    let rationale: String  // سبب موجز بالعربية (يتضمّن اسم الفريق)
    /// هل اعتمد التوقّع على بيانات ترتيب حقيقية (لا أفضلية أرض فقط)؟
    let dataBacked: Bool
}

nonisolated enum VaraPredict {
    /// متوسّط أهداف الفريق الواحد في المباراة (مرجع المعايرة).
    static let leagueAvg: Double = 1.35
    private static let maxGoals = 7

    /// يحسب توقّع VARA لمباراة.
    /// - neutralVenue: ملاعب محايدة (كأس العالم غالبًا) → أفضلية أرض ضئيلة.
    /// - h2h: (فوز مضيف، تعادل، فوز ضيف) من المواجهات السابقة — اختياري.
    static func compute(
        home: VaraTeamStrength?,
        away: VaraTeamStrength?,
        homeName: String,
        awayName: String,
        neutralVenue: Bool = false,
        h2h: (home: Int, draw: Int, away: Int)? = nil
    ) -> VaraPick {
        let h = home ?? VaraTeamStrength()
        let a = away ?? VaraTeamStrength()
        let dataBacked = h.hasData || a.hasData

        // عوامل الهجوم/الدفاع نسبةً لمتوسّط الدوري (1.0 = متوسّط).
        let attackH = clamp(h.goalsForPerGame / leagueAvg, 0.45, 2.2)
        let attackA = clamp(a.goalsForPerGame / leagueAvg, 0.45, 2.2)
        let defenseH = clamp(h.goalsAgainstPerGame / leagueAvg, 0.45, 2.2)
        let defenseA = clamp(a.goalsAgainstPerGame / leagueAvg, 0.45, 2.2)

        // أفضلية الأرض (مضاعِف على الأهداف المتوقّعة).
        let homeMult = neutralVenue ? 1.06 : 1.18
        let awayMult = neutralVenue ? 0.97 : 0.88

        // ميل الجودة من فارق النقاط/المباراة والفورمة (يقوّي المرشّح الأقوى).
        let ppgGap = h.pointsPerGame - a.pointsPerGame
        let formGap = h.formScore - a.formScore
        let tilt = clamp(ppgGap * 0.085 + formGap * 0.07, -0.34, 0.34)

        var expHome = leagueAvg * attackH * defenseA * homeMult * (1 + tilt)
        var expAway = leagueAvg * attackA * defenseH * awayMult * (1 - tilt)
        expHome = clamp(expHome, 0.25, 4.6)
        expAway = clamp(expAway, 0.25, 4.6)

        // مصفوفة بواسون لاحتمالات النتائج.
        var pHome = 0.0, pDraw = 0.0, pAway = 0.0
        var bestProb = 0.0, bestH = 0, bestA = 0
        for i in 0...maxGoals {
            let ph = poisson(i, expHome)
            for j in 0...maxGoals {
                let p = ph * poisson(j, expAway)
                if i > j { pHome += p } else if i == j { pDraw += p } else { pAway += p }
                if p > bestProb { bestProb = p; bestH = i; bestA = j }
            }
        }
        // دمج المواجهات السابقة كأولوية خفيفة (إن وُجدت).
        if let h2h, (h2h.home + h2h.draw + h2h.away) > 0 {
            let t = Double(h2h.home + h2h.draw + h2h.away)
            let w = 0.18 // وزن المواجهات
            pHome = pHome * (1 - w) + (Double(h2h.home) / t) * w
            pDraw = pDraw * (1 - w) + (Double(h2h.draw) / t) * w
            pAway = pAway * (1 - w) + (Double(h2h.away) / t) * w
        }

        let total = max(pHome + pDraw + pAway, 0.0001)
        let pcts = roundedPercents([pHome / total, pDraw / total, pAway / total])
        let hp = pcts[0], dp = pcts[1], ap = pcts[2]

        let favored: VaraFavored = (hp >= dp && hp >= ap) ? .home : (ap >= dp ? .away : .draw)
        let confidence = max(hp, max(dp, ap))

        return VaraPick(
            home: hp, draw: dp, away: ap,
            scoreHome: bestH, scoreAway: bestA,
            confidence: confidence, favored: favored,
            rationale: rationale(favored: favored, hp: hp, dp: dp, ap: ap,
                                  homeName: homeName, awayName: awayName,
                                  dataBacked: dataBacked, neutral: neutralVenue),
            dataBacked: dataBacked
        )
    }

    // MARK: - مساعدات

    private static func rationale(favored: VaraFavored, hp: Int, dp: Int, ap: Int,
                                  homeName: String, awayName: String,
                                  dataBacked: Bool, neutral: Bool) -> String {
        let top = max(hp, max(dp, ap))
        let second = [hp, dp, ap].sorted(by: >)[1]
        let basis = dataBacked
            ? (neutral ? "بحسب الترتيب والفورمة" : "بحسب الترتيب والفورمة وأفضلية الأرض")
            : (neutral ? "مباراة مفتوحة بلا بيانات كافية" : "أفضلية الأرض فقط")
        // متقاربة؟ (أعلى احتمالين متلاصقان)
        if top - second <= 6 {
            switch favored {
            case .draw: return "مباراة متكافئة مرشّحة للتعادل · \(basis)."
            case .home: return "مباراة متقاربة وترجيح طفيف لـ\(homeName) · \(basis)."
            case .away: return "مباراة متقاربة وترجيح طفيف لـ\(awayName) · \(basis)."
            }
        }
        switch favored {
        case .home: return "الأفضلية لـ\(homeName) (\(hp)٪) · \(basis)."
        case .away: return "الأفضلية لـ\(awayName) (\(ap)٪) · \(basis)."
        case .draw: return "التعادل هو الأرجح (\(dp)٪) · \(basis)."
        }
    }

    private static func poisson(_ k: Int, _ lambda: Double) -> Double {
        guard lambda > 0 else { return k == 0 ? 1 : 0 }
        return exp(-lambda) * pow(lambda, Double(k)) / factorial(k)
    }

    private static func factorial(_ n: Int) -> Double {
        guard n > 1 else { return 1 }
        var r = 1.0
        for i in 2...n { r *= Double(i) }
        return r
    }

    private static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        min(max(v, lo), hi)
    }

    /// تقريب احتمالات (كسور مجموعها ~1) إلى أعداد صحيحة مجموعها 100 (أكبر باقٍ).
    private static func roundedPercents(_ fractions: [Double]) -> [Int] {
        let scaled = fractions.map { $0 * 100 }
        var floors = scaled.map { Int($0.rounded(.down)) }
        var remainder = 100 - floors.reduce(0, +)
        let order = scaled.enumerated()
            .sorted { ($0.element - Double(Int($0.element))) > ($1.element - Double(Int($1.element))) }
            .map { $0.offset }
        var idx = 0
        while remainder > 0 && !order.isEmpty {
            floors[order[idx % order.count]] += 1
            remainder -= 1
            idx += 1
        }
        return floors
    }
}

// MARK: - أرشيف لقطات التوقّع (لصدق المقارنة بعد النهاية)

/// لقطة توقّع VARA — تُحفظ قبل الانطلاق وتُسترجع بعد النهاية.
nonisolated struct VaraPickSnapshot: Equatable {
    let home: Int
    let draw: Int
    let away: Int
    let scoreHome: Int
    let scoreAway: Int
}

/// أرشيف محلّي (UserDefaults) للقطات توقّع VARA قبل المباراة. المقارنة بعد النهاية
/// تعتمد اللقطة المحفوظة لا إعادة الحساب — جداول ما بعد المباراة تتضمّن نتيجتها
/// فتُضخّم دقّة VARA زورًا.
nonisolated enum VaraPickArchive {
    private static let key = "vara_pick_archive"

    static func save(fixtureId: Int, pick: VaraPick) {
        var d = (UserDefaults.standard.dictionary(forKey: key) as? [String: String]) ?? [:]
        // آخر لقطة قبل الانطلاق هي الأصدق (أحدث ترتيب/فورمة) — نستبدل دومًا.
        d["\(fixtureId)"] = "\(pick.home)|\(pick.draw)|\(pick.away)|\(pick.scoreHome)|\(pick.scoreAway)"
        UserDefaults.standard.set(d, forKey: key)
    }

    static func load(fixtureId: Int) -> VaraPickSnapshot? {
        guard let d = UserDefaults.standard.dictionary(forKey: key) as? [String: String],
              let raw = d["\(fixtureId)"] else { return nil }
        let p = raw.split(separator: "|").compactMap { Int($0) }
        guard p.count == 5 else { return nil }
        return VaraPickSnapshot(home: p[0], draw: p[1], away: p[2], scoreHome: p[3], scoreAway: p[4])
    }
}

/// بطاقة «نتيجة التوقّعات» بعد النهاية — تقارن لقطة توقّع VARA المؤرشفة
/// (وتوقّع العضو إن وُجد) بالنتيجة النهائية بحكم واضح لكل صفّ.
struct VaraVerdictCard: View {
    let homeName: String
    let awayName: String
    let finalHome: Int
    let finalAway: Int
    let vara: VaraPickSnapshot?
    let mine: (predHome: Int, predAway: Int)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.seal").font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("نتيجة التوقّعات").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text("النتيجة").font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
                score(finalHome, finalAway)
            }
            if let vara {
                verdictRow(label: "توقّع VARA", h: vara.scoreHome, a: vara.scoreAway)
            }
            if let mine {
                verdictRow(label: "توقّعك", h: mine.predHome, a: mine.predAway)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    private func verdictRow(label: String, h: Int, a: Int) -> some View {
        let v = verdict(predH: h, predA: a)
        return HStack(spacing: 8) {
            Text(label).font(SportsFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
            score(h, a)
            Spacer(minLength: 0)
            Text(v.text)
                .font(SportsFonts.app(size: 11, weight: .heavy))
                .foregroundStyle(v.hit ? SpTheme.green : SpTheme.onDarkFaint)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill((v.hit ? SpTheme.green : SpTheme.onDarkFaint).opacity(0.10)))
        }
    }

    // عرف التطبيق: نصّ النتيجة «ضيف - مضيف» مع فرض LTR فيقع رقم المضيف يمينًا.
    private func score(_ h: Int, _ a: Int) -> some View {
        Text(verbatim: "\(a) - \(h)")
            .font(SportsFonts.app(size: 13, weight: .heavy))
            .foregroundStyle(SpTheme.onDark)
            .monospacedDigit()
            .environment(\.layoutDirection, .leftToRight)
    }

    private func verdict(predH: Int, predA: Int) -> (text: String, hit: Bool) {
        if predH == finalHome && predA == finalAway { return ("أصاب النتيجة بدقّة", true) }
        let ps = (predH - predA).signum()
        let fs = (finalHome - finalAway).signum()
        if ps == fs { return ("أصاب الاتجاه", true) }
        return ("لم يُصب", false)
    }
}

// MARK: - مكوّنات عرض قابلة لإعادة الاستخدام

/// شريط توقّع VARA مدمج — لقائمة المباريات (#2): شريط ثلاثي رفيع + نسب صغيرة +
/// قُريص النتيجة الأرجح. أصغر من بطاقة التوقّع الكاملة.
struct VaraMiniPrediction: View {
    let pick: VaraPick

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 3) {
                Image(systemName: "sparkles").font(.system(size: 8, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("VARA").font(SportsFonts.app(size: 8.5, weight: .heavy)).foregroundStyle(SpTheme.green)
                    .environment(\.layoutDirection, .leftToRight)
            }
            // شريط مكدّس RTL: المضيف يمين ← تعادل ← الضيف يسار.
            GeometryReader { geo in
                HStack(spacing: 1.5) {
                    seg(geo.size.width, pick.home, SpTheme.green)
                    seg(geo.size.width, pick.draw, SpTheme.onDarkFaint.opacity(0.5))
                    seg(geo.size.width, pick.away, SpTheme.teal)
                }
                .environment(\.layoutDirection, .rightToLeft)
            }
            .frame(height: 5)
            .clipShape(Capsule())
            Text("\(pick.home)·\(pick.draw)·\(pick.away)")
                .font(SportsFonts.app(size: 8.5, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                .lineLimit(1)
            Text("\(pick.scoreHome)-\(pick.scoreAway)")
                .font(SportsFonts.app(size: 9, weight: .heavy)).foregroundStyle(SpTheme.green)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                .padding(.horizontal, 5).padding(.vertical, 1.5)
                .background(Capsule().fill(SpTheme.green.opacity(0.10)))
        }
    }

    private func seg(_ width: CGFloat, _ pct: Int, _ color: Color) -> some View {
        Capsule().fill(color).frame(width: max(1.5, width * CGFloat(pct) / 100.0))
    }
}
