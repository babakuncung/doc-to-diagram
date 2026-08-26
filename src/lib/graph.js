/* Parsing and measuring.
   FS / GAP are module-level mutable state; the toolbar mutates them through
   the accessors at the bottom of this file. */
const SAMPLES = [
`# Retrieval-Augmented Generation
  Data preparation: quality here sets the upper bound for every later stage
    Document intake: normalize PDF, Word, and web pages into structured text
    Chunking: split at semantic boundaries instead of fixed character counts
    Metadata: capture title, time, and category for filtering and weighting
  Index construction
    Embeddings: evaluate models on the language and domain you actually serve
    Vector store: tune approximate nearest-neighbor recall against latency
    Inverted index: exact keyword matching complements semantic retrieval
  Retrieval path
    Query rewrite: turn conversational questions into search-ready expressions
    Hybrid recall: retrieve semantic and keyword candidates, then merge
    Reranking: score the top candidates with a cross-encoder
  Generation
    Context assembly: control total length and place strongest evidence first
    Citation markers: keep each statement traceable to its supporting passage
    Abstention: state when retrieval has insufficient evidence
  Evaluation
    Retrieval metrics: recall and hit rate
    Generation metrics: faithfulness and relevance on a labeled set`,

`# Product Review Flow
  Submit -> Clarify
  Clarify -> Evaluate
  Evaluate -> Schedule
  Evaluate -> Reject: stop when value is unclear or cost is disproportionate
  Schedule -> Build
  Build -> Integrate
  Integrate -> Accept
  Accept -> Release
  Accept -> Build: failed acceptance returns to implementation
  Release -> Review`,

`# Company Organization
  Board
    Strategy Committee
    Audit Committee
  Leadership
    Product Lines: organized by customer scenario rather than technology
      Enterprise
      Standard
      Platform
    Engineering Platform
      Infrastructure
      Data Platform
      Applied Research
    Go to Market
      Direct Sales
      Partnerships
      Customer Success
    Corporate Functions
      Finance
      People
      Legal and Compliance`,
];

/* ═══════════════════════════════════════════════════════════════════════
   Parsing — four rules, forty lines. To accept a different input syntax,
   this one function is all you change.
   ═══════════════════════════════════════════════════════════════════════ */

function parse(text) {
  const nodes = [], edges = [];
  const byName = new Map();
  const stack = [];                 // [{indent, node}]
  let uid = 0;

  const ensure = (name, note) => {
    let n = byName.get(name);
    if (!n) {
      n = {id: 'n' + uid++, name, note: note || '', level: 0, parent: null, kids: [], collapsed: false};
      byName.set(name, n); nodes.push(n);
    } else if (note && !n.note) n.note = note;
    return n;
  };

  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    // Indent width: a Tab counts as two spaces, matching the default of mainstream editors.
    const lead = raw.match(/^[\t ]*/)[0];
    let indent = lead.replace(/\t/g, '  ').length;

    let line = raw.trim();
    const h = line.match(/^(#{1,6})\s+/);
    if (h) { indent = (h[1].length - 1) * 2; line = line.slice(h[0].length) }
    line = line.replace(/^[-*·•]\s*/, '');
    if (!line) continue;

    // Note: everything after the first colon. ASCII and full-width colons both count.
    let note = '';
    const c = line.search(/[:：]/);
    if (c > 0 && !/^https?/i.test(line)) { note = line.slice(c + 1).trim(); line = line.slice(0, c).trim() }

    // Arrow line: the line itself describes edges, not hierarchy.
    const arrow = line.split(/\s*(?:->|→|=>)\s*/);
    if (arrow.length > 1) {
      for (let i = 0; i < arrow.length - 1; i++) {
        const a = ensure(arrow[i].trim()), b = ensure(arrow[i + 1].trim(), i === arrow.length - 2 ? note : '');
        if (a !== b) edges.push({from: a.id, to: b.id, kind: 'flow'});
      }
      continue;
    }

    const node = ensure(line, note);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const par = stack.length ? stack[stack.length - 1].node : null;
    if (par && par !== node && !node.parent) {
      node.parent = par.id; par.kids.push(node.id); node.level = par.level + 1;
    }
    stack.push({indent, node});
  }

  const map = Object.fromEntries(nodes.map(n => [n.id, n]));
  // Nodes with arrows but no hierarchy take their depth from the zero-in-degree
  // nodes — the flow layout layers by this.
  for (const n of nodes) if (!n.parent) n.level = 0;
  return {nodes, edges, map};
}

/* ═══════════════════════════════════════════════════════════════════════
   Measuring — a CJK glyph counts as one width unit, ASCII as 0.55.
   Per-glyph canvas measurement would be more accurate, but nobody can tell
   at this font size, and it would push a relayout from a fraction of a
   millisecond into tens of milliseconds.
   ═══════════════════════════════════════════════════════════════════════ */

let FS = 13, GAP = 1.0;
const CJK = /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/;
const wOf = s => [...s].reduce((a, c) => a + (CJK.test(c) ? 1 : 0.55), 0);

function wrap(name, maxUnits) {
  const out = []; let cur = '', w = 0, over = false;
  for (const ch of name) {
    const cw = CJK.test(ch) ? 1 : 0.55;
    if (w + cw > maxUnits && cur) {
      if (out.length === 2) { over = true; break }   // three lines at most; anything longer wants a shorter name
      out.push(cur); cur = ''; w = 0;
    }
    cur += ch; w += cw;
  }
  if (cur) out.push(cur);
  // Truncation must be visible. Silently dropping half a title is far uglier than an ellipsis.
  if (over) out[2] = out[2].slice(0, -1) + '…';
  return out.length ? out : [name];
}

function measure(n) {
  const maxU = n.level === 0 ? 9 : 8;
  n.lines = wrap(n.name, maxU);
  const u = Math.max(...n.lines.map(wOf));
  n.w = Math.max(64, Math.round(u * FS + 24));
  n.h = Math.round(n.lines.length * (FS * 1.5) + 15);
}

/* ═══════════════════════════════════════════════════════════════════════
   The four layouts
   ═══════════════════════════════════════════════════════════════════════ */

const visible = (nodes, map) => nodes.filter(n => {
  let p = n.parent;
  while (p) { if (map[p].collapsed) return false; p = map[p].parent }
  return true;
});

/* Hierarchy tree: leaves take slots in order, parents center above their children.
   The classic "simplified Reingold-Tilford" — no subtree avoidance, because nothing collides within four levels. */
function layoutTree(V, map, dir = 'down') {
  const rows = [];
  let cursor = 0;
  const place = n => {
    const kids = n.kids.map(k => map[k]).filter(k => V.includes(k));
    if (!kids.length || n.collapsed) { n.ax = cursor; cursor += 1; }
    else {
      kids.forEach(place);
      n.ax = (kids[0].ax + kids[kids.length - 1].ax) / 2;
    }
    (rows[n.level] ??= []).push(n);
  };
  V.filter(n => !n.parent).forEach(r => { place(r); cursor += 0.6 });

  const colW = Math.max(...V.map(n => n.w)) + 30 * GAP;
  const rowH = Math.max(...V.map(n => n.h)) + 52 * GAP;
  for (const n of V) {
    if (dir === 'down') { n.x = n.ax * colW; n.y = n.level * rowH }
    else { n.x = n.level * (colW * 1.15); n.y = n.ax * (rowH * 0.62) }
  }
}

/* Radial: first-level children split left and right, each stacked vertically;
   deeper levels keep pushing outward.
   This is the picture everyone has in mind for the words "mind map"; nothing else counts. */
function layoutMind(V, map) {
  const roots = V.filter(n => !n.parent);
  const root = roots[0] || V[0];
  if (!root) return;
  root.x = 0; root.y = 0;

  const subH = n => {
    const kids = n.collapsed ? [] : n.kids.map(k => map[k]).filter(k => V.includes(k));
    return kids.length ? kids.reduce((a, k) => a + subH(k), 0) : (n.h + 16 * GAP);
  };

  const spread = (n, side, depth) => {
    const kids = n.collapsed ? [] : n.kids.map(k => map[k]).filter(k => V.includes(k));
    if (!kids.length) return;
    const total = kids.reduce((a, k) => a + subH(k), 0);
    let y = n.y - total / 2;
    const step = (Math.max(...kids.map(k => k.w)) + n.w) / 2 + 54 * GAP;
    for (const k of kids) {
      const hh = subH(k);
      k.y = y + hh / 2; y += hh;
      k.x = n.x + side * step;
      spread(k, side, depth + 1);
    }
  };

  const l1 = root.collapsed ? [] : root.kids.map(k => map[k]).filter(k => V.includes(k));
  const half = Math.ceil(l1.length / 2);
  const sides = [l1.slice(0, half), l1.slice(half)];
  sides.forEach((group, si) => {
    const side = si === 0 ? 1 : -1;
    const total = group.reduce((a, k) => a + subH(k), 0);
    let y = -total / 2;
    for (const k of group) {
      const hh = subH(k);
      k.y = y + hh / 2; y += hh;
      k.x = side * ((root.w + k.w) / 2 + 76 * GAP);
      spread(k, side, 2);
    }
  });
  // Stray nodes that only hang off arrows and have no parent are parked in a row
  // below, outside the radial spread.
  let ox = 0;
  for (const n of V) if (n !== root && !n.parent) { n.x = ox; n.y = 420; ox += n.w + 24 }
}

/* Directed flow: layer by longest path, left to right. Back edges (Accept -> Build
   and the like) do not take part in layering, or a single return edge would curl
   the whole diagram into a ball. */
function layoutFlow(V, map, edges) {
  const inc = Object.fromEntries(V.map(n => [n.id, []]));
  for (const e of edges) if (inc[e.to] && inc[e.from]) inc[e.to].push(e.from);
  const depth = {};
  const seen = new Set();
  const walk = (id, d, path) => {
    if (path.has(id)) return;                       // back edge: stop here
    depth[id] = Math.max(depth[id] ?? 0, d);
    path.add(id);
    for (const e of edges) if (e.from === id && inc[e.to]) walk(e.to, d + 1, path);
    for (const k of map[id].kids) if (inc[k]) walk(k, d + 1, path);
    path.delete(id);
  };
  for (const n of V) if (!inc[n.id].length && !n.parent) { walk(n.id, 0, new Set()); seen.add(n.id) }
  for (const n of V) if (depth[n.id] === undefined) walk(n.id, 0, new Set());

  const cols = {};
  for (const n of V) (cols[depth[n.id]] ??= []).push(n);
  const maxD = Math.max(...Object.keys(cols).map(Number));
  const colW = Math.max(...V.map(n => n.w)) + 58 * GAP;
  const rowH = Math.max(...V.map(n => n.h)) + 24 * GAP;
  const tallest = Math.max(...Object.values(cols).map(l => l.length));

  /* Long chains must wrap. A ten-step flow spread across one row is 1,400 px wide;
     fitted to the screen, the text ends up four pixels tall — that is not "drawn",
     that is gone.
     Up to six steps stay on one row; beyond that, snake downward with √n·1.5
     columns per row. */
  const perRow = maxD > 6 ? Math.ceil(Math.sqrt(maxD + 1) * 1.5) : maxD + 1;
  const bandH = (tallest - 1) * rowH + rowH * 2.1;

  Object.entries(cols).forEach(([d, list]) => {
    const dd = +d, band = Math.floor(dd / perRow), col = dd % perRow;
    list.forEach((n, i) => {
      n.x = col * colW;
      n.y = band * bandH + (i - (list.length - 1) / 2) * rowH;
    });
  });
}

/* Network: with a hundred-odd nodes, an O(n²) force layout converges in three
   hundred steps; a quadtree is not worth the trouble. */
function layoutNet(V, map, edges) {
  V.forEach((n, i) => {
    const a = i * 2.399963;                                     // golden-angle scatter, so the initial positions do not clump
    n.x = Math.cos(a) * 16 * Math.sqrt(i); n.y = Math.sin(a) * 16 * Math.sqrt(i);
  });
  const links = [];
  for (const e of edges) if (map[e.from] && map[e.to]) links.push([map[e.from], map[e.to]]);
  for (const n of V) if (n.parent && map[n.parent]) links.push([map[n.parent], n]);
  const REST = 120 * GAP;
  for (let s = 0; s < 320; s++) {
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
      const a = V[i], b = V[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx * dx + dy * dy + 1, d = Math.sqrt(d2);
      const f = 42000 * GAP / d2 / d;
      a.x += dx * f; a.y += dy * f; b.x -= dx * f; b.y -= dy * f;
    }
    for (const [a, b] of links) {
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1, f = (d - REST) * 0.022;
      dx /= d; dy /= d;
      a.x += dx * f; a.y += dy * f; b.x -= dx * f; b.y -= dy * f;
    }
    for (const n of V) { n.x *= 0.999; n.y *= 0.999 }
  }
}
export { SAMPLES, parse, wrap, measure, visible, layoutTree, layoutMind, layoutFlow, layoutNet };
export const getFS = () => FS;
export const setFS = v => { FS = v };
export const getGAP = () => GAP;
export const setGAP = v => { GAP = v };
