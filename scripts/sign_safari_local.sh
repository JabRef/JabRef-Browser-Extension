#!/bin/bash

set -e

IDENTITY="$1"
if [ -z "$IDENTITY" ]; then
    echo "Usage: pnpm sign:safari-local \"Developer ID Application: Your Name (TEAMID)\""
    echo "   or: IDENTITY=\"Developer ID Application: Your Name (TEAMID)\" pnpm sign:safari-local"
    exit 1
fi

SAFARI_DIR="dist/safari"
APP_NAME="JabRef Browser Extension"
APP_PATH="$SAFARI_DIR/$APP_NAME.app"
EXTENSION_ENTITLEMENTS="safari/entitlements/extension.entitlements"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App bundle not found at $APP_PATH. Run 'pnpm build:safari' first."
    exit 1
fi

echo "Cleaning up generated cruft..."
find "$APP_PATH" -name ".DS_Store" -delete || true
find "$APP_PATH" -name "__pycache__" -type d -exec rm -rf {} + || true
find "$APP_PATH" -name "build" -type d -exec rm -rf {} + || true
find "$APP_PATH" -name "*.md" -delete || true

echo "Signing native binaries..."
find "$APP_PATH" -type f \( -name "*.dylib" -o -name "*.node" -o -name "*.so" \) -exec codesign --force --options runtime --sign "$IDENTITY" --timestamp --verbose=4 {} \;

# PlugInKit rejects Safari web extensions unless the embedded .appex is sandboxed.
# The host app remains unsandboxed so its native bridge can launch the separately
# installed JabRef application in the direct-distribution build.
EXTENSION_PATH=$(find "$APP_PATH" -name "*.appex" | head -n 1)
if [ -n "$EXTENSION_PATH" ]; then
    EXTENSION_EXE=$(find "$EXTENSION_PATH" -path "*/Contents/MacOS/*" -type f | head -n 1)
    if [ -n "$EXTENSION_EXE" ]; then
        codesign --force --options runtime --entitlements "$EXTENSION_ENTITLEMENTS" --sign "$IDENTITY" --timestamp --verbose=4 "$EXTENSION_EXE"
    fi
    codesign --force --options runtime --entitlements "$EXTENSION_ENTITLEMENTS" --sign "$IDENTITY" --timestamp --verbose=4 "$EXTENSION_PATH"
fi

MAIN_EXE="$APP_PATH/Contents/MacOS/$APP_NAME"
if [ -f "$MAIN_EXE" ]; then
    codesign --force --options runtime --sign "$IDENTITY" --timestamp --verbose=4 "$MAIN_EXE"
fi

codesign --force --options runtime --sign "$IDENTITY" --timestamp --verbose=4 "$APP_PATH"

if ! codesign -vvv --deep --strict "$APP_PATH"; then
    echo "Deep verification failed, retrying without --deep..."
    codesign -vvv --strict "$APP_PATH"
fi

echo "Done! Signed app is at $APP_PATH"
