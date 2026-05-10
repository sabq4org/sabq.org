#!/bin/bash

echo "🧹 بدء تنظيف المشروع..."

echo "📦 تنظيف Android build artifacts..."
rm -rf android/app/build android/.gradle 2>/dev/null
echo "✓ تم حذف Android build"

echo "📦 تنظيف ملفات Build المؤقتة..."
find node_modules -name "*.log" -delete 2>/dev/null
find .cache -name "*.log" -not -path ".cache/replit/*" -delete 2>/dev/null
echo "✓ تم حذف ملفات Log"

echo "📊 حجم المشروع بعد التنظيف:"
du -sh node_modules .git attached_assets 2>/dev/null

echo "✅ اكتمل التنظيف!"
