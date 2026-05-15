#!/bin/bash
# 🚀 سكربت رفع تطبيق سبق لـ TestFlight
# الاستخدام: ./deploy-testflight.sh

set -euo pipefail

PROJECT_DIR="/Users/alialhazmi/sabq/sabq app ios"
SCHEME="sabq"
ARCHIVE_PATH="$HOME/Desktop/sabq.xcarchive"
EXPORT_PATH="$HOME/Desktop/sabq-export"
TEAM_ID="CBU7MJEC5R"
EXPORT_PLIST="/tmp/SabqExportOptions.plist"

echo "🚀 بدأ رفع سبق لـ TestFlight..."
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

# 4. رفع لـ App Store Connect
echo "📤 رفع لـ TestFlight..."
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -exportPath "$EXPORT_PATH" \
  -allowProvisioningUpdates \
  2>&1 | grep -E "Progress|EXPORT|Upload|Error" || true

if [ $? -ne 0 ]; then
    echo "❌ فشل الرفع!"
    exit 1
fi

echo ""
echo "🎉 تم الرفع بنجاح! التطبيق بيظهر في TestFlight خلال 5-15 دقيقة"
echo ""

# 5. تنظيف
rm -f "$EXPORT_PLIST"
echo "🧹 تم التنظيف"
