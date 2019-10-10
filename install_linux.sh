#!/bin/bash

APP_REL_PATH="jabref.py"

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

# Getting windows jabref json for windows
curl "https://raw.githubusercontent.com/JabRef/jabref/master/buildres/jabref.json" > "$INSTALL_PATH/jabref_win.json"

cat > tmp.py << EOF
import json
import pprint
import sys

with open(sys.argv[2]) as f:
    data = json.load(f)
    
if sys.argv[1] == "path":
    data["path"] = "$INSTALL_PATH/$APP_REL_PATH"
    print(json.dumps(data, indent=4))
elif sys.argv[1] == "name":
    print(data["name"])
EOF

APP_NAME=`python "tmp.py" name "$INSTALL_PATH/jabref_win.json"`
python "tmp.py" path "$INSTALL_PATH/jabref_win.json" > "$INSTALL_PATH/$APP_NAME.json"

rm -r "$INSTALL_PATH/jabref_win.json"
rm -r "tmp.py"

cp "jabref.py" "$INSTALL_PATH/$APP_REL_PATH"
chmod a+x "$INSTALL_PATH/$APP_REL_PATH"