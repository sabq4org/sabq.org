#!/usr/bin/env bash
# نشر إصلاحات المونديال:
#   • الويب: الشريط المصغّر يعرض المباراتين المتزامنتين
#   • iOS: الهيرو + الشريط يعرضان المباراتين، والشاشة الرئيسية تتابع لحظيًّا
# يُشغَّل من جذر المشروع:  bash deploy-wc-fixes.sh
set -euo pipefail

BRANCH="fix/wc-strip-ios-live-$(date +%Y%m%d)"

FILES=(
  "client/src/components/worldcup/WorldCupHomeStrip.tsx"
  "sabq app ios/sabq/Components/WorldCupHomeStrip.swift"
  "sabq app ios/sabq/Screens/WorldCupView.swift"
  "sabq app ios/sabq/Services/WorldCupModels.swift"
)

echo "==> 1) تنظيف أي أقفال عالقة في .git"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null || true

echo "==> 2) إنشاء فرع جديد من الحالي: $BRANCH"
git checkout -b "$BRANCH"

echo "==> 3) التحقق من الويب (typecheck)"
npm run check

echo "==> 4) إضافة ملفات الإصلاح فقط (4 ملفات)"
git add "${FILES[@]}"
echo "    المُجهّز للالتزام:"
git status --short -- "${FILES[@]}"
echo

echo "==> 5) التزام"
git commit -m "fix(worldcup): بطاقتان متزامنتان في الشريط + متابعة لحظية في تطبيق iOS

- الويب: الشريط المصغّر يعرض المباراتين المتزامنتين (matchOfDayPeers)
- iOS: الهيرو والشريط يعرضان المباراتين المتزامنتين
- iOS: استطلاع لحظي كل 8ث في الشاشة الرئيسية فيتحدّث الوقت/النتيجة تلقائيًّا"

echo "==> 6) دفع الفرع"
git push origin "$BRANCH"

echo
echo "✓ تم رفع الفرع: $BRANCH"
echo "افتح Pull Request على GitHub وادمجه إلى main:"
echo "  • الويب  : Cloudflare يعيد النشر تلقائيًّا"
echo "  • iOS    : Xcode Cloud يبني النسخة ويرفعها إلى TestFlight (إن كان يبني من main)"
