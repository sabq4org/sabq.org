import SwiftUI

// MARK: - Content model

/// Reusable data model for static legal pages (Privacy, Terms).
/// Keeps content separate from layout so future legal pages can be added
/// by appending one more wrapper view at the bottom of this file.
struct LegalPageContent {
    let heroBadge: String        // small pill above the title — e.g. "حماية البيانات"
    let heroBadgeIcon: String    // SF Symbol shown inside the pill
    let heroTint: Color          // tint colour for the hero gradient + pill
    let title: String            // "سياسة الخصوصية" / "الشروط والأحكام"
    let subtitle: String         // 'في "سبق الذكية"' / 'لمنصة "سبق الذكية"'
    let lastUpdated: String      // "أكتوبر 2025"
    let intro: String            // single paragraph for the intro card
    let introIcon: String        // SF Symbol for the intro card
    let sections: [LegalSection]
    let footer: LegalFooter?
}

struct LegalSection: Identifiable {
    let id = UUID()
    let icon: String             // SF Symbol
    let title: String            // "1. المعلومات التي نجمعها"
    let blocks: [LegalBlock]
}

enum LegalBlock: Identifiable {
    var id: String {
        switch self {
        case .paragraph(let s): return "p:\(s.prefix(40))"
        case .labeledPoint(let l, _): return "lp:\(l)"
        case .subsection(let t, _, _): return "ss:\(t)"
        }
    }

    case paragraph(String)
    case labeledPoint(label: String, text: String)
    case subsection(title: String, content: String?, points: [LabeledPoint])

    struct LabeledPoint: Hashable {
        let label: String
        let text: String
    }
}

struct LegalFooter {
    let icon: String
    let title: String
    let message: String
}

// MARK: - Renderer

struct LegalPageView: View {
    let content: LegalPageContent

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                hero
                introCard
                ForEach(content.sections) { section in
                    sectionCard(section)
                }
                if let footer = content.footer {
                    footerCard(footer)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    SabqHaptics.light()
                    dismiss()
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                }
            }
            ToolbarItem(placement: .principal) {
                Text(content.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
    }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .center, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: content.heroBadgeIcon)
                    .font(.system(size: 12, weight: .semibold))
                Text(content.heroBadge)
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
            }
            .foregroundStyle(content.heroTint)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule(style: .continuous).fill(content.heroTint.opacity(0.10))
            )
            .overlay(
                Capsule(style: .continuous).stroke(content.heroTint.opacity(0.25), lineWidth: 0.5)
            )

            Text(content.title)
                .font(SabqFonts.headline(size: 28))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.center)

            Text(content.subtitle)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)

            HStack(spacing: 4) {
                Text("آخر تحديث:")
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Text(content.lastUpdated)
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .fontWeight(.semibold)
            }
            .font(.system(size: 12, weight: .medium))
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 16)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [content.heroTint.opacity(0.12), SabqTheme.surface.opacity(0)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(content.heroTint.opacity(0.15), lineWidth: 0.5)
        )
    }

    // MARK: Intro card

    private var introCard: some View {
        HStack(alignment: .top, spacing: 14) {
            iconBubble(systemName: content.introIcon, tint: content.heroTint)

            VStack(alignment: .leading, spacing: 8) {
                Text("مقدمة")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Text(content.intro)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(6)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(content.heroTint.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(content.heroTint.opacity(0.20), lineWidth: 0.5)
        )
    }

    // MARK: Section card

    private func sectionCard(_ section: LegalSection) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                iconBubble(systemName: section.icon, tint: SabqTheme.primaryEnd)
                Text(section.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .padding(.top, 6)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }

            VStack(alignment: .leading, spacing: 10) {
                ForEach(section.blocks) { block in
                    renderBlock(block)
                }
            }
            // Slight indent so the body aligns under the title text, not the icon
            .padding(.leading, 4)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(SabqTheme.paleFill.opacity(0.35))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
    }

    @ViewBuilder
    private func renderBlock(_ block: LegalBlock) -> some View {
        switch block {
        case .paragraph(let text):
            Text(text)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineSpacing(6)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

        case .labeledPoint(let label, let text):
            (
                Text(label).font(.system(size: 14, weight: .bold)).foregroundColor(SabqTheme.ink)
                + Text(" \(text)").font(.system(size: 14, weight: .regular)).foregroundColor(SabqTheme.secondaryInk)
            )
            .lineSpacing(6)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)

        case .subsection(let title, let content, let points):
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)

                if let content {
                    Text(content)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(6)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ForEach(points, id: \.self) { point in
                    (
                        Text("• \(point.label) ").font(.system(size: 14, weight: .bold)).foregroundColor(SabqTheme.ink)
                        + Text(point.text).font(.system(size: 14, weight: .regular)).foregroundColor(SabqTheme.secondaryInk)
                    )
                    .lineSpacing(6)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 8)
                }
            }
        }
    }

    // MARK: Footer card

    private func footerCard(_ footer: LegalFooter) -> some View {
        VStack(spacing: 10) {
            Image(systemName: footer.icon)
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(content.heroTint)

            Text(footer.title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            Text(footer.message)
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(5)
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .padding(.horizontal, 18)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(content.heroTint.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(content.heroTint.opacity(0.20), lineWidth: 0.5)
        )
    }

    // MARK: Helpers

    private func iconBubble(systemName: String, tint: Color) -> some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(tint.opacity(0.12))
            .frame(width: 40, height: 40)
            .overlay {
                Image(systemName: systemName)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(tint)
            }
    }
}

// MARK: - Privacy Policy

struct PrivacyPolicyView: View {
    var body: some View {
        LegalPageView(content: Self.content)
    }

    static let content = LegalPageContent(
        heroBadge: "حماية البيانات",
        heroBadgeIcon: "shield.lefthalf.filled",
        heroTint: SabqTheme.leaf,
        title: "سياسة الخصوصية",
        subtitle: "في \"سبق الذكية\"",
        lastUpdated: "أكتوبر 2025",
        intro: "خصوصيتك تقع في صميم اهتماماتنا في \"سبق الذكية\". تشرح هذه السياسة كيفية جمعنا واستخدامنا وحمايتنا لمعلوماتك الشخصية عند استخدامك لمنصتنا. نحن ملتزمون بحماية بياناتك وفقًا لأفضل الممارسات والأنظمة المحلية والدولية.",
        introIcon: "lock.fill",
        sections: [
            LegalSection(
                icon: "tray.full.fill",
                title: "1. المعلومات التي نجمعها",
                blocks: [
                    .subsection(
                        title: "معلومات تقدمها أنت:",
                        content: "مثل الاسم والبريد الإلكتروني عند إنشاء حساب أو الاشتراك في النشرة البريدية.",
                        points: []
                    ),
                    .subsection(
                        title: "معلومات نجمعها تلقائيًا (بيانات الاستخدام):",
                        content: nil,
                        points: [
                            .init(label: "بيانات التفاعل:", text: "المقالات التي تقرأها، المواضيع التي تفضلها، والوقت الذي تقضيه على المنصة. تُستخدم هذه البيانات لتشغيل نظام التوصيات الذكي وتقديم محتوى مخصص لك."),
                            .init(label: "بيانات تقنية:", text: "نوع الجهاز، نظام التشغيل، عنوان IP، ونوع المتصفح. تُستخدم هذه البيانات لتحسين أداء المنصة وضمان أمانها.")
                        ]
                    )
                ]
            ),
            LegalSection(
                icon: "person.fill.checkmark",
                title: "2. كيف نستخدم معلوماتك؟",
                blocks: [
                    .labeledPoint(label: "لتخصيص تجربتك:", text: "نستخدم بيانات التفاعل لتزويدك بتوصيات إخبارية ومحتوى يتناسب مع اهتماماتك."),
                    .labeledPoint(label: "لتحسين خدماتنا:", text: "نحلل بيانات الاستخدام لفهم كيفية تفاعل القراء مع المنصة وتطوير ميزات جديدة."),
                    .labeledPoint(label: "للتواصل معك:", text: "لإرسال إشعارات هامة حول حسابك أو تحديثات المنصة أو نشراتنا الإخبارية (بعد موافقتك).")
                ]
            ),
            LegalSection(
                icon: "lock.shield.fill",
                title: "3. كيف نحمي معلوماتك؟",
                blocks: [
                    .paragraph("نستخدم تدابير أمنية تقنية وتنظيمية متقدمة (مثل التشفير وبروتوكولات الأمان) لحماية بياناتك من الوصول غير المصرح به."),
                    .paragraph("نحن لا نبيع أو نؤجر أو نشارك معلوماتك الشخصية مع أطراف ثالثة لأغراض تسويقية دون موافقتك الصريحة.")
                ]
            ),
            LegalSection(
                icon: "circle.grid.3x3.fill",
                title: "4. ملفات تعريف الارتباط (Cookies)",
                blocks: [
                    .paragraph("نستخدم ملفات تعريف الارتباط لتخزين تفضيلاتك وتحسين تجربة التصفح. يمكنك التحكم في استخدام هذه الملفات من خلال إعدادات المتصفح الخاص بك.")
                ]
            ),
            LegalSection(
                icon: "shield.fill",
                title: "5. حقوقك",
                blocks: [
                    .paragraph("لك الحق في الوصول إلى معلوماتك الشخصية التي نحتفظ بها وتصحيحها أو طلب حذفها."),
                    .paragraph("يمكنك إلغاء الاشتراك في أي وقت من رسائلنا البريدية.")
                ]
            ),
            LegalSection(
                icon: "arrow.triangle.2.circlepath",
                title: "6. التغييرات على سياسة الخصوصية",
                blocks: [
                    .paragraph("قد نقوم بتحديث هذه السياسة من وقت لآخر. سنقوم بإعلامك بأي تغييرات جوهرية عبر نشر السياسة الجديدة على هذه الصفحة.")
                ]
            ),
            LegalSection(
                icon: "envelope.fill",
                title: "7. الاتصال بنا",
                blocks: [
                    .paragraph("إذا كان لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل معنا عبر: privacy@sabq.sa أو من خلال صفحة اتصل بنا.")
                ]
            )
        ],
        footer: LegalFooter(
            icon: "shield.lefthalf.filled",
            title: "نحن نحترم خصوصيتك",
            message: "إذا كان لديك أي استفسارات حول كيفية معالجة بياناتك، لا تتردد في التواصل معنا."
        )
    )
}

// MARK: - Terms of Use

struct TermsOfUseView: View {
    var body: some View {
        LegalPageView(content: Self.content)
    }

    static let content = LegalPageContent(
        heroBadge: "الشروط القانونية",
        heroBadgeIcon: "doc.text.fill",
        heroTint: SabqTheme.sky,
        title: "الشروط والأحكام",
        subtitle: "لمنصة \"سبق الذكية\"",
        lastUpdated: "أكتوبر 2025",
        intro: "مرحبًا بكم في \"سبق الذكية\"، المنصة الإعلامية التابعة لمؤسسة سبق للإعلام. باستخدامك لمنصتنا، فإنك توافق على الالتزام بهذه الشروط والأحكام. نرجو قراءتها بعناية. إن استمرارك في استخدام المنصة يُعد قبولاً ضمنيًا بهذه الشروط.",
        introIcon: "globe",
        sections: [
            LegalSection(
                icon: "doc.text.fill",
                title: "1. استخدام المنصة",
                blocks: [
                    .paragraph("تلتزم باستخدام المنصة لأغراض مشروعة وبما لا ينتهك حقوق الآخرين أو يحد من استخدامهم للمنصة."),
                    .paragraph("المحتوى المنشور على \"سبق الذكية\" (نصوص، صور، فيديوهات) هو ملك فكري للمنصة ومحمي بموجب قوانين حقوق النشر، ولا يجوز نسخه أو إعادة نشره دون إذن خطي مسبق.")
                ]
            ),
            LegalSection(
                icon: "shield.fill",
                title: "2. المحتوى والخدمات الذكية",
                blocks: [
                    .paragraph("تستخدم \"سبق الذكية\" تقنيات الذكاء الاصطناعي لتحليل المحتوى وتقديم توصيات مخصصة لتحسين تجربتك."),
                    .paragraph("نحن نسعى لتقديم محتوى دقيق وموثوق، لكننا لا نضمن خلوه من الأخطاء بشكل مطلق. المحتوى المقدم لا يُعد استشارة قانونية أو مهنية.")
                ]
            ),
            LegalSection(
                icon: "person.fill",
                title: "3. حساب المستخدم",
                blocks: [
                    .paragraph("قد يتطلب الوصول إلى بعض الميزات إنشاء حساب شخصي. أنت مسؤول عن الحفاظ على سرية معلومات حسابك وعن جميع الأنشطة التي تحدث من خلاله."),
                    .paragraph("يجب أن تكون البيانات المقدمة عند التسجيل صحيحة ودقيقة.")
                ]
            ),
            LegalSection(
                icon: "exclamationmark.triangle.fill",
                title: "4. إخلاء المسؤولية",
                blocks: [
                    .paragraph("\"سبق الذكية\" لا تتحمل مسؤولية أي أضرار مباشرة أو غير مباشرة قد تنشأ عن استخدامك للمنصة أو اعتمادك على محتواها."),
                    .paragraph("الروابط الخارجية التي قد تظهر في محتوانا لا تخضع لسيطرتنا، ولسنا مسؤولين عن محتوى تلك المواقع.")
                ]
            ),
            LegalSection(
                icon: "arrow.triangle.2.circlepath",
                title: "5. تعديل الشروط",
                blocks: [
                    .paragraph("نحتفظ بالحق في تعديل هذه الشروط والأحكام في أي وقت. سيتم نشر النسخة المحدثة على هذه الصفحة، ويعتبر استمرارك في استخدام المنصة بعد التعديل موافقة على الشروط الجديدة.")
                ]
            ),
            LegalSection(
                icon: "scalemass.fill",
                title: "6. القانون الواجب التطبيق",
                blocks: [
                    .paragraph("تخضع هذه الشروط والأحكام وتُفسر وفقًا للأنظمة والقوانين المعمول بها في المملكة العربية السعودية.")
                ]
            )
        ],
        footer: LegalFooter(
            icon: "checkmark.seal.fill",
            title: "شكراً لاستخدامك سبق الذكية",
            message: "إذا كان لديك أي أسئلة حول هذه الشروط والأحكام، يُرجى التواصل معنا عبر قنوات الدعم المتاحة."
        )
    )
}
