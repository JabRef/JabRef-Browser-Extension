export async function fetchArxivBib(arxivId) {
  const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
  const resp = await fetch(apiUrl);
  if (!resp.ok) throw new Error(`arXiv API HTTP ${resp.status}`);
  const xmlText = await resp.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const entry = doc.querySelector('entry');
  if (!entry) throw new Error('arXiv API returned no entry');

  const getText = (sel) => {
    const node = entry.querySelector(sel);
    return node ? node.textContent.trim() : '';
  };

  const title = getText('title').replace(/\s+/g, ' ');
  const authorNodes = Array.from(entry.querySelectorAll('author > name'));
  const authors = authorNodes.map(n => n.textContent.trim()).join(' and ');
  const published = getText('published');
  const year = published ? published.slice(0,4) : '';
  const month = published ? new Date(published).toLocaleString('en-US', { month: 'short' }) : '';

  const doiNode = entry.getElementsByTagNameNS('*', 'doi')[0];
  const doi = doiNode ? doiNode.textContent.trim() : '';
  const journalNode = entry.getElementsByTagNameNS('*', 'journal_ref')[0];
  const journal_ref = journalNode ? journalNode.textContent.trim() : '';
  const commentNode = entry.getElementsByTagNameNS('*', 'comment')[0];
  const comment = commentNode ? commentNode.textContent.trim() : '';
  const primaryNode = entry.getElementsByTagNameNS('*', 'primary_category')[0];
  const primaryCategory = primaryNode ? (primaryNode.getAttribute('term') || primaryNode.textContent.trim()) : '';

  const categories = Array.from(entry.querySelectorAll('category'))
    .map(c => c.getAttribute('term'))
    .filter(Boolean)
    .join(', ');

  const idUrl = getText('id');

  let bibkey = arxivId.replace(/\//g, '_');
  if (authorNodes.length && year) {
    const lastName = authorNodes[0].textContent.trim().split(' ').slice(-1)[0];
    bibkey = `${lastName}${year}`;
  }

  const fields = [];
  if (authors) fields.push(`  author = {${authors}}`);
  if (title) fields.push(`  title = {${title}}`);
  if (journal_ref) fields.push(`  journal = {${journal_ref}}`);
  if (year) fields.push(`  year = {${year}}`);
  if (month) fields.push(`  month = {${month}}`);
  if (doi) fields.push(`  doi = {${doi}}`);
  if (idUrl) fields.push(`  url = {${idUrl}}`);
  if (comment) fields.push(`  note = {${comment}}`);
  fields.push(`  eprint = {${arxivId}}`);
  fields.push(`  archivePrefix = {arXiv}`);
  if (primaryCategory) fields.push(`  primaryClass = {${primaryCategory}}`);
  if (categories) fields.push(`  keywords = {${categories}}`);

  const bibtex = `@article{${bibkey},\n${fields.join(',\n')}\n}`;
  return bibtex;
}
