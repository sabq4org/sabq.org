---
name: ios-safe-edit
description: قواعد التعديل الآمن على مشاريع iOS في سبق (sabq app ios وsports app ios) — pbxproj، علامات RTL الخفية، الكيبورد داخل sheets، والتحقق بعد الدمج. استخدمها مع أي عمل Swift/Xcode.
---

# التعديل الآمن على تطبيقات iOS

## ملفات جديدة و pbxproj — المشروعان مختلفان

- **`sabq app ios/sabq.xcodeproj`**: يستخدم مجلدات Xcode 16 المتزامنة (`PBXFileSystemSynchronizedRootGroup`) — ملفات Swift الجديدة تُلتقط تلقائيًا، لا جراحة pbxproj.
- **`sports app ios/SabqSports.xcodeproj`**: مراجع صريحة لكل ملف — **تجنّب إنشاء ملفات جديدة** (عرف المستودع: «لتفادي مساس pbxproj»). أضف الكود إلى ملفات قائمة (المساعدات المشتركة في SportsComponents.swift). إن لزم ملف جديد فعلًا: اطلب من المالك إضافته عبر Xcode.
- كلا الـ pbxproj قد يحمل WIP غير مكتوم للمالك — لا تلمسهما.

## فخ التحرير: علامات RTL الخفية

التعليقات العربية في ملفات Swift/TS تحتوي غالبًا علامات اتجاه خفية تُفشل مطابقة Edit الحرفية. ثبّت التعديلات على أسطر كود ASCII فقط، أو استخدم سكربت python سطريًا لمناطق التعليقات.

## الكيبورد وحقول الإدخال داخل sheets (درس مثبت، PR \u200E#987)

- **ممنوع `@FocusState` لحقول الإدخال داخل sheets** — كتاباته لا تصل أبدًا، فتسحب SwiftUI التركيز مع كل إعادة رسم ويختفي الكيبورد مع كل حرف. UIKit يملك التركيز (لمسة المستخدم تمنحه).
- الإسقاط عبر `sabqDismissKeyboard()` (معرّفة في ArticleSubmissionView.swift).
- `SabqRichTextEditor`: لا إدارة تركيز في `updateUIView`، ولا كتابة فوق نص UITextView أثناء التحرير الحي (`!uiView.isFirstResponder` شرط الكتابة). تلوين الإطار عبر `onEditingChanged`.
- `.scrollDismissesKeyboard(.interactively)` وليس `.immediately`.
- محاذاة الحقول العربية: `.multilineTextAlignment(.leading)` (= يمين في بيئة RTL) وليس `.trailing`.

## بعد الدمج والرفع

- الدمج المبكر من GitHub قد يسبق دفعتك الأخيرة: تحقق `git grep <marker> origin/main` بعد كل دمج.
- أرقام بناء TestFlight متمايزة (نمط 2026071807) واطلب من المالك التحقق من الرقم في «عن سبق» بعد كل رفع.

## التشخيص الصعب

بناء نسخة مُسجّلة (NSLog) على المحاكي + `simctl spawn log stream` — هذه المنهجية نفت نظريتين خاطئتين قبل كشف سبب مشكلة الكيبورد الفعلي.
