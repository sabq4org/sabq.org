#!/usr/bin/env bash
# بناء تطبيق خليجي 27 من سطر الأوامر (macOS + Xcode فقط).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/GulfCup.xcodeproj"
SCHEME="${SCHEME:-GulfCup}"
CONFIG="${CONFIG:-Debug}"
DEST="${DEST:-generic/platform=iOS}"
DERIVED="${DERIVED:-$ROOT/build/DerivedData}"

if [[ -z "${SDK:-}" ]]; then
  if [[ "$DEST" == *Simulator* ]]; then
    SDK=iphonesimulator
  else
    SDK=iphoneos
  fi
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "❌ xcodebuild غير متوفر — شغّل هذا السكربت على macOS مع Xcode 15+." >&2
  exit 1
fi

echo "▶︎ Scheme: $SCHEME | Config: $CONFIG | SDK: $SDK | Destination: $DEST"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -sdk "$SDK" \
  -destination "$DEST" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build

echo "✅ Build succeeded — DerivedData: $DERIVED"
