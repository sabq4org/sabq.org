#!/bin/bash
# 🚀 سكربت رفع تطبيق VARA الرياضي لـ TestFlight
# الاستخدام: ./deploy-testflight.sh
#
# ⚠️ مسار احتياطي فقط — النشر المعتمد عبر Xcode Cloud (الرفع المحلي مرفوض
# على macOS 27 لأنه يُبنى بنسخة Xcode تجريبية). السكربت لا يزيد
# CURRENT_PROJECT_VERSION فقد يصطدم رقم البناء برقم رفعه Xcode Cloud —
# تحقق قبل الاستخدام. نظير sabq app ios/deploy-testflight.sh.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEME="SabqSports"
ARCHIVE_PATH="$HOME/Desktop/vara.xcarchive"
EXPORT_PATH="$HOME/Desktop/vara-export"
TEAM_ID="CBU7MJEC5R"
EXPORT_PLIST="/tmp/VaraExportOptions.plist"

echo "🚀 بدأ رفع VARA لـ TestFlight..."
echo ""

# 1. تنظيف
echo "🧹 تنظيف البناء السابق..."
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH" 2>/dev/null || true

# 2. إنشاء ExportOptions
cat > "$EXPORT_PLIST" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>CBU7MJEC5R</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>uploadSymbols</key>
    <true/>
    <key>destination</key>
    <string>upload</string>
</dict>
</plist>
EOF

# 3. بناء Archive
echo "🔨 بناء التطبيق (Archive)..."
cd "$PROJECT_DIR"
xcodebuild archive \
  -project SabqSports.xcodeproj \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  -quiet 2>&1

if [ $? -ne 0 ]; then
    echo "❌ فشل البناء!"
    exit 1
fi
echo "✅ البناء نجح"

# 4. رفع لـ App Store Connect (نفس منطق سكربت سبق: نتحقق من خروج
# xcodebuild لا grep عبر PIPESTATUS كي لا يُخفى فشل حقيقي)
echo "📤 رفع لـ TestFlight..."
EXPORT_LOG="/tmp/vara-testflight-export.log"

if xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$EXPORT_PLIST" \
    -exportPath "$EXPORT_PATH" \
    -allowProvisioningUpdates \
    2>&1 | tee "$EXPORT_LOG" | grep --line-buffered -E "Progress|EXPORT|Upload|Error|altool"; then
    EXPORT_EXIT=${PIPESTATUS[0]}
else
    EXPORT_EXIT=${PIPESTATUS[0]}
fi

if [ "$EXPORT_EXIT" -ne 0 ]; then
    echo ""
    echo "❌ فشل الرفع! (exit $EXPORT_EXIT)"
    echo "📄 السجل الكامل: $EXPORT_LOG"
    tail -20 "$EXPORT_LOG" || true
    exit 1
fi

echo ""
echo "🎉 تم الرفع بنجاح! التطبيق بيظهر في TestFlight خلال 5-15 دقيقة"
echo "📄 السجل الكامل: $EXPORT_LOG"
echo ""

# 5. تنظيف
rm -f "$EXPORT_PLIST"
echo "🧹 تم التنظيف"
