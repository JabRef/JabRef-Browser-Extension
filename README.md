[![Circle CI](https://circleci.com/gh/JabRef/JabFox.svg?style=svg)](https://circleci.com/gh/JabRef/JabFox)
JabFox: Firefox Add-on for JabRef
=======================

JabFox imports new bibliographic information directly from the browser into [JabRef](http://www.jabref.org/).

_Please post any issues or suggestions [here on GitHub](https://github.com/JabRef/JabFox/issues)._

Installation and Configuration
-----------------------------------

1. Make sure [Zotero](https://www.zotero.org/) is [installed in Firefox](https://www.zotero.org/download/).
2. [Install the JabFox add-on](https://addons.mozilla.org/en-US/firefox/addon/jabfox?src=external-github). The JabRef icon should now appear in the Firefox toolbar. 
3. Adjust the path to the JabRef executable in the add-on settings (under Add-ons > JabFox > Options).

Now you should be able to import bibliographic references into JabRef directly from your browser. Just visit a publisher site or some other website containing bibliographic information (for example, [the arXiv](http://arxiv.org/list/gr-qc/pastweek?skip=0&show=5)) and click the JabRef symbol in the Firefox toolbar. Once JabFox has extracted the references and downloaded the associated PDF's, the import window of JabRef opens.
Or use Alt+Shift+J

You might want to configure JabRef so that new entries are always imported in an already opened instance of JabRef. For this, activate "Remote operation" under the Advanced tab in the JabRef Preferences.

On Linux and Mac OSX, sometimes directly linking `JabRef.jar` does not work. In this case, create and link the following bash script
````
#!/bin/bash
java -jar /my/target/to/JabRef.jar "$@"
````
Thanks to [ClemSc](https://github.com/ClemSc) for providing this workaround. 

About this Add-On
---------------------
JabFox is a Firefox add-on for users of the bibliographic reference manager [JabRef](http://www.jabref.org/). It automatically identifies and extracts bibliographic information on websites and sends them to JabRef in one click. [A wide range of publisher sites, library catalogs and databases are supported](https://www.zotero.org/support/translators).

Internally, JabFox uses the magic of Zotero's site translators. Thus most of the credit has to go to the Zotero development team and to the many authors of the [site translators collection](https://github.com/zotero/translators). Note that JabFox does not make any changes to the Zotero database and thus both plug-ins coexist happily with each other.

Contributing to the Development
---------------------------------------

In order to directly use the source code and help with the development of this add-on the [Firefox Add-on SDK](https://developer.mozilla.org/en-US/Add-ons/SDK) has to be installed. Now just follow the typical steps to [contribute code](https://guides.github.com/activities/contributing-to-open-source/#contributing):

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Build the add-on by running `jpm xpi` and test it.
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request.
