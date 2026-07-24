const app = document.getElementById('app');
const footer = document.getElementById('footer');
let INDEX = null;
const cache = {};

async function fetchJSON(path) {
  if (!cache[path]) cache[path] = fetch(path).then(r => r.json());
  return cache[path];
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct = x => x == null ? '—' : (100 * x).toFixed(1) + '%';
const fmt = (x, d = 2) => x == null ? '—' : (+x).toFixed(d);
const zcls = z => z > 0.25 ? 'pos' : z < -0.25 ? 'neg' : '';
const NEW_DAYS = 120;
const relHtml = r => {
  if (!r.released) return '<span class="dim">?</span>';
  const pill = r.age_days != null && r.age_days <= NEW_DAYS ? ' <span class="pill pos">new</span>' : '';
  return `<span class="small">${esc(r.released)}</span>${pill}`;
};

function sortable(tableId, rows, cols) {
  let sortCol = -1, asc = false;
  function render() {
    const head = `<tr>${cols.map((c, i) => `<th data-i="${i}">${esc(c.label)}${i === sortCol ? (asc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>`;
    let body = rows.slice();
    if (sortCol >= 0) {
      const key = cols[sortCol].val;
      body.sort((a, b) => {
        const va = key(a), vb = key(b);
        if (va == null) return 1; if (vb == null) return -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    body = body.map(r => `<tr>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.html(r)}</td>`).join('')}</tr>`).join('');
    if (!body) body = `<tr><td colspan="${cols.length}" class="dim">No rows match.</td></tr>`;
    document.getElementById(tableId).innerHTML = head + body;
    document.querySelectorAll(`#${tableId} th`).forEach(th => th.onclick = () => {
      const i = +th.dataset.i;
      if (sortCol === i) asc = !asc; else { sortCol = i; asc = false; }
      render();
    });
  }
  render();
}

function radar(axes, values, size = 300) {
  const keys = Object.keys(axes);
  if (!keys.length) return '<p class="dim">No axis scores.</p>';
  const cx = size / 2, cy = size / 2, R = size / 2 - 34;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / keys.length;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  let svg = `<svg class="radar" viewBox="0 0 ${size} ${size}">`;
  for (const rr of [0.33, 0.66, 1]) {
    svg += `<polygon points="${keys.map((_, i) => pt(i, R * rr).join(',')).join(' ')}" fill="none" stroke="#262b36"/>`;
  }
  const norm = z => Math.max(0.04, Math.min(1, (z + 2.5) / 5));
  svg += `<polygon points="${keys.map((k, i) => pt(i, R * norm(values[k] ?? 0)).join(',')).join(' ')}" fill="rgba(90,169,255,.25)" stroke="#5aa9ff" stroke-width="2"/>`;
  keys.forEach((k, i) => {
    const [x, y] = pt(i, R + 16);
    svg += `<text x="${x}" y="${y}" fill="#9aa3b2" font-size="10" text-anchor="middle">${esc(axes[k])}</text>`;
  });
  return svg + '</svg>';
}

const AXIS_LABELS = {
  'basic-logic': 'Basic logic', 'competitive-algorithms': 'Algorithms',
  'fresh-algorithms': 'Fresh algos', 'data-science-libs': 'DataSci libs',
  'code-reasoning': 'Code reasoning', 'fill-in-middle': 'FIM',
  'swe-agentic': 'SWE agentic', 'terminal-agentic': 'Terminal',
};

async function viewOverview() {
  const b = INDEX.benchmarks;
  app.innerHTML = `
    <h2>What coding skills are LLMs actually good at?</h2>
    <p class="dim">Per-problem pass/fail matrices from ${b.length} public coding benchmarks,
    ${INDEX.models.length} models. Drill into <a href="#/benchmarks">benchmarks</a>,
    <a href="#/models">models</a>, <a href="#/clusters">capability clusters</a>, or see which benchmarks
    <a href="#/audit">withhold detailed data</a>.</p>
    <p class="warn small">Newest model with per-problem data: <b>${esc(INDEX.freshest_release || 'unknown')}</b>.
    Newer models (up to <b>${esc(INDEX.frontier_freshest || '?')}</b>) appear in the
    <a href="#/frontier">frontier tracker</a> with aggregate scores only — public per-problem results lag releases by months.
    See the <a href="#/audit">data audit</a>.</p>
    <h3>Benchmarks</h3><table id="bt"></table>
    <h3>Top models (mean within-benchmark z-score)</h3><table id="mt"></table>`;
  sortable('bt', b, [
    { label: 'Benchmark', val: r => r.name, html: r => `<a href="#/benchmark/${r.id}">${esc(r.name)}</a>${r.difficulty_only ? ' <span class="pill warn">difficulty-only</span>' : ''}` },
    { label: 'Skill axis', val: r => r.axis, html: r => `<span class="pill">${esc(r.axis)}</span>` },
    { label: 'Models', val: r => r.n_models, num: 1, html: r => r.n_models || '—' },
    { label: 'Problems', val: r => r.n_problems, num: 1, html: r => r.n_problems },
    { label: 'Mean solve', val: r => r.mean_solve, num: 1, html: r => pct(r.mean_solve) },
    { label: 'Mean discrimination', val: r => r.mean_disc, num: 1, html: r => fmt(r.mean_disc) },
  ]);
  sortable('mt', INDEX.models.filter(m => m.n_benchmarks >= 3).slice(0, 40), [
    { label: 'Model', val: r => r.id, html: r => `<a href="#/model/${r.id}">${esc(r.id)}</a>` },
    { label: '# benchmarks', val: r => r.n_benchmarks, num: 1, html: r => r.n_benchmarks },
    { label: 'Mean z', val: r => r.mean_z, num: 1, html: r => `<span class="${zcls(r.mean_z)}">${fmt(r.mean_z)}</span>` },
    { label: 'Axes covered', val: r => Object.keys(r.axes).length, num: 1, html: r => Object.keys(r.axes).length },
    { label: 'Released', val: r => r.released || '', html: relHtml },
  ]);
}

async function viewBenchmarks() {
  app.innerHTML = '<h2>Benchmarks</h2><table id="bt"></table>';
  sortable('bt', INDEX.benchmarks, [
    { label: 'Benchmark', val: r => r.name, html: r => `<a href="#/benchmark/${r.id}">${esc(r.name)}</a>` },
    { label: 'Skill axis', val: r => r.axis, html: r => `<span class="pill">${esc(r.axis)}</span>` },
    { label: 'Models', val: r => r.n_models, num: 1, html: r => r.n_models || '—' },
    { label: 'Problems', val: r => r.n_problems, num: 1, html: r => r.n_problems },
    { label: 'Mean solve', val: r => r.mean_solve, num: 1, html: r => pct(r.mean_solve) },
  ]);
}

async function viewBenchmark(id) {
  const data = await fetchJSON(`data/problems/${id}.json`);
  const meta = INDEX.benchmarks.find(b => b.id === id);
  const tagKeys = [...new Set(data.problems.flatMap(p => Object.keys(p.tags || {})))];
  app.innerHTML = `
    <h2><a href="#/benchmarks" class="dim">Benchmarks /</a> ${esc(meta ? meta.name : id)}</h2>
    ${data.note ? `<p class="warn">${esc(data.note)}</p>` : ''}
    <p class="dim">${data.problems.length} problems · ${data.models.length} models ·
      <a href="${meta && meta.url}">source</a></p>
    <input type="search" id="q" placeholder="Filter problems…">
    <table id="pt"></table>`;
  let rows = data.problems;
  const render = () => sortable('pt', rows, [
    { label: 'Problem', val: r => r.id, html: r => `<span class="mono">${esc(r.id)}</span>` },
    ...tagKeys.map(k => ({ label: k, val: r => (r.tags || {})[k] || '', html: r => `<span class="tag">${esc((r.tags || {})[k] || '')}</span>` })),
    { label: 'Solve rate', val: r => r.solve_rate, num: 1, html: r => `<div class="bar"><div style="width:${(r.solve_rate || 0) * 100}%"></div></div> ${pct(r.solve_rate)}` },
    { label: 'Discrimination', val: r => r.discrimination, num: 1, html: r => fmt(r.discrimination) },
    { label: 'Solved by', val: r => (r.solvers || []).length, num: 1, html: r => `<span class="solvers">${(r.solvers || []).slice(0, 30).map(i => `<a href="#/model/${esc(data.models[i])}">${esc(data.models[i])}</a>`).join(', ')}${(r.solvers || []).length > 30 ? '…' : ''}</span>` },
  ]);
  render();
  document.getElementById('q').oninput = e => {
    const q = e.target.value.toLowerCase();
    rows = data.problems.filter(p => p.id.toLowerCase().includes(q) || Object.values(p.tags || {}).join(' ').toLowerCase().includes(q));
    render();
  };
}

async function viewModels() {
  app.innerHTML = `<h2>Models</h2>
    <input type="search" id="q" placeholder="Filter models…">
    <label class="dim small"><input type="checkbox" id="recent"> recent only (≤ ${NEW_DAYS} days)</label>
    <table id="mt"></table>`;
  let rows = INDEX.models, query = '', recentOnly = false;
  const apply = () => {
    rows = INDEX.models.filter(m => m.id.includes(query) && (!recentOnly || (m.age_days != null && m.age_days <= NEW_DAYS)));
    render();
  };
  const render = () => sortable('mt', rows, [
    { label: 'Model', val: r => r.id, html: r => `<a href="#/model/${r.id}">${esc(r.id)}</a>` },
    { label: '# benchmarks', val: r => r.n_benchmarks, num: 1, html: r => r.n_benchmarks },
    { label: 'Mean z', val: r => r.mean_z, num: 1, html: r => `<span class="${zcls(r.mean_z)}">${fmt(r.mean_z)}</span>` },
    ...Object.keys(AXIS_LABELS).map(a => ({
      label: AXIS_LABELS[a], val: r => r.axes[a], num: 1,
      html: r => r.axes[a] == null ? '<span class="dim">—</span>' : `<span class="${zcls(r.axes[a])}">${fmt(r.axes[a])}</span>`,
    })),
    { label: 'Released', val: r => r.released || '', html: relHtml },
  ]);
  render();
  document.getElementById('q').oninput = e => { query = e.target.value.toLowerCase(); apply(); };
  document.getElementById('recent').onchange = e => { recentOnly = e.target.checked; apply(); };
}

async function viewModel(id) {
  const m = await fetchJSON(`data/models/${id}.json`);
  const facetGroups = {};
  for (const f of m.facets) (facetGroups[f.facet] = facetGroups[f.facet] || []).push(f);
  app.innerHTML = `
    <h2><a href="#/models" class="dim">Models /</a> ${esc(id)}</h2>
    <p class="dim small">${m.released ? `Released ${esc(m.released)} (${m.age_days} days before report generation)` : 'Release date unknown — add it to pipeline/model_dates.json'}</p>
    <div class="grid">
      <div class="panel"><h3>Capability radar (z vs benchmark cohort)</h3>${radar(AXIS_LABELS, m.axes)}</div>
      <div class="panel"><h3>Benchmark scores</h3><table id="st"></table></div>
    </div>
    ${Object.entries(facetGroups).map(([facet, fs]) => `
      <h3>${esc(facet)} breakdown</h3>
      <table><tr><th>Benchmark</th><th>Tag</th><th>n</th><th>Pass rate</th><th>Population</th><th>Lift</th></tr>
      ${fs.map(f => `<tr><td>${esc(f.benchmark)}</td><td>${esc(f.tag)}</td><td class="num">${f.n}</td>
        <td class="num">${pct(f.pass_rate)}</td><td class="num">${pct(f.pop_rate)}</td>
        <td class="num ${f.lift > 0.02 ? 'pos' : f.lift < -0.02 ? 'neg' : ''}">${f.lift > 0 ? '+' : ''}${pct(f.lift)}</td></tr>`).join('')}
      </table>`).join('')}
    <div class="grid">
      <div class="panel"><h3>Hardest problems solved</h3><table><tr><th>Benchmark</th><th>Problem</th><th>Solve rate</th></tr>
        ${m.hardest_solved.map(p => `<tr><td>${esc(p.benchmark)}</td><td class="mono"><a href="#/benchmark/${p.benchmark}">${esc(p.id)}</a></td><td class="num">${pct(p.solve_rate)}</td></tr>`).join('')}</table></div>
      <div class="panel"><h3>Easiest problems failed</h3><table><tr><th>Benchmark</th><th>Problem</th><th>Solve rate</th></tr>
        ${m.easiest_failed.map(p => `<tr><td>${esc(p.benchmark)}</td><td class="mono"><a href="#/benchmark/${p.benchmark}">${esc(p.id)}</a></td><td class="num">${pct(p.solve_rate)}</td></tr>`).join('')}</table></div>
    </div>`;
  sortable('st', m.scores, [
    { label: 'Benchmark', val: r => r.benchmark, html: r => `<a href="#/benchmark/${r.benchmark}">${esc((INDEX.benchmarks.find(b => b.id === r.benchmark) || {}).name || r.benchmark)}</a>` },
    { label: 'Pass rate', val: r => r.score, num: 1, html: r => pct(r.score) },
    { label: 'z', val: r => r.z, num: 1, html: r => `<span class="${zcls(r.z)}">${fmt(r.z)}</span>` },
  ]);
}

const CLUSTER_COLORS = ['#5aa9ff', '#4cc38a', '#e5b567', '#e5636f', '#b48cff', '#6fd3d0', '#ff9d6b', '#9aa3b2'];
async function viewClusters() {
  const c = await fetchJSON('data/clusters.json');
  const groups = {};
  for (const [m, l] of Object.entries(c.assignments)) (groups[l] = groups[l] || []).push(m);
  const labels = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  app.innerHTML = `
    <h2>Capability clusters</h2>
    <p class="dim">Hierarchical clustering (correlation distance, average linkage) of models evaluated on ≥3 benchmarks,
    using within-benchmark z-scores. Models in a cluster win and lose on the same kinds of problems.</p>
    <div class="grid">${labels.map((l, i) => {
      const ms = groups[l];
      const centroid = {};
      for (const a of Object.keys(AXIS_LABELS)) {
        const vs = ms.map(m => (c.axes[m] || {})[a]).filter(v => v != null);
        if (vs.length) centroid[a] = vs.reduce((x, y) => x + y, 0) / vs.length;
      }
      return `<div class="panel"><h3><span class="legend-dot" style="background:${CLUSTER_COLORS[i % 8]}"></span>Cluster ${esc(l)} <span class="dim">(${ms.length})</span></h3>
        ${radar(AXIS_LABELS, centroid, 260)}
        <p class="small">${ms.map(m => `<a href="#/model/${m}">${esc(m)}</a>`).join(' · ')}</p></div>`;
    }).join('')}</div>`;
}

async function viewFrontier() {
  const data = await fetchJSON('data/frontier.json');
  app.innerHTML = `
    <h2>Frontier tracker</h2>
    <p class="dim">Latest models on coding benchmarks from <a href="https://epoch.ai/data/benchmark_data.zip">Epoch AI's benchmark database</a> (CC-BY, updated daily).
    Aggregate scores only — no per-problem drill-down available for these models yet.
    Models too new for the per-problem matrices appear here first.</p>
    ${data.benchmarks.map((b, bi) => `
      <h3>${esc(b.name)} <span class="dim small">(${b.rows.length} runs, unit: ${esc(b.unit)})</span></h3>
      <table id="ft${bi}"></table>`).join('')}`;
  data.benchmarks.forEach((b, bi) => sortable(`ft${bi}`, b.rows, [
    { label: 'Model', val: r => r.model, html: r => `<span class="mono">${esc(r.model)}</span>${r.logs ? ` <a href="${esc(r.logs)}" title="inspect logs">[logs]</a>` : ''}` },
    { label: 'Org', val: r => r.org, html: r => `<span class="tag">${esc(r.org || '')}</span>` },
    ...(b.rows.some(r => r.agent) ? [{ label: 'Agent', val: r => r.agent, html: r => `<span class="tag">${esc(r.agent || '')}</span>` }] : []),
    { label: 'Score', val: r => r.score, num: 1, html: r => `<div class="bar"><div style="width:${Math.min(100, r.score)}%"></div></div> ${fmt(r.score, 1)}${b.unit === '%' ? '%' : ''}` },
    { label: 'Released', val: r => r.released || '', html: relHtml },
  ]));
}

async function viewAudit() {
  app.innerHTML = `
    <h2>Benchmark data-availability audit</h2>
    <p class="dim">Which major coding benchmarks publish per-problem, per-model results — the data needed for capability profiling — and which don't. Assessed ${INDEX.generated.slice(0, 10)}.</p>
    <h3>Publish full per-problem × per-model data</h3>
    <table><tr><th>Benchmark</th><th>Where</th><th>Notes</th></tr>
      <tr><td>LiveCodeBench</td><td><a href="https://github.com/LiveCodeBench/submissions">github.com/LiveCodeBench/submissions</a></td><td>Generations + grades, 60+ models. Gold standard.</td></tr>
      <tr><td>HumanEval / MBPP (via EvalPlus &amp; eval-arena)</td><td><a href="https://evalplus.github.io/leaderboard.html">EvalPlus</a>, <a href="https://github.com/all-the-noises/eval-arena">eval-arena</a></td><td>Per-task pass/fail via eval-arena; generations not centrally published.</td></tr>
      <tr><td>SWE-bench (all splits)</td><td><a href="https://github.com/swe-bench/experiments">swe-bench/experiments</a></td><td>Patches, trajectories, per-instance reports, 100+ submissions.</td></tr>
      <tr><td>Terminal-Bench</td><td><a href="https://www.tbench.ai/leaderboard">tbench.ai</a> run artifacts</td><td>Per-task, k-trial results per submission.</td></tr>
      <tr><td>CRUXEval</td><td><a href="https://github.com/facebookresearch/cruxeval">repo samples/</a></td><td>Generations per sample published.</td></tr>
    </table>
    <h3>Partial — generations or aggregate only</h3>
    <table><tr><th>Benchmark</th><th>What's public</th><th>What's missing</th></tr>
      <tr><td class="warn">BigCodeBench</td><td>Generations (165MB zip, 160+ models), per-task cross-model solve rates</td><td>Per-task per-model pass/fail — requires re-executing all generations in Docker. Hence difficulty-only in this report.</td></tr>
      <tr><td class="warn">DS-1000</td><td>Per-model results via eval-arena; repo has only Codex answers</td><td>First-party per-task results.</td></tr>
      <tr><td class="warn">MultiPL-E</td><td>Completions on HF, repo results/</td><td>No maintained per-task leaderboard matrix.</td></tr>
      <tr><td class="warn">ClassEval</td><td>Aggregate leaderboard</td><td>Per-task per-model matrix.</td></tr>
      <tr><td class="warn">Aider polyglot</td><td>Aggregate pass rates per run</td><td>Per-exercise breakdown (must re-run harness).</td></tr>
      <tr><td class="warn">SWE-bench Multimodal</td><td>Aggregate leaderboard</td><td>Server-side eval; per-instance test data not downloadable.</td></tr>
    </table>
    <h3>No per-problem data published</h3>
    <table><tr><th>Benchmark</th><th>Status</th></tr>
      <tr><td class="neg">APPS</td><td>No leaderboard, no released model outputs.</td></tr>
      <tr><td class="neg">CodeContests</td><td>Dataset public; AlphaCode generations never released.</td></tr>
      <tr><td class="neg">ODEX</td><td>No released per-task outputs.</td></tr>
      <tr><td class="neg">LMArena (coding category)</td><td>Category rankings public; per-battle category labels not in released data.</td></tr>
      <tr><td class="neg">Multi-SWE-bench</td><td>Per-language aggregates; no central per-instance matrix.</td></tr>
    </table>`;
}

async function viewMethodology() {
  app.innerHTML = `
    <h2>Methodology</h2>
    <div class="panel small">
    <p><b>Data.</b> Per-problem pass/fail matrices come from <a href="https://github.com/all-the-noises/eval-arena">eval-arena</a>'s published example-level results
    (HumanEval, HumanEval+, MBPP, MBPP+, LiveCodeBench v5/v6, DS-1000, CRUXEval-I/O, SAFIM, SWE-bench Verified/Lite, Terminal-Bench 2.0).
    LiveCodeBench problem metadata (difficulty, platform, date) from <a href="https://github.com/LiveCodeBench/submissions">LiveCodeBench/submissions</a>;
    SWE-bench Verified difficulty from <a href="https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified">princeton-nlp/SWE-bench_Verified</a>;
    DS-1000 library tags from <a href="https://huggingface.co/datasets/xlangai/DS-1000">xlangai/DS-1000</a>;
    BigCodeBench per-task solve rates from <a href="https://huggingface.co/datasets/bigcode/bigcodebench-solve-rate">bigcode/bigcodebench-solve-rate</a>.</p>
    <p><b>Model identity.</b> Raw submission names are normalized to canonical model families
    (e.g. <span class="mono">20240612_MASAI_gpt4o</span> → <span class="mono">gpt-4o</span>). Agent+model submissions
    (SWE-bench, Terminal-Bench) are credited to the underlying model — read SWE scores as "best agent run using this model".</p>
    <p><b>Difficulty &amp; discrimination.</b> Solve rate = fraction of evaluated models passing the problem (pass1 ≥ 0.5).
    Discrimination = point-biserial correlation between passing the problem and total score on the remaining problems
    (computed when ≥8 models and non-degenerate). Low/negative discrimination flags noisy or broken problems.</p>
    <p><b>Skill profiles.</b> Within each benchmark, model scores are z-scored against that benchmark's cohort
    (so cohorts differ per benchmark — comparisons are cohort-relative). Axis scores average z across the benchmarks
    in the axis. Lift = model pass rate on a tagged slice minus the benchmark population rate on that slice.</p>
    <p><b>Clustering.</b> Models with ≥3 benchmarks are clustered with average linkage over correlation distance
    of their z-score vectors (missing = 0). Threshold 0.7.</p>
    <p><b>Recency.</b> Release dates come from the curated, approximate table in
    <span class="mono">pipeline/model_dates.json</span> (family-level; size/instruct variants inherit the family date).
    "New" = released within ${NEW_DAYS} days of report generation. Coverage lags the frontier:
    per-problem data only exists once third parties (eval-arena, benchmark authors) publish results,
    so recently released models may be absent entirely — the Released column makes that gap visible.</p>
    <p><b>Caveats.</b> Sampling variance, differing eval harnesses and prompting, contamination (especially HumanEval/MBPP),
    and population effects (z-scores are relative to whoever was evaluated) all apply. This is descriptive statistics
    over public data, not a controlled experiment.</p>
    <p><b>Source.</b> Pipeline + this site: <a href="https://github.com/all-the-noises/eval-arena">repo link TBD</a>. Regenerated weekly.</p>
    </div>`;
}

const routes = [
  [/^#?\/?$/, viewOverview],
  [/^#\/benchmarks$/, viewBenchmarks],
  [/^#\/benchmark\/([\w.-]+)$/, viewBenchmark],
  [/^#\/models$/, viewModels],
  [/^#\/model\/([\w.+-]+)$/, viewModel],
  [/^#\/clusters$/, viewClusters],
  [/^#\/frontier$/, viewFrontier],
  [/^#\/audit$/, viewAudit],
  [/^#\/methodology$/, viewMethodology],
];

async function route() {
  const h = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { await fn(m[1]); return; }
  }
  app.innerHTML = '<p>Not found.</p>';
}

(async () => {
  INDEX = await fetchJSON('data/index.json');
  footer.textContent = `Data generated ${INDEX.generated} · ${INDEX.models.length} models · ${INDEX.benchmarks.length} benchmarks`;
  window.addEventListener('hashchange', route);
  await route();
})();
