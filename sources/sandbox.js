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
