import { SAMPLES, parse, measure, visible, layoutTree, layoutMind, layoutFlow,
         layoutNet, getFS, setFS, getGAP, setGAP } from './graph.js';

const NS = 'http://www.w3.org/2000/svg';

/* The board. It paints the SVG itself via innerHTML; React never touches it:
   a relayout redraws a hundred-odd <g> elements, and handing that to React
   reconciliation would only be slower and more likely to fight the drag handling.
   React owns the surrounding shell and learns "how many nodes, which layout,
   who is selected" through the on.* callbacks. */
export function createBoard({board, bgc, src, on}) {
  const ac = new AbortController();
  const {signal} = ac;
  const bind = (t, ev, fn, o) => t.addEventListener(ev, fn, {...o, signal});

  let doc = {nodes: [], edges: [], map: {}};
  let mode = 'auto', resolved = 'mind';
  let sel = null;
  const view = {x: 0, y: 0, k: 1};

  function pickMode() {
    if (mode !== 'auto') return mode;
    /* Three rules for guessing the diagram kind, in order of reliability:
         arrows → flow; no hierarchy at all → network; everything else → radial mind map.
       The last one is a choice of default shape: the radial map is the picture
       most people have in mind for "diagram". A hierarchy tree would spread the
       same content across a dozen columns, so it only pays off when the user
       explicitly picks it. */
    if (doc.edges.length >= 2) return 'flow';
    const depth = Math.max(0, ...doc.nodes.map(n => n.level));
    return depth === 0 ? 'net' : 'mind';
  }

  function relayout() {
    const V = visible(doc.nodes, doc.map);
    V.forEach(measure);
    resolved = pickMode();
    if (!V.length) return V;
    if (resolved === 'tree') layoutTree(V, doc.map, 'down');
    else if (resolved === 'mind') layoutMind(V, doc.map);
    else if (resolved === 'flow') layoutFlow(V, doc.map, doc.edges);
    else layoutNet(V, doc.map, doc.edges);
    // Pinned nodes: once the user drags a node, auto-layout no longer pushes it
    // around. This is the minimal implementation of "must be editable".
    for (const n of V) if (n.pin) { n.x = n.pin.x; n.y = n.pin.y }
    return V;
  }

  const colorOf = n => `var(--n${(n.level % 6) + 1})`;

  function render(fitAfter, keepInsp) {
    const FS = getFS();
    const V = relayout();
    const links = [];
    for (const n of V) if (n.parent && V.includes(doc.map[n.parent])) links.push([doc.map[n.parent], n, 'tree']);
    for (const e of doc.edges) {
      const a = doc.map[e.from], b = doc.map[e.to];
      if (a && b && V.includes(a) && V.includes(b)) links.push([a, b, 'flow']);
    }

    const path = ([a, b, kind]) => {
      if (resolved === 'flow' || (resolved === 'tree' && kind === 'tree')) {
        if (resolved === 'flow') {
          const x1 = a.x + a.w / 2, x2 = b.x - b.w / 2, mx = (x1 + x2) / 2;
          return `M${x1} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}`;
        }
        const y1 = a.y + a.h / 2, y2 = b.y - b.h / 2, my = (y1 + y2) / 2;
        return `M${a.x} ${y1} C${a.x} ${my} ${b.x} ${my} ${b.x} ${y2}`;
      }
      // Radial and network: a curved bezier reads more like a "branch" than a straight line.
      const dx = b.x - a.x;
      return `M${a.x + Math.sign(dx) * a.w / 2} ${a.y} C${a.x + dx * 0.55} ${a.y} ${b.x - dx * 0.45} ${b.y} ${b.x - Math.sign(dx) * b.w / 2} ${b.y}`;
    };

    const esc = s => s.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));

    board.innerHTML = `
      <defs>
        <marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--faint)"/>
        </marker>
      </defs>
      <g id="cam">
        <g id="links">${links.map(l => `<path class="link" d="${path(l)}"
          stroke="${l[2] === 'flow' ? 'var(--faint)' : 'var(--line)'}"
          stroke-width="${l[2] === 'flow' ? 1.4 : 1.6}"
          ${l[2] === 'flow' ? 'marker-end="url(#ar)"' : ''}/>`).join('')}</g>
        <g id="nodes">${V.map(n => {
          const kids = n.kids.length;
          const cy = n.lines.length === 1 ? 0 : -(n.lines.length - 1) * FS * 0.75;
          return `<g class="node${n === sel ? ' sel' : ''}" data-id="${n.id}"
            transform="translate(${n.x.toFixed(1)},${n.y.toFixed(1)})">
            <rect class="cap" x="${-n.w / 2}" y="${-n.h / 2}" width="${n.w}" height="${n.h}" rx="${n.level === 0 ? 8 : 5}"
              fill="${n.level === 0 ? colorOf(n) : 'var(--panel)'}"
              stroke="${colorOf(n)}" stroke-width="${n.level === 0 ? 0 : 1.4}"/>
            <text class="cap" text-anchor="middle" font-size="${FS}"
              fill="${n.level === 0 ? 'var(--accent-ink)' : 'var(--ink)'}"
              font-weight="${n.level <= 1 ? 550 : 450}">
              ${n.lines.map((ln, i) => `<tspan x="0" y="${(cy + i * FS * 1.5 + FS * 0.35).toFixed(1)}">${esc(ln)}</tspan>`).join('')}
            </text>
            ${kids ? `<g class="badge-c" data-fold="${n.id}"
              transform="translate(${(n.w / 2 + 9).toFixed(1)},0)">
              <circle r="7.5" fill="var(--panel)" stroke="${colorOf(n)}" stroke-width="1.2"/>
              <text text-anchor="middle" y="3.2" font-size="9" fill="${colorOf(n)}"
                font-family="var(--mono)">${n.collapsed ? kids : '−'}</text></g>` : ''}
            ${n.note ? `<circle cx="${(-n.w / 2 + 1).toFixed(1)}" cy="${(-n.h / 2 + 1).toFixed(1)}" r="2.6"
              fill="${colorOf(n)}" opacity=".8"/>` : ''}
          </g>`;
        }).join('')}</g>
      </g>`;

    on.stats({nodes: doc.nodes.length, links: links.length, resolved});
    if (fitAfter) fit(); else applyView();
    if (!keepInsp) syncInsp();
  }

  function bounds() {
    const V = visible(doc.nodes, doc.map);
    if (!V.length) return {x: 0, y: 0, w: 1, h: 1};
    const xs = V.map(n => n.x - n.w / 2), xe = V.map(n => n.x + n.w / 2);
    const ys = V.map(n => n.y - n.h / 2), ye = V.map(n => n.y + n.h / 2);
    const x = Math.min(...xs), y = Math.min(...ys);
    return {x, y, w: Math.max(...xe) - x, h: Math.max(...ye) - y};
  }

  function fit() {
    const b = bounds();
    const W = board.clientWidth, H = board.clientHeight;
    const pad = 64;
    // Floor of 0.34: below that, labels turn to mush. Better to let the user pan
    // than to hand over an unreadable overview.
    view.k = Math.min(2, Math.max(0.34, Math.min((W - pad * 2) / b.w, (H - pad * 2 - 40) / b.h)));
    view.x = W / 2 - (b.x + b.w / 2) * view.k;
    view.y = (H - 30) / 2 - (b.y + b.h / 2) * view.k;
    applyView();
  }
  function applyView() {
    const cam = board.querySelector('#cam');
    if (cam) cam.setAttribute('transform', `translate(${view.x.toFixed(1)},${view.y.toFixed(1)}) scale(${view.k.toFixed(4)})`);
    on.zoom(view.k);
    scheduleBg();
  }
  /* Zoom anchored at a point. Without this, three zoom-ins and the diagram has
     drifted off-screen.
     The wheel anchors at the pointer, the buttons at the canvas center — buttons
     have no pointer position, so center is the expected anchor. */
  function zoomAt(k2, mx, my) {
    k2 = Math.max(0.14, Math.min(3, k2));
    view.x = mx - (mx - view.x) * (k2 / view.k);
    view.y = my - (my - view.y) * (k2 / view.k);
    view.k = k2; applyView();
  }
  function zoomStep(f) {
    const r = board.getBoundingClientRect();
    zoomAt(view.k * f, r.width / 2, r.height / 2);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Interaction
     ═══════════════════════════════════════════════════════════════════════ */

  let panning = false, draggingNode = null, px = 0, py = 0, movedPx = 0;

  bind(board, 'pointerdown', e => {
    const g = e.target.closest('.node');
    px = e.clientX; py = e.clientY; movedPx = 0;
    board.setPointerCapture(e.pointerId);
    if (e.target.closest('.badge-c')) return;
    if (g) { draggingNode = doc.map[g.dataset.id] } else { panning = true; board.classList.add('drag') }
  });
  bind(board, 'pointermove', e => {
    if (!panning && !draggingNode) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX; py = e.clientY; movedPx += Math.abs(dx) + Math.abs(dy);
    if (panning) { view.x += dx; view.y += dy; applyView() }
    else {
      draggingNode.x += dx / view.k; draggingNode.y += dy / view.k;
      draggingNode.pin = {x: draggingNode.x, y: draggingNode.y};
      render();
    }
  });
  bind(board, 'pointerup', e => {
    board.releasePointerCapture(e.pointerId);
    panning = false; draggingNode = null; board.classList.remove('drag');
  });
  bind(board, 'click', e => {
    const fold = e.target.closest('[data-fold]');
    if (fold) {
      const n = doc.map[fold.dataset.fold];
      n.collapsed = !n.collapsed; render(); return;
    }
    if (movedPx > 4) return;
    const g = e.target.closest('.node');
    sel = g ? doc.map[g.dataset.id] : null;
    render();
  });
  bind(board, 'dblclick', e => {
    const g = e.target.closest('.node'); if (!g) return;
    const n = doc.map[g.dataset.id];
    if (n.kids.length) { n.collapsed = !n.collapsed; render() }
  });
  bind(board, 'wheel', e => {
    e.preventDefault();
    const r = board.getBoundingClientRect();
    zoomAt(view.k * (1 - Math.sign(e.deltaY) * 0.12), e.clientX - r.left, e.clientY - r.top);
  }, {passive: false});

  const zoomReset = () => {
    const r = board.getBoundingClientRect();
    zoomAt(1, r.width / 2, r.height / 2);
  };

  bind(window, 'keydown', e => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { sel = null; render() }
    if (e.key === 'f') fit();
    if (e.key === '=' || e.key === '+') zoomStep(1.25);
    if (e.key === '-' || e.key === '_') zoomStep(1 / 1.25);
  });

  /* The inspector panel itself belongs to React; this only computes and reports
     the few things the panel needs.
     render(false, true) still skips reporting — rebuilding the panel would swap
     out the rename input, caret and all. */
  function syncInsp() {
    if (!sel) { on.sel(null); return }
    const chain = [];
    let p = sel; while (p) { chain.unshift(p.name); p = p.parent ? doc.map[p.parent] : null }
    on.sel({id: sel.id, name: sel.name, level: sel.level, kids: sel.kids.length,
            pin: !!sel.pin, note: sel.note, color: colorOf(sel), chain: chain.join(' › ')});
  }

  function rename(next) {
    // Renaming also writes back into the source text, or the next re-parse eats
    // the change — the easiest bug to ship on this page.
    const old = sel.name;
    if (!next.trim()) return;
    src.value = src.value.split('\n').map(l =>
      l.includes(old) ? l.replace(old, next) : l).join('\n');
    // keepInsp: do not rebuild the panel, or every keystroke replaces the input
    // and the caret is lost on the spot.
    sel.name = next; render(false, true); keep();
  }
  function togglePin() { sel.pin = sel.pin ? null : {x: sel.x, y: sel.y}; render() }
  function removeSel() {
    const drop = new Set([sel.id]);
    const sweep = id => doc.map[id].kids.forEach(k => { drop.add(k); sweep(k) });
    sweep(sel.id);
    doc.nodes = doc.nodes.filter(n => !drop.has(n.id));
    doc.edges = doc.edges.filter(e => !drop.has(e.from) && !drop.has(e.to));
    for (const n of doc.nodes) n.kids = n.kids.filter(k => !drop.has(k));
    doc.map = Object.fromEntries(doc.nodes.map(n => [n.id, n]));
    sel = null; render();
  }

  /* ── Toolbar ────────────────────────────────────────────────────────── */
  function setMode(m) {
    mode = m;
    for (const n of doc.nodes) n.pin = null;      // pins are cleared on a layout switch, or old coordinates would scar the new layout
    render(true);
  }
  const tighter = () => { setGAP(Math.max(0.5, getGAP() - 0.15)); render(true) };
  const looser = () => { setGAP(Math.min(2.4, getGAP() + 0.15)); render(true) };
  const bigger = () => { setFS(Math.min(20, getFS() + 1)); render(true) };
  const smaller = () => { setFS(Math.max(11, getFS() - 1)); render(true) };   // 11px is the floor; below that, labels stop being readable
  const relayoutAll = () => { for (const n of doc.nodes) n.pin = null; render(true) };

  /* ── Export: inline the computed styles into the SVG, so the exported file
        can survive outside this page. ── */
  function serialize() {
    const b = bounds(), pad = 40;
    const clone = board.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('width', Math.ceil(b.w + pad * 2));
    clone.setAttribute('height', Math.ceil(b.h + pad * 2));
    clone.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`);
    clone.querySelector('#cam').removeAttribute('transform');
    const cs = getComputedStyle(document.documentElement);
    // Nothing resolves var(--x) inside an exported file, so swap each one for its real color.
    const vars = ['--panel', '--ink', '--line', '--faint', '--accent-ink', '--n1', '--n2', '--n3', '--n4', '--n5', '--n6'];
    let s = new XMLSerializer().serializeToString(clone);
    for (const v of vars) s = s.replaceAll(`var(${v})`, cs.getPropertyValue(v).trim());
    s = s.replace('<svg', `<svg style="background:${cs.getPropertyValue('--bg').trim()}"`);
    s = s.replace(/font-family="var\([^)]*\)"/g, 'font-family="ui-monospace,monospace"');
    return `<?xml version="1.0" encoding="UTF-8"?>\n${s}`;
  }
  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const expSvg = () => save(new Blob([serialize()], {type: 'image/svg+xml'}), 'diagram.svg');
  const expPng = () => {
    const b = bounds(), pad = 40, scale = 2;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([serialize()], {type: 'image/svg+xml'}));
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = (b.w + pad * 2) * scale; cv.height = (b.h + pad * 2) * scale;
      const c = cv.getContext('2d');
      c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      c.fillRect(0, 0, cv.width, cv.height);
      c.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(bl => save(bl, 'diagram.png'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  /* ── Persistence ─────────────────────────────────────────────────────
     Only the source text is stored: everything on the board is parsed out of
     it, so keeping the text keeps the whole diagram. Pins and folds are
     fiddling, and should not survive a reload.
     Private mode throws on every localStorage call; the tool must still open. ── */
  const STORE = 'doc-to-diagram:src';
  const keep = () => { try { localStorage.setItem(STORE, src.value) } catch (e) { /* private mode */ } };
  const restore = () => { try { return localStorage.getItem(STORE) } catch (e) { return null } };

  /* ── Input ──────────────────────────────────────────────────────────── */
  let tmr = 0;
  bind(src, 'input', () => {
    clearTimeout(tmr);
    // Do not relayout on every keystroke; 180 ms is the line between "feels
    // instant" and "does not jitter".
    tmr = setTimeout(() => { doc = parse(src.value); sel = null; render(true); keep() }, 180);
  });
  let si = 0;
  const sample = () => { si = (si + 1) % SAMPLES.length; src.value = SAMPLES[si]; src.dispatchEvent(new Event('input')) };
  const loadFile = f => { if (f) f.text().then(t => { src.value = t; src.dispatchEvent(new Event('input')) }) };

  /* ── Background: a very faint dot grid that follows the skin. Canvas instead
        of a CSS gradient, because the dot density must follow the zoom level —
        at 3x zoom, fixed dots would turn into large blobs. ── */
  const bx = bgc.getContext('2d');
  let bgTmr = 0;
  const scheduleBg = () => { cancelAnimationFrame(bgTmr); bgTmr = requestAnimationFrame(drawBg) };
  function drawBg() {
    const w = bgc.clientWidth, h = bgc.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    if (!w || !h) return;
    if (bgc.width !== Math.round(w * dpr)) { bgc.width = w * dpr; bgc.height = h * dpr }
    bx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    bx.fillStyle = cs.getPropertyValue('--bg').trim();
    bx.fillRect(0, 0, w, h);
    const step = 26 * view.k;
    if (step < 9) return;
    bx.fillStyle = cs.getPropertyValue('--line').trim();
    bx.globalAlpha = 0.75;
    for (let x = view.x % step; x < w; x += step)
      for (let y = view.y % step; y < h; y += step) bx.fillRect(x, y, 1, 1);
    bx.globalAlpha = 1;
  }
  const ro = new ResizeObserver(scheduleBg);
  ro.observe(bgc);

  src.value = restore() ?? SAMPLES[0];
  doc = parse(src.value);
  render(true);
  drawBg();

  return {
    render, fit, setMode, tighter, looser, bigger, smaller, relayoutAll,
    zoomStep, zoomReset, sample, loadFile, expSvg, expPng,
    rename, togglePin, removeSel,
    dispose() { ac.abort(); ro.disconnect(); cancelAnimationFrame(bgTmr); clearTimeout(tmr) },
  };

}
