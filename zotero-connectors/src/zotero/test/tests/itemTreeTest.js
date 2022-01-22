"use strict";

describe("Zotero.ItemTree", function() {
	var win, zp, cv, itemsView;
	var existingItemID;
	var existingItemID2;
	
	// Load Zotero pane and select library
	before(async function () {
		win = await loadZoteroPane();
		zp = win.ZoteroPane;
		cv = zp.collectionsView;
		
		var item1 = await createDataObject('item', { setTitle: true });
		existingItemID = item1.id;
		var item2 = await createDataObject('item');
		existingItemID2 = item2.id;
	});
	beforeEach(async function () {
		await selectLibrary(win);
		itemsView = zp.itemsView;
		itemsView._columnsId = null;
	});
	after(function () {
		win.close();
	});
	
	it("shouldn't show items in trash in library root", async function () {
		var item = await createDataObject('item', { title: "foo" });
		var itemID = item.id;
		item.deleted = true;
		await item.saveTx();
		assert.isFalse(itemsView.getRowIndexByID(itemID));
	});
	
	describe("when performing a quick search", function () {
		let parentItem, match, nonMatch;
		let selectAllEvent = {key: 'a'};
		before(async function () {
			parentItem = await createDataObject('item');
			match = await importFileAttachment('test.png', { title: 'find-me', parentItemID: parentItem.id });
			nonMatch = await importFileAttachment('test.png', { title: 'not-a-result', parentItemID: parentItem.id });
			if (Zotero.isMac) {
				selectAllEvent.metaKey = true;
			} else {
				selectAllEvent.ctrlKey = true;
			}
		});

		it("should not select non-matching children when issuing a Select All command", async function () {
			var quicksearch = win.document.getElementById('zotero-tb-search');
			quicksearch.value = match.getField('title');
			quicksearch.doCommand();
			await itemsView._refreshPromise;
			itemsView.tree._onKeyDown(selectAllEvent);

			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], match.id);
		});

		it("should expand collapsed parents with matching children when issuing a Select All command", async function () {
			itemsView.collapseAllRows();
			var selected = itemsView.getSelectedItems(true);
			// After collapse the parent item is selected
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], parentItem.id);
			
			itemsView.tree._onKeyDown(selectAllEvent);
			selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], match.id);
		});
	});
	
	describe("#selectItem()", function () {
		/**
		 * Don't hang if the pane's item-select handler is never triggered due to the item already
		 * being selected
		 */
		it("should return if item is already selected", async function () {
			var numSelected = await itemsView.selectItem(existingItemID);
			assert.equal(numSelected, 1);
			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], existingItemID);
			numSelected = await itemsView.selectItem(existingItemID);
			assert.equal(numSelected, 1);
			selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], existingItemID);
		});
	});
	
	describe("#selectItems()", function () {
		/**
		 * Don't hang if the pane's item-select handler is never triggered due to the items already
		 * being selected
		 */
		it("should return if all items are already selected", async function () {
			var itemIDs = [existingItemID, existingItemID2];
			var numSelected = await itemsView.selectItems(itemIDs);
			assert.equal(numSelected, 2);
			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 2);
			assert.sameMembers(selected, itemIDs);
			numSelected = await itemsView.selectItems(itemIDs);
			assert.equal(numSelected, 2);
			selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 2);
			assert.sameMembers(selected, itemIDs);
		});
		
		
		it("should expand parent items to select children", async function () {
			var item1 = await createDataObject('item');
			var item2 = await createDataObject('item');
			var item3 = await createDataObject('item');
			var note1 = await createDataObject('item', { itemType: 'note', parentID: item1.id });
			var note2 = await createDataObject('item', { itemType: 'note', parentID: item2.id });
			var note3 = await createDataObject('item', { itemType: 'note', parentID: item3.id });
			
			var toSelect = [note1.id, note2.id, note3.id];
			itemsView.collapseAllRows();

			var numSelected = await itemsView.selectItems(toSelect);
			assert.equal(numSelected, 3);
			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 3);
			assert.sameMembers(selected, toSelect);
			
			// Again with the ids given in reverse order
			itemsView.collapseAllRows();
			toSelect = toSelect.reverse();
			var numSelected = await itemsView.selectItems(toSelect);
			assert.equal(numSelected, 3);
			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 3);
			assert.sameMembers(selected, toSelect);
		});
	});
	
	describe("#getCellText()", function () {
		it("should return new value after edit", function* () {
			var str = Zotero.Utilities.randomString();
			var item = yield createDataObject('item', { title: str });
			var row = itemsView.getRowIndexByID(item.id);
			assert.equal(itemsView.getCellText(row, 'title'), str);
			yield modifyDataObject(item);
			assert.notEqual(itemsView.getCellText(row, 'title'), str);
		})
	})
	
	describe("#notify()", function () {
		beforeEach(function () {
			sinon.spy(win.ZoteroPane, "itemSelected");
		})
		
		afterEach(function () {
			win.ZoteroPane.itemSelected.restore();
		})
		
		it("should select a new item", async function () {
			let selectPromise = itemsView.waitForSelect();
			itemsView.selection.clearSelection();
			assert.lengthOf(itemsView.getSelectedItems(), 0);

			await selectPromise;
			assert.equal(win.ZoteroPane.itemSelected.callCount, 1);
			
			// Create item
			var item = new Zotero.Item('book');
			var id = await item.saveTx();
			
			// New item should be selected
			var selected = itemsView.getSelectedItems();
			assert.lengthOf(selected, 1);
			assert.equal(selected[0].id, id);
			
			// Item should have been selected once
			assert.equal(win.ZoteroPane.itemSelected.callCount, 2);
			await assert.eventually.ok(win.ZoteroPane.itemSelected.returnValues[1]);
		});
		
		it("shouldn't select a new item if skipNotifier is passed", function* () {
			// Select existing item
			yield itemsView.selectItem(existingItemID);
			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], existingItemID);
			
			// Reset call count on spy
			win.ZoteroPane.itemSelected.resetHistory();
			
			// Create item with skipNotifier flag
			var item = new Zotero.Item('book');
			var id = yield item.saveTx({
				skipNotifier: true
			});
			
			// No select events should have occurred
			assert.equal(win.ZoteroPane.itemSelected.callCount, 0);
			
			// Existing item should still be selected
			selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], existingItemID);
		});
		
		it("shouldn't select a new item if skipSelect is passed", async function () {
			// Select existing item
			await itemsView.selectItem(existingItemID);
			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], existingItemID);
			
			// Reset call count on spy
			win.ZoteroPane.itemSelected.resetHistory();
			
			// Create item with skipSelect flag
			var item = new Zotero.Item('book');
			var id = await item.saveTx({
				skipSelect: true
			});
			
			// itemSelected should have been called once (from 'selectEventsSuppressed = false'
			// in notify()) as a no-op
			assert.equal(win.ZoteroPane.itemSelected.callCount, 1);
			assert.isFalse(win.ZoteroPane.itemSelected.returnValues[0].value());
			
			// Existing item should still be selected
			selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], existingItemID);
		});
		
		it("should clear search and select new item if non-matching quick search is active", async function () {
			await createDataObject('item');
			
			var quicksearch = win.document.getElementById('zotero-tb-search');
			quicksearch.value = Zotero.randomString();
			quicksearch.doCommand();
			await itemsView._refreshPromise;
			
			assert.equal(itemsView.rowCount, 0);
			
			// Create item
			var item = await createDataObject('item');
			
			assert.isAbove(itemsView.rowCount, 0);
			assert.equal(quicksearch.value, '');
			
			// New item should be selected
			var selected = itemsView.getSelectedItems();
			assert.lengthOf(selected, 1);
			assert.equal(selected[0].id, item.id);
		});
		
		it("shouldn't clear quicksearch if skipSelect is passed", function* () {
			var searchString = Zotero.Items.get(existingItemID).getField('title');
			
			yield createDataObject('item');
			
			var quicksearch = win.document.getElementById('zotero-tb-search');
			quicksearch.value = searchString;
			quicksearch.doCommand();
			yield itemsView._refreshPromise;
			
			assert.equal(itemsView.rowCount, 1);
			
			// Create item with skipSelect flag
			var item = new Zotero.Item('book');
			var ran = Zotero.Utilities.randomString();
			item.setField('title', ran);
			var id = yield item.saveTx({
				skipSelect: true
			});
			
			assert.equal(itemsView.rowCount, 1);
			assert.equal(quicksearch.value, searchString);
			
			// Clear search
			quicksearch.value = "";
			quicksearch.doCommand();
			yield itemsView._refreshPromise;
		});
		
		it("shouldn't change selection outside of trash if new trashed item is created with skipSelect", function* () {
			yield selectLibrary(win);
			yield waitForItemsLoad(win);
			
			itemsView.selection.clearSelection();
			
			var item = createUnsavedDataObject('item');
			item.deleted = true;
			var id = yield item.saveTx({
				skipSelect: true
			});
			
			// Nothing should be selected
			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 0);
		})
		
		it("shouldn't select a modified item", function* () {
			// Create item
			var item = new Zotero.Item('book');
			var id = yield item.saveTx();
			
			itemsView.selection.clearSelection();
			assert.lengthOf(itemsView.getSelectedItems(), 0);
			// Reset call count on spy
			win.ZoteroPane.itemSelected.resetHistory();
			
			// Modify item
			item.setField('title', 'no select on modify');
			yield item.saveTx();
			
			// itemSelected should have been called once (from 'selectEventsSuppressed = false'
			// in notify()) as a no-op
			assert.equal(win.ZoteroPane.itemSelected.callCount, 1);
			assert.isFalse(win.ZoteroPane.itemSelected.returnValues[0].value());
			
			// Modified item should not be selected
			assert.lengthOf(itemsView.getSelectedItems(), 0);
		});
		
		it("should maintain selection on a selected modified item", function* () {
			// Create item
			var item = new Zotero.Item('book');
			var id = yield item.saveTx();
			
			yield itemsView.selectItem(id);
			var selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], id);
			
			// Reset call count on spy
			win.ZoteroPane.itemSelected.resetHistory();
			
			// Modify item
			item.setField('title', 'maintain selection on modify');
			yield item.saveTx();
			
			// itemSelected should have been called once (from 'selectEventsSuppressed = false'
			// in notify()) as a no-op
			assert.equal(win.ZoteroPane.itemSelected.callCount, 1);
			assert.isFalse(win.ZoteroPane.itemSelected.returnValues[0].value());
			
			// Modified item should still be selected
			selected = itemsView.getSelectedItems(true);
			assert.lengthOf(selected, 1);
			assert.equal(selected[0], id);
		});
		
		it("should reselect the same row when an item is removed", function* () {
			var collection = yield createDataObject('collection');
			yield waitForItemsLoad(win);
			itemsView = zp.itemsView;
			
			var items = [];
			var num = 6;
			for (let i = 0; i < num; i++) {
				let item = createUnsavedDataObject('item', { title: "" + i });
				item.addToCollection(collection.id);
				yield item.saveTx();
				items.push(item);
			}
			assert.equal(itemsView.rowCount, num);
			
			// Select the third item in the list
			itemsView.selection.select(2);
			
			// Remove item
			var treeRow = itemsView.getRow(2);
			yield Zotero.DB.executeTransaction(function* () {
				yield collection.removeItems([treeRow.ref.id]);
			}.bind(this));
			
			// Selection should stay on third row
			assert.equal(itemsView.selection.focused, 2);
			
			// Delete item
			var treeRow = itemsView.getRow(2);
			yield treeRow.ref.eraseTx();
			
			// Selection should stay on third row
			assert.equal(itemsView.selection.focused, 2);
			
			yield Zotero.Items.erase(items.map(item => item.id));
		});
		
		it("shouldn't select sibling on attachment erase if attachment wasn't selected", function* () {
			var item = yield createDataObject('item');
			var att1 = yield importFileAttachment('test.png', { title: 'A', parentItemID: item.id });
			var att2 = yield importFileAttachment('test.png', { title: 'B', parentItemID: item.id });
			yield zp.itemsView.selectItem(att2.id); // expand
			yield zp.itemsView.selectItem(item.id);
			yield att1.eraseTx();
			assert.sameMembers(zp.itemsView.getSelectedItems(true), [item.id]);
		});
		
		it("should keep first visible item in view when other items are added with skipSelect and nothing in view is selected", function* () {
			var collection = yield createDataObject('collection');
			yield waitForItemsLoad(win);
			itemsView = zp.itemsView;
			
			var treebox = itemsView._treebox;
			var numVisibleRows = treebox.getPageLength();
			
			// Get a numeric string left-padded with zeroes
			function getTitle(i, max) {
				return new String(new Array(max + 1).join(0) + i).slice(-1 * max);
			}
			
			var num = numVisibleRows + 10;
			yield Zotero.DB.executeTransaction(function* () {
				for (let i = 0; i < num; i++) {
					let title = getTitle(i, num);
					let item = createUnsavedDataObject('item', { title });
					item.addToCollection(collection.id);
					yield item.save();
				}
			}.bind(this));
			
			// Scroll halfway
			treebox.scrollToRow(Math.round(num / 2) - Math.round(numVisibleRows / 2));
			
			var firstVisibleItemID = itemsView.getRow(treebox.getFirstVisibleRow()).ref.id;
			
			// Add one item at the beginning
			var item = createUnsavedDataObject(
				'item', { title: getTitle(0, num), collections: [collection.id] }
			);
			yield item.saveTx({
				skipSelect: true
			});
			// Then add a few more in a transaction
			yield Zotero.DB.executeTransaction(function* () {
				for (let i = 0; i < 3; i++) {
					var item = createUnsavedDataObject(
						'item', { title: getTitle(0, num), collections: [collection.id] }
					);
					yield item.save({
						skipSelect: true
					});
				}
			}.bind(this));
			
			// Make sure the same item is still in the first visible row
			assert.equal(itemsView.getRow(treebox.getFirstVisibleRow()).ref.id, firstVisibleItemID);
		});
		
		it.skip("should keep first visible selected item in position when other items are added with skipSelect", function* () {
			var collection = yield createDataObject('collection');
			yield waitForItemsLoad(win);
			itemsView = zp.itemsView;
			
			var treebox = itemsView._treebox;
			var numVisibleRows = treebox.getPageLength();
			
			// Get a numeric string left-padded with zeroes
			function getTitle(i, max) {
				return new String(new Array(max + 1).join(0) + i).slice(-1 * max);
			}
			
			var num = numVisibleRows + 10;
			yield Zotero.DB.executeTransaction(function* () {
				for (let i = 0; i < num; i++) {
					let title = getTitle(i, num);
					let item = createUnsavedDataObject('item', { title });
					item.addToCollection(collection.id);
					yield item.save();
				}
			}.bind(this));
			
			// Scroll halfway
			treebox.scrollToRow(Math.round(num / 2) - Math.round(numVisibleRows / 2));
			
			// Select an item
			itemsView.selection.select(Math.round(num / 2));
			var selectedItem = itemsView.getSelectedItems()[0];
			var offset = itemsView.getRowIndexByID(selectedItem.treeViewID) - treebox.getFirstVisibleRow();
			
			// Add one item at the beginning
			var item = createUnsavedDataObject(
				'item', { title: getTitle(0, num), collections: [collection.id] }
			);
			yield item.saveTx({
				skipSelect: true
			});
			// Then add a few more in a transaction
			yield Zotero.DB.executeTransaction(function* () {
				for (let i = 0; i < 3; i++) {
					var item = createUnsavedDataObject(
						'item', { title: getTitle(0, num), collections: [collection.id] }
					);
					yield item.save({
						skipSelect: true
					});
				}
			}.bind(this));
			
			// Make sure the selected item is still at the same position
			assert.equal(itemsView.getSelectedItems()[0], selectedItem);
			var newOffset = itemsView.getRowIndexByID(selectedItem.treeViewID) - treebox.getFirstVisibleRow();
			assert.equal(newOffset, offset);
		});
		
		it("shouldn't scroll items list if at top when other items are added with skipSelect", function* () {
			var collection = yield createDataObject('collection');
			yield waitForItemsLoad(win);
			itemsView = zp.itemsView;
			
			var treebox = itemsView._treebox;
			var numVisibleRows = treebox.getPageLength();
			
			// Get a numeric string left-padded with zeroes
			function getTitle(i, max) {
				return new String(new Array(max + 1).join(0) + i).slice(-1 * max);
			}
			
			var num = numVisibleRows + 10;
			yield Zotero.DB.executeTransaction(function* () {
				// Start at "*1" so we can add items before
				for (let i = 1; i < num; i++) {
					let title = getTitle(i, num);
					let item = createUnsavedDataObject('item', { title });
					item.addToCollection(collection.id);
					yield item.save();
				}
			}.bind(this));
			
			// Scroll to top
			treebox.scrollToRow(0);
			
			// Add one item at the beginning
			var item = createUnsavedDataObject(
				'item', { title: getTitle(0, num), collections: [collection.id] }
			);
			yield item.saveTx({
				skipSelect: true
			});
			// Then add a few more in a transaction
			yield Zotero.DB.executeTransaction(function* () {
				for (let i = 0; i < 3; i++) {
					var item = createUnsavedDataObject(
						'item', { title: getTitle(0, num), collections: [collection.id] }
					);
					yield item.save({
						skipSelect: true
					});
				}
			}.bind(this));
			
			// Make sure the first row is still at the top
			assert.equal(treebox.getFirstVisibleRow(), 0);
		});
		
		it("should update search results when items are added", function* () {
			var search = yield createDataObject('search');
			var title = search.getConditions()[0].value;
			
			yield waitForItemsLoad(win);
			assert.equal(zp.itemsView.rowCount, 0);
			
			// Add an item matching search
			var item = yield createDataObject('item', { title });
			
			yield waitForItemsLoad(win);
			assert.equal(zp.itemsView.rowCount, 1);
			assert.equal(zp.itemsView.getRowIndexByID(item.id), 0);
		});
		
		it("should re-sort search results when an item is modified", async function () {
			var search = await createDataObject('search');
			itemsView = zp.itemsView;
			var title = search.getConditions()[0].value;
			
			var item1 = await createDataObject('item', { title: title + " 1" });
			var item2 = await createDataObject('item', { title: title + " 3" });
			var item3 = await createDataObject('item', { title: title + " 5" });
			var item4 = await createDataObject('item', { title: title + " 7" });

			const colIndex = itemsView.tree._getColumns().findIndex(column => column.dataKey == 'title');
			await itemsView.tree._columns.toggleSort(colIndex);
			
			// Check initial sort order
			assert.equal(itemsView.getRow(0).ref.getField('title'), title + " 1");
			assert.equal(itemsView.getRow(3).ref.getField('title'), title + " 7");
			
			// Set first row to title that should be sorted in the middle
			itemsView.getRow(3).ref.setField('title', title + " 4");
			await itemsView.getRow(3).ref.saveTx();
			
			assert.equal(itemsView.getRow(0).ref.getField('title'), title + " 1");
			assert.equal(itemsView.getRow(1).ref.getField('title'), title + " 3");
			assert.equal(itemsView.getRow(2).ref.getField('title'), title + " 4");
			assert.equal(itemsView.getRow(3).ref.getField('title'), title + " 5");
		});
		
		it("should update search results when search conditions are changed", function* () {
			var search = createUnsavedDataObject('search');
			var title1 = Zotero.Utilities.randomString();
			var title2 = Zotero.Utilities.randomString();
			search.fromJSON({
				name: "Test",
				conditions: [
					{
						condition: "title",
						operator: "is",
						value: title1
					}
				]
			});
			yield search.saveTx();
			
			yield waitForItemsLoad(win);
			
			// Add an item that doesn't match search
			var item = yield createDataObject('item', { title: title2 });
			yield waitForItemsLoad(win);
			assert.equal(zp.itemsView.rowCount, 0);
			
			// Modify conditions to match item
			search.removeCondition(0);
			search.addCondition("title", "is", title2);
			yield search.saveTx();
			
			yield waitForItemsLoad(win);
			
			assert.equal(zp.itemsView.rowCount, 1);
		});
		
		it("should remove items from Unfiled Items when added to a collection", async function () {
			var userLibraryID = Zotero.Libraries.userLibraryID;
			var collection = await createDataObject('collection');
			var item = await createDataObject('item', { title: "Unfiled Item" });
			await zp.setVirtual(userLibraryID, 'unfiled', true, true);
			assert.equal(zp.getCollectionTreeRow().id, 'U' + userLibraryID);
			await waitForItemsLoad(win);
			assert.isNumber(zp.itemsView.getRowIndexByID(item.id));
			await Zotero.DB.executeTransaction(async function () {
				await collection.addItem(item.id);
			});
			assert.isFalse(zp.itemsView.getRowIndexByID(item.id));
		});
		
		describe("Trash", function () {
			it("should remove untrashed parent item when last trashed child is deleted", function* () {
				var userLibraryID = Zotero.Libraries.userLibraryID;
				var item = yield createDataObject('item');
				var note = yield createDataObject(
					'item', { itemType: 'note', parentID: item.id, deleted: true }
				);
				yield cv.selectByID("T" + userLibraryID);
				yield waitForItemsLoad(win);
				assert.isNumber(zp.itemsView.getRowIndexByID(item.id));
				var promise = waitForDialog();
				yield zp.emptyTrash();
				yield promise;
				assert.isFalse(zp.itemsView.getRowIndexByID(item.id));
			});
		});
		
		describe("My Publications", function () {
			before(async function () {
				var libraryID = Zotero.Libraries.userLibraryID;
				
				var s = new Zotero.Search;
				s.libraryID = libraryID;
				s.addCondition('publications', 'true');
				var ids = await s.search();
				
				await Zotero.Items.erase(ids);
				
				await zp.collectionsView.selectByID("P" + libraryID);
				await waitForItemsLoad(win);
				
				// Make sure we're showing the intro text
				var messageElem = win.document.querySelector('.items-tree-message');
				assert.notEqual(messageElem.style.display, 'none');
			});
			
			it("should replace My Publications intro text with items list on item add", async function () {
				var item = await createDataObject('item');
				
				await zp.collectionsView.selectByID("P" + item.libraryID);
				await waitForItemsLoad(win);
				
				item.inPublications = true;
				await item.saveTx();

				var messageElem = win.document.querySelector('.items-tree-message');
				assert.equal(messageElem.style.display, 'none');
				
				assert.isNumber(itemsView.getRowIndexByID(item.id));
			});
			
			it("should add new item to My Publications items list", function* () {
				var item1 = createUnsavedDataObject('item');
				item1.inPublications = true;
				yield item1.saveTx();
				
				yield zp.collectionsView.selectByID("P" + item1.libraryID);
				yield waitForItemsLoad(win);

				var messageElem = win.document.querySelector('.items-tree-message');
				assert.equal(messageElem.style.display, 'none');
				
				var item2 = createUnsavedDataObject('item');
				item2.inPublications = true;
				yield item2.saveTx();
				
				assert.isNumber(itemsView.getRowIndexByID(item2.id));
			});
			
			it("should add modified item to My Publications items list", function* () {
				var item1 = createUnsavedDataObject('item');
				item1.inPublications = true;
				yield item1.saveTx();
				var item2 = yield createDataObject('item');
				
				yield zp.collectionsView.selectByID("P" + item1.libraryID);
				yield waitForItemsLoad(win);

				var messageElem = win.document.querySelector('.items-tree-message');
				assert.equal(messageElem.style.display, 'none');
				
				assert.isFalse(itemsView.getRowIndexByID(item2.id));
				
				item2.inPublications = true;
				yield item2.saveTx();
				
				assert.isNumber(itemsView.getRowIndexByID(item2.id));
			});
			
			it("should show Show/Hide button for imported file attachment", function* () {
				var item = yield createDataObject('item', { inPublications: true });
				var attachment = yield importFileAttachment('test.png', { parentItemID: item.id });
				
				yield zp.collectionsView.selectByID("P" + item.libraryID);
				yield waitForItemsLoad(win);
				
				yield itemsView.selectItem(attachment.id);
				yield Zotero.Promise.delay();
				
				var box = win.document.getElementById('zotero-item-pane-top-buttons-my-publications');
				assert.isFalse(box.hidden);
			});
			
			it("shouldn't show Show/Hide button for linked file attachment", function* () {
				var item = yield createDataObject('item', { inPublications: true });
				var attachment = yield Zotero.Attachments.linkFromFile({
					file: OS.Path.join(getTestDataDirectory().path, 'test.png'),
					parentItemID: item.id
				});
				
				yield zp.collectionsView.selectByID("P" + item.libraryID);
				yield waitForItemsLoad(win);
				
				yield itemsView.selectItem(attachment.id);
				
				var box = win.document.getElementById('zotero-item-pane-top-buttons-my-publications');
				assert.isTrue(box.hidden);
			});
		});
	})
	
	
	describe("#onDrop()", function () {
		var httpd;
		var port = 16213;
		var baseURL = `http://localhost:${port}/`;
		var pdfFilename = "test.pdf";
		var pdfURL = baseURL + pdfFilename;
		var pdfPath;
		
		function drop(index, orient, dataTransfer) {
			Zotero.DragDrop.currentOrientation = orient;
			var event = { dataTransfer };
			// On macOS, ItemTree checks modifier keys, not just the dropEffect
			if (Zotero.isMac
					&& dataTransfer.types.contains('application/x-moz-file')) {
				switch (dataTransfer.dropEffect) {
					case 'link':
						event.metaKey = true;
						event.altKey = true;
						break;
					
					case 'move':
						event.metaKey = true;
						event.altKey = false;
						break;
					
					default:
						event.metaKey = false;
						event.altKey = false;
				}
			}
			return itemsView.onDrop(event, index);
		}
		
		// Serve a PDF to test URL dragging
		before(function () {
			Components.utils.import("resource://zotero-unit/httpd.js");
			httpd = new HttpServer();
			httpd.start(port);
			var file = getTestDataDirectory();
			file.append(pdfFilename);
			pdfPath = file.path;
			httpd.registerFile("/" + pdfFilename, file);
		});
		
		beforeEach(() => {
			// Don't run recognize on every file
			Zotero.Prefs.set('autoRecognizeFiles', false);
			Zotero.Prefs.clear('autoRenameFiles');
			Zotero.Prefs.clear('autoRenameFiles.linked');
		});
		
		after(function* () {
			var defer = new Zotero.Promise.defer();
			httpd.stop(() => defer.resolve());
			yield defer.promise;
			
			Zotero.Prefs.clear('autoRecognizeFiles');
			Zotero.Prefs.clear('autoRenameFiles');
			Zotero.Prefs.clear('autoRenameFiles.linked');
		});
		
		it("should move a child item from one item to another", function* () {
			var collection = yield createDataObject('collection');
			yield waitForItemsLoad(win);
			var item1 = yield createDataObject('item', { title: "A", collections: [collection.id] });
			var item2 = yield createDataObject('item', { title: "B", collections: [collection.id] });
			var item3 = yield createDataObject('item', { itemType: 'note', parentID: item1.id });
			
			yield itemsView.selectItem(item3.id);
			
			var promise = itemsView.waitForSelect();
			
			drop(itemsView.getRowIndexByID(item2.id), 0, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'zotero/item';
					}
				},
				getData: function (type) {
					if (type == 'zotero/item') {
						return item3.id + "";
					}
				},
				mozItemCount: 1
			});
			
			yield promise;
			
			// Old parent should be empty
			assert.isFalse(itemsView.isContainerOpen(itemsView.getRowIndexByID(item1.id)));
			assert.isTrue(itemsView.isContainerEmpty(itemsView.getRowIndexByID(item1.id)));
			
			// New parent should be open
			assert.isTrue(itemsView.isContainerOpen(itemsView.getRowIndexByID(item2.id)));
			assert.isFalse(itemsView.isContainerEmpty(itemsView.getRowIndexByID(item2.id)));
		});
		
		it("should move a child item from last item in list to another", function* () {
			var collection = yield createDataObject('collection');
			yield waitForItemsLoad(win);
			var item1 = yield createDataObject('item', { title: "A", collections: [collection.id] });
			var item2 = yield createDataObject('item', { title: "B", collections: [collection.id] });
			var item3 = yield createDataObject('item', { itemType: 'note', parentID: item2.id });
			
			yield itemsView.selectItem(item3.id);
			
			var promise = itemsView.waitForSelect();
			
			drop(itemsView.getRowIndexByID(item1.id), 0, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'zotero/item';
					}
				},
				getData: function (type) {
					if (type == 'zotero/item') {
						return item3.id + "";
					}
				},
				mozItemCount: 1
			});
			
			yield promise;
			
			// Old parent should be empty
			assert.isFalse(itemsView.isContainerOpen(itemsView.getRowIndexByID(item2.id)));
			assert.isTrue(itemsView.isContainerEmpty(itemsView.getRowIndexByID(item2.id)));
			
			// New parent should be open
			assert.isTrue(itemsView.isContainerOpen(itemsView.getRowIndexByID(item1.id)));
			assert.isFalse(itemsView.isContainerEmpty(itemsView.getRowIndexByID(item1.id)));
		});
		
		it("should create a stored top-level attachment when a file is dragged", function* () {
			var file = getTestDataDirectory();
			file.append('test.png');
			
			var promise = itemsView.waitForSelect();
			
			drop(0, -1, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'application/x-moz-file';
					}
				},
				mozItemCount: 1,
				mozGetDataAt: function (type, i) {
					if (type == 'application/x-moz-file' && i == 0) {
						return file;
					}
				}
			})
			
			yield promise;
			// Attachment add triggers multiple notifications and multiple select events
			yield itemsView.waitForSelect();
			var items = itemsView.getSelectedItems();
			var path = yield items[0].getFilePathAsync();
			assert.equal(
				(yield Zotero.File.getBinaryContentsAsync(path)),
				(yield Zotero.File.getBinaryContentsAsync(file))
			);
		});
		
		it("should create a stored top-level attachment when a URL is dragged", function* () {
			var promise = itemsView.waitForSelect();
			
			drop(0, -1, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'text/x-moz-url';
					}
				},
				getData: function (type) {
					if (type == 'text/x-moz-url') {
						return pdfURL;
					}
				},
				mozItemCount: 1,
			})

			yield promise;
			var item = itemsView.getSelectedItems()[0];
			assert.equal(item.getField('url'), pdfURL);
			assert.equal(
				(yield Zotero.File.getBinaryContentsAsync(yield item.getFilePathAsync())),
				(yield Zotero.File.getBinaryContentsAsync(pdfPath))
			);
		});
		
		it("should create a stored child attachment when a URL is dragged", function* () {
			var view = zp.itemsView;
			var parentItem = yield createDataObject('item');
			var parentRow = view.getRowIndexByID(parentItem.id);
			
			var promise = waitForItemEvent('add');
			
			drop(parentRow, 0, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'text/x-moz-url';
					}
				},
				getData: function (type) {
					if (type == 'text/x-moz-url') {
						return pdfURL;
					}
				},
				mozItemCount: 1,
			})
			
			var itemIDs = yield promise;
			var item = Zotero.Items.get(itemIDs[0]);
			assert.equal(item.parentItemID, parentItem.id);
			assert.equal(item.getField('url'), pdfURL);
			assert.equal(
				(yield Zotero.File.getBinaryContentsAsync(yield item.getFilePathAsync())),
				(yield Zotero.File.getBinaryContentsAsync(pdfPath))
			);
		});
		
		it("should automatically retrieve metadata for top-level PDF if pref is enabled", async function () {
			Zotero.Prefs.set('autoRecognizeFiles', true);
			
			var view = zp.itemsView;
			
			var promise = waitForItemEvent('add');
			
			// Fake recognizer response
			Zotero.HTTP.mock = sinon.FakeXMLHttpRequest;
			var server = sinon.fakeServer.create();
			server.autoRespond = true;
			setHTTPResponse(
				server,
				ZOTERO_CONFIG.SERVICES_URL,
				{
					method: 'POST',
					url: 'recognizer/recognize',
					status: 200,
					headers: {
						'Content-Type': 'application/json'
					},
					json: {
						title: 'Test',
						authors: []
					}
				}
			);
			
			drop(0, -1, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'text/x-moz-url';
					}
				},
				getData: function (type) {
					if (type == 'text/x-moz-url') {
						return pdfURL;
					}
				},
				mozItemCount: 1,
			})
			
			// Wait for attachment item
			var attachmentIDs = await promise;
			// Wait for attachment item to be moved under new item
			await waitForItemEvent('add');
			await waitForItemEvent('modify');
			await waitForItemEvent('modify');
			
			assert.isFalse(Zotero.Items.get(attachmentIDs[0]).isTopLevelItem());
			
			Zotero.HTTP.mock = null;
		});
		
		it("should automatically retrieve metadata for multiple top-level PDFs if pref is enabled", async function () {
			Zotero.Prefs.set('autoRecognizeFiles', true);
			
			var view = zp.itemsView;
			
			var promise = waitForItemEvent('add');
			var recognizerPromise = waitForRecognizer();
			
			// Fake recognizer response
			Zotero.HTTP.mock = sinon.FakeXMLHttpRequest;
			var server = sinon.fakeServer.create();
			server.autoRespond = true;
			setHTTPResponse(
				server,
				ZOTERO_CONFIG.SERVICES_URL,
				{
					method: 'POST',
					url: 'recognizer/recognize',
					status: 200,
					headers: {
						'Content-Type': 'application/json'
					},
					json: {
						title: 'Test',
						authors: []
					}
				}
			);
			
			drop(0, -1, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'text/x-moz-url';
					}
				},
				getData: function (type) {
					if (type == 'text/x-moz-url') {
						return pdfURL;
					}
				},
				mozItemCount: 2,
			})
			
			var item1 = Zotero.Items.get((await promise)[0]);
			var item2 = Zotero.Items.get((await waitForItemEvent('add'))[0]);
			
			var progressWindow = await recognizerPromise;
			progressWindow.close();
			Zotero.ProgressQueues.get('recognize').cancel();
			assert.isFalse(item1.isTopLevelItem());
			assert.isFalse(item2.isTopLevelItem());
			
			Zotero.HTTP.mock = null;
		});
		
		it("should rename a stored child attachment using parent metadata if no existing file attachments and pref enabled", async function () {
			var view = zp.itemsView;
			var parentTitle = Zotero.Utilities.randomString();
			var parentItem = await createDataObject('item', { title: parentTitle });
			await Zotero.Attachments.linkFromURL({
				url: 'https://example.com',
				title: 'Example',
				parentItemID: parentItem.id
			});
			var parentRow = view.getRowIndexByID(parentItem.id);
			
			var file = getTestDataDirectory();
			file.append('empty.pdf');
			
			var promise = waitForItemEvent('add');
			
			drop(parentRow, 0, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'application/x-moz-file';
					}
				},
				mozItemCount: 1,
				mozGetDataAt: function (type, i) {
					if (type == 'application/x-moz-file' && i == 0) {
						return file;
					}
				}
			})
			
			var itemIDs = await promise;
			var item = Zotero.Items.get(itemIDs[0]);
			assert.equal(item.parentItemID, parentItem.id);
			var title = item.getField('title');
			var path = await item.getFilePathAsync();
			assert.equal(title, parentTitle + '.pdf');
			assert.equal(OS.Path.basename(path), parentTitle + '.pdf');
		});
		
		it("should rename a linked child attachment using parent metadata if no existing file attachments and pref enabled", async function () {
			Zotero.Prefs.set('autoRenameFiles.linked', true);
			
			var view = zp.itemsView;
			var parentTitle = Zotero.Utilities.randomString();
			var parentItem = await createDataObject('item', { title: parentTitle });
			await Zotero.Attachments.linkFromURL({
				url: 'https://example.com',
				title: 'Example',
				parentItemID: parentItem.id
			});
			var parentRow = view.getRowIndexByID(parentItem.id);
			
			var file = OS.Path.join(await getTempDirectory(), 'empty.pdf');
			await OS.File.copy(
				OS.Path.join(getTestDataDirectory().path, 'empty.pdf'),
				file
			);
			file = Zotero.File.pathToFile(file);
			
			var promise = waitForItemEvent('add');
			
			drop(parentRow, 0, {
				dropEffect: 'link',
				effectAllowed: 'link',
				types: {
					contains: function (type) {
						return type == 'application/x-moz-file';
					}
				},
				mozItemCount: 1,
				mozGetDataAt: function (type, i) {
					if (type == 'application/x-moz-file' && i == 0) {
						return file;
					}
				}
			})
			
			var itemIDs = await promise;
			var item = Zotero.Items.get(itemIDs[0]);
			assert.equal(item.parentItemID, parentItem.id);
			var title = item.getField('title');
			var path = await item.getFilePathAsync();
			assert.equal(title, parentTitle + '.pdf');
			assert.equal(OS.Path.basename(path), parentTitle + '.pdf');
		});
		
		it("shouldn't rename a linked child attachment using parent metadata if pref disabled", async function () {
			Zotero.Prefs.set('autoRenameFiles.linked', false);
			
			var view = zp.itemsView;
			var parentTitle = Zotero.Utilities.randomString();
			var parentItem = await createDataObject('item', { title: parentTitle });
			await Zotero.Attachments.linkFromURL({
				url: 'https://example.com',
				title: 'Example',
				parentItemID: parentItem.id
			});
			var parentRow = view.getRowIndexByID(parentItem.id);
			
			var file = OS.Path.join(await getTempDirectory(), 'empty.pdf');
			await OS.File.copy(
				OS.Path.join(getTestDataDirectory().path, 'empty.pdf'),
				file
			);
			file = Zotero.File.pathToFile(file);
			
			var promise = waitForItemEvent('add');
			
			drop(parentRow, 0, {
				dropEffect: 'link',
				effectAllowed: 'link',
				types: {
					contains: function (type) {
						return type == 'application/x-moz-file';
					}
				},
				mozItemCount: 1,
				mozGetDataAt: function (type, i) {
					if (type == 'application/x-moz-file' && i == 0) {
						return file;
					}
				}
			})
			
			var itemIDs = await promise;
			var item = Zotero.Items.get(itemIDs[0]);
			assert.equal(item.parentItemID, parentItem.id);
			var title = item.getField('title');
			var path = await item.getFilePathAsync();
			assert.equal(title, 'empty.pdf');
			assert.equal(OS.Path.basename(path), 'empty.pdf');
		});
		
		it("shouldn't rename a stored child attachment using parent metadata if pref disabled", async function () {
			Zotero.Prefs.set('autoRenameFiles', false);
			
			var view = zp.itemsView;
			var parentTitle = Zotero.Utilities.randomString();
			var parentItem = await createDataObject('item', { title: parentTitle });
			var parentRow = view.getRowIndexByID(parentItem.id);
			
			var originalFileName = 'empty.pdf';
			var file = getTestDataDirectory();
			file.append(originalFileName);
			
			var promise = waitForItemEvent('add');
			
			drop(parentRow, 0, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'application/x-moz-file';
					}
				},
				mozItemCount: 1,
				mozGetDataAt: function (type, i) {
					if (type == 'application/x-moz-file' && i == 0) {
						return file;
					}
				}
			})
			
			var itemIDs = await promise;
			var item = Zotero.Items.get(itemIDs[0]);
			assert.equal(item.parentItemID, parentItem.id);
			var title = item.getField('title');
			var path = await item.getFilePathAsync();
			// Should match original filename, not parent title
			assert.equal(title, originalFileName);
			assert.equal(OS.Path.basename(path), originalFileName);
		});
		
		it("shouldn't rename a stored child attachment using parent metadata if existing file attachments", async function () {
			var view = zp.itemsView;
			var parentTitle = Zotero.Utilities.randomString();
			var parentItem = await createDataObject('item', { title: parentTitle });
			await Zotero.Attachments.linkFromFile({
				file: OS.Path.join(getTestDataDirectory().path, 'test.png'),
				parentItemID: parentItem.id
			});
			var parentRow = view.getRowIndexByID(parentItem.id);
			
			var originalFileName = 'empty.pdf';
			var file = getTestDataDirectory();
			file.append(originalFileName);
			
			var promise = waitForItemEvent('add');
			
			drop(parentRow, 0, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'application/x-moz-file';
					}
				},
				mozItemCount: 1,
				mozGetDataAt: function (type, i) {
					if (type == 'application/x-moz-file' && i == 0) {
						return file;
					}
				}
			})
			
			var itemIDs = await promise;
			var item = Zotero.Items.get(itemIDs[0]);
			assert.equal(item.parentItemID, parentItem.id);
			var title = item.getField('title');
			var path = await item.getFilePathAsync();
			assert.equal(title, originalFileName);
			assert.equal(OS.Path.basename(path), originalFileName);
		});
		
		it("shouldn't rename a stored child attachment using parent metadata if drag includes multiple files", async function () {
			var view = zp.itemsView;
			var parentTitle = Zotero.Utilities.randomString();
			var parentItem = await createDataObject('item', { title: parentTitle });
			var parentRow = view.getRowIndexByID(parentItem.id);
			
			var originalFileName = 'empty.pdf';
			var file = getTestDataDirectory();
			file.append(originalFileName);
			
			var promise = waitForItemEvent('add');
			
			drop(parentRow, 0, {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				types: {
					contains: function (type) {
						return type == 'application/x-moz-file';
					}
				},
				mozItemCount: 2,
				mozGetDataAt: function (type, i) {
					if (type == 'application/x-moz-file' && i <= 1) {
						return file;
					}
				}
			})
			
			var itemIDs = await promise;
			var item = Zotero.Items.get(itemIDs[0]);
			assert.equal(item.parentItemID, parentItem.id);
			var title = item.getField('title');
			var path = await item.getFilePathAsync();
			assert.equal(title, originalFileName);
			assert.equal(OS.Path.basename(path), originalFileName);
		});
	});
})
