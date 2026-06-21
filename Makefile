DIST := dist
SAFARI_DIR := $(DIST)/safari
SAFARI_PROJECT := $(SAFARI_DIR)/JabRef Browser Extension
SAFARI_APP := $(SAFARI_DIR)/JabRef Browser Extension.app
SAFARI_DERIVED_DATA := $(SAFARI_DIR)/build
SAFARI_SRC_TMP := /tmp/jabref-safari-src

.PHONY: safari sign-safari-local notarize-safari-local clean-safari

safari:
	./node_modules/.bin/wxt build -b safari
	mkdir -p "$(SAFARI_DIR)"
	rm -rf "$(SAFARI_DIR)/bundle"
	rm -rf "$(SAFARI_PROJECT)"
	rm -rf "$(SAFARI_APP)"
	rm -rf "$(SAFARI_DERIVED_DATA)"
	node scripts/prepare_safari_bundle.mjs
	rm -rf "$(SAFARI_SRC_TMP)"
	mkdir -p "$(SAFARI_SRC_TMP)"
	cp -R "$(SAFARI_DIR)/bundle"/. "$(SAFARI_SRC_TMP)"
	xcrun safari-web-extension-converter "$(SAFARI_SRC_TMP)" --project-location "$(SAFARI_DIR)" --macos-only --no-open --no-prompt --bundle-identifier org.jabref.JabRef-Browser-Extension --force --copy-resources --app-name "JabRef Browser Extension"
	rm -rf "$(SAFARI_SRC_TMP)"
	xcodebuild -project "$(SAFARI_PROJECT)/JabRef Browser Extension.xcodeproj" \
		-scheme "JabRef Browser Extension" \
		-configuration Release \
		-derivedDataPath "$(SAFARI_DERIVED_DATA)" \
		CODE_SIGN_IDENTITY="" \
		CODE_SIGNING_REQUIRED=NO \
		CODE_SIGNING_ALLOWED=NO \
		build
	ditto "$(SAFARI_DERIVED_DATA)/Build/Products/Release/JabRef Browser Extension.app" "$(SAFARI_APP)"

sign-safari-local:
	chmod +x scripts/sign_safari_local.sh
	./scripts/sign_safari_local.sh "$(IDENTITY)"

notarize-safari-local:
	chmod +x scripts/notarize_safari_local.sh
	./scripts/notarize_safari_local.sh "$(PROFILE)"

clean-safari:
	rm -rf "$(SAFARI_DIR)"
