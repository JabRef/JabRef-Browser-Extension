#!/bin/bash

set -e

APP_REL_PATH="jabrefHost.py"

if [[ $EUID != 0 ]]; then
    # User-based install (does not require sudo premission)
    echo "User-based installation in progress for user $USER..."
    echo "Note: use sudo ./install_linux.sh for global installation"
    INSTALL_PATH="$HOME/.mozilla/native-messaging-hosts"
else
    echo "Root installation in progress all users..."
    INSTALL_PATH="/usr/lib/mozilla/native-messaging-hosts/"
fi

# Creating folder if required
mkdir -p "$INSTALL_PATH"

# Getting jabref json from upstream and change path to the INSTALL_PATH env variable
curl "https://raw.githubusercontent.com/JabRef/jabref/master/buildres/linux/org.jabref.jabref.json" > "$INSTALL_PATH/org.jabref.jabref.json"
sed -i "s|/opt/jabref/lib/jabrefHost.py|$INSTALL_PATH/jabrefHost.py|g" "$INSTALL_PATH/org.jabref.jabref.json"

cp "$APP_REL_PATH" "$INSTALL_PATH/$APP_REL_PATH"
chmod a+x "$INSTALL_PATH/$APP_REL_PATH"