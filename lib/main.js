// This is an active module of the Add-on
exports.main = function() {
    // Only create main object once
    //if (!Zotero.HelloWorldZotero) 
    //{
        var helloWorld = new HelloWorldZotero();
        //let loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
        //loader.loadSubScript("chrome:hello.js");
    //}
};

function HelloWorldZotero() {
    var init = function () {
        console.log("Test2"); 
        
        // Register the callback in Zotero as an item observer
        var notifierID = Zotero.Notifier.registerObserver(notifierCallback, ['item']);

        // Unregister callback when the window closes (important to avoid a memory leak)
        var windows = require("sdk/windows").browserWindows;
        windows.on('unload', function(e) {Zotero.Notifier.unregisterObserver(notifierID);}, false);
    }
    var onBibtexTranslationComplete = function(obj, worked) {
        if(!worked) {
            console.log("ZoteroToJabref: Error translating items to BibTeX.");
            //window.alert("Error exporting items to BibTeX.\n");
        } else {
            console.log("ZoteroToJabref: Write Bibtex to temporary file")
            var bibtexString = obj.string;
            console.log(bibtexString);
            
            // Get temp directory
            var file = FileUtils.getFile("TmpD", ["bibExport.bib"]);
            file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
            
            // Write to file
            var ostream = FileUtils.openFileOutputStream(file, FileUtils.MODE_WRONLY | FileUtils.MODE_APPEND);
            var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
            converter.charset = "UTF-8";
            var istream = converter.convertToInputStream(bibtexString);

            NetUtil.asyncCopy(istream, ostream, function(status) {
                if (!components.isSuccessCode(status)) {
                    // Handle error!
                    return;
                }

                console.log("ZoteroToJabref: Data has been appended to the file: " + file.path);
                
                // Invoke Jabref
                var jabref = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
                jabref.initWithPath(require('sdk/simple-prefs').prefs['jabrefPath']);
                //jabref.initWithPath("c:\\windows\\system32\\notepad.exe");
                
                var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
                process.init(jabref);

                //var args = ["--importToOpen", '"' + file.path + '"'];
                var args = ["--importToOpen", file.path];
                process.run(false, args, args.length);
                
                console.log("ZoteroToJabref: Called Jabref.");
            });
        }
    }
    
    
    // Obtain privileges to call "components" objects
    var {Cc, Ci, Cu, components} = require("chrome");
    var {FileUtils} = Cu.import("resource://gre/modules/FileUtils.jsm");
    var {NetUtils} = Cu.import("resource://gre/modules/NetUtil.jsm");
    
    // Obtain access to Zotero
    var Zotero = Cc["@zotero.org/Zotero;1"].getService(Ci.nsISupports).wrappedJSObject;
    
    var notifierCallback = {
    	notify: function(event, type, ids, extraData) {
            if (event == 'add') {  
				// Only react on new items, maybe extend to: || event == 'modify'
                console.log("ZoteroToJabref: Start processing new items");
                
                var newItems = Zotero.Items.get(ids);
                
                // Set up bibtex export
                var translation = new Zotero.Translate.Export();
                translation.setItems(newItems);
                trans_guid = "b6e39b57-8942-4d11-8259-342c46ce395f"; // Biblatex export guid
                //trans_guid = "9cb70025-a888-4a29-a210-93ec52da40d4"; // Bibtex export guid
                translation.setTranslator(trans_guid);
                translation.setHandler("done", onBibtexTranslationComplete);
                translation.translate();
                
                
                console.log("ZoteroToJabref: Finished processing new items");
			}
		}
	}
    
    console.log("Test");
    init();
};

// Initialize the utility
//window.addEventListener('load', function(e) { Zotero.HelloWorldZotero.init(); }, false);