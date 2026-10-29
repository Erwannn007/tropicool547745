// Inventory: 9-slot hotbar + 27 storage slots, block-game style stack rules
// (pick up / place / split / shift-move / double-click collect / number-key
// swap), crafting list, pixel panels matching the game menus. Item icons are
// rendered from the 3D models (icons.js). Mouse, touch and gamepad.
import { itemDef, RECIPES, CAT_COLOR } from './items.js';
import { iconURL } from './icons.js';

const HOTBAR = 9, SIZE = 36;
const KEY = 'tropicool.inventory.v1';
const KIT = 3; // starter-kit version: new tools are handed out once to existing saves
export { itemDef };

// ---------------------------------------------------------------- model
export class Inventory {
  constructor({ onChange, sound, toast } = {}) {
    this.onChange = onChange; this.sound = sound; this.toast = toast;
    this.slots = new Array(SIZE).fill(null);
    this.selected = 0;
    this.cursor = null; // stack held by the pointer while the inventory is open
    this.open = false;
    this.padIndex = 0;
    this.kit = 0;
    this.load();
    for (const id of ['rod', 'axe', 'scythe']) if (!this.count(id) && !(id === 'scythe' && this.kit >= KIT)) this.add(id, 1);
    if (this.kit < 2) { this.add('torch', 4); this.add('transat', 1); this.add('campfire', 1); }
    if (this.kit < 3 && !this.count('book')) this.add('book', 1);
    if (this.kit < KIT) { this.kit = KIT; this.save(); }
    this.buildDOM();
    this.render();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.slots) && d.slots.length === SIZE) { this.slots = d.slots; this.selected = d.selected | 0; this.kit = d.kit | 0; }
    } catch (_) { /* fresh inventory */ }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ slots: this.slots, selected: this.selected, kit: this.kit })); } catch (_) { /* private mode */ } }

  get held() { return this.slots[this.selected]; }
  count(id) { return this.slots.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0) + (this.cursor?.id === id ? this.cursor.n : 0); }

  // take n items out (selected stack first)
  take(id, n = 1) {
    const order = [this.selected, ...this.slots.keys()];
    for (const i of order) {
      const s = this.slots[i];
      if (!s || s.id !== id || n <= 0) continue;
      const k = Math.min(n, s.n); s.n -= k; n -= k;
      if (s.n <= 0) this.slots[i] = null;
    }
    this.changed();
    return n === 0;
  }
  canCraft(r) { return r.need.every(([id, n]) => this.count(id) >= n); }
  craft(k) {
    const r = RECIPES[k];
    if (!r) return;
    if (!this.canCraft(r)) { this.sound?.('deny'); this.toast?.('Il manque des matériaux'); return; }
    for (const [id, n] of r.need) {
      let left = n;
      if (this.cursor?.id === id) { const t = Math.min(left, this.cursor.n); this.cursor.n -= t; left -= t; if (this.cursor.n <= 0) this.cursor = null; }
      if (left) this.take(id, left);
    }
    const left = this.add(r.out, r.n);
    if (left) { this.cursor = { id: r.out, n: left }; }
    this.sound?.('craft');
    this.flash = r.out;
    this.changed();
  }

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
    if (i >= SIZE) { // crafting column
      const k = i - SIZE, n = RECIPES.length;
      if (pressed.has('up')) i = SIZE + (k + n - 1) % n;
      if (pressed.has('down')) i = SIZE + (k + 1) % n;
      if (pressed.has('left')) i = HOTBAR + 8;
      if (i !== this.padIndex) { this.padIndex = i; this.render(); this.hideTip(); }
      if (pressed.has('confirm')) this.craft(k);
      return;
    }
    const row = i < HOTBAR ? 3 : Math.floor((i - HOTBAR) / 9), col = i < HOTBAR ? i : (i - HOTBAR) % 9;
    const at = (r, c) => (r === 3 ? c : HOTBAR + r * 9 + c);
    if (pressed.has('left')) i = at(row, (col + 8) % 9);
    if (pressed.has('right')) i = col === 8 ? SIZE + Math.min(row, RECIPES.length - 1) : at(row, col + 1);
    if (pressed.has('up')) i = at((row + 3) % 4, col);
    if (pressed.has('down')) i = at((row + 1) % 4, col);
    if (i !== this.padIndex) { this.padIndex = i; this.render(); if (i < SIZE) this.showTipFor(i, this.slotEls[i]); else this.hideTip(); }
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

    // crafting list
    this.craftEls = RECIPES.map((r, k) => {
      const el = document.createElement('div');
      el.className = 'recipe';
      const out = itemDef(r.out);
      el.innerHTML = `<div class="r-out"><img alt="" src="${iconURL(r.out)}">${r.n > 1 ? `<span>×${r.n}</span>` : ''}</div>
        <div class="r-body"><div class="r-name">${out.name}</div><div class="r-need">${r.need.map(([id, n]) => `<span class="need" data-id="${id}" data-n="${n}"><img alt="" src="${iconURL(id)}">${n}</span>`).join('')}</div></div>
        <button class="r-btn" tabindex="-1">Créer</button>`;
      el.querySelector('.r-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.craft(k); });
      el.addEventListener('pointerenter', () => this.showRecipeTip(k, el));
      el.addEventListener('pointerleave', () => this.hideTip());
      $('#craft-list').appendChild(el);
      return el;
    });

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
    this.subEl = $('#inv-sub');
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
      if (this.padFocus && e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) { this.padFocus = false; this.render(); }
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
    this.tipEl.innerHTML = `<b>${d.name}</b><em style="color:${CAT_COLOR[d.cat] || '#fff'}">${d.cat}${s.n > 1 ? ` · ×${s.n}` : ''}</em><span>${d.desc}</span>`;
    this.placeTip(el, x, y);
  }
  showRecipeTip(k, el) {
    const d = itemDef(RECIPES[k].out);
    this.tipEl.innerHTML = `<b>${d.name}</b><em style="color:${CAT_COLOR[d.cat] || '#fff'}">${d.cat}</em><span>${d.desc}</span>`;
    this.placeTip(el);
  }
  placeTip(el, x, y) {
    this.tipEl.classList.remove('hidden');
    const r = el.getBoundingClientRect(), tw = this.tipEl.offsetWidth, th = this.tipEl.offsetHeight;
    let tx = (x ?? r.right) + 14, ty = (y ?? r.top) - th - 6;
    if (tx + tw > innerWidth - 8) tx = (x ?? r.left) - tw - 14;
    if (ty < 8) ty = (y ?? r.bottom) + 18;
    this.tipEl.style.transform = `translate(${Math.max(8, tx)}px, ${Math.max(8, Math.min(innerHeight - th - 8, ty))}px)`;
  }
  hideTip() { this.tipEl?.classList.add('hidden'); }

  paint(el, s) {
    const img = el.firstChild, cnt = el.children[1];
    if (s) {
      const url = iconURL(s.id);
      el.dataset.cat = itemDef(s.id).cat;
      if (img.dataset.id !== s.id) { img.src = url; img.dataset.id = s.id; }
      img.style.visibility = 'visible';
      cnt.textContent = s.n > 1 ? s.n : '';
    } else {
      img.style.visibility = 'hidden'; img.dataset.id = ''; el.dataset.cat = '';
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
    // gamepad: the carried stack hovers over the focused slot, not the mouse
    if (this.open && this.padFocus && this.cursor) {
      const el = this.padIndex < SIZE ? this.slotEls[this.padIndex] : this.craftEls[this.padIndex - SIZE];
      const r = el.getBoundingClientRect();
      this.moveCursor(r.left + r.width * 0.72, r.top + r.height * 0.28);
    }
    // crafting availability
    this.craftEls?.forEach((el, k) => {
      const ok = this.canCraft(RECIPES[k]);
      el.classList.toggle('ok', ok);
      el.classList.toggle('pad-focus', this.open && this.padFocus && this.padIndex === SIZE + k);
      el.querySelectorAll('.need').forEach((n) => n.classList.toggle('miss', this.count(n.dataset.id) < +n.dataset.n));
      if (this.flash === RECIPES[k].out) { el.classList.remove('done'); void el.offsetWidth; el.classList.add('done'); }
    });
    this.flash = null;
    const used = this.slots.filter(Boolean).length;
    if (this.subEl) this.subEl.textContent = `${used} / ${SIZE}`;
    if (showName) {
      const h = this.held;
      this.nameEl.textContent = h ? itemDef(h.id).name : '';
      this.nameEl.classList.remove('show'); void this.nameEl.offsetWidth;
      if (h) this.nameEl.classList.add('show');
    }
  }
}
