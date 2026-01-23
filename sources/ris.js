export function parseRisToBib(risText) {
  const lines = risText.split(/\r?\n/);
  const record = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9]{2}) {2}-\s?(.*)$/);
    if (!m) continue;
    const tag = m[1];
    const value = m[2].trim();
    if (!record[tag]) record[tag] = [];
    record[tag].push(value);
  }

  // Map RIS tags to BibTeX fields
  const authors = (record["AU"] || record["A1"] || [])
    .map((a) => a.trim())
    .filter(Boolean);
  const title = (record["TI"] || record["T1"] || [""]).join(" ").trim();
  const journal = (record["JO"] || record["JF"] || record["JA"] || [])
    .join(" ")
    .trim();
  const yearRaw = (record["PY"] || record["Y1"] || []).join(" ").trim();
  const yearMatch = yearRaw.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : "";
  const volume = (record["VL"] || []).join(" ").trim();
  const issue = (record["IS"] || []).join(" ").trim();
  const start = (record["SP"] || []).join(" ").trim();
  const end = (record["EP"] || []).join(" ").trim();
  const pages = start && end ? `${start}--${end}` : start || "";
  const doi = (record["DO"] || []).join(" ").trim();
  const url = (record["UR"] || []).join(" ").trim();
  const publisher = (record["PB"] || []).join(" ").trim();
  const issn = (record["SN"] || []).join(" ").trim();
  const abstract = (record["AB"] || []).join(" ").trim();
  const note = (record["N1"] || []).join(" ").trim();

  const typeMap = {
    JOUR: "article",
    BOOK: "book",
    CHAP: "incollection",
    CONF: "inproceedings",
    THES: "phdthesis",
    RPRT: "techreport",
  };

  const risType = (record["TY"] && record["TY"][0]) || "";
  const entryType = typeMap[risType] || "article";

  // Citation key: LastNameYear or fallback to first author or "unknown"
  let bibkey = "unknown";
  if (authors.length) {
    const last = authors[0].split(/\s+/).slice(-1)[0];
    bibkey = last + (year || "");
  } else if (title) {
    bibkey = title.split(/\s+/)[0];
  }

  const fields = [];
  if (authors.length) fields.push(`  author = {${authors.join(" and ")}}`);
  if (title) fields.push(`  title = {${title}}`);
  if (journal) fields.push(`  journal = {${journal}}`);
  if (year) fields.push(`  year = {${year}}`);
  if (volume) fields.push(`  volume = {${volume}}`);
  if (issue) fields.push(`  number = {${issue}}`);
  if (pages) fields.push(`  pages = {${pages}}`);
  if (doi) fields.push(`  doi = {${doi}}`);
  if (url) fields.push(`  url = {${url}}`);
  if (publisher) fields.push(`  publisher = {${publisher}}`);
  if (issn) fields.push(`  issn = {${issn}}`);
  if (abstract) fields.push(`  abstract = {${abstract}}`);
  if (note) fields.push(`  note = {${note}}`);

  const bibtex = `@${entryType}{${bibkey},\n${fields.join(",\n")}\n}`;
  return bibtex;
}
