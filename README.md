[![Circle CI](https://circleci.com/gh/JabRef/JabFox.svg?style=svg)](https://circleci.com/gh/JabRef/JabFox)
JabFox: Firefox Add-on for JabRef
=======================

JabFox is a Firefox add-on for users of the bibliographic reference manager [JabRef](http://www.jabref.org/).
It automatically identifies and extracts bibliographic information on websites and sends them to JabRef in one click.
[A wide range of publisher sites, library catalogs and databases are supported](https://www.zotero.org/support/translators).

_Please post any issues or suggestions [here on GitHub](https://github.com/JabRef/JabFox/issues)._

Installation and Configuration
-----------------------------------

1. Download and install a [new special version of JabRef](https://builds.jabref.org/nativeMessaging/).
2. [Install the JabFox add-on](https://addons.mozilla.org/en-US/firefox/addon/jabfox?src=external-github).
The JabRef icon should now appear in the Firefox toolbar when you visit a website with bibliographic information. 

On Windows:

3. Download [jabref.json](https://github.com/JabRef/jabref/blob/nativeMessaging/buildres/jabref.json), [JabRef.bat](https://raw.githubusercontent.com/JabRef/jabref/nativeMessaging/buildres/JabRef.bat) and [JabRef.ps1](https://github.com/JabRef/jabref/blob/nativeMessaging/buildres/JabRef.ps1), and copy them to the same directory as `JabRef.exe`
4. Run `REG ADD "HKEY_LOCAL_MACHINE\SOFTWARE\Mozilla\NativeMessagingHosts\org.jabref.jabref" /ve /d "C:\path\to\jabref.json" /f` from the console (with the correct path to the `jabref.json` file).

Now you should be able to import bibliographic references into JabRef directly from your browser.
Just visit a publisher site or some other website containing bibliographic information (for example, [the arXiv](http://arxiv.org/list/gr-qc/pastweek?skip=0&show=5)) and click the JabRef symbol in the Firefox search bar (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>).
Once JabFox has extracted the references and downloaded the associated PDF's, the import window of JabRef opens.

You might want to configure JabRef so that new entries are always imported in an already opened instance of JabRef.
For this, activate "Remote operation" under the Advanced tab in the JabRef Preferences.

About this Add-On
---------------------
Internally, JabFox uses the magic of Zotero's site translators.
Thus most of the credit has to go to the Zotero development team and to the many authors of the [site translators collection](https://github.com/zotero/translators).
Note that JabFox does not make any changes to the Zotero database and thus both plug-ins coexist happily with each other.

Contributing to the Development
---------------------------------------

JabFox uses the [WebExtensions API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

Preparation:
1. Install [Node.js](https://nodejs.org) (e.g., `choco install nodejs`)
2. Install [gulp](https://gulpjs.com/) and [web-ext](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext): `npm install --global gulp-cli web-ext`
3. [Fork the repository](https://help.github.com/articles/fork-a-repo/).
4. Start Firefox with the add-on activated: `web-ext run`

Now just follow the typical steps to [contribute code](https://guides.github.com/activities/contributing-to-open-source/#contributing):
1. Create your feature branch: `git checkout -b my-new-feature`
3. Build the add-on by running `web-ext run` and test it.
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request.

To update dependencies:

 - `npm outdated` gives an overview of outdated packages ([doc](https://docs.npmjs.com/cli/outdated))
 - `npm update` updates all packages ([doc](https://docs.npmjs.com/cli/update))
 - `git submodule update --recursive` updates `zotero-connectors` submodule
