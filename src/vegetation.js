// Palms, jungle trees, bushes, ferns and rocks: procedural geometry, instanced
// per 64 m cell so frustum + distance culling stay cheap on phones.
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';
import { mulberry32, makeSimplex } from './noise.js';

class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.sw = []; this.idx = []; }
  get count() { return this.p.length / 3; }
  v(p, n, u, v, sway) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v); this.sw.push(sway); return this.count - 1; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sw, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Tube along a curve made of separate stepped rings (palm trunk look).
// `sub` rows per ring and `split` columns per face subdivide the faces without
// changing the shape (used for the trunk being chopped, so the axe can carve
// real notches into it).
function ringTrunk(b, curve, rings, r0, r1, radial, rnd, swayK, uvScale = 1, sub = 1, split = 1) {
  const rot = rnd() * 0.5;
  const frame = (k) => {
    const ta = k / rings, tb = (k + 1) / rings;
    const ca = curve(ta), cb = curve(tb);
    const T = cb.clone().sub(ca).normalize();
    const S = new THREE.Vector3().crossVectors(T, Math.abs(T.y) > 0.9 ? V(1, 0, 0) : UP).normalize();
    const B = new THREE.Vector3().crossVectors(S, T).normalize();
    const dir = (i) => { const a = (i / radial) * Math.PI * 2 + rot; return S.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)); };
    return { ta, tb, ca, cb, T, dir, ra: (r0 + (r1 - r0) * ta) * 1.12, rb: (r0 + (r1 - r0) * tb) * 0.9 };
  };
  const cols = radial * split;
  for (let k = 0; k < rings; k++) {
    const f = frame(k);
    const start = b.count;
    for (let c = 0; c <= cols; c++) {
      const i0 = Math.min(radial - 1, Math.floor(c / split)), u = c / split - i0;
      const d0 = f.dir(i0), d1 = f.dir(i0 + 1);
      const n = d0.clone().lerp(d1, u).normalize();
      const lo = f.ca.clone().addScaledVector(d0, f.ra).lerp(f.ca.clone().addScaledVector(d1, f.ra), u);
      const hi = f.cb.clone().addScaledVector(d0, f.rb).lerp(f.cb.clone().addScaledVector(d1, f.rb), u);
      for (let j = 0; j <= sub; j++) {
        const s = j / sub, t = f.ta + (f.tb - f.ta) * s;
        b.v(lo.clone().lerp(hi, s), n, c / cols * uvScale, s, t * t * swayK);
      }
    }
    for (let c = 0; c < cols; c++) for (let j = 0; j < sub; j++) {
      const a = start + c * (sub + 1) + j, a2 = a + sub + 1;
      b.quad(a, a + 1, a2 + 1, a2); // counter-clockwise seen from outside
    }
    // downward-facing lip closing the step to the wider base of the next ring
    if (k < rings - 1) {
      const g = frame(k + 1), down = f.T.clone().negate();
      const s0 = b.count, sw = f.tb * f.tb * swayK;
      for (let c = 0; c <= cols; c++) {
        const i0 = Math.min(radial - 1, Math.floor(c / split)), u = c / split - i0;
        const d0 = f.dir(i0), d1 = f.dir(i0 + 1), e0 = g.dir(i0), e1 = g.dir(i0 + 1);
        const n = d0.clone().lerp(d1, u).normalize().multiplyScalar(0.4).add(down).normalize();
        b.v(f.cb.clone().addScaledVector(d0, f.rb).lerp(f.cb.clone().addScaledVector(d1, f.rb), u), n, c / cols * uvScale, 0.93, sw);
        b.v(g.ca.clone().addScaledVector(e0, g.ra).lerp(g.ca.clone().addScaledVector(e1, g.ra), u), n, c / cols * uvScale, 0.97, sw);
      }
      for (let c = 0; c < cols; c++) {
        const a = s0 + c * 2;
        b.quad(a, a + 1, a + 3, a + 2);
      }
    }
  }
}

// Folded leaf strip following a drooping arc (palm fronds, ferns).
function frond(b, origin, az, el0, droop, length, width, rows, swayBase, swayTip, curlUp = 0) {
  let p = origin.clone();
  let el = el0;
  const ds = length / rows;
  for (let r = 0; r <= rows; r++) {
    const s = r / rows;
    const T = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const S = new THREE.Vector3().crossVectors(T, UP).normalize();
    let N = new THREE.Vector3().crossVectors(S, T).normalize();
    if (N.y < 0) N.negate();
    const w = width * (0.35 + 0.65 * Math.sin(Math.min(1, s * 1.25 + 0.1) * Math.PI * 0.95));
    const fold = 0.35 + curlUp;
    const nn = N.clone().lerp(UP, 0.5).normalize();
    const sway = swayBase + s * s * swayTip;
    b.v(p.clone().addScaledVector(S, -w).addScaledVector(N, -w * fold), nn, 0, 1 - s, sway);
    b.v(p.clone(), nn, 0.5, 1 - s, sway);
    b.v(p.clone().addScaledVector(S, w).addScaledVector(N, -w * fold), nn, 1, 1 - s, sway);
    if (r > 0) {
      const c = b.count - 3, pr = c - 3;
      b.quad(pr, c, c + 1, pr + 1);
      b.quad(pr + 1, c + 1, c + 2, pr + 2);
    }
    p.addScaledVector(T, ds);
    el -= droop * ds / length * (0.4 + s * 1.6);
  }
}

// Detailed frond: rachis + individual leaflets (two rows, V-fold, drooping,
// bent tips). Reads as a real 3D leaf from every angle, unlike a textured strip.
function leafletFrond(b, origin, az, el0, droop, length, perSide, col, swayBase, swayTip, rnd) {
  const rows = 14, ds = length / rows;
  const spine = [];
  let p = origin.clone(), el = el0;
  for (let r = 0; r <= rows; r++) {
    const s = r / rows;
    const T = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const S = new THREE.Vector3().crossVectors(T, UP).normalize();
    const N = new THREE.Vector3().crossVectors(S, T).normalize();
    if (N.y < 0) N.negate();
    spine.push({ p: p.clone(), T, S, N, s });
    p.addScaledVector(T, ds);
    el -= droop * ds / length * (0.4 + s * 1.6);
  }
  const at = (s) => {
    const f = Math.min(rows - 1e-4, s * rows), i = Math.floor(f), u = f - i, a = spine[i], c = spine[i + 1];
    return { p: a.p.clone().lerp(c.p, u), T: a.T.clone().lerp(c.T, u).normalize(), S: a.S.clone().lerp(c.S, u).normalize(), N: a.N.clone().lerp(c.N, u).normalize() };
  };
  const u0 = col / 3, uMid = u0 + 1 / 6;
  // rachis: two crossed thin ribbons so it has thickness from any side
  for (const k of [0, 1]) {
    for (let r = 0; r <= rows; r++) {
      const { p: q, S, N, s } = spine[r];
      const off = (k ? N : S).clone().multiplyScalar(0.03 * (1 - s * 0.7));
      const nn = N.clone().lerp(UP, 0.5).normalize();
      const sw = swayBase + s * s * swayTip;
      b.v(q.clone().sub(off), nn, uMid - 0.01, 0.5, sw);
      b.v(q.clone().add(off), nn, uMid + 0.01, 0.5, sw);
      if (r > 0) { const c = b.count - 2; b.quad(c - 2, c, c + 1, c - 1); }
    }
  }
  for (let k = 0; k < perSide; k++) {
    const s = 0.05 + 0.93 * (k + 0.5) / perSide;
    const { p: q, T, S, N } = at(s);
    for (const side of [-1, 1]) {
      const L = length * 0.3 * Math.pow(Math.sin(Math.PI * (0.1 + 0.88 * s)), 0.75) * (0.85 + rnd() * 0.3);
      const fwd = 0.8 + rnd() * 0.25;
      const dir = T.clone().multiplyScalar(Math.cos(fwd)).addScaledVector(S, side * Math.sin(fwd))
        .addScaledVector(N, -(0.3 + 0.55 * s + rnd() * 0.15)).normalize();
      const flat = new THREE.Vector3().crossVectors(dir, N).normalize();
      const w = 0.05 + 0.025 * Math.sin(Math.PI * s);
      const mid = q.clone().addScaledVector(dir, L * 0.5);
      const tipDir = dir.clone().addScaledVector(N, -0.55).normalize();
      const tip = mid.clone().addScaledVector(tipDir, L * 0.5);
      const nn = N.clone().lerp(UP, 0.45).normalize();
      const sw = swayBase + s * s * swayTip;
      const uL = u0 + 0.01, uR = u0 + 1 / 3 - 0.01;
      const i0 = b.v(q.clone().addScaledVector(flat, -w * 0.35), nn, uL, 0.02, sw);
      b.v(q.clone().addScaledVector(flat, w * 0.35), nn, uR, 0.02, sw);
      b.v(mid.clone().addScaledVector(flat, -w), nn, uL, 0.5, sw + 0.02);
      b.v(mid.clone().addScaledVector(flat, w), nn, uR, 0.5, sw + 0.02);
      b.v(tip.clone().addScaledVector(flat, -w * 0.3), nn, uL, 0.98, sw + 0.05);
      b.v(tip.clone().addScaledVector(flat, w * 0.3), nn, uR, 0.98, sw + 0.05);
      b.quad(i0, i0 + 1, i0 + 3, i0 + 2);
      b.quad(i0 + 2, i0 + 3, i0 + 5, i0 + 4);
    }
  }
}

function leafCards(b, center, radius, cards, size, rnd, sway, squashY = 0.75) {
  for (let i = 0; i < cards; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2;
    const dir = V(Math.sqrt(1 - u * u) * Math.cos(a), Math.abs(u) * (u < -0.4 ? -0.6 : 1), Math.sqrt(1 - u * u) * Math.sin(a)).normalize();
    const c = center.clone().add(V(dir.x * radius, dir.y * radius * squashY, dir.z * radius));
    const T = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.95 ? V(1, 0, 0) : UP).normalize();
    const B = new THREE.Vector3().crossVectors(dir, T).normalize();
    const rot = rnd() * Math.PI;
    const t = T.clone().multiplyScalar(Math.cos(rot)).addScaledVector(B, Math.sin(rot));
    const bb = new THREE.Vector3().crossVectors(dir, t);
    const s = size * (0.8 + rnd() * 0.4);
    const n = dir.clone().lerp(UP, 0.25).normalize();
    const i0 = b.v(c.clone().addScaledVector(t, -s).addScaledVector(bb, -s), n, 0, 0, sway);
    b.v(c.clone().addScaledVector(t, s).addScaledVector(bb, -s), n, 1, 0, sway);
    b.v(c.clone().addScaledVector(t, s).addScaledVector(bb, s), n, 1, 1, sway);
    b.v(c.clone().addScaledVector(t, -s).addScaledVector(bb, s), n, 0, 1, sway);
    b.quad(i0, i0 + 1, i0 + 2, i0 + 3);
  }
}

// palm trunk + coconuts; same random sequence whatever the detail level
function palmTrunk(rnd, sub = 1, split = 1) {
  const H = 6.8 + rnd() * 3.2;
  const la = rnd() * Math.PI * 2, lean = (0.12 + rnd() * 0.3) * H;
  const bend = 0.6 + rnd() * 0.8;
  const curve = (t) => V(Math.cos(la) * lean * Math.pow(t, 1 + bend), H * t, Math.sin(la) * lean * Math.pow(t, 1 + bend));
  const trunk = new Builder();
  ringTrunk(trunk, curve, 11, 0.27, 0.17, 8, rnd, 0.35, 1, sub, split);
  const wood = trunk.count; // vertices below this index belong to the trunk (carvable)
  const top = curve(1);
  // coconuts
  for (let i = 0; i < 4; i++) {
    const a = rnd() * 6.28;
    const c = top.clone().add(V(Math.cos(a) * 0.22, -0.25 - rnd() * 0.15, Math.sin(a) * 0.22));
    const ico = new THREE.IcosahedronGeometry(0.17, 0);
    const pp = ico.attributes.position;
    const start = trunk.count;
    for (let k = 0; k < pp.count; k++) {
      const v = V(pp.getX(k), pp.getY(k), pp.getZ(k));
      trunk.v(c.clone().add(v), v.clone().normalize(), 0.3 + rnd() * 0.2, 0.95, 0.35);
    }
    for (let k = 0; k < pp.count; k += 3) trunk.tri(start + k, start + k + 1, start + k + 2);
  }
  return { trunk, top, H, curve, wood, r0: 0.27, r1: 0.17 };
}

function makePalm(seed, perSide) {
  const rnd = mulberry32(seed);
  const { trunk, top, H } = palmTrunk(rnd);
  // crown: 16-20 fronds in tiers - young upright spears, mature arching
  // fronds, old drooping ones, sometimes a dry frond hanging under the crown
  const n = 16 + Math.floor(rnd() * 5);
  const specs = [];
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 * 2.618 + rnd() * 0.5; // golden-angle-ish spiral
    const tier = i % 5 === 0 ? 'young' : i % 3 === 0 ? 'old' : 'mature';
    if (tier === 'young') specs.push({ az, el0: 0.95 + rnd() * 0.35, droop: 0.9, L: 2.3 + rnd() * 0.6, col: 0 });
    else if (tier === 'old') specs.push({ az, el0: -0.05 + rnd() * 0.25, droop: 2.2 + rnd() * 0.5, L: 3.8 + rnd() * 0.8, col: 1 });
    else specs.push({ az, el0: 0.25 + rnd() * 0.4, droop: 1.5 + rnd() * 0.6, L: 3.4 + rnd() * 1.0, col: rnd() < 0.5 ? 0 : 1 });
  }
  if (rnd() < 0.7) specs.push({ az: rnd() * 6.28, el0: -0.7, droop: 0.9, L: 3.2, col: 2 });
  const origin = top.clone().add(V(0, 0.05, 0));
  const fronds = new Builder(), near = new Builder();
  for (const f of specs) {
    frond(fronds, origin, f.az, f.el0, f.droop, f.L, 0.95, 10, 0.35, 0.35);
    leafletFrond(near, origin, f.az, f.el0, f.droop, f.L, perSide, f.col, 0.35, 0.35, rnd);
  }
  return { trunk: trunk.build(), fronds: fronds.build(), near: near.build(), height: H };
}

function treeTrunk(rnd, sub = 1, split = 1) {
  const H = 3.6 + rnd() * 1.6;
  const la = rnd() * 6.28, lean = 0.4 + rnd() * 0.6;
  const curve = (t) => V(Math.cos(la) * lean * t * t, H * t, Math.sin(la) * lean * t * t);
  const trunk = new Builder();
  ringTrunk(trunk, curve, 4, 0.28, 0.16, 7, rnd, 0.1, 2, sub, split);
  return { trunk, top: curve(1), H, curve, wood: trunk.count, r0: 0.28, r1: 0.16 };
}

function makeTree(seed) {
  const rnd = mulberry32(seed);
  const { trunk, top } = treeTrunk(rnd);
  const leaves = new Builder();
  const clumps = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * 6.28 + rnd();
    const r = i === 0 ? 0 : 1.2 + rnd() * 0.8;
    const c = top.clone().add(V(Math.cos(a) * r, (i === 0 ? 0.9 : rnd() * 0.8 - 0.2), Math.sin(a) * r));
    leafCards(leaves, c, 1.15 + rnd() * 0.4, 16, 0.85, rnd, 0.25);
  }
  return { trunk: trunk.build(), leaves: leaves.build() };
}

function makeBush(seed) {
  const rnd = mulberry32(seed);
  const b = new Builder();
  const clumps = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < clumps; i++) {
    const a = rnd() * 6.28, r = i === 0 ? 0 : 0.5;
    leafCards(b, V(Math.cos(a) * r, 0.55 + rnd() * 0.2, Math.sin(a) * r), 0.6 + rnd() * 0.2, 13, 0.55, rnd, 0.08);
  }
  return b.build();
}

function makeFern(seed) {
  const rnd = mulberry32(seed);
  const b = new Builder();
  const n = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * 6.28 + rnd() * 0.5;
    frond(b, V(0, 0.02, 0), az, 0.8 + rnd() * 0.5, 1.4, 1.0 + rnd() * 0.6, 0.32, 6, 0.0, 0.12, 0.1);
  }
  return b.build();
}

function makeRock(seed) {
  const sx = makeSimplex(seed);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i));
    const d = 1 + sx.noise(v.x * 1.3 + v.z, v.y * 1.3) * 0.22 + sx.noise(v.x * 3.1, v.z * 3.1 + v.y) * 0.08;
    v.multiplyScalar(d);
    v.y = v.y > 0 ? v.y * 0.72 : v.y * 0.4;
    // a couple of flat facets for a chiselled look
    if (v.x > 0.65) v.x = 0.65 + (v.x - 0.65) * 0.3;
    if (v.y > 0.55) v.y = 0.55 + (v.y - 0.55) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const sw = new Float32Array(p.count);
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  g.computeBoundingSphere();
  return g;
}

// Loose stone (radius ~0.5 before scaling): a rounded boulder sitting a little
// sunk in the ground, one flatter knapped face, a lumpy crown.
export function makeStone(seed, detail = 3, r0 = 0.6) {
  const sx = makeSimplex(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const cut = new THREE.Vector3(sx.noise(seed, 1), 0.25, sx.noise(2, seed)).normalize();
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i));
    v.multiplyScalar(1 + sx.noise(v.x * 1.6 + v.z, v.y * 1.6 - v.z) * 0.18 + sx.noise(v.x * 4.2, v.z * 4.2 + v.y) * 0.05);
    const f = v.dot(cut) - 0.62; // a flatter fractured face
    if (f > 0) v.addScaledVector(cut, -f * 0.75);
    v.y = v.y > 0 ? v.y * 0.92 : v.y * 0.45;
    p.setXYZ(i, v.x * r0, v.y * r0, v.z * r0);
  }
  g.computeVertexNormals();
  g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  g.computeBoundingSphere();
  return g;
}

function foliageMaterial(map, { alphaTest = 0.5, wind = 1, wrap = 0.5, translucent = 0, rock = false, tint = 0.12, gain = 1, cut = false, stone = false, crack = false } = {}) {
  return makeMaterial({
    side: alphaTest > 0 ? THREE.DoubleSide : THREE.FrontSide,
    defines: { ...(rock ? { ROCK: 1 } : {}), ...(cut ? { CUT: 1 } : {}), ...(stone ? { STONE: 1 } : {}), ...(crack ? { CRACK: 1 } : {}) },
    uniforms: {
      uCrack: { value: 0 },
      uMap: { value: map }, uAlphaTest: { value: alphaTest }, uWind: { value: wind },
      uWrap: { value: wrap }, uTrans: { value: translucent }, uTint: { value: tint }, uGain: { value: gain },
    },
    vertex: /* glsl */`
      attribute float aSway;
      uniform float uWind;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vWorld;
      varying float vRand;
      varying float vBaseY;
      #ifdef CUT
        attribute float aCut;
        varying float vCut;
      #endif
      #ifdef CRACK
        varying vec3 vLocal;
      #endif
      void main() {
        #ifdef CUT
          vCut = aCut;
        #endif
        #ifdef CRACK
          vLocal = position;
        #endif
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vec2 origin = m[3].xz;
        float ph = hash12(floor(origin * 3.0)) * 6.28;
        float gust = 0.6 + 0.4 * sin(uTime * 0.35 + origin.x * 0.02);
        w.x += sin(uTime * 1.1 + ph) * aSway * uWind * gust;
        w.z += cos(uTime * 0.9 + ph * 1.3) * aSway * uWind * 0.7 * gust;
        w.y += sin(uTime * 3.0 + ph + position.x * 2.0) * aSway * 0.06 * uWind;
        vUv = uv;
        vN = normalize(mat3(m) * normal);
        vWorld = w.xyz;
        vRand = hash12(floor(origin * 7.0));
        vBaseY = m[3].y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragment: /* glsl */`
      uniform sampler2D uMap;
      uniform float uAlphaTest, uWrap, uTrans, uTint, uGain;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vWorld;
      varying float vRand;
      varying float vBaseY;
      #ifdef CUT
        varying float vCut;
      #endif
      #ifdef CRACK
        uniform float uCrack;
        varying vec3 vLocal;
        // pixel-snapped 3D cells: borders of more and more cells split open
        float crackAt(vec3 q) {
          vec3 g = floor(q * 22.0) / 22.0 * 5.0, ip = floor(g), fp = fract(g);
          float d1 = 9.0, d2 = 9.0, id = 0.0;
          for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec3 o = vec3(float(x), float(y), float(z)), c = ip + o;
            vec3 h = fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
            vec3 r = o + h - fp; float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; id = h.x; } else if (d < d2) d2 = d;
          }
          float e = sqrt(d2) - sqrt(d1);
          float open = step(fract(id * 7.31), uCrack);
          return open * (e < 0.07 ? 2.0 : e < 0.13 ? 1.0 : 0.0);
        }
      #endif
      void main() {
        #ifdef ROCK
          vec3 an = abs(vN);
          vec2 tuv = an.y > max(an.x, an.z) ? vWorld.xz : (an.x > an.z ? vWorld.zy : vWorld.xy);
          vec4 tex = texture2D(uMap, tuv / 3.0);
        #else
          vec4 tex = texture2D(uMap, vUv);
          if (tex.a < uAlphaTest) discard;
        #endif
        vec3 n = normalize(vN);
        if (!gl_FrontFacing && uAlphaTest > 0.0) n = normalize(mix(-n, vec3(0.0, 1.0, 0.0), 0.5));
        vec4 d = worldData(vWorld.xz);
        float low = 1.0 - smoothstep(0.4, 2.2, vWorld.y - d.r);
        float shadow = 1.0 - d.b * 0.55 * uShade * low;
        vec3 col = tex.rgb * (1.0 - uTint * 0.5 + vRand * uTint);
        #ifdef STONE
          // lichen and moss in pixel clumps on the top of the stone
          float mossy = step(0.8, n.y) * step(0.78, hash12(floor(vWorld.xz * 4.0)) * 0.6 + hash12(floor(vWorld.xz * 16.0)) * 0.5);
          col = mix(col, hash12(floor(vWorld.xz * 16.0) + 3.0) < 0.5 ? vec3(0.36, 0.62, 0.17) : vec3(0.49, 0.74, 0.22), mossy);
        #endif
        #ifdef CRACK
          float ck = crackAt(vLocal);
          col = ck > 1.5 ? vec3(0.17, 0.14, 0.2) : ck > 0.5 ? col * 1.22 : col; // dark split, lit lip
        #endif
        #ifdef CUT
          // fresh wood inside an axe notch: pale ramp, darker at the bottom of the cut
          if (vCut > 0.04) {
            float g = hash12(floor(vec2(vUv.x * 96.0, vWorld.y * 28.0)));
            vec3 fresh = g < 0.33 ? vec3(0.95, 0.84, 0.64) : g < 0.75 ? vec3(0.89, 0.76, 0.54) : vec3(0.85, 0.71, 0.48);
            if (vCut > 0.82) fresh = vec3(0.66, 0.48, 0.28);
            else if (vCut > 0.62) fresh *= 0.86;
            col = mix(col, fresh, step(0.12, vCut));
          }
        #endif
        vec3 lit = lightAt(n, uWrap, shadow, vWorld);
        // light passing through leaves when the sun is behind them
        vec3 V = normalize(uCamPos - vWorld);
        float back = pow(max(dot(-V, uSunDir), 0.0), 3.0) * uTrans;
        col = col * lit * uGain + col * back * vec3(0.9, 1.0, 0.5);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

export class Vegetation {
  constructor(scene, world, tex, quality = 'medium') {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cells = [];
    const seed = world.cfg.seed;

    const mats = {
      trunk: foliageMaterial(tex.trunk, { alphaTest: 0, wrap: 0.3, tint: 0.2 }),
      frond: foliageMaterial(tex.frond, { alphaTest: 0.5, wrap: 0.7, translucent: 0.55, tint: 0.25, gain: 1.05 }),
      leaflet: foliageMaterial(tex.leaflet, { alphaTest: 0.5, wrap: 0.7, translucent: 0.6, tint: 0.22, gain: 1.08 }),
      leaf: foliageMaterial(tex.leaf, { alphaTest: 0.5, wrap: 0.6, translucent: 0.4, tint: 0.3 }),
      bush: foliageMaterial(tex.leaf2, { alphaTest: 0.5, wrap: 0.6, translucent: 0.3, tint: 0.3 }),
      fern: foliageMaterial(tex.fern, { alphaTest: 0.5, wrap: 0.7, translucent: 0.3, tint: 0.3, wind: 0.6 }),
      rock: foliageMaterial(tex.rock, { alphaTest: 0, wrap: 0.15, rock: true, tint: 0.25 }),
      trunkCut: foliageMaterial(tex.trunk, { alphaTest: 0, wrap: 0.3, tint: 0.2, cut: true }),
      stone: foliageMaterial(tex.stone, { alphaTest: 0, wrap: 0.2, rock: true, tint: 0.3, stone: true }),
    };
    this.tex = tex;
    this.seed = seed;
    this.materials = mats;

    const perSide = { low: 16, medium: 22, high: 28 }[quality] ?? 22;
    const palms = [0, 1, 2, 3].map((i) => makePalm(seed * 7 + i * 101, perSide));
    const trees = [0, 1, 2].map((i) => makeTree(seed * 11 + i * 37));
    const bushes = [0, 1, 2].map((i) => makeBush(seed * 13 + i * 53));
    const ferns = [0, 1].map((i) => makeFern(seed * 17 + i * 19));
    const rocks = [0, 1, 2].map((i) => makeRock(seed * 19 + i * 7));
    const stones = this.stones = [0, 1, 2].map((i) => makeStone(seed * 23 + i * 13));
    this.geometries = [...palms.flatMap((p) => [p.trunk, p.fronds, p.near]), ...trees.flatMap((t) => [t.trunk, t.leaves]), ...bushes, ...ferns, ...rocks, ...stones];

    const parts = {
      palms: (v) => [[palms[v].trunk, mats.trunk], [palms[v].fronds, mats.frond, 'far'], [palms[v].near, mats.leaflet, 'near']],
      trees: (v) => [[trees[v].trunk, mats.trunk], [trees[v].leaves, mats.leaf]],
      bushes: (v) => [[bushes[v], mats.bush]],
      ferns: (v) => [[ferns[v], mats.fern]],
      rocks: (v) => [[rocks[v], mats.rock]],
      stones: (v) => [[stones[v], mats.stone]],
    };
    const range = { palms: 260, trees: 240, bushes: 120, ferns: 70, rocks: 200, stones: 150 };

    const CELL = 64;
    const buckets = new Map();
    for (const type of Object.keys(parts)) {
      for (const p of world.props[type]) {
        if (p.gone) continue;
        const key = `${type}|${p.v}|${Math.floor(p.x / CELL)}|${Math.floor(p.z / CELL)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(p);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
    for (const [key, list] of buckets) {
      const [type, v, cx, cz] = key.split('|');
      for (const [geo, mat, lod] of parts[type](+v)) {
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((p, i) => {
          q.setFromAxisAngle(UP, p.rot);
          if (type === 'rocks') s.set(p.s * 1.2, p.s, p.s * 0.95);
          else if (type === 'stones') s.set(p.s * 1.1, p.s * 0.9, p.s);
          else s.setScalar(p.s);
          m4.compose(t.set(p.x, p.y, p.z), q, s);
          im.setMatrixAt(i, m4);
          (p.inst ||= []).push({ mesh: im, i });
        });
        im.computeBoundingSphere();
        im.matrixAutoUpdate = false;
        this.group.add(im);
        this.cells.push({ mesh: im, x: (+cx + 0.5) * CELL, z: (+cz + 0.5) * CELL, range: range[type], lod });
      }
    }
  }

  // Finely subdivided copy of a prop's trunk, for carving axe notches into it.
  // Same shape as the instanced trunk (faces are split, not reshaped).
  detailTrunk(p) {
    const seed = this.seed;
    const t = p.type === 'palms' ? palmTrunk(mulberry32(seed * 7 + p.v * 101), 14, 4) : treeTrunk(mulberry32(seed * 11 + p.v * 37), 22, 4);
    const geo = t.trunk.build();
    geo.setAttribute('aCut', new THREE.BufferAttribute(new Float32Array(t.trunk.count), 1));
    return {
      geo, H: t.H, curve: t.curve, wood: t.wood, r0: t.r0, r1: t.r1,
      basePos: geo.attributes.position.array.slice(), baseNor: geo.attributes.normal.array.slice(),
      material: this.materials.trunkCut,
    };
  }

  // A stone being mined: same shape as its instance, with its own material so
  // the cracks can open blow after blow (dispose the material when done).
  detailStone(p) {
    return { geo: this.stones[p.v], material: foliageMaterial(this.tex.stone, { alphaTest: 0, wrap: 0.2, rock: true, tint: 0.3, stone: true, crack: true }) };
  }

  setDistanceScale(k) { this.distScale = k; }

  update(cam) {
    const k = this.distScale ?? 1;
    for (const c of this.cells) {
      const d = Math.hypot(c.x - cam.position.x, c.z - cam.position.z) - 46;
      // detailed leaflet crowns up close, light textured strips further away
      const near = d < 75 * k;
      c.mesh.visible = d < c.range * k && (c.lod === 'near' ? near : c.lod === 'far' ? !near : true);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.geometries.forEach((g) => g.dispose());
    Object.values(this.materials).forEach((m) => m.dispose());
    this.group.traverse((o) => o.isInstancedMesh && o.dispose());
  }
}

export function colliders(world) {
  const list = [];
  for (const p of world.props.palms) if (!p.gone) list.push({ x: p.x, z: p.z, r: 0.32 * p.s, prop: p });
  for (const p of world.props.trees) if (!p.gone) list.push({ x: p.x, z: p.z, r: 0.35 * p.s, prop: p });
  for (const p of world.props.rocks) if (p.y + p.s * 0.6 > world.heightAt(p.x, p.z) + 0.4) list.push({ x: p.x, z: p.z, r: 0.95 * p.s });
  for (const p of world.props.stones) if (!p.gone) list.push({ x: p.x, z: p.z, r: 0.6 * p.s, prop: p });
  return list;
}
