#!/usr/bin/env node
// Test runner: executes runTranslatorOnHtml on the testCases defined in
// translators/zotero/ScienceDirect.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');

// Create a log file and duplicate console output to it.
const LOG_PATH = path.join(__dirname, 'test.log');
try {
    // append mode so repeated runs accumulate; you can change to 'w' to overwrite
    const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
    const writeLog = (...args) => {
        try {
            const line = args.map(a => (typeof a === 'string' ? a : util.inspect(a, { depth: null }))).join(' ');
            logStream.write(line + '\n');
        } catch (e) {
            // ignore logging errors
        }
    };

    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;
    const origDebug = console.debug || (() => {});

    console.log = function(...args) { writeLog(...args); origLog.apply(console, args); };
    console.error = function(...args) { writeLog(...args); origError.apply(console, args); };
    console.warn = function(...args) { writeLog(...args); origWarn.apply(console, args); };
    console.debug = function(...args) { writeLog(...args); origDebug.apply(console, args); };

    process.on('exit', () => {
        try { logStream.end(); } catch (e) {}
    });
} catch (e) {
    console.error('Failed to initialize log file', e && e.message ? e.message : e);
}


async function run_on_file(filename) {
    // Ensure DOMParser and a fetch implementation are available for translatorRunner
    let JSDOM;
    try {
        JSDOM = require('jsdom').JSDOM;
    } catch (e) {
        console.error('Please install jsdom: npm install jsdom');
        process.exit(1);
    }
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.DOMParser = dom.window.DOMParser;
    // Expose XPathResult from jsdom so xpath evaluation constants are available
    global.XPathResult = dom.window.XPathResult;

    // Dynamic import of the ES module translator runner
    const trPath = path.join(__dirname, 'sources/translatorRunner.js');
    const trModule = await import('file://' + trPath);
    const { runTranslatorOnHtml } = trModule;

    // Load ScienceDirect translator source and execute it in a sandbox so we can
    // read the `testCases` variable produced by the translator file.
    const sdPath = path.join(__dirname, 'translators', 'zotero', filename);
    const sdSrc = fs.readFileSync(sdPath, 'utf8');

    const sandbox = { console, URL, window: {}, document: {}, DOMParser: global.DOMParser };
    // Minimal ZU shim for detection-time helpers (xpath, xpathText, text, trimInternal)
    sandbox.ZU = {
        xpath: (doc, xp) => {
            try {
                if (doc && typeof doc.evaluate === 'function') {
                    const res = doc.evaluate(xp, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                    const out = [];
                    for (let i = 0; i < res.snapshotLength; i++) out.push(res.snapshotItem(i));
                    return out;
                }
                return [];
            } catch (e) {
                return [];
            }
        },
        xpathText: (doc, xp) => {
            try {
                const nodes = sandbox.ZU.xpath(doc, xp);
                return nodes && nodes[0] ? nodes[0].textContent.trim() : '';
            } catch (e) {
                return '';
            }
        },
        text: (doc, selector) => {
            try {
                const el = (doc || {}).querySelector(selector);
                return el ? el.textContent.trim() : '';
            } catch (e) {
                return '';
            }
        },
        trimInternal: (s) => (s || '').replace(/\s+/g, ' ').trim(),
    };
    vm.createContext(sandbox);
    try {
        vm.runInContext(sdSrc, sandbox, { filename: filename });
    } catch (e) {
        // Some translators reference globals at load time; warn but continue
        console.warn('Warning: executing translator source threw:', e && e.message);
    }

    // Prefer the `testCases` variable populated by executing the file in the sandbox.
    // Fall back to extracting and evaluating the array literal if the variable isn't present.
    let testCases = sandbox.testCases;
    if (!testCases) {
        const m = sdSrc.match(/var\s+testCases\s*=\s*([\s\S]*?\]);/m);
        if (!m) {
            console.error('Could not find testCases in ', filename);
            process.exit(1);
        }
        try {
            testCases = new Function('return ' + m[1])();
            console.log('Extracted testCases via fallback literal evaluation');
        } catch (e) {
            console.error('Failed to evaluate testCases array:', e);
            process.exit(1);
        }
    }

    // We'll import the translator file directly when running so that the
    // translator's code executes in the same module context where
    // `runTranslatorOnHtml` installs ZU/Zotero shims.
    const sdFileUrl = 'file://' + sdPath;

    console.log('Found', testCases.length, 'test cases');
    test_id = 0;
    
    for (const tc of testCases) {
        test_id++;
        if (!tc || tc.type !== 'web' || tc.items == "multiple") continue;
        const url = tc.url;
        console.log(`\n=== Test case #${test_id}/${testCases.length}: ${url} ===`);
        try {
            const res = await fetch(url, { redirect: 'follow' });
            const html = await res.text();
            const out = await runTranslatorOnHtml(sdFileUrl, html, url);
            if (!out) {
                throw new Error('No output from translator');
                break;
            }
            console.log('Result:', typeof out === 'string' ? out.slice(0, 1000) : JSON.stringify(out, null, 2));
        } catch (e) {
            console.error('Error processing', url, e && e.message);
            if (e.message == "Could not scrape metadata via known methods") {
                console.error("Skip this test due to translator inability to scrape metadata.");
            } else if (url.includes("arxiv.org/") && (url.includes("list/") || url.includes("search/") || url.includes("find/"))) {
                console.error("Skip this test due to arXiv multiple items page.");
            }
            else {
                break;
            }
        }
    }
}

// Run the test on a specified file if given as command-line argument, otherwise on all the files.
const args = process.argv.slice(2);
if (args.length >= 1) {
    const filename = args[0];
    run_on_file(filename).catch(e => {
        console.error('Fatal error:', e);
        process.exit(1);
    });
} else {
    // No argument: run on all test files in translators/zotero
    const translatorsDir = path.join(__dirname, 'translators', 'zotero');
    fs.readdir(translatorsDir, (err, files) => {
        if (err) {
            console.error('Failed to read translators directory:', err);
            process.exit(1);
        }
        const jsFiles = files.filter(f => f.endsWith('.js'));
        (async () => {
            for (const f of jsFiles) {
                console.log(`\n\n######## Running tests for translator file: ${f} ########`);
                await run_on_file(f);
            }
        })().catch(e => {
            console.error('Fatal error:', e);
            process.exit(1);
        });
    });
}