#!/usr/bin/env bash
# نشر إصلاح بطاقات المباريات المتزامنة (مونديال 2026)
# يُشغَّل من جذر المشروع:  bash deploy-worldcup-fix.sh
set -euo pipefail

BRANCH="fix/worldcup-simultaneous-hero"

echo "==> 1) تنظيف ملفات القفل العالقة في .git"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null || true

echo "==> 2) التأكد من وجود الإصلاح (يجب أن يظهر commit الإصلاح)"
git checkout "$BRANCH"
git log --oneline -1
echo

echo "==> 3) التحقق من الأنواع والبناء"
npm run check
npm run build
echo "    ✓ البناء سليم"
echo

echo "==> 4) رفع الفرع إلى GitHub"
git push origin "$BRANCH"
echo "    ✓ تم رفع الفرع: $BRANCH"
echo

read -r -p "هل تريد الدمج إلى main ونشر الإنتاج الآن؟ (اكتب yes للتأكيد) " ANSWER
if [ "$ANSWER" = "yes" ]; then
  echo "==> 5) الدمج إلى main والدفع (سيُشغّل نشر Railway + Cloudflare Pages)"
  git checkout main
  git pull --ff-only origin main
  git merge --no-ff "$BRANCH" -m "merge: إصلاح بطاقات المباريات المتزامنة في المونديال"
  git push origin main
  echo "    ✓ تم الدفع إلى main — تابع لوحتي Railway وCloudflare Pages لاكتمال النشر"
else
  echo "تم تخطّي الدمج. الفرع مرفوع — افتح Pull Request على GitHub ثم ادمجه عند جاهزيتك."
fi
