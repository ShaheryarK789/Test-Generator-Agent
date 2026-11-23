#!/usr/bin/env node
/**
 * Extract plain text from requirement documents.
 *   node extract_text.js <file> [<file> ...]  > requirements.txt
 * Supports: .pdf .docx .txt .md .csv .json .html/.htm (e.g. Confluence "Export to HTML/Word")
 * For Confluence URLs, let Claude fetch the page (WebFetch) or export it to PDF/Word first.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const stripHtml = (h) => h
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
  .replace(/<t[dh][^>]*>/gi, ' | ').replace(/<li[^>]*>/gi, '- ')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\n{3,}/g, '\n\n');

async function extract(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') {
    const pdf = require('pdf-parse/lib/pdf-parse.js');
    return (await pdf(fs.readFileSync(file))).text;
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    return stripHtml((await mammoth.convertToHtml({ path: file })).value);
  }
  if (ext === '.doc') throw new Error('.doc (legacy Word) not supported - save as .docx or PDF');
  const raw = fs.readFileSync(file, 'utf8');
  return /\.html?$/.test(ext) ? stripHtml(raw) : raw;
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node extract_text.js <file> [...]'); process.exit(1); }
  for (const f of files) {
    try { process.stdout.write(`\n===== SOURCE: ${path.basename(f)} =====\n${(await extract(f)).trim()}\n`); }
    catch (e) { console.error(`ERROR reading ${f}: ${e.message}`); process.exitCode = 1; }
  }
})();
