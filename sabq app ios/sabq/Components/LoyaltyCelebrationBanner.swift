import SwiftUI

// Sliding celebration / encouragement banner that appears at the top
// of the Home feed when the user crosses into a new loyalty tier, or
// — between tier-ups — every few days as a gentle nudge to read and
// engage. Dismissible (X) and tappable (opens the Loyalty Account
// screen).
//
// Two modes:
//   • .tierUp   — fires once per level. Tracks last-seen level in
//                 UserDefaults so the user doesn't see the same
//                 promotion banner twice.
//   • .nudge    — periodic. Throttled by lastNudgeDate; default
//                 cadence is one nudge per 5 days. Different copy
//                 per tier so the user sees fresh wording each time.
struct LoyaltyCelebrationBanner: View {
    enum Mode {
        case tierUp(previousLevel: Int)
        case nudge
    }

    let tier: LoyaltyTier
    let mode: Mode
    let onTap: () -> Void
    let onDismiss: () -> Void

    private var copy: (eyebrow: String, title: String, body: String) {
        switch mode {
        case .tierUp:
            return tierUpCopy(for: tier)
        case .nudge:
            return nudgeCopy(for: tier)
        }
    }

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                Image(systemName: iconName(for: mode))
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 40, height: 40)
                    .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(copy.eyebrow)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                    Text(copy.title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .multilineTextAlignment(.leading)
                    Text(copy.body)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 0)

                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, -SabqLayout.space12)
                .padding(.trailing, -SabqLayout.space12)
            }
            .padding(SabqLayout.space16)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
            )
        }
        .buttonStyle(.plain)
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    private func iconName(for mode: Mode) -> String {
        switch mode {
        case .tierUp: return "trophy.fill"
        case .nudge:  return "sparkles"
        }
    }
}

// ── Copy per tier ─────────────────────────────────────────────────

private func tierUpCopy(for tier: LoyaltyTier) -> (eyebrow: String, title: String, body: String) {
    switch tier.level {
    case 2:
        return (
            "ترقية جديدة",
            "أهلاً بك في المتفاعل 🎉",
            "تجاوزت أوّل ١٠٠ نقطة! كل قراءة وكل لايك يقرّبك من العضو الذهبي."
        )
    case 3:
        return (
            "ذهبي",
            "وصلت إلى العضو الذهبي ✨",
            "أنت من القرّاء المخلصين لسبق. شارة ذهبية تليق بأسلوبك."
        )
    case 4:
        return (
            "موثوق",
            "ترقّيت إلى القارئ الموثوق 🏆",
            "أداؤك ملحوظ ومميّز. الطريق إلى سفير سبق صار أقرب."
        )
    case 5:
        return (
            "سفير سبق",
            "أصبحت سفيراً لسبق 👑",
            "أعلى مستوى في برنامج الولاء. شكراً لكونك جزءاً مميزاً من مجتمعنا."
        )
    default:
        return (
            "ترقية",
            "مستوى جديد!",
            "أحسنت — استمر في رحلتك المعرفية."
        )
    }
}

private func nudgeCopy(for tier: LoyaltyTier) -> (eyebrow: String, title: String, body: String) {
    // Each tier gets its own nudge — keeps the message relevant to
    // where the user actually is. iOS shuffles between two variants
    // per tier (via the calendar day) so the user doesn't see the
    // exact same wording every time. .day is available on iOS 17;
    // .dayOfYear would be cleaner but only lands on iOS 18.
    let day = Calendar.current.component(.day, from: Date())
    let variantA = day.isMultiple(of: 2)

    switch tier.level {
    case 1:
        return variantA ? (
            "ابدأ رحلتك",
            "اقرأ خبراً اليوم 📰",
            "كل قراءة كاملة = ٥ نقاط. ١٠٠ نقطة وأنت من المتفاعلين."
        ) : (
            "خطوة واحدة",
            "نقطة لكل تفاعل",
            "إعجابات + مشاركات + قراءات. كلها تُحسب في رصيدك."
        )
    case 2:
        return variantA ? (
            "أنت متفاعل",
            "اقترب من الذهبي 🌟",
            "بضع قراءات إضافية تكفي. تابع أحدث الأخبار الآن."
        ) : (
            "تابع التفاعل",
            "كل يوم نقاط جديدة",
            "حافظ على وتيرتك. عضوية ذهبية بانتظارك."
        )
    case 3:
        return variantA ? (
            "ذهبي ولامع",
            "حافظ على ذهبيتك ⭐",
            "اقرأ ٣ مقالات اليوم — تبقى في القمة وتقترب من الموثوق."
        ) : (
            "نشاط متواصل",
            "الطريق إلى الموثوق",
            "أنت من النخبة. كل مقال جديد يبني رصيدك."
        )
    case 4:
        return variantA ? (
            "قارئ موثوق",
            "السفارة قريبة 👑",
            "أداؤك يثير الإعجاب. استمر بنفس الإيقاع للوصول إلى سفير سبق."
        ) : (
            "موثوق ومميّز",
            "نشاطك يُحدث الفرق",
            "كل تفاعل يقرّبك أكثر من أعلى مستوى في البرنامج."
        )
    case 5:
        return variantA ? (
            "سفير سبق",
            "إلهامك يصنع الفرق 💎",
            "شكراً لك على نشاطك المستمر. أنت جزء من نخبة سبق."
        ) : (
            "أعلى مستوى",
            "أنت قدوة 👑",
            "نشاطك يحفّز قرّاء آخرين. واصل التميّز."
        )
    default:
        return (
            "رحلتك المعرفية",
            "اقرأ. تفاعل. اكسب نقاطاً",
            "كل قراءة تحتسب في رحلتك."
        )
    }
}
