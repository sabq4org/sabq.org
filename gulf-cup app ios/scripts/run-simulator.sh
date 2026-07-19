#!/usr/bin/env bash
# بناء + تشغيل «خليجي 27» على محاكي iOS (macOS + Xcode فقط).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE="${DEVICE:-iPhone 16}"
BUNDLE_ID="com.sabq.gulfcup"
DERIVED="${DERIVED:-$ROOT/build/DerivedData}"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "❌ xcodebuild غير متوفر — المحاكي يعمل على Mac مع Xcode فقط." >&2
  exit 1
fi

pick_udid() {
  # آخر جهاز متاح يطابق الاسم (غالباً أحدث iOS runtime)
  xcrun simctl list devices available \
    | grep -F "$DEVICE (" \
    | tail -1 \
    | sed -E 's/.*\(([A-F0-9-]{36})\).*/\1/'
}

echo "▶︎ البناء للمحاكي: $DEVICE"
DEST="platform=iOS Simulator,name=$DEVICE" "$ROOT/scripts/build.sh"

APP="$(find "$DERIVED/Build/Products" -path '*iphonesimulator*/GulfCup.app' -type d 2>/dev/null | head -1)"
if [[ -z "$APP" ]]; then
  APP="$(find "$DERIVED/Build/Products" -name 'GulfCup.app' -type d 2>/dev/null | head -1)"
fi
if [[ -z "$APP" ]]; then
  echo "❌ لم يُعثر على GulfCup.app بعد البناء" >&2
  exit 1
fi

UDID="$(pick_udid)"
if [[ -z "$UDID" ]]; then
  echo "❌ المحاكي «$DEVICE» غير متوفر. جرّب:" >&2
  echo "   xcrun simctl list devices available | grep iPhone" >&2
  echo "   DEVICE=\"iPhone 15\" ./scripts/run-simulator.sh" >&2
  exit 1
fi

echo "▶︎ UDID: $UDID"
xcrun simctl boot "$UDID" 2>/dev/null || true
open -a Simulator

xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE_ID"

echo "✅ تم تشغيل خليجي 27 على $DEVICE"
