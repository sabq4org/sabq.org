# تشغيل فهرس اكتشاف الوكلاء عبر DNS

هذا المستند يصف إعلانًا تجريبيًا اختياريًا لفهرس سبق الثابت:
`https://sabq.org/.well-known/agent-index.json`.

الفكرة تخص حالة «المؤسسة المعروفة» في [مسودة DNS-AID، القسم 3.2](https://datatracker.ietf.org/doc/html/draft-mozleywilliams-dnsop-dnsaid-02#section-3.2).
المسودة إنترنت-درافت وليست معيارًا نهائيًا، كما أن بروتوكول ومخطط الفهرس
خارج نطاق ذلك القسم؛ لذلك يبقى هذا التعيين تجريبيًا ومحليًا.

الفهرس يستخدم المخطط المحلي `sabq.agent-index.v1` الموثق داخل ملف JSON، ويصف
قراءات HTTPS العامة والخلاصات فقط. لا يعني وجوده توفير MCP أو A2A أو OAuth.

## سجل SVCB تجريبي

يُستخدم SVCB (النوع 64) كما في القسم 3.2، وليس HTTPS (النوع 65)؛
فالاستعلام عن نوع لا يعيد سجلات النوع الآخر.

التعيين المقترح، بصيغة توضيحية لسجل DNS SVCB، هو:

```text
_index._agents.sabq.org. 300 IN SVCB 1 sabq.org. alpn="h2" port=443 key65400="path=/.well-known/agent-index.json"
```

`key65400` رقم تجريبي خاص بالمؤسسة (private-use mapping)، وليس معاملًا قياسيًا
ولا ينبغي تفسيره خارج هذا التوثيق. الهدف `sabq.org`، و`h2`، والمنفذ `443`،
والمسار كلها جزء من الاقتراح المحلي.

لا تُضاف سجلات DNS قبل نشر الملف والتحقق من استجابة HTTPS العامة، وصحة JSON،
وتوافق الروابط مع السياسة. يلزم أيضًا التحقق من Pages وCloudflare بعد النشر؛
هذا المستند لا يمثل تغييرًا حيًا في DNS.

## التحقق بعد النشر

نفّذ الأوامر التالية من جهاز يملك DNS وHTTPS خارجيين، مع عدم تضمين أي أسرار:

```sh
dig +short SVCB _index._agents.sabq.org
curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  -H 'Accept: application/json' \
  https://sabq.org/.well-known/agent-index.json | jq -e '
    .schema == "sabq.agent-index.v1" and
    (.services | length == 1) and
    (.services[0].access == "public-get") and
    (.policy.content_signal == "search=yes, ai-input=yes, ai-train=no")'
curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  https://sabq.org/llms.txt | grep -F '/.well-known/agent-index.json'
```

تحقق من أن استجابة JSON و`llms.txt` عامة و200، وأن كل الروابط داخل JSON ما زالت
تستخدم `https://sabq.org` و`GET`. هذه الأوامر لا تثبت توافقًا عامًا مع أي عميل؛
تثبت فقط العقد المحلي المنشور.

## التراجع

احذف سجل SVCB المضاف لهذا الغرض فقط من مزود DNS، ثم أعد التحقق:

```sh
dig +short SVCB _index._agents.sabq.org
curl --fail --silent --show-error https://sabq.org/.well-known/agent-index.json \
  | jq -e '.schema == "sabq.agent-index.v1"'
```

لا تحذف سجلات `sabq.org` الأخرى ولا تغيّر إعدادات Pages أو Cloudflare أثناء
التراجع. إزالة سجل DNS لا تحذف الملف المنشور. وإذا أزيل الملف، فلا تفترض أن
المسار سيعيد 404: طبقة Pages قد تعيد قشرة SPA؛ يجب أن يفشل تحقق JSON أو يظهر
محتوى غير صالح للكتالوج، وعندها يُعدّ الإعلان غير صالح حتى يُعاد نشر الملف.
