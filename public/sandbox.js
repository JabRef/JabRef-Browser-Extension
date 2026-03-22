// This file is used to share the Zotero sandbox environment with the extension's content scripts and translators.
// To enable this, the sandbox module must be shared with both context, and thus cannot be bundled/inlined.
// For this reason, this file is in `public` and will just be copied verbatim.

export let ZU;
export let Zotero;
export let Z;
export let requestJSON;
export let requestText;
export let text;
export let attr;
export let DOMParser;

export function setSandbox(sandbox) {
  ZU = sandbox.ZU;
  Zotero = sandbox.Zotero;
  Z = sandbox.Zotero;
  requestJSON = sandbox.requestJSON;
  requestText = sandbox.requestText;
  text = sandbox.text;
  attr = sandbox.attr;
  DOMParser = sandbox.DOMParser || DOMParser;
}
