#!/bin/bash

set -e

PROFILE="$1"
if [ -z "$PROFILE" ]; then
    echo "Usage: $0 \"notarytool-profile-name\""
    echo "Create a profile with: xcrun notarytool store-credentials \"profile-name\" --apple-id \"your@apple.id\" --team-id \"TEAMID\" --password \"app-specific-password\""
    exit 1
fi

SAFARI_DIR="dist/safari"
APP_NAME="JabRef Browser Extension"
APP_PATH="$SAFARI_DIR/$APP_NAME.app"
ARCHIVE_PATH="$SAFARI_DIR/$APP_NAME.zip"
FINAL_ZIP="$SAFARI_DIR/jabref-browser-extension-safari.zip"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App bundle not found at $APP_PATH. Run 'pnpm safari:build-app' and sign it first."
    exit 1
fi

if ! codesign -vvv --deep --strict "$APP_PATH"; then
    echo "Deep verification failed, retrying without --deep..."
    codesign -vvv --strict "$APP_PATH"
fi

rm -f "$ARCHIVE_PATH"
ditto -c -k --keepParent "$APP_PATH" "$ARCHIVE_PATH"

xcrun notarytool submit "$ARCHIVE_PATH" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$APP_PATH"

rm -f "$FINAL_ZIP"
ditto -c -k --keepParent "$APP_PATH" "$FINAL_ZIP"

echo "Done! Notarized app is at $APP_PATH"
echo "Distribution zip is at $FINAL_ZIP"
