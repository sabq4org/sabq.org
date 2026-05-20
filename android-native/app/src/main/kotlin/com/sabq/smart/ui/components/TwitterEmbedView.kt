package com.sabq.smart.ui.components

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Close
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay

/**
 * Inline Twitter / X embed — wraps Android `WebView` with the same
 * widgets.js HTML iOS injects (Components/TwitterEmbedView.swift).
 * The widget reports its rendered height back via a tiny JS bridge
 * so the host LazyColumn item stops being a fixed rectangle.
 *
 * Behavior matches iOS 1:1:
 *   • Black X placeholder + spinner + "تحميل التغريدة…" while loading
 *   • Fade-in on first render (200 ms easeIn)
 *   • Any link tap inside the embed → external Chrome/X intent
 *   • Fallback link below the embed: "افتح التغريدة في X"
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TwitterEmbedView(tweetUrl: String) {
    val context = LocalContext.current
    var contentHeightDp by remember { mutableStateOf(220) }
    var didLoad by remember { mutableStateOf(false) }
    val alphaAnim by animateFloatAsState(
        targetValue = if (didLoad) 1f else 0f,
        animationSpec = tween(durationMillis = 200),
        label = "twitterEmbedFade",
    )

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = contentHeightDp.dp.coerceAtLeast(220.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (!didLoad) {
                TwitterPlaceholder()
            }

            AndroidView(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = contentHeightDp.dp.coerceAtLeast(220.dp))
                    .alpha(alphaAnim),
                factory = { ctx ->
                    WebView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT,
                        )
                        setBackgroundColor(AndroidColor.TRANSPARENT)
                        isVerticalScrollBarEnabled = false
                        isHorizontalScrollBarEnabled = false
                        overScrollMode = WebView.OVER_SCROLL_NEVER
                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            loadWithOverviewMode = true
                            useWideViewPort = true
                            // Prevent the user from zooming the WebView — gestures
                            // belong to the host LazyColumn.
                            setSupportZoom(false)
                            builtInZoomControls = false
                            displayZoomControls = false
                        }
                        addJavascriptInterface(
                            object {
                                @JavascriptInterface
                                @Suppress("unused")
                                fun reportHeight(h: Int) {
                                    post {
                                        // h arrives in CSS px (== density-
                                        // independent pixels), so use it
                                        // directly as `dp` — matches iOS,
                                        // which stores the same value as
                                        // CGFloat against a 1.0-scale view.
                                        if (h > 0) contentHeightDp = h
                                        didLoad = true
                                    }
                                }
                            },
                            "sabqHeight",
                        )
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                request: WebResourceRequest?,
                            ): Boolean {
                                val url = request?.url ?: return false
                                return try {
                                    context.startActivity(
                                        Intent(Intent.ACTION_VIEW, url).apply {
                                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                        },
                                    )
                                    true
                                } catch (_: Exception) {
                                    false
                                }
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                view?.postDelayed({ didLoad = true }, 600)
                            }
                        }

                        loadDataWithBaseURL(
                            "https://twitter.com",
                            buildTweetHtml(tweetUrl),
                            "text/html",
                            "UTF-8",
                            null,
                        )
                    }
                },
            )
        }

        // Fallback link — iOS Link "افتح التغريدة في X". Mirrors the
        // same row used when widgets.js fails to load.
        Row(
            modifier = Modifier.clickable {
                try {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse(tweetUrl)).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        },
                    )
                } catch (_: Exception) {
                }
            },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(11.dp),
            )
            Text(
                text = "افتح التغريدة في X",
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.primaryEnd,
            )
        }
    }
}

@Composable
private fun TwitterPlaceholder() {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(
                width = 0.5.dp,
                color = SabqTheme.colors.outline.copy(alpha = 0.5f),
                shape = shape,
            )
            .padding(vertical = 30.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.Black, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(18.dp),
            )
        }
        CircularProgressIndicator(
            color = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(20.dp),
            strokeWidth = 2.dp,
        )
        Text(
            text = "تحميل التغريدة…",
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

private fun buildTweetHtml(tweetUrl: String): String =
    """
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html, body { margin:0; padding:0; background:transparent; -webkit-tap-highlight-color: transparent; }
          body { font-family: system-ui, -apple-system, Roboto, sans-serif; }
          .twitter-tweet { margin: 0 !important; }
        </style>
      </head>
      <body>
        <blockquote class="twitter-tweet" data-dnt="true" data-lang="ar">
          <a href="$tweetUrl"></a>
        </blockquote>
        <script async src="https://platform.twitter.com/widgets.js"></script>
        <script>
          (function() {
            function reportHeight() {
              var h = document.documentElement.scrollHeight;
              if (window.sabqHeight && window.sabqHeight.reportHeight) {
                window.sabqHeight.reportHeight(h);
              }
            }
            var tries = 0;
            var iv = setInterval(function() {
              reportHeight();
              if (++tries > 30) clearInterval(iv);
            }, 350);
            window.addEventListener('resize', reportHeight);
          })();
        </script>
      </body>
    </html>
    """.trimIndent()
