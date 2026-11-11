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
            let raw = field.text ?? ""
            let clean = String(DigitEntryField.latinDigits(raw, extra: parent.extraAllowed)
                .prefix(parent.maxLength))
            if raw != clean {
                // إعادة كتابة النص («٥» → 5) ترمي المؤشر إلى النهاية، فيُكتب الرقم التالي
                // في غير مكانه (مثلًا بعد +966 الجاهزة). نحفظ موضعه بعدد الخانات قبله.
                var caret = clean.count
                if let range = field.selectedTextRange {
                    let utf16Offset = field.offset(from: field.beginningOfDocument, to: range.start)
                    let before = (raw as NSString).substring(to: min(max(utf16Offset, 0), (raw as NSString).length))
                    caret = min(DigitEntryField.latinDigits(before, extra: parent.extraAllowed).count, clean.count)
                }
                field.text = clean
                if let pos = field.position(from: field.beginningOfDocument, offset: caret) {
                    field.selectedTextRange = field.textRange(from: pos, to: pos)
                }
            }
            if parent.text != clean { parent.text = clean }
        }

        func textFieldDidBeginEditing(_ textField: UITextField) {
            if parent.isFocused?.wrappedValue == false { parent.isFocused?.wrappedValue = true }
            // ابدأ في نهاية النص (حقل الهاتف يبدأ بـ +966).
            DispatchQueue.main.async {
                let end = textField.endOfDocument
                textField.selectedTextRange = textField.textRange(from: end, to: end)
            }
        }

        func textFieldDidEndEditing(_ textField: UITextField) {
            if parent.isFocused?.wrappedValue == true { parent.isFocused?.wrappedValue = false }
        }
    }
}
