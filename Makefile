DIST := dist
SAFARI_DIR := $(DIST)/safari
SAFARI_PROJECT := $(SAFARI_DIR)/JabRef Browser Extension.xcodeproj
SAFARI_BUNDLE := $(DIST)/safari-mv3
SAFARI_APP := $(SAFARI_DIR)/JabRef Browser Extension.app
SAFARI_DERIVED_DATA := $(SAFARI_DIR)/build

.PHONY: safari sign-safari-local notarize-safari-local clean-safari

safari:
	rm -rf "$(SAFARI_DIR)"
	rm -rf "$(SAFARI_BUNDLE)"
	pnpm build:safari
	mkdir -p "$(SAFARI_DIR)"
	cp -R .output/safari-mv3 "$(SAFARI_BUNDLE)"
	xcodebuild -project "$(SAFARI_PROJECT)" \
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
