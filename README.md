FireBib Addon
=============

FireBib collects online research material and sends the bibliographic information directly to your favorite reference manager - all in one click.

save things you see on the web into your Evernote account.
This Firefox addon allows importing of new items into Jabref directly from the browser.

_Currently, this addon does not work. A new version is on its way and I'll let you know as soon as it's ready._

If you’re viewing an interesting site or document, just click an icon in your browser address bar
Zotero automatically senses content
 Zotero also understands the content and structure of many sites, and stores page metadata as well: title, author, abstract, publication, volume, issue, creation date, ISSN/ ISBN numbers.

FireBib collects online research material and sends the bibliographic information directly to your favorite reference manager - all in one click.


Supported sites: https://www.zotero.org/support/translators

Installation and Settings
-------------------------

1. Install the addon from the Firefox central repository. The JabRef icon should now appear in the Firefox toolbar. 
2. Change the path to the Jabref executable in the addon settings.
3. Install notes:\n\nJabref:  activate Preferences  Advanced  Remote operation


You might want to configure JabRef so that new entries are imported in an already opened instance of JabRef. For this, activate the "Remote operation" under the Advanced tab in the JabRef Preferences.

How to import a new article into Jabref?
----------------------------------------


TODO:
	Add url in package.json and maybe other things: https://developer.mozilla.org/en-US/Add-ons/SDK/Tools/package_json

	package.json
	"preferences":
	[{
		"title": "Path to JabRef", 
		"type": "file", 
		"description": "The path to the executable of JabRef.", 
		"value": "C:\\Program Files (x86)\\JabRef\\JabRef.exe", 
		"name": "jabrefPath"
	}]


Developing
----------

In order to directly use the source code (and help with the development of this project) the following software has to be installed:

 - Firefox Addon SDK: https://developer.mozilla.org/en-US/Add-ons/SDK

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D