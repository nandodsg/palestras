// Demos interativas do deck. Tudo sintético: um "associado fictício" num mapa estilizado (sem tiles, roda offline).
// Mundo em metros (plano local de 3,2 km × 1,8 km). As distâncias do DBSCAN são euclidianas nesse plano, o que equivale
// à haversine nessa escala; o slide de código mostra a versão com haversine sobre lat/long.
(function () {
  const C = {
    bg: '#0c0c0d', white: '#f7f9fa', steel: '#828384', ash: '#6b6b6b', graphite: '#474747',
    violet: '#af50ff', lavender: '#e1bdff', hair: 'rgba(247,249,250,0.14)',
  };
  // paleta de clusters sem cor nova: família violeta + escala acromática
  const PAL = ['#af50ff', '#f7f9fa', '#e1bdff', '#9a9b9c', '#c98cff', '#d4d4d4', '#7a3ab3', '#bdbdbd'];
  const W = 3200, H = 1800;
  const MONO = '"JetBrains Mono", Consolas, monospace';
  const SANS = 'Inter, "Segoe UI", sans-serif';

  // ---------- dados sintéticos (semente fixa: a demo é sempre igual) ----------
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  const PLACES = [
    { name: 'casa', x: 2080, y: 990, n: 53, sd: 32 },
    { name: 'casa dos pais', x: 920, y: 600, n: 50, sd: 32 },
    { name: 'mercado do bairro', x: 2270, y: 1200, n: 9, sd: 20 },
    { name: 'academia', x: 1880, y: 1240, n: 7, sd: 20 },
  ];
  const ADDRESS = { x: 2940, y: 330 };
  const FLOOD_RAW = [[-200, -200], [1280, -200], [1370, 360], [1200, 760], [1560, 830], [2240, 860], [2370, 1060], [2180, 1115],
    [1720, 1085], [1280, 1170], [600, 1450], [-200, 1560]];
  const RIVER_RAW = [[-200, -200], [360, -200], [380, 120], [470, 300], [400, 600], [500, 920], [430, 1240], [300, 1600], [280, 2000], [-200, 2000]];
  // suaviza o contorno (Chaikin) pra parecer margem de rio, não polígono de CAD
  function chaikin(p, it) {
    for (let k = 0; k < it; k++) {
      const q = [];
      p.forEach((a, i) => { const b = p[(i + 1) % p.length]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); });
      p = q;
    }
    return p;
  }
  const FLOOD = chaikin(FLOOD_RAW, 3), RIVER = chaikin(RIVER_RAW, 3);

  const PTS = (function () {
    const r = rng(20240503);
    const pts = [];
    PLACES.forEach((p, pi) => { for (let i = 0; i < p.n; i++) pts.push({ x: p.x + gauss(r) * p.sd, y: p.y + gauss(r) * p.sd, src: pi }); });
    // vizinhança da casa: GPS ruim / padaria a 200–300 m
    for (let i = 0; i < 3; i++) { const a = 3.6 + r() * 2.2; pts.push({ x: 2080 + Math.cos(a) * (150 + r() * 60), y: 990 + Math.sin(a) * (150 + r() * 60), src: -2 }); }
    // viagens e transações isoladas
    const lone = [[2760, 240], [3040, 1560], [680, 1640], [1400, 1560], [2520, 600], [3120, 920], [600, 1040], [1560, 280]];
    lone.forEach(([x, y]) => pts.push({ x: x + gauss(r) * 25, y: y + gauss(r) * 25, src: -1 }));
    return pts;
  })();

  // ---------- algoritmos ----------
  function d2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  function neighbors(pts, i, eps) { const e2 = eps * eps, out = []; for (let j = 0; j < pts.length; j++) if (d2(pts[i], pts[j]) <= e2) out.push(j); return out; }

  function* dbscanSteps(pts, eps, minPts) {
    const n = pts.length, label = new Array(n).fill(undefined), type = new Array(n).fill(null);
    const order = pts.map((p, i) => i).sort((a, b) => pts[a].x - pts[b].x);
    let c = -1;
    for (const i of order) {
      if (label[i] !== undefined) continue;
      const N = neighbors(pts, i, eps);
      yield { kind: 'visit', i, N, label, type };
      if (N.length < minPts) { label[i] = -1; type[i] = 'noise'; yield { kind: 'noise', i, N, label, type }; continue; }
      c++; label[i] = c; type[i] = 'core';
      yield { kind: 'core', i, N, c, label, type };
      const seeds = N.filter(j => j !== i);
      while (seeds.length) {
        const j = seeds.shift();
        if (label[j] === -1) { label[j] = c; type[j] = 'border'; continue; }
        if (label[j] !== undefined) continue;
        label[j] = c;
        const Nj = neighbors(pts, j, eps);
        if (Nj.length >= minPts) { type[j] = 'core'; for (const k of Nj) if (label[k] === undefined || label[k] === -1) seeds.push(k); }
        else type[j] = 'border';
        yield { kind: 'expand', i: j, N: Nj, c, label, type };
      }
    }
    yield { kind: 'done', label, type };
  }
  function dbscan(pts, eps, minPts) {
    let last; for (const s of dbscanSteps(pts, eps, minPts)) last = s;
    return { label: last.label.map(v => v === undefined ? -1 : v), type: last.type };
  }
  // clusters ordenados por tamanho (C1 = maior)
  function summarize(pts, label) {
    const groups = {};
    label.forEach((l, i) => { if (l >= 0) (groups[l] = groups[l] || []).push(i); });
    const list = Object.values(groups).sort((a, b) => b.length - a.length).map(idx => {
      const cx = idx.reduce((s, i) => s + pts[i].x, 0) / idx.length, cy = idx.reduce((s, i) => s + pts[i].y, 0) / idx.length;
      const votes = {}; idx.forEach(i => { const s = pts[i].src; votes[s] = (votes[s] || 0) + 1; });
      const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
      const names = [...new Set(idx.map(i => pts[i].src).filter(s => s >= 0))].map(s => PLACES[s].name);
      return { idx, cx, cy, n: idx.length, place: +top >= 0 ? PLACES[+top].name : 'arredores', names };
    });
    const remap = {}; Object.keys(groups).forEach(k => { remap[k] = list.findIndex(g => g.idx.includes(groups[k][0])); });
    return { list, rank: label.map(l => l >= 0 ? remap[l] : -1), noise: label.filter(l => l < 0).length };
  }

  function kmeans(pts, k) {
    const r = rng(7 + k);
    const cents = [{ ...pts[Math.floor(r() * pts.length)] }];
    while (cents.length < k) { // k-means++
      const dist = pts.map(p => Math.min(...cents.map(c => d2(p, c))));
      const tot = dist.reduce((a, b) => a + b, 0); let t = r() * tot, j = 0;
      while (t > dist[j]) { t -= dist[j]; j++; }
      cents.push({ x: pts[j].x, y: pts[j].y });
    }
    let lab = new Array(pts.length).fill(0);
    for (let it = 0; it < 60; it++) {
      lab = pts.map(p => { let b = 0, bd = Infinity; cents.forEach((c, ci) => { const d = d2(p, c); if (d < bd) { bd = d; b = ci; } }); return b; });
      cents.forEach((c, ci) => { const m = pts.filter((p, i) => lab[i] === ci); if (m.length) { c.x = m.reduce((s, p) => s + p.x, 0) / m.length; c.y = m.reduce((s, p) => s + p.y, 0) / m.length; } });
    }
    return { lab, cents };
  }

  function hull(points) {
    const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  // ray casting: raio horizontal pra direita; devolve as interseções
  function rayCast(pt, poly) {
    const hits = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt.y) !== (yj > pt.y)) {
        const x = (xj - xi) * (pt.y - yi) / (yj - yi) + xi;
        if (x > pt.x) hits.push({ x, y: pt.y });
      }
    }
    return { inside: hits.length % 2 === 1, hits };
  }

  // ---------- desenho ----------
  function setup(canvas) {
    const dpr = 2;
    canvas.width = canvas.offsetWidth * dpr; canvas.height = canvas.offsetHeight * dpr;
    const ctx = canvas.getContext('2d');
    const pad = 36 * dpr;
    const s = Math.min((canvas.width - 2 * pad) / W, (canvas.height - 2 * pad) / H);
    const ox = (canvas.width - W * s) / 2, oy = (canvas.height - H * s) / 2;
    return {
      canvas, ctx, dpr, s,
      X: x => ox + x * s, Y: y => oy + y * s,
      inv: (px, py) => ({ x: (px - ox) / s, y: (py - oy) / s }),
    };
  }
  function poly(v, pts) { const c = v.ctx; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(v.X(x), v.Y(y)) : c.moveTo(v.X(x), v.Y(y))); c.closePath(); }

  function drawMap(v, opts = {}) {
    const c = v.ctx, k = v.dpr;
    if (v.clipped) c.restore();
    c.fillStyle = C.bg; c.fillRect(0, 0, v.canvas.width, v.canvas.height);
    c.save(); c.beginPath(); c.rect(v.X(0), v.Y(0), W * v.s, H * v.s); c.clip(); v.clipped = true;
    // ruas
    c.lineWidth = 1 * k;
    for (let x = 0; x <= W; x += 160) { c.strokeStyle = x % 800 === 0 ? 'rgba(247,249,250,0.07)' : 'rgba(247,249,250,0.03)'; c.beginPath(); c.moveTo(v.X(x), v.Y(0)); c.lineTo(v.X(x + 120), v.Y(H)); c.stroke(); }
    for (let y = 0; y <= H; y += 160) { c.strokeStyle = y % 800 === 0 ? 'rgba(247,249,250,0.07)' : 'rgba(247,249,250,0.03)'; c.beginPath(); c.moveTo(v.X(0), v.Y(y)); c.lineTo(v.X(W), v.Y(y - 80)); c.stroke(); }
    // rio
    poly(v, RIVER); c.fillStyle = 'rgba(247,249,250,0.05)'; c.fill(); c.strokeStyle = 'rgba(247,249,250,0.16)'; c.stroke();
    c.save(); c.translate(v.X(190), v.Y(960)); c.rotate(-Math.PI / 2);
    c.fillStyle = 'rgba(247,249,250,0.28)'; c.font = `${12 * k}px ${MONO}`; c.textAlign = 'center';
    c.fillText('R  I  O', 0, 0); c.restore();
    if (opts.flood) {
      c.save(); poly(v, FLOOD);
      c.fillStyle = 'rgba(175,80,255,0.16)'; c.fill();
      c.shadowColor = 'rgba(175,80,255,0.8)'; c.shadowBlur = 18 * k;
      c.strokeStyle = 'rgba(225,189,255,0.7)'; c.lineWidth = 1.5 * k; c.setLineDash([6 * k, 6 * k]); c.stroke();
      c.restore();
      label(v, 'MANCHA DE INUNDAÇÃO (ILUSTRATIVA)', 1400, 150, C.lavender);
    }
  }
  function label(v, txt, x, y, color, size = 12, align = 'left') {
    const c = v.ctx; c.fillStyle = color; c.font = `${size * v.dpr}px ${MONO}`; c.textAlign = align; c.fillText(txt, v.X(x), v.Y(y));
  }
  function text(v, txt, px, py, color, size = 18, align = 'left', weight = 400) {
    const c = v.ctx; c.fillStyle = color; c.font = `${weight} ${size * v.dpr}px ${SANS}`; c.textAlign = align; c.fillText(txt, px, py);
  }
  function dot(v, p, color, r = 4.5, ring = false) {
    const c = v.ctx; c.beginPath(); c.arc(v.X(p.x), v.Y(p.y), r * v.dpr, 0, Math.PI * 2);
    if (ring) { c.strokeStyle = color; c.lineWidth = 1.5 * v.dpr; c.stroke(); } else { c.fillStyle = color; c.fill(); }
  }
  function noiseMark(v, p) {
    const c = v.ctx, k = v.dpr, x = v.X(p.x), y = v.Y(p.y), r = 4.5 * k;
    c.strokeStyle = C.ash; c.lineWidth = 1.5 * k;
    c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke();
  }
  function cross(v, x, y, color, r = 11) {
    const c = v.ctx, k = v.dpr, px = v.X(x), py = v.Y(y);
    c.strokeStyle = color; c.lineWidth = 2.5 * k;
    c.beginPath(); c.moveTo(px - r * k, py - r * k); c.lineTo(px + r * k, py + r * k); c.moveTo(px + r * k, py - r * k); c.lineTo(px - r * k, py + r * k); c.stroke();
  }
  function drawHull(v, idx, color, pad = 30) {
    const pts = []; idx.forEach(i => { const p = PTS[i]; for (let a = 0; a < 8; a++) pts.push({ x: p.x + Math.cos(a * 0.785) * pad, y: p.y + Math.sin(a * 0.785) * pad }); });
    const h = hull(pts); const c = v.ctx;
    c.beginPath(); h.forEach((p, i) => i ? c.lineTo(v.X(p.x), v.Y(p.y)) : c.moveTo(v.X(p.x), v.Y(p.y))); c.closePath();
    c.strokeStyle = color; c.globalAlpha = 0.55; c.lineWidth = 1 * v.dpr; c.stroke(); c.globalAlpha = 1;
    return h.reduce((m, p) => p.y < m.y ? p : m, h[0]);
  }
  function pct(n) { return Math.round(n / PTS.length * 100) + '%'; }

  // ---------- liga controles do slide ----------
  function controls(slide, onChange) {
    const state = {};
    slide.querySelectorAll('[data-ctl]').forEach(el => {
      const name = el.dataset.ctl;
      if (el.classList.contains('seg')) {
        const btns = el.querySelectorAll('button');
        state[name] = el.querySelector('.on') ? el.querySelector('.on').dataset.v : btns[0].dataset.v;
        btns.forEach(b => b.addEventListener('click', () => {
          btns.forEach(x => x.classList.remove('on')); b.classList.add('on'); state[name] = b.dataset.v; onChange(name);
        }));
      } else {
        const inp = el.querySelector('input');
        state[name] = +inp.value;
        inp.addEventListener('input', () => { state[name] = +inp.value; onChange(name); });
      }
    });
    return state;
  }
  const out = (slide, name) => slide.querySelector(`[data-out="${name}"]`);
  const setVal = (slide, ctl, txt) => { const el = slide.querySelector(`[data-ctl="${ctl}"] .val`); if (el) el.textContent = txt; };
  const act = (slide, name, fn) => { const b = slide.querySelector(`[data-act="${name}"]`); if (b) b.addEventListener('click', fn); };

  // ======================================================== DEMO 1 · pontos / k-means / DBSCAN
  function demoCompare(slide) {
    const v = setup(slide.querySelector('#cv-compare'));
    const st = controls(slide, draw);
    const db = summarize(PTS, dbscan(PTS, 120, 5).label);
    function draw() {
      const kRow = slide.querySelector('[data-ctl="k"]');
      kRow.style.opacity = st.mode === 'kmeans' ? 1 : 0.25;
      setVal(slide, 'k', st.k);
      drawMap(v);
      out(slide, 'n').textContent = PTS.length;
      if (st.mode === 'raw') {
        PTS.forEach(p => dot(v, p, 'rgba(247,249,250,0.8)', 4));
        out(slide, 'groups').textContent = '?'; out(slide, 'noise').textContent = '?'; out(slide, 'needk').textContent = '—';
        out(slide, 'msg').innerHTML = 'Cada ponto é uma transação com geolocalização. <b>Como eu agrupo isso?</b>';
      } else if (st.mode === 'kmeans') {
        const km = kmeans(PTS, st.k);
        PTS.forEach((p, i) => dot(v, p, PAL[km.lab[i] % PAL.length], 4));
        km.cents.forEach((c, i) => { cross(v, c.x, c.y, PAL[i % PAL.length]); label(v, 'k' + (i + 1), c.x + 50, c.y - 36, PAL[i % PAL.length], 14); });
        out(slide, 'groups').textContent = st.k; out(slide, 'noise').textContent = '0'; out(slide, 'needk').textContent = 'Sim';
        out(slide, 'msg').innerHTML = 'O k-means <b>obriga todo ponto a entrar num grupo</b>, inclusive a viagem. E eu preciso dizer o k antes.';
      } else {
        db.list.forEach((g, gi) => { const top = drawHull(v, g.idx, PAL[gi % PAL.length]); label(v, `C${gi + 1} · ${pct(g.n)}`, top.x, top.y - 16, PAL[gi % PAL.length], 13); });
        PTS.forEach((p, i) => db.rank[i] >= 0 ? dot(v, p, PAL[db.rank[i] % PAL.length], 4) : noiseMark(v, p));
        out(slide, 'groups').textContent = db.list.length; out(slide, 'noise').textContent = db.noise; out(slide, 'needk').textContent = 'Não';
        out(slide, 'msg').innerHTML = `O DBSCAN <b>descobre ${db.list.length} lugares sozinho</b> e deixa ${db.noise} transações soltas como ruído.`;
      }
    }
    draw();
    return { enter: draw, leave() {} };
  }

  // ======================================================== DEMO 2 · DBSCAN passo a passo
  function demoStep(slide) {
    const v = setup(slide.querySelector('#cv-step'));
    let gen = null, cur = null, timer = null;
    const st = controls(slide, name => { stop(); showFinal(); });
    function counts(label, type) {
      const s = summarize(PTS, label.map(l => l === undefined ? -1 : l));
      out(slide, 'clusters').textContent = s.list.length;
      out(slide, 'noise').textContent = type.filter(t => t === 'noise').length;
      out(slide, 'core').textContent = type.filter(t => t === 'core').length;
      out(slide, 'border').textContent = type.filter(t => t === 'border').length;
      return s;
    }
    function render(step, final) {
      drawMap(v);
      const { label: lab, type } = step;
      const s = counts(lab, type);
      if (final) s.list.forEach((g, gi) => { const top = drawHull(v, g.idx, PAL[gi % PAL.length]); label(v, `C${gi + 1} · ${pct(g.n)}`, top.x, top.y - 16, PAL[gi % PAL.length], 13); });
      PTS.forEach((p, i) => {
        const l = lab[i];
        if (l === undefined) dot(v, p, 'rgba(130,131,132,0.55)', 3.5);
        else if (l === -1) noiseMark(v, p);
        else {
          const col = final ? PAL[s.rank[i] % PAL.length] : (step.c === l ? C.violet : PAL[(s.rank[i] + 1) % PAL.length]);
          dot(v, p, col, type[i] === 'core' ? 4.5 : 3.5, type[i] === 'border');
        }
      });
      if (!final && step.i !== undefined) {
        const p = PTS[step.i], c = v.ctx;
        c.strokeStyle = 'rgba(247,249,250,0.5)'; c.lineWidth = 1 * v.dpr;
        step.N.forEach(j => { c.beginPath(); c.moveTo(v.X(p.x), v.Y(p.y)); c.lineTo(v.X(PTS[j].x), v.Y(PTS[j].y)); c.stroke(); });
        c.beginPath(); c.arc(v.X(p.x), v.Y(p.y), st.eps * v.s, 0, Math.PI * 2);
        c.fillStyle = 'rgba(175,80,255,0.10)'; c.fill(); c.setLineDash([4 * v.dpr, 5 * v.dpr]); c.strokeStyle = C.white; c.stroke(); c.setLineDash([]);
        dot(v, p, C.white, 6);
        const kinds = { visit: 'visitando', noise: 'poucos vizinhos → ruído (por enquanto)', core: 'núcleo! abre o cluster C' + (step.c + 1), expand: 'expandindo C' + (step.c + 1) };
        out(slide, 'msg').innerHTML = `<b>${step.N.length} vizinhos</b> em ε (contando ele mesmo) · ${kinds[step.kind] || ''}`;
      }
      // escala
      const c = v.ctx, x0 = v.canvas.width - 40 * v.dpr - 200 * v.s, y0 = v.canvas.height - 28 * v.dpr;
      c.strokeStyle = C.steel; c.lineWidth = 1 * v.dpr; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + 200 * v.s, y0); c.stroke();
      text(v, '200 m', x0 + 100 * v.s, y0 - 10 * v.dpr, C.steel, 12, 'center');
    }
    function showFinal() {
      setVal(slide, 'eps', st.eps + ' m'); setVal(slide, 'minpts', st.minpts);
      const r = dbscan(PTS, st.eps, st.minpts);
      render({ label: r.label, type: r.type.map((t, i) => r.label[i] === -1 ? 'noise' : t) }, true);
      const n = slide.querySelector('[data-out="clusters"]').textContent;
      out(slide, 'msg').innerHTML = `ε = <b>${st.eps} m</b>, minPts = <b>${st.minpts}</b> → <b>${n} lugares</b>. Aperte ▶ pra ver o algoritmo trabalhando.`;
    }
    function start() { gen = dbscanSteps(PTS, st.eps, st.minpts); cur = null; }
    function step() {
      if (!gen) start();
      const r = gen.next();
      if (r.done || r.value.kind === 'done') { stop(); showFinal(); gen = null; return false; }
      cur = r.value; render(cur, false); return true;
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    act(slide, 'play', () => { stop(); start(); timer = setInterval(() => { step(); step(); }, 70); });
    act(slide, 'step', () => { stop(); step(); });
    act(slide, 'finish', () => { stop(); gen = null; showFinal(); });
    act(slide, 'reset', () => {
      stop(); gen = null;
      const lab = new Array(PTS.length).fill(undefined), type = new Array(PTS.length).fill(null);
      render({ label: lab, type }, false);
      ['clusters', 'noise', 'core', 'border'].forEach(k => out(slide, k).textContent = '0');
      out(slide, 'msg').innerHTML = 'Tudo cinza: nenhum ponto visitado. ▶ ou Passo.';
    });
    showFinal();
    return { enter: showFinal, leave: stop };
  }

  // ======================================================== DEMO 3 · centroides
  function demoCentroid(slide) {
    const v = setup(slide.querySelector('#cv-centroid'));
    const s = summarize(PTS, dbscan(PTS, 120, 5).label);
    function draw() {
      drawMap(v);
      s.list.forEach((g, gi) => drawHull(v, g.idx, PAL[gi % PAL.length]));
      PTS.forEach((p, i) => s.rank[i] >= 0 ? dot(v, p, PAL[s.rank[i] % PAL.length], 3, false) : noiseMark(v, p));
      v.ctx.globalAlpha = 1;
      s.list.forEach((g, gi) => {
        cross(v, g.cx, g.cy, C.white, 13);
        label(v, `C${gi + 1}`, g.cx + 95, g.cy - 30, PAL[gi % PAL.length], 15);
        label(v, `${g.n} tx · ${pct(g.n)}`, g.cx + 95, g.cy + 22, C.steel, 12);
      });
      const rows = s.list.map((g, gi) => `<tr><td><span style="color:${PAL[gi % PAL.length]}">C${gi + 1}</span> <span class="muted">· entrevista: ${g.place}</span></td><td>${g.n} tx · ${pct(g.n)}</td></tr>`);
      rows.push(`<tr><td class="muted">ruído (viagens, transações soltas)</td><td class="muted">${s.noise} tx · ${pct(s.noise)}</td></tr>`);
      out(slide, 'table').innerHTML = rows.join('');
    }
    draw();
    return { enter: draw, leave() {} };
  }

  // ======================================================== DEMO 4 · mancha (ponto-em-polígono)
  function demoFlood(slide) {
    const canvas = slide.querySelector('#cv-flood');
    const v = setup(canvas);
    const s = summarize(PTS, dbscan(PTS, 120, 5).label);
    let probe = null;
    const st = controls(slide, () => { probe = null; draw(); });
    function ray(p, strong) {
      const r = rayCast(p, FLOOD), c = v.ctx;
      c.strokeStyle = strong ? 'rgba(247,249,250,0.75)' : 'rgba(247,249,250,0.25)'; c.lineWidth = 1 * v.dpr; c.setLineDash([3 * v.dpr, 5 * v.dpr]);
      c.beginPath(); c.moveTo(v.X(p.x), v.Y(p.y)); c.lineTo(v.X(W), v.Y(p.y)); c.stroke(); c.setLineDash([]);
      r.hits.forEach(h => { c.beginPath(); c.arc(v.X(h.x), v.Y(h.y), 5 * v.dpr, 0, 6.29); c.fillStyle = strong ? C.white : C.steel; c.fill(); });
      return r;
    }
    function draw() {
      drawMap(v, { flood: true });
      PTS.forEach(p => dot(v, p, 'rgba(247,249,250,0.18)', 2.5));
      let last = null;
      if (st.source === 'address') {
        last = ray(ADDRESS, !probe);
        const c = v.ctx, x = v.X(ADDRESS.x), y = v.Y(ADDRESS.y), r = 11 * v.dpr;
        c.strokeStyle = C.white; c.lineWidth = 2 * v.dpr; c.strokeRect(x - r, y - r, 2 * r, 2 * r);
        label(v, 'ENDEREÇO CADASTRAL', ADDRESS.x, ADDRESS.y - 80, C.white, 13, 'center');
        label(v, '(cidade antiga)', ADDRESS.x, ADDRESS.y + 120, C.steel, 12, 'center');
        out(slide, 'hit').textContent = 'Não';
        out(slide, 'msg').innerHTML = 'Pelo cadastro, essa pessoa <b>não aparece</b> na lista de afetados.';
      } else {
        const inside = [], hits = [];
        s.list.forEach((g, gi) => {
          const r = ray({ x: g.cx, y: g.cy }, false);
          hits.push(r.hits.length);
          if (r.inside) inside.push(gi);
          const c = v.ctx;
          if (r.inside) { c.save(); c.shadowColor = C.violet; c.shadowBlur = 24 * v.dpr; dot(v, { x: g.cx, y: g.cy }, C.violet, 11); c.restore(); }
          cross(v, g.cx, g.cy, C.white, 12);
          label(v, `C${gi + 1} · ${g.place}`, g.cx + 64, g.cy - 48, r.inside ? C.lavender : C.steel, 13);
        });
        const share = inside.reduce((a, gi) => a + s.list[gi].n, 0);
        // cada centro solta o próprio raio: o contador mostra os cruzamentos de cada um, não quantos estão dentro
        out(slide, 'hit').textContent = `${inside.length} de ${s.list.length}`;
        out(slide, 'msg').innerHTML = `<b>${inside.length} de ${s.list.length} lugares</b> dentro da mancha (${inside.map(gi => s.list[gi].place).join(' e ')}), ${pct(share)} das transações.<br>` +
          s.list.map((g, gi) => `C${gi + 1}: ${hits[gi]} cruzamento${hits[gi] === 1 ? '' : 's'} → ${hits[gi] % 2 ? 'dentro' : 'fora'}`).join(' · ');
        out(slide, 'cross').textContent = hits.join(' · ');
      }
      if (probe) {
        last = ray(probe, true);
        dot(v, probe, last.inside ? C.violet : C.white, 7);
        out(slide, 'msg').innerHTML = `Ponto testado: <b>${last.hits.length} cruzamento${last.hits.length === 1 ? '' : 's'}</b> → ${last.inside ? 'ímpar, <b>dentro</b>' : 'par, <b>fora</b>'}.`;
      }
      if (last) out(slide, 'cross').textContent = last.hits.length;
    }
    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width * canvas.width, py = (e.clientY - rect.top) / rect.height * canvas.height;
      probe = v.inv(px, py); draw();
    });
    draw();
    return { enter: () => { probe = null; draw(); }, leave() {} };
  }

  // ======================================================== DEMO 5 · calculadora de memória
  function human(b) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']; let i = 0;
    while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
    return (b >= 100 ? Math.round(b) : b >= 10 ? b.toFixed(0) : b.toFixed(1)).toString().replace('.', ',') + ' ' + u[i];
  }
  function count(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.', ',').replace(',0', '') + ' bi';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',').replace(',0', '') + ' mi';
    if (n >= 1e3) return Math.round(n / 1e3) + ' mil';
    return Math.round(n).toString();
  }
  function demoCalc(slide) {
    const st = controls(slide, draw);
    const LO = 3, HI = 21; // escala log do byte: 1 KB → 1 ZB
    const pos = b => Math.max(0, Math.min(100, (Math.log10(b) - LO) / (HI - LO) * 100)) + '%';
    function draw() {
      const n = Math.pow(10, st.n), m = Math.pow(10, st.m), ram = Math.pow(2, st.ram) * 1e9;
      setVal(slide, 'n', count(n)); setVal(slide, 'm', count(m)); setVal(slide, 'ram', human(ram).replace(',0', ''));
      const g = n * n * 8;
      const big = Math.min(n, m * 10), l = big * big * 8;
      out(slide, 'global').textContent = human(g);
      out(slide, 'gbar').style.width = pos(g);
      out(slide, 'gram').style.left = pos(ram);
      out(slide, 'lram').style.left = pos(ram);
      out(slide, 'gmsg').innerHTML = g > ram ? `<b>${Math.round(g / ram).toLocaleString('pt-BR')}×</b> a RAM do nó. Não roda. E ainda misturaria pessoas diferentes no mesmo cluster.` : 'Cabe na RAM, mas mistura pessoas diferentes no mesmo cluster.';
      out(slide, 'local').textContent = human(l);
      out(slide, 'lbar').style.width = pos(l);
      out(slide, 'lmsg').innerHTML = `Maior tarefa (associado com 10× a média). <b>${count(n / m)} tarefas independentes</b>, comparações caem de n² pra ≈ n·m.`;
    }
    draw();
    return { enter: draw, leave() {} };
  }

  // ======================================================== DEMO 6 · núcleos (Gantt)
  function demoCores(slide) {
    const canvas = slide.querySelector('#cv-cores');
    const v = setup(canvas);
    const r = rng(1705);
    const JOBS = Array.from({ length: 220 }, () => { const m = Math.exp(4.6 + gauss(r) * 0.9); return Math.pow(m, 1.2); })
      .sort((a, b) => b - a); // maiores primeiro
    const SEQ = JOBS.reduce((a, b) => a + b, 0);
    let plan = null, raf = null, t0 = 0;
    const st = controls(slide, () => { stop(); build(); drawAt(0); });
    function build() {
      setVal(slide, 'cores', st.cores);
      const free = new Array(st.cores).fill(0);
      plan = JOBS.map(d => { let k = 0; for (let i = 1; i < free.length; i++) if (free[i] < free[k]) k = i; const s = free[k]; free[k] += d; return { core: k, s, e: s + d }; });
      plan.makespan = Math.max(...free);
    }
    function drawAt(t) {
      const c = v.ctx, k = v.dpr, Wc = canvas.width, Hc = canvas.height;
      c.fillStyle = C.bg; c.fillRect(0, 0, Wc, Hc);
      const left = 90 * k, right = 30 * k, top = 30 * k, bottom = 70 * k;
      const laneH = (Hc - top - bottom) / st.cores, sx = (Wc - left - right) / plan.makespan;
      for (let i = 0; i < st.cores; i++) {
        c.fillStyle = 'rgba(247,249,250,0.03)'; c.fillRect(left, top + i * laneH + 1, Wc - left - right, laneH - 2);
        if (st.cores <= 16 || i % 4 === 0) { c.fillStyle = C.steel; c.font = `${11 * k}px ${MONO}`; c.textAlign = 'right'; c.fillText('núcleo ' + (i + 1), left - 12 * k, top + i * laneH + laneH / 2 + 4 * k); }
      }
      let done = 0;
      plan.forEach(p => {
        if (p.s > t) return;
        const end = Math.min(p.e, t), running = p.e > t;
        if (!running) done++;
        c.fillStyle = running ? C.violet : 'rgba(247,249,250,0.72)';
        c.fillRect(left + p.s * sx + 1, top + p.core * laneH + Math.max(1, laneH * 0.12), Math.max(1, (end - p.s) * sx - 2), laneH * 0.76);
      });
      // eixo do tempo logo abaixo das faixas, rótulo à direita (a legenda do canvas ocupa o canto de baixo à esquerda)
      const ay = Hc - bottom + 14 * k;
      c.strokeStyle = C.steel; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(left, ay); c.lineTo(Wc - right, ay); c.stroke();
      c.fillStyle = C.steel; c.font = `${12 * k}px ${MONO}`; c.textAlign = 'right';
      c.fillText('TEMPO →', Wc - right, ay + 20 * k);
      out(slide, 'done').textContent = done + '/' + JOBS.length;
      out(slide, 't').textContent = t >= plan.makespan ? Math.round(plan.makespan / SEQ * 1000) / 10 + '%' : '…';
      out(slide, 'seq').textContent = '100%';
      out(slide, 'speed').textContent = t >= plan.makespan ? (SEQ / plan.makespan).toFixed(1).replace('.', ',') + '×' : '…';
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
    act(slide, 'play', () => {
      stop(); build();
      const dur = 1500 + plan.makespan / SEQ * 30000; t0 = performance.now();
      const tick = now => { const f = Math.min(1, (now - t0) / dur); drawAt(f * plan.makespan); if (f < 1) raf = requestAnimationFrame(tick); else raf = null; };
      raf = requestAnimationFrame(tick);
    });
    act(slide, 'reset', () => { stop(); build(); drawAt(0); });
    build(); drawAt(0);
    return { enter: () => { stop(); build(); drawAt(0); }, leave: stop };
  }

  // ---------- registro ----------
  const FACTORY = { 'cv-compare': demoCompare, 'cv-step': demoStep, 'cv-centroid': demoCentroid, 'cv-flood': demoFlood, 'cv-cores': demoCores };
  const live = new Map();
  function find(slide) {
    const cv = slide.querySelector('canvas');
    if (cv && FACTORY[cv.id]) return [cv.id, FACTORY[cv.id]];
    if (slide.querySelector('.calc')) return ['calc', demoCalc];
    return null;
  }
  window.Demos = {
    enter(slide) {
      const f = find(slide); if (!f) return;
      const [id, make] = f;
      if (!live.has(id)) live.set(id, make(slide)); else live.get(id).enter();
    },
    leave(slide) { const f = find(slide); if (f && live.has(f[0])) live.get(f[0]).leave(); },
  };
  // pré-inicializa tudo (pra impressão/PDF sair com os canvases desenhados)
  window.addEventListener('load', () => document.querySelectorAll('.slide').forEach(s => { const f = find(s); if (f && !live.has(f[0])) live.set(f[0], f[1](s)); }));
})();
