# دليل موافقة GA4 وGoogle Ad Manager

آخر مراجعة: 2026-09-13

هذا المستند يوثق حالة تكامل الموافقة ومسار إصلاحها. لا يمثل تفعيلًا لإعدادات Google، ولا يفرض قيمًا افتراضية للموافقة في الكود.

## الحالة الحالية

الإنتاج وقت التدقيق يحمّل GA4 مباشرة من `client/index.html`؛ الإصلاح المحلي ينقل التحميل إلى `client/src/lib/analytics-privacy.ts` ويستدعي `config` مع `send_page_view: false`. لا توجد في المستودع أو مورد GTM المنشور الذي تمت مراجعته أوامر صريحة لـ:

- `gtag('consent', 'default'| 'update', ...)`؛
- `gtag_enable_tcf_support` أو `__tcfapi` أو `__gpp`؛
- `enableAdvertiserConsentMode`؛
- جسر موثق بين CMP وGA4/GTM.

في المتصفح الحي ظهر تحميل `fundingchoicesmessages.google.com` ووجود الكوكيز `FCCDCF` و`FCNEC`. هذا يثبت وجود مسار Google Funding Choices/CMP في الجلسة، لكنه لا يثبت أن اختيار المستخدم يحدّث إشارات GA4 أو شروط وسوم GTM.

وسوم الإعلانات المخصصة في GTM تتعامل مع GPT وPermutive. وجود Consent Mode في schema الداخلي لمورد GTM لا يثبت وجود وسم Consent فعّال. أكد مالك الموقع أن `GTM-T5PW84LM` تابعة لشركة الإعلانات. يجب فحص مساحة عملها عند الشركة ومقارنتها بالمورد المنشور.

في حساب Ad Manager المفتوح باسم SABQ لم تظهر رسالة European regulations منشورة، وكان Consent mode للإعلانات غير مفعّل. هذه مشاهدة لذلك الحساب فقط؛ لم يُثبت أنه الحساب الذي يملك Funding Choices المحمّل في الإنتاج. لم نغيّر إعداداته.

## مالك حالة الموافقة

يجب اختيار مالك واحد لحالة الموافقة:

### Google CMP / Funding Choices

إذا كان Google CMP في Ad Manager هو المنتج المعتمد، فالمسار المقترح هو:

1. افتح **Google Ad Manager → Privacy & messaging**.
2. افتح رسالة **European regulations** المنشورة للموقع، ثم **Settings**.
3. راجع إعداد **Consent mode for advertising purposes**. عند تفعيله يفسر Google اختيار المستخدم لأغراض `ad_storage` و`ad_user_data` و`ad_personalization`.
4. راجع إعداد **Consent mode for analytics purposes**. يظهر هذا الخيار بعد تفعيل إعداد الإعلانات، ويستخدم اختيار الرسالة لتفسير `analytics_storage`.
5. تحقق من الرسالة المنشورة والمواقع/النطاقات التي تنطبق عليها، ومن رابط سحب الموافقة.
6. لا تضف `gtag consent update` مخصصًا في المشروع ما دام Google CMP هو المالك؛ وجود كاتبين للحالة قد يؤدي إلى ترتيب أو mapping متعارض.

Google يوضح أن إعدادات Google CMP قد تنطبق على المستخدمين الذين عُرضت لهم رسالة اللوائح الأوروبية. لذلك يجب تحديد سلوك المستخدمين خارج تلك المناطق وفق سياسة الموقع، بدل افتراض أن Google CMP سيحدث الحالة لهم تلقائيًا.

### CMP خارجي أو حل مخصص

إذا كان المالك CMP خارجيًا، فيجب أن يقدم callback أو API موثقًا لاستخراج الحالة وتغييرها. عندها يمكن إضافة bridge مملوك لطبقة التحليلات، بواجهة مفاهيمية مثل:

```ts
type ConsentState = {
  analytics_storage: "granted" | "denied";
  ad_storage: "granted" | "denied";
  ad_user_data: "granted" | "denied";
  ad_personalization: "granted" | "denied";
};

installConsentBridge({
  readInitialState,
  subscribeToChanges,
  resolveRegionPolicy,
});
```

قواعد هذا الجسر:

- لا يستنتج `granted` من وجود كوكيز أو من غياب TC string.
- لا يرسل `update` قبل أن يعيد CMP حالة موثقة.
- يرسل التغيير على الصفحة التي اختار فيها المستخدم، قبل انتقال SPA التالي.
- يدعم التغيير من granted إلى denied، وليس القبول الأول فقط.
- لا يرسل `analytics_storage` أو إشارات الإعلان بناءً على mapping غير موثق لأغراض TCF.
- يطبق فحوص GTM للوسوم المخصصة، لأن فحوص Google المدمجة لا تكفي تلقائيًا للوسوم التي تنفذ HTML أو تتصل بشركاء إعلان آخرين.

## سياسة المناطق والقيم الافتراضية

لا يفرض Google قيمة عالمية واحدة في كل المواقع. يذكر توثيق Google أن default يمكن تقييده بالمناطق التي تعرض فيها رسالة الموافقة، وذلك لتجنب فقدان القياس في مناطق لا تنطبق عليها الرسالة. القرار الصحيح هنا يحتاج موافقة مالك CMP والمالك التجاري/القانوني على:

- المناطق التي تعرض banner؛
- هل القياس التحليلي الأساسي مسموح قبل الاختيار في كل منطقة؛
- هل الإعلانات المخصصة أو user-provided data تحتاج موافقة منفصلة؛
- هل سيستخدم الموقع **Basic consent mode** (حظر الوسوم حتى الاختيار) أو **Advanced consent mode** (تحميل الوسوم بقيم افتراضية وسياسات cookieless عند الرفض).

لا يضاف `default denied` أو `default granted` عالميًا قبل اعتماد هذه السياسة.

## TCF 2.3

إذا كان الموقع يستخدم TCF، يجب تأكيد أن CMP يولد TC strings متوافقة مع TCF 2.3 وأن التكامل مع Google Consent Mode مفعّل. توثيق Google يذكر أن CMP يمكنه تفعيل التكامل عبر `TCData.enableAdvertiserConsentMode = true` أو عبر `window['gtag_enable_tcf_support'] = true` في الموقع.

Google Ad Manager يقبل TCF 2.3، وأصبح إنشاء strings الجديدة وفق TCF 2.3 مطلوبًا من 1 مارس 2026 بحسب توثيقه الحالي. يجب تأكيد خطة CMP وترقيته إلى TCF 2.3 مع مالكه قبل الاعتماد على الإعلانات البرمجية في المناطق المتأثرة.

لا يكفي وجود TC string وحده لإثبات صحة mapping. يجب فحص حالة الأغراض والموردين، ثم مقارنة ما ينتج مع قيم:

```text
analytics_storage
ad_storage
ad_user_data
ad_personalization
```

## مصفوفة الاختبار

تستخدم الاختبارات نطاقًا أو معرّف قياس تجريبيًا إن أمكن، ولا تُجرى أحداث تفاعل تغيّر بيانات المستخدم الحقيقية.

| السيناريو | الحالة الأولية | الإجراء | المتوقع في المتصفح | المتوقع في GA4/GTM |
|---|---|---|---|---|
| السعودية: أول زيارة | لا كوكيز ولا تخزين محلي | فتح الرئيسية | يطابق سياسة السعودية المعتمدة؛ لا تخمين من وجود كوكيز | default موثق قبل أول حدث، ثم event واحد وفق السياسة |
| السعودية: قبول التحليلات | banner ظاهر | قبول التحليلات فقط | تحديث CMP مرة واحدة | `analytics_storage=granted`، وبقاء إشارات الإعلان denied إن كانت السياسة تفصلها |
| السعودية: قبول الكل | banner ظاهر | قبول الكل | تحديث واحد وعدم إعادة تحميل مضاعفة | إشارات الأربع وفق القرار، ووسوم الإعلان المسموح بها فقط |
| السعودية: رفض | banner ظاهر | رفض الكل | لا كوكيز تسويقية/تحليلية بحسب الوضع المختار | Basic: لا tag قبل الاختيار؛ Advanced: قياس cookieless وفق التوثيق والسياسة |
| السعودية: سحب الموافقة | حالة granted محفوظة | فتح مركز الخصوصية ثم سحبها | حذف/تقييد التخزين المسموح به، دون إعادة موافقة صامتة | update إلى denied وتوقف الوسوم التي تتطلبها |
| أوروبا/EEA أو UK/CH: أول زيارة | CMP/TCF ظاهر | فتح الصفحة دون اختيار | وجود TC string صالح إن كان TCF مستخدمًا | لا طلب إعلان مخصص قبل أساس الموافقة المناسب |
| أوروبا/EEA أو UK/CH: قبول/رفض غرض واحد | TC string موجود | تغيير غرض التحليلات أو الإعلانات | تحديث TC string دون ازدواج | mapping متسق لكل إشارة من الأربع |
| SPA بعد الاختيار | حالة موافقة محفوظة | تنقل خبر/تصنيف/رجوع/تقدم | لا banner متكرر بلا سبب | لا consent update مكرر، و`page_view` واحد لكل انتقال |
| فشل CMP أو تأخره | CMP لا يرد | فتح الصفحة | سلوك fallback مطابق للسياسة | لا يتحول الفشل تلقائيًا إلى granted؛ يسجل سبب التشخيص فقط |

لكل سيناريو يجب حفظ لقطة من Network وdataLayer/Tag Assistant، مع إخفاء client ID وقيَم الكوكيز وأي بيانات شخصية.

## أسئلة يجب أن يجيب عنها مالك CMP

1. هل `fundingchoicesmessages.google.com` هو Google CMP الرسمي لهذا النطاق، أم أن هناك CMP آخر يحمّل نفس المسار؟
2. هل رسائل European regulations منشورة للموقع، وما النطاقات والمناطق التي تنطبق عليها؟
3. هل إعدادا Consent Mode للإعلانات والتحليلات مفعّلان في Ad Manager؟
4. هل CMP متوافق حاليًا مع TCF 2.3، وهل `enableAdvertiserConsentMode` مفعّل؟
5. ما السياسة المعتمدة لمستخدمي السعودية والمستخدمين خارج EEA/UK/CH؟
6. هل القياس المتقدم cookieless مقبول تجاريًا وقانونيًا، أم يجب استخدام Basic consent mode؟
7. ما الوسوم غير التابعة لـGoogle التي يجب حظرها عند رفض الإعلان، خصوصًا Permutive وNovatiq وأي مزود إعلاني آخر؟
8. من يملك تحديثات الموافقة في SPA: CMP نفسه أم طبقة التحليلات؟

## مصادر Google الرسمية

- [Consent mode overview](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- [Set up consent mode on websites](https://developers.google.com/tag-platform/security/guides/consent)
- [Consent Mode for CMP providers](https://developers.google.com/tag-platform/security/concepts/cmp)
- [Implement the Transparency & Consent Framework](https://developers.google.com/tag-platform/security/guides/implement-TCF-strings)
- [Manage consent mode settings in Google Ad Manager](https://support.google.com/admanager/answer/16053245?hl=en)
- [Publisher integration with IAB Europe TCF](https://support.google.com/admanager/answer/9805023?hl=en)
- [European regulations overview and guidance](https://support.google.com/admanager/answer/10076805?hl=en)
