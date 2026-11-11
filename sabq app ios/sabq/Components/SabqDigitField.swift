import SwiftUI
import UIKit

/// حقل أرقام مبني على `UITextField` مباشرة (مطابق في كل تطبيقات سبق على iOS).
///
/// لماذا لا `TextField` من SwiftUI؟ على iOS 26 و27 (أُعيد إنتاجه على المحاكي 2026-11-11)
/// حين تكون لغة الجهاز عربية، `TextField` مع لوحة أرقام (`numberPad` /
/// `asciiCapableNumberPad` / `phonePad` / `decimalPad`) يقبل الأرقام في قيمته لكنه لا يرسمها:
/// يكتب المستخدم رقمه فلا يرى شيئًا ويظن أنه لم يُدخل. `UITextField` بنفس اللوحة يرسمها سليمة.
/// القيمة تُحوّل إلى أرقام لاتينية 0-9 لأن لوحة الجهاز العربي تكتب «٥١٢…».
struct DigitEntryField: UIViewRepresentable {
    @Binding var text: String
    var placeholder: String
    var maxLength: Int
    var keyboard: UIKeyboardType = .numberPad
    /// رموز تُقبل مع الأرقام، مثل "+" للهاتف الدولي أو "." للمبالغ.
    var extraAllowed: String = ""
    var contentType: UITextContentType? = nil
    var font: UIFont = .monospacedDigitSystemFont(ofSize: 16, weight: .medium)
    var textColor: UIColor = .label
    var placeholderColor: UIColor = .placeholderText
    var tintColor: UIColor? = nil
    var alignment: NSTextAlignment = .left
    var accessibilityLabel: String? = nil
    var isFocused: Binding<Bool>? = nil

    func makeUIView(context: Context) -> UITextField {
        let field = UITextField()
        field.keyboardType = keyboard
        field.textContentType = contentType
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.spellCheckingType = .no
        field.semanticContentAttribute = .forceLeftToRight
        field.adjustsFontForContentSizeCategory = true
        field.delegate = context.coordinator
        field.addTarget(context.coordinator, action: #selector(Coordinator.editingChanged(_:)), for: .editingChanged)
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return field
    }

    func updateUIView(_ field: UITextField, context: Context) {
        context.coordinator.parent = self
        field.textAlignment = alignment
        field.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: font)
        field.textColor = textColor
        if let tintColor { field.tintColor = tintColor }
        field.attributedPlaceholder = NSAttributedString(
            string: placeholder, attributes: [.foregroundColor: placeholderColor])
        field.accessibilityLabel = accessibilityLabel ?? placeholder
        if field.text != text { field.text = text }
        guard let isFocused else { return }
        if isFocused.wrappedValue, !field.isFirstResponder {
            // بعد دورة العرض: عند الظهور الأول قد لا يكون الحقل في نافذة بعد.
            DispatchQueue.main.async { if field.window != nil { field.becomeFirstResponder() } }
        } else if !isFocused.wrappedValue, field.isFirstResponder {
            DispatchQueue.main.async { field.resignFirstResponder() }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    /// أرقام لاتينية فقط (يحوّل ٠-٩ و۰-۹، والفاصلة العشرية «٫» إلى "." إن كانت "." مقبولة)
    /// مع إبقاء الرموز المسموح بها في `extra`، وحذف ما سواها.
    static func latinDigits(_ text: String, extra: String = "") -> String {
        let allowed = Set(extra.unicodeScalars.map(\.value))
        var out = String.UnicodeScalarView()
        for s in text.unicodeScalars {
            switch s.value {
            case 0x30...0x39: out.append(s)
            case 0x660...0x669: out.append(Unicode.Scalar(s.value - 0x660 + 0x30)!)
            case 0x6F0...0x6F9: out.append(Unicode.Scalar(s.value - 0x6F0 + 0x30)!)
            case 0x66B where allowed.contains(0x2E): out.append(".")
            default: if allowed.contains(s.value) { out.append(s) }
            }
        }
        return String(out)
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: DigitEntryField
        init(_ parent: DigitEntryField) { self.parent = parent }

        @objc func editingChanged(_ field: UITextField) {
            let clean = String(DigitEntryField.latinDigits(field.text ?? "", extra: parent.extraAllowed)
                .prefix(parent.maxLength))
            if field.text != clean { field.text = clean }
            if parent.text != clean { parent.text = clean }
        }

        func textFieldDidBeginEditing(_ textField: UITextField) {
            if parent.isFocused?.wrappedValue == false { parent.isFocused?.wrappedValue = true }
        }

        func textFieldDidEndEditing(_ textField: UITextField) {
            if parent.isFocused?.wrappedValue == true { parent.isFocused?.wrappedValue = false }
        }
    }
}

extension String {
    /// أرقام لاتينية فقط (0-9). لوحة الأرقام في جهاز لغته العربية تكتب «٥١٢…»؛ بقاؤها كما هي
    /// كان يُفشل شرط البدء بـ 5 في رقم الجوال، ويُرسل رمز التحقق بأرقام لا يفهمها الخادم.
    var sabqLatinDigits: String { DigitEntryField.latinDigits(self) }
}
