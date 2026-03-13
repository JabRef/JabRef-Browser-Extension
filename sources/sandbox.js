export let ZU;
export let Zotero;
export let Z;
export let requestJSON;
export let requestText;
export let text;
export let attr;
export let DOMParser;

import "./zotero-utilities/xregexp-all.js";

export function setSandbox(sandbox) {
  ZU = sandbox.ZU;
  if (globalThis.XRegExp !== undefined) {
    // No idea why, but the XRegExp provided by the sandbox is not working
    // So let's overwrite it with a freshly imported one
    ZU.XRegExp = XRegExp;
  }
  Zotero = sandbox.Zotero;
  Z = sandbox.Zotero;
  requestJSON = sandbox.requestJSON;
  requestText = sandbox.requestText;
  text = sandbox.text;
  attr = sandbox.attr;
  DOMParser = sandbox.DOMParser || DOMParser;
}
