DIST := dist
CHROME_DIR := $(DIST)/chrome
FIREFOX_DIR := $(DIST)/firefox
CHROME_ZIP := $(CHROME_DIR)/jabref-connector-chrome.zip
FIREFOX_XPI := $(FIREFOX_DIR)/jabref-connector-firefox.xpi

.PHONY: all chrome firefox clean

all: chrome firefox

chrome: $(CHROME_ZIP)

$(CHROME_ZIP):
	mkdir -p $(CHROME_DIR)
	zip -r $(CHROME_ZIP) . -x "dist/*" ".git/*" "translators/*" "scripts/*"

firefox: $(FIREFOX_XPI)

$(FIREFOX_XPI):
	web-ext build --artifacts-dir $(FIREFOX_DIR)  --ignore-files dist/** --ignore-files translators/** --ignore-files scripts/** --ignore-files .git/**
	mv $(FIREFOX_DIR)/jabref_connector-*.zip $(FIREFOX_XPI)

clean:
	rm -rf $(DIST)

lint:
	web-ext lint --ignore-files dist/** --ignore-files translators/** --ignore-files scripts/** --ignore-files .git/** --ignore-files test.js