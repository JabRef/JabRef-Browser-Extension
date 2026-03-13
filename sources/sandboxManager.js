import { setSandbox } from "./sandbox.js";

/**
 * Manages the translator sandbox
 */
class SandboxManager {
  constructor() {
    this.sandbox = {
      Zotero: {},
      Promise,
    };
    this._moduleCache = new Map();
  }

  /**
   * Evaluates code in the sandbox
   * @param {string} code Code to evaluate
   * @param {string[]} functions Functions to import into the sandbox (rather than leaving as inner functions)
   * @param {string?} path The source path of the code being evaluated
   */
  eval(code, functions = [], path) {
    return this.importTranslatorByPath(path, functions);

    for (const fn of functions) {
      delete this.sandbox[fn];
    }

    for (const prop of Object.keys(this.sandbox)) {
      code = "var " + prop + " = this.sandbox." + prop + ";" + code;
    }

    for (const fn of functions) {
      if (fn === "detectExport") continue;
      try {
        code += "\nthis.sandbox." + fn + " = " + fn + ";";
      } catch (e) {
        // ignore
      }
    }

    if (path) {
      code += "\n//# sourceURL=" + encodeURI(path) + "\n";
    }

    (function () {
      eval(code);
    }).call(this);
  }

  /**
   * Imports an object into the sandbox
   * @param {Object} object Object to be imported (under attachTo)
   * @param {Boolean|Object} passTranslateAsFirstArgument Whether the translate instance should be passed as the first argument to the function.
   * @param {Object} attachTo An item from this.sandbox to which the object will be attached; defaults to this.sandbox.Zotero
   */
  importObject(object, passTranslateAsFirstArgument, attachTo = this.sandbox.Zotero) {
    const source = object.__exposedProps__ ? object.__exposedProps__ : object;
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      if (Function.prototype[key]) continue;
      if (typeof object[key] === "function" || typeof object[key] === "object") {
        const fn = object[key];
        attachTo[key] = (...args) => {
          const callArgs = passTranslateAsFirstArgument
            ? [passTranslateAsFirstArgument, ...args]
            : [...args];
          return fn.apply(object, callArgs);
        };

        this.importObject(
          object[key],
          passTranslateAsFirstArgument ? passTranslateAsFirstArgument : null,
          attachTo[key],
        );
      } else {
        attachTo[key] = object[key];
      }
    }
  }

  _resolvePath(path) {
    if (!path) throw new Error("No translator path provided");
    if (typeof browser !== "undefined" && browser.runtime?.getURL) {
      return browser.runtime.getURL(path);
    }
    return new URL(path, import.meta.url).href;
  }

  isModuleLoaded(path) {
    const url = this._resolvePath(path);
    const cached = this._moduleCache.get(url);
    return !!(cached && cached.loaded && cached.module);
  }

  async importTranslatorByPath(path, functions = []) {
    const url = this._resolvePath(path);

    let cached = this._moduleCache.get(url);
    if (!cached) {
      const promise = import(url).then((mod) => {
        cached.module = mod;
        cached.loaded = true;
        return mod;
      });
      cached = { promise, loaded: false, module: null };
      this._moduleCache.set(url, cached);
    }

    const mod = cached.loaded ? cached.module : await cached.promise;
    const exported = mod && mod.default ? mod.default : mod;

    // Clear old bindings and attach translator exports into the sandbox
    for (const fn of functions) {
      delete this.sandbox[fn];
    }

    for (const fn of functions) {
      if (exported && Object.prototype.hasOwnProperty.call(exported, fn)) {
        this.sandbox[fn] = (...args) => {
          // Prepend sandbox properties
          setSandbox(this.sandbox);
          return exported[fn].apply(this.sandbox, args);
        };
      }
    }

    // Not sure how this is used, but having an empty object seems to be okay
    this.sandbox.ZOTERO_TRANSLATOR_INFO = {};

    this.sandbox.exports =
      (exported && (exported.exports || (exported.default && exported.default.exports))) || {};

    return exported;
  }
}

Zotero.Translate.SandboxManager = SandboxManager;
