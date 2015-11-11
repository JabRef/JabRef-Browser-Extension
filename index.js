var self = require('sdk/self');
const {
  Cc, Ci, Cu
} = require("chrome");

var Zotero = Cc["@zotero.org/Zotero;1"].getService(Ci.nsISupports).wrappedJSObject;

var buttons = require('sdk/ui/button/action');
var tabs = require("sdk/tabs");
var tab_utils = require("sdk/tabs/utils");
var utils = require('sdk/window/utils');
var {
  viewFor
} = require("sdk/view/core");


// Add import button to Firefox toolbar.
var importButton = buttons.ActionButton({
  id: "import-button",
  label: "Import references into JabRef",
  icon: {
    "16": "./JabRef-icon-16.png",
    "48": "./JabRef-icon-48.png"
  },
  onClick: handleImportClick
});

/*
 * Import items found on the present website.
 */
function handleImportClick(state) {
  // Get active tab
  var activeTab = tabs.activeTab;
  var lowLevelActiveTab = viewFor(activeTab);

  // Get the ContentDocument of the active tab
  var activeBrowser = tab_utils.getBrowserForTab(lowLevelActiveTab);
  var doc = activeBrowser.contentDocument;

  // Detect reference items
  findTranslators(doc);
}

/*
 * Find translators for the given ContentDocument.
 */
function findTranslators(doc) {
  /*if (!(doc instanceof HTMLDocument))
    return;
  if (doc.documentURI.startsWith("about:"))
    return;
*/
  // Search for translators
  var translate = new Zotero.Translate.Web();
  translate.setDocument(doc);
  translate.setHandler("translators", function(obj, item) {
    translatorsAvailable(obj, item)
  });
  translate.getTranslators(true);
}

/*
 * called: when a translator search initiated with Zotero.Translate.getTranslators() is
 *           complete
 * called when translators are available
 */
function translatorsAvailable(translate, translators) {
  translate.setTranslator(translators[0]);
  translate.clearHandlers("itemDone");
  translate.setHandler("itemDone", function(obj, dbItem, item) {
    //item.save();
    var file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("TmpD", Ci.nsIFile);
    file.append("zotero_item_" + dbItem.id + ".bib");
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);

    var translator = new Zotero.Translate.Export();
    //translator.setTranslator('9cb70025-a888-4a29-a210-93ec52da40d4'); // BibTeX
    translator.setTranslator('b6e39b57-8942-4d11-8259-342c46ce395f'); // BibLaTeX
    translator.setItems([dbItem]);
    //translator.setLibraryID(null);
    translator.setLocation(file);

    translator.clearHandlers("done");
    translator.setHandler("done", function(obj, returnValue) {
      var externalEditor = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
      var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
      externalEditor.initWithPath("C:\\Program Files (x86)\\JabRef\\JabRef.exe");
      //externalEditor.initWithPath("C:\\Windows\\notepad.exe");
      //externalEditor.initWithPath(editorPath);
      process.init(externalEditor);

      var args = ["--importToOpen", file.path];
      //var args = ["--importToOpen", file.path];
      //var args = [file.path];
      process.run(false, args, args.length);
      //  var args = [""];
      //process.run(false, args, args.length);
    });

    translator.translate();
  });
  translate.translate();
  //translate.translate(false);
}



console.log("start");

var zoteroCallback = {
  notify: function(event, type, ids, extraData) {
    console.log("test3");
    if (event == 'add') {
      //tabs.open("http://www.mozilla.org/");
      return;
      var items = Zotero.Items.get(ids);

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item.isRegularItem() || ((item.numCreators() > 0 ? 1 : 0) + (item.getField('title') ? 1 : 0) + (item.getField('date') ? 1 : 0) < 2)) continue; // require at least two of: authors, title, date

        var file = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("TmpD", Components.interfaces.nsIFile);
        file.append("zotero_item_" + item.id + ".bib");
        file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);

        var externalEditor = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
        var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);

        var destfiles = Zot2Bib.loadList('destfiles');
        if (prefs.getBoolPref('addtoempty')) destfiles.push('');
        var openpub = prefs.getBoolPref('openpub') ? 'true' : 'false';
        var bringtofront = prefs.getBoolPref('bringtofront') ? 'true' : 'false';
        var extrabraces = prefs.getBoolPref('extrabraces') ? 'true' : 'false';
        var editor = prefs.getCharPref('editor');
        var editorPath = prefs.getCharPref('editorpath');

        var translator = new Zotero.Translate('export');
        translator.setTranslator('9cb70025-a888-4a29-a210-93ec52da40d4'); // BibTeX
        // translator.setTranslator('b6e39b57-8942-4d11-8259-342c46ce395f'); // BibLaTeX
        translator.setItems([item]);
        translator.setLocation(file);

        translator.setHandler('done', function() {
          if (Zot2Bib.numDests() < 1) {
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
            prompts.console.log(null, "No destination for new publications is selected in Zot2Bib", "Use the Zot2Bib status bar menu to select a destination, then try again.");
          }
          for (var j = 0; j < destfiles.length; j++) {
            if (editor == "bibdesk") {
              var script_path = own_path.path + '/zot2bib.applescript';
              externalEditor.initWithPath('/usr/bin/osascript');
              process.init(externalEditor);

              var args = [script_path, destfiles[j], file.path, openpub, bringtofront, extrabraces];
              process.run(true, args, args.length); // first param true => calling thread will be blocked until called process terminates
            } else if (editor == "jabref") {
              externalEditor.initWithPath(editorPath);
              process.init(externalEditor);
              var args = ["--importToOpen", file.path];
              process.run(false, args, args.length);
            }
          }
          if (!prefs.getBoolPref('keepinzotero')) {
            deleteQueue.push(item.id);

            // This seems like the right way to do this, but doesn't work!!
            // var timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
            // timer.initWithCallback(deleteCallback, 1000, Components.interfaces.nsITimer.TYPE_ONE_SHOT);

            // This is messy, but seems to work
            var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
            wm.getMostRecentWindow("navigator:browser").setTimeout(deleteCallback.notify, 5000);
          }
        });

        translator.translate();
      }
    }
  }
}


Zot2Bib = {
  initOnce: function(z) {
    console.log("test1");
    //if (! Zotero) {
    //	console.log("test2");
    //  Zotero = z;
    Zotero.Notifier.registerObserver(zoteroCallback, ['item']);

    // Unregister callback when the window closes (to avoid memory leaks.)
    // window.addEventListener('unload', function(e) {Zotero.Notifier.unregisterObserver(notifierID);}, false);
    //}
  },
  about: function(w) {
    if (!about_window_ref || about_window_ref.closed) about_window_ref = w.open("chrome://zot2bib/content/about.xul", "", "centerscreen,chrome,dialog");
    else about_window_ref.focus();
  },
  preferences: function(w) {
    if (!prefs_window_ref || prefs_window_ref.closed) prefs_window_ref = w.open("chrome://zot2bib/content/preferences.xul", "", "centerscreen,chrome,dialog,resizable");
    else prefs_window_ref.focus();
  },
  help: function(w) {
    if (!help_window_ref || help_window_ref.closed) help_window_ref = w.open("chrome://zot2bib/content/help.html");
    else help_window_ref.focus();
  },
  populateMenu: function(menu) {

    var doc = menu.ownerDocument;
    var menuitemtype = prefs.getBoolPref('manydests') ? 'checkbox' : 'radio';
    var destfiles = Zot2Bib.loadList('destfiles');
    var bibfiles = Zot2Bib.loadList('bibfiles');

    var addMenuItem = function(props, attrs) {
      var item = doc.createElement('menuitem');
      for (prop in props) {
        if (!props.hasOwnProperty(prop)) continue;
        item[prop] = props[prop];
      }
      for (attr in attrs) {
        if (!attrs.hasOwnProperty(attr)) continue;
        item.setAttribute(attr, attrs[attr]);
      }
      menu.appendChild(item);
    }
    while (menu.firstChild) menu.removeChild(menu.firstChild);

    addMenuItem({}, {
      label: 'Add new publications to...',
      disabled: 'true'
    });

    var attrs;

    attrs = {
      label: 'Zotero',
      type: menuitemtype,
      name: 'z2b-destination',
      tooltiptext: 'Add to Zotero, as if this extension was not installed'
    }
    if (prefs.getBoolPref('keepinzotero')) attrs.checked = 'true';
    addMenuItem({
      id: 'z2b-add-zotero'
    }, attrs);

    attrs = {
      label: 'New BibTeX files',
      type: menuitemtype,
      name: 'z2b-destination',
      tooltiptext: 'Create a new file in BibDesk for each publication'
    };
    if (prefs.getBoolPref('addtoempty')) attrs.checked = 'true';
    addMenuItem({
      id: 'z2b-add-empty'
    }, attrs);

    for (var i = 0; i < bibfiles.length; i++) {
      var bibfile = bibfiles[i];
      attrs = {
        label: bibfile.substr(bibfile.lastIndexOf('/') + 1),
        type: menuitemtype,
        name: 'z2b-destination',
        crop: 'center',
        tooltiptext: bibfile,
        value: bibfile
      };
      for (var j = 0; j < destfiles.length; j++)
        if (bibfile == destfiles[j]) attrs.checked = 'true';
      addMenuItem({
        id: 'z2b-bibfile-' + i
      }, attrs);
    }

    menu.appendChild(doc.createElement('menuseparator'));
    addMenuItem({}, {
      label: 'About Zot2Bib',
      oncommand: 'Zot2Bib.about(window);'
    });
    addMenuItem({}, {
      label: 'Preferences...',
      oncommand: 'Zot2Bib.preferences(window);'
    });
    addMenuItem({}, {
      label: 'Help',
      oncommand: 'Zot2Bib.help(window);'
    });
  },
  saveMenuChoices: function(m) {
    Zotero.log('saveMenuChoices');
    var a = [];
    for (var i = 0; i < m.childNodes.length; i++) {
      var mi = m.childNodes[i];
      if (mi.id == 'z2b-add-zotero') {
        prefs.setBoolPref('keepinzotero', mi.hasAttribute('checked'));
        Zotero.log('keepinzotero ' + prefs.getBoolPref('keepinzotero'));
      } else if (mi.id == 'z2b-add-empty') {
        prefs.setBoolPref('addtoempty', mi.hasAttribute('checked'));
        Zotero.log('addtoempty ' + prefs.getBoolPref('addtoempty'));
      } else if (mi.id.match(/^z2b-bibfile-[0-9]+$/) && mi.hasAttribute('checked')) a.push(mi.getAttribute('value'));
    }
    Zot2Bib.saveList('destfiles', a);
  },
  numDests: function() {
    return Zot2Bib.loadList('destfiles').length + (prefs.getBoolPref('keepinzotero') ? 1 : 0) + (prefs.getBoolPref('addtoempty') ? 1 : 0);
  },
  removeDestFile: function(f) {
    var fs = Zot2Bib.loadList('destfiles');
    for (var i = fs.length - 1; i >= 0; i--)
      if (fs[i] == f) {
        fs.splice(i, 1);
        Zot2Bib.saveList('destfiles', fs);
      }
  },
  saveList: function(pref, a) {
    var b = [];
    for (var i = 0; i < a.length; i++) b[i] = escape(a[i]);
    prefs.setCharPref(pref, b.join(','));
  },
  loadList: function(pref) {
    var s = prefs.getCharPref(pref);
    if (s.length == 0) return []; // weirdly, splitting an empty string appears to produce an Array with one empty string element, not an empty Array
    else {
      var a = s.split(',');
      for (var i = 0; i < a.length; i++) a[i] = unescape(a[i]);
      return a;
    }
  },
  getEditorPath: function() {
    return prefs.getCharPref('editorpath');
  },
  setEditorPath: function(value) {
    prefs.setCharPref('editorpath', value);
  }
}


Zot2Bib.initOnce(Zotero);



// a dummy function, to show how tests work.
// to see how to test this function, look at test/test-index.js
function dummy(text, callback) {
  callback(text);
}

exports.dummy = dummy;