package com.sabq.smart.feature.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SyncAlt
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Static legal page (Privacy / Terms) — ports `LegalPageView` from
 * `Screens/LegalPagesView.swift`. Same hero + intro card + section
 * cards + footer card. Sections accept paragraphs, labelled points
 * (label + body in one paragraph), and subsections (title + body +
 * bullet points).
 */
@Composable
fun LegalPageScreen(
    content: LegalPageContent,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        LegalTopBar(title = content.title, onBack = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 60.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            HeroCard(content = content)
            IntroCard(content = content)
            content.sections.forEach { section -> SectionCard(section = section) }
            content.footer?.let { FooterCard(footer = it, tint = content.heroTint) }
        }
    }
}

@Composable
private fun LegalTopBar(title: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = title,
            style = SabqTheme.typography.cardTitle.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold),
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

@Composable
private fun HeroCard(content: LegalPageContent) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        content.heroTint.copy(alpha = 0.12f),
                        SabqTheme.colors.surface.copy(alpha = 0f),
                    ),
                ),
                shape,
            )
            .border(BorderStroke(0.5.dp, content.heroTint.copy(alpha = 0.15f)), shape)
            .padding(horizontal = 16.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(content.heroTint.copy(alpha = 0.10f))
                .border(BorderStroke(0.5.dp, content.heroTint.copy(alpha = 0.25f)), CircleShape)
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = content.heroBadgeIcon,
                contentDescription = null,
                tint = content.heroTint,
                modifier = Modifier.size(12.dp),
            )
            Text(
                text = content.heroBadge,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    color = content.heroTint,
                ),
            )
        }
        Text(
            text = content.title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 28.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            ),
        )
        Text(
            text = content.subtitle,
            style = SabqTheme.typography.body.copy(
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "آخر تحديث:",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    color = SabqTheme.colors.tertiaryInk,
                ),
            )
            Text(
                text = content.lastUpdated,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun IntroCard(content: LegalPageContent) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(content.heroTint.copy(alpha = 0.05f), shape)
            .border(BorderStroke(0.5.dp, content.heroTint.copy(alpha = 0.20f)), shape)
            .padding(18.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        IconBubble(icon = content.introIcon, tint = content.heroTint)
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = "مقدمة",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = content.intro,
                style = SabqTheme.typography.body.copy(
                    fontSize = 14.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun SectionCard(section: LegalSection) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.paleFill.copy(alpha = 0.35f), shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.4f)), shape)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            IconBubble(icon = section.icon, tint = SabqTheme.colors.primaryEnd)
            Text(
                text = section.title,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
                modifier = Modifier.padding(top = 6.dp),
            )
        }
        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.padding(start = 4.dp),
        ) {
            section.blocks.forEach { block -> RenderBlock(block = block) }
        }
    }
}

@Composable
private fun RenderBlock(block: LegalBlock) {
    when (block) {
        is LegalBlock.Paragraph -> Text(
            text = block.text,
            style = SabqTheme.typography.body.copy(
                fontSize = 14.sp,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
        is LegalBlock.LabeledPoint -> Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)) {
                    append(block.label)
                }
                append(" ")
                withStyle(SpanStyle(color = SabqTheme.colors.secondaryInk)) {
                    append(block.text)
                }
            },
            style = SabqTheme.typography.body.copy(fontSize = 14.sp),
        )
        is LegalBlock.Subsection -> {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = block.title,
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
                block.content?.let { body ->
                    Text(
                        text = body,
                        style = SabqTheme.typography.body.copy(
                            fontSize = 14.sp,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                    )
                }
                block.points.forEach { point ->
                    Text(
                        text = buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)) {
                                append("• ${point.label} ")
                            }
                            withStyle(SpanStyle(color = SabqTheme.colors.secondaryInk)) {
                                append(point.text)
                            }
                        },
                        style = SabqTheme.typography.body.copy(fontSize = 14.sp),
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun FooterCard(footer: LegalFooter, tint: Color) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tint.copy(alpha = 0.05f), shape)
            .border(BorderStroke(0.5.dp, tint.copy(alpha = 0.20f)), shape)
            .padding(horizontal = 18.dp, vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = footer.icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(28.dp),
        )
        Text(
            text = footer.title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            ),
        )
        Text(
            text = footer.message,
            style = SabqTheme.typography.body.copy(
                fontSize = 13.sp,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
    }
}

@Composable
private fun IconBubble(icon: ImageVector, tint: Color) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(tint.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
    }
}

// MARK: - Content models

data class LegalPageContent(
    val heroBadge: String,
    val heroBadgeIcon: ImageVector,
    val heroTint: Color,
    val title: String,
    val subtitle: String,
    val lastUpdated: String,
    val intro: String,
    val introIcon: ImageVector,
    val sections: List<LegalSection>,
    val footer: LegalFooter?,
)

data class LegalSection(
    val icon: ImageVector,
    val title: String,
    val blocks: List<LegalBlock>,
)

sealed interface LegalBlock {
    data class Paragraph(val text: String) : LegalBlock
    data class LabeledPoint(val label: String, val text: String) : LegalBlock
    data class Subsection(
        val title: String,
        val content: String?,
        val points: List<LabeledPoint>,
    ) : LegalBlock {
        data class LabeledPoint(val label: String, val text: String)
    }
}

data class LegalFooter(
    val icon: ImageVector,
    val title: String,
    val message: String,
)

// MARK: - Privacy

@Composable
fun PrivacyPolicyScreen(onBack: () -> Unit) {
    val leaf = SabqTheme.colors.leaf
    LegalPageScreen(
        content = LegalPageContent(
            heroBadge = "حماية البيانات",
            heroBadgeIcon = Icons.Filled.Shield,
            heroTint = leaf,
            title = "سياسة الخصوصية",
            subtitle = "في \"سبق الذكية\"",
            lastUpdated = "أكتوبر 2025",
            intro = "خصوصيتك تقع في صميم اهتماماتنا في \"سبق الذكية\". تشرح هذه السياسة كيفية جمعنا واستخدامنا وحمايتنا لمعلوماتك الشخصية عند استخدامك لمنصتنا. نحن ملتزمون بحماية بياناتك وفقًا لأفضل الممارسات والأنظمة المحلية والدولية.",
            introIcon = Icons.Filled.Lock,
            sections = listOf(
                LegalSection(
                    icon = Icons.Filled.Inbox,
                    title = "1. المعلومات التي نجمعها",
                    blocks = listOf(
                        LegalBlock.Subsection(
                            title = "معلومات تقدمها أنت:",
                            content = "مثل الاسم والبريد الإلكتروني عند إنشاء حساب أو الاشتراك في النشرة البريدية.",
                            points = emptyList(),
                        ),
                        LegalBlock.Subsection(
                            title = "معلومات نجمعها تلقائيًا (بيانات الاستخدام):",
                            content = null,
                            points = listOf(
                                LegalBlock.Subsection.LabeledPoint(
                                    label = "بيانات التفاعل:",
                                    text = "المقالات التي تقرأها، المواضيع التي تفضلها، والوقت الذي تقضيه على المنصة. تُستخدم هذه البيانات لتشغيل نظام التوصيات الذكي وتقديم محتوى مخصص لك.",
                                ),
                                LegalBlock.Subsection.LabeledPoint(
                                    label = "بيانات تقنية:",
                                    text = "نوع الجهاز، نظام التشغيل، عنوان IP، ونوع المتصفح. تُستخدم هذه البيانات لتحسين أداء المنصة وضمان أمانها.",
                                ),
                            ),
                        ),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.Verified,
                    title = "2. كيف نستخدم معلوماتك؟",
                    blocks = listOf(
                        LegalBlock.LabeledPoint("لتخصيص تجربتك:", "نستخدم بيانات التفاعل لتزويدك بتوصيات إخبارية ومحتوى يتناسب مع اهتماماتك."),
                        LegalBlock.LabeledPoint("لتحسين خدماتنا:", "نحلل بيانات الاستخدام لفهم كيفية تفاعل القراء مع المنصة وتطوير ميزات جديدة."),
                        LegalBlock.LabeledPoint("للتواصل معك:", "لإرسال إشعارات هامة حول حسابك أو تحديثات المنصة أو نشراتنا الإخبارية (بعد موافقتك)."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.Security,
                    title = "3. كيف نحمي معلوماتك؟",
                    blocks = listOf(
                        LegalBlock.Paragraph("نستخدم تدابير أمنية تقنية وتنظيمية متقدمة (مثل التشفير وبروتوكولات الأمان) لحماية بياناتك من الوصول غير المصرح به."),
                        LegalBlock.Paragraph("نحن لا نبيع أو نؤجر أو نشارك معلوماتك الشخصية مع أطراف ثالثة لأغراض تسويقية دون موافقتك الصريحة."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.AutoAwesome,
                    title = "4. ملفات تعريف الارتباط (Cookies)",
                    blocks = listOf(
                        LegalBlock.Paragraph("نستخدم ملفات تعريف الارتباط لتخزين تفضيلاتك وتحسين تجربة التصفح. يمكنك التحكم في استخدام هذه الملفات من خلال إعدادات المتصفح الخاص بك."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.Shield,
                    title = "5. حقوقك",
                    blocks = listOf(
                        LegalBlock.Paragraph("لك الحق في الوصول إلى معلوماتك الشخصية التي نحتفظ بها وتصحيحها أو طلب حذفها."),
                        LegalBlock.Paragraph("يمكنك إلغاء الاشتراك في أي وقت من رسائلنا البريدية."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.SyncAlt,
                    title = "6. التغييرات على سياسة الخصوصية",
                    blocks = listOf(
                        LegalBlock.Paragraph("قد نقوم بتحديث هذه السياسة من وقت لآخر. سنقوم بإعلامك بأي تغييرات جوهرية عبر نشر السياسة الجديدة على هذه الصفحة."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.Email,
                    title = "7. الاتصال بنا",
                    blocks = listOf(
                        LegalBlock.Paragraph("إذا كان لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل معنا عبر: privacy@sabq.sa أو من خلال صفحة اتصل بنا."),
                    ),
                ),
            ),
            footer = LegalFooter(
                icon = Icons.Filled.Shield,
                title = "نحن نحترم خصوصيتك",
                message = "إذا كان لديك أي استفسارات حول كيفية معالجة بياناتك، لا تتردد في التواصل معنا.",
            ),
        ),
        onBack = onBack,
    )
}

// MARK: - Terms

@Composable
fun TermsOfUseScreen(onBack: () -> Unit) {
    val sky = SabqTheme.colors.sky
    LegalPageScreen(
        content = LegalPageContent(
            heroBadge = "الشروط القانونية",
            heroBadgeIcon = Icons.Filled.Description,
            heroTint = sky,
            title = "الشروط والأحكام",
            subtitle = "لمنصة \"سبق الذكية\"",
            lastUpdated = "أكتوبر 2025",
            intro = "مرحبًا بكم في \"سبق الذكية\"، المنصة الإعلامية التابعة لمؤسسة سبق للإعلام. باستخدامك لمنصتنا، فإنك توافق على الالتزام بهذه الشروط والأحكام. نرجو قراءتها بعناية. إن استمرارك في استخدام المنصة يُعد قبولاً ضمنيًا بهذه الشروط.",
            introIcon = Icons.Filled.Language,
            sections = listOf(
                LegalSection(
                    icon = Icons.Filled.Description,
                    title = "1. استخدام المنصة",
                    blocks = listOf(
                        LegalBlock.Paragraph("تلتزم باستخدام المنصة لأغراض مشروعة وبما لا ينتهك حقوق الآخرين أو يحد من استخدامهم للمنصة."),
                        LegalBlock.Paragraph("المحتوى المنشور على \"سبق الذكية\" (نصوص، صور، فيديوهات) هو ملك فكري للمنصة ومحمي بموجب قوانين حقوق النشر، ولا يجوز نسخه أو إعادة نشره دون إذن خطي مسبق."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.Shield,
                    title = "2. المحتوى والخدمات الذكية",
                    blocks = listOf(
                        LegalBlock.Paragraph("تستخدم \"سبق الذكية\" تقنيات الذكاء الاصطناعي لتحليل المحتوى وتقديم توصيات مخصصة لتحسين تجربتك."),
                        LegalBlock.Paragraph("نحن نسعى لتقديم محتوى دقيق وموثوق، لكننا لا نضمن خلوه من الأخطاء بشكل مطلق. المحتوى المقدم لا يُعد استشارة قانونية أو مهنية."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.Person,
                    title = "3. حساب المستخدم",
                    blocks = listOf(
                        LegalBlock.Paragraph("قد يتطلب الوصول إلى بعض الميزات إنشاء حساب شخصي. أنت مسؤول عن الحفاظ على سرية معلومات حسابك وعن جميع الأنشطة التي تحدث من خلاله."),
                        LegalBlock.Paragraph("يجب أن تكون البيانات المقدمة عند التسجيل صحيحة ودقيقة."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.WarningAmber,
                    title = "4. إخلاء المسؤولية",
                    blocks = listOf(
                        LegalBlock.Paragraph("\"سبق الذكية\" لا تتحمل مسؤولية أي أضرار مباشرة أو غير مباشرة قد تنشأ عن استخدامك للمنصة أو اعتمادك على محتواها."),
                        LegalBlock.Paragraph("الروابط الخارجية التي قد تظهر في محتوانا لا تخضع لسيطرتنا، ولسنا مسؤولين عن محتوى تلك المواقع."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.SyncAlt,
                    title = "5. تعديل الشروط",
                    blocks = listOf(
                        LegalBlock.Paragraph("نحتفظ بالحق في تعديل هذه الشروط والأحكام في أي وقت. سيتم نشر النسخة المحدثة على هذه الصفحة، ويعتبر استمرارك في استخدام المنصة بعد التعديل موافقة على الشروط الجديدة."),
                    ),
                ),
                LegalSection(
                    icon = Icons.Filled.Gavel,
                    title = "6. القانون الواجب التطبيق",
                    blocks = listOf(
                        LegalBlock.Paragraph("تخضع هذه الشروط والأحكام وتُفسر وفقًا للأنظمة والقوانين المعمول بها في المملكة العربية السعودية."),
                    ),
                ),
            ),
            footer = LegalFooter(
                icon = Icons.Filled.CheckCircle,
                title = "شكراً لاستخدامك سبق الذكية",
                message = "إذا كان لديك أي أسئلة حول هذه الشروط والأحكام، يُرجى التواصل معنا عبر قنوات الدعم المتاحة.",
            ),
        ),
        onBack = onBack,
    )
}
