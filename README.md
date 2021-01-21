# JabRef Browser Extension
> [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabref/?src=external-github) -  [Chrome](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - [Edge](https://microsoftedge.microsoft.com/addons/detail/pgkajmkfgbehiomipedjhoddkejohfna) - [Vivaldi](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh)

Browser extension for users of the bibliographic reference manager [JabRef](https://www.jabref.org/).
It automatically identifies and extracts bibliographic information on websites and sends them to JabRef with one click.

When you find an interesting article through Google Scholar, the arXiv or journal websites, this browser extension allows you to add those references to JabRef.
Even links to accompanying PDFs are sent to JabRef, where those documents can easily be downloaded, renamed and placed in the correct folder. 
[A wide range of publisher sites, library catalogs and databases are supported](https://www.zotero.org/support/translators).

_Please post any issues or suggestions [here on GitHub](https://github.com/JabRef/JabRef-Browser-Extension/issues)._

## Installation and Configuration
Normally, you simply install the extension from the browser store and are ready to go.
> [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabref/?src=external-github) -  [Chrome](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - [Edge](https://microsoftedge.microsoft.com/addons/detail/pgkajmkfgbehiomipedjhoddkejohfna) - [Vivaldi](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh)

Sometimes, a manual installation is necessary (e.g. if you use the portable version of JabRef). In this case, please follow the steps described [in the user manual](https://docs.jabref.org/import-export/import/jabref-browser-extension).

## Usage
After the installation, you should be able to import bibliographic references into JabRef directly from your browser.
Just visit a publisher site or some other website containing bibliographic information (for example, [the arXiv](http://arxiv.org/list/gr-qc/pastweek?skip=0&show=5)) and click the JabRef symbol in the Firefox search bar (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>).
Once the JabRef browser extension has extracted the references and downloaded the associated PDF's, the import window of JabRef opens.

You might want to configure JabRef so that new entries are always imported in an already opened instance of JabRef.
For this, activate "Remote operation" under the Advanced tab in the JabRef Preferences.


## About this Add-On

Internally, this browser extension uses the magic of Zotero's site translators.
Thus most of the credit has to go to the Zotero development team and to the many authors of the [site translators collection](https://github.com/zotero/translators).
Note that this browser extension does not make any changes to the Zotero database and thus both plug-ins coexist happily with each other.

## Contributing to the Development

JabRef browser extension uses the [WebExtensions API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

Preparation:
1. Install [Node.js](https://nodejs.org) (e.g., `choco install nodejs`)
2. Install [gulp](https://gulpjs.com/) and [web-ext](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext): `npm install --global gulp-cli web-ext`
3. [Fork the repository](https://help.github.com/articles/fork-a-repo/).
4. Checkout the repository.
5. Install development dependencies via `npm install`.
6. Start browser with the add-on activated:
   Firefox: `npm run dev:firefox`
   Chrome: `npm run dev:opera`

Now just follow the typical steps to [contribute code](https://guides.github.com/activities/contributing-to-open-source/#contributing):
1. Create your feature branch: `git checkout -b my-new-feature`
3. Build and run the add-on as described above.
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request.

To update dependencies:

 - `npm outdated` gives an overview of outdated packages ([doc](https://docs.npmjs.com/cli/outdated))
 - `npm-upgrade` updates all packages 
 - `npm install` install updated packages
 - running
   ```
    git subtree pull --prefix zotero-connectors https://github.com/zotero/zotero-connectors.git master --squash
    git subtree pull --prefix zotero-connectors/src/zotero https://github.com/zotero/zotero.git master --squash
    git subtree pull --prefix zotero-scholar-citations https://github.com/MaxKuehn/zotero-scholar-citations.git master --squash
   ```
   updates the `zotero-connectors` submodule and the `zotero-scholar-citations` submodule  

 - `gulp update-external-scripts` copies and post-processes the scripts in the folders `zotero-connectors` and `zotero-scholar-citations` to the folder `external-scripts`

## Release of new version
- Increase version number in `manifest.json`
- `npm run build`
- Upload to
  - https://addons.mozilla.org/en-US/developers/addon/jabref/edit
  - https://chrome.google.com/u/1/webstore/devconsole
  - https://partner.microsoft.com/en-us/dashboard/microsoftedge
  - https://addons.opera.com/developer/upload/
  - https://developer.apple.com/app-store-connect/
