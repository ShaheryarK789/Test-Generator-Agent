#!/usr/bin/env node
/**
 * Virtual QA Lead - Excel builder
 *
 * Usage:
 *   node build_testcases_xlsx.js <testcases.json> <output.xlsx> [--csv]
 *
 * Reads the test-case JSON (see references/json-schema.md) and writes a
 * review-ready, TestRail-friendly workbook:
 *   Dashboard            - summary tables + native Excel doughnut charts
 *   Functional Tests     - Positive / Negative / Corner / Boundary cases
 *   API Tests            - only if apiTestCases present
 *   Role-Based Tests     - only if roleTestCases present
 *   Permission Matrix    - only if roleMatrix present
 *   Traceability         - requirement -> test cases, coverage status
 *   Assumptions & Qs     - assumptions / open questions / out of scope
 * With --csv, also writes TestRail CSV import files next to the workbook.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

// ---------------------------------------------------------------- constants
const CATEGORIES = ['Positive', 'Negative', 'Corner', 'Boundary'];
const CRITICALITY = ['High', 'Medium', 'Low'];
const COLORS = {
  header: '1F3864', headerFont: 'FFFFFF', band: 'F2F5FA', border: 'C9D1DE',
  Positive: 'C6EFCE', Negative: 'FFC7CE', Corner: 'FFEB9C', Boundary: 'BDD7EE',
  High: 'F8696B', Medium: 'FFC000', Low: '92D050',
  Allowed: 'C6EFCE', Denied: 'FFC7CE',
};
// chart slice colours (validated categorical palette, colour-blind friendly order)
const CHART = {
  category: ['2E7D32', 'C62828', 'F9A825', '1565C0'],
  criticality: ['C62828', 'EF8F00', '7CB342'],
  suite: ['1F3864', '00897B', '8E24AA'],
  coverage: ['2E7D32', 'BDBDBD'],
};

// ---------------------------------------------------------------- helpers
function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }
const asArray = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const steps = (s) => asArray(s).map((x, i) => (/^\s*\d+[.)]/.test(x) ? x : `${i + 1}. ${x}`)).join('\n');
const text = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v));
const refs = (v) => asArray(v).join(', ');
function norm(value, allowed, fallback) {
  if (!value) return fallback;
  const hit = allowed.find((a) => a.toLowerCase() === String(value).trim().toLowerCase()
    || String(value).toLowerCase().startsWith(a.toLowerCase()));
  return hit || fallback;
}
function normalizeCase(tc, prefix, i) {
  return {
    ...tc,
    id: tc.id || `${prefix}-${String(i + 1).padStart(3, '0')}`,
    category: norm(tc.category, CATEGORIES, 'Positive'),
    criticality: norm(tc.criticality || tc.priority, CRITICALITY, 'Medium'),
    module: tc.module || tc.feature || 'General',
  };
}
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- sheet writer
function addTableSheet(wb, name, columns, rows, opts = {}) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1, xSplit: opts.freezeCols || 2 }],
    properties: { tabColor: { argb: 'FF' + (opts.tab || COLORS.header) } },
  });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
  const head = ws.getRow(1);
  head.height = 30;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF' + COLORS.headerFont } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.header } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  rows.forEach((r, idx) => {
    const row = ws.addRow(r);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = ['top', 'left', 'bottom', 'right'].reduce((o, k) => ((o[k] = { style: 'thin', color: { argb: 'FF' + COLORS.border } }), o), {});
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.band } };
      const key = columns[col - 1] && columns[col - 1].key;
      const val = String(cell.value || '');
      if ((key === 'category' || key === 'criticality' || key === 'access') && COLORS[val]) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS[val] } };
        cell.font = { bold: true };
        cell.alignment = { vertical: 'top', horizontal: 'center' };
      }
    });
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  // drop-down validation so reviewers keep values import-safe
  const dv = { category: CATEGORIES, criticality: CRITICALITY, status: ['Untested', 'Passed', 'Failed', 'Blocked', 'Retest'], access: ['Allowed', 'Denied'] };
  columns.forEach((c, i) => {
    if (!dv[c.key]) return;
    for (let r = 2; r <= Math.max(rows.length + 1, 2) + 200; r++) {
      ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: ['"' + dv[c.key].join(',') + '"'] };
    }
  });
  return ws;
}

// ---------------------------------------------------------------- column specs
const COMMON_TAIL = [
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Reviewer Comments', key: 'comments', width: 30 },
];
const FUNC_COLS = [
  { header: 'ID', key: 'id', width: 11 },
  { header: 'Title', key: 'title', width: 42 },
  { header: 'Section', key: 'section', width: 26 },
  { header: 'Module / Feature', key: 'module', width: 20 },
  { header: 'Category', key: 'category', width: 12 },
  { header: 'Criticality', key: 'criticality', width: 12 },
  { header: 'Type', key: 'type', width: 13 },
  { header: 'References', key: 'refs', width: 14 },
  { header: 'Preconditions', key: 'preconditions', width: 32 },
  { header: 'Test Data', key: 'testData', width: 28 },
  { header: 'Steps', key: 'steps', width: 50 },
  { header: 'Expected Result', key: 'expected', width: 45 },
  ...COMMON_TAIL,
];
const API_COLS = [
  { header: 'ID', key: 'id', width: 11 },
  { header: 'Title', key: 'title', width: 40 },
  { header: 'Section', key: 'section', width: 26 },
  { header: 'Method', key: 'method', width: 9 },
  { header: 'Endpoint', key: 'endpoint', width: 30 },
  { header: 'Category', key: 'category', width: 12 },
  { header: 'Criticality', key: 'criticality', width: 12 },
  { header: 'References', key: 'refs', width: 14 },
  { header: 'Preconditions / Auth', key: 'preconditions', width: 30 },
  { header: 'Headers', key: 'headers', width: 28 },
  { header: 'Request Body / Params', key: 'request', width: 38 },
  { header: 'Steps', key: 'steps', width: 40 },
  { header: 'Expected Status', key: 'expectedStatus', width: 11 },
  { header: 'Expected Response', key: 'expected', width: 42 },
  ...COMMON_TAIL,
];
const RBAC_COLS = [
  { header: 'ID', key: 'id', width: 11 },
  { header: 'Title', key: 'title', width: 42 },
  { header: 'Section', key: 'section', width: 26 },
  { header: 'Role', key: 'role', width: 16 },
  { header: 'Permission / Action', key: 'permission', width: 26 },
  { header: 'Expected Access', key: 'access', width: 12 },
  { header: 'Category', key: 'category', width: 12 },
  { header: 'Criticality', key: 'criticality', width: 12 },
  { header: 'References', key: 'refs', width: 14 },
  { header: 'Preconditions', key: 'preconditions', width: 30 },
  { header: 'Steps', key: 'steps', width: 48 },
  { header: 'Expected Result', key: 'expected', width: 45 },
  ...COMMON_TAIL,
];

const byCatThenCrit = (a, b) =>
  CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)
  || CRITICALITY.indexOf(a.criticality) - CRITICALITY.indexOf(b.criticality)
  || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

// ---------------------------------------------------------------- chart XML
function doughnutChartXml(title, sheet, catRange, valRange, colors) {
  const pts = colors.map((c, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('');
  const ref = (r) => `'${sheet.replace(/'/g, "''")}'!${r}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="1300" b="1"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:rPr><a:t>${xmlEsc(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:doughnutChart><c:varyColors val="1"/>
<c:ser><c:idx val="0"/><c:order val="0"/>
<c:tx><c:v>${xmlEsc(title)}</c:v></c:tx>
${pts}
<c:dLbls><c:numFmt formatCode="0%;;;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>
<c:cat><c:strRef><c:f>${ref(catRange)}</c:f></c:strRef></c:cat>
<c:val><c:numRef><c:f>${ref(valRange)}</c:f></c:numRef></c:val>
</c:ser>
<c:firstSliceAng val="0"/><c:holeSize val="55"/>
</c:doughnutChart>
<c:spPr><a:noFill/></c:spPr>
</c:plotArea>
<c:legend><c:legendPos val="r"/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="C9D1DE"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`;
}

function anchorXml(i, from, to) {
  return `<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdChart${i + 1}"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

/** Inject native doughnut charts into the first worksheet (Dashboard). */
async function injectCharts(xlsxPath, charts) {
  const zip = await JSZip.loadAsync(fs.readFileSync(xlsxPath));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const relsPath = 'xl/worksheets/_rels/sheet1.xml.rels';

  charts.forEach((c, i) => {
    zip.file(`xl/charts/chart${i + 1}.xml`, doughnutChartXml(c.title, c.sheet, c.cat, c.val, c.colors));
  });
  zip.file('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${charts.map((c, i) => anchorXml(i, c.from, c.to)).join('\n')}
</xdr:wsDr>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${charts.map((c, i) => `<Relationship Id="rIdChart${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('\n')}
</Relationships>`);

  // sheet rels
  let rels = zip.file(relsPath) ? await zip.file(relsPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  rels = rels.replace('</Relationships>', '<Relationship Id="rIdQaDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  zip.file(relsPath, rels);

  // <drawing> element must precede legacyDrawing / tableParts / extLst
  let sheet = await zip.file(sheetPath).async('string');
  if (!/xmlns:r=/.test(sheet.slice(0, 600))) {
    sheet = sheet.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  }
  const tag = '<drawing r:id="rIdQaDrawing1"/>';
  const m = sheet.match(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[\s>/]/);
  sheet = m ? sheet.slice(0, m.index) + tag + sheet.slice(m.index) : sheet.replace('</worksheet>', tag + '</worksheet>');
  zip.file(sheetPath, sheet);

  // content types
  let ct = await zip.file('[Content_Types].xml').async('string');
  const overrides = ['<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>']
    .concat(charts.map((c, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`));
  ct = ct.replace('</Types>', overrides.join('') + '</Types>');
  zip.file('[Content_Types].xml', ct);

  fs.writeFileSync(xlsxPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

// ---------------------------------------------------------------- CSV (TestRail)
function csvCell(v) { const s = text(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function writeCsv(file, header, rows) {
  const out = [header.map(csvCell).join(',')].concat(rows.map((r) => r.map(csvCell).join(','))).join('\r\n');
  fs.writeFileSync(file, '﻿' + out, 'utf8');
}

// ---------------------------------------------------------------- main
async function main() {
  const [, , inFile, outFile, ...flags] = process.argv;
  if (!inFile || !outFile) die('usage: node build_testcases_xlsx.js <testcases.json> <output.xlsx> [--csv]');
  let data;
  try { data = JSON.parse(fs.readFileSync(inFile, 'utf8').replace(/^﻿/, '')); } catch (e) { die('cannot read JSON: ' + e.message); }

  const func = asArray(data.testCases).map((t, i) => normalizeCase(t, 'TC', i)).sort(byCatThenCrit);
  const api = asArray(data.apiTestCases).map((t, i) => normalizeCase(t, 'API', i)).sort(byCatThenCrit);
  const rbac = asArray(data.roleTestCases).map((t, i) => ({ ...normalizeCase(t, 'RBAC', i), access: norm(t.access || t.expectedAccess, ['Allowed', 'Denied'], '') })).sort(byCatThenCrit);
  const all = [...func, ...api, ...rbac];
  if (!all.length) die('JSON contains no test cases (testCases / apiTestCases / roleTestCases).');

  // duplicate ID check
  const seen = new Set(); const dups = [];
  all.forEach((t) => (seen.has(t.id) ? dups.push(t.id) : seen.add(t.id)));
  if (dups.length) console.warn('WARNING: duplicate IDs: ' + [...new Set(dups)].join(', '));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Virtual QA Lead'; wb.created = new Date();
  const project = data.project || 'Project';

  // ---------- Dashboard (must be first sheet: charts are injected into sheet1)
  const dash = wb.addWorksheet('Dashboard', { properties: { tabColor: { argb: 'FF1F3864' } }, views: [{ showGridLines: false }] });
  dash.columns = [{ width: 24 }, { width: 11 }, { width: 3 }, { width: 24 }, { width: 11 }, { width: 3 }];
  dash.mergeCells('A1:N1');
  dash.getCell('A1').value = `${project} - Test Case Dashboard`;
  dash.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF1F3864' } };
  dash.mergeCells('A2:N2');
  dash.getCell('A2').value = `Generated ${new Date().toISOString().slice(0, 10)} by Virtual QA Lead`
    + (asArray(data.sourceDocuments).length ? `  |  Sources: ${asArray(data.sourceDocuments).join(', ')}` : '');
  dash.getCell('A2').font = { italic: true, color: { argb: 'FF595959' } };

  // requirement coverage
  const reqs = asArray(data.requirements);
  const refMap = {};
  all.forEach((t) => asArray(t.requirementRef || t.references).forEach((r) => { (refMap[r] = refMap[r] || []).push(t.id); }));
  const covered = reqs.filter((r) => refMap[r.id]).length;
  const uncovered = reqs.length - covered;

  const tables = [];
  let row = 4;
  function table(title, rowsData, col = 1) {
    const c0 = col, c1 = col + 1;
    const h = dash.getRow(row);
    h.getCell(c0).value = title; h.getCell(c1).value = 'Count';
    [c0, c1].forEach((c) => {
      const cell = h.getCell(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    });
    const start = row + 1;
    rowsData.forEach(([k, v], i) => {
      const r = dash.getRow(start + i);
      r.getCell(c0).value = k; r.getCell(c1).value = v;
      [c0, c1].forEach((c) => (r.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFC9D1DE' } } }));
    });
    const end = start + rowsData.length - 1;
    const tot = dash.getRow(end + 1);
    tot.getCell(c0).value = 'Total'; tot.getCell(c1).value = { formula: `SUM(${colL(c1)}${start}:${colL(c1)}${end})` };
    tot.getCell(c0).font = tot.getCell(c1).font = { bold: true };
    row = end + 3;
    return { cat: `$${colL(c0)}$${start}:$${colL(c0)}$${end}`, val: `$${colL(c1)}$${start}:$${colL(c1)}$${end}` };
  }
  const colL = (n) => String.fromCharCode(64 + n);

  const count = (arr, k, v) => arr.filter((t) => t[k] === v).length;
  tables.push({ title: 'Test Cases by Category', colors: CHART.category, ...table('Category', CATEGORIES.map((c) => [c, count(all, 'category', c)])) });
  tables.push({ title: 'Test Cases by Criticality', colors: CHART.criticality, ...table('Criticality', CRITICALITY.map((c) => [c, count(all, 'criticality', c)])) });
  const suites = [['Functional', func.length], ['API', api.length], ['Roles & Permissions', rbac.length]].filter(([, n]) => n > 0);
  tables.push({ title: 'Test Suite Distribution', colors: CHART.suite, ...table('Suite', suites) });
  if (reqs.length) {
    tables.push({ title: `Requirement Coverage (${Math.round((covered / reqs.length) * 100)}%)`, colors: CHART.coverage, ...table('Requirements', [['Covered', covered], ['Not covered', uncovered]]) });
  }

  // category x criticality matrix
  const mRow = row;
  const hdr = dash.getRow(mRow);
  ['Category \\ Criticality', ...CRITICALITY, 'Total'].forEach((v, i) => {
    const cell = hdr.getCell(i + 1); cell.value = v;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  });
  CATEGORIES.forEach((cat, i) => {
    const r = dash.getRow(mRow + 1 + i);
    r.getCell(1).value = cat;
    CRITICALITY.forEach((cr, j) => (r.getCell(j + 2).value = all.filter((t) => t.category === cat && t.criticality === cr).length));
    r.getCell(5).value = { formula: `SUM(B${mRow + 1 + i}:D${mRow + 1 + i})` };
  });
  dash.getColumn(3).width = 11; dash.getColumn(4).width = 11; dash.getColumn(5).width = 11;
  // (columns C-E reused by matrix; charts sit from column G onward)

  // ---------- Functional
  const section = (t, extra) => `${t.module}${extra ? ' > ' + extra : ''} > ${t.category}`;
  addTableSheet(wb, 'Functional Tests', FUNC_COLS, func.map((t) => ({
    id: t.id, title: t.title, section: section(t), module: t.module, category: t.category, criticality: t.criticality,
    type: t.type || 'Functional', refs: refs(t.requirementRef || t.references), preconditions: text(t.preconditions),
    testData: text(t.testData), steps: steps(t.steps), expected: text(t.expected || t.expectedResult), status: 'Untested', comments: '',
  })), { tab: '2E7D32' });

  // ---------- API
  if (api.length) {
    addTableSheet(wb, 'API Tests', API_COLS, api.map((t) => ({
      id: t.id, title: t.title, section: `API > ${t.module} > ${t.category}`, method: (t.method || '').toUpperCase(), endpoint: t.endpoint,
      category: t.category, criticality: t.criticality, refs: refs(t.requirementRef || t.references),
      preconditions: text(t.preconditions), headers: text(t.headers), request: text(t.requestBody || t.request || t.params),
      steps: steps(t.steps), expectedStatus: text(t.expectedStatus), expected: text(t.expectedResponse || t.expected), status: 'Untested', comments: '',
    })), { tab: '00897B' });
  }

  // ---------- Roles
  if (rbac.length) {
    addTableSheet(wb, 'Role-Based Tests', RBAC_COLS, rbac.map((t) => ({
      id: t.id, title: t.title, section: `Roles & Permissions > ${t.role || 'Role'} > ${t.category}`, role: t.role, permission: t.permission,
      access: t.access, category: t.category, criticality: t.criticality, refs: refs(t.requirementRef || t.references),
      preconditions: text(t.preconditions), steps: steps(t.steps), expected: text(t.expected || t.expectedResult), status: 'Untested', comments: '',
    })), { tab: '8E24AA' });
  }
  const matrix = data.roleMatrix;
  if (matrix && asArray(matrix.roles).length && asArray(matrix.permissions).length) {
    const cols = [{ header: 'Permission / Action', key: 'perm', width: 34 }, ...matrix.roles.map((r) => ({ header: r, key: 'r_' + r, width: 14 }))];
    const ws = addTableSheet(wb, 'Permission Matrix', cols, matrix.permissions.map((p) => {
      const o = { perm: p.name || p.permission };
      matrix.roles.forEach((r) => { const v = (p.access || {})[r]; o['r_' + r] = /^(y|yes|true|allow|allowed|✓)$/i.test(String(v)) ? 'Allowed' : v == null || v === '' ? '?' : /^(n|no|false|deny|denied)$/i.test(String(v)) ? 'Denied' : String(v); });
      return o;
    }), { tab: '8E24AA', freezeCols: 1 });
    ws.eachRow((r, i) => i > 1 && r.eachCell((cell, c) => {
      if (c > 1 && COLORS[cell.value]) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS[cell.value] } }; cell.alignment = { horizontal: 'center' }; }
    }));
  }

  // ---------- Traceability
  if (reqs.length) {
    addTableSheet(wb, 'Traceability', [
      { header: 'Requirement ID', key: 'id', width: 15 }, { header: 'Requirement', key: 'desc', width: 60 },
      { header: '# Tests', key: 'n', width: 9 }, { header: 'Linked Test Cases', key: 'tcs', width: 50 }, { header: 'Coverage', key: 'cov', width: 13 },
    ], reqs.map((r) => ({ id: r.id, desc: r.description || r.title || '', n: (refMap[r.id] || []).length, tcs: (refMap[r.id] || []).join(', '), cov: refMap[r.id] ? 'Covered' : 'NOT COVERED' })), { tab: '595959', freezeCols: 1 })
      .eachRow((r, i) => { if (i > 1) { const c = r.getCell(5); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.value === 'Covered' ? 'FFC6EFCE' : 'FFFFC7CE' } }; } });
  }

  // ---------- Assumptions
  const notes = [
    ...asArray(data.assumptions).map((x) => ({ type: 'Assumption', note: text(x) })),
    ...asArray(data.openQuestions).map((x) => ({ type: 'Open Question', note: text(x) })),
    ...asArray(data.outOfScope).map((x) => ({ type: 'Out of Scope', note: text(x) })),
  ];
  if (notes.length) addTableSheet(wb, 'Assumptions & Questions', [{ header: 'Type', key: 'type', width: 16 }, { header: 'Note', key: 'note', width: 100 }, { header: 'Answer / Decision', key: 'ans', width: 40 }], notes, { tab: 'BF9000', freezeCols: 1 });

  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  await wb.xlsx.writeFile(outFile);

  // ---------- charts: 2 per row, to the right of the tables (from column G)
  const charts = tables.map((t, i) => {
    const col = 6 + (i % 2) * 7, r0 = 3 + Math.floor(i / 2) * 18;
    return { title: t.title, sheet: 'Dashboard', cat: t.cat, val: t.val, colors: t.colors, from: { col, row: r0 }, to: { col: col + 7, row: r0 + 17 } };
  });
  await injectCharts(outFile, charts);

  // ---------- TestRail CSVs
  if (flags.includes('--csv')) {
    const base = outFile.replace(/\.xlsx$/i, '');
    const H = ['Title', 'Section', 'Type', 'Priority', 'References', 'Preconditions', 'Steps', 'Expected Result'];
    writeCsv(`${base}_testrail_functional.csv`, [...H, 'Test Data', 'Category', 'Source ID'],
      func.map((t) => [t.title, section(t), t.type || 'Functional', t.criticality, refs(t.requirementRef || t.references), text(t.preconditions), steps(t.steps), text(t.expected || t.expectedResult), text(t.testData), t.category, t.id]));
    if (api.length) writeCsv(`${base}_testrail_api.csv`, [...H, 'Category', 'Source ID'],
      api.map((t) => [t.title, `API > ${t.module} > ${t.category}`, 'Functional', t.criticality, refs(t.requirementRef || t.references),
        [text(t.preconditions), t.headers ? 'Headers: ' + text(t.headers) : ''].filter(Boolean).join('\n'),
        [`${(t.method || '').toUpperCase()} ${t.endpoint || ''}`, t.requestBody || t.request ? 'Body: ' + text(t.requestBody || t.request) : '', steps(t.steps)].filter(Boolean).join('\n'),
        [t.expectedStatus ? `Status ${t.expectedStatus}` : '', text(t.expectedResponse || t.expected)].filter(Boolean).join('\n'), t.category, t.id]));
    if (rbac.length) writeCsv(`${base}_testrail_roles.csv`, [...H, 'Category', 'Source ID'],
      rbac.map((t) => [t.title, `Roles & Permissions > ${t.role || 'Role'} > ${t.category}`, 'Security', t.criticality, refs(t.requirementRef || t.references),
        [t.role ? `Logged in as: ${t.role}` : '', text(t.preconditions)].filter(Boolean).join('\n'), steps(t.steps), text(t.expected || t.expectedResult), t.category, t.id]));
  }

  // ---------- summary
  const pc = (k, v) => `${v}:${count(all, k, v)}`;
  console.log(`OK  ${outFile}`);
  console.log(`    total=${all.length}  functional=${func.length}  api=${api.length}  roles=${rbac.length}`);
  console.log(`    ${CATEGORIES.map((c) => pc('category', c)).join('  ')}`);
  console.log(`    ${CRITICALITY.map((c) => pc('criticality', c)).join('  ')}`);
  if (reqs.length) console.log(`    coverage ${covered}/${reqs.length}` + (uncovered ? `  UNCOVERED: ${reqs.filter((r) => !refMap[r.id]).map((r) => r.id).join(', ')}` : ''));
}

main().catch((e) => die(e.stack || e.message));
