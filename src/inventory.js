// Inventory: 9-slot hotbar + 27 storage slots, block-game style stack rules
// (pick up / place / split / shift-move / double-click collect / number-key
// swap), rendered as "liquid glass" DOM. Mouse, touch and gamepad.
import { SPECIES } from './fishing.js';
import { fishIcon } from './textures.js';

const HOTBAR = 9, SIZE = 36;
const KEY = 'tropicool.inventory.v1';

// ---------------------------------------------------------------- items
function rodIcon() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let i = 0; i < 13; i++) { // diagonal rod, handle bottom-left
    const x = 1 + i, y = 14 - i;
    px(x, y, i < 4 ? '#c89a5a' : i < 5 ? '#2b2f3a' : '#9a6a3a');
    if (i < 10) px(x + 1, y, i < 4 ? '#8a6232' : '#6e4a27');
  }
  px(3, 11, '#2b2f3a'); px(4, 12, '#4a5060'); // reel
  for (let y = 2; y < 11; y++) px(14, y, '#e8f0f8'); // line
  px(14, 11, '#ff3b2f'); px(13, 12, '#ff3b2f'); px(14, 12, '#ffffff'); // bobber
  return c;
}

// 16x16 pixel icons from character maps; a dark outline is added around shapes
function pixelIcon(rows, pal) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  const at = (x, y) => (rows[y] && rows[y][x] && rows[y][x] !== '.' ? rows[y][x] : null);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const k = at(x, y);
    if (k) { g.fillStyle = pal[k]; g.fillRect(x, y, 1, 1); }
    else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) { g.fillStyle = 'rgba(28,22,26,.9)'; g.fillRect(x, y, 1, 1); }
  }
  return c;
}

const AXE = [
  '................',
  '..........ss....',
  '.........smmw...',
  '........dmmmlw..',
  '.......dmmmmllw.',
  '........dmmmmlw.',
  '.......h.dmmmlw.',
  '......hb..dmmw..',
  '.....hb....ss...',
  '....hb..........',
  '...hb...........',
  '..hb............',
  '.gr.............',
  'gr..............',
  '................',
  '................',
];
const LOG = [
  '................',
  '................',
  '................',
  '.........rrrr...',
  '......bbrccccrr.',
  '...bbbbrccrrcr..',
  '.bbBbbbrcrccrcr.',
  '.bBbbBbrcrcrcrc.',
  '.bbbBbbrcrccrcr.',
  '.bBbbbBrccrrcr..',
  '.bbbbbbbrcccr...',
  '..bbbbbbbrrr....',
  '................',
  '................',
  '................',
  '................',
];
const COCO = [
  '................',
  '................',
  '......nnnn......',
  '....nNnnnnnn....',
  '...nNNnnfnnnn...',
  '..nnNnnnnfnnnn..',
  '..nnnnennnnfnn..',
  '..nnnenennnnnn..',
  '..nnnnnnfnnnnn..',
  '..nnfnnnnnnnnd..',
  '...nnnnnnnnnd...',
  '...dnnnnnnndd...',
  '.....ddddddd....',
  '................',
  '................',
  '................',
];
const ICONS = {
  axe: () => pixelIcon(AXE, { s: '#5a6270', m: '#9aa4b2', l: '#c8d0dc', w: '#f2f6fb', d: '#454c58', h: '#c08a52', b: '#7a5030', g: '#5a2e1a', r: '#8a4a2a' }),
  'wood:palm': () => pixelIcon(LOG, { b: '#9a7046', B: '#7a5432', r: '#c69a62', c: '#e6c48c' }),
  'wood:tree': () => pixelIcon(LOG, { b: '#6a4428', B: '#4e301a', r: '#b07a48', c: '#d8a868' }),
  coconut: () => pixelIcon(COCO, { n: '#7a4e2a', N: '#a8784a', f: '#5a3418', e: '#2a1a10', d: '#5a3820' }),
};
const NAMES = {
  axe: ['Hache', 1, 'Outil'],
  'wood:palm': ['Bois de palmier', 64, 'Matériau'],
  'wood:tree': ['Bois tropical', 64, 'Matériau'],
  coconut: ['Noix de coco', 64, 'Nourriture'],
};

const iconCache = new Map();
export function itemDef(id) {
  if (id === 'rod') return { name: 'Canne à pêche', max: 1, sub: 'Outil', icon: () => rodIcon() };
  if (NAMES[id]) { const [name, max, sub] = NAMES[id]; return { name, max, sub, icon: ICONS[id] }; }
  if (id.startsWith('fish:')) {
    const s = SPECIES[+id.slice(5)];
    return { name: s.name, max: 64, sub: 'Poisson', icon: () => fishIcon(s.c, s.name.length * 31) };
  }
  return { name: id, max: 64, sub: '', icon: () => document.createElement('canvas') };
}
function iconURL(id) {
  if (!iconCache.has(id)) {
    const src = itemDef(id).icon();
    // centre on a square canvas so every icon shares the same pixel grid
    const c = document.createElement('canvas'); c.width = c.height = 32;
    c.getContext('2d').drawImage(src, (32 - src.width * (src.width <= 16 ? 2 : 1)) / 2, (32 - src.height * (src.width <= 16 ? 2 : 1)) / 2,
      src.width * (src.width <= 16 ? 2 : 1), src.height * (src.width <= 16 ? 2 : 1));
    iconCache.set(id, c.toDataURL());
  }
  return iconCache.get(id);
}

// ---------------------------------------------------------------- model
export class Inventory {
  constructor({ onChange, sound, toast } = {}) {
    this.onChange = onChange; this.sound = sound; this.toast = toast;
    this.slots = new Array(SIZE).fill(null);
    this.selected = 0;
    this.cursor = null; // stack held by the pointer while the inventory is open
    this.open = false;
    this.padIndex = 0;
    this.load();
    if (!this.slots.some((s) => s && s.id === 'rod')) this.add('rod', 1);
    if (!this.slots.some((s) => s && s.id === 'axe')) this.add('axe', 1);
    this.buildDOM();
    this.render();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.slots) && d.slots.length === SIZE) { this.slots = d.slots; this.selected = d.selected | 0; }
    } catch (_) { /* fresh inventory */ }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ slots: this.slots, selected: this.selected })); } catch (_) { /* private mode */ } }

  get held() { return this.slots[this.selected]; }

  // add to existing stacks first (hotbar, then storage), then empty slots
  add(id, n = 1) {
    const max = itemDef(id).max;
    for (let i = 0; i < SIZE && n > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
    }
    for (let i = 0; i < SIZE && n > 0; i++) {
      if (!this.slots[i]) { const k = Math.min(n, max); this.slots[i] = { id, n: k }; n -= k; }
    }
    this.changed();
    return n; // leftover that did not fit
  }

  select(i) {
    i = ((i % HOTBAR) + HOTBAR) % HOTBAR;
    if (i === this.selected) return;
    this.selected = i;
    this.sound?.('tick');
    this.changed(true);
  }

  changed(showName) { this.save(); this.render(showName); this.onChange?.(this.held); }

  // ---- slot interactions --------------------------------------------
  leftClick(i) {
    const s = this.slots[i], c = this.cursor;
    if (!c) { if (s) { this.cursor = s; this.slots[i] = null; } }
    else if (!s) { this.slots[i] = c; this.cursor = null; }
    else if (s.id === c.id) {
      const max = itemDef(s.id).max, k = Math.min(c.n, max - s.n);
      s.n += k; c.n -= k;
      if (c.n <= 0) this.cursor = null;
      else if (k === 0) { this.slots[i] = c; this.cursor = s; }
    } else { this.slots[i] = c; this.cursor = s; }
    this.sound?.('tick');
    this.changed();
  }

  rightClick(i) {
    const s = this.slots[i], c = this.cursor;
    if (!c) {
      if (!s) return;
      const half = Math.ceil(s.n / 2);
      this.cursor = { id: s.id, n: half };
      s.n -= half;
      if (s.n <= 0) this.slots[i] = null;
    } else if (!s) { this.slots[i] = { id: c.id, n: 1 }; c.n--; }
    else if (s.id === c.id && s.n < itemDef(s.id).max) { s.n++; c.n--; }
    else { this.leftClick(i); return; }
    if (c && c.n <= 0) this.cursor = null;
    this.sound?.('tick');
    this.changed();
  }

  // shift-click: send the stack to the other section
  quickMove(i) {
    const s = this.slots[i];
    if (!s) return;
    const range = i < HOTBAR ? [HOTBAR, SIZE] : [0, HOTBAR];
    const max = itemDef(s.id).max;
    for (let j = range[0]; j < range[1] && s.n > 0; j++) {
      const t = this.slots[j];
      if (t && t.id === s.id && t.n < max) { const k = Math.min(s.n, max - t.n); t.n += k; s.n -= k; }
    }
    for (let j = range[0]; j < range[1] && s.n > 0; j++) {
      if (!this.slots[j]) { this.slots[j] = { id: s.id, n: s.n }; s.n = 0; }
    }
    if (s.n <= 0) this.slots[i] = null;
    this.sound?.('tick');
    this.changed();
  }

  // double-click with a stack on the cursor: gather all matching items
  collect() {
    const c = this.cursor;
    if (!c) return;
    const max = itemDef(c.id).max;
    for (let j = 0; j < SIZE && c.n < max; j++) {
      const t = this.slots[j];
      if (t && t.id === c.id) { const k = Math.min(t.n, max - c.n); c.n += k; t.n -= k; if (t.n <= 0) this.slots[j] = null; }
    }
    this.changed();
  }

  // number key while hovering: swap with that hotbar slot
  swapWithHotbar(i, h) {
    if (i === h) return;
    [this.slots[i], this.slots[h]] = [this.slots[h], this.slots[i]];
    this.sound?.('tick');
    this.changed();
  }

  setOpen(open) {
    this.open = open;
    if (!open && this.cursor) { // never lose the carried stack
      const left = this.add(this.cursor.id, this.cursor.n);
      this.cursor = null;
      if (left) this.toast?.('Inventaire plein');
    }
    this.root.classList.toggle('hidden', !open);
    document.body.classList.toggle('inv-open', open);
    this.hideTip();
    this.render();
  }

  // ---- gamepad -------------------------------------------------------
  handlePad(pressed) {
    let i = this.padIndex;
    const row = i < HOTBAR ? 3 : Math.floor((i - HOTBAR) / 9), col = i < HOTBAR ? i : (i - HOTBAR) % 9;
    const at = (r, c) => (r === 3 ? c : HOTBAR + r * 9 + c);
    if (pressed.has('left')) i = at(row, (col + 8) % 9);
    if (pressed.has('right')) i = at(row, (col + 1) % 9);
    if (pressed.has('up')) i = at((row + 3) % 4, col);
    if (pressed.has('down')) i = at((row + 1) % 4, col);
    if (i !== this.padIndex) { this.padIndex = i; this.render(); this.showTipFor(i, this.slotEls[i]); }
    if (pressed.has('confirm')) this.leftClick(i);
    if (pressed.has('action')) this.rightClick(i);
    if (pressed.has('quick')) this.quickMove(i);
  }

  // ---- DOM ------------------------------------------------------------
  buildDOM() {
    const $ = (s) => document.querySelector(s);
    this.hotbarEl = $('#hotbar');
    this.root = $('#inventory');
    this.slotEls = [];
    const mk = (i) => {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = '<img alt="" draggable="false"><span class="count"></span>';
      el.dataset.i = i;
      this.slotEls[i] = el;
      return el;
    };
    const storage = $('#inv-storage'), hot = $('#inv-hotbar');
    for (let i = HOTBAR; i < SIZE; i++) storage.appendChild(mk(i));
    for (let i = 0; i < HOTBAR; i++) hot.appendChild(mk(i));

    // in-game hotbar (separate elements)
    this.hudSlots = [];
    for (let i = 0; i < HOTBAR; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = '<img alt="" draggable="false"><span class="count"></span><span class="key">' + (i + 1) + '</span>';
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.select(i); });
      this.hotbarEl.querySelector('.slots').appendChild(el);
      this.hudSlots.push(el);
    }
    this.lens = this.hotbarEl.querySelector('.lens');
    this.nameEl = $('#held-name');
    this.cursorEl = $('#inv-cursor');
    this.tipEl = $('#inv-tip');

    // Pointer handling, mouse + touch:
    //  - press on a stack and drag it onto another slot (move / merge / swap)
    //  - tap to pick up, tap again to place (block-game style)
    //  - touch: long-press while holding still = keep only half
    //  - double tap = quick move; mouse: right click, shift+click, double click
    let lastTap = { t: 0, i: -1 }, drag = null;
    const slotAt = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.('.slot');
      return el && el.dataset.i !== undefined && this.root.contains(el) ? +el.dataset.i : -1;
    };
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.slot');
      this.moveCursor(e.clientX, e.clientY);
      if (!el || el.dataset.i === undefined) { if (e.target === this.root) this.closeRequest?.(); return; }
      e.preventDefault();
      try { this.root.setPointerCapture(e.pointerId); } catch (_) { /* not capturable */ }
      const i = +el.dataset.i;
      this.padIndex = i;
      this.hideTip();
      if (e.pointerType === 'mouse' && e.button === 2) { this.rightClick(i); return; }
      if (e.pointerType === 'mouse' && e.shiftKey) { this.quickMove(i); return; }
      if (e.pointerType === 'mouse' && this.cursor && performance.now() - lastTap.t < 300 && lastTap.i === i) { this.collect(); return; }
      const hadCursor = !!this.cursor;
      this.leftClick(i); // pick up, or place what we were carrying
      drag = { id: e.pointerId, from: i, x: e.clientX, y: e.clientY, moved: false, picked: !hadCursor && !!this.cursor, timer: null };
      if (e.pointerType === 'touch' && drag.picked) {
        drag.timer = setTimeout(() => {
          if (!drag || drag.moved || !this.cursor) return;
          const c = this.cursor, keep = Math.floor(c.n / 2);
          if (keep > 0 && !this.slots[i]) { this.slots[i] = { id: c.id, n: keep }; c.n -= keep; this.changed(); }
          navigator.vibrate?.(15);
        }, 380);
      }
    });
    this.root.addEventListener('pointermove', (e) => {
      this.moveCursor(e.clientX, e.clientY);
      if (drag && e.pointerId === drag.id && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true;
      if (e.pointerType === 'touch') return;
      const i = slotAt(e.clientX, e.clientY);
      if (i >= 0) { this.hover = i; this.showTipFor(i, this.slotEls[i], e.clientX, e.clientY); } else { this.hover = -1; this.hideTip(); }
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      clearTimeout(drag.timer);
      const d = drag; drag = null;
      const now = performance.now();
      if (!d.moved) {
        // a tap: second tap on the same slot = quick move
        if (now - lastTap.t < 300 && lastTap.i === d.from && !this.cursor) this.quickMove(d.from);
        lastTap = { t: now, i: d.from };
        return;
      }
      if (!d.picked || !this.cursor) return;
      const to = e.type === 'pointercancel' ? -1 : slotAt(e.clientX, e.clientY);
      if (to >= 0 && to !== d.from) {
        this.leftClick(to); // drop: move, merge or swap
        // swapped stack goes back to where the drag started
        if (this.cursor && !this.slots[d.from]) this.leftClick(d.from);
      } else if (!this.slots[d.from] || this.slots[d.from].id === this.cursor.id) {
        this.leftClick(d.from); // dropped outside: put it back
      }
    };
    this.root.addEventListener('pointerup', end);
    this.root.addEventListener('pointercancel', end);
    addEventListener('keydown', (e) => {
      if (!this.open || this.hover == null || this.hover < 0) return;
      const n = +e.key;
      if (n >= 1 && n <= 9) this.swapWithHotbar(this.hover, n - 1);
    });
  }

  moveCursor(x, y) {
    this.cx = x; this.cy = y;
    this.cursorEl.style.transform = `translate(${x}px, ${y}px)`;
  }

  showTipFor(i, el, x, y) {
    const s = this.slots[i];
    if (!s || this.cursor) { this.hideTip(); return; }
    const d = itemDef(s.id);
    let extra = d.sub;
    if (s.id.startsWith('fish:')) {
      const sp = SPECIES[+s.id.slice(5)];
      extra += ` · ${sp.d[0]}–${sp.d[1]} m`;
    }
    this.tipEl.innerHTML = `<b>${d.name}</b><span>${extra}</span>`;
    this.tipEl.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const tx = x ?? r.right, ty = y ?? r.top;
    this.tipEl.style.transform = `translate(${Math.min(innerWidth - 200, tx + 14)}px, ${Math.max(8, ty - 44)}px)`;
  }
  hideTip() { this.tipEl?.classList.add('hidden'); }

  paint(el, s) {
    const img = el.firstChild, cnt = el.children[1];
    if (s) {
      const url = iconURL(s.id);
      if (img.dataset.id !== s.id) { img.src = url; img.dataset.id = s.id; }
      img.style.visibility = 'visible';
      cnt.textContent = s.n > 1 ? s.n : '';
    } else {
      img.style.visibility = 'hidden'; img.dataset.id = '';
      cnt.textContent = '';
    }
  }

  render(showName) {
    if (!this.slotEls) return;
    for (let i = 0; i < SIZE; i++) {
      this.paint(this.slotEls[i], this.slots[i]);
      this.slotEls[i].classList.toggle('pad-focus', this.open && this.padFocus && i === this.padIndex);
      this.slotEls[i].classList.toggle('active', i === this.selected);
    }
    for (let i = 0; i < HOTBAR; i++) {
      this.paint(this.hudSlots[i], this.slots[i]);
      this.hudSlots[i].classList.toggle('active', i === this.selected);
    }
    this.lens.style.setProperty('--i', this.selected);
    this.paint(this.cursorEl, this.cursor);
    this.cursorEl.classList.toggle('hidden', !this.cursor);
    if (showName) {
      const h = this.held;
      this.nameEl.textContent = h ? itemDef(h.id).name : '';
      this.nameEl.classList.remove('show'); void this.nameEl.offsetWidth;
      if (h) this.nameEl.classList.add('show');
    }
  }
}
