import SwiftUI
import UIKit

/// حقل أرقام مبني على `UITextField` مباشرة.
///
/// لماذا لا `TextField` من SwiftUI؟ على iOS 26 و27 (ومُعاد إنتاجه على المحاكي 2026-11-11)
/// حين تكون لغة الجهاز عربية، `TextField` مع `.keyboardType(.numberPad)` (أو
/// `.asciiCapableNumberPad` / `.phonePad`) يقبل الأرقام في قيمته لكنه لا يرسمها إطلاقًا:
/// يكتب القارئ رقم جواله فلا يرى شيئًا ويظن أنه لم يُدخل. `UITextField` بنفس اللوحة يرسم
/// الأرقام سليمة، فنستخدمه هنا. القيمة تُحوّل إلى أرقام لاتينية 0-9 (`sabqLatinDigits`)
/// لأن لوحة الجهاز العربي تكتب «٥١٢…».
struct SabqDigitField: UIViewRepresentable {
    @Binding var text: String
    var placeholder: String
    var maxLength: Int
    var contentType: UITextContentType? = nil
    var font: UIFont = .monospacedDigitSystemFont(ofSize: 16, weight: .medium)
    var alignment: NSTextAlignment = .left
    var accessibilityLabel: String? = nil
    var isFocused: Binding<Bool>? = nil

    func makeUIView(context: Context) -> UITextField {
        let field = UITextField()
        field.keyboardType = .numberPad
        field.textContentType = contentType
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.spellCheckingType = .no
        field.semanticContentAttribute = .forceLeftToRight
        field.textAlignment = alignment
        field.adjustsFontForContentSizeCategory = true
        field.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: font)
        field.textColor = UIColor(SabqTheme.textPrimary)
        field.tintColor = UIColor(SabqTheme.primary)
        field.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: UIColor(SabqTheme.textTertiary)]
        )
        field.accessibilityLabel = accessibilityLabel
        field.delegate = context.coordinator
        field.addTarget(context.coordinator, action: #selector(Coordinator.editingChanged(_:)), for: .editingChanged)
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return field
    }

    func updateUIView(_ field: UITextField, context: Context) {
        context.coordinator.parent = self
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

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: SabqDigitField
        init(_ parent: SabqDigitField) { self.parent = parent }

        @objc func editingChanged(_ field: UITextField) {
            let clean = String((field.text ?? "").sabqLatinDigits.prefix(parent.maxLength))
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
    /// أرقام لاتينية فقط (0-9): يحوّل الأرقام الهندية (٠-٩) والفارسية (۰-۹) ويحذف ما سواها.
    /// لوحة الأرقام في جهاز لغته العربية تكتب «٥١٢…»؛ بقاؤها كما هي كان يُفشل شرط
    /// البدء بـ 5 في رقم الجوال فيبقى زر الإرسال معطلًا، ويُرسل رمز التحقق بأرقام لا يفهمها الخادم.
    var sabqLatinDigits: String {
        String(unicodeScalars.compactMap { scalar -> Character? in
            switch scalar.value {
            case 0x30...0x39: return Character(scalar)
            case 0x660...0x669: return Character(UnicodeScalar(scalar.value - 0x660 + 0x30)!)
            case 0x6F0...0x6F9: return Character(UnicodeScalar(scalar.value - 0x6F0 + 0x30)!)
            default: return nil
            }
        })
    }
}
