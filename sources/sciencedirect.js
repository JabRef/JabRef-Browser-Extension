export function exportUrlFromPii(pii) {
  const encoded = encodeURIComponent(pii);
  return `https://www.sciencedirect.com/sdfe/arp/cite?pii=${encoded}&format=text%2Fx-bibtex&withabstract=true`;
}

export async function fetchScienceDirectBib(pii) {
  const url = exportUrlFromPii(pii);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}
