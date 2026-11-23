/**
 * QaseGenAI - Web UI server
 *   node web/server.js          -> http://localhost:4600
 *
 * Uploads requirement docs, runs the `qa-test-generator` skill through the
 * locally logged-in Claude Code CLI (`claude -p`, i.e. your Claude subscription),
 * streams progress over SSE, and serves the generated workbook / CSVs.
 */
'use strict';
const express = require('express');
const multer = require('multer');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4600);
const ROOT = path.resolve(__dirname, '..');
const UPLOADS = path.join(ROOT, 'uploads');
const OUTPUT = path.join(ROOT, 'output');
const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const ALLOWED_EXT = ['.pdf', '.docx', '.md', '.txt', '.html', '.htm', '.csv', '.json', '.xml', '.rtf'];
[UPLOADS, OUTPUT].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const app = express();
app.use(express.json({ limit: '2mb' }));
// no-cache so UI updates always show up on a normal refresh
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));

// ------------------------------------------------------------------ helpers
const jobs = new Map(); // id -> { meta, events[], clients:Set, proc }
const slugify = (s) => String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
const safeId = (id) => /^[a-z0-9-]{1,80}$/i.test(id);
const jobDir = (id) => path.join(OUTPUT, id);
const metaPath = (id) => path.join(jobDir(id), 'job.json');

function saveMeta(meta) { fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2)); }
function readMeta(id) {
  try { return JSON.parse(fs.readFileSync(metaPath(id), 'utf8')); } catch { /* legacy folder */ }
  const dir = jobDir(id);
  if (!fs.existsSync(dir)) return null;
  const stat = fs.statSync(dir);
  const hasJson = fs.readdirSync(dir).some((f) => f.endsWith('_testcases.json'));
  return { id, project: id.replace(/^sample-/, '').replace(/-/g, ' '), status: hasJson ? 'done' : 'unknown', createdAt: stat.mtime.toISOString(), sources: [] };
}
function listFiles(id) {
  const dir = jobDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f !== 'job.json' && f !== 'run.log' && !f.startsWith('~$'))
    .map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size, kind: f.endsWith('.xlsx') ? 'xlsx' : f.endsWith('.csv') ? 'csv' : f.endsWith('.json') ? 'json' : 'other' }))
    .sort((a, b) => ['xlsx', 'csv', 'json', 'other'].indexOf(a.kind) - ['xlsx', 'csv', 'json', 'other'].indexOf(b.kind) || a.name.localeCompare(b.name));
}
function emit(job, event) {
  event.t = Date.now();
  job.events.push(event);
  const line = `data: ${JSON.stringify(event)}\n\n`;
  job.clients.forEach((res) => res.write(line));
  fs.appendFile(path.join(jobDir(job.meta.id), 'run.log'), JSON.stringify(event) + '\n', () => {});
}

/** Turn a Claude tool call into a friendly progress line + pipeline stage. */
function describeTool(name, input = {}) {
  const base = (p) => (p ? path.basename(String(p)) : '');
  const cmd = String(input.command || '');
  if (name === 'Skill') return { stage: 1, text: `Loading skill "${input.skill || input.name || 'qa-test-generator'}"` };
  if (name === 'Read') {
    const f = String(input.file_path || '');
    if (/references[\\/]/.test(f)) return { stage: 1, text: `Studying ${base(f)}` };
    return { stage: 1, text: `Reading ${base(f)}` };
  }
  if (name === 'WebFetch') return { stage: 1, text: `Fetching ${input.url}` };
  if ((name === 'Bash' || name === 'PowerShell') && /extract_text/.test(cmd)) return { stage: 1, text: 'Extracting text from documents' };
  if ((name === 'Bash' || name === 'PowerShell') && /build_testcases_xlsx/.test(cmd)) return { stage: 3, text: 'Building Excel workbook, charts and TestRail CSVs' };
  if ((name === 'Bash' || name === 'PowerShell') && /npm (install|i)\b/.test(cmd)) return { stage: 0, text: 'Installing skill dependencies' };
  if (name === 'Write' || name === 'Edit') {
    const f = base(input.file_path);
    return { stage: /testcases\.json$/.test(f) ? 2 : 2, text: `${name === 'Write' ? 'Writing' : 'Refining'} ${f}` };
  }
  if (name === 'Glob' || name === 'Grep') return { stage: 1, text: `Searching ${input.pattern || ''}` };
  if (name === 'Bash' || name === 'PowerShell') return { stage: null, text: `Running: ${cmd.slice(0, 90)}` };
  return { stage: null, text: `${name}` };
}

function buildPrompt({ project, slug, outDirRel, sources, urls }) {
  return [
    'Use the qa-test-generator skill to act as Virtual QA Lead and generate a complete test-case workbook.',
    '',
    `Project name: ${project}`,
    'Requirement sources (read ALL of them):',
    ...sources.map((s) => `- ${s}`),
    ...urls.map((u) => `- Confluence/URL: ${u}`),
    '',
    'Output requirements:',
    `- Write the JSON to ${outDirRel}/${slug}_testcases.json`,
    `- Build with: node .claude/skills/qa-test-generator/scripts/build_testcases_xlsx.js ${outDirRel}/${slug}_testcases.json ${outDirRel}/${slug}_TestCases.xlsx --csv`,
    '- Include API test cases only if APIs are mentioned; include roles/permission matrix + role tests only if roles are mentioned.',
    '- Always fill "requirements" so coverage is computed. If the build reports UNCOVERED requirements, add cases and rebuild.',
    '- Work fully autonomously. Do not ask questions; record unknowns as openQuestions/assumptions.',
    '- Use the Bash tool to run node commands.',
    '- Finish with a 3-5 line plain-text summary (counts, coverage, top open questions).',
  ].join('\n');
}

function startJob(meta) {
  const job = { meta, events: [], clients: new Set(), proc: null, stage: 0 };
  jobs.set(meta.id, job);
  const prompt = buildPrompt(meta.run);
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'Skill',
    'Bash(node:*)', 'Bash(npm install:*)', 'Bash(ls:*)', 'Bash(mkdir:*)',
  ];
  emit(job, { type: 'stage', stage: 0, text: 'Starting Claude Code (your subscription)' });

  let proc;
  try {
    proc = spawn(CLAUDE, args, { cwd: ROOT, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0' } });
  } catch (e) {
    return finish(job, 'error', `Could not start the Claude CLI: ${e.message}`);
  }
  job.proc = proc;
  proc.stdin.write(prompt);
  proc.stdin.end();

  let buf = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) handleLine(job, line);
    }
  });
  proc.stderr.on('data', (c) => { stderr += c.toString(); });
  proc.on('error', (e) => finish(job, 'error', e.code === 'ENOENT'
    ? 'Claude CLI not found. Install Claude Code and run `claude` once to log in.' : e.message));
  proc.on('close', (code) => {
    if (job.meta.status !== 'running') return;
    const ok = listFiles(meta.id).some((f) => f.kind === 'xlsx');
    if (ok) finish(job, 'done', job.resultText || 'Completed');
    else finish(job, 'error', (job.resultText || stderr.trim() || `Claude exited with code ${code}`).slice(0, 1500));
  });
}

function handleLine(job, line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === 'system' && msg.subtype === 'init') {
    job.meta.model = msg.model;
    emit(job, { type: 'log', text: `Session started · model ${msg.model || 'default'}` });
  } else if (msg.type === 'assistant' && msg.message && Array.isArray(msg.message.content)) {
    for (const part of msg.message.content) {
      if (part.type === 'tool_use') {
        job.meta.toolCalls = (job.meta.toolCalls || 0) + 1;
        const d = describeTool(part.name, part.input);
        if (d.stage != null && d.stage > job.stage) { job.stage = d.stage; emit(job, { type: 'stage', stage: d.stage }); }
        emit(job, { type: 'log', tool: part.name, text: d.text });
      } else if (part.type === 'text' && part.text.trim()) {
        emit(job, { type: 'thought', text: part.text.trim().slice(0, 600) });
      }
    }
  } else if (msg.type === 'user' && msg.message && Array.isArray(msg.message.content)) {
    for (const part of msg.message.content) {
      if (part.type === 'tool_result') {
        const txt = Array.isArray(part.content) ? part.content.map((c) => c.text || '').join('') : String(part.content || '');
        if (/^OK\s+.*\.xlsx/m.test(txt)) emit(job, { type: 'log', tool: 'build', text: txt.split('\n').slice(0, 5).join(' · ').replace(/\s+/g, ' ') });
        if (part.is_error) emit(job, { type: 'log', tool: 'warn', text: txt.slice(0, 200) });
      }
    }
  } else if (msg.type === 'result') {
    job.resultText = msg.result || '';
    job.meta.costUsd = msg.total_cost_usd;
    job.meta.durationMs = msg.duration_ms;
    job.meta.numTurns = msg.num_turns;
    if (msg.is_error) emit(job, { type: 'log', tool: 'warn', text: String(msg.result || msg.subtype).slice(0, 300) });
  }
}

function finish(job, status, text) {
  if (job.meta.status !== 'running') return;
  job.meta.status = status;
  job.meta.finishedAt = new Date().toISOString();
  job.meta.summary = text;
  saveMeta(job.meta);
  if (status === 'done') emit(job, { type: 'stage', stage: 4 });
  emit(job, { type: status === 'done' ? 'done' : 'error', text });
  job.clients.forEach((res) => res.end());
  job.clients.clear();
}

// ------------------------------------------------------------------ routes
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { const d = path.join(UPLOADS, req.jobId); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => cb(null, path.basename(Buffer.from(file.originalname, 'latin1').toString('utf8')).replace(/[^\w.\- ()]+/g, '_')),
  }),
  limits: { fileSize: 30 * 1024 * 1024, files: 15 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase())),
});

app.get('/api/health', (req, res) => {
  execFile(CLAUDE, ['--version'], { timeout: 15000, windowsHide: true }, (err, stdout) => {
    res.json({ claude: !err, version: err ? null : stdout.trim(), error: err ? err.message : null });
  });
});

app.post('/api/jobs', (req, res, next) => {
  req.jobId = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;
  next();
}, upload.array('files', 15), (req, res) => {
  const id = req.jobId;
  const project = String(req.body.project || '').trim() || 'Untitled Project';
  const notes = String(req.body.notes || '').trim();
  const urls = String(req.body.urls || '').split(/[\s,]+/).filter((u) => /^https?:\/\//i.test(u)).slice(0, 10);
  const upDir = path.join(UPLOADS, id);
  fs.mkdirSync(upDir, { recursive: true });
  if (notes) fs.writeFileSync(path.join(upDir, 'pasted-requirements.txt'), notes, 'utf8');
  const files = fs.readdirSync(upDir);
  const inputs = files.map((f) => ({ name: f, size: fs.statSync(path.join(upDir, f)).size, kind: f === 'pasted-requirements.txt' && notes ? 'text' : 'file' }))
    .concat(urls.map((u) => ({ name: u, kind: 'url' })));
  if (!files.length && !urls.length) return res.status(400).json({ error: 'Add at least one file, some pasted text or a URL.' });

  fs.mkdirSync(jobDir(id), { recursive: true });
  const slug = slugify(project);
  const meta = {
    id, project, slug, status: 'running', createdAt: new Date().toISOString(),
    sources: [...files, ...urls], inputs,
    run: { project, slug, outDirRel: `output/${id}`, sources: files.map((f) => `uploads/${id}/${f}`), urls },
  };
  saveMeta(meta);
  startJob(meta);
  res.json({ id });
});

app.get('/api/jobs', (req, res) => {
  const list = fs.readdirSync(OUTPUT, { withFileTypes: true }).filter((d) => d.isDirectory() && safeId(d.name))
    .map((d) => { const live = jobs.get(d.name); return live ? live.meta : readMeta(d.name); })
    .filter(Boolean).map(({ run, ...m }) => m)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json(list);
});

app.get('/api/jobs/:id', (req, res) => {
  const { id } = req.params;
  if (!safeId(id)) return res.status(400).end();
  const live = jobs.get(id);
  const meta = live ? live.meta : readMeta(id);
  if (!meta) return res.status(404).json({ error: 'Not found' });
  const files = listFiles(id);
  let data = null;
  const jf = files.find((f) => f.name.endsWith('_testcases.json'));
  if (jf && meta.status !== 'running') {
    try { data = JSON.parse(fs.readFileSync(path.join(jobDir(id), jf.name), 'utf8').replace(/^﻿/, '')); } catch { /* partial */ }
  }
  const { run, ...pub } = meta;
  res.json({ meta: pub, files, data, events: live ? live.events : [] });
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  if (!job) { res.write(`data: ${JSON.stringify({ type: 'gone' })}\n\n`); return res.end(); }
  job.events.forEach((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
  if (job.meta.status !== 'running') return res.end();
  job.clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); job.clients.delete(res); });
});

app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.meta.status !== 'running') return res.status(404).json({ error: 'No running job' });
  if (job.proc) {
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(job.proc.pid), '/T', '/F'], () => {});
    else job.proc.kill('SIGTERM');
  }
  finish(job, 'error', 'Cancelled by user');
  res.json({ ok: true });
});

app.get('/api/jobs/:id/files/:name', (req, res) => {
  const { id, name } = req.params;
  if (!safeId(id) || name !== path.basename(name)) return res.status(400).end();
  const p = path.join(jobDir(id), name);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.download(p);
});

app.listen(PORT, () => {
  console.log(`\n  QaseGenAI  ->  http://localhost:${PORT}\n`);
});
