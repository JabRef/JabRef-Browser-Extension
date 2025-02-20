describe("Zotero.Utilities.Item", function () {
	describe("itemFromCSLJSON", function () {
		it("should stably perform itemToCSLJSON -> itemFromCSLJSON -> itemToCSLJSON", function () {
			let data = loadSampleData('citeProcJSExport');

			for (let i in data) {
				let json = data[i];

				// TEMP: https://github.com/zotero/zotero/issues/1667
				if (i == 'podcast') {
					delete json['collection-title'];
				}

				let item = newItem();
				Zotero.Utilities.Item.itemFromCSLJSON(item, json);

				let newJSON = Zotero.Utilities.Item.itemToCSLJSON(item);

				delete newJSON.id;
				delete json.id;

				assert.deepEqual(newJSON, json, i + ' export -> import -> export is stable');
			}

		});
		it("should recognize the legacy shortTitle key", function () {
			let data = loadSampleData('citeProcJSExport');

			var json = data.artwork;
			var canonicalKeys = Object.keys(json);
			json.shortTitle = json["title-short"];
			delete json["title-short"];

			let item = newItem();
			Zotero.Utilities.Item.itemFromCSLJSON(item, json);

			let newJSON = Zotero.Utilities.Item.itemToCSLJSON(item);
			assert.hasAllKeys(newJSON, canonicalKeys);
		});
		it("should import exported standalone note", function () {
			let note = newItem('note');
			note.note = 'Some note longer than 50 characters, which will become the title.';

			let jsonNote = Zotero.Utilities.Item.itemToCSLJSON(note);

			let item = newItem();
			Zotero.Utilities.Item.itemFromCSLJSON(item, jsonNote);

			assert.equal(item.title, jsonNote.title, 'title imported correctly');
		});
		it("should import exported standalone attachment", function () {
			let attachment = newItem('attachment');
			attachment.title = 'Empty';
			attachment.accessDate = '2001-02-03 12:13:14';
			attachment.url = 'http://example.com';
			attachment.note = 'Note';

			let jsonAttachment = Zotero.Utilities.Item.itemToCSLJSON(attachment);

			let item = newItem();
			Zotero.Utilities.Item.itemFromCSLJSON(item, jsonAttachment);

			assert.equal(item.title, jsonAttachment.title, 'title imported correctly');
		});
		// For Zotero.Item created in translation sandbox in connectors
		// Skip because test env doesn't have Zotero.Item anyway
		it.skip("should not depend on Zotero.Item existing", function () {
			let item = newItem();
			var Item = Zotero.Item;
			delete Zotero.Item;
			assert.throws(() => "" instanceof Zotero.Item);

			let data = loadSampleData('citeProcJSExport');
			assert.doesNotThrow(Zotero.Utilities.Item.itemFromCSLJSON.bind(Zotero.Utilities, item, Object.values(data)[0]));

			Zotero.Item = Item;
			assert.doesNotThrow(() => "" instanceof Zotero.Item);
		})
	});

	describe("itemToCSLJSON", function () {
		// Can't produce export format in test context
		it.skip("should accept Zotero.Item and Zotero export item format", async function () {
			let data = await populateDBWithSampleData(loadSampleData('journalArticle'));
			let item = await Zotero.Items.getAsync(data.journalArticle.id);

			let fromZoteroItem;
			try {
				fromZoteroItem = Zotero.Utilities.Item.itemToCSLJSON(item);
			} catch (e) {
				assert.fail(e, null, 'accepts Zotero Item');
			}
			assert.isObject(fromZoteroItem, 'converts Zotero Item to object');
			assert.isNotNull(fromZoteroItem, 'converts Zotero Item to non-null object');


			let fromExportItem;
			try {
				fromExportItem = Zotero.Utilities.Item.itemToCSLJSON(
					Zotero.Utilities.Internal.itemToExportFormat(item)
				);
			} catch (e) {
				assert.fail(e, null, 'accepts Zotero export item');
			}
			assert.isObject(fromExportItem, 'converts Zotero export item to object');
			assert.isNotNull(fromExportItem, 'converts Zotero export item to non-null object');

			assert.deepEqual(fromZoteroItem, fromExportItem, 'conversion from Zotero Item and from export item are the same');
		});
		it("should convert standalone notes to expected format", function () {
			let note = newItem('note');
			note.note = 'Some note longer than 50 characters, which will become the title.';

			let cslJSONNote = Zotero.Utilities.Item.itemToCSLJSON(note);
			assert.equal(cslJSONNote.type, 'document', 'note is exported as "document"');
			assert.equal(cslJSONNote.title, Zotero.Utilities.Item.noteToTitle(note.note), 'note title is set to Zotero pseudo-title');
		});
		it("should convert standalone attachments to expected format", function () {
			let attachment = newItem('attachment');
			attachment.title = 'Empty';
			attachment.accessDate = '2001-02-03 12:13:14';
			attachment.url = 'http://example.com';
			attachment.note = 'Note';

			let cslJSONAttachment = Zotero.Utilities.Item.itemToCSLJSON(attachment);
			assert.equal(cslJSONAttachment.type, 'document', 'attachment is exported as "document"');
			assert.equal(cslJSONAttachment.title, 'Empty', 'attachment title is correct');
			assert.deepEqual(cslJSONAttachment.accessed, { "date-parts": [["2001", 2, 3]] }, 'attachment access date is mapped correctly');
		});
		it("should refuse to convert unexpected item types", function () {
			let data = loadSampleData('journalArticle');
			let item = data.journalArticle;
			item.itemType = 'foo';

			assert.throws(Zotero.Utilities.Item.itemToCSLJSON.bind(Zotero.Utilities, item), /^Unexpected Zotero Item type ".*"$/, 'throws an error when trying to map invalid item types');
		});

		it("should parse particles in creator names", function () {
			let creators = [
				{
					// No particles
					firstName: 'John',
					lastName: 'Smith',
					creatorType: 'author',
					expect: {
						given: 'John',
						family: 'Smith'
					}
				},
				{
					// dropping and non-dropping
					firstName: 'Jean de',
					lastName: 'la Fontaine',
					creatorType: 'author',
					expect: {
						given: 'Jean',
						"dropping-particle": 'de',
						"non-dropping-particle": 'la',
						family: 'Fontaine'
					}
				},
				{
					// only non-dropping
					firstName: 'Vincent',
					lastName: 'van Gogh',
					creatorType: 'author',
					expect: {
						given: 'Vincent',
						"non-dropping-particle": 'van',
						family: 'Gogh'
					}
				},
				{
					// only dropping
					firstName: 'Alexander von',
					lastName: 'Humboldt',
					creatorType: 'author',
					expect: {
						given: 'Alexander',
						"dropping-particle": 'von',
						family: 'Humboldt'
					}
				},
				{
					// institutional author
					lastName: 'Jean de la Fontaine',
					creatorType: 'author',
					fieldMode: 1,
					expect: {
						literal: 'Jean de la Fontaine'
					}
				},
				{
					// protected last name
					firstName: 'Jean de',
					lastName: '"la Fontaine"',
					creatorType: 'author',
					expect: {
						given: 'Jean de',
						family: 'la Fontaine'
					}
				}
			];

			let item = newItem('journalArticle');
			item.creators = creators;
			let cslCreators = Zotero.Utilities.Item.itemToCSLJSON(item).author;

			assert.deepEqual(cslCreators[0], creators[0].expect, 'simple name is not parsed');
			assert.deepEqual(cslCreators[1], creators[1].expect, 'name with dropping and non-dropping particles is parsed');
			assert.deepEqual(cslCreators[2], creators[2].expect, 'name with only non-dropping particle is parsed');
			assert.deepEqual(cslCreators[3], creators[3].expect, 'name with only dropping particle is parsed');
			assert.deepEqual(cslCreators[4], creators[4].expect, 'institutional author is not parsed');
			assert.deepEqual(cslCreators[5], creators[5].expect, 'protected last name prevents parsing');
		});

		it("should convert UTC access date to local time", function () {
			var offset = new Date().getTimezoneOffset();
			var item = newItem('webpage');
			var localDate;
			if (offset < 0) {
				localDate = '2019-01-09 00:00:00';
			}
			else if (offset > 0) {
				localDate = '2019-01-09 23:59:59';
			}
			// Can't test timezone offset if in UTC
			else {
				this.skip();
			}
			var utcDate = Zotero.Date.sqlToDate(localDate);
			item.accessDate = Zotero.Date.dateToSQL(utcDate, true);
			let accessed = Zotero.Utilities.Item.itemToCSLJSON(item).accessed;

			assert.equal(accessed['date-parts'][0][0], 2019);
			assert.equal(accessed['date-parts'][0][1], 1);
			assert.equal(accessed['date-parts'][0][2], 9);
		});
	});


	describe("#noteToTitle()", function () {
		it("should stop after first block element with content", function () {
			var str = "<h1>Foo</h1><p>Bar</p>";
			var title = Zotero.Utilities.Item.noteToTitle(str, { stopAtLineBreak: true });
			assert.equal(title, 'Foo');
		});

		it("should skip first line if no content", function () {
			var str = "<blockquote>\n<p>Foo</p>\n</blockquote>\n<p>Bar</p>";
			var title = Zotero.Utilities.Item.noteToTitle(str);
			assert.equal(title, 'Foo');
		});

		it("should stop at <br/> when options.stopAtLineBreak is true", function () {
			var str = "<h1>Annotations<br/>(2/18/2022, 3:49:43 AM)</h1><p>Foo</p>";
			var title = Zotero.Utilities.Item.noteToTitle(str, { stopAtLineBreak: true });
			assert.equal(title, 'Annotations');
		});
	});


	describe("#compareCallNumbers()", function () {
		function checkSort(numbersInOrder) {
			let numbersResorted = [...numbersInOrder]
				.sort(() => Math.random() - 0.5) // First shuffle
				.sort(Zotero.Utilities.Item.compareCallNumbers); // Then re-sort
			assert.deepEqual(numbersResorted, numbersInOrder);
		}

		it("should correctly order integer call numbers", function () {
			let numbersInOrder = [
				'1',
				'2',
				'12',
				'20',
				'21',
				'100',
				'101',
			];
			checkSort(numbersInOrder);
		});

		it("should correctly order Dewey Decimal call numbers", function () {
			let numbersInOrder = [
				'641.5/Cor',
				'641.5/wol',
				'641.55541/Ray',
				'641.594/Mun',
				'641.5945/Foo',
				'641.596/Mon',
				'642.000/ABC',
			];
			checkSort(numbersInOrder);
		});

		it("should correctly order LC call numbers", function () {
			let numbersInOrder = [
				'PJ403.B64 C666',
				'PJ3930.S49 A53 2015',
				'PJ4519 .B9798 A58 1999',
				'PJ4519 .B99 A65 1976',
			];
			checkSort(numbersInOrder);

			numbersInOrder = [
				'PJ6611.B35 2014',
				'PJ6611 .Z36 2001',
			];
			checkSort(numbersInOrder);

			numbersInOrder = [
				'PC43 .O95 2016',
				'PC45 .P4 1976',
				'PC4074.7 .P46 2000',
				'PC4075',
				'PC4075 .P69 2001',
			];
			checkSort(numbersInOrder);
		});
		
		it("should correctly order RVK call numbers (Regensburger Verbundklassifikation)", function () {
			let numbersInOrder = [
				'NH 7000 T288-2,4,55',
				'NH 7000 T288-2,32,5',
				'NH 7000 T288-2,33,1',
				'NH 7000 T288-2,33,2',
				'NS 3293 W642-1',
				'NS 3293 W642-1+1',
				'NS 3293 W642-2',
				'NS 3293 W828',
				'NS 3293 W828(3)',
				'NS 3293 W828(20)',
				'PF 912',
				'PF 912.307',
				'PF 912.370'
			];
			checkSort(numbersInOrder);
		});
		
		it("should correctly order BK call numbers (Basisklassifikation)", function () {
			let numbersInOrder = [
				'24.99',
				'31',
				'31.01',
				'31.02',
				'31.10'
			];
			checkSort(numbersInOrder);
		});
	
		it("should correctly order call numbers containing a simple combination of a letter and an increasing number (numerus currens)", function () {
			let numbersInOrder = [
				'M 1',
				'M 2',
				'M 10',
				'M 10a',
				'M 11',
				'M 100 b'
			];
			checkSort(numbersInOrder);
			
			numbersInOrder = [
				'M1',
				'M2',
				'M10',
				'M10a',
				'M11',
				'M100b'
			];
			checkSort(numbersInOrder);
		});
	});

	describe("#languageToISO6391()", function () {
		it("should convert localized language names to ISO 639-1", function () {
			var language = 'French';
			language = Zotero.Utilities.Item.languageToISO6391(language);
			assert.equal(language, 'fr');

			language = 'francais'; // Diacritics are ignored
			language = Zotero.Utilities.Item.languageToISO6391(language)
			assert.equal(language, 'fr');

			language = 'foobar';
			language = Zotero.Utilities.Item.languageToISO6391(language)
			assert.equal(language, 'foobar');

			language = 'zh-Hans';
			language = Zotero.Utilities.Item.languageToISO6391(language)
			assert.equal(language, 'zh-Hans');

			language = 'العربية';
			language = Zotero.Utilities.Item.languageToISO6391(language)
			assert.equal(language, 'ar');

			// If Intl is unavailable, should return the input value
			let Intl = globalThis.Intl;
			globalThis.Intl = undefined;
			language = 'French';
			language = Zotero.Utilities.Item.languageToISO6391(language)
			assert.equal(language, 'French');
			globalThis.Intl = Intl;
		});

		it("should resolve underscore-separated codes", function () {
			var language = 'en_US';
			language = Zotero.Utilities.Item.languageToISO6391(language);
			assert.equal(language, 'en-US');

			language = 'zh_Hans';
			language = Zotero.Utilities.Item.languageToISO6391(language)
			assert.equal(language, 'zh-Hans');
		});

		it("should not modify input containing an underscore if it isn't a language code", function () {
			var language = 'some_other_underscore_stuff';
			language = Zotero.Utilities.Item.languageToISO6391(language)
			assert.equal(language, 'some_other_underscore_stuff');
		});
	});
});
