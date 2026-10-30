// Places left on a wild island (Discover mode) by those who came before: the
// ruins of a temple, a wreck run aground, tiki guardians on a height, a ring
// of standing stones, an abandoned camp. Which of them an island holds, and
// where, comes from its seed (planSites(), called by world.js, which clears
// what grew there). Each one has a treasure chest (main.js puts it there the
// first time the island is built, as a real chest of placement.js, filled
// with the loot drawn here). buildSites() models them: textured pixel parts
// dressed like every object (dress.js), boulders cut in plates like the
// island rocks, solid boxes to walk on and bump into (player.solids through
// Building.addStatic) and round colliders.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { lathe, tube, merge, bevelBox, TEX, BTEX } from './models.js';
import { pixTex } from './axeModel.js';
import { dress } from './dress.js';
import { cutBlock, platePlanes } from './vegetation.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(s, s, s));

export const SITES = {
  temple: { name: 'Ruines d’un temple', icon: '🏛️', r: 7.5, w: 0.35 },
  wreck: { name: 'Épave échouée', icon: '⚓', r: 6.5, w: 0.55 },
  tikis: { name: 'Gardiens tiki', icon: '🗿', r: 5, w: 0.45 },
  circle: { name: 'Cercle de pierres levées', icon: '🪨', r: 6.5, w: 0.3 },
  camp: { name: 'Camp abandonné', icon: '⛺', r: 5, w: 0.5 },
};

// ---------------------------------------------------------------- loot
// [item, min, max, chance]
const LOOT = {
  temple: [['ore:gold', 3, 8, 0.9], ['amethyst', 1, 3, 0.7], ['obsidian', 2, 4, 0.5], ['lantern', 1, 1, 0.6], ['torch', 2, 4, 0.5], ['compass', 1, 1, 0.35]],
  wreck: [['ore:gold', 2, 6, 0.75], ['ore:iron', 2, 5, 0.6], ['ore:copper', 2, 5, 0.5], ['wood:tree', 4, 8, 0.6], ['compass', 1, 1, 0.45], ['boat', 1, 1, 0.25], ['torch', 2, 4, 0.5]],
  tikis: [['obsidian', 2, 5, 0.8], ['ore:gold', 2, 4, 0.6], ['amethyst', 1, 2, 0.4], ['coconut', 2, 5, 0.6], ['torch', 2, 3, 0.4]],
  circle: [['amethyst', 2, 4, 0.85], ['obsidian', 1, 3, 0.6], ['lantern', 1, 1, 0.5], ['ore:gold', 1, 3, 0.4]],
  camp: [['torch', 2, 5, 0.8], ['fibre', 6, 14, 0.7], ['wood:palm', 3, 8, 0.6], ['coconut', 2, 4, 0.6], ['campfire', 1, 1, 0.4], ['ore:iron', 2, 4, 0.4], ['ore:copper', 1, 3, 0.4], ['compass', 1, 1, 0.2]],
};
function rollLoot(type, r) {
  const out = [];
  for (const [id, a, b, p] of LOOT[type]) if (r() < p) out.push({ id, n: a + Math.floor(r() * (b - a + 1)) });
  if (!out.length) { const [id, a] = LOOT[type][0]; out.push({ id, n: a }); }
  return out;
}

// ---------------------------------------------------------------- planning
// sites of an island: { type, x, z, yaw, r, chest: [lx, lz, yaw], loot }
export function planSites(cfg, islands, heightAt, normalAt, excluded) {
  const r = mulberry32(cfg.seed + 60606);
  const land = islands.reduce((a, i) => a + i.r * i.r, 0) / (62 * 62);
  const want = Math.max(1, Math.min(4, Math.round(0.6 + land * 0.9 + r() * 1.3)));
  const types = Object.keys(SITES).filter((t) => r() < SITES[t].w + 0.15).sort(() => r() - 0.5);
  if (!types.length) types.push('camp');
  const out = [];
  const free = (x, z, rad) => !excluded(x, z) && out.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + rad + 12);
  for (const type of types.slice(0, want)) {
    const S = SITES[type];
    let best = null;
    for (let t = 0; t < 70; t++) {
      const isl = islands[Math.floor(r() * islands.length)], a = r() * Math.PI * 2;
      if (type === 'wreck') { // on the beach, lying along the shore
        let d = isl.r * 0.3;
        while (d < isl.r * 2 && heightAt(isl.x + Math.cos(a) * d, isl.z + Math.sin(a) * d) > 0.45) d += 0.5;
        const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d, h = heightAt(x, z);
        if (h < 0 || h > 0.6 || !free(x, z, S.r)) continue;
        const ox = Math.cos(a), oz = Math.sin(a);
        best = { x, z, yaw: Math.atan2(-ox, -oz) + (r() - 0.5) * 0.4 };
        break;
      }
      const d = Math.sqrt(r()) * isl.r * 0.75, x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d, h = heightAt(x, z);
      if (h < 1.6 || !free(x, z, S.r)) continue;
      let lo = h, hi = h;
      for (let k = 0; k < 8; k++) { const g = heightAt(x + Math.cos(k * 0.785) * S.r * 0.8, z + Math.sin(k * 0.785) * S.r * 0.8); lo = Math.min(lo, g); hi = Math.max(hi, g); }
      const flat = hi - lo;
      if (flat > (type === 'temple' ? 1.3 : 2.2) || lo < 1) continue;
      const score = (type === 'tikis' ? h * 0.4 : 0) - flat * 2 + r();
      if (!best || score > best.score) best = { x, z, score, yaw: type === 'tikis' ? Math.atan2(x - isl.x, z - isl.z) : r() * Math.PI * 2 }; // the guardians look out to sea
      if (t > 25 && best) break;
    }
    if (!best) continue;
    const chest = { temple: [0, 0.6, Math.PI], wreck: [1.6, 3.2, 0.3], tikis: [0, 2.9, Math.PI], circle: [0, 1.5, Math.PI], camp: [0.2, -0.55, Math.PI] }[type];
    out.push({ type, x: best.x, z: best.z, yaw: best.yaw, r: S.r, chest, loot: rollLoot(type, r), seed: Math.floor(r() * 1e6) });
  }
  return out;
}

// ---------------------------------------------------------------- textures
const ramp = (g, pal, x, y, k) => { g.fillStyle = pal[Math.max(0, Math.min(pal.length - 1, Math.round(k)))]; g.fillRect(x, y, 1, 1); };
const SAND = ['#6a6452', '#7e7864', '#948e78', '#aaa48c', '#bfb9a0', '#d4ceb4'];   // weathered sandstone
const MOSS = ['#2f5a1c', '#3d6b22', '#4f8a2a', '#6aa834', '#88c244'];
const TIKI = ['#2e2a36', '#423d4a', '#575160', '#6d6676', '#857d8c', '#9e96a3'];   // carved basalt
const SCORIA = ['#5a1e14', '#76281a', '#933622', '#ad4a2e', '#c46440'];             // red topknot stone
const DRIFT = ['#3a2e26', '#54443a', '#6e5c4c', '#8a7660', '#a69276', '#c2b092'];  // sea-bleached planks
const FADED = ['#24484a', '#2e5a5c', '#3e7472', '#58908a', '#7aaaa0'];             // old hull paint
const STAVE = ['#4a2c16', '#62401e', '#7c5428', '#946634', '#ac7a42'];
const IRON = ['#2c2830', '#3e3842', '#5a4a44', '#7a5a42', '#9a6e4a'];               // rusted hoops
const CHAR = ['#120c0a', '#1e1410', '#2e2018', '#3e2c20', '#523a28'];
const SHELL = ['#c8bea8', '#e0d8c4', '#f2ecdc', '#fffaf0'];
const once = new Map();
const tx = (key, w, h, paint) => { if (!once.has(key)) once.set(key, pixTex(w, h, paint)); return once.get(key); };
const TX = {
  // big dressed blocks of sandstone, weathered, moss in the joints and on top
  ruin: () => tx('ruin', 32, 32, (g, w, h) => {
    const r = mulberry32(71);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 16), fx = (x + row * 9) % 16, fy = y % 16;
      let k = 2.6 + (r() - 0.5) * 1.1 + Math.sin(x * 0.7 + y * 0.3) * 0.25;
      if ((x * 7 + y * 3) % 23 === 0) k -= 1.3; // pits
      if (fx === 0 || fy === 0) { ramp(g, r() < 0.55 ? MOSS : SAND, x, y, r() < 0.55 ? 1.5 + r() * 2 : 0.5); continue; }
      if (fx === 1 || fy === 1) k += 1.2; else if (fx === 15 || fy === 15) k -= 1;
      if (fy < 4 && r() < 0.18 - fy * 0.04) { ramp(g, MOSS, x, y, 2 + r() * 2); continue; }
      ramp(g, SAND, x, y, k);
    }
  }),
  // fluted column: vertical flutes, a lit lip on each
  flute: () => tx('flute', 32, 32, (g, w, h) => {
    const r = mulberry32(72);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const f = x % 4;
      let k = f === 0 ? 0.8 : f === 1 ? 3.8 : 2.6 + (r() - 0.5) * 0.8;
      if (y > 26 && r() < 0.3) { ramp(g, MOSS, x, y, 1 + r() * 3); continue; }
      ramp(g, SAND, x, y, k);
    }
  }),
  // carved basalt: horizontal bands of zig-zags and chevrons, lichen spots
  tiki: () => tx('tiki', 32, 32, (g, w, h) => {
    const r = mulberry32(73);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const band = Math.floor(y / 8), fy = y % 8;
      let k = 2.6 + (r() - 0.5) * 1;
      if (band % 2 === 0 && Math.abs(fy - 4) === Math.abs((x % 8) - 4)) k = 0.5; // carved chevrons
      else if (band % 2 === 1 && (fy === 0 || fy === 7)) k = 0.8;
      else if (fy === 1) k += 1.1;
      if (r() < 0.025) { ramp(g, MOSS, x, y, 3 + r()); continue; }
      ramp(g, TIKI, x, y, k);
    }
  }),
  scoria: () => tx('scoria', 16, 16, (g, w, h) => { const r = mulberry32(74); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, SCORIA, x, y, 2.4 + (r() - 0.5) * 2.4); }),
  shell: () => tx('shell', 8, 8, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, SHELL, x, y, 3 - Math.hypot(x - 2.5, y - 2.5) * 0.6); }),
  // the dark of a carved mouth or an eye
  hollow: () => tx('hollow', 8, 8, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, TIKI, x, y, (x + y) % 5 === 0 ? 1 : 0); }),
  // clinker hull, sea-bleached: overlapping strakes (dark lap line, lit edge),
  // a band of faded paint along the top, copper rivets
  hull: () => tx('hull', 32, 32, (g, w, h) => {
    const r = mulberry32(75);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fy = y % 8, strake = Math.floor(y / 8);
      let k = 2.4 + (r() - 0.5) * 1.2 + Math.sin(x * 0.5 + strake * 3) * 0.3;
      if (fy === 0) k = 0.3; else if (fy === 1) k += 1.3;
      if ((x + strake * 5) % 16 === 3 && fy === 4) { g.fillStyle = '#c47a3a'; g.fillRect(x, y, 1, 1); continue; }
      if (strake === 3 && fy > 1 && r() < 0.8) { ramp(g, FADED, x, y, 2.4 + (r() - 0.5) * 2); continue; }
      ramp(g, DRIFT, x, y, k);
    }
  }),
  drift: () => tx('drift', 16, 32, (g, w, h) => { const r = mulberry32(76); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, DRIFT, x, y, 2.6 + (r() - 0.5) * 1 + (x % 5 === 0 ? -1.2 : 0)); }),
  // barrel staves and two rusted hoops
  barrel: () => tx('barrel', 32, 32, (g, w, h) => {
    const r = mulberry32(77);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ([5, 6, 25, 26].includes(y)) { ramp(g, IRON, x, y, y % 2 ? 1.5 : 3.5 + (r() - 0.5)); continue; }
      ramp(g, STAVE, x, y, x % 5 === 0 ? 0.4 : x % 5 === 1 ? 3.6 : 2.4 + (r() - 0.5) * 0.9);
    }
  }),
  char: () => tx('char', 16, 16, (g, w, h) => { const r = mulberry32(78); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, CHAR, x, y, 2 + (r() - 0.5) * 3 + (y % 4 === 0 ? -1 : 0)); }),
};

// ---------------------------------------------------------------- building
const SITE_PIECE = { type: 'site' };
class Kit {
  constructor(site, heightAt) {
    this.s = site; this.H = heightAt;
    this.c = Math.cos(site.yaw); this.sn = Math.sin(site.yaw);
    this.parts = new Map(); this.rocks = []; this.boxes = []; this.circles = []; this.mats = new Map();
  }
  world(lx, lz) { return [this.s.x + lx * this.c + lz * this.sn, this.s.z - lx * this.sn + lz * this.c]; }
  ground(lx, lz) { const [x, z] = this.world(lx, lz); return this.H(x, z) - this.s.g; }
  // a textured part (local geometry, local matrix); mat: what the tools hear
  add(tex, geo, m, mat = 'stone', opts = {}) {
    const key = tex.uuid + (opts.double ? 'd' : '');
    if (!this.parts.has(key)) this.parts.set(key, { tex, list: [], mat, ...opts });
    this.parts.get(key).list.push([geo, m]);
  }
  // a boulder cut in plates, like the island rocks
  rock(geo, m) { this.rocks.push([geo, m]); }
  // solid box in local space (y relative to the site's ground level)
  solid(cx, cz, hx, hz, y0, y1, a = 0) {
    const [x, z] = this.world(cx, cz), yaw = this.s.yaw + a;
    this.boxes.push({ x, z, ux: Math.cos(yaw), uz: -Math.sin(yaw), vx: Math.sin(yaw), vz: Math.cos(yaw), hx, hz, y0: this.s.g + y0, y1: this.s.g + y1, piece: SITE_PIECE });
  }
  circle(lx, lz, r) { const [x, z] = this.world(lx, lz); this.circles.push({ x, z, r }); }
  // a bevelled block standing on the ground, sunk into it where it slopes
  block(tex, cx, y1, cz, w, d, { h = null, a = 0, solid = true, sink = 1.2 } = {}) {
    const y0 = h != null ? y1 - h : Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => this.ground(cx + i * w / 2, cz + j * d / 2))) - sink;
    const hh = y1 - y0;
    this.add(tex, bevelBox(w, hh, d, Math.min(0.08, hh / 4), [w / 2, hh / 2 + y0, d / 2]), M(cx, (y0 + y1) / 2, cz, 0, a));
    if (solid) this.solid(cx, cz, w / 2, d / 2, y0, y1, a);
  }
  finish(veg) {
    const g = new THREE.Group();
    const model = { parts: [...this.parts.values()].map((p) => ({ geo: merge(p.list), tex: p.tex, double: p.double, gloss: p.gloss })) };
    const dressed = dress(model, 'world');
    [...this.parts.values()].forEach((p, i) => { dressed.children[i].userData.mat = p.mat; });
    g.add(dressed);
    if (this.rocks.length) {
      const rock = new THREE.Mesh(mergeFull(this.rocks), veg.materials.rock);
      rock.userData.mat = 'stone';
      g.add(rock);
    }
    g.position.set(this.s.x, this.s.g, this.s.z);
    g.rotation.y = this.s.yaw;
    g.updateMatrixWorld(true);
    return g;
  }
}
// merge non-indexed geometries keeping every attribute (the plate rocks)
function mergeFull(list) {
  const out = new THREE.BufferGeometry(), names = Object.keys(list[0][0].attributes);
  for (const n of names) {
    const size = list[0][0].attributes[n].itemSize, arr = [];
    for (const [g0, m] of list) {
      const a = g0.attributes[n], v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
      for (let i = 0; i < a.count; i++) {
        if (n === 'position') { v.fromBufferAttribute(a, i).applyMatrix4(m); arr.push(v.x, v.y, v.z); } else if (n === 'normal') { v.fromBufferAttribute(a, i).applyMatrix3(nm).normalize(); arr.push(v.x, v.y, v.z); } else for (let k = 0; k < size; k++) arr.push(a.array[i * size + k]);
      }
    }
    out.setAttribute(n, new THREE.Float32BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

// a tiki head: a tall carved block, heavy brow, shell eyes, a broad nose, a
// long mouth, ears, and the red stone topknot (its signature)
function tikiStatue(k, lx, lz, H, a = 0) {
  const at = (x, y, z) => M(lx + x * Math.cos(a) + z * Math.sin(a), k.ground(lx, lz) + y, lz - x * Math.sin(a) + z * Math.cos(a), 0, a);
  const base = k.ground(lx, lz) - 0.8, w = 1.25 + H * 0.05, d = 1.0;
  k.add(TX.tiki(), bevelBox(w, H + 0.8, d, 0.14, [w / 2, (H + 0.8) / 2, 0.5]), M(lx, base + (H + 0.8) / 2, lz, 0, a));
  k.add(TX.tiki(), bevelBox(w * 1.12, 0.26, 0.4, 0.08, [0.6, 0.1, 0.2]), at(0, H * 0.74, d / 2 + 0.08));        // brow
  k.add(TX.tiki(), bevelBox(0.38, H * 0.24, 0.36, 0.1, [0.2, 0.3, 0.2]), at(0, H * 0.58, d / 2 + 0.1));        // nose
  k.add(TX.tiki(), bevelBox(w * 0.84, 0.24, 0.28, 0.08, [0.4, 0.1, 0.1]), at(0, H * 0.38, d / 2 + 0.06));      // lips
  k.add(TX.hollow(), bevelBox(w * 0.66, 0.08, 0.06, 0.02), at(0, H * 0.38, d / 2 + 0.2));                       // the mouth's dark slot
  for (const s of [-1, 1]) {
    const eye = lathe([[0, 0], [0.17, 0], [0.19, 0.05], [0.12, 0.1], [0, 0.11]], 10);
    eye.rotateX(Math.PI / 2);
    k.add(TX.shell(), eye, at(s * w * 0.24, H * 0.64, d / 2 + 0.01));
    const pupil = lathe([[0, 0], [0.07, 0], [0.07, 0.03], [0, 0.04]], 8);
    pupil.rotateX(Math.PI / 2);
    k.add(TX.hollow(), pupil, at(s * w * 0.24, H * 0.64, d / 2 + 0.11));
    k.add(TX.tiki(), bevelBox(0.18, H * 0.3, 0.5, 0.06), at(s * (w / 2 + 0.06), H * 0.6, 0));                  // ears
  }
  const knot = lathe([[0, 0], [0.5, 0], [0.62, 0.12], [0.62, 0.42], [0.5, 0.55], [0, 0.56]], 14, 3);
  k.add(TX.scoria(), knot, at(0, H, -0.05));
  k.circle(lx, lz, w * 0.62);
  k.solid(lx, lz, w / 2, d / 2, base, H + 0.56, a);
}

// a column of drums: plinth, swelling shaft, capital; broken ones end short
// with their fallen drums beside them
function column(k, lx, y0, lz, H, broken, r) {
  const top = broken ? H * (0.3 + r() * 0.4) : H;
  const prof = [[0, 0], [0.5, 0], [0.5, 0.22], [0.4, 0.28], [0.34, 0.34], [0.36, top * 0.5], [0.31, top - (broken ? 0 : 0.36)]];
  if (!broken) prof.push([0.4, top - 0.24], [0.46, top - 0.1], [0.46, top]);
  prof.push([0, top]);
  k.add(TX.flute(), lathe(prof, 12, 3), M(lx, y0, lz));
  k.circle(lx, lz, 0.45);
  k.solid(lx, lz, 0.33, 0.33, y0, y0 + top);
  if (broken) for (let i = 0; i < 2; i++) {
    const a = r() * 6.28, d = 1 + r() * 1.4, len = 0.6 + r() * 0.3;
    const drum = lathe([[0, 0], [0.33, 0], [0.34, len / 2], [0.33, len], [0, len]], 12, 3);
    const x = lx + Math.cos(a) * d, z = lz + Math.sin(a) * d;
    k.add(TX.flute(), drum, M(x, k.ground(x, z) + 0.26, z, 0, r() * 6.28, Math.PI / 2));
  }
}

function brazier(k, lx, lz) {
  const y = k.ground(lx, lz) - 0.1;
  k.add(TX.ruin(), lathe([[0, 0], [0.32, 0], [0.22, 0.12], [0.16, 0.6], [0.3, 0.72], [0.46, 0.9], [0.4, 0.94], [0, 0.82]], 12, 2), M(lx, y, lz));
  k.add(TX.char(), lathe([[0, 0], [0.38, 0], [0, 0.04]], 10), M(lx, y + 0.86, lz));
  k.circle(lx, lz, 0.4);
}

function barrel(k, lx, lz, lying, r) {
  const g = lathe([[0, 0], [0.27, 0], [0.32, 0.18], [0.34, 0.4], [0.32, 0.62], [0.27, 0.8], [0, 0.8]], 14, 2);
  const y = k.ground(lx, lz);
  if (lying) k.add(TX.barrel(), g, M(lx, y + 0.3, lz, 0, r() * 6.28, Math.PI / 2), 'wood');
  else k.add(TX.barrel(), g, M(lx, y - 0.02, lz, 0, r() * 6.28), 'wood');
  k.circle(lx, lz, 0.4);
}
function crate(k, lx, lz, a, stack = 0) {
  const y = k.ground(lx, lz) - 0.03 + stack * 0.8;
  k.add(BTEX.crate(), bevelBox(0.8, 0.8, 0.8, 0.04, [0.4, 0.4, 0.4]), M(lx, y + 0.4, lz, 0, a), 'wood');
  k.solid(lx, lz, 0.4, 0.4, y - 0.05, y + 0.8, a);
}

const BUILD = {
  temple(k, r) {
    // two stepped tiers, a staircase on the front, columns round the lower
    // tier (some broken), braziers by the stairs, a tiki guarding the top
    const t1 = 0.45, t2 = 0.9;
    k.block(TX.ruin(), 0, t1, 0, 8.4, 8.4);
    k.block(TX.ruin(), 0, t2, -0.4, 5.6, 5.2, { h: t2 - t1 + 0.2 });
    for (let s = 0; s < 2; s++) k.block(TX.ruin(), 0, t1 * (s + 1) / 3 + 0.02, 4.2 + 0.45 * (2 - s), 2.6, 0.5, { sink: 0.6 });
    k.block(TX.ruin(), 0, t1 + 0.22, 2.6, 2.2, 0.5, { h: 0.42 }); // the step up to the top tier
    const spots = [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6], [-3.6, 0], [3.6, 0]];
    spots.forEach(([x, z], i) => column(k, x, t1 - 0.02, z, 3.6, i > 1 && r() < 0.6, r));
    brazier(k, -1.8, 5.6); brazier(k, 1.8, 5.6);
    tikiStatue(k, 0, -2.3, 3.4);
  },
  wreck(k, r) {
    // a clinker hull on its side in the sand, a hole in the planking showing
    // the ribs, the mast snapped off, barrels and crates washed up around it
    const L = 9, B = 1.6, D = 1.3, nu = 26, na = 14, roll = 0.42;
    const pt = (u, a) => {
      const b = B * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.2)), 0.55), d = D * (1 - 0.3 * u * u);
      const s = Math.sin(a);
      return V(u * L / 2, -d * Math.pow(Math.cos(a), 0.7) + 0.35 * u * u * Math.abs(s), b * s);
    };
    const hole = (u, a) => u > -0.05 && u < 0.38 && a > 0.25 && a < 1.0;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= na; j++) {
      const u = -1 + 2 * i / nu, a = -Math.PI / 2 + Math.PI * j / na, p = pt(u, a);
      pos.push(p.x, p.y, p.z); uv.push(u * L / 2, (a + Math.PI / 2) * 1.3);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < na; j++) {
      const u = -1 + 2 * (i + 0.5) / nu, a = -Math.PI / 2 + Math.PI * (j + 0.5) / na;
      if (hole(u, a) && r() < 0.85) continue;
      const A = i * (na + 1) + j, Bb = A + na + 1;
      idx.push(A, A + 1, Bb + 1, A, Bb + 1, Bb);
    }
    const hull = new THREE.BufferGeometry();
    hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    hull.setIndex(idx);
    hull.computeVertexNormals();
    const set = M(0, 0.25, 0, roll, 0, 0.05);
    k.add(TX.hull(), hull, set, 'wood', { double: true });
    for (let u = -0.7; u <= 0.71; u += 0.175) { // ribs inside
      const rib = tube((t) => pt(u, -Math.PI / 2 + Math.PI * t).multiplyScalar(0.97), () => 0.06, { rings: 12, radial: 5, up: V(1, 0, 0) });
      k.add(TX.drift(), rib, set, 'wood');
    }
    const keel = tube((t) => pt(-1 + 2 * t, 0).add(V(0, -0.05, 0)), () => 0.09, { rings: 16, radial: 6, up: V(0, 0, 1) });
    k.add(TX.drift(), keel, set, 'wood');
    const mast = lathe([[0, 0], [0.16, 0], [0.15, 2.4], [0.12, 2.6], [0.05, 2.75], [0, 2.7]], 9, 2);
    k.add(TX.drift(), mast, set.clone().multiply(M(-0.6, -D + 0.1, 0, 0, 0, 0.5)), 'wood');
    for (let u = -0.6; u <= 0.61; u += 0.3) k.circle(u * L / 2, 0, B * (1 - u * u * 0.6) * 0.95);
    barrel(k, -2.6, 2.6, false, r); barrel(k, -1.6, 3.4, true, r); barrel(k, 3.4, 2.2, r() < 0.5, r);
    crate(k, 0.2, 2.9, 0.4); crate(k, 3.6, 3.4, -0.3);
  },
  tikis(k, r) {
    const hs = [3 + r() * 0.6, 3.9 + r() * 0.6, 3.2 + r() * 0.6];
    [-2.4, 0, 2.4].forEach((x, i) => tikiStatue(k, x, -0.6 - (i === 1 ? 0.4 : 0), hs[i], (i - 1) * -0.2));
    k.block(TX.tiki(), 0, k.ground(0, 1.7) + 0.55, 1.7, 1.8, 1, { solid: true }); // offering stone
  },
  circle(k, r) {
    const n = 7 + Math.floor(r() * 3), R = 4.6;
    for (let i = 0; i < n; i++) {
      if (r() < 0.12) continue; // one has fallen and gone
      const a = (i / n) * Math.PI * 2 + 0.3, x = Math.cos(a) * R, z = Math.sin(a) * R, h = 1.6 + r() * 0.9;
      const geo = cutBlock(platePlanes(mulberry32(k.s.seed + i * 7), 20, 0.66, 0.95), { scale: [0.55, h, 0.4] }).geo;
      k.rock(geo, M(x, k.ground(x, z) + h * 0.7, z, (r() - 0.5) * 0.14, -a + Math.PI / 2, (r() - 0.5) * 0.14));
      k.circle(x, z, 0.6);
      k.solid(x, z, 0.42, 0.3, k.ground(x, z) - 1, k.ground(x, z) + h * 1.45, -a + Math.PI / 2);
    }
    const slab = cutBlock(platePlanes(mulberry32(k.s.seed + 99), 22, 0.7, 0.95, 0.15), { scale: [1.3, 0.45, 0.85] }).geo;
    k.rock(slab, M(0, k.ground(0, 0) + 0.2, 0));
    k.solid(0, 0, 1.0, 0.66, k.ground(0, 0) - 1, k.ground(0, 0) + 0.55);
  },
  camp(k, r) {
    // a lean-to of poles and thatch, a dead fire ring, crates and a barrel
    const post = (x, z, h) => {
      k.add(TX.drift(), lathe([[0, 0], [0.08, 0], [0.07, h - 0.2], [0.11, h - 0.05], [0.13, h], [0, h]], 8, 1), M(x, k.ground(x, z) - 0.2, z, 0, 0, (r() - 0.5) * 0.1), 'wood');
      k.circle(x, z, 0.15);
    };
    post(-1.4, -0.2, 1.9); post(1.4, -0.2, 1.9);
    const ridge = tube((t) => V(-1.6 + 3.2 * t, k.ground(0, -0.2) + 1.62, -0.2), () => 0.07, { rings: 4, radial: 6, up: V(0, 0, 1) });
    k.add(TX.drift(), ridge, null, 'wood');
    const gy = k.ground(0, -1.1);
    const roof = bevelBox(3.4, 0.1, 2.3, 0.04, [1.7, 0, 1.15]);
    k.add(TEX.straw(), roof, M(0, (k.ground(0, -0.2) + 1.62 + gy) / 2, -1.1, -0.78, 0, 0), 'wood');
    for (const x of [-1.2, 0, 1.2]) k.circle(x, -1.75, 0.45); // the low back of the roof
    for (let i = 0; i < 9; i++) { // fire ring
      const a = (i / 9) * Math.PI * 2, x = 0.3 + Math.cos(a) * 0.6, z = 2 + Math.sin(a) * 0.6;
      const st = cutBlock(platePlanes(mulberry32(k.s.seed + i), 14, 0.7, 0.95), { scale: [0.17, 0.13, 0.15] }).geo;
      k.rock(st, M(x, k.ground(x, z) + 0.05, z, 0, r() * 6));
    }
    for (let i = 0; i < 3; i++) {
      const log = lathe([[0, 0], [0.07, 0], [0.08, 0.35], [0.06, 0.7], [0, 0.7]], 7);
      k.add(TX.char(), log, M(0.3, k.ground(0.3, 2) + 0.06, 2, 0, i * 2.1, Math.PI / 2 - 0.15).multiply(M(0, -0.35)), 'wood');
    }
    k.circle(0.3, 2, 0.75);
    crate(k, 2.2, 0.6, 0.2); crate(k, 2.25, 0.62, 0.5, 1); barrel(k, -2.3, 0.9, false, r);
  },
};

// meshes, solid boxes and colliders of every site of a world
export function buildSites(world, veg) {
  const group = new THREE.Group(), boxes = [], colliders = [];
  for (const site of world.sites || []) {
    const H = world.heightAt;
    site.g = site.type === 'wreck' ? H(site.x, site.z) : (() => { // a little below the mean ground: nothing hangs over a hollow
      let s = 0; for (let k = 0; k < 9; k++) s += H(site.x + Math.cos(k * 0.7) * (k ? site.r * 0.5 : 0), site.z + Math.sin(k * 0.7) * (k ? site.r * 0.5 : 0));
      return s / 9 - 0.1;
    })();
    const k = new Kit(site, H), r = mulberry32(site.seed);
    BUILD[site.type](k, r);
    group.add(k.finish(veg));
    boxes.push(...k.boxes); colliders.push(...k.circles);
  }
  return { group, boxes, colliders };
}
// a site's chest in world space { x, z, yaw }
export function chestSpot(site) {
  const [lx, lz, a] = site.chest, c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  return { x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c, yaw: site.yaw + a };
}
