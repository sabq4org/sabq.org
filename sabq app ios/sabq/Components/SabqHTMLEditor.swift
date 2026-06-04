import SwiftUI
import WebKit
import UIKit
import Combine

// MARK: - HTML editor controller
//
// Bridges SwiftUI ↔ a `contenteditable` WKWebView. The toolbar runs
// `document.execCommand` formatting through `exec`/`formatBlock`, and the
// editor screen pulls the final HTML on save via `currentHTML()`. The article
// body is TipTap HTML on the server, so editing it as HTML preserves the
// existing formatting and lets admins re-format it.
@MainActor
final class SabqHTMLEditorController: ObservableObject {
    // Assigned from the representable's (nonisolated) makeUIView on the main
    // thread; `nonisolated(unsafe)` lets that assignment compile while the
    // @MainActor methods below read it safely.
    fileprivate nonisolated(unsafe) weak var webView: WKWebView?

    /// Run a `document.execCommand` (bold, italic, insertUnorderedList, …).
    func exec(_ command: String, value: String? = nil) {
        let js: String
        if let value {
            let escaped = value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            js = "document.execCommand('\(command)', false, '\(escaped)');"
        } else {
            js = "document.execCommand('\(command)', false, null);"
        }
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    /// Wrap the current block in a tag, e.g. "H2", "H3", "BLOCKQUOTE", "P".
    func formatBlock(_ tag: String) {
        exec("formatBlock", value: "<\(tag.lowercased())>")
    }

    /// Insert an image at the caret.
    func insertImage(_ url: String) {
        exec("insertImage", value: url)
    }

    /// Replace the editor's content (used after AI rewrite / proofread apply).
    func setHTML(_ html: String) {
        let json = (try? JSONSerialization.data(withJSONObject: [html]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        // json is a 1-element JSON array; take [0] to get a safely-escaped string literal.
        webView?.evaluateJavaScript("document.getElementById('sabq-editor').innerHTML = (\(json))[0];", completionHandler: nil)
    }

    /// Pull the latest HTML out of the editable body.
    func currentHTML() async -> String {
        await withCheckedContinuation { continuation in
            guard let webView else { continuation.resume(returning: ""); return }
            webView.evaluateJavaScript("document.getElementById('sabq-editor').innerHTML") { result, _ in
                continuation.resume(returning: (result as? String) ?? "")
            }
        }
    }
}

// MARK: - HTML editor view

/// `contenteditable` rich-text surface. Loads `initialHTML`, reports live
/// changes through `onChange`, and exposes formatting via `controller`.
struct SabqHTMLEditor: UIViewRepresentable {
    let initialHTML: String
    let controller: SabqHTMLEditorController
    var onChange: (String) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(onChange: onChange) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "htmlChanged")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.keyboardDismissMode = .interactive
        controller.webView = webView
        webView.loadHTMLString(Self.document(body: initialHTML), baseURL: nil)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "htmlChanged")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onChange: (String) -> Void
        init(onChange: @escaping (String) -> Void) { self.onChange = onChange }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "htmlChanged", let html = message.body as? String {
                onChange(html)
            }
        }
    }

    /// The editable HTML document — RTL, Arabic system font, light/dark aware.
    private static func document(body: String) -> String {
        """
        <!doctype html>
        <html dir="rtl" lang="ar">
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>
          :root { color-scheme: light dark; }
          html, body { margin: 0; padding: 0; background: transparent; }
          #sabq-editor {
            font-family: -apple-system, "SF Arabic", system-ui, sans-serif;
            font-size: 17px; line-height: 1.9;
            padding: 14px; min-height: 280px;
            direction: rtl; text-align: right;
            outline: none; -webkit-user-select: text;
            color: #15151c;
          }
          @media (prefers-color-scheme: dark) { #sabq-editor { color: #f2f2f5; } }
          #sabq-editor h2 { font-size: 22px; font-weight: 800; margin: 0.6em 0 0.3em; }
          #sabq-editor h3 { font-size: 19px; font-weight: 800; margin: 0.6em 0 0.3em; }
          #sabq-editor p { margin: 0 0 0.9em; }
          #sabq-editor ul, #sabq-editor ol { padding-inline-start: 22px; }
          #sabq-editor blockquote {
            border-inline-start: 3px solid #c9ccd4; margin: 0.6em 0;
            padding-inline-start: 12px; color: #5b5f6a;
          }
          #sabq-editor img { max-width: 100%; height: auto; border-radius: 10px; }
          #sabq-editor a { color: #2f7ad6; }
          #sabq-editor:empty:before {
            content: "اكتب نص الخبر هنا…"; color: #9aa0ab;
          }
        </style>
        </head>
        <body>
        <div id="sabq-editor" contenteditable="true">\(body)</div>
        <script>
          var ed = document.getElementById('sabq-editor');
          function notify() {
            try { window.webkit.messageHandlers.htmlChanged.postMessage(ed.innerHTML); } catch (e) {}
          }
          ed.addEventListener('input', notify);
          ed.addEventListener('blur', notify);
        </script>
        </body>
        </html>
        """
    }
}
