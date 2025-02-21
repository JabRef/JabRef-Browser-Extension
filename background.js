const isFirefox = typeof browser !== 'undefined';
const browserAPI = isFirefox ? browser : chrome;
const actionAPI = isFirefox ? browserAPI.pageAction : browserAPI.action;

// Initialize the translator framework
init = async function() {
    Zotero.Debug.init(1);
    await Zotero.Connector_Browser.init();
    await Zotero.Messaging.init();
    await Zotero.Translators.init();
    zsc.init();
    
    this.tabInfo = new Map();
    
    // Register message listeners
    Zotero.Messaging.addMessageListener('Connector_Browser.onTranslators', onTranslators);
    browserAPI.tabs.onUpdated.addListener(onTabUpdated);
    browserAPI.tabs.onRemoved.addListener(Zotero.Connector_Browser.onPageLoad);
    
    // Initialize existing tabs
    const tabs = await browserAPI.tabs.query({});
    for (let tab of tabs) {
        if (!isDisabledForURL(tab.url)) {
            await installInTab(tab);
        }
    }
}

function onTabUpdated(tabId, changeInfo, tab) {
    if (!changeInfo.url) return;
    
    browserAPI.tabs.query({
        active: true,
        currentWindow: true
    }).then(tabs => {
        if (tabId === tabs[0].id) {
            Zotero.Connector_Browser.onPageLoad(tab);
            installInTab(tab);
        }
    });
}

/*
    Disable add-on for special browser pages
*/
function isDisabledForURL(url) {
    return (
        url.includes('chrome://') ||
        url.includes('about:') ||
        (url.includes('-extension://') && !url.includes('/test/'))
    )
}

async function installInTab(tab) {
    if (isDisabledForURL(tab.url)) return;
    
    tabInfo.delete(tab.id);
    
    try {
        await browserAPI.tabs.executeScript(tab.id, { code: 'document.contentType' });
        await lookForTranslators(tab);
        tabInfo.set(tab.id, { isPDF: false });
    } catch (error) {
        console.debug(`JabRef: PDF detection - ${error}`);
        actionAPI.show(tab.id);
        actionAPI.setTitle({
            tabId: tab.id,
            title: 'Import references into JabRef as PDF'
        });
        tabInfo.set(tab.id, { isPDF: true });
    }
}

function lookForTranslators(tab) {
    console.log('JabRef: Searching for translators for %o', tab);
    return Zotero.Translators.getWebTranslatorsForLocation(tab.url, tab.url).then(
        (translators) => {
            if (translators[0].length === 0) {
                console.log('JabRef: No translators found');
                actionAPI.hide(tab.id);
            } else {
                console.log('JabRef: Found potential translators %o', translators[0]);
            }
        }
    );
}

async function evalInTab(tabsId, code) {
    try {
        result = await browserAPI.tabs.executeScript(tabsId, {
            code: code,
        })
        console.log(`JabRef: code executed with result ${result}`)
        return result
    } catch (error) {
        console.log(`JabRef: Error executing script: ${error}`)
    }
}

saveAsWebpage = function (tab) {
    var title = tab.title
    var url = tab.url
    var date = new Date().toISODate()

    // Construct a manual Bibtex Entry for the webpage
    var bibtexString = `@misc{,\
		title={${title}},\
		url = {${url}},\
		urlDate={${date}},\
		}`
    Zotero.Connector.sendBibTexToJabRef(bibtexString)
}

savePdf = function (tab) {
    var title = tab.title.replace('.pdf', '')
    var url = tab.url
    var urlEscaped = tab.url.replace(':', '\\:')
    var date = new Date().toISODate()

    // Construct a manual Bibtex Entry for the PDF
    var bibtexString = `@misc{,\
		title={${title}},\
		file={:${urlEscaped}:PDF},\
		url = {${url}},\
		urlDate={${date}},\
		}`
    Zotero.Connector.sendBibTexToJabRef(bibtexString)
}

/*
    Is called after Zotero injected all scripts and checked if the potential translators can find something on the page.
    We need to hide or show the page action accordingly.
*/
onTranslators = function (translators, tabId, contentType) {
    if (translators.length === 0) {
        console.log(
            'JabRef: Found no suitable translators for tab %o',
            JSON.parse(JSON.stringify(tabId))
        )
        tabInfo.set(tabId, { ...tabInfo.get(tabId), hasTranslator: false })
        actionAPI.setIcon({
            tabId: tabId, path: {
                "48": "data/JabRef-icon-48.png",
                "96": "data/JabRef-icon-96.png"
            }
        })
        actionAPI.show(tabId)
        actionAPI.setTitle({
            tabId: tabId,
            title:
                'Import simple website reference into JabRef',
        })
    } else {
        console.log(
            'JabRef: Found translators %o for tab %o',
            translators,
            JSON.parse(JSON.stringify(tabId))
        )
        tabInfo.set(tabId, { ...tabInfo.get(tabId), hasTranslator: true })
        actionAPI.setIcon({
            tabId: tabId, path: {
                "48": "data/JabRef-icon-plus-48.png",
                "96": "data/JabRef-icon-plus-96.png"
            }
        })
        actionAPI.show(tabId)
        actionAPI.setTitle({
            tabId: tabId,
            title:
                'Import references into JabRef using ' + translators[0].label,
        })
    }
}

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.popupOpened) {
        handlePopupOpen();
    } else if (message.getWsClientState) {
        const wsClientState = {
            clientStarted: wsClient.isClientStarted(),
            connectionState: wsClient.getConnectionState()
        };
        sendResponse(wsClientState);
    } else if (message.eval) {
        return evalInTab(sender.tab.id, message.eval);
    } else if (Array.isArray(message) && message[0] === 'Connector_Browser.onTranslators') {
        message[1][1] = sender.tab.id;
        onTranslators.apply(null, message[1]);
    } else if (['Debug.log', 'Errors.log'].includes(message[0])) {
        console.log(message[1]);
    }
});

// Initialize
init();
