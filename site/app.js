const app = document.getElementById('app');
const tip = document.getElementById('tip');
let INDEX = null, SWE = null, BENCH = null;

const cache = {};
const load = p => (cache[p] = cache[p] || fetch(p).then(r => r.json()));

// --- formatting --------------------------------------------------------------
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = x => x == null ? '—' : (+x).toFixed(1);
const n0 = x => x == null ? '—' : Math.round(+x).toLocaleString();
const money = x => x == null ? '—' : '$' + (+x).toFixed(x < 10 ? 2 : 1);
const signed = x => x == null ? '—' : (x > 0 ? '+' : '') + (+x).toFixed(1);
const famName = id => (INDEX.families.find(f => f.id === id) || { name: id }).name;
const famColor = id => `var(--fam-${id})`;
const modelName = m => esc(m).replace('·', ' · ');
const effortPill = e => e ? `<span class="pill effort">${esc(e)}</span>` : '';
const dot = id => `<span class="fam-${esc(id)}"><span class="dot"></span></span>`;
const benchName = id => (INDEX.benchmarks.find(b => b.id === id) || { name: id }).name;
const benchUnit = id => (INDEX.benchmarks.find(b => b.id === id) || {}).pct ? '%' : '';
const tick = (v, span) => span >= 10 ? n0(v) : (+v).toFixed(1);
const days = iso => Math.round((Date.now() - new Date(iso)) / 864e5);

// --- tooltip -----------------------------------------------------------------
function tipHTML(title, rows) {
  return `<div class="t">${title}</div>` +
    rows.map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('');
}
document.addEventListener('mousemove', e => {
  const el = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (!el) { tip.style.opacity = 0; return; }
  tip.innerHTML = el.dataset.tip;
  tip.style.opacity = 1;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX + 14, innerWidth - r.width - 8) + 'px';
  tip.style.top = Math.max(8, e.clientY - r.height - 12) + 'px';
});

// --- chart primitives --------------------------------------------------------
// Bars are anchored to the baseline and rounded only at the data end (4px).
function barPath(x, y, w, h, r = 4) {
  r = Math.max(0, Math.min(r, w));
  return `M${x},${y} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${y + h - r} a${r},${r} 0 0 1 ${-r},${r} H${x} Z`;
}

function hbars(rows, opts = {}) {
  const labelW = opts.labelW ?? 200, rowH = opts.rowH ?? 26, padR = opts.padR ?? 56;
  const W = opts.width ?? 720, H = rows.length * rowH + 26;
  const max = opts.max ?? Math.max(...rows.map(r => r.hi ?? r.value)) * 1.02;
  const min = opts.min ?? 0;
  const plotW = W - labelW - padR;
  const x = v => labelW + plotW * (v - min) / (max - min);
  const ticks = opts.ticks ?? 5;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'bar chart')}">`;
  for (let i = 0; i <= ticks; i++) {
    const v = min + (max - min) * i / ticks;
    s += `<line class="gridline" x1="${x(v)}" y1="14" x2="${x(v)}" y2="${H - 12}"/>` +
      `<text class="tick" x="${x(v)}" y="9" text-anchor="middle">${tick(v, max - min)}${opts.unit || ''}</text>`;
  }
  rows.forEach((r, i) => {
    const y = 18 + i * rowH, h = rowH - 10;
    s += `<text class="lbl" x="${labelW - 8}" y="${y + h - 1}" text-anchor="end">${esc(r.label)}</text>`;
    s += `<path class="mark" d="${barPath(x(min), y, Math.max(1, x(r.value) - x(min)), h)}" fill="${r.color || 'var(--seq-3)'}" data-tip="${esc(r.tip || '')}"/>`;
    if (r.lo != null && r.hi != null) {
      const cy = y + h / 2;
      s += `<line x1="${x(r.lo)}" y1="${cy}" x2="${x(r.hi)}" y2="${cy}" stroke="var(--ink-3)" stroke-width="1.5"/>` +
        `<line x1="${x(r.lo)}" y1="${cy - 4}" x2="${x(r.lo)}" y2="${cy + 4}" stroke="var(--ink-3)" stroke-width="1.5"/>` +
        `<line x1="${x(r.hi)}" y1="${cy - 4}" x2="${x(r.hi)}" y2="${cy + 4}" stroke="var(--ink-3)" stroke-width="1.5"/>`;
    }
    s += `<text class="val" x="${x(r.hi ?? r.value) + 8}" y="${y + h - 1}">${n1(r.value)}${opts.unit || ''}</text>`;
  });
  return s + '</svg>';
}

function groupedBars(groups, series, opts = {}) {
  // groups: [{label, values:{key:number}, n}] · series: [{key,label,color}]
  const W = opts.width ?? 760, rowH = opts.rowH ?? 15, gap = 26, labelW = opts.labelW ?? 130;
  const H = groups.length * (series.length * rowH + gap) + 20;
  const max = opts.max ?? 100, plotW = W - labelW - 52;
  const x = v => labelW + plotW * v / max;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'grouped bars')}">`;
  for (let i = 0; i <= 5; i++) {
    const v = max * i / 5;
    s += `<line class="gridline" x1="${x(v)}" y1="12" x2="${x(v)}" y2="${H - 8}"/>` +
      `<text class="tick" x="${x(v)}" y="8" text-anchor="middle">${n0(v)}${opts.unit || ''}</text>`;
  }
  let y = 18;
  groups.forEach(g => {
    s += `<text class="lbl" x="0" y="${y + 9}" font-weight="600">${esc(g.label)}</text>`;
    s += `<text class="tick" x="0" y="${y + 22}">${g.n} instances</text>`;
    series.forEach((se, i) => {
      const v = g.values[se.key];
      if (v == null) return;
      const yy = y + i * rowH;
      s += `<path class="mark" d="${barPath(labelW, yy, Math.max(1, x(v) - labelW), rowH - 3, 3)}" fill="${se.color}" data-tip="${esc(tipHTML(se.label, [[g.label, n1(v) + (opts.unit || '')], ['instances', g.n]]))}"/>`;
      s += `<text class="val" x="${x(v) + 6}" y="${yy + rowH - 5}">${n1(v)}</text>`;
    });
    if (g.pop != null) {
      s += `<line x1="${x(g.pop)}" y1="${y - 3}" x2="${x(g.pop)}" y2="${y + series.length * rowH}" stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="3 2"/>`;
    }
    y += series.length * rowH + gap;
  });
  return s + '</svg>';
}

function heatmap(keys, cell, opts = {}) {
  const size = opts.size ?? 62, labelW = opts.labelW ?? 84, top = 42;
  const W = labelW + keys.length * size + 8, H = top + keys.length * size + 8;
  const vals = [];
  keys.forEach(a => keys.forEach(b => { const v = cell(a, b); if (v != null) vals.push(v); }));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  // Ordinal blue ramp; each step ships its own paired ink so the cell label stays legible
  // in both modes (the ramp direction flips with the surface).
  const step = v => 1 + Math.min(4, Math.floor((v - lo) / ((hi - lo) || 1) * 5));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'matrix')}">`;
  keys.forEach((k, j) => {
    s += `<text class="lbl" x="${labelW + j * size + size / 2}" y="${top - 8}" text-anchor="middle">${esc(famName(k))}</text>`;
    s += `<text class="lbl" x="${labelW - 8}" y="${top + j * size + size / 2 + 4}" text-anchor="end">${esc(famName(k))}</text>`;
  });
  keys.forEach((a, i) => keys.forEach((b, j) => {
    const v = cell(a, b), x = labelW + j * size, y = top + i * size;
    if (v == null) {
      s += `<rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="4" fill="var(--surface-3)"/>`;
      return;
    }
    const k = step(v);
    s += `<rect class="mark" x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="4" fill="var(--seq-${k})" data-tip="${esc(opts.tip ? opts.tip(a, b, v) : '')}"/>`;
    s += `<text x="${x + size / 2}" y="${y + size / 2 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--seq-${k}-ink)">${opts.fmt ? opts.fmt(v) : n1(v)}</text>`;
  }));
  return s + '</svg>';
}

function scatter(points, opts = {}) {
  // x on a log scale (cost spans two orders of magnitude), y linear.
  const W = opts.width ?? 720, H = opts.height ?? 380, L = 46, R = 16, T = 16, B = 38;
  const xs = points.map(p => Math.log10(Math.max(p.x, 0.01)));
  const x0 = Math.min(...xs) - 0.15, x1 = Math.max(...xs) + 0.15;
  const ys = points.map(p => p.y);
  const y0 = opts.y0 ?? Math.max(0, Math.min(...ys) - 4), y1 = opts.y1 ?? Math.max(...ys) + 4;
  const X = v => L + (W - L - R) * (Math.log10(Math.max(v, 0.01)) - x0) / (x1 - x0);
  const Y = v => H - B - (H - T - B) * (v - y0) / (y1 - y0);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'scatter')}">`;
  for (let i = 0; i <= 4; i++) {
    const v = y0 + (y1 - y0) * i / 4;
    s += `<line class="gridline" x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}"/>` +
      `<text class="tick" x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${n0(v)}${opts.unit || ''}</text>`;
  }
  const decades = [];
  for (let d = Math.floor(x0); d <= Math.ceil(x1); d++) [1, 2, 5].forEach(m => {
    const v = m * Math.pow(10, d);
    if (Math.log10(v) >= x0 && Math.log10(v) <= x1) decades.push(v);
  });
  decades.forEach(v => {
    s += `<line class="gridline" x1="${X(v)}" y1="${T}" x2="${X(v)}" y2="${H - B}"/>` +
      `<text class="tick" x="${X(v)}" y="${H - B + 14}" text-anchor="middle">${money(v)}</text>`;
  });
  s += `<text class="lbl" x="${(W + L) / 2}" y="${H - 6}" text-anchor="middle">${esc(opts.xlabel || 'cost per task (log scale)')}</text>`;

  // Pareto front: no cheaper point scores higher.
  const sorted = points.slice().sort((a, b) => a.x - b.x);
  const front = [];
  let bestY = -Infinity;
  sorted.forEach(p => { if (p.y > bestY) { front.push(p); bestY = p.y; } });
  if (front.length > 1) {
    s += `<polyline points="${front.map(p => `${X(p.x)},${Y(p.y)}`).join(' ')}" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="4 3"/>`;
  }
  points.forEach(p => {
    s += `<circle class="mark" cx="${X(p.x)}" cy="${Y(p.y)}" r="6" fill="${p.color}" stroke="var(--surface)" stroke-width="2" data-tip="${esc(p.tip || '')}"/>`;
  });
  // Direct labels, densest-first collision check: frontier points always get one, then the
  // rest by score while there is room. Whatever is skipped still answers on hover.
  const placed = points.map(p => [X(p.x) - 8, Y(p.y) - 8, X(p.x) + 8, Y(p.y) + 8]);
  const priority = front.concat(points.filter(p => !front.includes(p)).sort((a, b) => b.y - a.y));
  let skipped = 0;
  priority.forEach(p => {
    if (!p.label) return;
    const w = p.label.length * 5.3 + 10, px = X(p.x), py = Y(p.y);
    // right, left, above, below — first candidate that clears everything already drawn
    const spots = [
      { dx: 10, dy: 4, anchor: 'start' }, { dx: -10, dy: 4, anchor: 'end' },
      { dx: 0, dy: -11, anchor: 'middle' }, { dx: 0, dy: 17, anchor: 'middle' },
    ];
    const fits = spots.find(sp => {
      const x0 = sp.anchor === 'start' ? px + sp.dx : sp.anchor === 'end' ? px + sp.dx - w : px - w / 2;
      const box = [x0, py + sp.dy - 10, x0 + w, py + sp.dy + 2];
      if (box[0] < L || box[2] > W - 2) return false;
      return !placed.some(q => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]) && (sp.box = box);
    });
    if (!fits) { skipped++; return; }
    placed.push(fits.box);
    s += `<text class="val" x="${px + fits.dx}" y="${py + fits.dy}" text-anchor="${fits.anchor}" font-size="10">${esc(p.label)}</text>`;
  });
  if (skipped) {
    s += `<text class="tick" x="${W - R}" y="${T + 2}" text-anchor="end">${skipped} label${skipped === 1 ? '' : 's'} hidden — hover for detail</text>`;
  }
  return s + '</svg>';
}

function ladder(series, opts = {}) {
  // Ordinal x axis (effort tiers), one line per model line.
  const tiers = opts.tiers, W = opts.width ?? 620, H = opts.height ?? 300;
  const L = 46, R = 118, T = 14, B = 34;
  const vals = series.flatMap(s => s.points.map(p => p.y));
  const floor = opts.unit === '%' ? 0 : -Infinity;
  const y0 = opts.y0 ?? Math.max(floor, Math.min(...vals) - 3), y1 = opts.y1 ?? Math.max(...vals) + 3;
  const X = i => L + (W - L - R) * (tiers.length === 1 ? 0.5 : i / (tiers.length - 1));
  const Y = v => H - B - (H - T - B) * (v - y0) / (y1 - y0);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'effort ladder')}">`;
  for (let i = 0; i <= 4; i++) {
    const v = y0 + (y1 - y0) * i / 4;
    s += `<line class="gridline" x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}"/>` +
      `<text class="tick" x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${n0(v)}${opts.unit || ''}</text>`;
  }
  tiers.forEach((t, i) => {
    s += `<text class="tick" x="${X(i)}" y="${H - B + 14}" text-anchor="middle">${esc(t)}</text>`;
  });
  s += `<text class="lbl" x="${(W + L - R) / 2}" y="${H - 4}" text-anchor="middle">reasoning effort</text>`;
  const ends = [];
  series.forEach(se => {
    const pts = se.points.filter(p => p.y != null);
    s += `<polyline points="${pts.map(p => `${X(tiers.indexOf(p.tier))},${Y(p.y)}`).join(' ')}" fill="none" stroke="${se.color}" stroke-width="2"/>`;
    pts.forEach(p => {
      s += `<circle class="mark" cx="${X(tiers.indexOf(p.tier))}" cy="${Y(p.y)}" r="4.5" fill="${se.color}" stroke="var(--surface)" stroke-width="2" data-tip="${esc(p.tip || '')}"/>`;
    });
    const last = pts[pts.length - 1];
    if (last) ends.push({ label: se.label, x: X(tiers.indexOf(last.tier)) + 9, y: Y(last.y) + 4 });
  });
  // End labels are the legend; push them apart so lines that converge stay readable.
  ends.sort((a, b) => a.y - b.y).forEach((e, i, all) => {
    if (i && e.y - all[i - 1].y < 12) e.y = all[i - 1].y + 12;
    s += `<text class="val" x="${e.x}" y="${e.y}" font-size="10">${esc(e.label)}</text>`;
  });
  return s + '</svg>';
}

function legend(items) {
  return `<div class="legend">${items.map(i =>
    `<span class="item"><span class="dot" style="background:${i.color}"></span>${esc(i.label)}</span>`).join('')}</div>`;
}

// --- sortable table ----------------------------------------------------------
function table(rows, cols, opts = {}) {
  const id = 't' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => wire(id, rows, cols, opts), 0);
  return `<div class="tablewrap"><table id="${id}"></table></div>`;
}

function wire(id, rows, cols, opts) {
  const el = document.getElementById(id);
  if (!el) return;
  let sort = opts.sort ?? -1, asc = opts.asc ?? false;
  const draw = () => {
    const head = cols.map((c, i) =>
      `<th class="sortable ${c.num ? 'num' : ''}" data-i="${i}">${esc(c.label)}${i === sort ? (asc ? ' ▲' : ' ▼') : ''}</th>`).join('');
    let body = rows.slice();
    if (sort >= 0 && cols[sort].val) {
      body.sort((a, b) => {
        const x = cols[sort].val(a), y = cols[sort].val(b);
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    el.innerHTML = `<thead><tr>${head}</tr></thead><tbody>` +
      (body.length ? body.map(r => `<tr>${cols.map(c =>
        `<td class="${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}">${c.html(r)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${cols.length}" class="muted">Nothing matches.</td></tr>`) + '</tbody>';
    el.querySelectorAll('th').forEach(th => th.onclick = () => {
      const i = +th.dataset.i;
      if (sort === i) asc = !asc; else { sort = i; asc = !!cols[i].ascFirst; }
      draw();
    });
  };
  draw();
}

// --- shared pieces -----------------------------------------------------------
const famOrder = () => INDEX.families.map(f => f.id);
const famSeries = ids => ids.map(id => ({ key: id, label: famName(id), color: famColor(id) }));

function windowLine() {
  const h = INDEX.headline;
  return `Releases from <b>${esc(INDEX.window_start)}</b> onward — ${INDEX.window_days} days.
    ${h.n_lines} model lines · ${h.n_runs} benchmark runs · ${h.n_benchmarks} benchmarks.
    Anything older is not in this report.`;
}

function familyCard(f) {
  const swe = f.swe;
  return `<a class="famcard fam-${f.id}" href="#/family/${f.id}">
    <div class="name">${esc(f.name)}</div>
    <div class="vendor">${esc(f.vendor)}</div>
    <div class="stat"><span>Active lines</span><span>${f.n_lines}</span></div>
    <div class="stat"><span>With effort tiers</span><span>${f.tiered_lines || '—'}</span></div>
    <div class="stat"><span>Benchmarks covered</span><span>${f.n_benchmarks}/${INDEX.headline.n_benchmarks}</span></div>
    <div class="stat"><span>SWE-bench Verified best</span><span>${swe ? n1(swe.best_rate) + '%' : '—'}</span></div>
    <div class="stat"><span>Newest release</span><span>${esc(f.newest)}</span></div>
    <div class="lines">${f.lines.slice(0, 5).map(l => esc(l.line)).join(' · ')}${f.lines.length > 5 ? ` +${f.lines.length - 5}` : ''}</div>
  </a>`;
}

// --- views -------------------------------------------------------------------
function viewOverview() {
  const h = INDEX.headline, s = h.swe, seg = s.segments;
  const contested = Math.round(100 * seg.contested / s.n_instances);
  const saturated = Math.round(100 * seg.all / s.n_instances);
  const unsolved = Math.round(100 * seg.none / s.n_instances);
  // "Multiple active models" in the sense that matters: named families shipping more than one
  // line at more than one reasoning-effort tier. Other labs is a bucket, so it is excluded.
  const tiered = INDEX.families.filter(f => f.id !== 'other' && f.tiered_lines > 1);
  const single = INDEX.families.filter(f => f.id !== 'other' && f.tiered_lines <= 1);
  const topFam = SWE.families[0], second = SWE.families[1];
  const bestPair = SWE.pairs.slice().sort((a, b) => b.union - a.union)[0];
  const hard = SWE.by_difficulty.find(d => d.tag === '1-4 hours');
  const vp = h.value_pick;

  app.innerHTML = `
    <div class="eyebrow">Last ${INDEX.window_days} days · rebuilt ${INDEX.generated.slice(0, 10)}</div>
    <h1 class="page">Six months of frontier coding models, by family</h1>
    <p class="sub">${windowLine()}</p>

    <div class="tiles">
      <div class="tile"><div class="k">Best SWE-bench Verified</div>
        <div class="v">${n1(s.best_rate)}%</div>
        <div class="n">${modelName(s.best_model)}</div></div>
      <div class="tile"><div class="k">Instances with any signal</div>
        <div class="v">${contested}%</div>
        <div class="n">${seg.contested} of ${s.n_instances} split the field</div></div>
      <div class="tile"><div class="k">Nobody solves</div>
        <div class="v">${unsolved}%</div>
        <div class="n">${seg.none} instances, all ${s.n_models} models fail</div></div>
      <div class="tile"><div class="k">Oracle over all families</div>
        <div class="v">${n1(s.oracle_rate)}%</div>
        <div class="n">+${n1(s.oracle_rate - s.best_rate)} pts over the best single model</div></div>
    </div>

    <h2>What the data says</h2>
    <ul class="findings">
      <li><b>The families are near-substitutes at the top.</b> ${saturated}% of SWE-bench Verified instances
        are solved by every family and ${unsolved}% by none, so only <b>${contested}%</b> carry any
        discriminating signal. On those, ${esc(famName(topFam.id))} leads at
        <b>${n1(topFam.best_rate)}%</b> against ${esc(famName(second.id))} at ${n1(second.best_rate)}% —
        a ${n1(topFam.best_rate - second.best_rate)}-point gap on a set where the 95% interval is
        ±${n1((topFam.best_ci[1] - topFam.best_ci[0]) / 2)}.</li>
      <li><b>Only ${tiered.map(f => esc(f.name)).join(' and ')} run several models at once.</b>
        ${tiered.map(f => `${esc(f.name)} ${f.tiered_lines} of ${f.n_lines}`).join(', ')} lines ship at more than
        one reasoning-effort tier; ${single.map(f => esc(f.name)).join(', ')} publish one setting per line.
        So for most families the only decision is which model, while
        ${tiered.map(f => esc(f.name)).join(' and ')} customers mostly decide how hard an already-chosen model
        should think. <a href="#/effort">See what a tier costs →</a></li>
      <li><b>Uniqueness is thin.</b> Instances only one family solves:
        ${SWE.families.map(f => `${esc(famName(f.id))} ${f.unique}`).join(' · ')}.
        Picking a second family as a fallback buys more than picking a better single model —
        ${esc(famName(bestPair.a))} + ${esc(famName(bestPair.b))} reach <b>${n1(bestPair.union)}%</b>
        together, ${signed(bestPair.gain)} points over the better of the two alone.</li>
      ${hard ? `<li><b>The gap lives in the hard tier.</b> On the ${hard.n} instances SWE-bench rates
        "1-4 hours", the field averages ${n1(hard.pop)}% while ${esc(famName(topFam.id))} gets
        ${n1(hard[topFam.id])}%. On the ${SWE.by_difficulty[0].n} "&lt;15 min" instances everyone
        is within ${n1(Math.max(...famOrder().map(f => SWE.by_difficulty[0][f] ?? 0)) - Math.min(...famOrder().map(f => SWE.by_difficulty[0][f] ?? 100)))} points.</li>` : ''}
      ${vp ? `<li><b>Paying for the top tier is mostly wasted.</b> On DeepSWE,
        ${esc(vp.top_line)} at its dearest setting scores ${n1(vp.top_score)}% at ${money(vp.top_cost)}/task,
        while <b>${esc(vp.line)}·${esc(vp.effort)}</b> gets ${n1(vp.score)}% at ${money(vp.cost)} —
        ${n1(100 * (1 - vp.cost / vp.top_cost))}% cheaper for ${n1(vp.top_score - vp.score)} points.</li>` : ''}
    </ul>

    <h2>The families</h2>
    <p class="sub">Each card links to that family's lines, effort tiers and benchmark coverage.</p>
    <div class="grid cols-3">${INDEX.families.map(familyCard).join('')}</div>

    <div class="note">Per-instance SWE-bench results exist for ${SWE.coverage.with_logs} of the
      ${SWE.coverage.leaderboard_runs} in-window runs on Epoch's leaderboard; the rest publish a score but no
      inspect log${SWE.coverage.missing.length ? ' (' + SWE.coverage.missing.map(m => esc(m.line)).join(', ') + ')' : ''}.
      Aggregate scores for every model are on the <a href="#/benchmarks">benchmarks</a> page.</div>`;
}

function viewFamilies() {
  const rows = INDEX.families.flatMap(f => f.lines.map(l => ({ ...l, family: f.id })));
  app.innerHTML = `
    <h1 class="page">Families</h1>
    <p class="sub">${windowLine()}</p>
    <div class="grid cols-3">${INDEX.families.map(familyCard).join('')}</div>
    <h2>Every model line in the window</h2>
    <p class="sub">A "line" is one model; its reasoning-effort tiers are settings of that same model.</p>
    ${table(rows, [
      { label: 'Family', val: r => r.family, html: r => `${dot(r.family)}<a href="#/family/${r.family}">${esc(famName(r.family))}</a>` },
      { label: 'Line', val: r => r.line, html: r => `<span class="mono">${esc(r.line)}</span>` },
      { label: 'Released', val: r => r.released, html: r => `${esc(r.released)} <span class="muted">(${days(r.released)}d)</span>` },
      { label: 'Effort tiers', val: r => r.efforts.length, num: true, html: r => r.efforts.length ? r.efforts.map(effortPill).join(' ') : '<span class="muted">single</span>' },
      { label: 'Benchmarks', val: r => r.n_benchmarks, num: true, html: r => r.n_benchmarks },
      { label: 'SWE-bench', val: r => r.best.swe_bench_verified, num: true, html: r => r.best.swe_bench_verified != null ? n1(r.best.swe_bench_verified) + '%' : '<span class="muted">—</span>' },
    ], { sort: 2 })}`;
}

function viewFamily(id) {
  const f = INDEX.families.find(x => x.id === id);
  if (!f) { app.innerHTML = '<p>Unknown family.</p>'; return; }
  const swe = f.swe;
  const benches = INDEX.benchmarks.filter(b => f.lines.some(l => l.best[b.id] != null));
  const curves = INDEX.effort_curves.filter(c => c.family === id);
  const curveBench = curves.length ? (curves.find(c => c.benchmark === 'deepswe_external') || curves[0]).benchmark : null;
  const tiers = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

  const sweModels = swe ? SWE.models.filter(m => m.family === id) : [];
  const diffRows = swe ? SWE.by_difficulty.map(d => ({
    label: d.tag, n: d.n, pop: d.pop, values: { [id]: d[id] },
  })) : [];

  app.innerHTML = `
    <div class="crumb"><a href="#/families">Families</a> /</div>
    <h1 class="page fam-${id}">${dot(id)}${esc(f.name)}</h1>
    <p class="sub">${esc(f.vendor)} · ${f.n_lines} active line${f.n_lines > 1 ? 's' : ''} ·
      ${f.n_runs} runs across ${f.n_benchmarks} benchmarks · newest ${esc(f.newest)}.</p>

    <h2>Lines and coverage</h2>
    <p class="sub">Best score per benchmark, across all effort tiers of that line. The SWE-bench Verified
      column is the score as published, on the full instance set; the matched comparison further down
      re-scores every model on the ${SWE.n_instances} instances they all share, so the two differ slightly.</p>
    ${table(f.lines, [
      { label: 'Line', val: r => r.line, html: r => `<span class="mono">${esc(r.line)}</span>` },
      { label: 'Released', val: r => r.released, html: r => esc(r.released) },
      { label: 'Effort tiers', val: r => r.efforts.length, num: true, html: r => r.efforts.length ? r.efforts.map(effortPill).join(' ') : '<span class="muted">single</span>' },
      ...benches.map(b => ({
        label: b.name, val: r => r.best[b.id], num: true,
        html: r => r.best[b.id] == null ? '<span class="muted">—</span>' : n1(r.best[b.id]) + (b.pct ? '%' : ''),
      })),
    ], { sort: 1 })}

    ${curveBench ? `<h2>What effort buys</h2>
      <p class="sub">${esc(benchName(curveBench))} score by reasoning-effort tier, one line per model.</p>
      <figure>${ladder(curves.filter(c => c.benchmark === curveBench).map(c => ({
        label: c.line, color: famColor(id),
        points: c.points.map(p => ({
          tier: p.effort, y: p.score,
          tip: tipHTML(`${esc(c.line)} · ${esc(p.effort)}`, [
            ['score', n1(p.score) + benchUnit(curveBench)],
            ...(p.cost != null ? [['cost/task', money(p.cost)]] : []),
            ...(p.tokens != null ? [['output tokens', n0(p.tokens)]] : [])]),
        })),
      })), { tiers, unit: benchUnit(curveBench), width: 660 })}
      <figcaption>Tiers are the same weights at different reasoning budgets — a vertical read is
        the price of thinking longer, not a different model.</figcaption></figure>` : ''}

    ${swe ? `<h2>SWE-bench Verified, matched instances</h2>
      <p class="sub">All ${SWE.n_instances} instances every in-window model was run on. Whiskers are 95% Wilson intervals.</p>
      <figure>${hbars(sweModels.map(m => ({
        label: m.model.replace('·', ' · '), value: m.rate, lo: m.ci_lo, hi: m.ci_hi, color: famColor(id),
        tip: tipHTML(esc(m.model), [['solved', `${m.solved}/${SWE.n_instances}`], ['pass rate', n1(m.rate) + '%'],
          ['95% CI', `${n1(m.ci_lo)}–${n1(m.ci_hi)}%`], ['released', m.released]]),
      })), { unit: '%', max: 100, labelW: 190, width: 700 })}</figure>
      <div class="tiles">
        <div class="tile"><div class="k">Best model</div><div class="v">${n1(swe.best_rate)}%</div>
          <div class="n">${modelName(swe.best_model)}</div></div>
        <div class="tile"><div class="k">Any model in family</div><div class="v">${n1(swe.union_rate)}%</div>
          <div class="n">union over ${swe.n_models} model${swe.n_models > 1 ? 's' : ''}</div></div>
        <div class="tile"><div class="k">Solved by no other family</div><div class="v">${swe.unique}</div>
          <div class="n">of ${SWE.n_instances} instances</div></div>
      </div>
      <h3>By instance difficulty</h3>
      <figure>${groupedBars(diffRows, [{ key: id, label: f.name, color: famColor(id) }],
        { unit: '%', max: 100, rowH: 18, labelW: 130, width: 700 })}
      <figcaption>Dashed rule marks the average across all ${SWE.n_models} in-window models.</figcaption></figure>`
      : `<div class="note">No per-instance SWE-bench logs for this family in the window.</div>`}`;
}

function viewHeadToHead() {
  const seg = SWE.segments, N = SWE.n_instances;
  const fams = SWE.families.map(f => f.id);
  const segW = 720, segH = 54;
  const parts = [
    { k: 'all', label: 'Solved by all', v: seg.all, color: 'var(--seq-2)' },
    { k: 'contested', label: 'Contested', v: seg.contested, color: 'var(--seq-4)' },
    { k: 'none', label: 'Solved by none', v: seg.none, color: 'var(--surface-3)' },
  ];
  let x = 0;
  const segBar = `<svg viewBox="0 0 ${segW} ${segH}" role="img" aria-label="instance segmentation">` +
    parts.map(p => {
      const w = segW * p.v / N - 2, xx = x;
      x += segW * p.v / N;
      return `<rect class="mark" x="${xx}" y="0" width="${Math.max(2, w)}" height="26" rx="4" fill="${p.color}"
        data-tip="${esc(tipHTML(p.label, [['instances', p.v], ['share', n1(100 * p.v / N) + '%']]))}"/>` +
        `<text class="val" x="${xx}" y="44" font-size="11">${esc(p.label)} ${Math.round(100 * p.v / N)}%</text>`;
    }).join('') + '</svg>';

  app.innerHTML = `
    <h1 class="page">Head-to-head on identical instances</h1>
    <p class="sub">Every in-window model with published inspect logs, scored on the
      ${N} SWE-bench Verified instances all of them were run on
      (${SWE.n_dropped} instance${SWE.n_dropped === 1 ? '' : 's'} dropped for incomplete coverage).
      This is the only comparison here where the models faced exactly the same work.</p>

    <h2>How much of the benchmark still discriminates</h2>
    <figure>${segBar}
      <figcaption>${seg.all} instances are solved by all ${SWE.models.length} models and ${seg.none} by none.
        Rankings are decided by the ${seg.contested} in the middle.</figcaption></figure>

    <h2>Pass rate by model</h2>
    <figure>${hbars(SWE.models.map(m => ({
      label: m.model.replace('·', ' · '), value: m.rate, lo: m.ci_lo, hi: m.ci_hi, color: famColor(m.family),
      tip: tipHTML(esc(m.model), [['family', famName(m.family)], ['solved', `${m.solved}/${N}`],
        ['95% CI', `${n1(m.ci_lo)}–${n1(m.ci_hi)}%`], ['released', m.released]]),
    })), { unit: '%', max: 100, labelW: 200, width: 760 })}
      ${legend(famOrder().filter(f => fams.includes(f)).map(f => ({ label: famName(f), color: famColor(f) })))}
      <figcaption>Whiskers are 95% Wilson intervals on ${N} instances — roughly ±3.5 points.
        Models whose intervals overlap are not separated by this benchmark.</figcaption></figure>

    <h2>Family standings</h2>
    ${table(SWE.families, [
      { label: 'Family', val: r => r.id, html: r => `${dot(r.id)}<a href="#/family/${r.id}">${esc(famName(r.id))}</a>` },
      { label: 'Best model', val: r => r.best_model, html: r => `<span class="mono">${modelName(r.best_model)}</span>` },
      { label: 'Pass rate', val: r => r.best_rate, num: true, html: r => `${n1(r.best_rate)}%` },
      { label: '95% CI', val: r => r.best_ci[0], num: true, html: r => `<span class="muted">${n1(r.best_ci[0])}–${n1(r.best_ci[1])}</span>` },
      { label: 'Any model in family', val: r => r.union_rate, num: true, html: r => `${n1(r.union_rate)}%` },
      { label: 'Solved by no one else', val: r => r.unique, num: true, html: r => r.unique },
      { label: 'Models', val: r => r.n_models, num: true, html: r => r.n_models },
    ], { sort: 2 })}

    <h2>Two-family routing</h2>
    <p class="sub">If an oracle sent each instance to whichever of two families' best models solves it,
      this is the coverage it would reach. The diagonal is the family alone.</p>
    <figure>${heatmap(fams, (a, b) => {
      if (a === b) return SWE.families.find(f => f.id === a).best_rate;
      const p = SWE.pairs.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
      return p ? p.union : null;
    }, {
      fmt: v => n1(v), size: 66, labelW: 92,
      tip: (a, b, v) => {
        if (a === b) return tipHTML(famName(a), [['alone', n1(v) + '%']]);
        const p = SWE.pairs.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
        return tipHTML(`${famName(a)} + ${famName(b)}`, [['either solves', n1(p.union) + '%'],
          ['both solve', n1(p.both) + '%'], ['gain over better one', signed(p.gain) + ' pts']]);
      },
    })}
      <figcaption>Stronger blue is higher coverage. Every off-diagonal cell beats both of its diagonals —
        the families fail on different instances more than their headline scores suggest.</figcaption></figure>

    <h2>By instance difficulty</h2>
    <figure>${groupedBars(SWE.by_difficulty.map(d => ({
      label: d.tag, n: d.n, pop: d.pop, values: Object.fromEntries(fams.map(f => [f, d[f]])),
    })), famSeries(fams), { unit: '%', max: 100, width: 760, labelW: 132 })}
      ${legend(famOrder().filter(f => fams.includes(f)).map(f => ({ label: famName(f), color: famColor(f) })))}
      <figcaption>Each family's best model, on SWE-bench's own difficulty labels.
        Dashed rule is the all-model average for that tier.</figcaption></figure>

    <h2>By repository</h2>
    <p class="sub">Repositories with at least 12 instances. Same models, split by codebase.</p>
    ${table(SWE.by_repo, [
      { label: 'Repository', val: r => r.tag, html: r => `<span class="mono">${esc(r.tag)}</span>` },
      { label: 'Instances', val: r => r.n, num: true, html: r => r.n },
      { label: 'Field avg', val: r => r.pop, num: true, html: r => `${n1(r.pop)}%` },
      ...fams.map(f => ({
        label: famName(f), val: r => r[f], num: true,
        html: r => r[f] == null ? '<span class="muted">—</span>' : `${dot(f)}${n1(r[f])}`,
      })),
    ], { sort: 1 })}

    <h2>Instance explorer</h2>
    <p class="sub">One row per instance; a filled dot means that family's best model solved it.</p>
    <div class="controls">
      <input type="search" id="q" placeholder="Filter by instance or repo…">
      <select id="diff"><option value="">All difficulties</option>
        ${SWE.by_difficulty.map(d => `<option>${esc(d.tag)}</option>`).join('')}</select>
      <div class="toggle" id="segsel">
        <button data-seg="" class="on">All</button>
        <button data-seg="contested">Contested only</button>
        <button data-seg="none">Nobody solved</button>
      </div>
    </div>
    <div id="instances"></div>`;

  const bestIdx = Object.fromEntries(SWE.families.map(f =>
    [f.id, SWE.instance_models.indexOf(f.best_model)]));
  let q = '', diff = '', segment = '';
  const render = () => {
    const rows = SWE.instances.filter(r => {
      const solvedCount = r.pass.reduce((a, b) => a + b, 0);
      if (segment === 'contested' && (solvedCount === 0 || solvedCount === r.pass.length)) return false;
      if (segment === 'none' && solvedCount !== 0) return false;
      if (diff && r.difficulty !== diff) return false;
      if (q && !(r.id + ' ' + (r.repo || '')).toLowerCase().includes(q)) return false;
      return true;
    });
    document.getElementById('instances').innerHTML =
      `<p class="sub">${rows.length} instance${rows.length === 1 ? '' : 's'}.</p>` +
      table(rows, [
        { label: 'Instance', val: r => r.id, html: r => `<span class="mono">${esc(r.id)}</span>` },
        { label: 'Difficulty', val: r => r.difficulty, html: r => `<span class="pill">${esc(r.difficulty || '?')}</span>` },
        { label: 'Solved by', val: r => r.solve_rate, num: true, html: r => `${n1(r.solve_rate)}%` },
        { label: 'Discrimination', val: r => r.disc, num: true, html: r => r.disc == null ? '<span class="muted">—</span>' : n1(r.disc) },
        ...SWE.families.map(f => ({
          label: famName(f.id), val: r => r.pass[bestIdx[f.id]], num: true,
          html: r => r.pass[bestIdx[f.id]]
            ? `<span class="fam-${f.id}" title="solved"><span class="dot"></span></span>`
            : '<span class="muted" title="failed">·</span>',
        })),
      ], { sort: 2, asc: true });
  };
  render();
  document.getElementById('q').oninput = e => { q = e.target.value.toLowerCase(); render(); };
  document.getElementById('diff').onchange = e => { diff = e.target.value; render(); };
  document.getElementById('segsel').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    segment = b.dataset.seg;
    document.querySelectorAll('#segsel button').forEach(x => x.classList.toggle('on', x === b));
    render();
  };
}

function viewEffort() {
  const costBenches = BENCH.benchmarks.filter(b => b.has_cost && b.rows.some(r => r.cost != null));
  const tiers = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
  const curveCount = b => INDEX.effort_curves.filter(c => c.benchmark === b).length;
  const hasCost = b => (INDEX.benchmarks.find(x => x.id === b) || {}).has_cost ? 1 : 0;
  const curveBenches = [...new Set(INDEX.effort_curves.map(c => c.benchmark))]
    .sort((a, b) => hasCost(b) - hasCost(a) || curveCount(b) - curveCount(a));
  const fams = famOrder();

  app.innerHTML = `
    <h1 class="page">Effort &amp; cost</h1>
    <p class="sub">Reasoning effort is the one dial most vendors expose today, and only
      ${INDEX.families.filter(f => f.id !== 'other' && f.tiered_lines > 1).map(f => esc(f.name)).join(' and ')}
      ship it across their lineup. Two benchmarks publish cost per task alongside the score,
      which is what turns a leaderboard into a purchasing decision.</p>

    ${costBenches.map(b => {
      const pts = b.rows.filter(r => r.cost != null).map(r => ({
        x: r.cost, y: r.score, color: famColor(r.family),
        label: `${r.line}${r.effort ? '·' + r.effort : ''}`,
        tip: tipHTML(`${esc(r.line)}${r.effort ? ' · ' + esc(r.effort) : ''}`, [
          ['family', famName(r.family)], ['score', n1(r.score) + (b.pct ? '%' : '')],
          ['cost/task', money(r.cost)], ...(r.tokens ? [['output tokens', n0(r.tokens)]] : []),
          ['released', r.released]]),
      }));
      return `<h2>${esc(b.name)}</h2>
        <p class="sub">${esc(b.what)}</p>
        <figure>${scatter(pts, { unit: b.pct ? '%' : '', width: 900, height: 520 })}
          ${legend(fams.filter(f => b.rows.some(r => r.family === f)).map(f => ({ label: famName(f), color: famColor(f) })))}
          <figcaption>Dashed line is the efficient frontier: no cheaper run scores higher.
            Points to its right pay more for no additional score.</figcaption></figure>`;
    }).join('')}

    <h2>Effort ladders</h2>
    <p class="sub">The same weights at different reasoning budgets. A flat line means the top tier is wasted money.</p>
    ${curveBenches.map(bid => {
      const cs = INDEX.effort_curves.filter(c => c.benchmark === bid);
      if (cs.length < 2) return '';
      return `<h3>${esc(benchName(bid))}</h3>
        <figure>${ladder(cs.map(c => ({
          label: c.line, color: famColor(c.family),
          points: c.points.map(p => ({
            tier: p.effort, y: p.score,
            tip: tipHTML(`${esc(c.line)} · ${esc(p.effort)}`, [
              ['score', n1(p.score) + benchUnit(bid)],
              ...(p.cost != null ? [['cost/task', money(p.cost)]] : []),
              ...(p.tokens != null ? [['output tokens', n0(p.tokens)]] : [])]),
          })),
        })), { tiers, unit: benchUnit(bid), width: 760, height: 320 })}</figure>`;
    }).join('')}

    <h2>What the top tier adds</h2>
    <p class="sub">Cheapest published tier to dearest, per line and benchmark.</p>
    ${table(INDEX.effort_curves, [
      { label: 'Family', val: r => r.family, html: r => `${dot(r.family)}${esc(famName(r.family))}` },
      { label: 'Line', val: r => r.line, html: r => `<span class="mono">${esc(r.line)}</span>` },
      { label: 'Benchmark', val: r => r.benchmark, html: r => esc(benchName(r.benchmark)) },
      { label: 'Tiers', val: r => r.points.length, num: true, html: r => r.points.map(p => effortPill(p.effort)).join(' ') },
      { label: 'Δ score', val: r => r.d_score, num: true, html: r => `${signed(r.d_score)}${benchUnit(r.benchmark)}` },
      { label: 'Cost ×', val: r => r.cost_mult, num: true, html: r => r.cost_mult == null ? '<span class="muted">—</span>' : `${n1(r.cost_mult)}×` },
    ], { sort: 4 })}`;
}

function viewBenchmarks() {
  app.innerHTML = `
    <h1 class="page">Benchmarks</h1>
    <p class="sub">${INDEX.benchmarks.length} coding benchmarks with at least one in-window run,
      from Epoch AI's benchmark database. Scores are whatever the benchmark publishes — they are
      comparable within a column, never across columns.</p>
    <div class="grid cols-2">
      ${INDEX.benchmarks.map(b => `
        <a class="famcard fam-${b.leader.family}" href="#/benchmark/${b.id}">
          <div class="name">${esc(b.name)}</div>
          <div class="vendor">${esc(b.what)}</div>
          <div class="stat"><span>Leader</span><span>${dot(b.leader.family)}${esc(b.leader.line)}${b.leader.effort ? ' · ' + esc(b.leader.effort) : ''}</span></div>
          <div class="stat"><span>Top score</span><span>${n1(b.leader.score)}${b.pct ? '%' : ''}</span></div>
          <div class="stat"><span>Lines · families</span><span>${b.n_lines} · ${b.n_families}</span></div>
          <div class="stat"><span>Spread</span><span>${n1(b.range[0])} – ${n1(b.range[1])}</span></div>
        </a>`).join('')}
    </div>`;
}

function viewBenchmark(id) {
  const b = BENCH.benchmarks.find(x => x.id === id);
  if (!b) { app.innerHTML = '<p>Unknown benchmark.</p>'; return; }
  const fams = [...new Set(b.rows.map(r => r.family))];
  const top = b.rows.slice(0, 22);
  app.innerHTML = `
    <div class="crumb"><a href="#/benchmarks">Benchmarks</a> /</div>
    <h1 class="page">${esc(b.name)}</h1>
    <p class="sub">${esc(b.what)} · <a href="${esc(b.url)}">benchmark home</a> ·
      ${b.rows.length} in-window runs across ${b.n_families} families.</p>
    <figure>${hbars(top.map(r => ({
      label: `${r.line}${r.effort ? ' · ' + r.effort : ''}`, value: r.score, color: famColor(r.family),
      tip: tipHTML(`${esc(r.line)}${r.effort ? ' · ' + esc(r.effort) : ''}`, [
        ['family', famName(r.family)], ['score', n1(r.score) + (b.pct ? '%' : '')],
        ...(r.cost != null ? [['cost/task', money(r.cost)]] : []),
        ...(r.harness ? [['harness', esc(r.harness)]] : []),
        ['released', r.released], ['runs', r.n_runs]]),
    })), { unit: b.pct ? '%' : '', max: b.pct ? 100 : undefined, labelW: 210, width: 760 })}
      ${legend(famOrder().filter(f => fams.includes(f)).map(f => ({ label: famName(f), color: famColor(f) })))}
      <figcaption>${b.rows.length > 22 ? `Top 22 of ${b.rows.length} runs; ` : ''}best run per
        line and effort tier. ${b.pct ? '' : 'Unit: ' + esc(b.unit) + '. '}Hover for cost and harness.</figcaption></figure>
    <h2>All runs</h2>
    ${table(b.rows, [
      { label: 'Family', val: r => r.family, html: r => `${dot(r.family)}<a href="#/family/${r.family}">${esc(famName(r.family))}</a>` },
      { label: 'Line', val: r => r.line, html: r => `<span class="mono">${esc(r.line)}</span>${r.note ? ` <span class="pill">${esc(r.note)}</span>` : ''}` },
      { label: 'Effort', val: r => r.effort, html: r => effortPill(r.effort) || '<span class="muted">—</span>' },
      { label: 'Score', val: r => r.score, num: true, html: r => `${n1(r.score)}${b.pct ? '%' : ''}` },
      { label: 'Cost/task', val: r => r.cost, num: true, html: r => r.cost == null ? '<span class="muted">—</span>' : money(r.cost) },
      { label: 'Harness', val: r => r.harness, html: r => r.harness ? esc(r.harness) : '<span class="muted">—</span>' },
      { label: 'Released', val: r => r.released, html: r => esc(r.released) },
      { label: 'Runs', val: r => r.n_runs, num: true, html: r => r.n_runs > 1 ? `best of ${r.n_runs}` : '1' },
      { label: 'Logs', val: r => r.logs, html: r => r.logs ? `<a href="${esc(r.logs)}">view</a>` : '<span class="muted">—</span>' },
    ], { sort: 3 })}`;
}

function viewMethod() {
  const c = SWE.coverage;
  app.innerHTML = `
    <h1 class="page">Method</h1>
    <p class="sub">${windowLine()}</p>

    <h2>The window</h2>
    <p class="sub">Every result here comes from a model released on or after
      <b>${esc(INDEX.window_start)}</b>. Older models are dropped at the build step, not hidden in the UI:
      a 2024 checkpoint tells you nothing about what to deploy now, and keeping it in the cohort
      inflates every "solve rate" and every z-score computed against it. One consequence is that
      per-problem difficulty on this site means <em>difficulty for current frontier models</em>.</p>

    <h2>Sources</h2>
    <div class="tablewrap"><table>
      <thead><tr><th>Data</th><th>Source</th></tr></thead>
      <tbody>
        <tr><td>Aggregate benchmark scores, release dates, cost and effort columns</td>
          <td><a href="https://epoch.ai/data/benchmark_data.zip">Epoch AI benchmark database</a> (CC-BY, updated daily)</td></tr>
        <tr><td>Per-instance SWE-bench Verified pass/fail</td>
          <td>Epoch inspect logs — <span class="mono">summaries.json</span> read out of each run's
            <span class="mono">.eval</span> zip over HTTP range requests</td></tr>
        <tr><td>Instance difficulty and repository</td>
          <td><a href="https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified">princeton-nlp/SWE-bench_Verified</a></td></tr>
      </tbody></table></div>

    <h2>Families, lines and effort tiers</h2>
    <p class="sub">A <b>family</b> is a vendor's model program (Claude, OpenAI, Google, GLM, Qwen, Kimi;
      everything else is grouped as Other labs). A <b>line</b> is one model — <span class="mono">claude-opus-4.7</span>,
      <span class="mono">gpt-5.6-sol</span> — with date stamps, <span class="mono">-preview</span> and
      <span class="mono">-pre-release</span> suffixes normalised away. An <b>effort tier</b>
      (none · low · medium · high · xhigh · max) is a setting of that same line, not a separate model,
      so tiers are compared vertically inside a line and never mixed into a cross-model ranking.
      Where a benchmark reports several runs of one line and tier (different agents on Terminal-Bench,
      repeat runs on SWE-bench) the best run is shown and the run count is given.</p>

    <h2>The matched comparison</h2>
    <p class="sub">SWE-bench Verified is the only benchmark here that publishes per-instance results,
      so it carries the head-to-head. Models are compared on the ${SWE.n_instances} instances
      <em>all</em> of them were run on; ${SWE.n_dropped} instance${SWE.n_dropped === 1 ? '' : 's'} with
      partial coverage are excluded rather than filled in. An instance counts as solved when its score
      is ≥ 0.5 (repeat runs are averaged first). Intervals are 95% Wilson score intervals on
      ${SWE.n_instances} Bernoulli trials — about ±3.5 points at these rates, which is wider than
      most of the gaps between neighbouring models.</p>
    <p class="sub"><b>Oracle numbers are ceilings, not products.</b> "Either family solves it" assumes a router
      that already knows the answer. It measures how differently two models fail, and bounds what any
      real routing or best-of-n system could deliver.</p>

    <h2>Coverage gaps</h2>
    <p class="sub">${c.with_logs} of ${c.leaderboard_runs} in-window SWE-bench runs publish inspect logs.
      ${c.missing.length ? 'Missing: ' + c.missing.map(m =>
        `<span class="mono">${esc(m.line)}${m.effort ? '·' + esc(m.effort) : ''}</span> (${n1(m.score)}%)`).join(', ') +
        ' — these appear in aggregate tables but not in the head-to-head.' : ''}</p>

    <h2>Caveats</h2>
    <ul class="findings">
      <li>Benchmark scores come from different harnesses, prompts and scaffolds. Within a benchmark the
        comparison is close to like-for-like; across benchmarks it is not, so nothing here averages
        scores from different benchmarks into one number.</li>
      <li>SWE-bench Verified is Python-only and drawn from twelve repositories. ${SWE.segments.all}
        of its ${SWE.n_instances} usable instances are solved by every current model — it is
        measuring less each release.</li>
      <li>Cost figures are the benchmark's own measurements at the time of the run and move with
        vendor pricing.</li>
      <li>Release dates are Epoch's. A model evaluated long after release still enters the window by
        its release date.</li>
    </ul>

    <h2>Rebuilding</h2>
    <p class="sub">The pipeline is four steps — fetch aggregates, fetch per-instance logs, normalise to
      the window, export JSON — and runs weekly in CI. The window length lives in one constant
      (<span class="mono">pipeline/families.py</span>).</p>`;
}

// --- routing -----------------------------------------------------------------
const routes = [
  [/^#?\/?$/, viewOverview],
  [/^#\/families$/, viewFamilies],
  [/^#\/family\/([\w.-]+)$/, viewFamily],
  [/^#\/head-to-head$/, viewHeadToHead],
  [/^#\/effort$/, viewEffort],
  [/^#\/benchmarks$/, viewBenchmarks],
  [/^#\/benchmark\/([\w.-]+)$/, viewBenchmark],
  [/^#\/method$/, viewMethod],
];

function route() {
  const h = location.hash || '#/';
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('on', a.getAttribute('href') === h ||
      (h.startsWith('#/family/') && a.getAttribute('href') === '#/families') ||
      (h.startsWith('#/benchmark/') && a.getAttribute('href') === '#/benchmarks')));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { fn(m[1]); scrollTo(0, 0); return; }
  }
  app.innerHTML = '<h1 class="page">Not found</h1><p class="sub"><a href="#/">Back to the overview</a></p>';
}

document.getElementById('theme').onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('theme', document.documentElement.dataset.theme);
};
if (localStorage.getItem('theme')) document.documentElement.dataset.theme = localStorage.getItem('theme');

(async () => {
  [INDEX, SWE, BENCH] = await Promise.all([
    load('data/index.json'), load('data/swe.json'), load('data/benchmarks.json'),
  ]);
  document.getElementById('footer').innerHTML =
    `Rebuilt ${esc(INDEX.generated.slice(0, 16).replace('T', ' '))} UTC · window from ${esc(INDEX.window_start)} ·
     ${INDEX.headline.n_lines} model lines · data from
     <a href="https://epoch.ai/data/benchmark_data.zip">Epoch AI</a> (CC-BY) and
     <a href="https://www.swebench.com/">SWE-bench Verified</a>.`;
  addEventListener('hashchange', route);
  route();
})();
