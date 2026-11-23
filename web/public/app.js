/* QaseGenAI - front end (vanilla JS, no build step) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
  const fmtSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const CATS = ['Positive', 'Negative', 'Corner', 'Boundary'];
  const CRITS = ['High', 'Medium', 'Low'];
  const CAT_COLOR = { Positive: '--cat-pos', Negative: '--cat-neg', Corner: '--cat-cor', Boundary: '--cat-bnd' };
  const CRIT_COLOR = { High: '--crit-high', Medium: '--crit-med', Low: '--crit-low' };

  const ICONS = {
    Read: '<path d="M4 5a2 2 0 0 1 2-2h8l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v6h6"/>',
    Write: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    Edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    Bash: '<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>',
    PowerShell: '<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>',
    WebFetch: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    Skill: '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>',
    Glob: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    Grep: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    build: '<path d="M20 6L9 17l-5-5"/>',
    warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    thought: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    stage: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    done: '<path d="M20 6L9 17l-5-5"/>',
    dl: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  };
  const icon = (k) => `<svg class="ic" viewBox="0 0 24 24">${ICONS[k] || ICONS.stage}</svg>`;

  Object.assign(ICONS, {
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M20 16.5v2a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-2"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><path d="M10 10h4v4h-4z"/>',
    files: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    chart: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    cases: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  });

  // ------------------------------------------------------------------ journey (main menu)
  const STAGES = [
    { id: 'input', group: 'input', label: 'Input', hint: 'Upload requirements', icon: 'upload', sec: 'sec-input' },
    { id: 'gen', group: 'process', label: 'Generate', hint: 'Claude designs the tests', icon: 'cpu', sec: 'sec-gen' },
    { id: 'files', group: 'output', label: 'Output files', hint: 'Excel + TestRail CSV', icon: 'files', sec: 'sec-files' },
    { id: 'report', group: 'output', label: 'Report', hint: 'Key numbers & summary', icon: 'report', sec: 'sec-report' },
    { id: 'charts', group: 'output', label: 'Charts', hint: 'Distribution & coverage', icon: 'chart', sec: 'sec-charts' },
    { id: 'cases', group: 'output', label: 'Test cases', hint: 'Browse & filter', icon: 'cases', sec: 'sec-cases' },
  ];
  const GROUPS = { input: 'Input', process: 'Process', output: 'Output' };
  const J = { view: 'upload', project: '', fileCount: 0, hasText: false, hasUrl: false, pct: 0, status: null, durationMs: 0, inputs: 0, res: null, viewing: null, jobId: null, recent: [] };
  const fmtDur = (ms) => { const s = Math.round((ms || 0) / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };

  function stageState(st) {
    const v = J.view;
    if (v === 'upload') {
      if (st.id === 'input') {
        const parts = [J.fileCount && `${J.fileCount} file${J.fileCount > 1 ? 's' : ''}`, J.hasText && 'text', J.hasUrl && 'links'].filter(Boolean);
        return { cls: 'current', small: parts.length ? `${parts.join(' + ')} ready ✓` : 'Add files to begin' };
      }
      if (st.id === 'gen') return { cls: 'locked', small: 'Starts when you click Generate' };
      return { cls: 'locked', small: 'Available after generation' };
    }
    if (v === 'run') {
      if (st.id === 'input') return { cls: 'done', small: `${J.inputs || 1} source${J.inputs === 1 ? '' : 's'} submitted` };
      if (st.id === 'gen') return { cls: 'current running', small: `Running · ${Math.floor(J.pct)}%` };
      return { cls: 'locked', small: 'Waiting for Claude…' };
    }
    // result
    const r = J.res || {};
    const failed = J.status === 'error';
    if (st.id === 'input') return { cls: 'done', small: `${J.inputs || 0} source${J.inputs === 1 ? '' : 's'}` };
    if (st.id === 'gen') return failed ? { cls: 'failed', small: 'Run failed, see details' } : { cls: 'done', small: J.durationMs ? `Done in ${fmtDur(J.durationMs)}` : 'Completed' };
    if (st.id === 'files') return r.files ? { cls: 'done', small: `${r.files} file${r.files > 1 ? 's' : ''} ready` } : { cls: 'locked', small: 'No files produced' };
    if (!r.cases) return { cls: 'locked', small: 'No data for this run' };
    if (st.id === 'report') return { cls: 'done', small: `${r.cases} cases${r.coverage != null ? ` · ${r.coverage}% coverage` : ''}` };
    if (st.id === 'charts') return { cls: 'done', small: `${r.charts} doughnut charts` };
    return { cls: 'done', small: `${r.cases} cases · ${r.tabs} tabs` };
  }

  function renderRail() {
    let lastGroup = null;
    const html = STAGES.map((st, i) => {
      const s = stageState(st);
      const viewing = J.view === 'result' && J.viewing === st.sec ? ' viewing' : '';
      const grp = st.group !== lastGroup ? `<li class="rail-group g-${st.group}"><span class="gpill"><span class="gdot"></span>${GROUPS[st.group]}</span></li>` : '';
      const gapNext = STAGES[i + 1] && STAGES[i + 1].group !== st.group ? ' gap-next' : '';
      lastGroup = st.group;
      const badge = s.cls.includes('done') ? icon('check') : s.cls.includes('failed') ? '!' : s.cls.includes('locked') ? icon('lock') : '';
      return `${grp}<li class="ri ${s.cls}${viewing}${gapNext}${i === STAGES.length - 1 ? ' last' : ''}" data-stage="${st.id}">
        <button type="button" title="${esc(st.hint)}"><span class="node">${icon(st.icon)}</span>
        <span class="rt"><b>${i + 1}. ${esc(st.label)}</b><small>${esc(s.small)}</small></span><span class="rs">${badge}</span></button></li>`;
    }).join('');
    $('#railList').innerHTML = html;
    // keep the highlighted item visible inside the rail (without scrolling the page)
    const hot = $('#railList .viewing, #railList .current');
    const rail = $('#rail');
    if (hot && rail.scrollHeight > rail.clientHeight && getComputedStyle(rail).flexDirection === 'column') {
      const top = hot.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop, bottom = top + hot.offsetHeight;
      if (top < rail.scrollTop + 60 || bottom > rail.scrollTop + rail.clientHeight - 20) rail.scrollTo({ top: Math.max(0, top - rail.clientHeight / 3), behavior: 'smooth' });
    }
    // progress
    const step = J.view === 'upload' ? 1 : J.view === 'run' ? 2 : 6;
    const pct = J.view === 'upload' ? (J.fileCount || J.hasText || J.hasUrl ? 14 : 5) : J.view === 'run' ? 17 + J.pct * 0.33 : 100;
    $('#railBar').style.width = `${pct}%`;
    $('#railBar').style.background = J.status === 'error' ? 'linear-gradient(90deg,#f87171,#fb923c)' : '';
    $('#railProgressText').textContent = J.view === 'upload' ? 'Step 1 of 6 · add your requirements'
      : J.view === 'run' ? `Step 2 of 6 · Claude is generating (${Math.floor(J.pct)}%)`
      : J.status === 'error' ? 'Run stopped · see Generate for details' : 'All 6 steps complete · review your outputs';
    $('#railProject').textContent = J.project || 'New run';
    $('#railRecent').innerHTML = J.recent.slice(0, 4).map((j) => `<li><a class="${j.id === J.jobId ? 'on' : ''}" href="#/job/${encodeURIComponent(j.id)}"><span class="hs hs-${esc(j.status)}"></span><span class="nm">${esc(j.project)}</span></a></li>`).join('') || '<li class="muted small" style="padding:6px 8px">No runs yet</li>';
  }

  function railToast(li, text) {
    li.classList.remove('shake'); void li.offsetWidth; li.classList.add('shake');
    const t = document.createElement('div');
    t.className = 'rail-toast'; t.textContent = text;
    const r = li.getBoundingClientRect(); t.style.top = `${r.top + 8}px`;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  $('#railList').addEventListener('click', (e) => {
    const li = e.target.closest('.ri'); if (!li) return;
    const st = STAGES.find((s) => s.id === li.dataset.stage);
    if (li.classList.contains('locked')) return railToast(li, J.view === 'run' ? 'Unlocks as soon as Claude finishes' : 'Upload requirements and click Generate first');
    if (J.view === 'upload') { $('.fstep-upload').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (J.view === 'run') { if (st.id === 'gen') $('#feed').scrollIntoView({ behavior: 'smooth', block: 'center' }); else railToast(li, 'Inputs submitted ✓'); return; }
    const sec = $(`#${st.sec}`); if (sec && !sec.hidden) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ------------------------------------------------------------------ state
  let files = [];
  let es = null;
  let timer = null;
  let current = null; // { data, view: {tab, q, cats:Set, crits:Set} }

  // ------------------------------------------------------------------ router
  let keepScroll = false;
  function show(view) { ['upload', 'run', 'result'].forEach((v) => ($(`#view-${v}`).hidden = v !== view)); if (!keepScroll) window.scrollTo({ top: 0, behavior: 'smooth' }); }

  // ------------------------------------------------------------------ theme toggle
  let lastJob = null;
  const themeBtn = $('#themeToggle');
  const syncThemeBtn = () => { const light = document.documentElement.dataset.theme === 'light'; themeBtn.setAttribute('aria-checked', String(light)); themeBtn.title = light ? 'Switch to dark mode' : 'Switch to light mode'; };
  syncThemeBtn();
  themeBtn.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.classList.add('theme-anim');
    root.dataset.theme = next;
    try { localStorage.setItem('qa-theme', next); } catch { /* storage blocked: theme still applies for this visit */ }
    syncThemeBtn();
    setTimeout(() => root.classList.remove('theme-anim'), 450);
    // charts read their colours from CSS tokens: re-render results in place
    if (lastJob && !$('#view-result').hidden) { const y = scrollY; keepScroll = true; renderResult(lastJob); keepScroll = false; window.scrollTo(0, y); }
  });
  async function route() {
    if (es) { es.close(); es = null; }
    clearInterval(timer);
    const m = location.hash.match(/^#\/job\/([\w-]+)/);
    if (!m) {
      Object.assign(J, { view: 'upload', jobId: null, status: null, res: null, pct: 0, project: $('#project').value.trim() });
      updateReady();
      return show('upload');
    }
    const res = await fetch(`/api/jobs/${m[1]}`);
    if (!res.ok) { location.hash = '#/'; return; }
    const job = await res.json();
    if (job.meta.status === 'running') startRunView(job);
    else renderResult(job);
  }
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------------ health
  fetch('/api/health').then((r) => r.json()).then((h) => {
    const el = $('#health');
    el.className = `pill ${h.claude ? 'pill-ok' : 'pill-bad'}`;
    el.lastElementChild.textContent = h.claude ? `Claude connected · ${String(h.version).split(' ')[0]}` : 'Claude CLI not found';
    el.title = h.claude ? h.version : 'Install Claude Code and run `claude` once to log in';
  }).catch(() => {});

  // ------------------------------------------------------------------ upload
  const dz = $('#dropzone');
  const input = $('#fileInput');
  const okExt = /\.(pdf|docx|md|txt|html?|csv|json|xml|rtf)$/i;
  function addFiles(list) {
    const rejected = [];
    [...list].forEach((f) => {
      if (!okExt.test(f.name)) return rejected.push(f.name);
      if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
    });
    files = files.slice(0, 15);
    renderFiles();
    $('#formError').textContent = rejected.length ? `Unsupported: ${rejected.join(', ')} (legacy .doc → save as .docx or PDF)` : '';
  }
  function updateReady() {
    const n = files.length, notes = $('#notes').value.trim(), urls = $('#urls').value.trim();
    const parts = [n ? `${n} file${n > 1 ? 's' : ''}` : '', notes ? 'pasted text' : '', urls ? 'link(s)' : ''].filter(Boolean);
    const el = $('#readyText');
    el.classList.toggle('ok', parts.length > 0);
    el.textContent = parts.length ? `✓ Ready: ${parts.join(' + ')}` : 'Add at least one file, some text or a link to start.';
    Object.assign(J, { fileCount: n, hasText: !!notes, hasUrl: !!urls });
    if (J.view === 'upload') renderRail();
  }
  function renderFiles() {
    const n = files.length;
    const total = files.reduce((s, f) => s + f.size, 0);
    $('#fileTray').hidden = n === 0;
    $('#trayTitle').innerHTML = `Selected files <small>${n} of 15 · ${fmtSize(total)}</small>`;
    const badge = $('#fileCountBadge');
    badge.textContent = n ? `${n} file${n > 1 ? 's' : ''} added` : 'No files yet';
    badge.classList.toggle('has', n > 0);
    dz.classList.toggle('compact', n > 0);
    $('.dz-title').textContent = n ?'Drop more files here to add them' : 'Drop one or more requirement files here';
    updateReady();
    $('#fileList').innerHTML = files.map((f, i) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const cls = ['pdf', 'docx', 'txt', 'md', 'html', 'htm', 'xml', 'csv', 'json'].includes(ext) ? ext : 'other';
      return `<li class="file"><span class="fnum">${i + 1}</span><span class="ftype ft-${cls}">${esc(ext.toUpperCase().slice(0, 4))}</span>
        <div class="fmeta"><div class="fname" title="${esc(f.name)}">${esc(f.name)}</div><div class="fsize">${fmtSize(f.size)}</div></div>
        <button type="button" class="fdel" data-i="${i}" aria-label="Remove ${esc(f.name)}">✕</button></li>`;
    }).join('');
  }
  $('#fileList').addEventListener('click', (e) => { const b = e.target.closest('.fdel'); if (b) { files.splice(+b.dataset.i, 1); renderFiles(); } });
  $('#addMoreBtn').addEventListener('click', () => input.click());
  $('#clearFilesBtn').addEventListener('click', () => { files = []; renderFiles(); });
  ['#notes', '#urls'].forEach((s) => $(s).addEventListener('input', updateReady));
  $('#project').addEventListener('input', (e) => { J.project = e.target.value.trim(); renderRail(); });
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); if (t === 'drop' || !dz.contains(e.relatedTarget)) dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { if (!dz.contains(e.target) && !$('#view-upload').hidden) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

  $('#uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const notes = $('#notes').value.trim();
    const urls = $('#urls').value.trim();
    if (!files.length && !notes && !urls) { $('#formError').textContent = 'Add at least one document, some pasted requirements or a URL.'; dz.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 }); return; }
    const fd = new FormData();
    fd.append('project', $('#project').value.trim() || (files[0] ? files[0].name.replace(/\.[^.]+$/, '') : 'Untitled Project'));
    fd.append('notes', notes); fd.append('urls', urls);
    files.forEach((f) => fd.append('files', f, f.name));
    const btn = $('#generateBtn'); btn.disabled = true;
    try {
      const r = await fetch('/api/jobs', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      files = []; renderFiles(); $('#notes').value = ''; $('#urls').value = ''; $('#project').value = '';
      location.hash = `#/job/${j.id}`;
      loadHistory();
    } catch (err) { $('#formError').textContent = err.message; }
    finally { btn.disabled = false; }
  });

  // ------------------------------------------------------------------ running
  const STAGE_PCT = [4, 22, 60, 88, 100];
  function startRunView(job) {
    show('run');
    Object.assign(J, { view: 'run', jobId: job.meta.id, project: job.meta.project, status: 'running', pct: 0, inputs: arr(job.meta.inputs || job.meta.sources).length });
    renderRail();
    $('#runProject').textContent = job.meta.project;
    $('#runTitle').textContent = 'Generating test cases';
    $('#feed').innerHTML = '';
    $('.orb').classList.remove('done');
    setStage(0);
    const t0 = new Date(job.meta.createdAt).getTime();
    const tick = () => { const s = Math.max(0, Math.floor((Date.now() - t0) / 1000)); $('#runTimer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
    tick(); timer = setInterval(tick, 1000);
    let pct = 0;
    const creep = setInterval(() => { // slow creep inside a stage so the orb never looks frozen
      const st = +($('#stepper').dataset.stage || 0);
      const cap = STAGE_PCT[Math.min(st + 1, 4)] - 2;
      if (pct < cap) { pct += Math.max(0.15, (cap - pct) * 0.02); $('#runPct').textContent = `${Math.floor(pct)}%`; }
      if (Math.floor(pct) !== Math.floor(J.pct)) { J.pct = pct; renderRail(); }
    }, 400);
    $('#cancelBtn').onclick = async () => { await fetch(`/api/jobs/${job.meta.id}`, { method: 'DELETE' }); };

    es = new EventSource(`/api/jobs/${job.meta.id}/events`);
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      if (ev.type === 'stage') { setStage(ev.stage); pct = Math.max(pct, STAGE_PCT[ev.stage]); $('#runPct').textContent = `${Math.floor(pct)}%`; if (ev.text) feed('stage', ev.text, ev.t); }
      else if (ev.type === 'log') feed(ev.tool || 'stage', ev.text, ev.t);
      else if (ev.type === 'thought') feed('thought', ev.text, ev.t);
      else if (ev.type === 'done' || ev.type === 'error' || ev.type === 'gone') {
        es.close(); es = null; clearInterval(timer); clearInterval(creep);
        if (ev.type === 'error') { feed('error', ev.text, ev.t); $('#runTitle').textContent = 'Run failed'; $('.orb').classList.add('done'); }
        else { feed('done', 'Workbook ready, opening results…', ev.t); $('#runPct').textContent = '100%'; $('.orb').classList.add('done'); }
        loadHistory();
        setTimeout(() => route(), ev.type === 'error' ? 2500 : 900);
      }
    };
  }
  function setStage(n) {
    $('#stepper').dataset.stage = n;
    $$('#stepper li').forEach((li) => {
      const s = +li.dataset.step;
      li.classList.toggle('done', n === 4 || s < n);
      li.classList.toggle('active', n < 4 && s === Math.max(1, n));
    });
  }
  function feed(kind, text, t) {
    const ul = $('#feed');
    $$('.typing', ul).forEach((x) => x.classList.remove('typing'));
    const li = document.createElement('li');
    li.className = `t-${kind === 'build' ? 'build' : kind === 'warn' ? 'warn' : kind === 'thought' ? 'thought' : kind === 'error' ? 'error' : 'tool'} typing`;
    const time = new Date(t || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    li.innerHTML = `<span class="ticon">${icon(kind)}</span><span class="ftext">${esc(text)}</span><span class="ftime">${time}</span>`;
    ul.appendChild(li);
    ul.scrollTop = ul.scrollHeight;
  }

  // ------------------------------------------------------------------ results
  function normalize(data) {
    const n = (v, list, fb) => list.find((x) => String(v || '').toLowerCase().startsWith(x.toLowerCase())) || fb;
    const fix = (t, i, p) => ({ ...t, id: t.id || `${p}-${String(i + 1).padStart(3, '0')}`, category: n(t.category, CATS, 'Positive'), criticality: n(t.criticality || t.priority, CRITS, 'Medium'), module: t.module || t.feature || 'General' });
    return {
      func: arr(data.testCases).map((t, i) => fix(t, i, 'TC')),
      api: arr(data.apiTestCases).map((t, i) => fix(t, i, 'API')),
      rbac: arr(data.roleTestCases).map((t, i) => fix(t, i, 'RBAC')),
    };
  }

  function renderResult(job) {
    lastJob = job;
    show('result');
    const { meta, files: outFiles, data } = job;
    const inputs = arr(meta.inputs).length ? meta.inputs : arr((data && data.sourceDocuments) || meta.sources).map((s) => ({ name: s, kind: /^https?:/.test(s) ? 'url' : 'file' }));
    Object.assign(J, { view: 'result', jobId: meta.id, project: (data && data.project) || meta.project, status: meta.status, durationMs: meta.durationMs, inputs: inputs.length, viewing: 'sec-input' });
    renderInputs(inputs);
    renderGen(meta, outFiles);
    $('#resTitle').textContent = (data && data.project) || meta.project;
    $('#resDate').textContent = `${meta.status === 'done' ? 'Completed' : meta.status === 'error' ? 'Failed' : 'Run'} · ${new Date(meta.finishedAt || meta.createdAt).toLocaleString()}`
      + (meta.durationMs ? ` · ${Math.round(meta.durationMs / 1000)}s` : '');
    $('#resSources').textContent = arr((data && data.sourceDocuments) || meta.sources).length ? `Sources: ${arr((data && data.sourceDocuments) || meta.sources).map((s) => String(s).split(/[\\/]/).pop()).join(' · ')}` : '';

    const errEl = $('#resError');
    errEl.hidden = meta.status !== 'error';
    if (meta.status === 'error') errEl.textContent = `This run did not finish: ${meta.summary || 'unknown error'}`;

    renderDownloads(meta.id, outFiles);
    const dlCount = outFiles.filter((f) => f.kind === 'xlsx' || f.kind === 'csv').length;
    $('#filesMeta').textContent = dlCount ? `${dlCount} file${dlCount > 1 ? 's' : ''} ready` : '';
    if (!dlCount) $('#downloads').innerHTML = '<div class="empty">No output files were produced for this run.</div>';
    const hasData = !!data;
    ['#sec-report', '#sec-charts', '#sec-cases'].forEach((s) => ($(s).hidden = !hasData));
    if (!data) {
      ['#stats', '#donuts'].forEach((s) => ($(s).innerHTML = '')); $('#summary').hidden = true;
      J.res = { files: dlCount, cases: 0 };
      renderFlow(); observeSections(); renderRail();
      return;
    }

    const sets = normalize(data);
    const all = [...sets.func, ...sets.api, ...sets.rbac];
    const reqs = arr(data.requirements);
    const refMap = {};
    all.forEach((t) => arr(t.requirementRef || t.references).forEach((r) => (refMap[r] = refMap[r] || []).push(t.id)));
    const covered = reqs.filter((r) => refMap[r.id]).length;
    const covPct = reqs.length ? Math.round((covered / reqs.length) * 100) : null;
    const cnt = (list, k, v) => list.filter((t) => t[k] === v).length;
    $('#casesMeta').textContent = `${all.length} cases · ${[sets.func.length && 'Functional', sets.api.length && 'API', sets.rbac.length && 'Roles'].filter(Boolean).join(' · ')}`;

    // stat tiles
    const tiles = [
      { label: 'Total test cases', value: all.length, sub: `${sets.func.length} functional · ${sets.api.length} API · ${sets.rbac.length} role`, cls: 'hero-stat' },
      { label: 'High criticality', value: cnt(all, 'criticality', 'High'), sub: `${all.length ? Math.round(cnt(all, 'criticality', 'High') / all.length * 100) : 0}% of suite`, accent: css('--crit-high') },
      { label: 'Negative + Boundary', value: cnt(all, 'category', 'Negative') + cnt(all, 'category', 'Boundary'), sub: 'edge and failure paths', accent: css('--cat-cor') },
      covPct != null ? { label: 'Requirement coverage', value: covPct, suffix: '%', sub: `${covered} of ${reqs.length} requirements`, accent: css('--cov-yes') }
        : { label: 'Modules', value: new Set(all.map((t) => t.module)).size, sub: 'features covered', accent: css('--cat-pos') },
      { label: 'Open questions', value: arr(data.openQuestions).length, sub: `${arr(data.assumptions).length} assumptions logged`, accent: '#00d4ff' },
    ];
    $('#stats').innerHTML = tiles.map((t) => `<div class="stat ${t.cls || ''}" style="${t.accent ? `--accent:${t.accent}` : ''}"><div class="label">${esc(t.label)}</div><div class="value" data-to="${t.value}" data-suffix="${t.suffix || ''}">0</div><div class="sub">${esc(t.sub)}</div></div>`).join('');
    $$('#stats .value').forEach(countUp);

    // donuts
    const donuts = [
      { title: 'By category', items: CATS.map((c) => ({ label: c, value: cnt(all, 'category', c), color: css(CAT_COLOR[c]) })) },
      { title: 'By criticality', items: CRITS.map((c) => ({ label: c, value: cnt(all, 'criticality', c), color: css(CRIT_COLOR[c]) })) },
      { title: 'By test suite', items: [['Functional', sets.func.length, '--suite-func'], ['API', sets.api.length, '--suite-api'], ['Roles & permissions', sets.rbac.length, '--suite-rbac']].filter((x) => x[1]).map(([l, v, c]) => ({ label: l, value: v, color: css(c) })) },
    ];
    if (reqs.length) donuts.push({ title: 'Requirement coverage', center: `${covPct}%`, centerLabel: 'covered', items: [{ label: 'Covered', value: covered, color: css('--cov-yes') }, { label: 'Not covered', value: reqs.length - covered, color: css('--cov-no') }] });
    $('#donuts').innerHTML = donuts.map((d, i) => `<div class="donut-card"><h3>${esc(d.title)}</h3><div class="donut-body">${donutSvg(d, i)}${legend(d)}</div></div>`).join('');
    bindDonuts();

    // summary
    const sum = meta.summary && meta.status === 'done' && meta.summary !== 'Completed' ? meta.summary : '';
    $('#summary').hidden = !sum;
    if (sum) $('#summary').innerHTML = `<span class="ticon">${icon('Skill')}</span><div class="md">${miniMd(sum)}</div>`;

    // explorer
    const tabs = [
      { id: 'func', label: 'Functional', n: sets.func.length, rows: sets.func },
      { id: 'api', label: 'API', n: sets.api.length, rows: sets.api },
      { id: 'rbac', label: 'Role-based', n: sets.rbac.length, rows: sets.rbac },
      { id: 'matrix', label: 'Permission matrix', n: arr(data.roleMatrix && data.roleMatrix.permissions).length },
      { id: 'trace', label: 'Traceability', n: reqs.length },
      { id: 'notes', label: 'Questions & assumptions', n: arr(data.openQuestions).length + arr(data.assumptions).length + arr(data.outOfScope).length },
    ].filter((t) => t.n > 0);
    current = { data, sets, reqs, refMap, tabs, view: { tab: tabs[0] && tabs[0].id, q: '', cats: new Set(), crits: new Set() } };
    $('#search').value = '';
    renderTabs(); renderTable();

    J.res = { files: dlCount, cases: all.length, coverage: covPct, charts: donuts.length, tabs: tabs.length };
    renderFlow(); observeSections(); renderRail();
  }

  // ---- section 1: input recap
  function renderInputs(inputs) {
    $('#inputMeta').textContent = `${inputs.length} source${inputs.length === 1 ? '' : 's'}`;
    $('#inputList').innerHTML = inputs.length ? inputs.map((f, i) => {
      const isUrl = f.kind === 'url', isText = f.kind === 'text';
      const ext = isUrl ? 'URL' : isText ? 'TEXT' : (String(f.name).split('.').pop() || '').toUpperCase().slice(0, 4);
      const cls = isUrl ? 'html' : isText ? 'txt' : ext.toLowerCase();
      const known = ['pdf', 'docx', 'txt', 'md', 'html', 'htm', 'xml', 'csv', 'json'].includes(cls) ? cls : 'other';
      const name = isText ? 'Pasted requirements text' : String(f.name).split(/[\\/]/).pop();
      const sub = isUrl ? 'Web / Confluence page' : `${isText ? 'Typed or pasted text' : 'Uploaded file'}${f.size ? ` · ${fmtSize(f.size)}` : ''}`;
      return `<li class="file"><span class="fnum">${i + 1}</span><span class="ftype ft-${known}">${esc(ext)}</span><div class="fmeta"><div class="fname" title="${esc(f.name)}">${esc(name)}</div><div class="fsize">${esc(sub)}</div></div></li>`;
    }).join('') : '<li class="empty">No input details were recorded for this run.</li>';
  }

  // ---- section 2: generation facts
  function renderGen(meta, outFiles) {
    const failed = meta.status === 'error';
    const facts = [
      { k: 'Status', v: failed ? 'Failed' : meta.status === 'done' ? 'Completed ✓' : meta.status, cls: failed ? 'bad' : 'ok' },
      { k: 'Engine', v: 'Claude Code · your subscription' },
      meta.model && { k: 'Model', v: meta.model },
      { k: 'Started', v: new Date(meta.createdAt).toLocaleString() },
      meta.durationMs ? { k: 'Duration', v: fmtDur(meta.durationMs) } : null,
      meta.toolCalls ? { k: 'Actions taken', v: `${meta.toolCalls} steps` } : null,
      { k: 'Skill', v: 'qa-test-generator' },
    ].filter(Boolean);
    $('#genFacts').innerHTML = facts.map((f) => `<div class="fact ${f.cls || ''}"><span>${esc(f.k)}</span><b>${esc(f.v)}</b></div>`).join('');
  }

  // ---- flow strip: the whole journey on one line
  function renderFlow() {
    const fiCls = { input: 'fi-input', process: 'fi-process', output: 'fi-output' };
    $('#flow').innerHTML = STAGES.map((st, i) => {
      const s = stageState(st);
      const off = s.cls.includes('locked') ? ' style="opacity:.45"' : '';
      return `${i ? `<span class="flow-arrow"><svg viewBox="0 0 24 24">${ICONS.arrow}</svg></span>` : ''}<button class="flow-step" data-sec="${st.sec}"${off}><span class="fi ${fiCls[st.group]}">${icon(st.icon)}</span><b>${esc(st.label)}</b><small>${esc(s.small)}</small></button>`;
    }).join('');
  }
  $('#flow').addEventListener('click', (e) => { const b = e.target.closest('.flow-step'); if (!b) return; const sec = $(`#${b.dataset.sec}`); if (sec && !sec.hidden) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  // highlight the rail item for the section currently in view
  let secObserver = null;
  function observeSections() {
    if (secObserver) secObserver.disconnect();
    secObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting && J.viewing !== en.target.id) { J.viewing = en.target.id; renderRail(); } });
    }, { rootMargin: '-30% 0px -60% 0px' });
    STAGES.forEach((st) => { const el = $(`#${st.sec}`); if (el && !el.hidden) secObserver.observe(el); });
  }

  // tiny, safe markdown: escape first, then **bold**, `code`, "- " bullets
  function miniMd(s) {
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const out = []; let list = false;
    String(s).split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*[-*]\s+(.*)/);
      if (m) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(m[1])}</li>`); return; }
      if (list) { out.push('</ul>'); list = false; }
      if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    });
    if (list) out.push('</ul>');
    return out.join('');
  }

  function renderDownloads(id, list) {
    const suite = (f) => ({ functional: 'Functional', api: 'API', roles: 'Roles' }[(f.name.match(/testrail_(\w+)\.csv$/) || [])[1]] || 'Test cases');
    const title = (f) => f.kind === 'xlsx' ? 'Download Excel workbook' : f.kind === 'csv' ? suite(f) : 'Test-case data';
    const label = (f) => f.kind === 'xlsx' ? `${f.name} · dashboard + all tabs` : f.kind === 'csv' ? 'TestRail import' : 'Raw JSON';
    const order = (f) => ({ xlsx: 0, csv: 1, json: 5 }[f.kind] + (/functional/.test(f.name) ? 0 : /api/.test(f.name) ? 1 : /roles/.test(f.name) ? 2 : 0));
    const json = list.find((f) => f.kind === 'json');
    const href = (f) => `/api/jobs/${encodeURIComponent(id)}/files/${encodeURIComponent(f.name)}`;
    const labelX = (f) => f.kind === 'xlsx' && json ? `${fmtSize(f.size)} · dashboard + all tabs` : label(f);
    $('#downloads').innerHTML = list.filter((f) => f.kind === 'xlsx' || f.kind === 'csv').sort((a, b) => order(a) - order(b)).map((f) => f.kind === 'xlsx' ? `
      <div class="dl xlsx"><span class="dl-ic">XLSX</span>
        <span><a class="dl-name" style="display:block" href="${href(f)}" download>Download Excel workbook</a>
        <div class="dl-sub">${esc(labelX(f))}${json ? ` · <a class="rawlink" href="${href(json)}" download>raw JSON</a>` : ''}</div></span>
        <a class="dl-arrow" href="${href(f)}" download aria-label="Download workbook">${icon('dl')}</a></div>` : `
      <a class="dl ${f.kind}" href="/api/jobs/${encodeURIComponent(id)}/files/${encodeURIComponent(f.name)}" download>
        <span class="dl-ic">${f.kind.toUpperCase()}</span>
        <span><div class="dl-name" title="${esc(f.name)}">${esc(title(f))}</div><div class="dl-sub">${esc(label(f))} · ${fmtSize(f.size)}</div></span>
        <span class="dl-arrow">${icon('dl')}</span></a>`).join('');
  }

  function countUp(el) {
    const to = +el.dataset.to; const suf = el.dataset.suffix; const t0 = performance.now(); const dur = 900;
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // SVG doughnut: 2px surface gaps between segments, hover tooltip, legend with value + % (direct labelling)
  function donutSvg(d, idx) {
    const total = d.items.reduce((s, x) => s + x.value, 0);
    const R = 52, C = 2 * Math.PI * R, GAP = d.items.filter((x) => x.value).length > 1 ? 2.5 : 0;
    let off = 0;
    const segs = d.items.map((x, i) => {
      if (!x.value) return '';
      const len = (x.value / total) * C;
      const s = `<circle class="seg" data-d="${idx}" data-i="${i}" r="${R}" cx="66" cy="66" stroke="${x.color}" stroke-dasharray="${Math.max(0.01, len - GAP)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 66 66)"
        style="stroke-dasharray:0 ${C};animation:none" data-len="${Math.max(0.01, len - GAP)}"></circle>`;
      off += len;
      return s;
    }).join('');
    return `<svg class="donut" viewBox="0 0 132 132" role="img" aria-label="${esc(d.title)}: ${d.items.map((x) => `${x.label} ${x.value}`).join(', ')}">
      <circle class="track" r="${R}" cx="66" cy="66"></circle>${segs}
      <text class="c-val" x="66" y="68" text-anchor="middle">${esc(d.center || total)}</text>
      <text class="c-lbl" x="66" y="85" text-anchor="middle">${esc(d.centerLabel || 'tests')}</text></svg>`;
  }
  function legend(d) {
    const total = d.items.reduce((s, x) => s + x.value, 0) || 1;
    return `<ul class="legend">${d.items.map((x, i) => `<li data-d-legend="${i}"><span class="sw" style="background:${x.color}"></span><span class="ln">${esc(x.label)}</span><span class="lv">${x.value}</span><span class="lp">${Math.round((x.value / total) * 100)}%</span></li>`).join('')}</ul>`;
  }
  function bindDonuts() {
    // animate segments in
    requestAnimationFrame(() => $$('#donuts .seg').forEach((s, k) => {
      s.style.transition = `stroke-dasharray 1s cubic-bezier(.2,.8,.2,1) ${k * 60}ms, stroke-width .2s, opacity .2s`;
      requestAnimationFrame(() => (s.style.strokeDasharray = `${s.dataset.len} 1000`));
    }));
    const tip = $('#tooltip');
    $$('#donuts .donut-card').forEach((card) => {
      const segs = $$('.seg', card);
      const items = $$('.legend li', card);
      const hl = (i) => { segs.forEach((s) => { s.classList.toggle('hot', +s.dataset.i === i); s.classList.toggle('dim', i != null && +s.dataset.i !== i); }); };
      const tipFor = (i, e) => {
        const li = items[i]; if (!li) return;
        tip.innerHTML = `<span class="sw" style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:${li.querySelector('.sw').style.background}"></span>${li.querySelector('.ln').textContent}: <b>${li.querySelector('.lv').textContent}</b> (${li.querySelector('.lp').textContent})`;
        tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 14}px`; tip.classList.add('show');
      };
      segs.forEach((s) => {
        s.addEventListener('mousemove', (e) => { hl(+s.dataset.i); tipFor(+s.dataset.i, e); });
        s.addEventListener('mouseleave', () => { hl(null); tip.classList.remove('show'); });
      });
      items.forEach((li, i) => { li.addEventListener('mouseenter', () => hl(i)); li.addEventListener('mouseleave', () => hl(null)); });
    });
  }

  // ------------------------------------------------------------------ explorer
  function renderTabs() {
    const v = current.view;
    $('#tabs').innerHTML = current.tabs.map((t) => `<button class="tab ${t.id === v.tab ? 'active' : ''}" data-tab="${t.id}" role="tab">${esc(t.label)} <span class="n">${t.n}</span></button>`).join('');
    const tab = current.tabs.find((t) => t.id === v.tab);
    const hasRows = tab && tab.rows;
    $('#toolbar').hidden = !hasRows;
    if (!hasRows) return;
    const rows = tab.rows;
    const chip = (kind, val, colorVar) => `<button class="fchip ${current.view[kind].has(val) ? 'on' : ''}" data-kind="${kind}" data-val="${val}"><span class="sw" style="background:var(${colorVar})"></span>${val} <span class="n">${rows.filter((r) => r[kind === 'cats' ? 'category' : 'criticality'] === val).length}</span></button>`;
    $('#catFilters').innerHTML = CATS.map((c) => chip('cats', c, CAT_COLOR[c])).join('');
    $('#critFilters').innerHTML = CRITS.map((c) => chip('crits', c, CRIT_COLOR[c])).join('');
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (!b) return; current.view.tab = b.dataset.tab; current.view.cats.clear(); current.view.crits.clear(); renderTabs(); renderTable(); });
  $('#toolbar').addEventListener('click', (e) => { const b = e.target.closest('.fchip'); if (!b) return; const s = current.view[b.dataset.kind]; s.has(b.dataset.val) ? s.delete(b.dataset.val) : s.add(b.dataset.val); renderTabs(); renderTable(); });
  $('#search').addEventListener('input', (e) => { current.view.q = e.target.value.toLowerCase(); renderTable(); });

  const tag = (val, map) => `<span class="tag" style="--c:var(${map[val]})">${esc(val)}</span>`;
  const txt = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v));
  const stepsHtml = (s) => { const a = arr(s); return a.length ? `<ol>${a.map((x) => `<li>${esc(String(x).replace(/^\s*\d+[.)]\s*/, ''))}</li>`).join('')}</ol>` : '<p>-</p>'; };

  function renderTable() {
    const { view, data, reqs, refMap } = current;
    const tab = current.tabs.find((t) => t.id === view.tab);
    const wrap = $('#tableWrap');
    if (!tab) { wrap.innerHTML = '<div class="empty">No test cases in this run.</div>'; return; }

    if (tab.id === 'matrix') {
      const m = data.roleMatrix;
      const cell = (v) => { const s = String(v == null ? '?' : v); if (/^(y|yes|true|allow(ed)?)$/i.test(s)) return '<span class="acc acc-yes">✓ Allowed</span>'; if (/^(n|no|false|den(y|ied))$/i.test(s)) return '<span class="acc acc-no">✕ Denied</span>'; return `<span class="acc acc-other">${esc(s)}</span>`; };
      wrap.innerHTML = `<table class="matrix"><thead><tr><th>Permission / action</th>${m.roles.map((r) => `<th style="text-align:center">${esc(r)}</th>`).join('')}</tr></thead><tbody>${m.permissions.map((p) => `<tr><td class="title">${esc(p.name || p.permission)}</td>${m.roles.map((r) => `<td class="cell">${cell((p.access || {})[r])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      return;
    }
    if (tab.id === 'trace') {
      const max = Math.max(1, ...reqs.map((r) => (refMap[r.id] || []).length));
      wrap.innerHTML = `<table><thead><tr><th>Requirement</th><th>Description</th><th>Tests</th><th>Linked cases</th></tr></thead><tbody>${reqs.map((r) => { const l = refMap[r.id] || []; return `<tr><td class="id">${esc(r.id)}</td><td>${esc(r.description || r.title || '')}</td><td style="white-space:nowrap">${l.length ? `<span class="covbar"><i style="width:${(l.length / max) * 100}%"></i></span>${l.length}` : '<span class="acc acc-no">Not covered</span>'}</td><td class="mono">${esc(l.join(', '))}</td></tr>`; }).join('')}</tbody></table>`;
      return;
    }
    if (tab.id === 'notes') {
      const items = [...arr(data.openQuestions).map((x) => ['q', 'Question', x]), ...arr(data.assumptions).map((x) => ['a', 'Assumption', x]), ...arr(data.outOfScope).map((x) => ['o', 'Out of scope', x])];
      wrap.innerHTML = `<ul class="qlist">${items.map(([k, l, x]) => `<li><span class="qt qt-${k}">${l}</span><span>${esc(txt(x))}</span></li>`).join('')}</ul>`;
      return;
    }

    const rows = tab.rows.filter((r) => (!view.cats.size || view.cats.has(r.category)) && (!view.crits.size || view.crits.has(r.criticality))
      && (!view.q || JSON.stringify(r).toLowerCase().includes(view.q)));
    const head = tab.id === 'api' ? ['ID', 'Title', 'Method', 'Endpoint', 'Category', 'Criticality', 'Status']
      : tab.id === 'rbac' ? ['ID', 'Title', 'Role', 'Permission', 'Access', 'Category', 'Criticality']
      : ['ID', 'Title', 'Module', 'Category', 'Criticality', 'Refs'];
    const cols = head.length;
    const body = rows.map((r, i) => {
      const cells = tab.id === 'api'
        ? `<td class="title">${esc(r.title)}</td><td><span class="method m-${esc(String(r.method || '').toUpperCase())}">${esc(String(r.method || '').toUpperCase())}</span></td><td class="mono">${esc(r.endpoint)}</td><td>${tag(r.category, CAT_COLOR)}</td><td>${tag(r.criticality, CRIT_COLOR)}</td><td class="mono">${esc(r.expectedStatus)}</td>`
        : tab.id === 'rbac'
          ? `<td class="title">${esc(r.title)}</td><td>${esc(r.role)}</td><td>${esc(r.permission)}</td><td>${/allow/i.test(r.access) ? '<span class="acc acc-yes">✓ Allowed</span>' : /den/i.test(r.access) ? '<span class="acc acc-no">✕ Denied</span>' : esc(r.access || '')}</td><td>${tag(r.category, CAT_COLOR)}</td><td>${tag(r.criticality, CRIT_COLOR)}</td>`
          : `<td class="title">${esc(r.title)}</td><td>${esc(r.module)}</td><td>${tag(r.category, CAT_COLOR)}</td><td>${tag(r.criticality, CRIT_COLOR)}</td><td class="mono">${esc(arr(r.requirementRef || r.references).join(', '))}</td>`;
      const blocks = [
        r.preconditions && ['Preconditions', `<p>${esc(txt(r.preconditions))}</p>`],
        r.testData && ['Test data', `<p>${esc(txt(r.testData))}</p>`],
        r.headers && ['Headers', `<pre>${esc(txt(r.headers))}</pre>`],
        (r.requestBody || r.request) && ['Request body', `<pre>${esc(txt(r.requestBody || r.request))}</pre>`],
        arr(r.steps).length && ['Steps', stepsHtml(r.steps)],
        ['Expected result', `<p class="expected">${r.expectedStatus ? `<b>HTTP ${esc(r.expectedStatus)}</b>. ` : ''}${esc(txt(r.expected || r.expectedResponse || r.expectedResult))}</p>`],
      ].filter(Boolean);
      return `<tr class="row" data-i="${i}"><td class="id"><span class="caret"></span>${esc(r.id)}</td>${cells}</tr>
        <tr class="detail" hidden><td colspan="${cols}"><div class="detail-grid">${blocks.map(([h, b]) => `<div><h4>${h}</h4>${b}</div>`).join('')}</div></td></tr>`;
    }).join('');
    wrap.innerHTML = rows.length
      ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`
      : '<div class="empty">No test cases match these filters.</div>';
  }
  $('#tableWrap').addEventListener('click', (e) => {
    const tr = e.target.closest('tr.row'); if (!tr) return;
    tr.classList.toggle('open');
    tr.nextElementSibling.hidden = !tr.classList.contains('open');
  });

  // ------------------------------------------------------------------ history drawer
  async function loadHistory() {
    try {
      const list = await (await fetch('/api/jobs')).json();
      $('#historyCount').textContent = list.length || '';
      $('#historyList').innerHTML = list.length ? list.map((j) => `<li><a href="#/job/${encodeURIComponent(j.id)}"><span class="hs hs-${esc(j.status)}"></span><span style="min-width:0;flex:1"><div class="hp">${esc(j.project)}</div><div class="hd">${new Date(j.createdAt).toLocaleString()} · ${esc(j.status)}</div></span></a></li>`).join('')
        : '<li class="empty">No runs yet. Upload a document to get started.</li>';
      J.recent = list; renderRail();
    } catch { /* offline */ }
  }
  const openDrawer = (o) => { $('#drawer').classList.toggle('open', o); $('#drawer').setAttribute('aria-hidden', String(!o)); $('#scrim').hidden = !o; if (o) loadHistory(); };
  $('#historyBtn').addEventListener('click', () => openDrawer(true));
  $('#drawerClose').addEventListener('click', () => openDrawer(false));
  $('#scrim').addEventListener('click', () => openDrawer(false));
  $('#historyList').addEventListener('click', (e) => { if (e.target.closest('a')) openDrawer(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openDrawer(false); });

  renderRail();
  loadHistory();
  route();
})();
