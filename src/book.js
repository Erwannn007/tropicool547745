// Travel notebook: a two-page spread (one page on narrow screens) to write
// free notes in. Pages are saved on the device as you type.
const BKEY = 'tropicool.book.v1';
const PAGES = 40;

export class Book {
  constructor({ sound, onClose } = {}) {
    this.sound = sound; this.onClose = onClose;
    this.pages = new Array(PAGES).fill('');
    this.page = 0;
    try {
      const d = JSON.parse(localStorage.getItem(BKEY));
      if (d && Array.isArray(d.pages)) { d.pages.slice(0, PAGES).forEach((p, i) => (this.pages[i] = String(p))); this.page = d.page | 0; }
    } catch (_) { /* new notebook */ }
    const $ = (s) => document.querySelector(s);
    this.root = $('#book');
    this.areas = [$('#book-left'), $('#book-right')];
    this.nums = [$('#book-num-left'), $('#book-num-right')];
    this.narrow = matchMedia('(max-width: 620px)');
    this.areas.forEach((ta, k) => {
      ta.addEventListener('input', () => { this.pages[this.page + k] = ta.value; this.saveSoon(); });
      // typing must not move the player or trigger shortcuts
      for (const ev of ['keydown', 'keyup', 'keypress']) ta.addEventListener(ev, (e) => {
        if (ev === 'keydown' && e.key === 'Escape') { ta.blur(); this.close(); }
        e.stopPropagation();
      });
    });
    $('#book-prev').addEventListener('click', () => this.turn(-1));
    $('#book-next').addEventListener('click', () => this.turn(1));
    $('#book-close').addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.narrow.addEventListener?.('change', () => this.render());
  }

  get step() { return this.narrow.matches ? 1 : 2; }
  saveSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 400);
  }
  save() { try { localStorage.setItem(BKEY, JSON.stringify({ pages: this.pages, page: this.page })); } catch (_) { /* private mode */ } }

  turn(dir) {
    const p = Math.max(0, Math.min(PAGES - this.step, this.page + dir * this.step));
    if (p === this.page) return;
    this.page = p;
    this.sound?.('page');
    this.render();
    this.save();
  }

  render() {
    if (this.step === 2) this.page -= this.page % 2;
    this.areas.forEach((ta, k) => { ta.value = this.pages[this.page + k] ?? ''; });
    this.nums[0].textContent = this.page + 1;
    this.nums[1].textContent = this.page + 2;
    document.querySelector('#book-prev').disabled = this.page === 0;
    document.querySelector('#book-next').disabled = this.page + this.step >= PAGES;
  }

  open() {
    this.isOpen = true;
    this.render();
    this.root.classList.remove('hidden');
    document.body.classList.add('book-open');
    this.sound?.('page');
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.save();
    this.areas.forEach((ta) => ta.blur());
    this.root.classList.add('hidden');
    document.body.classList.remove('book-open');
    this.onClose?.();
  }
}
