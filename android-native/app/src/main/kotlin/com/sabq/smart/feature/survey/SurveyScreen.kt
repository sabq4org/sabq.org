package com.sabq.smart.feature.survey

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.sabq.smart.data.api.ApiSurveyPublic
import com.sabq.smart.data.api.ApiSurveyQuestion
import com.sabq.smart.ui.components.rememberSabqHaptics
import com.sabq.smart.ui.theme.SabqTheme

/**
 * تجربة الاستطلاع الشخصية — تطابق تصميم iOS `SurveyView` المعتمد:
 * بطاقة ترحيب صحفية باسم الكاتب وإحصاءاته، سؤال في كل شاشة مع انتقال
 * تلقائي لأسئلة النقرة الواحدة، وشاشة شكر بتوقيع إدارة التحرير.
 *
 * الألوان السماوية ثابتة (ليست accent المستخدم) — الاستطلاع بصوت سبق
 * الموحّد لكل كاتب، نفس قرار iOS.
 */
private val SurveyBlueDeep = Color(0xFF0B486F)
private val SurveyBlueMid = Color(0xFF0E6DB0)
private val SurveyAccent = Color(0xFF1E9DF1)

@Composable
fun SurveyScreen(
    token: String,
    onBack: () -> Unit,
    viewModel: SurveyViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(token) { viewModel.load(token) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding(),
    ) {
        SurveyTopBar(onBack = onBack)
        Box(modifier = Modifier.fillMaxSize()) {
            when (val stage = state.stage) {
                SurveyStage.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                    CircularProgressIndicator(
                        color = SurveyAccent,
                        strokeWidth = 2.dp,
                        modifier = Modifier.padding(top = 120.dp).size(28.dp),
                    )
                }
                SurveyStage.Failed -> StatusCard(
                    icon = { Icon(Icons.Filled.LinkOff, null, tint = SabqTheme.colors.tertiaryInk, modifier = Modifier.size(36.dp)) },
                    title = "هذا الرابط غير صالح",
                    message = "تأكد من فتح الرابط كما وصلك في الإشعار أو البريد، أو تواصل مع إدارة التحرير.",
                )
                SurveyStage.Closed -> StatusCard(
                    icon = { Icon(Icons.Filled.HourglassEmpty, null, tint = SabqTheme.colors.tertiaryInk, modifier = Modifier.size(36.dp)) },
                    title = "أُغلق هذا الاستطلاع",
                    message = "شكرًا لاهتمامك — انتهت فترة المشاركة في هذا الاستطلاع.",
                )
                SurveyStage.Intro -> state.payload?.let { payload ->
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                    ) {
                        IntroCard(payload = payload, onStart = viewModel::start)
                    }
                }
                SurveyStage.Questions -> state.payload?.let { payload ->
                    QuestionsPager(state = state, payload = payload, viewModel = viewModel)
                }
                is SurveyStage.Done -> SuccessCard(title = stage.title, message = stage.message)
            }
        }
    }
}

@Composable
private fun SurveyTopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Spacer(Modifier.weight(1f))
        Text(
            "استطلاع رأي",
            style = SabqTheme.typography.compactCardTitle.copy(
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            ),
        )
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onBack, modifier = Modifier.size(32.dp)) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

// ── بطاقة الترحيب الصحفية ─────────────────────────────────────────

@Composable
private fun IntroCard(payload: ApiSurveyPublic, onStart: () -> Unit) {
    val haptics = rememberSabqHaptics()
    val firstName = payload.recipient.name.trim().split(" ").firstOrNull().orEmpty()
        .ifBlank { payload.recipient.name }
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), shape),
    ) {
        // رأس متدرج بأزرق سبق الثابت
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(listOf(SurveyBlueDeep, SurveyBlueMid, SurveyAccent)),
                )
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier
                        .width(22.dp)
                        .height(2.5.dp)
                        .clip(CircleShape)
                        .background(SabqTheme.colors.gold),
                )
                Text(
                    payload.survey.purpose?.let { "استطلاع: $it" } ?: "استطلاع رأي من صحيفة سبق",
                    style = SabqTheme.typography.chipLabel.copy(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White.copy(alpha = 0.9f),
                    ),
                )
            }
            Text(
                (payload.survey.welcomeTitle ?: "أهلًا بك يا {name}، رأيك يصنع الخطوة القادمة")
                    .replace("{name}", firstName),
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    lineHeight = 34.sp,
                ),
            )
            payload.survey.welcomeMessage?.takeIf { it.isNotBlank() }?.let { welcome ->
                Text(
                    welcome,
                    style = SabqTheme.typography.body.copy(
                        fontSize = 14.sp,
                        color = Color.White.copy(alpha = 0.88f),
                        lineHeight = 22.sp,
                    ),
                )
            }
        }

        // جسم البطاقة
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(SabqTheme.colors.surface)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(SurveyAccent.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        firstName.take(1),
                        style = SabqTheme.typography.cardTitle.copy(
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Black,
                            color = SurveyAccent,
                        ),
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        payload.recipient.name,
                        style = SabqTheme.typography.cardTitle.copy(
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Black,
                            color = SabqTheme.colors.ink,
                        ),
                    )
                    payload.recipient.stats?.sinceYear?.let { year ->
                        Text(
                            "معنا في سبق منذ $year",
                            style = SabqTheme.typography.meta.copy(
                                fontSize = 13.sp,
                                color = SabqTheme.colors.secondaryInk,
                            ),
                        )
                    }
                }
            }

            payload.recipient.stats?.let { stats ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(value = formatCount(stats.publishedCount), label = "مادة منشورة", modifier = Modifier.weight(1f))
                    StatTile(value = formatCount(stats.totalViews), label = "قراءة لموادك", modifier = Modifier.weight(1f))
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                MetaItem("${payload.questions.size} أسئلة")
                MetaItem("دقائق معدودة")
                MetaItem("تصل لإدارة التحرير")
            }

            SurveyCTAButton(title = "ابدأ الاستطلاع", enabled = true) {
                haptics.light()
                onStart()
            }
        }
    }
}

@Composable
private fun StatTile(value: String, label: String, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.paleFill)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), shape)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(
            value,
            style = SabqTheme.typography.statValue.copy(
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.gold,
            ),
        )
        Text(
            label,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 12.sp,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
    }
}

@Composable
private fun MetaItem(text: String) {
    Text(
        text,
        style = SabqTheme.typography.metaSmall.copy(
            fontSize = 11.5.sp,
            color = SabqTheme.colors.tertiaryInk,
        ),
    )
}

private fun formatCount(value: Int): String = when {
    value >= 1_000_000 -> "%.1fم".format(value / 1_000_000.0).replace(".0م", "م")
    value >= 1_000 -> "%.1fألف".format(value / 1_000.0).replace(".0ألف", "ألف")
    else -> value.toString()
}

// ── الأسئلة: سؤال في كل شاشة ──────────────────────────────────────

@Composable
private fun QuestionsPager(state: SurveyUiState, payload: ApiSurveyPublic, viewModel: SurveyViewModel) {
    val question = payload.questions.getOrNull(state.currentIndex) ?: return
    val isLast = state.currentIndex == payload.questions.size - 1
    val autoAdvances = question.type in SurveyViewModel.AUTO_ADVANCE_TYPES && !isLast
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        AnimatedContent(
            targetState = state.currentIndex,
            transitionSpec = {
                (slideInHorizontally(tween(250)) { it / 6 } + fadeIn(tween(250)))
                    .togetherWith(fadeOut(tween(120)))
            },
            label = "surveyQuestion",
        ) { _ ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(SabqTheme.colors.surface)
                    .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), shape)
                    .padding(24.dp),
            ) {
                // شريط التقدم
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "السؤال ${state.currentIndex + 1} من ${payload.questions.size}",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                    )
                    val progress by animateFloatAsState(
                        targetValue = state.currentIndex.toFloat() / payload.questions.size,
                        animationSpec = tween(300),
                        label = "surveyProgress",
                    )
                    Box(
                        Modifier
                            .weight(1f)
                            .height(5.dp)
                            .clip(CircleShape)
                            .background(SabqTheme.colors.outline.copy(alpha = 0.6f)),
                    ) {
                        Box(
                            Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(progress)
                                .clip(CircleShape)
                                .background(SurveyAccent),
                        )
                    }
                }

                Spacer(Modifier.height(22.dp))

                // شارة نوع السؤال
                Box(
                    Modifier
                        .clip(CircleShape)
                        .background(SurveyAccent.copy(alpha = 0.10f))
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                ) {
                    Text(
                        typeLabel(question.type),
                        style = SabqTheme.typography.chipLabel.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            color = SurveyAccent,
                        ),
                    )
                }

                Spacer(Modifier.height(10.dp))

                Text(
                    if (question.required) "${question.text} *" else question.text,
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Black,
                        color = SabqTheme.colors.ink,
                        lineHeight = 30.sp,
                    ),
                )
                val hint = question.hint?.takeIf { it.isNotBlank() }
                    ?: "اختياري".takeIf { !question.required }
                hint?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        it,
                        style = SabqTheme.typography.meta.copy(
                            fontSize = 13.sp,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                    )
                }

                Spacer(Modifier.height(18.dp))

                AnswerControl(question = question, state = state, viewModel = viewModel)

                state.submitError?.let { error ->
                    Spacer(Modifier.height(12.dp))
                    Text(
                        error,
                        style = SabqTheme.typography.meta.copy(
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = SabqTheme.colors.coral,
                        ),
                    )
                }

                Spacer(Modifier.height(26.dp))

                // التنقل
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (state.currentIndex > 0) {
                        val previousShape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
                        Box(
                            modifier = Modifier
                                .clip(previousShape)
                                .border(1.dp, SabqTheme.colors.outline, previousShape)
                                .clickable { viewModel.goPrevious() }
                                .padding(horizontal = 18.dp, vertical = 11.dp),
                        ) {
                            Text(
                                "السابق",
                                style = SabqTheme.typography.chipLabel.copy(
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = SabqTheme.colors.secondaryInk,
                                ),
                            )
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    if (autoAdvances) {
                        Text(
                            "ينتقل تلقائيًا بعد اختيارك",
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 12.sp,
                                color = SabqTheme.colors.tertiaryInk,
                            ),
                        )
                    } else {
                        val canProceed = viewModel.canProceed(question) && !state.submitting
                        val nextShape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
                        Box(
                            modifier = Modifier
                                .clip(nextShape)
                                .background(if (canProceed) SurveyAccent else SurveyAccent.copy(alpha = 0.45f))
                                .clickable(enabled = canProceed) { viewModel.goNext() }
                                .padding(horizontal = 26.dp, vertical = 12.dp),
                        ) {
                            Text(
                                when {
                                    !isLast -> "متابعة"
                                    state.submitting -> "جارٍ الإرسال…"
                                    else -> "إرسال الاستطلاع"
                                },
                                style = SabqTheme.typography.ctaButton.copy(
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Color.White,
                                ),
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(40.dp))
    }
}

private fun typeLabel(type: String): String = when (type) {
    "single" -> "اختيار واحد"
    "multi" -> "اختيار متعدد"
    "short_text" -> "نص قصير"
    "long_text" -> "نص طويل"
    "stars" -> "تقييم نجوم"
    "scale" -> "مقياس"
    else -> "سؤال"
}

@Composable
private fun AnswerControl(question: ApiSurveyQuestion, state: SurveyUiState, viewModel: SurveyViewModel) {
    when (question.type) {
        "single", "multi" -> ChoiceOptions(question, state, viewModel)
        "scale" -> ScaleControl(question, state, viewModel)
        "stars" -> StarsControl(question, state, viewModel)
        else -> TextControl(question, state, viewModel)
    }
}

@Composable
private fun ChoiceOptions(question: ApiSurveyQuestion, state: SurveyUiState, viewModel: SurveyViewModel) {
    val haptics = rememberSabqHaptics()
    val isSingle = question.type == "single"
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        question.options.orEmpty().forEachIndexed { index, option ->
            val answer = state.answers[question.id]
            val selected = when (answer) {
                is SurveyAnswer.Number -> isSingle && answer.value == index
                is SurveyAnswer.Numbers -> !isSingle && index in answer.values
                else -> false
            }
            val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(if (selected) SurveyAccent.copy(alpha = 0.08f) else SabqTheme.colors.paleFill)
                    .border(
                        width = if (selected) 1.5.dp else 1.dp,
                        color = if (selected) SurveyAccent else SabqTheme.colors.outline.copy(alpha = 0.6f),
                        shape = shape,
                    )
                    .clickable {
                        haptics.light()
                        if (isSingle) {
                            viewModel.answer(question, SurveyAnswer.Number(index))
                        } else {
                            viewModel.toggleMultiChoice(question, index)
                        }
                    }
                    .padding(horizontal = 16.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // مؤشر الاختيار: دائرة للواحد، مربع للمتعدد
                val markShape = if (isSingle) CircleShape else RoundedCornerShape(5.dp)
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(markShape)
                        .background(if (selected) SurveyAccent else SabqTheme.colors.surface)
                        .border(2.dp, if (selected) SurveyAccent else SabqTheme.colors.outline, markShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (selected) {
                        if (isSingle) {
                            Box(
                                Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(Color.White),
                            )
                        } else {
                            Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(12.dp))
                        }
                    }
                }
                Text(
                    option,
                    style = SabqTheme.typography.body.copy(
                        fontSize = 15.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ScaleControl(question: ApiSurveyQuestion, state: SurveyUiState, viewModel: SurveyViewModel) {
    val haptics = rememberSabqHaptics()
    val minValue = question.settings?.scaleMin ?: 0
    val maxValue = question.settings?.scaleMax ?: 10
    val selectedValue = (state.answers[question.id] as? SurveyAnswer.Number)?.value

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            (minValue..maxValue).forEach { value ->
                val selected = selectedValue == value
                val shape = RoundedCornerShape(10.dp)
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(shape)
                        .background(if (selected) SurveyAccent else SabqTheme.colors.paleFill)
                        .border(1.dp, if (selected) SurveyAccent else SabqTheme.colors.outline.copy(alpha = 0.6f), shape)
                        .clickable {
                            haptics.light()
                            viewModel.answer(question, SurveyAnswer.Number(value))
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        value.toString(),
                        style = SabqTheme.typography.statValue.copy(
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Black,
                            color = if (selected) Color.White else SabqTheme.colors.ink,
                        ),
                    )
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth()) {
            question.settings?.minLabel?.let {
                Text(it, style = SabqTheme.typography.metaSmall.copy(fontSize = 12.sp, color = SabqTheme.colors.tertiaryInk))
            }
            Spacer(Modifier.weight(1f))
            question.settings?.maxLabel?.let {
                Text(it, style = SabqTheme.typography.metaSmall.copy(fontSize = 12.sp, color = SabqTheme.colors.tertiaryInk))
            }
        }
    }
}

@Composable
private fun StarsControl(question: ApiSurveyQuestion, state: SurveyUiState, viewModel: SurveyViewModel) {
    val haptics = rememberSabqHaptics()
    val selectedValue = (state.answers[question.id] as? SurveyAnswer.Number)?.value ?: 0
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        (1..5).forEach { value ->
            val lit = value <= selectedValue
            Icon(
                imageVector = if (lit) Icons.Filled.Star else Icons.Filled.StarBorder,
                contentDescription = "$value من 5",
                tint = if (lit) SabqTheme.colors.gold else SabqTheme.colors.outline,
                modifier = Modifier
                    .size(34.dp)
                    .clickable {
                        haptics.light()
                        viewModel.answer(question, SurveyAnswer.Number(value))
                    },
            )
        }
    }
}

@Composable
private fun TextControl(question: ApiSurveyQuestion, state: SurveyUiState, viewModel: SurveyViewModel) {
    val value = (state.answers[question.id] as? SurveyAnswer.Text)?.value.orEmpty()
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    val minHeight = if (question.type == "long_text") 120.dp else 56.dp
    BasicTextField(
        value = value,
        onValueChange = { viewModel.answer(question, SurveyAnswer.Text(it.take(if (question.type == "long_text") 5000 else 500))) },
        textStyle = SabqTheme.typography.body.copy(
            fontSize = 15.sp,
            color = SabqTheme.colors.ink,
            lineHeight = 24.sp,
        ),
        cursorBrush = SolidColor(SurveyAccent),
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(minHeight)
                    .clip(shape)
                    .background(SabqTheme.colors.paleFill)
                    .border(1.dp, SabqTheme.colors.outline.copy(alpha = 0.6f), shape)
                    .padding(14.dp),
                contentAlignment = Alignment.TopStart,
            ) {
                if (value.isEmpty()) {
                    Text(
                        "اكتب إجابتك هنا…",
                        style = SabqTheme.typography.body.copy(
                            fontSize = 15.sp,
                            color = SabqTheme.colors.tertiaryInk,
                        ),
                    )
                }
                innerTextField()
            }
        },
    )
}

// ── الأزرار والحالات الختامية ─────────────────────────────────────

@Composable
private fun SurveyCTAButton(title: String, enabled: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.buttonRadius)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (enabled) SurveyAccent else SurveyAccent.copy(alpha = 0.45f))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            title,
            style = SabqTheme.typography.ctaButton.copy(
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
            ),
        )
    }
}

@Composable
private fun StatusCard(icon: @Composable () -> Unit, title: String, message: String) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp)
            .clip(shape)
            .background(SabqTheme.colors.surface)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), shape)
            .padding(30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        icon()
        Text(
            title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 19.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            ),
        )
        Text(
            message,
            textAlign = TextAlign.Center,
            style = SabqTheme.typography.body.copy(
                fontSize = 14.sp,
                color = SabqTheme.colors.secondaryInk,
                lineHeight = 22.sp,
            ),
        )
    }
}

@Composable
private fun SuccessCard(title: String, message: String) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(SabqTheme.colors.surface)
                .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), shape)
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.leaf.copy(alpha = 0.12f))
                    .border(2.5.dp, SabqTheme.colors.leaf, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Check,
                    contentDescription = "تم الإرسال",
                    tint = SabqTheme.colors.leaf,
                    modifier = Modifier.size(40.dp),
                )
            }
            Text(
                title,
                textAlign = TextAlign.Center,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 21.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                    lineHeight = 32.sp,
                ),
            )
            Text(
                message,
                textAlign = TextAlign.Center,
                style = SabqTheme.typography.body.copy(
                    fontSize = 14.sp,
                    color = SabqTheme.colors.secondaryInk,
                    lineHeight = 23.sp,
                ),
            )
            Column(
                modifier = Modifier.padding(top = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    "مع خالص التقدير،",
                    style = SabqTheme.typography.meta.copy(
                        fontSize = 13.sp,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
                Text(
                    "إدارة التحرير — صحيفة سبق",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Black,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }
        }
    }
}
