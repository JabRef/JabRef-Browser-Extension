#!/usr/bin/env bash
#
# JabRef-Browser-Extension
# Copyright (C) 2019 JabRef Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 2 or (at your option)
# version 3 of the License.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

set -e

DEBUG=false
INSTALL_FILE="org.jabref.jabref.json"

askBrowserSnap() {
    if (whiptail --title "Snap Choice" --defaultno \
            --yesno "Is this browser installed as a snap (usually NO)?" 8 60); then
        # BASE_DIR="$1"
        whiptail --title "Snap Choice" --msgbox "Sorry, browsers installed as snaps are not supported at this time" 8 50
        exit 0
    fi
}

getJson() {
    if [[ ! -z $1 ]]; then
        # Insert Firefox data
        JSON_OUT="https://raw.githubusercontent.com/JabRef/jabref/master/buildres/linux/native-messaging-host/firefox/org.jabref.jabref.json"
    else
        # Insert Chrome data
        JSON_OUT="https://raw.githubusercontent.com/JabRef/jabref/master/buildres/linux/native-messaging-host/chromium/org.jabref.jabref.json"
    fi
}

setSnapJabrefPath() {
    sed -i 's|/opt/jabref/lib/jabrefHost.py|/snap/bin/jabref.browser-proxy|g' $TMPFILE
}

setupFirefox() {
    askBrowserSnap "./snap/firefox/common"
    getJson "firefox"
    INSTALL_USER="$HOME/.mozilla/native-messaging-hosts"
    INSTALL_ROOT="/usr/lib/mozilla/native-messaging-hosts"
}

setupChrome() {
    getJson
    INSTALL_USER="$HOME/.config/google-chrome/NativeMessagingHosts"
    INSTALL_ROOT="/etc/opt/chrome/native-messaging-hosts"
}

setupChromium() {
    askBrowserSnap "./snap/chromium/current"
    getJson
    INSTALL_USER="$HOME/.config/chromium/NativeMessagingHosts"
    INSTALL_ROOT="/etc/chromium/native-messaging-hosts"
}

setupVivaldi() {
    getJson
    INSTALL_USER="$HOME/.config/vivaldi/NativeMessagingHosts"
    INSTALL_ROOT="/etc/vivaldi/native-messaging-hosts"
}

setupBrave() {
    getJson
    INSTALL_USER="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    INSTALL_ROOT="/etc/chromium/native-messaging-hosts"
}

# --------------------------------
# Start of script
# --------------------------------

BROWSER=$(whiptail \
            --title "Browser Selection" \
            --menu "Choose a browser to integrate with JabRef:" \
            15 60 5 \
            "1" "Firefox" \
            "2" "Chrome" \
            "3" "Chromium" \
            "4" "Vivaldi" \
            "5" "Brave" \
            "6" "Opera" \
            3>&1 1>&2 2>&3)

clear

exitstatus=$?
if [ $exitstatus = 0 ]; then
    # Configure settings for the chosen browser
    case "$BROWSER" in
        1) setupFirefox ;;
        2) setupChrome ;;
        3) setupChromium ;;
        4) setupVivaldi ;;
        5) setupBrave ;;
        6) setupChrome ;;
    esac

    if [[ $EUID != 0 ]]; then
        # User-based install (does not require sudo premission)
        if (whiptail --title "User Install" --yesno "User-based installation in progress for user $USER...\nNote: use sudo ./install_linux.sh for global installation. Proceed?" 8 78); then
            INSTALL_DIR=$INSTALL_USER
        else
            exit 1
        fi
    else
        if (whiptail --title "Root Install" --yesno "Root Installation in progress all users... Proceed?"); then
            INSTALL_DIR=$INSTALL_ROOT
        else
            exit 1
        fi
    fi

    TMPFILE=$(mktemp)
    mkdir -p "$INSTALL_DIR"
    curl -SL --silent "$JSON_OUT" -o $TMPFILE

    if [ -d "$HOME/snap/jabref/common" ]; then
        if (whiptail --title "Setup Snap" --defaultno --yesno "Configure snap version of JabRef?" 8 60); then
            setSnapJabrefPath "$TMPFILE"
        fi
    fi

    install $TMPFILE ${INSTALL_DIR}/${INSTALL_FILE}

    $DEBUG && echo "Installed to: ${INSTALL_DIR}/${INSTALL_FILE}"

    whiptail \
        --title "Installation Complete" \
        --msgbox "You will need to restart your browser in order to connect to JabRef" \
        8 50
else
    whiptail --title "Installation Canceled" --msgbox "No changes were made to your system" 8 50
fi
