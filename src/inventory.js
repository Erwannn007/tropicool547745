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

const iconCache = new Map();
export function itemDef(id) {
  if (id === 'rod') return { name: 'Canne à pêche', max: 1, sub: 'Outil', icon: () => rodIcon() };
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

    // pointer handling inside the inventory
    let lastClick = { t: 0, i: -1 }, press = null;
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.slot');
      this.moveCursor(e.clientX, e.clientY);
      if (!el) { if (e.target === this.root) this.closeRequest?.(); return; }
      e.preventDefault();
      const i = +el.dataset.i;
      this.padIndex = i;
      if (e.pointerType === 'touch') {
        // long-press = right click (split / place one), tap = left click
        press = { i, timer: setTimeout(() => { this.rightClick(i); press = null; navigator.vibrate?.(15); }, 380) };
        return;
      }
      if (e.button === 2) this.rightClick(i);
      else if (e.shiftKey) this.quickMove(i);
      else {
        const now = performance.now();
        if (now - lastClick.t < 300 && lastClick.i === i && this.cursor) this.collect();
        else this.leftClick(i);
        lastClick = { t: now, i };
      }
    });
    this.root.addEventListener('pointerup', (e) => {
      if (press && e.pointerType === 'touch') {
        clearTimeout(press.timer);
        const now = performance.now();
        if (now - lastClick.t < 300 && lastClick.i === press.i) this.quickMove(press.i); // double tap = quick move
        else this.leftClick(press.i);
        lastClick = { t: now, i: press.i };
        press = null;
      }
    });
    this.root.addEventListener('pointermove', (e) => {
      this.moveCursor(e.clientX, e.clientY);
      const el = e.target.closest('.slot');
      if (el && e.pointerType !== 'touch') { this.hover = +el.dataset.i; this.showTipFor(this.hover, el, e.clientX, e.clientY); }
      else if (!el) { this.hover = -1; this.hideTip(); }
    });
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
