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

    @State private var sparkleOffset: CGFloat = 0

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
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    Circle()
                        .fill(tier.color.opacity(0.18))
                        .frame(width: 48, height: 48)
                    Image(systemName: iconName(for: mode))
                        .font(SabqFonts.app(size: 22, weight: .bold))
                        .foregroundStyle(tier.color)
                }
                .overlay(alignment: .topTrailing) {
                    Image(systemName: "sparkle")
                        .font(SabqFonts.app(size: 9, weight: .black))
                        .foregroundStyle(tier.color)
                        .opacity(0.7)
                        .offset(x: 4, y: -2 + sparkleOffset)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(copy.eyebrow)
                        .font(SabqFonts.app(size: 10, weight: .heavy))
                        .tracking(1.5)
                        .foregroundStyle(tier.color)
                    Text(copy.title)
                        .font(SabqFonts.app(size: 15, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                        .multilineTextAlignment(.leading)
                    Text(copy.body)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .multilineTextAlignment(.leading)
                        .lineSpacing(2)
                }

                Spacer(minLength: 0)

                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(SabqFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(SabqTheme.tertiaryInk.opacity(0.10)))
                }
                .buttonStyle(.plain)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.background)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(tier.color.opacity(0.30), lineWidth: 1)
            )
            .background(
                // Subtle tier-tinted glow behind the card. Stays
                // tasteful — no bright fill, no gradient that fights
                // the existing home-feed palette.
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(tier.color.opacity(0.06))
                    .blur(radius: 8)
                    .padding(-2)
            )
            .clipped()
        }
        .buttonStyle(.plain)
        .transition(.move(edge: .top).combined(with: .opacity))
        .onAppear {
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                sparkleOffset = 3
            }
        }
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
