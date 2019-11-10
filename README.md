# JabRef Browser Extension

Browser extension for users of the bibliographic reference manager [JabRef](https://www.jabref.org/).
It automatically identifies and extracts bibliographic information on websites and sends them to JabRef with one click.

When you find an interesting article through Google Scholar, the arXiv or journal websites, this browser extension allows you to add those references to JabRef.
Even links to accompanying PDFs are sent to JabRef, where those documents can easily be downloaded, renamed and placed in the correct folder. 
[A wide range of publisher sites, library catalogs and databases are supported](https://www.zotero.org/support/translators).

_Please post any issues or suggestions [here on GitHub](https://github.com/JabRef/JabRef-Browser-Extension/issues)._

## Installation and Configuration

### Windows
1. Make sure you have at least [JabRef 4.2](https://www.jabref.org/#downloads) installed.
2. Install the JabRef browser extension. [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabfox?src=external-github).
3. On Windows 7, please [upgrade Powershell](https://www.microsoft.com/en-us/download/details.aspx?id=54616).
<details>
 <summary>Manual installation on Windows (only necessary when you don't use the installer to install/update JabRef)</summary>

4. Download [jabref.json](https://github.com/JabRef/jabref/blob/master/buildres/jabref.json), [jabref-chrome.json](https://github.com/JabRef/jabref/blob/master/buildres/jabref-chrome.json), [JabRef.bat](https://raw.githubusercontent.com/JabRef/jabref/master/buildres/JabRef.bat) and [JabRef.ps1](https://github.com/JabRef/jabref/blob/master/buildres/JabRef.ps1), and copy them to the same directory as `JabRef.exe`
5. Make sure that the correct file name of the JabRef `.jar` file is specified in `JabRef.ps1` under `$jabRefJarFileName`.
6. Run the following command from the console (with the correct path to the `jabref.json` file):

   For Firefox support:
   ```
   REG ADD "HKEY_LOCAL_MACHINE\SOFTWARE\Mozilla\NativeMessagingHosts\org.jabref.jabref" /ve /d "C:\path\to\jabref.json" /f
   ```
   For Chrome/Opera support
    ```
   REG ADD "HKEY_LOCAL_MACHINE\SOFTWARE\Google\Chrome\NativeMessagingHosts\org.jabref.jabref" /ve /d "C:\path\to\jabref.json" /f
   ``` 
   You may need to change the root `HKEY_LOCAL_MACHINE` to  `HKEY_CURRENT_USER` if you don't have admin rights.
</details>


### Linux
1. Download and install the Debian package of the [current development version of JabRef 5.0](https://builds.jabref.org/master/).
2. Install the JabRef browser extension. [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabfox?src=external-github).
<details>
 <summary>Manual installation on Linux (only necessary when you don't use the `deb` file to install/update JabRef)</summary>
 
3. Download [jabref.json](https://github.com/JabRef/jabref/blob/master/buildres/jabref.json) and put it into `/usr/lib/mozilla/native-messaging-hosts/jabref.json` (or into `/usr/lib64/mozilla/native-messaging-hosts/jabref.json` in case you do not have admin rights)

</details>

### Mac OS
1. Download and install the DMG package of the [current development version of JabRef 5.0](https://builds.jabref.org/master/).
2. Download [jabref.json](https://github.com/JabRef/jabref/blob/master/buildres/jabref.json) and put it into `/Library/Application Support/Mozilla/NativeMessagingHosts/jabref.json` (or into `~/Library/Application Support/Mozilla/NativeMessagingHosts/jabref.json` in case you do not have admin rights)
3. Install the JabRef browser extension. [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabfox?src=external-github).

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
4. Start browser with the add-on activated: 
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
 - `git submodule update --recursive --remote` updates `zotero-connectors` submodule
 - `gulp update-zotero-scripts` copies Zotero scripts from `zotero-connectors` to `Zotero` folder
 - `gulp process-zotero-scripts` post-processes Zotero scripts
