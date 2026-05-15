import SwiftUI
import WebKit

// Renders a Twitter / X embed inline by loading Twitter's official
// widgets.js script inside a WKWebView. The web does the same — there
// is no native iOS API for fetching tweet content, and the Twitter
// embed widget handles dark-mode, RTL, language switching, etc.
//
// Height is reported back to SwiftUI by a tiny JavaScript bridge so
// the view stops being a fixed rectangle and matches the rendered
// tweet's actual size.
struct TwitterEmbedView: View {
    let tweetURL: URL

    @State private var contentHeight: CGFloat = 240
    @State private var didLoad = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                if !didLoad {
                    placeholder
                }
                TwitterWebView(
                    tweetURL: tweetURL,
                    contentHeight: $contentHeight,
                    didLoad: $didLoad
                )
                .frame(height: max(220, contentHeight))
                .opacity(didLoad ? 1 : 0.0)
                .animation(.easeIn(duration: 0.2), value: didLoad)
            }
            .frame(maxWidth: .infinity)
            .frame(height: max(220, contentHeight))

            // Fallback link in case the widgets script fails (CSP / network).
            Link(destination: tweetURL) {
                HStack(spacing: 5) {
                    Image(systemName: "arrow.up.right.square")
                        .font(.system(size: 11, weight: .semibold))
                    Text("افتح التغريدة في X")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.primaryEnd)
            }
        }
    }

    private var placeholder: some View {
        VStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.black)
                    .frame(width: 44, height: 44)
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(.white)
            }
            ProgressView()
                .controlSize(.small)
                .tint(SabqTheme.tertiaryInk)
            Text("تحميل التغريدة…")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }
}

// MARK: - WKWebView wrapper

private struct TwitterWebView: UIViewRepresentable {
    let tweetURL: URL
    @Binding var contentHeight: CGFloat
    @Binding var didLoad: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "sabqHeight")
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.backgroundColor = .clear
        webView.loadHTMLString(buildHTML(), baseURL: URL(string: "https://twitter.com"))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // No-op — the embed is static once loaded.
    }

    /// Wraps the tweet URL in the minimum HTML widgets.js needs to render.
    /// A small inline script reports the document height back to SwiftUI
    /// via the `sabqHeight` message channel.
    private func buildHTML() -> String {
        let url = tweetURL.absoluteString
        return """
        <!doctype html>
        <html lang="ar" dir="rtl">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              html, body { margin:0; padding:0; background:transparent; -webkit-tap-highlight-color: transparent; }
              body { font: -apple-system-body; }
              .twitter-tweet { margin: 0 !important; }
            </style>
          </head>
          <body>
            <blockquote class="twitter-tweet" data-dnt="true" data-lang="ar">
              <a href="\(url)"></a>
            </blockquote>
            <script async src="https://platform.twitter.com/widgets.js"></script>
            <script>
              (function() {
                function reportHeight() {
                  var h = document.documentElement.scrollHeight;
                  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.sabqHeight) {
                    window.webkit.messageHandlers.sabqHeight.postMessage(h);
                  }
                }
                // Poll while the widget mounts, then settle.
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
        """
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let parent: TwitterWebView

        init(_ parent: TwitterWebView) {
            self.parent = parent
        }

        // Treat any link tap inside the embed as "open in Safari" so users
        // don't end up trapped in a WebView trying to reply/like in-app.
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                self?.parent.didLoad = true
            }
        }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "sabqHeight" else { return }
            if let h = message.body as? CGFloat {
                DispatchQueue.main.async {
                    self.parent.contentHeight = h
                    self.parent.didLoad = true
                }
            } else if let n = message.body as? NSNumber {
                DispatchQueue.main.async {
                    self.parent.contentHeight = CGFloat(truncating: n)
                    self.parent.didLoad = true
                }
            }
        }
    }
}
