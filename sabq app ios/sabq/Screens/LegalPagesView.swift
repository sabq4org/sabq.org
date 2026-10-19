import SwiftUI

// MARK: - Content model

/// Reusable data model for static legal pages (Privacy, Terms).
/// Keeps content separate from layout so future legal pages can be added
/// by appending one more wrapper view at the bottom of this file.
struct LegalPageContent {
    let heroBadge: String        // small pill above the title — e.g. "حماية البيانات"
    let heroBadgeIcon: String    // SF Symbol shown inside the pill
    let heroTint: Color          // identity tint (kept for content data; the page uses Sabq roles)
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

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                hero
                introCard
                    .padding(.bottom, SabqLayout.space8)
                ForEach(content.sections) { section in
                    sectionCard(section)
                }
                if let footer = content.footer {
                    footerCard(footer)
                        .padding(.top, SabqLayout.space24)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.bottom, SabqLayout.space40)
            .frame(maxWidth: SabqLayout.readingWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(content.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Hero

    /// Unboxed title block on the white page.
    private var hero: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: content.heroBadgeIcon)
                    .font(SabqType.tag.font)
                Text(content.heroBadge)
                    .sabqText(SabqType.tag)
            }
            .foregroundStyle(SabqTheme.primary)
            .padding(.horizontal, SabqLayout.space8)
            .padding(.vertical, SabqLayout.space4)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
            )

            Text(content.title)
                .sabqText(SabqType.articleTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Text(content.subtitle)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)

            HStack(spacing: SabqLayout.space4) {
                Text("آخر تحديث:")
                    .foregroundStyle(SabqTheme.textTertiary)
                Text(content.lastUpdated)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            .sabqText(SabqType.meta)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, SabqLayout.space24)
        .padding(.bottom, SabqLayout.space24)
    }

    // MARK: Intro card

    /// Quiet surfaceMuted block.
    private var introCard: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: content.introIcon)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text("مقدمة")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
            }
            Text(content.intro)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineSpacing(6)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }

    // MARK: Section

    /// Unboxed section: heading + body, a thin separator above.
    private func sectionCard(_ section: LegalSection) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                Image(systemName: section.icon)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text(section.title)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }

            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                ForEach(section.blocks) { block in
                    renderBlock(block)
                }
            }
        }
        .padding(.vertical, SabqLayout.space24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(SabqTheme.separator)
                .frame(height: 1)
        }
    }

    @ViewBuilder
    private func renderBlock(_ block: LegalBlock) -> some View {
        switch block {
        case .paragraph(let text):
            Text(text)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineSpacing(6)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

        case .labeledPoint(let label, let text):
            (
                Text(label).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundColor(SabqTheme.textPrimary)
                + Text(" \(text)").font(SabqType.excerpt.font).foregroundColor(SabqTheme.textSecondary)
            )
            .lineSpacing(6)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)

        case .subsection(let title, let content, let points):
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)

                if let content {
                    Text(content)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineSpacing(6)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ForEach(points, id: \.self) { point in
                    (
                        Text("• \(point.label) ").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundColor(SabqTheme.textPrimary)
                        + Text(point.text).font(SabqType.excerpt.font).foregroundColor(SabqTheme.textSecondary)
                    )
                    .lineSpacing(6)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, SabqLayout.space8)
                }
            }
        }
    }

    // MARK: Footer card

    private func footerCard(_ footer: LegalFooter) -> some View {
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: footer.icon)
                .font(SabqFonts.app(size: 28, weight: .light))
                .foregroundStyle(SabqTheme.primary)
                .accessibilityHidden(true)

            Text(footer.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)

            Text(footer.message)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(5)
                .padding(.horizontal, SabqLayout.space12)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space24)
        .padding(.horizontal, SabqLayout.space16)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
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
        lastUpdated: "أكتوبر 2026",
        intro: "خصوصيتك تقع في صميم اهتماماتنا في \"سبق الذكية\". تشرح هذه السياسة كيفية جمعنا واستخدامنا وحمايتنا لمعلوماتك الشخصية عند استخدامك لمنصتنا. نحن ملتزمون بحماية بياناتك وفقًا لأفضل الممارسات والأنظمة المحلية والدولية.",
        introIcon: "lock.fill",
        sections: [
            LegalSection(
                icon: "tray.full.fill",
                title: "1. المعلومات التي نجمعها",
                blocks: [
                    .subsection(
                        title: "معلومات تقدمها أنت:",
                        content: "مثل الاسم والبريد الإلكتروني ورقم الجوال عند إنشاء حساب أو الاشتراك في النشرة البريدية، والصورة الشخصية إن أضفتها، والتعليقات التي تكتبها.",
                        points: []
                    ),
                    .subsection(
                        title: "بيانات Apple Health (اختيارية):",
                        content: "إن فعّلت بطاقة «رحلتك المعرفية» في تطبيق iOS نقرأ عدد خطواتك اليوم وساعات نومك من تطبيق Health لعرضها لك فقط. تبقى هذه البيانات على جهازك ولا تُرسل إلى خوادمنا ولا تُشارك مع أي طرف ولا تُستخدم للإعلان، ويمكنك إيقاف الإذن في أي وقت من إعدادات Health.",
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
                    .paragraph("نحن لا نبيع أو نؤجر أو نشارك معلوماتك الشخصية مع أطراف ثالثة لأغراض تسويقية دون موافقتك الصريحة."),
                    .paragraph("لحماية النقاش من الإساءة، يُرسل نص التعليق وحده (دون اسمك أو بريدك أو أي بيانات تعريفية) إلى مزوّد ذكاء اصطناعي خارجي لتصنيفه قبل النشر، ثم يراجعه فريق الإشراف عند الحاجة.")
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
                    .paragraph("إذا كان لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل معنا عبر: privacy@sabq.org أو من خلال صفحة اتصل بنا.")
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
        lastUpdated: "أكتوبر 2026",
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
                icon: "bubble.left.and.exclamationmark.bubble.right.fill",
                title: "4. التعليقات والمحتوى الذي تنشره",
                blocks: [
                    .paragraph("لا نتسامح مطلقًا مع المحتوى المسيء أو المستخدمين المسيئين. يُمنع نشر أي تعليق أو اسم أو صورة فيها إساءة أو كراهية أو تحرش أو تهديد أو تحريض أو محتوى إباحي أو مخالف للأنظمة، أو انتحال شخصية، أو رسائل مزعجة."),
                    .paragraph("تمر التعليقات بالفلترة والمراجعة قبل نشرها. ويمكنك الإبلاغ عن أي تعليق أو حظر صاحبه من زر «⋯» بجوار التعليق؛ يُسحب التعليق المُبلَّغ عنه من العرض فورًا حتى يراجعه فريق الإشراف خلال 24 ساعة."),
                    .paragraph("نحذف المحتوى المخالف، وقد نوقف حساب المخالف أو نحظره نهائيًا دون إشعار مسبق.")
                ]
            ),
            LegalSection(
                icon: "exclamationmark.triangle.fill",
                title: "5. إخلاء المسؤولية",
                blocks: [
                    .paragraph("\"سبق الذكية\" لا تتحمل مسؤولية أي أضرار مباشرة أو غير مباشرة قد تنشأ عن استخدامك للمنصة أو اعتمادك على محتواها."),
                    .paragraph("الروابط الخارجية التي قد تظهر في محتوانا لا تخضع لسيطرتنا، ولسنا مسؤولين عن محتوى تلك المواقع.")
                ]
            ),
            LegalSection(
                icon: "arrow.triangle.2.circlepath",
                title: "6. تعديل الشروط",
                blocks: [
                    .paragraph("نحتفظ بالحق في تعديل هذه الشروط والأحكام في أي وقت. سيتم نشر النسخة المحدثة على هذه الصفحة، ويعتبر استمرارك في استخدام المنصة بعد التعديل موافقة على الشروط الجديدة.")
                ]
            ),
            LegalSection(
                icon: "scalemass.fill",
                title: "7. القانون الواجب التطبيق",
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
