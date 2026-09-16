package com.sabq.smart.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/** مستقبل ودجت «آخر الأخبار» — يوصل نداءات AppWidgetManager إلى Glance. */
class SabqNewsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SabqNewsWidget()
}
