if (!Date.prototype.toISODate) {
	Date.prototype.toISODate = function() {
		return this.getFullYear() + '-' +
			('0' + (this.getMonth() + 1)).slice(-2) + '-' +
			('0' + this.getDate()).slice(-2);
	}
}

Zotero.Connector = new function() {
	this.callMethod = Zotero.Promise.method(function(options, data, cb, tab) {
		throw new Error("JabRef: Tried to contact Zotero standalone: " + options);
	})

	this.callMethodWithCookies = function(options, data, tab) {
		if (options == "saveItems") {
			this.convertToBibTex(data.items)
				.then((bibtex) => this.sendBibTexToJabRef(bibtex));
			console.log("Haini: Sending bibtex to Jabref %o", bibtex)
		} else if (options == "saveSnapshot" && tab.url.includes(".pdf")) {
			console.log("Haini: No longer ignore saveSnapshot");

			var manualEntry = [];
			manualEntry.push(
			{
				itemType: "journalArticle",
				title: tab.title,
				url: tab.url,
				accessDate: new Date().toISODate(),
				attachments: [
				  {
					title: tab.title,
					url: tab.url,
					mimeType: "application/pdf",
					localPath: tab.url 
				  }],
			  });
			
			//manualEntry.push(
			//{
			//	itemType: "journalArticle",
			//	creators: [
			//	  {
			//		firstName: "Tobias",
			//		lastName: "Diez",
			//		creatorType: "author"
			//	  },
			//	  {
			//		firstName: "Tudor S.",
			//		lastName: "Ratiu",
			//		creatorType: "author"
			//	  }
			//	],
			//	notes: [],
			//	tags: [
			//	  {
			//		tag: "Mathematics - Differential Geometry"
			//	  },
			//	  {
			//		tag: "Mathematical Physics"
			//	  },
			//	  {
			//		tag: "53D20, (58D27, 53C08, 53C10, 58B99, 32G15)"
			//	  }
			//	],
			//	seeAlso: [],
			//	attachments: [
			//	  {
			//		title: "arXiv Fulltext PDF",
			//		url: "https://arxiv.org/pdf/2002.01273.pdf",
			//		mimeType: "application/pdf",
			//		localPath: "https://arxiv.org/pdf/2002.01273.pdf"
			//	  },
			//	  {
			//		title: "arXiv.org Snapshot",
			//		url: "http://arxiv.org/abs/2002.01273",
			//		mimeType: "text/html"
			//	  }
			//	],
			//	title: "TESTTESTTESTGroup-valued momentum maps for actions of automorphism groups",
			//	date: "2020-02-04",
			//	abstractNote: "The space of smooth sections of a symplectic fiber bundle carries a natural symplectic structure. We provide a general framework to determine the momentum map for the action of the group of bundle automorphism on this space. Since, in general, this action does not admit a classical momentum map, we introduce the more general class of group-valued momentum maps which is inspired by the Poisson Lie setting. In this approach, the group-valued momentum map assigns to every section of the symplectic fiber bundle a principal circle-bundle with connection. The power of this general framework is illustrated in many examples: we construct generalized Clebsch variables for fluids with integral helicity; the anti-canonical bundle turns out to be the momentum map for the action of the group of symplectomorphisms on the space of compatible complex structures; the Teichm\\\"uller moduli space is realized as a symplectic orbit reduced space associated to a coadjoint orbit of $\\mathrm{SL}(2,\\mathbb{R})$ and spaces related to the other coadjoint orbits are identified and studied. Moreover, we show that the momentum map for the group of bundle automorphisms on the space of connections over a Riemann surface encodes, besides the curvature, also topological information of the bundle.",
			//	url: "http://arxiv.org/abs/2002.01273",
			//	publicationTitle: "arXiv:2002.01273 [math-ph]",
			//	extra: "arXiv: 2002.01273",
			//	libraryCatalog: "arXiv.org",
			//	accessDate: "2020-05-26",
			//	id: "RLlishFW"
			//  });
			

			this.convertToBibTex(manualEntry)
				.then((bibtex) => this.sendBibTexToJabRef(bibtex));

			//this.prepareForExport(manualEntry);

			//this.sendBibTexToJabRef(manualEntry);
			//this.convertToBibTex(data.items)
			//	.then((bibtex) => this.sendBibTexToJabRef(bibtex));
			console.log("Haini: Sending bibtex to Jabref %o", manualEntry)
		} else {
			throw new Error("JabRef: Tried to contact Zotero standalone: " + options);
		}
	}

	this.checkIsOnline = Zotero.Promise.method(function() {
		var deferred = Zotero.Promise.defer();
		// Pretend that we are connected to Zotero standalone
		deferred.resolve(true);
		return deferred.promise;
	})

	this.prepareForExport = function(items) {
		// TODO: Get value from preferences
		var shouldTakeSnapshots;
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			for (var j = 0; j < item.attachments.length; j++) {
				var attachment = item.attachments[j];

				var isLink = attachment.mimeType === 'text/html' || attachment.mimeType === 'application/xhtml+xml';
				if (isLink && attachment.snapshot !== false) {
					// Snapshot
					if (shouldTakeSnapshots && attachment.url) {
						attachment.localPath = attachment.url;
					} else {
						// Ignore
					}
				} else {
					// Normal file
					// Pretend we downloaded the file since otherwise it is not exported
					if (attachment.url) {
						attachment.localPath = attachment.url;
					}
				}
			}

			// Fix date string
			if (item.accessDate) {
				item.accessDate = new Date().toISODate();
			}
		}
	}

	this.convertToBibTex = function(items) {
		this.prepareForExport(items);

		browser.runtime.sendMessage({
			"onConvertToBibtex": "convertStarted"
		});

		return browser.tabs.query({
			currentWindow: true,
			active: true
		}).then(tabs => {
			for (let tab of tabs) {
				console.log("Haini: Trying to send to Jabref with tabId %s, %s,  %o", tab.id, tab.url, items)
				return browser.tabs.sendMessage(
					2, {
						convertToBibTex: items
					}
				);
			}
		})
	}

	this.sendBibTexToJabRef = function(bibtex) {
		browser.runtime.sendMessage({
			"onSendToJabRef": "sendToJabRefStarted"
		});
		console.log("JabRef: Send BibTeX to JabRef: %o", bibtex);

		browser.runtime.sendNativeMessage("org.jabref.jabref", {
				"text": bibtex
			})
			.then(response => {
				console.log("JabRef: Got response from JabRef: %o with details %o", response.message, response.output);
				if (response.message == 'ok') {
					browser.runtime.sendMessage({
						"popupClose": "close"
					});
				}
			}, error => {
				console.error("JabRef: Error connecting to JabRef: %o", error);
				browser.runtime.sendMessage({
					"errorWhileSendingToJabRef": error.message
				});
			});
	}
}
