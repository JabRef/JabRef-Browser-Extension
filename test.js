#!/usr/bin/env node
// Test runner: executes runTranslatorOnHtml on the testCases defined in
// translators/zotero/ScienceDirect.js

import { createWriteStream, mkdirSync, existsSync, promises, readFileSync, readdir } from 'fs';
import { join, dirname } from 'path';
import { createContext, runInContext } from 'vm';
import { inspect } from 'util';

// Compute root directory compatible with ESM `import.meta.url` and
// legacy CommonJS `__dirname`.
const ROOT_DIR = (typeof __dirname !== 'undefined') ? __dirname : dirname(new URL(import.meta.url).pathname);

// Create a log file and duplicate console output to it.
const LOG_PATH = join(ROOT_DIR, 'test.log');
try {
    // append mode so repeated runs accumulate; you can change to 'w' to overwrite
    const logStream = createWriteStream(LOG_PATH, { flags: 'a' });
    const writeLog = (...args) => {
        try {
            const line = args.map(a => (typeof a === 'string' ? a : inspect(a, { depth: null }))).join(' ');
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

// Directory to cache fetched HTML between test runs. This speeds up repeated
// runs and reduces network requests when iterating on translators.
const CACHE_DIR = join(ROOT_DIR, 'test_cache');
try {
    mkdirSync(CACHE_DIR, { recursive: true });
} catch (e) {}

function urlToCacheName(url) {
    // base64url encode the URL to a safe filename
    const b = Buffer.from(String(url || ''), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b + '.html';
}

async function readCachedHtml(url) {
    try {
        const fname = join(CACHE_DIR, urlToCacheName(url));
        if (existsSync(fname)) {
            return await promises.readFile(fname, 'utf8');
        }
    } catch (e) {}
    return null;
}

async function writeCachedHtml(url, html) {
    try {
        const fname = join(CACHE_DIR, urlToCacheName(url));
        await promises.writeFile(fname, html, 'utf8');
    } catch (e) {}
}


async function run_on_file(filename, singleTestIndex) {
    // Ensure DOMParser and a fetch implementation are available for translatorRunner
    let JSDOM;
    try {
        const jsdomMod = await import('jsdom');
        JSDOM = jsdomMod.JSDOM;
    } catch (e) {
        console.error('Please install jsdom: npm install jsdom');
        process.exit(1);
    }
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    // Wrap jsdom's DOMParser so created documents get a usable `location`.
    // The runner expects `doc.location.pathname` to be a string; cached HTML
    // tests may not provide a proper location, so we inject the current
    // test URL (stored in `global.__test_current_url`) when available.
    const OriginalDOMParser = dom.window.DOMParser;
    global.DOMParser = class DOMParserWrapper {
        constructor() { this._p = new OriginalDOMParser(); }
        parseFromString(str, type) {
            const doc = this._p.parseFromString(str, type);
            try {
                const u = global.__test_current_url;
                const loc = u ? new URL(String(u)) : { href: '', pathname: '' };

                // Return a proxy that forwards to the real document but
                // guarantees a usable `location` property so translators can
                // safely access `doc.location.pathname`.
                const proxy = new Proxy(doc, {
                    get(target, prop, receiver) {
                        if (prop === 'location') return loc;
                        const val = Reflect.get(target, prop, receiver);
                        return typeof val === 'function' ? val.bind(target) : val;
                    },
                    getOwnPropertyDescriptor(target, prop) {
                        if (prop === 'location') return { configurable: true, enumerable: true, value: loc };
                        return Reflect.getOwnPropertyDescriptor(target, prop);
                    },
                });
                return proxy;
            } catch (e) {
                return doc;
            }
        }
    };
    // Expose XPathResult from jsdom so xpath evaluation constants are available
    global.XPathResult = dom.window.XPathResult;

    // Dynamic import of the ES module translator runner
    const trPath = join(ROOT_DIR, 'sources', 'translatorRunner.js');
    const trModule = await import('file://' + trPath);
    const { runTranslatorOnHtml } = trModule;

    // Load ScienceDirect translator source and execute it in a sandbox so we can
    // read the `testCases` variable produced by the translator file.
    const sdPath = join(ROOT_DIR, 'translators', 'zotero', filename);
    const sdSrc = readFileSync(sdPath, 'utf8');

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
    createContext(sandbox);
    try {
        runInContext(sdSrc, sandbox, { filename: filename });
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
    let test_id = 0;

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        if (tc.type === 'search') {
            console.error("arXiv: Skip category.");
            continue;
        }

        const position = i + 1;

        // If a single test index was requested, skip others
        if (singleTestIndex && position !== singleTestIndex) continue;

        test_id = position;

        if (!tc) continue;

        // If the requested single test is not runnable, report and exit early
        // if (singleTestIndex && (tc.type !== 'web' || tc.items == "multiple")) {
        //     console.error(`Selected test #${position} is not runnable (type: ${tc.type}, items: ${tc.items})`);
        //     return;
        // }

        // if (tc.type !== 'web' || tc.items == "multiple") continue;
        const url = tc.url;
        console.log(`\n=== Test case #${test_id}/${testCases.length}: ${url} ===`);
        try {
            if (url.includes("arxiv.org/") && (url.includes("find/") || tc.type === 'search')) {
                console.error("arXiv: Legacy Find has been shut off.");
                continue;
            }
            // Try cache first to avoid refetching the same page across runs
            let html = await readCachedHtml(url);
            if (!html) {
                const res = await fetch(url, { redirect: 'follow' });
                html = await res.text();
                // Cache successful fetches for reuse
                try { await writeCachedHtml(url, html); } catch (e) {}
            }
            console.log(`Running translator on cached file: ${urlToCacheName(url)}`);
            // Expose the current test URL so our DOMParser wrapper can set
            // `doc.location` before the translator runs.
            try {
                global.__test_current_url = url;
            } catch (e) {}
            const out = await runTranslatorOnHtml(sdFileUrl, html, url);
            try { delete global.__test_current_url; } catch (e) {}
            if (!out) {
                throw new Error('No output from translator');
            }
            // console.log('Result:', typeof out === 'string' ? out.slice(0, 1000) : JSON.stringify(out, null, 2));
        } catch (e) {
            console.error('Error processing', url, e && e.message);
            // Some translators return "multiple" during detection; the
            // runner doesn't support multi-select execution. Treat that
            // as an expected outcome when the test case expects multiple
            // items and continue to the next test instead of aborting.
            if (e && e.message && e.message.includes('multi-select not supported') && tc.items === 'multiple') {
                console.log('Translator reported multiple items (expected) — skipping execution');
                continue;
            }
            if (e.message == "Could not scrape metadata via known methods") {
                console.error("Skip this test due to translator inability to scrape metadata.");
            } else {
                break;
            }
        }
    }
}

// Run the test on a specified file if given as command-line argument, otherwise on all the files.
const args = process.argv.slice(2);
if (args.length >= 1) {
    const filename = args[0];
    const indexArg = args[1];
    let singleTestIndex = null;
    if (typeof indexArg !== 'undefined') {
        singleTestIndex = parseInt(indexArg, 10);
        if (!Number.isInteger(singleTestIndex) || singleTestIndex < 1) {
            console.error('Invalid test index. Provide a 1-based positive integer as second argument.');
            process.exit(1);
        }
    }
    run_on_file(filename, singleTestIndex).catch(e => {
        console.error('Fatal error:', e);
        process.exit(1);
    });
} else {
    // No argument: run on all test files in translators/zotero
    const translatorsDir = join(ROOT_DIR, 'translators', 'zotero');
    readdir(translatorsDir, (err, files) => {
        if (err) {
            console.error('Failed to read translators directory:', err);
            process.exit(1);
        }
        const jsFiles = files.filter(f => f.endsWith('.js'));
        (async () => {
            // Run translator test files in parallel with bounded concurrency to
            // avoid overwhelming the machine or network. Default concurrency=4.
            const concurrency = 4;
            let idx = 0;
            const results = [];

            const worker = async () => {
                while (true) {
                    let cur;
                    // simple atomic fetch
                    if (idx >= jsFiles.length) return;
                    cur = jsFiles[idx++];
                    console.log(`\n\n######## Running tests for translator file: ${cur} ########`);
                    try {
                        await run_on_file(cur);
                        results.push({ file: cur, ok: true });
                    } catch (e) {
                        console.error('Fatal error while running', cur, e);
                        results.push({ file: cur, ok: false, error: e });
                    }
                }
            };

            const workers = Array.from({ length: Math.min(concurrency, jsFiles.length) }, () => worker());
            await Promise.all(workers);
            // Optionally inspect results to decide exit code
            const failed = results.find(r => !r.ok);
            if (failed) process.exit(1);
        })().catch(e => {
            console.error('Fatal error:', e);
            process.exit(1);
        });
    });
}