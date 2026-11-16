// Navegação do deck: escala do palco, teclado/passador, hash #n, janela de notas do apresentador (P), tela cheia (F);
// no celular, botões ‹ ⛶ › e arrastar o dedo.
(function () {
  const stage = document.getElementById('stage');
  const slides = Array.from(document.querySelectorAll('.slide'));
  const counter = document.getElementById('counter');
  const progress = document.getElementById('progress');
  const help = document.getElementById('help');
  let cur = 0;
  let presenter = null;
  const t0 = Date.now();
  let slideT0 = Date.now();

  // tela de toque (mesmo critério do CSS): no navegador com mouse o comportamento fica idêntico ao de antes
  const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  function fit() {
    // no celular, innerWidth muda com pinça e com a barra do navegador; o layout viewport (clientWidth) é estável
    const w = touch ? document.documentElement.clientWidth : window.innerWidth;
    const h = touch ? document.documentElement.clientHeight : window.innerHeight;
    const s = Math.min(w / 1920, h / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur && slides[i].classList.contains('active')) return;
    slides[cur].classList.remove('active');
    if (window.Demos) window.Demos.leave(slides[cur]);
    cur = i;
    slides[cur].classList.add('active');
    if (window.Demos) window.Demos.enter(slides[cur]);
    counter.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
    progress.style.width = ((cur + 1) / slides.length * 100) + '%';
    // pathname+search explícitos: na cópia pública há <base href>, e '#N' sozinho resolve contra a base e apagava ?ref=&campaign=
    history.replaceState(null, '', location.pathname + location.search + '#' + (cur + 1));
    track();
    slideT0 = Date.now();
    renderPresenter();
  }

  // estatística de visitas: só existe na cópia pública (o gerador injeta window.va); no ensaio local é no-op.
  // 1 pageview virtual por slide, na 1ª vez que ele aparece (a Hobby não tem evento customizado; pageview conta nos 50 mil/mês).
  const vistos = new Set();
  function track() {
    if (!window.va || vistos.has(cur)) return;
    vistos.add(cur);
    window.va('pageview', { path: location.pathname.replace(/\/$/, '') + '/slide-' + String(cur + 1).padStart(2, '0') });
  }

  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return; // slider em foco
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'ArrowDown':
        e.preventDefault(); go(cur + 1); break;
      case 'ArrowLeft': case 'PageUp': case 'ArrowUp':
        e.preventDefault(); go(cur - 1); break;
      case 'Home': go(0); break;
      case 'End': go(slides.length - 1); break;
      case 'p': case 'P': openPresenter(); break;
      case 'n': case 'N': toggleInline(); break;
      case 'l': case 'L': toggleTema(); break;
      case 'f': case 'F':
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen();
        break;
    }
  }

  // slider/botão clicado não deve prender o foco (passador manda PageDown/setas)
  document.addEventListener('change', e => { if (e.target.tagName === 'INPUT') e.target.blur(); });
  document.addEventListener('click', e => { const b = e.target.closest('button, a'); if (b) b.blur(); });

  // ---------- janela de notas ----------
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function openPresenter() {
    if (presenter && !presenter.closed) { presenter.focus(); return; }
    presenter = window.open('', 'notas-apresentador', 'width=1000,height=760');
    if (!presenter) { toggleInline(true); return; } // popup bloqueado: notas embaixo do slide
    const d = presenter.document;
    d.open();
    d.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Notas · apresentador</title>
      <style>
        body{margin:0;background:#090909;color:#f7f9fa;font-family:Inter,'Segoe UI',sans-serif;padding:28px 36px}
        .top{display:flex;justify-content:space-between;align-items:baseline;font-family:Consolas,monospace;letter-spacing:.14em;color:#828384;font-size:14px;text-transform:uppercase}
        .clock{font-size:34px;color:#f7f9fa;letter-spacing:.04em}
        h1{font-weight:300;font-size:34px;margin:18px 0 6px;letter-spacing:-.01em}
        .meta{font-family:Consolas,monospace;font-size:14px;color:#e1bdff;letter-spacing:.12em;text-transform:uppercase}
        .notes{margin-top:22px;font-size:22px;line-height:1.5;color:rgba(247,249,250,.88)}
        .notes p{margin:0 0 14px}
        .notes b{color:#fff;font-weight:600}
        .next{margin-top:24px;padding-top:16px;border-top:1px solid rgba(247,249,250,.14);color:#828384;font-size:18px}
        .nav{margin-top:18px;display:flex;gap:10px}
        button{background:#111;color:#f7f9fa;border:1px solid rgba(247,249,250,.3);border-radius:8px;padding:10px 18px;font-size:16px;cursor:pointer}
      </style></head><body>
      <div class="top"><div>Total <span class="clock" id="tt">00:00</span></div><div>No slide <span class="clock" id="ts">00:00</span></div><div id="pos"></div></div>
      <h1 id="title"></h1><div class="meta" id="meta"></div>
      <div class="notes" id="notes"></div>
      <div class="next" id="next"></div>
      <div class="nav"><button id="prev">← anterior</button><button id="fwd">próximo →</button></div>
      </body></html>`);
    d.close();
    d.getElementById('prev').onclick = () => go(cur - 1);
    d.getElementById('fwd').onclick = () => go(cur + 1);
    presenter.addEventListener('keydown', onKey);
    renderPresenter();
  }
  // plano B: notas embutidas na própria página (ensaio, ou popup bloqueado)
  const inline = document.createElement('div');
  inline.id = 'inline-notes';
  inline.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:38vh;overflow:auto;z-index:80;display:none;' +
    'background:rgba(9,9,9,.94);border-top:1px solid rgba(247,249,250,.2);padding:16px 28px;font:16px/1.5 Inter,"Segoe UI",sans-serif;color:#f7f9fa';
  document.body.appendChild(inline);
  function toggleInline(force) {
    inline.style.display = (force === true || inline.style.display === 'none') ? 'block' : 'none';
    renderInline();
  }
  function renderInline() {
    if (inline.style.display === 'none') return;
    const s = slides[cur], n = s.querySelector('.notes');
    inline.innerHTML = `<div style="font:12px Consolas,monospace;letter-spacing:.14em;color:#e1bdff;text-transform:uppercase;margin-bottom:8px">` +
      `${cur + 1}. ${s.dataset.title || ''} · tempo sugerido ${s.dataset.time || '—'} · N fecha</div>` + (n ? n.innerHTML : '');
  }

  function renderPresenter() {
    renderInline();
    if (!presenter || presenter.closed) return;
    const d = presenter.document;
    const s = slides[cur];
    const nx = slides[cur + 1];
    const notes = s.querySelector('.notes');
    d.getElementById('title').textContent = (cur + 1) + '. ' + (s.dataset.title || '');
    d.getElementById('meta').textContent = 'tempo sugerido ' + (s.dataset.time || '—');
    d.getElementById('notes').innerHTML = notes ? notes.innerHTML : '';
    d.getElementById('next').textContent = nx ? 'Próximo: ' + (cur + 2) + '. ' + (nx.dataset.title || '') : 'Fim';
    d.getElementById('pos').textContent = (cur + 1) + ' / ' + slides.length;
  }
  setInterval(() => {
    if (!presenter || presenter.closed) return;
    presenter.document.getElementById('tt').textContent = fmt(Date.now() - t0);
    presenter.document.getElementById('ts').textContent = fmt(Date.now() - slideT0);
  }, 500);

  // ---------- tema claro/escuro: botão no canto de baixo à esquerda ou tecla L; lembra a escolha ----------
  const temaBtn = document.createElement('button');
  temaBtn.id = 'tema'; temaBtn.type = 'button';
  document.body.appendChild(temaBtn);
  function setTema(claro) {
    document.documentElement.classList.toggle('claro', claro);
    temaBtn.textContent = claro ? '☾' : '☀';
    temaBtn.title = temaBtn.ariaLabel = claro ? 'Fundo escuro (L)' : 'Fundo claro (L)';
    try { localStorage.setItem('deck-tema', claro ? 'claro' : 'escuro'); } catch (e) {}
  }
  function toggleTema() { setTema(!document.documentElement.classList.contains('claro')); }
  temaBtn.addEventListener('click', toggleTema);
  let temaSalvo = null;
  try { temaSalvo = localStorage.getItem('deck-tema'); } catch (e) {}
  setTema(temaSalvo === 'claro');

  // ---------- celular: botões (anterior · tela cheia · próximo) e arrastar o dedo ----------
  if (touch) {
    const root = document.documentElement;
    const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
    const fsPode = !!(root.requestFullscreen || root.webkitRequestFullscreen);
    function toggleFs() {
      if (fsOn()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      // deitar o celular sozinho quando o navegador deixa (Android); onde não deixa, ignora
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    }
    const nav = document.createElement('div');
    nav.id = 'touch-nav';
    nav.innerHTML = '<button type="button" data-t="prev" aria-label="Slide anterior">‹</button>' +
      '<button type="button" data-t="fs" aria-label="Tela cheia">⛶</button>' +
      '<button type="button" data-t="next" aria-label="Próximo slide">›</button>';
    document.body.appendChild(nav);
    nav.querySelector('[data-t="fs"]').hidden = !fsPode; // iPhone não deixa página entrar em tela cheia
    nav.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.t === 'prev') go(cur - 1);
      else if (b.dataset.t === 'next') go(cur + 1);
      else toggleFs();
    });

    let x0 = null, y0 = 0;
    window.addEventListener('touchstart', e => {
      // slider, botão e a própria barra têm gesto próprio
      if (e.touches.length !== 1 || e.target.closest('input, button, select, #touch-nav')) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    window.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
    }, { passive: true });

    if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => setTimeout(fit, 250));
    document.addEventListener('fullscreenchange', fit);
  }

  window.addEventListener('resize', fit);
  window.addEventListener('keydown', onKey);
  fit();
  const start = parseInt((location.hash || '#1').slice(1), 10);
  cur = 0;
  go(isNaN(start) ? 0 : start - 1);
  // fontes da web chegam depois: redesenha o canvas do slide atual quando carregarem
  if (document.fonts && window.Demos) document.fonts.ready.then(() => window.Demos.enter(slides[cur]));
  setTimeout(() => { help.style.opacity = 0; }, 6000);
  window.Deck = { go, get index() { return cur; } };
})();
