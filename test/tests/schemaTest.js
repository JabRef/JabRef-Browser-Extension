describe("Zotero.Schema", function() {
	describe("#initializeSchema()", function () {
		it("should set last client version", function* () {
			yield resetDB({
				thisArg: this,
				skipBundledFiles: true
			});
			
			var sql = "SELECT value FROM settings WHERE setting='client' AND key='lastVersion'";
			var lastVersion = yield Zotero.DB.valueQueryAsync(sql);
			yield assert.eventually.equal(Zotero.DB.valueQueryAsync(sql), Zotero.version);
		});
	});
	
	describe("#updateSchema()", function () {
		it("should set last client version", function* () {
			var sql = "REPLACE INTO settings (setting, key, value) VALUES ('client', 'lastVersion', ?)";
			yield Zotero.DB.queryAsync(sql, "5.0old");
			
			yield Zotero.Schema.updateSchema();
			
			var sql = "SELECT value FROM settings WHERE setting='client' AND key='lastVersion'";
			var lastVersion = yield Zotero.DB.valueQueryAsync(sql);
			yield assert.eventually.equal(Zotero.DB.valueQueryAsync(sql), Zotero.version);
		});
	});
	
	describe("Global Schema", function () {
		var schemaJSON, schema;
		
		before(async function () {
			schemaJSON = await Zotero.File.getResourceAsync('resource://zotero/schema/global/schema.json');
		});
		
		beforeEach(async function () {
			await resetDB({
				thisArg: this,
				skipBundledFiles: true
			});
			schema = JSON.parse(schemaJSON);
		});
		
		after(async function() {
			await resetDB({
				thisArg: this,
				skipBundledFiles: true
			});
		});
		
		describe("#migrateExtraFields()", function () {
			async function migrate() {
				schema.version++;
				schema.itemTypes.find(x => x.itemType == 'book').fields.splice(0, 1, { field: 'fooBar' })
				var newLocales = {};
				Object.keys(schema.locales).forEach((locale) => {
					var o = schema.locales[locale];
					o.fields.fooBar = 'Foo Bar';
					newLocales[locale] = o;
				});
				await Zotero.Schema._updateGlobalSchemaForTest(schema);
				await Zotero.Schema.migrateExtraFields();
			}
			
			it("should add a new field and migrate values from Extra", async function () {
				var item = await createDataObject('item', { itemType: 'book' });
				item.setField('numPages', "10");
				item.setField('extra', 'Foo Bar: This is a value.\nnumber-of-pages: 11\nThis is another line.');
				item.synced = true;
				await item.saveTx();
				
				await migrate();
				
				assert.isNumber(Zotero.ItemFields.getID('fooBar'));
				assert.equal(Zotero.ItemFields.getLocalizedString('fooBar'), 'Foo Bar');
				assert.equal(item.getField('fooBar'), 'This is a value.');
				// Existing fields shouldn't be overwritten and should be left in Extra
				assert.equal(item.getField('numPages'), '10');
				assert.equal(item.getField('extra'), 'number-of-pages: 11\nThis is another line.');
				assert.isFalse(item.synced);
			});
			
			it("should migrate valid creator", async function () {
				var item = await createDataObject('item', { itemType: 'book' });
				item.setCreators([
					{
						firstName: 'Abc',
						lastName: 'Def',
						creatorType: 'author',
						fieldMode: 0
					}
				]);
				item.setField('extra', 'editor: Last || First\nFoo: Bar');
				item.synced = true;
				await item.saveTx();
				
				await migrate();
				
				var creators = item.getCreators();
				assert.lengthOf(creators, 2);
				assert.propertyVal(creators[0], 'firstName', 'Abc');
				assert.propertyVal(creators[0], 'lastName', 'Def');
				assert.propertyVal(creators[0], 'creatorTypeID', Zotero.CreatorTypes.getID('author'));
				assert.propertyVal(creators[1], 'firstName', 'First');
				assert.propertyVal(creators[1], 'lastName', 'Last');
				assert.propertyVal(creators[1], 'creatorTypeID', Zotero.CreatorTypes.getID('editor'));
				assert.equal(item.getField('extra'), 'Foo: Bar');
				assert.isFalse(item.synced);
			});
			
			it("shouldn't migrate creator not valid for item type", async function () {
				var item = await createDataObject('item', { itemType: 'book' });
				item.setCreators([
					{
						firstName: 'Abc',
						lastName: 'Def',
						creatorType: 'author',
						fieldMode: 0
					}
				]);
				item.setField('extra', 'container-author: Last || First\nFoo: Bar');
				item.synced = true;
				await item.saveTx();
				
				await migrate();
				
				var creators = item.getCreators();
				assert.lengthOf(creators, 1);
				assert.propertyVal(creators[0], 'firstName', 'Abc');
				assert.propertyVal(creators[0], 'lastName', 'Def');
				assert.propertyVal(creators[0], 'creatorTypeID', Zotero.CreatorTypes.getID('author'));
				assert.equal(item.getField('extra'), 'container-author: Last || First\nFoo: Bar');
				assert.isTrue(item.synced);
			});
			
			it("shouldn't migrate fields in read-only library", async function () {
				var library = await createGroup({ editable: false, filesEditable: false });
				var item = createUnsavedDataObject('item', { libraryID: library.libraryID, itemType: 'book' });
				item.setField('extra', 'Foo Bar: This is a value.');
				item.synced = true;
				await item.saveTx({
					skipEditCheck: true
				});
				
				await migrate();
				
				assert.isNumber(Zotero.ItemFields.getID('fooBar'));
				assert.equal(item.getField('fooBar'), '');
				assert.equal(item.getField('extra'), 'Foo Bar: This is a value.');
				assert.isTrue(item.synced);
			});
			
			it("should change item type if 'type:' is defined", async function () {
				var item = await createDataObject('item', { itemType: 'document' });
				item.setField('extra', 'type: personal_communication');
				item.synced = true;
				await item.saveTx();
				
				await migrate();
				
				assert.equal(item.itemTypeID, Zotero.ItemTypes.getID('letter'));
				assert.equal(item.getField('extra'), '');
				assert.isFalse(item.synced);
			});
			
			it("should remove 'type:' line for CSL type if item is the first mapped Zotero type", async function () {
				var item = await createDataObject('item', { itemType: 'letter' });
				item.setField('extra', 'type: personal_communication');
				item.synced = true;
				await item.saveTx();
				
				await migrate();
				
				assert.equal(item.itemTypeID, Zotero.ItemTypes.getID('letter'));
				assert.equal(item.getField('extra'), '');
				assert.isFalse(item.synced);
			});
			
			it("should remove 'type:' line for CSL type if item is a non-primary mapped Zotero type", async function () {
				var item = await createDataObject('item', { itemType: 'instantMessage' });
				item.setField('extra', 'type: personal_communication');
				item.synced = true;
				await item.saveTx();
				
				await migrate();
				
				assert.equal(item.itemTypeID, Zotero.ItemTypes.getID('instantMessage'));
				assert.equal(item.getField('extra'), '');
				assert.isFalse(item.synced);
			});
			
			it("should move existing fields that would be invalid in the new 'type:' type to Extra", async function () {
				var item = await createDataObject('item', { itemType: 'book' });
				item.setField('numPages', '123');
				item.setField('extra', 'type: article-journal\nJournal Abbreviation: abc.\nnumPages: 234');
				item.synced = true;
				await item.saveTx();
				
				await migrate();
				
				assert.equal(item.itemTypeID, Zotero.ItemTypes.getID('journalArticle'));
				assert.equal(item.getField('journalAbbreviation'), 'abc.');
				// Migrated real field should be placed at beginning, followed by unused line from Extra
				assert.equal(item.getField('extra'), 'Num Pages: 123\nnumPages: 234');
				assert.isFalse(item.synced);
			});
			
			it("shouldn't migrate invalid item type", async function () {
				var item = await createDataObject('item', { itemType: 'book' });
				item.setField('numPages', 30);
				item.setCreators(
					[
						{
							firstName: 'Abc',
							lastName: 'Def',
							creatorType: 'author',
							fieldMode: 0
						},
						{
							firstName: 'Ghi',
							lastName: 'Jkl',
							creatorType: 'author',
							fieldMode: 0
						}
					]
				);
				item.setField('extra', 'type: invalid');
				item.synced = true;
				await item.saveTx();
				
				await migrate();
				
				assert.equal(item.getField('numPages'), 30);
				var creators = item.getCreators();
				assert.lengthOf(creators, 2);
				assert.equal(item.itemTypeID, Zotero.ItemTypes.getID('book'));
				assert.equal(item.getField('extra'), 'type: invalid');
				assert.isTrue(item.synced);
			});
		});
	});
	
	
	describe("Repository Check", function () {
		describe("Notices", function () {
			var win;
			var server;
			
			before(async function () {
				// We need bundled files
				await resetDB({
					thisArg: this
				});
				
				win = await loadZoteroPane();
			});
			
			beforeEach(function () {
				Zotero.HTTP.mock = sinon.FakeXMLHttpRequest;
				server = sinon.fakeServer.create();
				server.autoRespond = true;
			});
			
			afterEach(function () {
				Zotero.Prefs.clear('hiddenNotices');
			});
			
			after(function () {
				win.close();
				Zotero.HTTP.mock = null;
			});
			
			function createResponseWithMessage(message) {
				server.respond(function (req) {
					if (req.method != "POST" || !req.url.includes('/repo/updated')) {
						return;
					}
					req.respond(
						200,
						{
							"Content-Type": "application/xml"
						},
						'<xml>'
							+ '<currentTime>1630219842</currentTime>'
							+ message
							+ '</xml>'
					);
				});
			}
			
			it("should show dialog if repo returns a message", async function () {
				createResponseWithMessage(
					`<message infoURL="https://example.com">This is a warning</message>`
				);
				
				var promise = waitForDialog(function (dialog) {
					var html = dialog.document.documentElement.outerHTML;
					assert.include(html, "This is a warning");
				});
				await Zotero.Schema.updateFromRepository(3);
				await promise;
				
				// Don't show id-less message again for a day
				var spy = sinon.spy(Zotero, 'debug');
				await Zotero.Schema.updateFromRepository(3);
				assert.notEqual(spy.args.findIndex(x => {
					return typeof x[0] == 'string' && x[0].startsWith("Not showing hidden");
				}), -1);
				spy.restore();
			});
			
			it("shouldn't show message with id again for 1 day even if not hidden", async function () {
				var id = Zotero.Utilities.randomString();
				createResponseWithMessage(
					`<message id="${id}" infoURL="https://example.com">This is a warning</message>`
				);
				
				var promise = waitForDialog();
				await Zotero.Schema.updateFromRepository(3);
				await promise;
				
				// Make sure notice is hidden for 1 day
				var hiddenNotices;
				var tries = 0;
				var ttl = 86400;
				while (tries < 100) {
					tries++;
					hiddenNotices = Zotero.Prefs.get('hiddenNotices');
					if (!hiddenNotices) {
						await Zotero.Promise.delay(10);
						continue;
					}
					hiddenNotices = JSON.parse(hiddenNotices);
					assert.property(hiddenNotices, id);
					assert.approximately(hiddenNotices[id], Math.round(Date.now() / 1000) + ttl, 10);
					break;
				}
			});
			
			it("shouldn't show message with id again for 30 days", async function () {
				var id = Zotero.Utilities.randomString();
				createResponseWithMessage(
					`<message id="${id}" infoURL="https://example.com">This is a warning</message>`
				);
				
				var promise = waitForDialog(function (dialog) {
					var doc = dialog.document;
					var innerHTML = doc.documentElement.innerHTML;
					assert.include(innerHTML, "This is a warning");
					assert.include(innerHTML, Zotero.getString('general.dontShowAgainFor', 30, 30));
					// Check "Don't show again"
					doc.getElementById('checkbox').click();
				});
				await Zotero.Schema.updateFromRepository(3);
				await promise;
				
				// Make sure notice is hidden for 30 days
				var hiddenNotices;
				var tries = 0;
				var ttl = 30 * 86400;
				while (tries < 100) {
					tries++;
					hiddenNotices = Zotero.Prefs.get('hiddenNotices');
					if (!hiddenNotices) {
						await Zotero.Promise.delay(10);
						continue;
					}
					hiddenNotices = JSON.parse(hiddenNotices);
					assert.property(hiddenNotices, id);
					assert.approximately(hiddenNotices[id], Math.round(Date.now() / 1000) + ttl, 10);
					break;
				}
			});
			
			it("shouldn't show message with id if before expiration", async function () {
				var id = Zotero.Utilities.randomString();
				createResponseWithMessage(
					`<message id="${id}" infoURL="https://example.com">This is a warning</message>`
				);
				
				// Set expiration for 30 days from now
				var ttl = 30 * 86400;
				Zotero.Prefs.set(
					'hiddenNotices',
					JSON.stringify({
						[id]: Math.round(Date.now() / 1000) + ttl
					})
				);
				
				// Message should be hidden
				var spy = sinon.spy(Zotero, 'debug');
				await Zotero.Schema.updateFromRepository(3);
				assert.notEqual(spy.args.findIndex(x => {
					return typeof x[0] == 'string' && x[0].startsWith("Not showing hidden");
				}), -1);
				spy.restore();
			});
		});
	});
	
	
	describe("#integrityCheck()", function () {
		before(function* () {
			yield resetDB({
				thisArg: this,
				skipBundledFiles: true
			});
		})
		
		it("should create missing tables unless 'skipReconcile' is true", async function () {
			await Zotero.DB.queryAsync("DROP TABLE retractedItems");
			assert.isFalse(await Zotero.DB.tableExists('retractedItems'));
			assert.isTrue(await Zotero.Schema.integrityCheck(false, { skipReconcile: true }));
			
			assert.isFalse(await Zotero.Schema.integrityCheck());
			assert.isTrue(await Zotero.Schema.integrityCheck(true));
			assert.isTrue(await Zotero.DB.tableExists('retractedItems'));
		});
		
		it("should repair a foreign key violation", function* () {
			yield assert.eventually.isTrue(Zotero.Schema.integrityCheck());
			
			yield Zotero.DB.queryAsync("PRAGMA foreign_keys = OFF");
			yield Zotero.DB.queryAsync("INSERT INTO itemTags VALUES (1234,1234,0)");
			yield Zotero.DB.queryAsync("PRAGMA foreign_keys = ON");
			
			yield assert.eventually.isFalse(Zotero.Schema.integrityCheck());
			yield assert.eventually.isTrue(Zotero.Schema.integrityCheck(true));
			yield assert.eventually.isTrue(Zotero.Schema.integrityCheck());
		})
		
		it("should repair invalid nesting between two collections", async function () {
			var c1 = await createDataObject('collection');
			var c2 = await createDataObject('collection', { parentID: c1.id });
			await Zotero.DB.queryAsync(
				"UPDATE collections SET parentCollectionID=? WHERE collectionID=?",
				[c2.id, c1.id]
			);
			
			await assert.isFalse(await Zotero.Schema.integrityCheck());
			await assert.isTrue(await Zotero.Schema.integrityCheck(true));
			await assert.isTrue(await Zotero.Schema.integrityCheck());
		});
		
		it("should repair invalid nesting between three collections", async function () {
			var c1 = await createDataObject('collection');
			var c2 = await createDataObject('collection', { parentID: c1.id });
			var c3 = await createDataObject('collection', { parentID: c2.id });
			await Zotero.DB.queryAsync(
				"UPDATE collections SET parentCollectionID=? WHERE collectionID=?",
				[c3.id, c2.id]
			);
			
			await assert.isFalse(await Zotero.Schema.integrityCheck());
			await assert.isTrue(await Zotero.Schema.integrityCheck(true));
			await assert.isTrue(await Zotero.Schema.integrityCheck());
		});
		
		it("should allow embedded-image attachments under notes", async function () {
			var item = await createDataObject('item', { itemType: 'note' });
			await createEmbeddedImage(item);
			await assert.isTrue(await Zotero.Schema.integrityCheck());
		});
	})
	
	describe("Database Upgrades", function () {
		after(async function () {
			await resetDB({
				thisArg: this,
				skipBundledFiles: true,
			});
		});
		
		it("should upgrade 4.0 database", async function () {
			await resetDB({
				thisArg: this,
				skipBundledFiles: true,
				dbFile: OS.Path.join(getTestDataDirectory().path, 'zotero-4.0.sqlite.zip')
			});
			// Make sure we can open the Zotero pane without errors
			win = await loadZoteroPane();
			win.close();
		});
	});
})
