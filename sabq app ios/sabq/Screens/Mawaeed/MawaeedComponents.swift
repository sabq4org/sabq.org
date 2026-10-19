import SwiftUI

// MARK: - مكوّنات «مواعيدك» المشتركة بين الصفحة الرئيسية وصفحة الخدمة

/// أيقونة الخدمة في مربع بلونها (`mw-kind-chip`).
struct MawaeedKindChip: View {
    let kind: MawaeedKind
    var size: CGFloat = 28

    var body: some View {
        Image(systemName: kind.symbol)
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(kind.tone)
            .frame(width: size, height: size)
            .background(kind.fill.opacity(0.14), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// شارة الحالة: مؤكد (أخضر) / متوقع (كهرماني) / انتهى (رمادي).
struct MawaeedBadge: View {
    let card: MawaeedCard

    var body: some View {
        let (ink, fill): (Color, Color) = card.isPast
            ? (SabqTheme.textSecondary, SabqTheme.surfaceMuted)
            : card.isExpected
                ? (SabqTheme.adaptive(0x8A5A00, 0xE8BD6A), SabqTheme.adaptive(0xFFF2CF, 0x3A2F14))
                : (SabqTheme.adaptive(0x0D6B4D, 0x72D4AE), SabqTheme.adaptive(0xE4F5EC, 0x12372D))
        Text(card.badgeText)
            .font(SabqType.tag.font)
            .foregroundStyle(ink)
            .padding(.horizontal, SabqLayout.space8)
            .padding(.vertical, 2)
            .background(fill, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
    }
}

/// ساعة واحدة للصفحة: تدق كل نصف دقيقة كما في الويب.
struct MawaeedClock<Content: View>: View {
    @ViewBuilder let content: (Date) -> Content
    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { ctx in content(ctx.date) }
    }
}

/// البطل: الموعد المختار أو الأقرب، بعدّاد أيام/ساعات/دقائق.
struct MawaeedHero: View {
    let card: MawaeedCard
    var kicker: String
    var regionLabel: String? = nil
    var cta: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Label(kicker, systemImage: card.kind.symbol)
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(card.kind.tone)
                Spacer(minLength: 0)
                MawaeedBadge(card: card)
            }

            Text(card.kind == .schoolHoliday
                 ? MawaeedLogic.compactTitle(card.title, startsOn: card.startsOn)
                 : MawaeedLogic.overviewTitle(card))
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            Text(verbatim: "\(card.gregorianLabel)  ·  \(card.hijriLabel)")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            ForEach([card.endLabel.map { "حتى \($0)" }, card.expectedHint, card.publicNote].compactMap { $0 }, id: \.self) { note in
                Text(note)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let regionLabel {
                Label("في \(regionLabel) · تتبع المنطقة المختارة في التقويم الدراسي", systemImage: "mappin.and.ellipse")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textSecondary)
            }

            MawaeedClock { now in clockBox(now: now) }

            if let cta {
                Button(action: cta) {
                    HStack(spacing: SabqLayout.space4) {
                        Text("كل مواعيد الخدمة")
                        Image(systemName: "chevron.left")
                    }
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(card.kind.tone)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .overlay(alignment: .top) {
            card.kind.fill.frame(height: 3)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: SabqRadius.medium, topTrailingRadius: SabqRadius.medium))
        }
        .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(card.kind.tone.opacity(0.25), lineWidth: 1))
    }

    private func clockBox(now: Date) -> some View {
        let clock = MawaeedLogic.clockParts(card, now: now)
        return VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: 6) {
                if clock.word == nil {
                    Circle().fill(SabqTheme.success).frame(width: 7, height: 7).accessibilityHidden(true)
                }
                Text("الوقت المتبقي").font(SabqType.tag.font).foregroundStyle(SabqTheme.textSecondary)
            }
            if let word = clock.word {
                Text(word)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(card.kind.tone)
            } else {
                HStack(spacing: SabqLayout.space8) {
                    clockCell(clock.days, MawaeedLogic.dayUnitWord(clock.days))
                    clockCell(clock.hours, (3...10).contains(clock.hours) ? "ساعات" : "ساعة")
                    clockCell(clock.minutes, "دقيقة")
                }
                // الأيام يسارًا كالعدّاد الرقمي (طلب المالك 2026-10-19).
                .environment(\.layoutDirection, .leftToRight)
            }
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(card.kind.fill.opacity(0.08), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func clockCell(_ value: Int, _ unit: String) -> some View {
        VStack(spacing: 0) {
            Text(verbatim: "\(value)")
                .font(SabqFonts.app(size: 28, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(card.kind.tone)
                .contentTransition(.numericText())
            Text(unit).font(SabqType.tag.font).foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }
}

/// صف موعد في قائمة (التقويم الدراسي، المواعيد القادمة في صفحة الخدمة).
struct MawaeedRow: View {
    let card: MawaeedCard
    let now: Date
    var compactTitle = true

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(compactTitle ? MawaeedLogic.compactTitle(card.title, startsOn: card.startsOn) : card.title)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(card.isPast ? SabqTheme.textSecondary : SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(dateLine)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(MawaeedLogic.countdown(card, now: now))
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(card.isPast ? SabqTheme.textTertiary : card.kind.tone)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, SabqLayout.space12)
        .accessibilityElement(children: .combine)
    }

    private var dateLine: String {
        var parts = [card.gregorianLabel, card.hijriLabel]
        if let end = card.endLabel { parts.append("حتى \(end)") }
        if card.isExpected && !card.isPast { parts.append("متوقع") }
        return parts.joined(separator: " · ")
    }
}
