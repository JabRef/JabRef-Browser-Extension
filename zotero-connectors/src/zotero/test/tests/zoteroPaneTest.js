"use strict";

describe("ZoteroPane", function() {
	var win, doc, zp, userLibraryID;
	
	// Load Zotero pane and select library
	before(function* () {
		win = yield loadZoteroPane();
		doc = win.document;
		zp = win.ZoteroPane;
		userLibraryID = Zotero.Libraries.userLibraryID;
	});
	
	after(function () {
		win.close();
	});
	
	describe("#newItem", function () {
		it("should create an item and focus the title field", function* () {
			yield zp.newItem(Zotero.ItemTypes.getID('book'), {}, null, true);
			var itemBox = doc.getElementById('zotero-editpane-item-box');
			var textboxes = doc.getAnonymousNodes(itemBox)[0].getElementsByTagName('textbox');
			assert.lengthOf(textboxes, 1);
			assert.equal(textboxes[0].getAttribute('fieldname'), 'title');
			textboxes[0].blur();
			yield Zotero.Promise.delay(1);
		})
		
		it("should save an entered value when New Item is used", function* () {
			var value = "Test";
			var item = yield zp.newItem(Zotero.ItemTypes.getID('book'), {}, null, true);
			var itemBox = doc.getElementById('zotero-editpane-item-box');
			var textbox = doc.getAnonymousNodes(itemBox)[0].getElementsByTagName('textbox')[0];
			textbox.value = value;
			yield itemBox.blurOpenField();
			item = yield Zotero.Items.getAsync(item.id);
			assert.equal(item.getField('title'), value);
		})
	});
	
	describe("#newNote()", function () {
		it("should create a child note and select it", function* () {
			var item = yield createDataObject('item');
			var noteID = yield zp.newNote(false, item.key, "Test");
			var selected = zp.itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected, noteID);
		})
		
		it("should create a standalone note within a collection and select it", function* () {
			var collection = yield createDataObject('collection');
			var noteID = yield zp.newNote(false, false, "Test");
			assert.equal(zp.collectionsView.getSelectedCollection(), collection);
			var selected = zp.itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected, noteID);
		})
	})
	
	describe("#newCollection()", function () {
		it("should create a collection", function* () {
			var promise = waitForDialog();
			var id = yield zp.newCollection();
			yield promise;
			var collection = Zotero.Collections.get(id);
			assert.isTrue(collection.name.startsWith(Zotero.getString('pane.collections.untitled')));
		});
	});
	
	describe("#newSearch()", function () {
		it("should create a saved search", function* () {
			var promise = waitForDialog(
				// TODO: Test changing a condition
				function (dialog) {},
				'accept',
				'chrome://zotero/content/searchDialog.xul'
			);
			var id = yield zp.newSearch();
			yield promise;
			var search = Zotero.Searches.get(id);
			assert.ok(search);
			assert.isTrue(search.name.startsWith(Zotero.getString('pane.collections.untitled')));
		});
		
		it("should handle clicking Cancel in the search window", function* () {
			var promise = waitForDialog(
				function (dialog) {},
				'cancel',
				'chrome://zotero/content/searchDialog.xul'
			);
			var id = yield zp.newSearch();
			yield promise;
			assert.isFalse(id);
		});
	});
	
	describe("#itemSelected()", function () {
		it.skip("should update the item count", function* () {
			var collection = new Zotero.Collection;
			collection.name = "Count Test";
			var id = yield collection.saveTx();
			yield waitForItemsLoad(win);
			
			// Unselected, with no items in view
			assert.equal(
				doc.getElementById('zotero-item-pane-message-box').textContent,
				Zotero.getString('pane.item.unselected.zero', 0)
			);
			
			// Unselected, with one item in view
			var item = new Zotero.Item('newspaperArticle');
			item.setCollections([id]);
			var itemID1 = yield item.saveTx({
				skipSelect: true
			});
			assert.equal(
				doc.getElementById('zotero-item-pane-message-box').textContent,
				Zotero.getString('pane.item.unselected.singular', 1)
			);
			
			// Unselected, with multiple items in view
			var item = new Zotero.Item('audioRecording');
			item.setCollections([id]);
			var itemID2 = yield item.saveTx({
				skipSelect: true
			});
			assert.equal(
				doc.getElementById('zotero-item-pane-message-box').textContent,
				Zotero.getString('pane.item.unselected.plural', 2)
			);
			
			// Multiple items selected
			var promise = zp.itemsView._getItemSelectedPromise();
			zp.itemsView.rememberSelection([itemID1, itemID2]);
			yield promise;
			assert.equal(
				doc.getElementById('zotero-item-pane-message-box').textContent,
				Zotero.getString('pane.item.selected.multiple', 2)
			);
		})
	})
	
	describe("#viewAttachment", function () {
		Components.utils.import("resource://zotero-unit/httpd.js");
		var apiKey = Zotero.Utilities.randomString(24);
		var port = 16213;
		var baseURL = `http://localhost:${port}/`;
		var server;
		var responses = {};
		var httpd;
		
		var setup = Zotero.Promise.coroutine(function* (options = {}) {
			server = sinon.fakeServer.create();
			server.autoRespond = true;
		});
		
		function setResponse(response) {
			setHTTPResponse(server, baseURL, response, responses);
		}
		
		async function downloadOnDemand() {
			var item = new Zotero.Item("attachment");
			item.attachmentLinkMode = 'imported_file';
			item.attachmentPath = 'storage:test.txt';
			// TODO: Test binary data
			var text = Zotero.Utilities.randomString();
			item.attachmentSyncState = "to_download";
			await item.saveTx();
			
			var mtime = "1441252524000";
			var md5 = Zotero.Utilities.Internal.md5(text)
			
			var s3Path = `pretend-s3/${item.key}`;
			httpd.registerPathHandler(
				`/users/1/items/${item.key}/file`,
				{
					handle: function (request, response) {
						response.setStatusLine(null, 302, "Found");
						response.setHeader("Zotero-File-Modification-Time", mtime, false);
						response.setHeader("Zotero-File-MD5", md5, false);
						response.setHeader("Zotero-File-Compressed", "No", false);
						response.setHeader("Location", baseURL + s3Path, false);
					}
				}
			);
			httpd.registerPathHandler(
				"/" + s3Path,
				{
					handle: function (request, response) {
						response.setStatusLine(null, 200, "OK");
						response.write(text);
					}
				}
			);
			
			// Disable loadURI() so viewAttachment() doesn't trigger translator loading
			var stub = sinon.stub(Zotero, "launchFile");
			
			await zp.viewAttachment(item.id);
			
			assert.ok(stub.calledOnce);
			assert.ok(stub.calledWith(item.getFilePath()));
			stub.restore();
			
			assert.equal(await item.attachmentHash, md5);
			assert.equal(await item.attachmentModificationTime, mtime);
			var path = await item.getFilePathAsync();
			assert.equal(await Zotero.File.getContentsAsync(path), text);
		};
		
		before(function () {
			Zotero.HTTP.mock = sinon.FakeXMLHttpRequest;
		})
		beforeEach(function* () {
			Zotero.Prefs.set("api.url", baseURL);
			Zotero.Sync.Runner.apiKey = apiKey;
				
			httpd = new HttpServer();
			httpd.start(port);
			
			yield Zotero.Users.setCurrentUserID(1);
			yield Zotero.Users.setCurrentUsername("testuser");
		})
		afterEach(function* () {
			var defer = new Zotero.Promise.defer();
			httpd.stop(() => defer.resolve());
			yield defer.promise;
		})
		after(function () {
			Zotero.HTTP.mock = null;
		});
		
		it("should download an attachment on-demand in as-needed mode", function* () {
			yield setup();
			Zotero.Sync.Storage.Local.downloadAsNeeded(Zotero.Libraries.userLibraryID, true);
			yield downloadOnDemand();
		});
		
		// As noted in viewAttachment(), this is only necessary for files modified before 5.0.85
		it("should re-download a remotely modified attachment in as-needed mode", async function () {
			await setup();
			Zotero.Sync.Storage.Local.downloadAsNeeded(Zotero.Libraries.userLibraryID, true);
			
			var item = await importFileAttachment('test.txt');
			item.attachmentSyncState = "to_download";
			await item.saveTx();
			
			var text = Zotero.Utilities.randomString();
			var mtime = "1441252524000";
			var md5 = Zotero.Utilities.Internal.md5(text)
			
			var s3Path = `pretend-s3/${item.key}`;
			httpd.registerPathHandler(
				`/users/1/items/${item.key}/file`,
				{
					handle: function (request, response) {
						response.setStatusLine(null, 302, "Found");
						response.setHeader("Zotero-File-Modification-Time", mtime, false);
						response.setHeader("Zotero-File-MD5", md5, false);
						response.setHeader("Zotero-File-Compressed", "No", false);
						response.setHeader("Location", baseURL + s3Path, false);
					}
				}
			);
			httpd.registerPathHandler(
				"/" + s3Path,
				{
					handle: function (request, response) {
						response.setStatusLine(null, 200, "OK");
						response.write(text);
					}
				}
			);
			
			// Disable loadURI() so viewAttachment() doesn't trigger translator loading
			var downloadSpy = sinon.spy(Zotero.Sync.Runner, "downloadFile");
			var launchFileStub = sinon.stub(Zotero, "launchFile");
			
			await zp.viewAttachment(item.id);
			
			assert.ok(downloadSpy.calledOnce);
			assert.ok(launchFileStub.calledOnce);
			assert.ok(launchFileStub.calledWith(item.getFilePath()));
			downloadSpy.restore();
			launchFileStub.restore();
			
			assert.equal(await item.attachmentHash, md5);
			assert.equal(await item.attachmentModificationTime, mtime);
			var path = await item.getFilePathAsync();
			assert.equal(await Zotero.File.getContentsAsync(path), text);
		});
		
		it("should handle a 404 when re-downloading a remotely modified attachment in as-needed mode", async function () {
			await setup();
			Zotero.Sync.Storage.Local.downloadAsNeeded(Zotero.Libraries.userLibraryID, true);
			
			var item = await importFileAttachment('test.txt');
			item.attachmentSyncState = "to_download";
			await item.saveTx();
			
			var mtime = await item.attachmentModificationTime;
			var md5 = await item.attachmentHash;
			var text = await Zotero.File.getContentsAsync(item.getFilePath());
			
			httpd.registerPathHandler(
				`/users/1/items/${item.key}/file`,
				{
					handle: function (request, response) {
						response.setStatusLine(null, 404, "Not Found");
					}
				}
			);
			
			// Disable loadURI() so viewAttachment() doesn't trigger translator loading
			var downloadSpy = sinon.spy(Zotero.Sync.Runner, "downloadFile");
			var launchFileStub = sinon.stub(Zotero, "launchFile");
			
			await zp.viewAttachment(item.id);
			
			assert.ok(downloadSpy.calledOnce);
			assert.ok(launchFileStub.calledOnce);
			assert.ok(launchFileStub.calledWith(item.getFilePath()));
			downloadSpy.restore();
			launchFileStub.restore();
			
			// File shouldn't have changed
			assert.equal(await item.attachmentModificationTime, mtime);
			assert.equal(await item.attachmentHash, md5);
			var path = await item.getFilePathAsync();
			assert.equal(await Zotero.File.getContentsAsync(path), text);
		});
		
		it("should download an attachment on-demand in at-sync-time mode", function* () {
			yield setup();
			Zotero.Sync.Storage.Local.downloadOnSync(Zotero.Libraries.userLibraryID, true);
			yield downloadOnDemand();
		});
	})
	
	
	describe("#renameSelectedAttachmentsFromParents()", function () {
		it("should rename a linked file", async function () {
			var oldFilename = 'old.png';
			var newFilename = 'Test.png';
			var file = getTestDataDirectory();
			file.append('test.png');
			var tmpDir = await getTempDirectory();
			var oldFile = OS.Path.join(tmpDir, oldFilename);
			await OS.File.copy(file.path, oldFile);
			
			var item = createUnsavedDataObject('item');
			item.setField('title', 'Test');
			await item.saveTx();
			
			var attachment = await Zotero.Attachments.linkFromFile({
				file: oldFile,
				parentItemID: item.id
			});
			await zp.selectItem(attachment.id);
			
			await assert.eventually.isTrue(zp.renameSelectedAttachmentsFromParents());
			assert.equal(attachment.attachmentFilename, newFilename);
			var path = await attachment.getFilePathAsync();
			assert.equal(OS.Path.basename(path), newFilename)
			await OS.File.exists(path);
		});
		
		it("should use unique name for linked file if target name is taken", async function () {
			var oldFilename = 'old.png';
			var newFilename = 'Test.png';
			var uniqueFilename = 'Test 2.png';
			var file = getTestDataDirectory();
			file.append('test.png');
			var tmpDir = await getTempDirectory();
			var oldFile = OS.Path.join(tmpDir, oldFilename);
			await OS.File.copy(file.path, oldFile);
			// Create file with target filename
			await Zotero.File.putContentsAsync(OS.Path.join(tmpDir, newFilename), '');
			
			var item = createUnsavedDataObject('item');
			item.setField('title', 'Test');
			await item.saveTx();
			
			var attachment = await Zotero.Attachments.linkFromFile({
				file: oldFile,
				parentItemID: item.id
			});
			await zp.selectItem(attachment.id);
			
			await assert.eventually.isTrue(zp.renameSelectedAttachmentsFromParents());
			assert.equal(attachment.attachmentFilename, uniqueFilename);
			var path = await attachment.getFilePathAsync();
			assert.equal(OS.Path.basename(path), uniqueFilename)
			await OS.File.exists(path);
		});
		
		it("should use unique name for linked file without extension if target name is taken", async function () {
			var oldFilename = 'old';
			var newFilename = 'Test';
			var uniqueFilename = 'Test 2';
			var file = getTestDataDirectory();
			file.append('test.png');
			var tmpDir = await getTempDirectory();
			var oldFile = OS.Path.join(tmpDir, oldFilename);
			await OS.File.copy(file.path, oldFile);
			// Create file with target filename
			await Zotero.File.putContentsAsync(OS.Path.join(tmpDir, newFilename), '');
			
			var item = createUnsavedDataObject('item');
			item.setField('title', 'Test');
			await item.saveTx();
			
			var attachment = await Zotero.Attachments.linkFromFile({
				file: oldFile,
				parentItemID: item.id
			});
			await zp.selectItem(attachment.id);
			
			await assert.eventually.isTrue(zp.renameSelectedAttachmentsFromParents());
			assert.equal(attachment.attachmentFilename, uniqueFilename);
			var path = await attachment.getFilePathAsync();
			assert.equal(OS.Path.basename(path), uniqueFilename)
			await OS.File.exists(path);
		});
	});
	
	
	describe("#duplicateSelectedItem()", function () {
		it("should add reverse relations", async function () {
			await selectLibrary(win);
			var item1 = await createDataObject('item');
			var item2 = await createDataObject('item');
			item1.addRelatedItem(item2);
			await item1.saveTx();
			item2.addRelatedItem(item1);
			await item2.saveTx();
			var item3 = await zp.duplicateSelectedItem();
			assert.sameMembers(item3.relatedItems, [item1.key]);
			assert.sameMembers(item2.relatedItems, [item1.key]);
			assert.sameMembers(item1.relatedItems, [item2.key, item3.key]);
		});
	});
	
	
	describe("#deleteSelectedItems()", function () {
		const DELETE_KEY_CODE = 46;
		
		it("should remove an item from My Publications", function* () {
			var item = createUnsavedDataObject('item');
			item.inPublications = true;
			yield item.saveTx();
			
			yield zp.collectionsView.selectByID("P" + userLibraryID);
			yield waitForItemsLoad(win);
			var iv = zp.itemsView;
			
			var selected = iv.selectItem(item.id);
			assert.ok(selected);
			
			var tree = doc.getElementById(iv.id);
			tree.focus();
			
			yield Zotero.Promise.delay(1);
			
			var promise = waitForDialog();
			var modifyPromise = waitForItemEvent('modify');
			
			var event = doc.createEvent("KeyboardEvent");
			event.initKeyEvent(
				"keypress",
				true,
				true,
				window,
				false,
				false,
				false,
				false,
				DELETE_KEY_CODE,
				0
			);
			tree.dispatchEvent(event);
			yield promise;
			yield modifyPromise;
			
			assert.isFalse(item.inPublications);
			assert.isFalse(item.deleted);
		});
		
		it("should move My Publications item to trash with prompt for modified Delete", function* () {
			var item = createUnsavedDataObject('item');
			item.inPublications = true;
			yield item.saveTx();
			
			yield zp.collectionsView.selectByID("P" + userLibraryID);
			yield waitForItemsLoad(win);
			var iv = zp.itemsView;
			
			var selected = iv.selectItem(item.id);
			assert.ok(selected);
			
			var tree = doc.getElementById(iv.id);
			tree.focus();
			
			yield Zotero.Promise.delay(1);
			
			var promise = waitForDialog();
			var modifyPromise = waitForItemEvent('modify');
			
			var event = doc.createEvent("KeyboardEvent");
			event.initKeyEvent(
				"keypress",
				true,
				true,
				window,
				false,
				false,
				!Zotero.isMac, // shift
				Zotero.isMac, // meta
				DELETE_KEY_CODE,
				0
			);
			tree.dispatchEvent(event);
			yield promise;
			yield modifyPromise;
			
			assert.isTrue(item.inPublications);
			assert.isTrue(item.deleted);
		});
		
		it("should move saved search item to trash with prompt for unmodified Delete", async function () {
			var search = await createDataObject('search');
			var title = [...Object.values(search.conditions)]
				.filter(x => x.condition == 'title' && x.operator == 'contains')[0].value;
			var item = await createDataObject('item', { title });
			
			await waitForItemsLoad(win);
			var iv = zp.itemsView;
			
			var selected = iv.selectItem(item.id);
			assert.ok(selected);
			
			var tree = doc.getElementById(iv.id);
			tree.focus();
			
			await Zotero.Promise.delay(1);
			
			var promise = waitForDialog();
			var modifyPromise = waitForItemEvent('modify');
			
			var event = new KeyboardEvent(
				"keypress",
				{
					key: 'Delete',
					code: 'Delete',
					keyCode: DELETE_KEY_CODE,
					bubbles: true,
					cancelable: true
				}
			);
			tree.dispatchEvent(event);
			await promise;
			await modifyPromise;
			
			assert.isTrue(item.deleted);
		});
		
		it("should move saved search trash without prompt for modified Delete", async function () {
			var search = await createDataObject('search');
			var title = [...Object.values(search.conditions)]
				.filter(x => x.condition == 'title' && x.operator == 'contains')[0].value;
			var item = await createDataObject('item', { title });
			
			await waitForItemsLoad(win);
			var iv = zp.itemsView;
			
			var selected = iv.selectItem(item.id);
			assert.ok(selected);
			
			var tree = doc.getElementById(iv.id);
			tree.focus();
			
			await Zotero.Promise.delay(1);
			
			var modifyPromise = waitForItemEvent('modify');
			
			var event = new KeyboardEvent(
				"keypress",
				{
					key: 'Delete',
					code: 'Delete',
					metaKey: Zotero.isMac,
					shiftKey: !Zotero.isMac,
					keyCode: DELETE_KEY_CODE,
					bubbles: true,
					cancelable: true
				}
			);
			tree.dispatchEvent(event);
			await modifyPromise;
			
			assert.isTrue(item.deleted);
		});
	});
	
	describe("#deleteSelectedCollection()", function () {
		it("should delete collection but not descendant items by default", function* () {
			var collection = yield createDataObject('collection');
			var item = yield createDataObject('item', { collections: [collection.id] });
			var promise = waitForDialog();
			yield zp.deleteSelectedCollection();
			assert.isFalse(Zotero.Collections.exists(collection.id));
			assert.isTrue(Zotero.Items.exists(item.id));
			assert.isFalse(item.deleted);
		});
		
		it("should delete collection and descendant items when deleteItems=true", function* () {
			var collection = yield createDataObject('collection');
			var item = yield createDataObject('item', { collections: [collection.id] });
			var promise = waitForDialog();
			yield zp.deleteSelectedCollection(true);
			assert.isFalse(Zotero.Collections.exists(collection.id));
			assert.isTrue(Zotero.Items.exists(item.id));
			assert.isTrue(item.deleted);
		});
	});
	
	
	describe("#setVirtual()", function () {
		var cv;
		
		before(function* () {
			cv = zp.collectionsView;
		});
		beforeEach(function () {
			Zotero.Prefs.clear('duplicateLibraries');
			Zotero.Prefs.clear('unfiledLibraries');
			return selectLibrary(win);
		})
		
		it("should show a hidden virtual collection in My Library", function* () {
			// Create unfiled, duplicate items
			var title = Zotero.Utilities.randomString();
			var item1 = yield createDataObject('item', { title });
			var item2 = yield createDataObject('item', { title });
			
			// Start hidden (tested in collectionTreeViewTest)
			Zotero.Prefs.set('duplicateLibraries', `{"${userLibraryID}": false}`);
			Zotero.Prefs.set('unfiledLibraries', `{"${userLibraryID}": false}`);
			yield cv.refresh();
			
			// Show Duplicate Items
			var id = "D" + userLibraryID;
			assert.isFalse(cv.getRowIndexByID(id));
			yield zp.setVirtual(userLibraryID, 'duplicates', true, true);
			// Duplicate Items should be selected
			assert.equal(zp.getCollectionTreeRow().id, id);
			// Should be missing from pref
			assert.isUndefined(JSON.parse(Zotero.Prefs.get('duplicateLibraries'))[userLibraryID])
			
			// Clicking should select both items
			var row = cv.getRowIndexByID(id);
			assert.ok(row);
			assert.equal(cv.selection.pivot, row);
			yield waitForItemsLoad(win);
			var iv = zp.itemsView;
			row = iv.getRowIndexByID(item1.id);
			assert.isNumber(row);
			var promise = iv.waitForSelect();
			clickOnItemsRow(win, iv, row);
			assert.equal(iv.selection.count, 2);
			yield promise;
			
			// Show Unfiled Items
			id = "U" + userLibraryID;
			assert.isFalse(cv.getRowIndexByID(id));
			yield zp.setVirtual(userLibraryID, 'unfiled', true, true);
			// Unfiled Items should be selected
			assert.equal(zp.getCollectionTreeRow().id, id);
			// Should be missing from pref
			assert.isUndefined(JSON.parse(Zotero.Prefs.get('unfiledLibraries'))[userLibraryID])
		});
		
		it("should expand library if collapsed when showing virtual collection", function* () {
			// Start hidden (tested in collectionTreeViewTest)
			Zotero.Prefs.set('duplicateLibraries', `{"${userLibraryID}": false}`);
			yield cv.refresh();
			
			var libraryRow = cv.getRowIndexByID(Zotero.Libraries.userLibrary.treeViewID);
			if (cv.isContainerOpen(libraryRow)) {
				yield cv.toggleOpenState(libraryRow);
				cv._saveOpenStates();
			}
			
			// Show Duplicate Items
			var id = "D" + userLibraryID;
			yield zp.setVirtual(userLibraryID, 'duplicates', true, true);
			
			// Library should have been expanded and Duplicate Items selected
			assert.ok(cv.getRowIndexByID(id));
			assert.equal(zp.getCollectionTreeRow().id, id);
		});
		
		it("should hide a virtual collection in My Library", function* () {
			yield cv.refresh();
			
			// Hide Duplicate Items
			var id = "D" + userLibraryID;
			assert.ok(yield cv.selectByID(id));
			yield zp.setVirtual(userLibraryID, 'duplicates', false);
			assert.isFalse(cv.getRowIndexByID(id));
			assert.isFalse(JSON.parse(Zotero.Prefs.get('duplicateLibraries'))[userLibraryID])
			
			// Hide Unfiled Items
			id = "U" + userLibraryID;
			assert.ok(yield cv.selectByID(id));
			yield zp.setVirtual(userLibraryID, 'unfiled', false);
			assert.isFalse(cv.getRowIndexByID(id));
			assert.isFalse(JSON.parse(Zotero.Prefs.get('unfiledLibraries'))[userLibraryID])
		});
		
		it("should hide a virtual collection in a group", function* () {
			yield cv.refresh();
			
			var group = yield createGroup();
			var groupRow = cv.getRowIndexByID(group.treeViewID);
			var rowCount = cv._rows.length;
			
			// Make sure group is open
			if (!cv.isContainerOpen(groupRow)) {
				yield cv.toggleOpenState(groupRow);
			}
			
			// Make sure Duplicate Items is showing
			var id = "D" + group.libraryID;
			assert.ok(cv.getRowIndexByID(id));
			
			// Hide Duplicate Items
			assert.ok(yield cv.selectByID(id));
			yield zp.setVirtual(group.libraryID, 'duplicates', false);
			// Row should have been removed
			assert.isFalse(cv.getRowIndexByID(id));
			// Pref should have been updated
			Zotero.debug(Zotero.Prefs.get('duplicateLibraries'));
			assert.isFalse(JSON.parse(Zotero.Prefs.get('duplicateLibraries'))[group.libraryID]);
			// Group row shouldn't have changed
			assert.equal(cv.getRowIndexByID(group.treeViewID), groupRow);
			// Group should remain open
			assert.isTrue(cv.isContainerOpen(groupRow));
			// Row count should be 1 less
			assert.equal(cv._rows.length, --rowCount);
			
			// Hide Unfiled Items
			id = "U" + group.libraryID;
			assert.ok(yield cv.selectByID(id));
			// Hide Unfiled Items
			yield zp.setVirtual(group.libraryID, 'unfiled', false);
			// Row should have been removed
			assert.isFalse(cv.getRowIndexByID(id));
			// Pref should have been updated
			assert.isFalse(JSON.parse(Zotero.Prefs.get('unfiledLibraries'))[group.libraryID]);
			// Group row shouldn't have changed
			assert.equal(cv.getRowIndexByID(group.treeViewID), groupRow);
			// Group should remain open
			assert.isTrue(cv.isContainerOpen(groupRow));
			// Row count should be 1 less
			assert.equal(cv._rows.length, --rowCount);
		});
	});
	
	describe("#editSelectedCollection()", function () {
		it("should edit a saved search", function* () {
			var search = yield createDataObject('search');
			var promise = waitForWindow('chrome://zotero/content/searchDialog.xul', function (win) {
				let searchBox = win.document.getElementById('search-box');
				var c = searchBox.search.getCondition(
					searchBox.search.addCondition("title", "contains", "foo")
				);
				searchBox.addCondition(c);
				win.document.documentElement.acceptDialog();
			});
			yield zp.editSelectedCollection();
			yield promise;
			var conditions = search.getConditions();
			assert.lengthOf(Object.keys(conditions), 3);
		});
		
		it("should edit a saved search in a group", function* () {
			var group = yield getGroup();
			var search = yield createDataObject('search', { libraryID: group.libraryID });
			var promise = waitForWindow('chrome://zotero/content/searchDialog.xul', function (win) {
				let searchBox = win.document.getElementById('search-box');
				var c = searchBox.search.getCondition(
					searchBox.search.addCondition("title", "contains", "foo")
				);
				searchBox.addCondition(c);
				win.document.documentElement.acceptDialog();
			});
			yield zp.editSelectedCollection();
			yield promise;
			var conditions = search.getConditions();
			assert.lengthOf(Object.keys(conditions), 3);
		});
	});
	
	describe("#buildItemContextMenu()", function () {
		it("shouldn't show export or bib options for multiple standalone file attachments without notes", async function () {
			var item1 = await importFileAttachment('test.png');
			var item2 = await importFileAttachment('test.png');
			
			await zp.selectItems([item1.id, item2.id]);
			await zp.buildItemContextMenu();
			
			var menu = win.document.getElementById('zotero-itemmenu');
			assert.isTrue(menu.querySelector('.zotero-menuitem-export').hidden);
			assert.isTrue(menu.querySelector('.zotero-menuitem-create-bibliography').hidden);
		});
		
		it("should show “Export Note…” for standalone file attachment with note", async function () {
			var item1 = await importFileAttachment('test.png');
			item1.setNote('<p>Foo</p>');
			await item1.saveTx();
			var item2 = await importFileAttachment('test.png');
			
			await zp.selectItems([item1.id, item2.id]);
			await zp.buildItemContextMenu();
			
			var menu = win.document.getElementById('zotero-itemmenu');
			var exportMenuItem = menu.querySelector('.zotero-menuitem-export');
			assert.isFalse(exportMenuItem.hidden);
			assert.equal(
				exportMenuItem.getAttribute('label'),
				Zotero.getString('pane.items.menu.exportNote.multiple')
			);
		});
	});
})
