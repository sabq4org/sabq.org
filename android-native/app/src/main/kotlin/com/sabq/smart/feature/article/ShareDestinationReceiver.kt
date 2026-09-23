package com.sabq.smart.feature.article

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.ComponentName
import com.sabq.smart.data.analytics.SabqAnalytics

/** Receives the system chooser's destination callback, when available. */
class ShareDestinationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val nonce = intent.getStringExtra(EXTRA_NONCE) ?: return
        val articleId = intent.getStringExtra(EXTRA_ARTICLE_ID) ?: return
        val consumed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(nonce, false)
        if (consumed) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(nonce, true).apply()
        val component = intent.getParcelableExtra(Intent.EXTRA_CHOSEN_COMPONENT) as? ComponentName
        component?.let { SabqAnalytics.articleShare(articleId, it.packageName) }
    }

    companion object {
        const val EXTRA_NONCE = "share_nonce"
        const val EXTRA_ARTICLE_ID = "share_article_id"
        private const val PREFS = "share_callbacks"
    }
}
