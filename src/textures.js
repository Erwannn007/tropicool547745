// Procedural pixel-art textures painted on canvases (no image assets needed).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Tileable value noise on a wrapped lattice.
function tileNoise(rnd, period) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (a, b) => g[((b % period + period) % period) * period + ((a % period + period) % period)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

class Pix {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.d = this.img.data;
  }
  set(x, y, rgb, a = 255, wrap = true) {
    if (wrap) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; }
    else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = rgb[0]; this.d[i + 1] = rgb[1]; this.d[i + 2] = rgb[2]; this.d[i + 3] = a;
  }
  get(x, y) {
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  fill(rgb, a = 255) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, rgb, a); }
  texture({ repeat = true, mips = true } = {}) {
    this.ctx.putImageData(this.img, 0, 0);
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = mips ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
    t.generateMipmaps = mips;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }
}

const shade = (c, k) => [Math.min(255, c[0] * k) | 0, Math.min(255, c[1] * k) | 0, Math.min(255, c[2] * k) | 0];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];

// Dense lime grass seen from above: hundreds of tiny blade strokes.
export function grassTexture(seed = 1) {
  const S = 128, p = new Pix(S, S), rnd = mulberry32(seed);
  const pal = ['#2f8a1c', '#3d9f22', '#4cb328', '#5bc42e', '#6bd234', '#7edd3c', '#95e84a', '#aef25e'].map(hex);
  const n = tileNoise(rnd, 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = n(x / 16, y / 16) * 0.6 + rnd() * 0.4;
    p.set(x, y, pal[1 + Math.floor(v * 3)]);
  }
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S);
    const len = 2 + Math.floor(rnd() * 4);
    const lean = rnd() < 0.5 ? -1 : 1;
    const base = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < len; k++) {
      const t = k / (len - 1);
      const c = pal[Math.min(7, base + Math.round(t * 3))];
      const xo = (k > len / 2 && rnd() < 0.5) ? lean : 0;
      p.set(x + xo, y - k, c);
    }
    p.set(x, y + 1, pal[0]); // shadow under the blade
  }
  return p.texture();
}

export function sandTexture(seed = 2) {
  const S = 128, p = new Pix(S, S), rnd = mulberry32(seed);
  const pal = ['#c9ad78', '#d8be8a', '#e4cc98', '#ecd7a6', '#f3e2b6', '#f8ecc8'].map(hex);
  const n = tileNoise(rnd, 16);
  const n2 = tileNoise(rnd, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ripple = Math.sin((y + n2(x / 32, y / 32) * 18) * 0.42) * 0.5 + 0.5;
    const v = n(x / 8, y / 8) * 0.45 + ripple * 0.25 + rnd() * 0.3;
    p.set(x, y, pal[Math.min(5, 1 + Math.floor(v * 4))]);
  }
  // pebbles & shells
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S);
    const c = rnd() < 0.3 ? hex('#fff7e6') : rnd() < 0.5 ? hex('#a88b62') : hex('#8c7a66');
    p.set(x, y, c); if (rnd() < 0.6) p.set(x + 1, y, c);
    p.set(x, y + 1, pal[0]);
  }
  return p.texture();
}

// Chunky stones with light top-left bevels and dark joints (furnace/cliff look).
export function rockTexture(seed = 3) {
  const S = 64, p = new Pix(S, S), rnd = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push([rnd() * S, rnd() * S, 0.75 + rnd() * 0.4]);
  const base = hex('#8a8a86');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const dx = x - pts[i][0] - ox * S, dy = y - pts[i][1] - oy * S;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
      }
    }
    const edge = d2 - d1;
    let k = pts[id][2] * (0.92 + rnd() * 0.12);
    if (edge < 1.3) k = 0.45;
    else if (edge < 2.6) k *= 1.18;
    p.set(x, y, shade(base, k));
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S);
    p.set(x, y, shade(base, 0.62));
  }
  return p.texture();
}

// Loose surface stones (mined with the pickaxe): warm basalt in rounded
// cells, cracks between them, and pale quartz veins as the signature detail.
// 96 px over 3 m of the triplanar ROCK mapping = 32 px/m.
export function stoneTexture(seed = 13) {
  const S = 96, p = new Pix(S, S), rnd = mulberry32(seed);
  const pal = ['#4a4450', '#5c5560', '#716a6e', '#877f7e', '#9d948d', '#b4aa9e'].map(hex);
  const quartz = ['#cfc6b8', '#e8e0d0', '#f8f2e6'].map(hex);
  const n = tileNoise(rnd, 12);
  const pts = [];
  for (let i = 0; i < 26; i++) pts.push([rnd() * S, rnd() * S, 2.2 + rnd() * 1.6]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let i = 0; i < pts.length; i++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const d = Math.hypot(x - pts[i][0] - ox * S, y - pts[i][1] - oy * S);
      if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1;
    let k = pts[id][2] + (n(x / 8, y / 8) - 0.5) * 1.6 - d1 * 0.03;
    if (edge < 1.2) k = 0.3; else if (edge < 2.4) k += 0.9; // crack, then a lit lip
    p.set(x, y, pal[Math.max(0, Math.min(5, Math.round(k)))]);
  }
  // quartz veins wandering across the cells
  for (let v = 0; v < 5; v++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * 6.28;
    const len = 30 + rnd() * 50;
    for (let s = 0; s < len; s++) {
      a += (rnd() - 0.5) * 0.5; x += Math.cos(a); y += Math.sin(a);
      p.set(Math.floor(x), Math.floor(y), quartz[s % 7 === 0 ? 2 : 1]);
      if (rnd() < 0.35) p.set(Math.floor(x), Math.floor(y) + 1, quartz[0]);
    }
  }
  for (let i = 0; i < 120; i++) p.set(Math.floor(rnd() * S), Math.floor(rnd() * S), rnd() < 0.5 ? pal[0] : quartz[0]); // grit
  return p.texture();
}

// Palm trunk: stacked fibrous rings.
export function trunkTexture(seed = 4) {
  const W = 32, H = 32, p = new Pix(W, H), rnd = mulberry32(seed);
  const pal = ['#5a3a1e', '#6e4a27', '#86603a', '#9d7448', '#b28856', '#c49a66'].map(hex);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ring = y / H; // 0 bottom .. 1 top of one ring segment
    let v = 1.5 + ring * 3 + (rnd() - 0.5) * 1.4;
    if (ring > 0.86) v = 0.6 + rnd() * 0.8;
    if ((x + Math.floor(y / 3)) % 5 === 0 && ring < 0.86) v -= 1;
    p.set(x, H - 1 - y, pal[Math.max(0, Math.min(5, Math.round(v)))]);
  }
  return p.texture();
}

// Palm frond: v runs along the frond (0 base -> 1 tip), alpha cut-out leaflets.
export function frondTexture(seed = 5, palette) {
  const W = 64, H = 128, p = new Pix(W, H), rnd = mulberry32(seed);
  const pal = (palette || ['#1f6b1c', '#2b8622', '#3aa02a', '#4fb933', '#69cf3c', '#8be04c', '#b2ef6a']).map(hex);
  p.fill([0, 0, 0], 0);
  const cx = W / 2;
  const leaflets = 34;
  for (let i = 0; i < leaflets; i++) {
    const t = (i + 0.5) / leaflets;
    const y0 = Math.floor(t * (H - 4)) + 2;
    const len = (W / 2 - 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.92) * (0.85 + rnd() * 0.15);
    for (const side of [-1, 1]) {
      const slope = 0.5 + rnd() * 0.15;
      for (let k = 1; k < len; k++) {
        const x = Math.round(cx + side * k);
        const y = Math.round(y0 + k * slope);
        if (y >= H) break;
        const f = k / len;
        const ci = Math.min(6, 1 + Math.floor(f * 5 + rnd() * 0.8));
        p.set(x, y, pal[ci], 255, false);
        if (f < 0.7) p.set(x, y + 1, pal[Math.max(0, ci - 1)], 255, false);
        if (f < 0.35) p.set(x, y + 2, pal[0], 255, false);
      }
    }
  }
  for (let y = 0; y < H; y++) {
    p.set(cx, y, hex('#8fbf4a'), 255, false);
    p.set(cx - 1, y, hex('#5f8f2a'), 255, false);
  }
  return p.texture({ repeat: false });
}

// Broad-leaf cluster card for bushes / jungle trees.
export function leafClusterTexture(seed = 6, palette) {
  const S = 64, p = new Pix(S, S), rnd = mulberry32(seed);
  const pal = (palette || ['#1d5e1a', '#287a20', '#33952a', '#45ad31', '#5cc53a', '#7ad84a', '#a2ea66']).map(hex);
  p.fill([0, 0, 0], 0);
  const leaves = 70;
  for (let i = 0; i < leaves; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (S * 0.38);
    const cx = S / 2 + Math.cos(a) * r, cy = S / 2 + Math.sin(a) * r;
    const ang = rnd() * Math.PI;
    const L = 5 + rnd() * 4, Wd = 2.2 + rnd() * 1.4;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const lit = 1 - (cy / S) * 0.9 + (rnd() - 0.5) * 0.4; // brighter on top
    for (let y = -L; y <= L; y++) for (let x = -L; x <= L; x++) {
      const u = (x * ca + y * sa) / L, v = (-x * sa + y * ca) / Wd;
      if (u * u + v * v > 1) continue;
      const edge = u * u + v * v > 0.6;
      let ci = Math.round(1 + lit * 4 + (v < 0 ? 0.7 : -0.3));
      if (edge) ci -= 1;
      if (Math.abs(v) < 0.18 && Math.abs(u) < 0.8) ci += 1;
      p.set(Math.round(cx + x), Math.round(cy + y), pal[Math.max(0, Math.min(6, ci))], 255, false);
    }
  }
  return p.texture({ repeat: false });
}

// Wood planks with strong swirling grain (pier, hut).
export function woodTexture(seed = 7) {
  const S = 64, p = new Pix(S, S), rnd = mulberry32(seed);
  const pal = ['#3e2814', '#5a3b1e', '#71492a', '#875a34', '#9c6c40', '#b07d4c'].map(hex);
  const n = tileNoise(rnd, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const plank = Math.floor(y / 16);
    const w = n(x / 16 + plank * 1.7, y / 16) * 7 + y * 0.9 + plank * 13;
    const g = Math.sin(w * 1.25) * 0.5 + 0.5;
    let ci = 2 + Math.round(g * 2.4 + rnd() * 0.6) - (g < 0.15 ? 2 : 0);
    if (y % 16 === 0) ci = 0;
    if (y % 16 === 1) ci = 4;
    p.set(x, y, pal[Math.max(0, Math.min(5, ci))]);
  }
  return p.texture();
}

export function thatchTexture(seed = 8) {
  const S = 64, p = new Pix(S, S), rnd = mulberry32(seed);
  const pal = ['#5b4320', '#7a5a2a', '#987437', '#b38f47', '#c9a75b', '#dcc078'].map(hex);
  p.fill(pal[1]);
  for (let i = 0; i < 700; i++) {
    const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S), len = 4 + Math.floor(rnd() * 9);
    const c = pal[2 + Math.floor(rnd() * 4)];
    for (let k = 0; k < len; k++) p.set(x + (k > len * 0.6 && rnd() < 0.3 ? 1 : 0), y + k, c);
  }
  for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x++) { p.set(x, y, pal[0]); p.set(x, y + 1, pal[1]); }
  return p.texture();
}

// Atlas of 4 pixel-art cumulus clouds (2x2 grid), alpha in A.
export function cloudAtlas(seed = 9) {
  const C = 128, p = new Pix(C * 2, C * 2), rnd = mulberry32(seed);
  p.fill([255, 255, 255], 0);
  const pal = ['#9fb3d4', '#b7c8e3', '#cfdcef', '#e4ecf8', '#f4f8fd', '#ffffff'].map(hex);
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * C, oy = Math.floor(cell / 2) * C;
    const blobs = [];
    const nb = 9 + Math.floor(rnd() * 6);
    for (let i = 0; i < nb; i++) {
      const t = i / (nb - 1);
      const bx = C * 0.16 + t * C * 0.68 + (rnd() - 0.5) * 10;
      const hump = Math.sin(t * Math.PI);
      const r = 10 + hump * (16 + rnd() * 14);
      const by = C * 0.78 - r * 0.75 - hump * rnd() * 16;
      blobs.push([bx, by, r]);
    }
    for (let i = 0; i < 6; i++) blobs.push([C * 0.15 + rnd() * C * 0.7, C * 0.74, 7 + rnd() * 7]);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      if (y > C * 0.8) continue;
      let inside = -1e9, lightSum = 0;
      for (const [bx, by, r] of blobs) {
        const dx = x - bx, dy = y - by;
        const d = r - Math.sqrt(dx * dx + dy * dy);
        if (d > inside) inside = d;
        if (d > 0) {
          // light from the top-left: brighter on that side of each puff
          const l = (-(dx) * 0.45 - dy * 0.9) / r;
          lightSum = Math.max(lightSum, l + d / r * 0.6);
        }
      }
      if (inside <= 0) continue;
      const vert = 1 - y / (C * 0.8);
      let v = 1.6 + vert * 2.2 + lightSum * 1.6 + (rnd() - 0.5) * 0.5;
      if (inside < 1.2) v -= 0.6;
      p.set(ox + x, oy + y, pal[Math.max(0, Math.min(5, Math.round(v)))], 255, false);
    }
  }
  return p.texture({ repeat: false, mips: false });
}

// Fish icons for the catch popup (drawn to a plain canvas).
export function fishIcon(colors, seed) {
  const W = 32, H = 16, p = new Pix(W, H), rnd = mulberry32(seed);
  p.fill([0, 0, 0], 0);
  const [body, belly, fin] = colors.map(hex);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x - 13) / 11, v = (y - 8) / 6;
    if (u * u + v * v < 1) {
      let c = y > 9 ? belly : body;
      if (u * u + v * v > 0.75) c = shade(body, 0.6);
      if ((x + y) % 5 === 0 && rnd() < 0.5) c = shade(c, 1.15);
      p.set(x, y, c, 255, false);
    }
    const tx = x - 24;
    if (tx >= 0 && tx < 7 && Math.abs(y - 8) <= tx * 0.9 + 1) p.set(x, y, fin, 255, false);
  }
  p.set(7, 7, [20, 20, 30], 255, false); p.set(6, 6, [255, 255, 255], 255, false);
  for (let x = 10; x < 18; x++) p.set(x, 2 + Math.abs(x - 14) / 3 | 0, fin, 255, false);
  p.ctx.putImageData(p.img, 0, 0);
  return p.canvas;
}

export function cushionTexture(seed = 10) {
  const S = 32, p = new Pix(S, S), rnd = mulberry32(seed);
  const pal = ['#9aa6c8', '#b6c0dc', '#cdd5ec', '#e2e8f7', '#f4f7fd'].map(hex);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 2.4 + (rnd() - 0.5) * 0.9 + (y < 3 ? 1.3 : 0) - (y > S - 4 ? 1.2 : 0);
    if (x % 16 === 0) v -= 1.2;
    p.set(x, y, pal[Math.max(0, Math.min(4, Math.round(v)))]);
  }
  return p.texture();
}

// Palm leaflet atlas: 3 columns (young green, mature green, dry), 8x32 each.
// v = 0 at the leaflet base, 1 at its pointed tip; lighter midrib, darker rims.
export function leafletTexture() {
  const C = 8, W = C * 3, H = 32, p = new Pix(W, H), rnd = mulberry32(31);
  p.fill([0, 0, 0], 0);
  const pals = [
    ['#2f8a22', '#47a82e', '#63c23a', '#86d84c', '#b4ec72'],
    ['#1f6a1c', '#2d8424', '#3f9e2c', '#58b438', '#7fcc4c'],
    ['#7a5a22', '#9a7a32', '#b8964a', '#d2b262', '#e8d088'],
  ].map((pl) => pl.map(hex));
  for (let col = 0; col < 3; col++) {
    const pal = pals[col], ox = col * C;
    for (let y = 0; y < H; y++) {
      const t = 1 - y / (H - 1); // canvas top = tip
      const w = 3.7 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + 0.95 * t)), 0.65);
      for (let x = 0; x < C; x++) {
        const dx = Math.abs(x + 0.5 - C / 2);
        if (dx > w) continue;
        let k = 2 + Math.round(t * 1.2 + (rnd() - 0.5) * 0.8);
        if (dx > w - 1) k -= 1;               // darker rims
        if (dx < 0.6) k = 4;                   // midrib
        if (x + 0.5 < C / 2 && dx > 0.6) k += 0; else if (dx > 0.6) k -= 1; // one half in shade: folded look
        p.set(ox + x, y, pal[Math.max(0, Math.min(4, k))], 255, false);
      }
    }
  }
  return p.texture({ repeat: false });
}
