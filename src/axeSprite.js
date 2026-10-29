// First-person pixel-art axe drawn on its own low-res overlay canvas.
// A detailed 64x64 sprite is painted procedurally, then ~90 rotation frames
// are pre-rendered with a RotSprite-style pass (3x Scale2x upscale, rotate,
// point-sample) so the swing animates smoothly without losing pixel detail.

const SRC = 64;
const PIVOT = [32, 58]; // grip point in the source sprite
const A_MIN = -128, A_MAX = 40, A_STEP = 2;

// ---------------------------------------------------------------- painting
function paintAxe() {
  const c = document.createElement('canvas'); c.width = c.height = SRC;
  const g = c.getContext('2d');
  const img = g.createImageData(SRC, SRC), d = img.data;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const set = (x, y, col) => {
    if (x < 0 || y < 0 || x >= SRC || y >= SRC) return;
    const [r, gg, b] = typeof col === 'string' ? hex(col) : col;
    const i = (y * SRC + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // handle: x 29..34, y 18..62, slight taper, hickory grain + leather wrap
  const wood = ['#5e3a1a', '#8c5a2a', '#b77e3e', '#d9a25a', '#f0c27a', '#fbe0a6'];
  for (let y = 18; y <= 62; y++) {
    const w = y > 55 ? 7 : 6;
    const x0 = 29 - (y > 55 ? 1 : 0);
    for (let k = 0; k < w; k++) {
      const x = x0 + k;
      let shade = [1, 4, 3, 3, 2, 1, 0][k] ?? 2; // highlight on the left, shadow on the right
      if (w === 6) shade = [4, 3, 3, 2, 2, 1][k];
      if (rnd() < 0.18 && k > 0 && k < w - 1) shade -= 1; // grain
      if ((x * 3 + y) % 11 === 0 && k > 1 && k < w - 2) shade -= 1;
      set(x, y, wood[Math.max(0, Math.min(5, shade))]);
    }
  }
  // grain streaks
  for (let i = 0; i < 9; i++) {
    const x = 30 + Math.floor(rnd() * 4), y0 = 22 + Math.floor(rnd() * 30), len = 3 + Math.floor(rnd() * 5);
    for (let y = y0; y < y0 + len && y < 54; y++) set(x, y, wood[1]);
  }
  // leather wrap (diagonal bands) on the grip
  const lea = ['#4a1e12', '#7a3a24', '#a8552f', '#c8743f'];
  for (let y = 44; y <= 55; y++) for (let x = 28; x <= 35; x++) {
    const band = (x + y) % 4;
    const k = x === 28 ? 0 : x === 35 ? 0 : x === 29 ? 3 : band === 0 ? 0 : band === 1 ? 2 : 1 + (x < 32 ? 1 : 0);
    set(x, y, lea[k]);
  }
  // pommel knob
  for (let y = 59; y <= 62; y++) for (let x = 27; x <= 36; x++) {
    if ((y === 62 && (x < 28 || x > 35))) continue;
    set(x, y, x < 30 ? wood[3] : x > 33 ? wood[0] : wood[1]);
  }

  // head: blade (bearded, flaring left), eye socket, poll
  const steel = ['#2e333d', '#4f5866', '#6f7a8a', '#8f9aaa', '#aeb8c6', '#c9d2de', '#e6edf5', '#ffffff'];
  const edgeX = (y) => 9 - 5 * Math.sin(Math.PI * (y - 3) / 29);
  for (let y = 3; y <= 32; y++) {
    const ex = Math.round(edgeX(y));
    for (let x = ex; x <= 28; x++) {
      const t = (x - ex) / (28 - ex);
      const top = 3 + 8 * Math.pow(t, 0.8), bot = 32 - 11 * Math.pow(t, 0.6);
      if (y < top || y > bot) continue;
      const fromEdge = x - ex;
      const vert = (y - top) / Math.max(1, bot - top); // 0 top .. 1 bottom
      let k = Math.round(5 - vert * 2.6 + (rnd() - 0.5) * 0.6);
      if (fromEdge <= 0) k = 7;
      else if (fromEdge <= 1) k = 6;
      else if (fromEdge <= 3) k = Math.max(k, 5);        // ground bevel
      else if (fromEdge === 4) k = Math.min(k, 3);        // bevel shoulder line
      if ((y + Math.floor(x / 3)) % 7 === 0 && fromEdge > 5) k -= 1; // brushed streaks
      if (y - top < 1) k = Math.min(7, k + 1);              // top rim light
      if (bot - y < 1) k = Math.max(1, k - 2);              // under-shadow
      set(x, y, steel[Math.max(0, Math.min(7, k))]);
    }
  }
  // eye block wrapping the handle
  for (let y = 9; y <= 24; y++) for (let x = 27; x <= 37; x++) {
    let k = x === 27 ? 2 : x >= 36 ? 1 : 3;
    if (y === 9) k = 5; else if (y === 10) k = 4;
    if (y === 24) k = 1;
    set(x, y, steel[k]);
  }
  // poll (back of the head)
  for (let y = 11; y <= 22; y++) for (let x = 38; x <= 42; x++) {
    let k = y === 11 ? 4 : y === 22 ? 1 : x === 42 ? 1 : 2;
    set(x, y, steel[k]);
  }
  // wedge of the handle visible on top of the eye + rivets + glints
  for (let x = 30; x <= 34; x++) set(x, 8, x === 32 ? '#3d2a18' : wood[3]);
  set(32, 9, '#3d2a18');
  for (const [x, y] of [[30, 16], [34, 16], [30, 20], [34, 20]]) { set(x, y, steel[6]); set(x + 1, y + 1, steel[0]); }
  for (const [x, y] of [[12, 9], [13, 9], [12, 10], [16, 13]]) set(x, y, steel[7]);

  // dark outline around every shape
  const filled = (x, y) => x >= 0 && y >= 0 && x < SRC && y < SRC && d[(y * SRC + x) * 4 + 3] === 255;
  const out = [];
  for (let y = 0; y < SRC; y++) for (let x = 0; x < SRC; x++) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out.push([x, y]);
  }
  for (const [x, y] of out) set(x, y, '#1a1c24');
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- RotSprite
function scale2x(src, w, h) {
  const out = new Uint32Array(w * h * 4);
  const at = (x, y) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    const o = (y * 2) * (w * 2) + x * 2;
    out[o] = C === A && C !== D && A !== B ? A : P;
    out[o + 1] = A === B && A !== C && B !== D ? B : P;
    out[o + w * 2] = D === C && D !== B && C !== A ? C : P;
    out[o + w * 2 + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return out;
}

function buildFrames(base) {
  const g = base.getContext('2d');
  const src = new Uint32Array(g.getImageData(0, 0, SRC, SRC).data.buffer.slice(0));
  let px = src;
  let w = SRC;
  for (let i = 0; i < 3; i++) { px = scale2x(px, w, w); w *= 2; }
  const up = 8;
  // radius around the pivot that contains every opaque pixel
  let R = 0;
  for (let y = 0; y < SRC; y++) for (let x = 0; x < SRC; x++) {
    if (src[y * SRC + x] >>> 24) R = Math.max(R, Math.hypot(x + 0.5 - PIVOT[0], y + 0.5 - PIVOT[1]));
  }
  R = Math.ceil(R) + 1;
  const S = R * 2;
  const frames = [];
  for (let a = A_MIN; a <= A_MAX; a += A_STEP) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const cg = c.getContext('2d');
    const im = cg.createImageData(S, S);
    const o32 = new Uint32Array(im.data.buffer);
    const r = -a * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    for (let oy = 0; oy < S; oy++) for (let ox = 0; ox < S; ox++) {
      const dx = ox + 0.5 - R, dy = oy + 0.5 - R;
      const sx = PIVOT[0] + dx * cs - dy * sn, sy = PIVOT[1] + dx * sn + dy * cs;
      const ux = Math.floor(sx * up), uy = Math.floor(sy * up);
      if (ux < 0 || uy < 0 || ux >= w || uy >= w) continue;
      o32[oy * S + ox] = px[uy * w + ux];
    }
    cg.putImageData(im, 0, 0);
    frames.push(c);
  }
  return { frames, R };
}

// ---------------------------------------------------------------- animator
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};
const lerp = (a, b, t) => a + (b - a) * t;

// keyframes: time (s), angle (deg, clockwise), pivot offset (fraction of H)
const IDLE = { a: -24, x: 0, y: 0 };
const KEYS = [
  { t: 0.0, a: -24, x: 0, y: 0 },
  { t: 0.15, a: 28, x: 0.08, y: -0.16, e: 'out' },     // wind up, raise high
  { t: 0.2, a: 32, x: 0.085, y: -0.17, e: 'inOut' },   // tiny hang at the top
  { t: 0.31, a: -100, x: -0.36, y: -0.4, e: 'in' },    // wide fast chop across the view
  { t: 0.38, a: -112, x: -0.42, y: -0.3, e: 'out' },   // follow-through
  { t: 0.64, a: -24, x: 0, y: 0, e: 'inOut' },         // recover
];
export const SWING_TIME = KEYS[KEYS.length - 1].t;
export const IMPACT_ANGLE = -62;

export class AxeSprite {
  constructor() {
    this.canvas = document.getElementById('held-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.base = paintAxe();
    const { frames, R } = buildFrames(this.base);
    this.frames = frames; this.R = R;
    this.visible = false;
    this.t = -1;
    this.trail = [];
    this.swoosh = [];
    this.prevPose = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // icon for the inventory (the same art, unrotated, cropped to the head)
  icon() { return this.base; }

  resize() {
    const minSide = 128;
    const k = Math.min(innerWidth, innerHeight) / minSide;
    this.W = Math.round(innerWidth / k); this.H = Math.round(innerHeight / k);
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
  }

  setVisible(v) { this.visible = v; this.canvas.style.display = v ? 'block' : 'none'; if (!v) { this.t = -1; this.queued = false; } }
  // returns true when a new swing starts; a press during the recovery is buffered
  swing() {
    if (this.t < 0) { this.t = 0; this.trail = []; return true; }
    if (this.t > 0.22) this.queued = true;
    return false;
  }
  get swinging() { return this.t >= 0; }

  pose(t) {
    if (t < 0) return IDLE;
    for (let i = 1; i < KEYS.length; i++) {
      const k0 = KEYS[i - 1], k1 = KEYS[i];
      if (t <= k1.t) {
        const u = ease[k1.e]((t - k0.t) / (k1.t - k0.t));
        return { a: lerp(k0.a, k1.a, u), x: lerp(k0.x, k1.x, u), y: lerp(k0.y, k1.y, u) };
      }
    }
    return IDLE;
  }

  // returns true on the frame the blade passes the impact angle
  update(dt, bob, moving) {
    let impact = false;
    if (this.t >= 0) {
      const before = this.pose(this.t).a;
      if (this.hitStop > 0) this.hitStop -= dt; else this.t += dt;
      const after = this.pose(this.t).a;
      if (before > IMPACT_ANGLE && after <= IMPACT_ANGLE) impact = true;
      if (this.t >= SWING_TIME) {
        this.t = -1;
        if (this.queued) { this.queued = false; this.t = 0; this.trail = []; this.onChain?.(); }
      }
    }
    this.draw(dt, bob, moving);
    return impact;
  }

  freeze(s) { this.hitStop = s; }

  tipAt(a, px, py) {
    // blade-edge middle relative to the pivot, rotated
    const dx = 8 - PIVOT[0], dy = 17 - PIVOT[1];
    const r = a * Math.PI / 180;
    return [px + dx * Math.cos(r) - dy * Math.sin(r), py + dx * Math.sin(r) + dy * Math.cos(r)];
  }

  draw(dt, bob, moving) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    if (!this.visible) return;
    const p = this.pose(this.t);
    const sway = moving ? 1 : 0.25;
    const bx = Math.sin(bob) * 3 * sway, by = Math.abs(Math.sin(bob * 2)) * 3 * sway + Math.sin(performance.now() / 700) * 0.8;
    const px = Math.round(W - Math.min(W * 0.2, H * 0.42) + p.x * H + bx);
    const py = Math.round(H + 6 + p.y * H + by);
    const idx = (a) => Math.max(0, Math.min(this.frames.length - 1, Math.round((a - A_MIN) / A_STEP)));

    // swoosh arc + ghost frames during the fast part of the swing
    const fast = this.t > 0.2 && this.t < 0.38;
    if (fast && this.prevPose) {
      const steps = 24;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const [tx, ty] = this.tipAt(lerp(this.prevPose.a, p.a, u), lerp(this.prevPose.px, px, u), lerp(this.prevPose.py, py, u));
        this.swoosh.push({ x: tx, y: ty, life: 0.18 });
      }
    }
    for (const s of this.swoosh) s.life -= dt;
    this.swoosh = this.swoosh.filter((s) => s.life > 0);
    for (const s of this.swoosh) {
      const k = s.life / 0.18;
      const r = Math.max(1, Math.round(7 * k));
      ctx.fillStyle = `rgba(200,236,255,${0.32 * k})`;
      ctx.fillRect(Math.round(s.x - r / 2), Math.round(s.y - r / 2), r, r);
      const c = Math.max(1, Math.round(3 * k));
      ctx.fillStyle = `rgba(255,255,255,${0.75 * k})`;
      ctx.fillRect(Math.round(s.x - c / 2), Math.round(s.y - c / 2), c, c);
    }
    if (fast) {
      this.trail.unshift({ a: p.a, x: px, y: py });
      this.trail.length = Math.min(this.trail.length, 3);
      this.trail.forEach((g, i) => {
        if (i === 0) return;
        ctx.globalAlpha = 0.28 / i;
        ctx.drawImage(this.frames[idx(g.a)], g.x - this.R, g.y - this.R);
      });
      ctx.globalAlpha = 1;
    } else this.trail = [];

    ctx.drawImage(this.frames[idx(p.a)], px - this.R, py - this.R);
    this.prevPose = { a: p.a, px, py };
  }
}
