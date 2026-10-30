// Modelled pixel-art objects: tiki torch, deck chair, straw parasol, camp
// fire, scythe, plus the inventory items (logs, coconut, fibres, rod, fish).
// Every model is a list of parts { geo, tex, metal?, vcol?, flame?, glow? }
// that can be dressed with world, held, icon or ghost materials.
import * as THREE from 'three';
import { pixTex, handleTex, steelTex, handleGeometry, headGeometry } from './axeModel.js';
import { mulberry32, makeSimplex } from './noise.js';
import { SPECIES } from './fishing.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// ---------------------------------------------------------------- geometry
// Surface of revolution; profile [[r, y], ...] from bottom to top. v follows
// the profile length, u goes around (uRep times).
export function lathe(pts, segs = 12, uRep = 1) {
  const pos = [], nor = [], uv = [], idx = [];
  const len = [0];
  for (let j = 1; j < pts.length; j++) len.push(len[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  const total = len[len.length - 1] || 1;
  for (let j = 0; j < pts.length; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
    let dr = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dr, dy) || 1; dr /= l; dy /= l;
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      pos.push(pts[j][0] * c, pts[j][1], pts[j][0] * s);
      nor.push(dy * c, -dr, dy * s);
      uv.push((i / segs) * uRep, len[j] / total);
    }
  }
  for (let j = 0; j < pts.length - 1; j++) for (let i = 0; i < segs; i++) {
    const A = j * (segs + 1) + i, B = A + segs + 1, C = A + 1, D = B + 1;
    idx.push(A, B, D, A, D, C);
  }
  return geo(pos, nor, uv, idx);
}

// Tube along a curve with a shaped cross-section (round, oval or rounded
// rectangle) and closed ends. section(angle) -> [x, y] scale of the radius.
export function tube(curve, radius, { rings = 12, radial = 10, vRep = 1, section = null, up = V(0, 0, 1) } = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  const frames = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, c = curve(t);
    const T = curve(Math.min(1, t + 0.01)).sub(curve(Math.max(0, t - 0.01))).normalize();
    const S = up.clone().cross(T); if (S.lengthSq() < 1e-6) S.set(1, 0, 0); S.normalize();
    const B = T.clone().cross(S).normalize();
    frames.push({ c, S, B, r: radius(t) });
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const [sx, sy] = section ? section(a) : [Math.cos(a), Math.sin(a)];
      const p = c.clone().addScaledVector(S, sx * frames[i].r).addScaledVector(B, sy * frames[i].r);
      const n = S.clone().multiplyScalar(sx).addScaledVector(B, sy).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(k / radial, t * vRep);
    }
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < radial; k++) {
    const a = i * (radial + 1) + k, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // end caps
  for (const [ri, sign] of [[0, -1], [rings, 1]]) {
    const f = frames[ri], T = curve(ri ? 1 : 0.02).sub(curve(ri ? 0.98 : 0)).normalize().multiplyScalar(sign);
    const ci = pos.length / 3;
    pos.push(f.c.x, f.c.y, f.c.z); nor.push(T.x, T.y, T.z); uv.push(0.5, ri ? vRep : 0);
    const base = pos.length / 3;
    for (let k = 0; k <= radial; k++) {
      const o = ri * (radial + 1) + k;
      pos.push(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]); nor.push(T.x, T.y, T.z); uv.push(uv[o * 2], uv[o * 2 + 1]);
    }
    for (let k = 0; k < radial; k++) sign > 0 ? idx.push(ci, base + k, base + k + 1) : idx.push(ci, base + k + 1, base + k);
  }
  return geo(pos, nor, uv, idx);
}
const line = (a, b) => (t) => a.clone().lerp(b, t);
const rounded = (w, h, k = 4) => (a) => { // superellipse: a bar with softened corners
  const c = Math.cos(a), s = Math.sin(a);
  return [Math.sign(c) * Math.pow(Math.abs(c), 2 / k) * w, Math.sign(s) * Math.pow(Math.abs(s), 2 / k) * h];
};

function geo(pos, nor, uv, idx, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// concatenate geometries (same attributes), applying an optional matrix each
export function merge(list) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const withCol = list.some(([g]) => g.attributes.color);
  for (const [g0, m] of list) {
    const g = m ? g0.clone().applyMatrix4(m) : g0;
    const base = pos.length / 3, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, Cc = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i));
      uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      if (withCol) col.push(Cc ? Cc.getX(i) : 1, Cc ? Cc.getY(i) : 1, Cc ? Cc.getZ(i) : 1);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
  }
  const out = geo(pos, nor, uv, idx, withCol ? col : null);
  out.computeBoundingSphere();
  return out;
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(s, s, s));
// orient +Y of a part along a -> b
const along = (a, b) => {
  const d = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  return new THREE.Matrix4().compose(a, q, V(1, 1, 1));
};

// ---------------------------------------------------------------- textures
// wavy contour lines of a warped field (the figure of flat-sawn wood):
// a dark line, a lit lip after it, plain wood between; tiles in x and y
function woodRings(g, w, h, seed, freq, pal = TEAK) {
  const r = mulberry32(seed), sx = makeSimplex(seed);
  const T2 = Math.PI * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = (x / w) * T2, b = (y / h) * T2;
    const f = sx.noise(Math.cos(a) * 0.7 + Math.cos(b) * 1.6, Math.sin(a) * 0.7 + Math.sin(b) * 1.6) * 1.4 + Math.sin(b * 2) * 0.3 + Math.cos(a) * 0.25;
    const ring = ((f * freq) % 1 + 1) % 1;
    let k = 2.6 + (r() - 0.5) * 0.5;
    if (ring < 0.13) k = 0.2; else if (ring < 0.22) k = 1.2; else if (ring > 0.86) k = 4.3;
    ramp(g, pal, x, y, k);
  }
}
function ramp(g, pal, x, y, k) { g.fillStyle = pal[Math.max(0, Math.min(pal.length - 1, Math.round(k)))]; g.fillRect(x, y, 1, 1); }

const BAMBOO = ['#7a5a20', '#9a7a2e', '#b8963e', '#d2b052', '#e8c86a', '#f6dc88'];
const WEAVE = ['#5e3e16', '#7d5622', '#9c7030', '#b88a40', '#d2a656', '#e6c070'];
const STRAW = ['#7a5a22', '#9a7a32', '#b8964a', '#d2b262', '#e8d088', '#f4e2a6'];
const TEAK = ['#5a3418', '#74461f', '#8f5a2a', '#a86e36', '#c08446', '#d49a5a'];
const STONE = ['#5c5856', '#726d68', '#8a847c', '#a19a8f', '#b8b0a2', '#cfc6b6'];
const CORAL = ['#a8342e', '#cc4a3c', '#e8644c', '#f88a68', '#ffb08e'];
const CLOTH = ['#c9d4e0', '#dfe7ef', '#eef3f8', '#fbfdff'];
const TRUNK = ['#5a3a1e', '#6e4a27', '#86603a', '#9d7448', '#b28856', '#c49a66'];
const BARK = ['#3e2a18', '#4f3520', '#634428', '#785434', '#8c6640', '#a07a50'];
const FRESH = ['#a97a45', '#c49a5e', '#d9b47a', '#e8c890', '#f2d7a2', '#f8e6c0'];
const HUSK = ['#4a2c14', '#5e3a1a', '#764b24', '#8e5e30', '#a8743e', '#c08c52'];
const FIBRE = ['#5a8a22', '#74a42c', '#90bc3a', '#b0d050', '#c8c862', '#e0d688'];
const CORK = ['#9a6a3a', '#b4824a', '#c89a5a', '#dab070', '#e8c488'];

const T = {
  bamboo: () => once('bamboo', () => pixTex(16, 64, (g, w, h) => {
    const r = mulberry32(3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let k = 2.6 + Math.sin(x * 0.8) * 0.8 + (r() - 0.5) * 0.9;
      const node = y % 16;
      if (node === 0) k = 0.6; else if (node === 1) k = 4.6; else if (node === 15) k -= 1.2;
      ramp(g, BAMBOO, x, y, k);
    }
  })),
  weave: () => once('weave', () => pixTex(32, 16, (g, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / 4), cy = Math.floor(y / 4), fx = x % 4, fy = y % 4;
      const over = (cx + cy) % 2 === 0;
      let k = over ? 3.2 - fy * 0.5 : 2.6 - fx * 0.5;
      if ((over && fy === 3) || (!over && fx === 3)) k = 0.5;
      if ((over && fy === 0) || (!over && fx === 0)) k += 1.2;
      ramp(g, WEAVE, x, y, k);
    }
  })),
  rope: () => once('rope', () => pixTex(16, 8, (g, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, STRAW, x, y, ((x + y * 2) % 6) < 3 ? 4 - ((x + y * 2) % 3) : 1 + ((x + y * 2) % 3) * 0.5);
  })),
  straw: () => once('straw', () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(8);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, STRAW, x, y, 2 + (r() - 0.5) * 1.4);
    for (let i = 0; i < 90; i++) { // straws running down the canopy
      const x = Math.floor(r() * w), y0 = Math.floor(r() * h), len = 5 + Math.floor(r() * 9), k = 2 + Math.floor(r() * 4);
      for (let y = y0; y < y0 + len; y++) ramp(g, STRAW, x, y % h, y === y0 + len - 1 ? 0 : k);
    }
    for (let x = 0; x < w; x++) { ramp(g, STRAW, x, 10, 0.5); ramp(g, STRAW, x, 22, 0.5); ramp(g, STRAW, x, 11, 4); ramp(g, STRAW, x, 23, 4); }
  })),
  // varnished teak: wavy growth lines, dark and contrasted, with a lit edge
  teak: () => once('teak', () => pixTex(16, 64, (g, w, h) => woodRings(g, w, h, 12, 3.2))),
  canvas: () => once('canvas', () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(14);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const stripe = Math.floor(x / 4) % 2 === 0;
      const weave = ((x + y) % 2) * 0.5 + (r() - 0.5) * 0.5;
      if (stripe) ramp(g, CORAL, x, y, 2.3 + weave - (x % 4 === 0 ? 0.8 : 0));
      else ramp(g, CLOTH, x, y, 2 + weave - (x % 4 === 3 ? 0.8 : 0));
    }
  })),
  towel: () => once('towel', () => pixTex(16, 16, (g, w, h) => {
    const T2 = ['#1b7f8a', '#22a0aa', '#39c0c4', '#7ee0dc', '#c6f4ee'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, T2, x, y, (y % 8 < 2 ? 4 : 2) + ((x + y) % 3 === 0 ? -1 : 0));
  })),
  stone: () => once('stone', () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(21);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, STONE, x, y, 2.6 - y / h * 1.6 + (r() - 0.5) * 1.4 + ((x * 3 + y) % 11 === 0 ? -1 : 0));
  })),
  log: (pal) => once('log' + pal[0], () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(pal === TRUNK ? 4 : 5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = y / h;
      if (v < 0.14 || v > 0.86) { // end grain: growth rings by distance in the cap band
        const d = v < 0.14 ? v / 0.14 : (1 - v) / 0.14;
        ramp(g, FRESH, x, y, 1 + d * 3.5 + (Math.floor(d * 6) % 2) * -1 + (r() - 0.5) * 0.5);
      } else {
        let k = 2.4 + (r() - 0.5) * 1.6;
        if ((x + Math.floor(y / 3)) % 5 === 0) k -= 1.4;
        if (pal === TRUNK && y % 8 === 0) k = 0.5;
        ramp(g, pal, x, y, k);
      }
    }
  })),
  husk: () => once('husk', () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(6);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let k = 2.6 + (r() - 0.5) * 1.6 + Math.sin(x * 1.7) * 0.5;
      if (y > h - 6 && [5, 13, 21].some((c) => Math.abs(x - c) < 2) && y > h - 4) k = -1; // the three "eyes"
      ramp(g, HUSK, x, y, k);
    }
  })),
  fibre: () => once('fibre', () => pixTex(16, 32, (g, w, h) => {
    const r = mulberry32(9);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, FIBRE, x, y, 1 + y / h * 3.5 + (r() - 0.5) * 1.2 + (x % 4 === 0 ? -0.8 : 0));
  })),
  cork: () => once('cork', () => pixTex(16, 16, (g, w, h) => {
    const r = mulberry32(10);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, CORK, x, y, 2 + (r() - 0.5) * 2.4);
  })),
  coals: () => once('coals', () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(11);
    const ASH = ['#2a1e1a', '#3e2c24', '#5a463a', '#7a6a5e'];
    const EMB = ['#8a1c0a', '#c8380e', '#f06a1a', '#ffb040', '#ffe27a'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 16, y - 16) / 16, n = r();
      if (n > 0.55 + d * 0.35) ramp(g, EMB, x, y, (1 - d) * 4 + (n - 0.5) * 2);
      else ramp(g, ASH, x, y, 1.5 + (r() - 0.5) * 2);
    }
  })),
  steel: steelTex,
  gold: handleTex,
  grip: () => once('grip', () => pixTex(8, 16, (g, w, h) => {
    const P = ['#3a2416', '#52341f', '#6a462a', '#82583a'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, P, x, y, (y + x) % 4 === 0 ? 0 : 2 + (y % 2));
  })),
};
export const TEX = T;

// ---------------------------------------------------------------- models
export const FLAME_PROFILE = [[0, 0], [0.045, 0.02], [0.07, 0.07], [0.062, 0.13], [0.035, 0.2], [0, 0.29]];
const flameGeo = (s = 1) => lathe(FLAME_PROFILE.map(([r, y]) => [r * s, y * s]), 7);

function torchModel() {
  const H = 1.32;
  const pole = lathe([[0, -0.15], [0.036, -0.15], ...Array.from({ length: 21 }, (_, i) => {
    const y = -0.15 + (H + 0.15) * i / 20, node = Math.abs(((y + 0.15) / 0.37) % 1 - 0.0);
    return [0.034 + (node < 0.06 || node > 0.97 ? 0.006 : 0) - y * 0.004, y];
  }), [0, H]], 8);
  const cup = lathe([[0.03, H - 0.02], [0.05, H + 0.01], [0.08, H + 0.07], [0.094, H + 0.15], [0.09, H + 0.22], [0.072, H + 0.26], [0.064, H + 0.25], [0.04, H + 0.25], [0, H + 0.25]], 12, 3);
  const rope = merge([0, 1, 2].map((k) => [lathe([[0.038, 0], [0.047, 0.012], [0.047, 0.026], [0.038, 0.038]], 8, 2), M(0, H - 0.1 + k * 0.034)]));
  const wick = lathe([[0, H + 0.24], [0.022, H + 0.24], [0.02, H + 0.31], [0, H + 0.32]], 6);
  return {
    parts: [
      { geo: pole, tex: T.bamboo() },
      { geo: cup, tex: T.weave() },
      { geo: rope, tex: T.rope() },
      { geo: wick, tex: T.coals() },
      { geo: merge([[flameGeo(1.15), M(0, H + 0.27)], [flameGeo(0.6), M(0, H + 0.28)]]), flame: true },
    ],
    flame: V(0, H + 0.4, 0), height: H + 0.6,
  };
}

function transatModel() {
  // side view path of the canvas: foot rest -> seat -> hinge -> backrest
  const pts = [V(0.92, 0.36, 0), V(0.4, 0.33, 0), V(-0.18, 0.31, 0), V(-0.52, 0.62, 0), V(-0.82, 0.96, 0)];
  const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const bars = [];
  const W = 0.3, bar = (a, b, w = 0.026, h = 0.034) => bars.push([tube(line(a, b), () => 1, { rings: 2, radial: 12, section: rounded(w, h), vRep: a.distanceTo(b) * 2, up: V(0, 0, 1) })]);
  for (const z of [-W, W]) {
    bar(V(0.98, 0.33, z), V(-0.2, 0.29, z));              // seat rail
    bar(V(-0.2, 0.29, z), V(-0.88, 0.99, z));            // backrest rail
    bar(V(0.86, 0.0, z * 1.05), V(0.86, 0.31, z), 0.024, 0.024);  // front leg
    bar(V(-0.12, 0.0, z * 1.08), V(-0.14, 0.28, z), 0.024, 0.024); // rear leg
    bar(V(-0.66, 0.0, z * 1.1), V(-0.5, 0.62, z), 0.02, 0.02);    // backrest strut
  }
  const dowel = (x, y, r = 0.02) => bars.push([tube(line(V(x, y, -W - 0.04), V(x, y, W + 0.04)), () => r, { rings: 1, radial: 8, up: V(0, 1, 0), vRep: 0.4 })]);
  dowel(0.96, 0.35); dowel(-0.2, 0.31); dowel(-0.87, 0.99); dowel(0.86, 0.1, 0.016); dowel(-0.13, 0.1, 0.016);
  // sagging striped canvas, two-sided
  const pos = [], nor = [], uv = [], idx = [];
  const NU = 18, NV = 6;
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      const t = i / NU, c = path.getPointAt(t), tg = path.getTangentAt(t);
      const n0 = V(-tg.y, tg.x, 0).normalize(); if (n0.y < 0) n0.negate();
      for (let j = 0; j <= NV; j++) {
        const s = j / NV, z = (s - 0.5) * 2 * (W - 0.02);
        const sag = Math.sin(Math.PI * s) * 0.05 * (0.6 + 0.4 * Math.sin(Math.PI * t));
        const p = c.clone().addScaledVector(n0, -sag - (side < 0 ? 0.008 : 0)); p.z = z;
        const n = n0.clone().multiplyScalar(side).add(V(0, 0, -(s - 0.5) * 0.6 * side)).normalize();
        pos.push(p.x, p.y + 0.02, p.z); nor.push(n.x, n.y, n.z); uv.push(s, t * 2.2);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = base + i * (NV + 1) + j, b = a + NV + 1;
      side > 0 ? idx.push(a, a + 1, b + 1, a, b + 1, b) : idx.push(a, b + 1, a + 1, a, b, b + 1);
    }
  }
  const canvas = geo(pos, nor, uv, idx);
  // rolled towel as a pillow: signature detail
  const towel = tube(line(V(-0.74, 0.93, -W + 0.05), V(-0.74, 0.93, W - 0.05)), (t) => 0.06 - Math.pow(Math.abs(t - 0.5) * 2, 6) * 0.015, { rings: 8, radial: 10, up: V(0, 1, 0), vRep: 2 });
  return {
    parts: [
      { geo: merge(bars), tex: T.teak(), gloss: 0.55 },
      { geo: canvas, tex: T.canvas() },
      { geo: towel, tex: T.towel() },
    ],
    height: 1.05,
  };
}

function parasolModel() {
  const H = 2.35, R = 1.3;
  const pole = lathe([[0, -0.2], [0.056, -0.2], [0.052, 1.2], [0.044, H + 0.1], [0, H + 0.12]], 8);
  // thatched canopy with tied bundles (scalloped rim) and a hanging fringe
  const segs = 28, rows = 6;
  const pos = [], nor = [], uv = [], idx = [];
  const shell = (inset, flip) => {
    const base = pos.length / 3;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const bundle = 1 - 0.07 * Math.abs(Math.sin(a * 7)) * t;
        const r = R * t * bundle - inset * 0.6;
        const y = H + 0.18 - t * 0.55 - t * t * 0.12 - inset;
        const ny = 1, nr = 0.55 + t * 0.4;
        const nl = Math.hypot(ny, nr) * (flip ? -1 : 1);
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
        nor.push(Math.cos(a) * nr / nl, ny / nl, Math.sin(a) * nr / nl);
        uv.push(i / segs * 6, t * 1.6);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) {
      const A = base + j * (segs + 1) + i, B = A + segs + 1;
      flip ? idx.push(A, B + 1, B, A, A + 1, B + 1) : idx.push(A, B, B + 1, A, B + 1, A + 1);
    }
  };
  shell(0, false); shell(0.04, true);
  const canopy = geo(pos, nor, uv, idx);
  // fringe: pointed straw tufts hanging from the rim, each one folded (V section)
  const fr = [];
  const tufts = 42;
  for (let i = 0; i < tufts; i++) {
    const a = (i / tufts) * Math.PI * 2, r = R * (1 - 0.07 * Math.abs(Math.sin(a * 7))) - 0.02;
    const top = V(Math.cos(a) * r, H + 0.18 - 0.67 - 0.02, Math.sin(a) * r);
    const len = 0.2 + ((i * 37) % 7) * 0.025;
    const tip = top.clone().add(V(Math.cos(a) * 0.05, -len, Math.sin(a) * 0.05));
    const side = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.075), out = V(Math.cos(a), 0, Math.sin(a));
    const b = fr.length ? fr.reduce((s, x) => s + x.p.length / 3, 0) : 0;
    const p = [...top.clone().sub(side).toArray(), ...top.clone().addScaledVector(out, 0.02).toArray(), ...top.clone().add(side).toArray(), ...tip.toArray()];
    const n = [...out.toArray(), ...out.toArray(), ...out.toArray(), ...out.toArray()];
    fr.push({ p, n, u: [0, 0.9, 0.5, 0.9, 1, 0.9, 0.5, 0.05], i: [0, 3, 1, 1, 3, 2, 0, 1, 3, 1, 2, 3].map((k) => k + b) });
  }
  const fringe = geo(fr.flatMap((f) => f.p), fr.flatMap((f) => f.n), fr.flatMap((f) => f.u), fr.flatMap((f) => f.i));
  const knot = merge([
    [lathe([[0.03, 0], [0.09, 0.03], [0.07, 0.12], [0.03, 0.2], [0.05, 0.27], [0, 0.3]], 8, 2), M(0, H + 0.12)],
    [lathe([[0.052, 0], [0.06, 0.02], [0.052, 0.04]], 8, 2), M(0, H + 0.28)],
  ]);
  return {
    parts: [
      { geo: pole, tex: T.teak(), gloss: 0.5 },
      { geo: merge([[canopy], [fringe]]), tex: T.straw(), double: true },
      { geo: knot, tex: T.rope() },
    ],
    height: H + 0.4,
  };
}

function rockGeo(seed, s) {
  const sx = makeSimplex(seed);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i));
    v.multiplyScalar(1 + sx.noise(v.x * 1.4 + v.z, v.y * 1.4) * 0.22);
    v.y = v.y > 0 ? v.y * 0.75 : v.y * 0.35;
    p.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 3 + p.getZ(i) * 2, p.getY(i) * 3);
  g.computeVertexNormals();
  return g;
}
const logGeo = (len, r) => lathe([[0, 0], [r * 0.82, 0], [r, 0.012], [r * 1.02, len * 0.3], [r * 0.98, len * 0.7], [r, len - 0.012], [r * 0.82, len], [0, len]], 9);

function campfireModel() {
  const stones = [];
  const rnd = mulberry32(77);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.2, r = 0.48 + rnd() * 0.05;
    stones.push([rockGeo(30 + i, 0.15 + rnd() * 0.06), M(Math.cos(a) * r, 0.04, Math.sin(a) * r, 0, rnd() * 6, 0)]);
  }
  const logs = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const foot = V(Math.cos(a) * 0.36, 0.02, Math.sin(a) * 0.36), top = V(Math.cos(a) * 0.04, 0.5, Math.sin(a) * 0.04);
    logs.push([logGeo(foot.distanceTo(top) + 0.06, 0.05), along(foot, top)]);
  }
  const bed = lathe([[0, 0.07], [0.2, 0.06], [0.36, 0.03], [0.4, 0.0]], 12).scale(1, 1, 1);
  const flames = merge([[flameGeo(2.1), M(0, 0.04)], [flameGeo(1.5), M(0.1, 0.04, 0.05)], [flameGeo(1.4), M(-0.08, 0.04, -0.07)], [flameGeo(1.1), M(0.02, 0.04, 0)]]);
  return {
    parts: [
      { geo: merge(stones), tex: T.stone() },
      { geo: merge(logs), tex: T.log(BARK) },
      { geo: bed, tex: T.coals(), glow: 0.5 },
      { geo: flames, flame: true },
    ],
    flame: V(0, 0.55, 0), height: 0.9,
  };
}

// Scythe: golden snath with two wrapped grips rising from the heel to the
// hands, long crescent blade lying flat along -X, its honed edge forward (-Z).
export const SNATH_GRIP = V(0.32, 0.25, 0.86);
function scytheModel() {
  const G = SNATH_GRIP;
  const curve = (t) => G.clone().multiplyScalar(1 - t).add(V(Math.sin(t * Math.PI) * 0.04, Math.sin(t * Math.PI) * 0.03, 0));
  const snath = tube(curve, (t) => 0.02 + 0.003 * t + (t < 0.03 ? 0.004 : 0), { rings: 16, radial: 8, vRep: 3, up: V(1, 0, 0) });
  const peg = (t, len) => {
    const c = curve(t);
    return tube(line(c.clone(), c.clone().add(V(0.05, 0.11 * len, -0.03))), (u) => 0.016 - u * 0.004, { rings: 3, radial: 8, up: V(0, 0, 1) });
  };
  const grips = merge([[peg(0.04, 0.9)], [peg(0.45, 1)]]);
  const s = new THREE.Shape();
  // crescent: the tip hooks back towards the mower, edge on the inner curve
  const qb = (p0, c, p1, t) => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];
  const HEELB = [0.03, -0.035], TIP = [-0.6, 0.25], HEELE = [0.02, 0.045];
  const SPC = [-0.42, -0.12], EDC = [-0.34, 0.02];
  s.moveTo(...HEELB);
  s.quadraticCurveTo(...SPC, ...TIP);   // spine (back)
  s.quadraticCurveTo(...EDC, ...HEELE); // cutting edge (inner curve)
  s.lineTo(...HEELB);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.012, curveSegments: 20, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 1 });
  blade.translate(0, 0, -0.006);
  const spine = [], edge = [];
  for (let k = 0; k <= 40; k++) { spine.push(qb(HEELB, SPC, TIP, k / 40)); edge.push(qb(TIP, EDC, HEELE, k / 40)); }
  const near = (pts, x, y) => Math.min(...pts.map(([px, py]) => Math.hypot(px - x, py - y)));
  const P = blade.attributes.position, col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i);
    const ds = near(spine, x, y), de = near(edge, x, y);
    const t = ds / Math.max(1e-4, ds + de); // 0 on the spine .. 1 on the edge
    P.setZ(i, P.getZ(i) * (1 - 0.8 * t)); // thin towards the edge
    const c = t > 0.8 ? [0.96, 0.98, 1.0] : t > 0.6 ? [0.72, 0.77, 0.85] : t < 0.15 ? [0.36, 0.4, 0.5] : [0.52, 0.58, 0.67];
    col.set(c, i * 3);
  }
  blade.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = blade.attributes.uv; for (let i = 0; i < P.count; i++) uv.setXY(i, P.getX(i) * 5, P.getY(i) * 5);
  blade.computeVertexNormals();
  blade.rotateX(Math.PI / 2); // lie flat, edge and hooked tip towards the mower
  const collar = tube(line(V(0.0, 0.0, 0.0), G.clone().normalize().multiplyScalar(0.07)), () => 0.03, { rings: 1, radial: 8, up: V(1, 0, 0) });
  return {
    parts: [
      { geo: snath, tex: T.gold() },
      { geo: grips, tex: T.grip() },
      { geo: blade, tex: T.steel(), metal: 1, vcol: true },
      { geo: collar, tex: T.steel(), metal: 1 },
    ],
  };
}

// Pickaxe: straight golden handle with a leather grip, a curved steel head
// across its top: long pointed pick towards -X, short flat chisel towards +X,
// both bending down. Signature detail: the cord binding under the eye and the
// honed white points.
export const PICK = { L: 0.8, HY: 0.765, TIP: V(-0.29, 0.69, 0) };
const STEEL = [[0.32, 0.37, 0.47], [0.4, 0.45, 0.55], [0.5, 0.56, 0.65], [0.72, 0.77, 0.85], [0.96, 0.98, 1.0]];
function pickaxeModel() {
  const { L, HY } = PICK;
  const handle = lathe([[0, 0], [0.03, 0], [0.037, 0.012], [0.036, 0.04], [0.031, 0.07], ...Array.from({ length: 8 }, (_, i) => [0.031 - i * 0.0012, 0.12 + i * (L - 0.14) / 7]), [0.02, L], [0, L]], 10, 1);
  { const U = handle.attributes.uv; for (let i = 0; i < U.count; i++) U.setY(i, U.getY(i) * 3); }
  const grip = lathe([[0.033, 0.07], [0.037, 0.078], ...Array.from({ length: 6 }, (_, i) => [0.036 + (i % 2) * 0.002, 0.1 + i * 0.03]), [0.037, 0.26], [0.032, 0.268]], 10, 2);
  const cord = merge([0, 1, 2, 3].map((k) => [lathe([[0.024, 0], [0.031, 0.008], [0.031, 0.017], [0.024, 0.024]], 8, 2), M(0, HY - 0.135 + k * 0.021)]));
  // head: two tapered arms on an arc, meeting in a bevelled oval eye
  const arm = (dir, len, drop, r0, r1, section) => tube(
    (t) => V(dir * (0.03 + t * len), HY + 0.004 - drop * t * t, 0),
    (t) => r0 + (r1 - r0) * Math.pow(t, 0.85), { rings: 12, radial: 10, section, up: V(0, 0, 1) });
  const pick = arm(-1, 0.27, 0.075, 0.025, 0.0035, rounded(1.15, 0.85, 2.6));
  const chisel = arm(1, 0.17, 0.05, 0.024, 0.016, (a) => { const [x, y] = rounded(1, 1, 3)(a); return [x * 0.45, y * 1.3]; }); // flat blade, wide across
  const eye = tube(line(V(0, HY - 0.052, 0), V(0, HY + 0.05, 0)), (t) => 0.04 + Math.sin(t * Math.PI) * 0.006, { rings: 4, radial: 12, section: rounded(1.12, 0.92, 3), up: V(0, 0, 1) });
  const head = merge([[pick], [chisel], [eye]]);
  const P = head.attributes.position, col = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), ax = Math.abs(x);
    let k = ax < 0.045 ? 1 : 2; // blued eye, light cheeks
    if (x < 0 && ax > 0.2) k = ax > 0.26 ? 4 : 3; // honed point
    if (x > 0 && ax > 0.15) k = 4;                 // chisel edge
    if (k === 2 && y > HY + 0.012) k = 3;          // lit top of the arms
    col.push(...STEEL[k]);
  }
  head.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  { const U = head.attributes.uv; for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) * 5, P.getY(i) * 5 + P.getZ(i) * 5); }
  return {
    parts: [
      { geo: handle, tex: T.gold() },
      { geo: grip, tex: T.grip() },
      { geo: cord, tex: T.rope() },
      { geo: head, tex: T.steel(), metal: 1, vcol: true },
    ],
  };
}
function stoneModel() { return { parts: [{ geo: rockGeo(64, 0.22), tex: T.stone() }] }; }

function axeIcon() { return { parts: [{ geo: handleGeometry(), tex: T.gold() }, { geo: headGeometry(), tex: T.steel(), metal: 1, vcol: true }] }; }

function logModel(pal) {
  const g = logGeo(0.62, 0.11);
  g.rotateZ(Math.PI / 2);
  const twig = tube(line(V(-0.1, 0.09, 0), V(-0.05, 0.2, 0.04)), (t) => 0.025 - t * 0.012, { rings: 2, radial: 6, up: V(1, 0, 0) });
  return { parts: [{ geo: merge([[g], [twig]]), tex: T.log(pal) }] };
}
function coconutModel() {
  const g = lathe([[0, -0.13], [0.06, -0.12], [0.11, -0.07], [0.13, 0.0], [0.12, 0.07], [0.08, 0.13], [0.03, 0.16], [0, 0.165]], 12, 2);
  g.rotateX(-0.5);
  return { parts: [{ geo: g, tex: T.husk() }] };
}
function fibreModel() {
  const list = [];
  const rnd = mulberry32(5);
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2, bend = 0.08 + rnd() * 0.08;
    const base = V(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02);
    const c = (t) => base.clone().add(V(Math.cos(a) * bend * t * t + (rnd() - 0.5) * 0.0, t * (0.5 + rnd() * 0.06), Math.sin(a) * bend * t * t));
    list.push([tube(c, (t) => 0.016 * (1 - t * 0.7), { rings: 6, radial: 4, section: rounded(2.2, 0.6, 2), up: V(Math.cos(a), 0, Math.sin(a)), vRep: 1 })]);
  }
  const tie = lathe([[0.034, 0.16], [0.042, 0.17], [0.042, 0.2], [0.034, 0.21]], 8, 2);
  return { parts: [{ geo: merge(list), tex: T.fibre() }, { geo: tie, tex: T.rope() }] };
}
function rodModel() {
  const blank = tube((t) => V(-t * t * 0.12, t * 1.3, 0), (t) => 0.03 - 0.02 * t, { rings: 8, radial: 6, up: V(0, 0, 1), vRep: 4 });
  // line hanging from the tip with the red and white float: signature detail
  const lineGeo = tube(line(V(-0.12, 1.3, 0), V(-0.14, 0.82, 0)), () => 0.006, { rings: 1, radial: 4, up: V(0, 0, 1) });
  const bob = lathe([[0, -0.07], [0.05, -0.04], [0.06, 0], [0.05, 0.04], [0, 0.07]], 8); bob.translate(-0.14, 0.76, 0);
  const cork = lathe([[0, 0], [0.026, 0], [0.03, 0.04], [0.028, 0.3], [0.022, 0.34], [0, 0.34]], 8);
  const reel = merge([
    [lathe([[0, -0.03], [0.05, -0.03], [0.055, -0.02], [0.055, 0.02], [0.05, 0.03], [0, 0.03]], 10), M(0.06, 0.38, 0, 0, 0, Math.PI / 2)],
    [tube(line(V(0.02, 0.38, 0), V(0.06, 0.38, 0)), () => 0.01, { rings: 1, radial: 5, up: V(0, 1, 0) })],
  ]);
  const bobTex = pixTex(4, 8, (g) => { g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, 4, 4); g.fillStyle = '#e8402f'; g.fillRect(0, 4, 4, 4); g.fillStyle = '#ff7a5e'; g.fillRect(1, 5, 1, 2); });
  return { parts: [{ geo: blank, tex: T.teak() }, { geo: cork, tex: T.cork() }, { geo: reel, tex: T.steel(), metal: 1 }, { geo: lineGeo, tex: T.steel() }, { geo: bob, tex: bobTex }] };
}
// cook: 0 raw, 1 half done, 2 grilled (golden skin, grill marks, white
// eyes), 3 burnt (charcoal with a few glowing cracks)
const GRILL = ['#5a2a10', '#7e4016', '#a85e24', '#c8823a', '#e0a654', '#f2c878'];
const CHAR = ['#120c0a', '#1e1410', '#2e2018', '#3e2c20', '#523a28'];
const FLESH = ['#d8b890', '#ead0a8', '#f6e4c4', '#fff4e0'];
function fishModel(colors, cook = 0) {
  const tex = pixTex(16, 16, (g) => {
    const r = mulberry32(7);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const around = Math.abs(x / 16 - 0.5) * 2; // 0 belly .. 1 back
      let c = around > 0.45 ? colors[0] : colors[1];
      if (y % 5 === 0 && around > 0.3) c = colors[2];
      const grilled = GRILL[Math.max(0, Math.min(5, Math.round(1.5 + around * 2.6 - (around > 0.45 ? 0 : 0.6) + (r() - 0.5) * 1.1)))];
      if (cook === 1 && r() < 0.55) c = grilled;
      if (cook === 2) c = (x + y * 2) % 7 < 1 && around > 0.2 ? GRILL[0] : grilled; // diagonal grill marks
      if (cook === 3) c = r() < 0.05 ? '#c8380e' : CHAR[Math.max(0, Math.min(4, Math.round(1 + around * 2 + (r() - 0.5) * 1.6)))];
      g.fillStyle = c; g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = cook >= 2 ? (cook === 3 ? '#4a3a30' : '#f4f0e4') : '#141420'; // a grilled fish's eyes go white
    g.fillRect(4, 13, 1, 2); g.fillRect(12, 13, 1, 2); // eyes near the head
  });
  const body = lathe([[0, 0], [0.05, 0.03], [0.085, 0.12], [0.08, 0.24], [0.05, 0.33], [0.02, 0.38], [0, 0.39]], 10);
  body.scale(1, 1, 0.5); body.rotateZ(Math.PI / 2); body.translate(0.2, 0, 0);
  const fin = cook === 3 ? [CHAR[1], CHAR[0]] : cook === 2 ? [GRILL[1], GRILL[0]] : [colors[2], colors[0]];
  const finTex = pixTex(4, 4, (g) => { g.fillStyle = fin[0]; g.fillRect(0, 0, 4, 4); g.fillStyle = fin[1]; g.fillRect(0, 0, 4, 1); });
  const tail = new THREE.Shape(); tail.moveTo(0, 0); tail.lineTo(-0.12, 0.09); tail.lineTo(-0.09, 0); tail.lineTo(-0.12, -0.09); tail.lineTo(0, 0);
  const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.01, bevelEnabled: false }); tg.translate(-0.17, 0, -0.005);
  const dor = new THREE.Shape(); dor.moveTo(-0.1, 0); dor.quadraticCurveTo(0, 0.12, 0.08, 0); dor.lineTo(-0.1, 0);
  const dg = new THREE.ExtrudeGeometry(dor, { depth: 0.01, bevelEnabled: false }); dg.translate(0, 0.07, -0.005);
  return { parts: [{ geo: body, tex }, { geo: merge([[tg], [dg]]), tex: finTex }], cook };
}
// the inside of a fish, where it has been bitten
const fleshTex = () => once('flesh', () => pixTex(8, 8, (g, w, h) => {
  const r = mulberry32(19);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, FLESH, x, y, 1.6 + (r() - 0.5) * 1.4 + (y % 3 === 0 ? 1 : 0)); // flakes
}));
// A fish bitten down to x = cut (the head end is +x): everything past the cut
// is pressed onto a scalloped bite face, the faces that end up entirely on
// it show the white flesh.
export function bittenFish(model, cut) {
  const skin = [], flesh = [];
  for (const part of model.parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    const P = g.attributes.position, gone = [];
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), z = P.getZ(i), edge = cut - 0.022 * Math.abs(Math.sin(Math.atan2(z * 2, y) * 2.5)); // tooth marks
      gone.push(P.getX(i) > edge);
      if (P.getX(i) > edge) P.setX(i, edge);
    }
    const keep = [], cap = [];
    for (let t = 0; t < P.count; t += 3) (gone[t] && gone[t + 1] && gone[t + 2] ? cap : keep).push(t);
    const pick = (list) => {
      const out = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv']) {
        const A = g.attributes[k], a = new Float32Array(list.length * 3 * A.itemSize);
        list.forEach((t, j) => { for (let v = 0; v < 3; v++) for (let c = 0; c < A.itemSize; c++) a[(j * 3 + v) * A.itemSize + c] = A.array[(t + v) * A.itemSize + c]; });
        out.setAttribute(k, new THREE.BufferAttribute(a, A.itemSize));
      }
      return out;
    };
    if (keep.length) skin.push({ ...part, geo: pick(keep) });
    if (cap.length) {
      const c = pick(cap), N = c.attributes.normal, U = c.attributes.uv, Q = c.attributes.position;
      for (let i = 0; i < N.count; i++) { N.setXYZ(i, 1, 0, 0); U.setXY(i, Q.getZ(i) * 6, Q.getY(i) * 6); }
      flesh.push([c]);
    }
  }
  if (flesh.length) skin.push({ geo: merge(flesh), tex: fleshTex(), double: true });
  return { parts: skin };
}

// Spit over a camp fire: two forked sticks driven in outside the stones, a
// peeled green rod across, lashed with fibre where it rests.
export const SPIT_Y = 0.74;
function spitModel() {
  const sticks = [], rnd = mulberry32(31);
  for (const sx of [-1, 1]) {
    const foot = V(sx * 0.64, -0.05, 0.02), top = V(sx * 0.6, SPIT_Y + 0.02, 0);
    sticks.push([tube(line(foot, top), (t) => 0.028 - t * 0.008, { rings: 4, radial: 6, up: V(1, 0, 0), vRep: 2 })]);
    const fork = V(sx * (0.6 + 0.07), SPIT_Y + 0.12, (rnd() - 0.5) * 0.04);
    sticks.push([tube(line(V(sx * 0.6, SPIT_Y - 0.06, 0), fork), (t) => 0.02 - t * 0.008, { rings: 2, radial: 5, up: V(0, 0, 1) })]);
  }
  const rod = tube(line(V(-0.74, SPIT_Y, 0), V(0.74, SPIT_Y, 0)), () => 0.016, { rings: 6, radial: 6, up: V(0, 1, 0), vRep: 3 });
  const ties = merge([-1, 1].map((sx) => [lathe([[0.024, 0], [0.032, 0.01], [0.032, 0.03], [0.024, 0.04]], 8, 2), M(sx * 0.6, SPIT_Y - 0.02, 0, 0, 0, Math.PI / 2)]));
  return { parts: [{ geo: merge(sticks), tex: T.log(BARK) }, { geo: rod, tex: T.log(FRESH) }, { geo: ties, tex: T.rope() }] };
}

// Travel notebook: teal leather boards with a gold palm, rounded spine,
// cream page block, red ribbon bookmark hanging out.
const LEATHER = ['#0b3c44', '#11525c', '#186a72', '#20828a', '#2e9a9c'];
const GOLD = ['#8a5a14', '#c08a28', '#e8b444', '#f8d878'];
const PAPER = ['#c8b48a', '#dccaa0', '#ece0bc', '#f6eed6'];
function bookModel() {
  const W = 0.16, H = 0.22, R = 0.012;
  const rect = (w, h, r) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, -h / 2 + r); sh.lineTo(-w / 2, h / 2 - r); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2 + r, h / 2);
    sh.lineTo(w / 2 - r, h / 2); sh.quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - r);
    sh.lineTo(w / 2, -h / 2 + r); sh.quadraticCurveTo(w / 2, -h / 2, w / 2 - r, -h / 2);
    sh.lineTo(-w / 2 + r, -h / 2); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2, -h / 2 + r);
    return sh;
  };
  const planar = (g, w, h) => { const P = g.attributes.position, U = g.attributes.uv; for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) / w + 0.5, P.getY(i) / h + 0.5); return g; };
  const board = (z) => { const g = new THREE.ExtrudeGeometry(rect(W, H, R), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 3 }); g.translate(0, 0, z); return planar(g, W, H); };
  const covers = merge([[board(0.024)], [board(-0.03)]]);
  const spine = tube(line(V(-W / 2 + 0.004, -H / 2, 0), V(-W / 2 + 0.004, H / 2, 0)), () => 0.03, { rings: 1, radial: 12, section: (a) => [Math.cos(a) * 0.45 - 0.2, Math.sin(a)], up: V(0, 0, 1) });
  const pages = new THREE.ExtrudeGeometry(rect(W - 0.012, H - 0.012, 0.004), { depth: 0.048, bevelEnabled: false, curveSegments: 2 });
  pages.translate(0.004, 0, -0.024);
  { const P = pages.attributes.position, U = pages.attributes.uv; for (let i = 0; i < P.count; i++) U.setXY(i, (P.getX(i) + P.getY(i)) * 6, P.getZ(i) * 40); }
  const ribbon = tube(line(V(0.02, -H / 2 + 0.01, 0.004), V(0.03, -H / 2 - 0.045, 0.012)), () => 0.008, { rings: 3, radial: 4, section: rounded(1, 0.25, 2), up: V(0, 0, 1) });
  const cover = pixTex(32, 44, (g, w, h) => {
    const r = mulberry32(17);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, LEATHER, x, y, 2 + (r() - 0.5) * 1.2 - (x < 3 || y < 2 || x > w - 3 || y > h - 3 ? 1 : 0));
    for (let x = 3; x < w - 3; x++) { ramp(g, GOLD, x, 3, 2); ramp(g, GOLD, x, h - 4, 1); }
    for (let y = 3; y < h - 3; y++) { ramp(g, GOLD, 3, y, 2); ramp(g, GOLD, w - 4, y, 1); }
    // gold title plate with a little palm stamped above it
    for (let y = 26; y < 32; y++) for (let x = 9; x < 23; x++) ramp(g, GOLD, x, y, y === 26 ? 3 : y === 31 ? 0 : (x + y) % 5 === 0 && y > 27 && y < 30 ? 0 : 2);
    for (let y = 12; y < 22; y++) ramp(g, GOLD, 16 + (y < 16 ? 1 : 0), y, 1);
    for (const [x, y] of [[13, 12], [14, 11], [15, 11], [17, 11], [18, 11], [19, 12], [12, 13], [20, 13], [16, 10]]) ramp(g, GOLD, x, y, 3);
    for (let x = 13; x < 21; x++) ramp(g, GOLD, x, 22, 2);
  });
  const paper = pixTex(8, 8, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, PAPER, x, y, y % 2 ? 3 : 1.6); });
  const red = pixTex(2, 4, (g) => { g.fillStyle = '#c8342a'; g.fillRect(0, 0, 2, 4); g.fillStyle = '#e8584a'; g.fillRect(0, 0, 1, 4); });
  const spineTex = pixTex(8, 32, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, LEATHER, x, y, y % 10 < 2 ? 0.5 : 2.4 - Math.abs(x - 4) * 0.3); });
  return { parts: [{ geo: covers, tex: cover }, { geo: spine, tex: spineTex }, { geo: pages, tex: paper }, { geo: ribbon, tex: red }] };
}

// Treasure chest: teak planks, barrel lid on a back hinge, brass straps,
// corner caps and studs, a lock plate with keyhole, rope handles. The lid is
// its own part (hinge) so it can swing open.
const BRASS = ['#5e3c14', '#8a5c1e', '#b47e2c', '#d8a443', '#f2cf74'];
export const CHEST = { W: 0.86, D: 0.54, H: 0.42, LID: 0.17 };
function chestModel() {
  const { W, D, H, LID } = CHEST;
  // planar UVs by facing direction, in metres
  const boxUV = (g, k = 2.2) => {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
      const [u, v] = nz >= nx && nz >= ny ? [P.getX(i), P.getY(i)] : nx >= ny ? [P.getZ(i), P.getY(i)] : [P.getX(i), P.getZ(i)];
      U.setXY(i, u * k, v * k);
    }
    return g;
  };
  const roundRect = (w, h, r) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return sh;
  };
  const body = new THREE.ExtrudeGeometry(roundRect(W, H, 0.025), { depth: D - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2, curveSegments: 3 });
  body.translate(0, H / 2, -(D - 0.02) / 2);
  boxUV(body);
  // barrel lid: arched profile (side view) extruded along the width
  const arch = new THREE.Shape();
  arch.moveTo(-D / 2, 0);
  for (let k = 0; k <= 12; k++) { const a = Math.PI * (1 - k / 12); arch.lineTo(Math.cos(a) * D / 2, Math.sin(a) * LID); }
  arch.lineTo(-D / 2, 0);
  const lid = new THREE.ExtrudeGeometry(arch, { depth: W, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2, curveSegments: 4 });
  lid.rotateY(-Math.PI / 2); lid.translate(W / 2, H, 0);
  { // planks run along the width on the lid
    const P = lid.attributes.position, U = lid.attributes.uv;
    for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) * 2.2, (Math.atan2(P.getY(i) - H, P.getZ(i)) * 0.3 + P.getZ(i)) * 2.2);
  }
  // brass straps around body and lid, corner caps
  const strapB = [], strapL = [];
  const flat = rounded(0.22, 1, 2); // thin against the wood, wide across
  for (const x of [-W * 0.3, W * 0.3]) {
    const o = 0.012;
    strapB.push([tube((t) => { // front down, under, back up
      const L = [V(x, H, D / 2 + o), V(x, 0.0, D / 2 + o), V(x, -o, D / 2), V(x, -o, -D / 2), V(x, 0, -D / 2 - o), V(x, H, -D / 2 - o)];
      const f = t * (L.length - 1), i = Math.min(L.length - 2, Math.floor(f));
      return L[i].clone().lerp(L[i + 1], f - i);
    }, () => 0.03, { rings: 25, radial: 6, section: flat, up: V(1, 0, 0) })]);
    strapL.push([tube((t) => { const a = Math.PI * t; return V(x, H + Math.sin(a) * (LID + o), -Math.cos(a) * (D / 2 + o)); }, () => 0.03, { rings: 14, radial: 6, section: flat, up: V(1, 0, 0) })]);
  }
  const studs = [];
  for (const x of [-W * 0.3, W * 0.3]) for (const y of [0.08, 0.2, 0.32]) for (const z of [D / 2 + 0.02, -D / 2 - 0.02]) {
    const st = lathe([[0, 0], [0.013, 0], [0.011, 0.008], [0, 0.012]], 6);
    st.rotateX(z > 0 ? Math.PI / 2 : -Math.PI / 2); st.translate(x, y, z);
    studs.push([st]);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // corner caps
    studs.push([tube(line(V(sx * (W / 2 - 0.005), 0.005, sz * (D / 2 - 0.005)), V(sx * (W / 2 - 0.005), 0.1, sz * (D / 2 - 0.005))), () => 0.03, { rings: 1, radial: 8, up: V(1, 0, 0) })]);
  }
  // lock: plate on the lid front + hasp on the body
  const plate = new THREE.ExtrudeGeometry(roundRect(0.11, 0.12, 0.02), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 });
  { const P = plate.attributes.position, U = plate.attributes.uv; for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) / 0.11 + 0.5, P.getY(i) / 0.12 + 0.5); }
  plate.translate(0, H - 0.03, D / 2 + 0.012);
  const handles = [];
  for (const sx of [-1, 1]) handles.push([tube((t) => { const a = Math.PI * t; return V(sx * (W / 2 + 0.012 + Math.sin(a) * 0.05), H * 0.62 - Math.sin(a) * 0.02, -Math.cos(a) * 0.09); }, () => 0.012, { rings: 10, radial: 6, up: V(0, 1, 0), vRep: 2 })]);

  const teak = pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(41);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const plank = Math.floor(y / 8), gy = y % 8;
      let k = 2.5 + Math.sin(x * 0.45 + plank * 2.1 + Math.sin(y * 0.9) * 0.6) * 0.8 + (r() - 0.5) * 0.6;
      if (gy === 0) k = 0; else if (gy === 1) k += 1; else if (gy === 7) k -= 0.8;
      if ((x + plank * 11) % 29 === 0 && gy > 2 && gy < 6) k = 0.6; // knot
      ramp(g, TEAK, x, y, k);
    }
  });
  const brass = pixTex(16, 16, (g, w, h) => { const r = mulberry32(42); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, BRASS, x, y, 2.4 + (r() - 0.5) * 1.2 + (y < 3 ? 1 : 0) - (y > 12 ? 1 : 0)); });
  const lockTex = pixTex(12, 12, (g, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, BRASS, x, y, x === 0 || y === h - 1 ? 1 : x === w - 1 || y === 0 ? 4 : 2.6);
    g.fillStyle = '#24140a'; g.fillRect(5, 6, 2, 2); g.fillRect(5, 3, 2, 3); g.fillRect(4, 6, 4, 1); // keyhole
  });
  // inside, seen when the lid is up: dark hollow, straw lining, a few coins
  const inner = new THREE.PlaneGeometry(W - 0.07, D - 0.07);
  inner.rotateX(-Math.PI / 2); inner.translate(0, H + 0.011, 0);
  const innerTex = pixTex(32, 20, (g, w, h) => {
    const r = mulberry32(43);
    const DARK = ['#1e120a', '#2e1c10', '#3e2816', '#5a3c1e'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      ramp(g, DARK, x, y, Math.min(3, edge * 0.5) + (r() - 0.5) * 0.8);
      if (edge > 2 && r() < 0.18) ramp(g, STRAW, x, y, 1 + r() * 2);
    }
    for (const [cx, cy] of [[11, 9], [13, 10], [12, 12], [20, 8], [19, 11]]) { ramp(g, GOLD, cx, cy, 3); ramp(g, GOLD, cx + 1, cy, 2); ramp(g, GOLD, cx, cy + 1, 1); }
  });
  return {
    parts: [
      { geo: body, tex: teak, gloss: 0.5 },
      { geo: inner, tex: innerTex },
      { geo: lid, tex: teak, gloss: 0.5, hinge: [0, H, -D / 2] },
      { geo: merge([...strapB, ...studs]), tex: brass, metal: 1 },
      { geo: merge(strapL), tex: brass, metal: 1, hinge: [0, H, -D / 2] },
      { geo: plate, tex: lockTex, metal: 1, hinge: [0, H, -D / 2] },
      { geo: merge(handles), tex: T.rope() },
    ],
    height: H + LID,
  };
}

// ---------------------------------------------------------------- building
// Box with chamfered edges and corners (w x h x d, chamfer b), centred on the
// origin; uv projected along the dominant axis of each face, 1 unit = 1 m
// (+ uvOff), so pixel textures keep their density whatever the size.
export function bevelBox(w, h, d, b, uvOff = [0, 0, 0]) {
  const hs = [w / 2, h / 2, d / 2], pos = [], nor = [], uv = [];
  const P = (axis, sg) => hs.map((hh, k) => (k === axis ? sg[k] * hh : sg[k] * Math.max(0.001, hh - b)));
  const tri = (a, c, e) => {
    const A = V(...a), B = V(...c), C = V(...e), n = B.clone().sub(A).cross(C.clone().sub(A)).normalize();
    if (n.dot(A.clone().add(B).add(C)) < 0) { const t = c; c = e; e = t; n.negate(); } // outward, counter-clockwise
    const ax = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 0 : 2) : (Math.abs(n.y) > Math.abs(n.z) ? 1 : 2);
    const [i, j] = ax === 0 ? [2, 1] : ax === 1 ? [0, 2] : [0, 1];
    for (const q of [a, c, e]) { pos.push(...q); nor.push(n.x, n.y, n.z); uv.push(q[i] + uvOff[i], q[j] + uvOff[j]); }
  };
  const quad = (a, c, e, f) => { tri(a, c, e); tri(a, e, f); };
  for (let ax = 0; ax < 3; ax++) for (const s0 of [-1, 1]) { // faces
    const o = [0, 1, 2].filter((k) => k !== ax), c = [];
    for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const sg = [0, 0, 0]; sg[ax] = s0; sg[o[0]] = s1; sg[o[1]] = s2; c.push(P(ax, sg)); }
    quad(...c);
  }
  for (let a = 0; a < 3; a++) for (let bx = a + 1; bx < 3; bx++) { // edge strips
    const c3 = 3 - a - bx;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const sg = (sc) => { const g = [0, 0, 0]; g[a] = sa; g[bx] = sb; g[c3] = sc; return g; };
      quad(P(a, sg(-1)), P(bx, sg(-1)), P(bx, sg(1)), P(a, sg(1)));
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) tri(P(0, [sx, sy, sz]), P(1, [sx, sy, sz]), P(2, [sx, sy, sz])); // corners
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const PLANK = ['#5e3a1c', '#764a26', '#8e5e32', '#a6743e', '#bc8a4e', '#d2a264'];
const MASON = ['#6f6e78', '#83828c', '#9897a0', '#abaab2', '#bdbcc3', '#cfced4'];
const BT = {
  // sawn planks, 4 to the metre, joints staggered from row to row, nail heads
  planks: () => once('planks', () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(51);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 8), fy = y % 8, joint = (row * 13 + 5) % 32;
      let k = 2.6 + (r() - 0.5) * 0.9 + Math.sin((x + row * 7) * 0.45 + fy) * 0.35;
      if ((x * 3 + row * 5 + Math.floor(fy / 2)) % 13 === 0) k -= 1.1; // grain
      if (fy === 0) k = 0.3; else if (fy === 1) k += 1.2; else if (fy === 7) k -= 0.9;
      if (x === joint) k = 0.4; else if (x === (joint + 1) % 32) k += 0.8;
      if ((x === (joint + 2) % 32 || x === (joint + 30) % 32) && (fy === 3 || fy === 5)) k = 5.4; // nails
      ramp(g, PLANK, x, y, k);
    }
  })),
  // a crate face: a frame of boards around three planks, nailed at the corners
  crate: () => once('crate', () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(53);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y), frame = e < 4;
      let k = 2.5 + (r() - 0.5) * 0.9;
      if (frame) { k = 3.2 + (r() - 0.5) * 0.6; if (e === 0) k = 1.2; if (e === 3) k = 0.5; if (e === 1) k += 0.9; }
      else { const fy = (y - 4) % 8; k += Math.sin(x * 0.5 + y) * 0.3; if (fy === 0) k = 0.4; if (fy === 1) k += 1; if ((x + y * 3) % 11 === 0) k -= 1; }
      if (frame && (x === 1 || x === 30) && (y === 1 || y === 30)) k = 5.6;
      ramp(g, PLANK, x, y, k);
    }
  })),
  // dressed basalt: courses of cut stones with pale mortar joints, each stone
  // lit on its upper left edge
  masonry: () => once('masonry', () => pixTex(32, 32, (g, w, h) => {
    const r = mulberry32(57);
    const widths = [[11, 10, 11], [6, 13, 13], [12, 9, 11], [8, 12, 12]];
    for (let row = 0; row < 4; row++) {
      let x0 = 0;
      for (const sw of widths[row]) {
        const tone = 2 + (r() - 0.5) * 1.6;
        for (let y = row * 8; y < row * 8 + 8; y++) for (let x = x0; x < x0 + sw; x++) {
          const fx = x - x0, fy = y - row * 8;
          let k = tone + (r() - 0.5) * 0.8;
          if (fx === 0 || fy === 0) { g.fillStyle = '#dbdbe3'; g.fillRect(x, y, 1, 1); continue; }
          if (fx === 1 || fy === 1) k += 1.3; else if (fx === sw - 1 || fy === 7) k -= 1.2;
          ramp(g, MASON, x, y, k);
        }
        x0 += sw;
      }
    }
  })),
};

export const STOREY = 2.5;
function blockWood() { return { parts: [{ geo: bevelBox(1, 1, 1, 0.045, [0.5, 0.5, 0.5]).translate(0, 0.5, 0), tex: BT.crate() }] }; }
function blockStone() { return { parts: [{ geo: bevelBox(1, 1, 1, 0.07, [0.5, 0.5, 0.5]).translate(0, 0.5, 0), tex: BT.masonry() }] }; }
// deck of eight planks on two joists, top at y = 0
function floorModel() {
  const planks = [], rnd = mulberry32(61);
  for (let k = 0; k < 8; k++) {
    const g = bevelBox(2 + (rnd() - 0.5) * 0.04, 0.06, 0.235, 0.012);
    planks.push([g, M((rnd() - 0.5) * 0.03, -0.03 + (rnd() - 0.5) * 0.008, -0.875 + k * 0.25)]);
  }
  const joists = merge([-0.75, 0.75].map((x) => [bevelBox(0.14, 0.16, 1.96, 0.02), M(x, -0.14, 0)]));
  return { parts: [{ geo: merge(planks), tex: BT.planks() }, { geo: joists, tex: T.log(BARK) }] };
}
// five palm logs lying along x, ends overlapping a little past the corners
function wallLogs(spans) {
  const list = [], rnd = mulberry32(67);
  for (const [x0, x1, k] of spans) {
    const r = 0.25 + (rnd() - 0.5) * 0.02, g = logGeo(x1 - x0, r);
    g.rotateZ(-Math.PI / 2);
    list.push([g, M(x0 + (rnd() - 0.5) * 0.04, 0.25 + k * 0.5, (rnd() - 0.5) * 0.03)]);
  }
  return merge(list);
}
function wallModel() {
  return { parts: [{ geo: wallLogs([0, 1, 2, 3, 4].map((k) => [-1.1, 1.1, k])), tex: T.log(TRUNK) }] };
}
// a wall with a doorway: short logs either side, a lintel log over, a teak frame
function doorModel() {
  const spans = [];
  for (let k = 0; k < 4; k++) spans.push([-1.1, -0.44, k], [0.44, 1.1, k]);
  spans.push([-1.1, 1.1, 4]);
  const frame = merge([[bevelBox(0.1, 2.0, 0.34, 0.02), M(-0.49, 1.0, 0)], [bevelBox(0.1, 2.0, 0.34, 0.02), M(0.49, 1.0, 0)], [bevelBox(1.08, 0.1, 0.36, 0.02), M(0, 2.0, 0)]]);
  return { parts: [{ geo: wallLogs(spans), tex: T.log(TRUNK) }, { geo: frame, tex: T.teak(), gloss: 0.4 }] };
}
// a wall with a window at eye level: short logs either side of the opening,
// a teak frame with a sill jutting out, a cross of bamboo bars
function windowModel() {
  const spans = [[-1.1, 1.1, 0], [-1.1, 1.1, 1], [-1.1, 1.1, 4]];
  for (const k of [2, 3]) spans.push([-1.1, -0.44, k], [0.44, 1.1, k]);
  const frame = merge([
    [bevelBox(0.1, 1.0, 0.34, 0.02), M(-0.49, 1.5, 0)], [bevelBox(0.1, 1.0, 0.34, 0.02), M(0.49, 1.5, 0)],
    [bevelBox(1.08, 0.1, 0.36, 0.02), M(0, 2.0, 0)], [bevelBox(1.22, 0.08, 0.52, 0.02), M(0, 1.0, 0)], // lintel, sill
  ]);
  const bars = merge([
    [tube(line(V(0, 1.04, 0), V(0, 1.96, 0)), () => 0.024, { rings: 2, radial: 6, up: V(1, 0, 0), vRep: 1 })],
    [tube(line(V(-0.45, 1.52, 0), V(0.45, 1.52, 0)), () => 0.022, { rings: 2, radial: 6, up: V(0, 1, 0), vRep: 1 })],
  ]);
  return { parts: [{ geo: wallLogs(spans), tex: T.log(TRUNK) }, { geo: frame, tex: T.teak(), gloss: 0.4 }, { geo: bars, tex: T.bamboo() }] };
}
// thatch panel rising 1 m over 2 m (low edge at z = +1), on two rafters,
// a ridge log on top and a fringe of straw hanging off the low edge
function roofModel() {
  const ang = Math.atan2(1, 2), L = Math.hypot(1, 2) + 0.42;
  const slab = bevelBox(2.3, 0.14, L, 0.04);
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), ang);
  const mid = V(0, 0.5, 0.18); // overhang past the low edge
  const place = (g, y = 0) => g.applyMatrix4(new THREE.Matrix4().compose(mid.clone().add(V(0, y, 0)), q, V(1, 1, 1)));
  place(slab);
  const rafters = merge([-0.92, 0.92].map((x) => { const g = logGeo(L, 0.05); g.rotateX(Math.PI / 2); g.translate(x, -0.09, -L / 2); place(g); return [g]; }));
  const ridge = logGeo(2.36, 0.07); ridge.rotateZ(-Math.PI / 2); ridge.translate(-1.18, 1.14, -1.0);
  const fringe = [], rnd = mulberry32(71);
  const lowEdge = mid.clone().add(V(0, 0, L / 2).applyQuaternion(q));
  for (let i = 0; i < 14; i++) {
    const t = lathe([[0, -0.2 - rnd() * 0.06], [0.018, -0.17], [0.05, -0.08], [0.07, 0]], 5, 1);
    fringe.push([t, M(-1.08 + i * 0.166, lowEdge.y - 0.02, lowEdge.z - 0.03, 0.2, rnd() * 3, 0)]);
  }
  return { parts: [{ geo: merge([[slab], [merge(fringe)]]), tex: T.straw() }, { geo: merge([[rafters], [ridge]]), tex: T.log(BARK) }] };
}
// flat geometry from triangles [[x, y, z] x 3, uv(x, y, z)]: flat normals
function tris(list) {
  const pos = [], uv = [];
  for (const [a, b, c, f] of list) for (const p of [a, b, c]) { pos.push(...p); uv.push(...f(p)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// uv projected on the plane each face mostly faces, 1 unit = 1 m
function boxUV(g) {
  const P = g.attributes.position, N = g.attributes.normal, uv = [];
  for (let i = 0; i < P.count; i++) {
    const n = [Math.abs(N.getX(i)), Math.abs(N.getY(i)), Math.abs(N.getZ(i))], p = [P.getX(i), P.getY(i), P.getZ(i)];
    const ax = n[0] > n[1] ? (n[0] > n[2] ? 0 : 2) : (n[1] > n[2] ? 1 : 2);
    uv.push(...(ax === 0 ? [p[2], p[1]] : ax === 1 ? [p[0], p[2]] : [p[0], p[1]]));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// Hip corner: two thatch faces meeting on a diagonal, low along the +z and
// +x eaves (with the same overhang as a roof panel), up to the inner corner
// at (-1, -1); a hip log on the diagonal, straw fringes along both eaves.
function roofCornerModel() {
  const E = 1.367, top = (h) => 0.668 - 0.5 * h, bot = (h) => 0.512 - 0.5 * h;
  const fa = ([x, , z]) => [x, z], fb = ([x, , z]) => [z, x];
  const A = (y) => [[-1, y(E), E], [E, y(E), E], [-1, y(-1), -1]]; // heights follow z
  const B = (y) => [[E, y(E), -1], [E, y(E), E], [-1, y(-1), -1]]; // heights follow x
  const At = A(top), Ab = A(bot), Bt = B(top), Bb = B(bot);
  const strip = (p, q, f) => [[p, q, [q[0], q[1] - 0.156, q[2]], f], [p, [q[0], q[1] - 0.156, q[2]], [p[0], p[1] - 0.156, p[2]], f]];
  const thatch = tris([
    [...At, fa], [Ab[0], Ab[2], Ab[1], fa], [...Bt, fb], [Bb[0], Bb[2], Bb[1], fb],
    ...strip(At[0], At[1], ([x, y]) => [x, y]), ...strip(Bt[0], Bt[1], ([, y, z]) => [z, y]),
    ...strip(At[2], At[0], ([, y, z]) => [z, y]), ...strip(Bt[2], Bt[0], ([x, y]) => [x, y]),
  ]);
  const fringe = [], rnd = mulberry32(79);
  for (let i = 0; i < 14; i++) {
    const t = -1 + i * 0.17;
    for (const [x, z] of [[t, E - 0.03], [E - 0.03, t]]) {
      const tuft = lathe([[0, -0.2 - rnd() * 0.06], [0.018, -0.17], [0.05, -0.08], [0.07, 0]], 5, 1);
      fringe.push([tuft, M(x, bot(E) - 0.02, z, 0.2, rnd() * 3, 0)]);
    }
  }
  const hip = tube(line(V(E - 0.05, top(E) + 0.04, E - 0.05), V(-1, top(-1) + 0.05, -1)), () => 0.07, { rings: 6, radial: 8, up: V(0, 1, 0), vRep: 3 });
  return { parts: [{ geo: thatch, tex: T.straw(), double: true }, { geo: merge(fringe), tex: T.straw() }, { geo: hip, tex: T.log(BARK) }] };
}
// Half gable: a triangle of boards standing on a wall top, from nothing at
// -x up to 1 m at +x (under the slope of a roof panel), a teak batten along
// its top edge.
function gableModel() {
  const sh = new THREE.Shape(); sh.moveTo(-1.05, 0); sh.lineTo(1.05, 0); sh.lineTo(1.05, 1.0); sh.lineTo(-1.05, 0);
  const g = boxUV(new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: false }).translate(0, 0, -0.13).toNonIndexed());
  const len = Math.hypot(2.1, 1), batten = bevelBox(len, 0.08, 0.32, 0.02);
  batten.applyMatrix4(new THREE.Matrix4().compose(V(0, 0.5, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.atan2(1, 2.1)), V(1, 1, 1)));
  const post = bevelBox(0.12, 1.0, 0.32, 0.02).translate(0.99, 0.5, 0);
  return { parts: [{ geo: g, tex: BT.planks() }, { geo: merge([[batten], [post]]), tex: T.teak(), gloss: 0.3 }] };
}
// Door leaf for a doorway: seven bamboo canes side by side, hinge at x = 0,
// the leaf running to +x; two teak ledges and a brace on the inside face,
// rope lashings where they cross the canes, a carved teak knob on each side.
export const GATE_W = 0.86;
function gateModel() {
  const canes = [], rnd = mulberry32(89);
  for (let k = 0; k < 7; k++) {
    const x = 0.062 + k * 0.122, top = 1.94 - (k % 2) * 0.03 - rnd() * 0.02;
    canes.push([tube(line(V(x, 0.03, 0), V(x, top, 0)), () => 0.058, { rings: 3, radial: 7, up: V(1, 0, 0), vRep: 2.2 })]);
  }
  const ledges = merge([
    [bevelBox(0.84, 0.11, 0.05, 0.015), M(0.43, 0.42, -0.085)], [bevelBox(0.84, 0.11, 0.05, 0.015), M(0.43, 1.56, -0.085)],
    [bevelBox(0.07, 1.24, 0.045, 0.012), M(0.43, 0.99, -0.085, 0, 0, -0.62)],
  ]);
  const knob = (z) => [lathe([[0, 0], [0.022, 0.0], [0.016, 0.03], [0.034, 0.06], [0.03, 0.08], [0, 0.085]], 8), M(0.76, 1.0, z, z > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0)];
  const ties = [];
  for (const y of [0.42, 1.56]) for (let k = 0; k < 7; k += 2) ties.push([lathe([[0.062, -0.03], [0.068, -0.02], [0.068, 0.02], [0.062, 0.03]], 7, 2), M(0.062 + k * 0.122, y, 0)]);
  return { parts: [{ geo: merge(canes), tex: T.bamboo() }, { geo: merge([[ledges], [merge([knob(0.05), knob(-0.11)])]]), tex: T.teak(), gloss: 0.4 }, { geo: merge(ties), tex: T.rope() }] };
}

// Island bed: a low bamboo frame on four stubby legs, a thick woven palm
// mattress, a cream pillow, a striped coral blanket folded at the foot, and
// a mosquito net canopy on four tall canes, its white drapes gathered and
// knotted at each post (the signature). 2.1 m long (x), 1.25 m wide (z).
const NET = ['#c9d4e0', '#dfe7ef', '#eef3f8', '#fbfdff'];
function bedModel() {
  const L = 2.1, W = 1.25, top = 0.46, bam = T.bamboo();
  const cane = (a, b, r) => [tube(line(a, b), () => r, { rings: 3, radial: 7, up: Math.abs(b.y - a.y) > 0.5 ? V(1, 0, 0) : V(0, 1, 0), vRep: a.distanceTo(b) * 1.2 })];
  const frame = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    frame.push(cane(V(sx * L / 2, 0, sz * W / 2), V(sx * L / 2, 1.95, sz * W / 2), 0.045)); // canopy posts
    frame.push(cane(V(sx * (L / 2 - 0.12), 0, sz * (W / 2 - 0.1)), V(sx * (L / 2 - 0.12), 0.3, sz * (W / 2 - 0.1)), 0.05)); // legs
  }
  for (const sz of [-1, 1]) { frame.push(cane(V(-L / 2, 0.28, sz * (W / 2 - 0.06)), V(L / 2, 0.28, sz * (W / 2 - 0.06)), 0.045)); frame.push(cane(V(-L / 2, 1.93, sz * W / 2), V(L / 2, 1.93, sz * W / 2), 0.03)); }
  for (const sx of [-1, 1]) { frame.push(cane(V(sx * (L / 2 - 0.06), 0.28, -W / 2), V(sx * (L / 2 - 0.06), 0.28, W / 2), 0.045)); frame.push(cane(V(sx * L / 2, 1.93, -W / 2), V(sx * L / 2, 1.93, W / 2), 0.03)); }
  frame.push(cane(V(-L / 2, 0.75, -W / 2), V(-L / 2, 0.75, W / 2), 0.04)); // headboard rail
  const mattress = bevelBox(L - 0.16, 0.17, W - 0.14, 0.06).translate(0, top - 0.085, 0);
  const pillow = bevelBox(0.36, 0.11, W - 0.36, 0.05).translate(-L / 2 + 0.3, top + 0.05, 0);
  const blanket = merge([[bevelBox(0.55, 0.06, W - 0.1, 0.025), M(L / 2 - 0.4, top + 0.03, 0)], [bevelBox(0.5, 0.05, W - 0.12, 0.02), M(L / 2 - 0.42, top + 0.085, 0)]]);
  const netTex = pixTex(8, 8, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, NET, x, y, (x + y) % 3 === 0 ? 1 : 2.6 + ((x * 3 + y) % 5 === 0 ? 1 : 0)); });
  const pillowTex = pixTex(8, 8, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, ['#d8ccb0', '#ecdfc4', '#f6eedc', '#fffaf0'], x, y, 2 + ((x + y) % 4 === 0 ? -1 : 0)); });
  const drapes = [], canopy = bevelBox(L + 0.06, 0.03, W + 0.06, 0.01).translate(0, 1.965, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // net gathered at the post: full at the top, a knot, a fall below
    const c = (t) => V(sx * (L / 2 - 0.04) + Math.sin(t * 3) * 0.02 * sx, 1.92 - t * 1.4, sz * (W / 2 - 0.04));
    drapes.push([tube(c, (t) => (t < 0.35 ? 0.16 - t * 0.33 : t < 0.42 ? 0.045 : 0.06 + (t - 0.42) * 0.12), { rings: 10, radial: 8, up: V(1, 0, 0), vRep: 2 })]);
  }
  return {
    parts: [
      { geo: merge(frame), tex: bam },
      { geo: mattress, tex: T.weave() },
      { geo: pillow, tex: pillowTex },
      { geo: blanket, tex: T.canvas() },
      { geo: merge([[canopy], [merge(drapes)]]), tex: netTex },
    ],
    height: 2,
  };
}

// the gable under the high edge of a roof: a panel of boards 1 m tall
function gableWallModel() {
  const g = bevelBox(2.1, 1.0, 0.26, 0.02).translate(0, 0.5, 0);
  const posts = merge([-0.99, 0.99].map((x) => [bevelBox(0.12, 1.0, 0.32, 0.02), M(x, 0.5, 0)]));
  const top = bevelBox(2.1, 0.08, 0.32, 0.02).translate(0, 0.96, 0);
  return { parts: [{ geo: g, tex: BT.planks() }, { geo: merge([[posts], [top]]), tex: T.teak(), gloss: 0.3 }] };
}
// Flat roof: a thick mat of thatch on two beams, top at y = 0, fringed all round
function flatRoofModel() {
  const slab = bevelBox(2.24, 0.16, 2.24, 0.05).translate(0, -0.08, 0);
  const beams = merge([-0.7, 0.7].map((z) => { const g = logGeo(2.1, 0.07); g.rotateZ(-Math.PI / 2); return [g, M(-1.05, -0.22, z)]; }));
  const fringe = [], rnd = mulberry32(83);
  for (let i = 0; i < 13; i++) {
    const t = -1.02 + i * 0.17;
    for (const [x, z] of [[t, 1.1], [t, -1.1], [1.1, t], [-1.1, t]]) {
      const tuft = lathe([[0, -0.14 - rnd() * 0.05], [0.016, -0.11], [0.045, -0.05], [0.06, 0]], 5, 1);
      fringe.push([tuft, M(x, -0.12, z, 0, rnd() * 3, 0)]);
    }
  }
  return { parts: [{ geo: merge([[slab], [merge(fringe)]]), tex: T.straw() }, { geo: beams, tex: T.log(BARK) }] };
}
// ten steps up one storey over 2 m, low end at z = +1, between stringers
function stairsModel() {
  const treads = [], rnd = mulberry32(73), n = 10, run = 2 / n, rise = STOREY / n;
  for (let k = 0; k < n; k++) {
    const z = 1 - run * (k + 0.5), y = rise * (k + 1);
    treads.push([bevelBox(1.8, 0.07, run + 0.05, 0.014), M((rnd() - 0.5) * 0.03, y - 0.035, z)]);
    treads.push([bevelBox(1.76, rise - 0.07, 0.04, 0.01), M(0, y - 0.07 - (rise - 0.07) / 2, z + run / 2 - 0.02)]);
  }
  const len = Math.hypot(2, STOREY) + 0.12, ang = Math.atan2(STOREY, 2);
  const stringers = merge([-0.95, 0.95].map((x) => [bevelBox(0.12, 0.34, len, 0.025), new THREE.Matrix4().compose(V(x, STOREY / 2 - 0.08, 0), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), ang), V(1, 1, 1))]));
  return { parts: [{ geo: merge(treads), tex: BT.planks() }, { geo: stringers, tex: T.teak(), gloss: 0.3 }] };
}
// legs under a raised deck: a log from each corner down to the ground
export function floorPosts(lengths) {
  const list = [];
  [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].forEach(([x, z], i) => {
    const l = lengths[i];
    if (l > 0.05) list.push([logGeo(l + 0.3, 0.09), M(x, -0.2 - l - 0.3 + 0.05, z, 0, i, 0)]);
  });
  return list.length ? { parts: [{ geo: merge(list), tex: T.log(BARK) }] } : null;
}

export const MODELS = {
  'block:wood': () => once('m:bw', blockWood),
  'block:stone': () => once('m:bs', blockStone),
  floor: () => once('m:floor', floorModel),
  wall: () => once('m:wall', wallModel),
  door: () => once('m:door', doorModel),
  window: () => once('m:window', windowModel),
  roof: () => once('m:roof', roofModel),
  roofcorner: () => once('m:roofc', roofCornerModel),
  gable: () => once('m:gable', gableModel),
  gate: () => once('m:gate', gateModel),
  bed: () => once('m:bed', bedModel),
  gablewall: () => once('m:gablew', gableWallModel),
  flatroof: () => once('m:flatroof', flatRoofModel),
  stairs: () => once('m:stairs', stairsModel),
  spit: () => once('m:spit', spitModel),
  chest: () => once('m:chest', chestModel),
  book: () => once('m:book', bookModel),
  torch: () => once('m:torch', torchModel),
  transat: () => once('m:transat', transatModel),
  parasol: () => once('m:parasol', parasolModel),
  campfire: () => once('m:campfire', campfireModel),
  scythe: () => once('m:scythe', scytheModel),
  pickaxe: () => once('m:pickaxe', pickaxeModel),
  stone: () => once('m:stone', stoneModel),
  axe: () => once('m:axe', axeIcon),
  rod: () => once('m:rod', rodModel),
  'wood:palm': () => once('m:logp', () => logModel(TRUNK)),
  'wood:tree': () => once('m:logt', () => logModel(BARK)),
  coconut: () => once('m:coco', coconutModel),
  fibre: () => once('m:fibre', fibreModel),
};
export function fishModelFor(id, colors, cook = 0) { return once(`m:${id}:${cook}`, () => fishModel(colors, cook)); }
// the model of any item id: MODELS, a fish ('fish:N'), a grilled one
// ('grill:N') or a burnt one ('burnt:N')
const COOKED = { fish: 0, grill: 2, burnt: 3 };
export function itemModel(id) {
  if (MODELS[id]) return MODELS[id]();
  const [kind, n] = id?.split(':') ?? [];
  if (COOKED[kind] != null && SPECIES[+n]) return fishModelFor('fish:' + n, SPECIES[+n].c, COOKED[kind]);
  return null;
}
