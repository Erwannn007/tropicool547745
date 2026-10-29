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
function ringTrunk(b, curve, rings, r0, r1, radial, rnd, swayK, uvScale = 1) {
  for (let k = 0; k < rings; k++) {
    const ta = k / rings, tb = (k + 1) / rings;
    const ca = curve(ta), cb = curve(tb);
    const T = cb.clone().sub(ca).normalize();
    const S = new THREE.Vector3().crossVectors(T, Math.abs(T.y) > 0.9 ? V(1, 0, 0) : UP).normalize();
    const B = new THREE.Vector3().crossVectors(S, T).normalize();
    const ra = (r0 + (r1 - r0) * ta) * 1.12, rb = (r0 + (r1 - r0) * tb) * 0.9;
    const rot = rnd() * 0.5;
    const start = b.count;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2 + rot;
      const dir = S.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      b.v(ca.clone().addScaledVector(dir, ra), dir, i / radial * uvScale, 0, ta * ta * swayK);
      b.v(cb.clone().addScaledVector(dir, rb), dir, i / radial * uvScale, 1, tb * tb * swayK);
    }
    for (let i = 0; i < radial; i++) {
      const a = start + i * 2;
      b.quad(a, a + 2, a + 3, a + 1);
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

function makePalm(seed) {
  const rnd = mulberry32(seed);
  const H = 6.8 + rnd() * 3.2;
  const la = rnd() * Math.PI * 2, lean = (0.12 + rnd() * 0.3) * H;
  const bend = 0.6 + rnd() * 0.8;
  const curve = (t) => V(Math.cos(la) * lean * Math.pow(t, 1 + bend), H * t, Math.sin(la) * lean * Math.pow(t, 1 + bend));
  const trunk = new Builder();
  ringTrunk(trunk, curve, 11, 0.27, 0.17, 8, rnd, 0.35);
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
  const fronds = new Builder();
  const n = 10 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const young = i % 4 === 0;
    const el0 = young ? 0.75 + rnd() * 0.35 : 0.2 + rnd() * 0.45;
    const L = (young ? 2.6 : 3.6) + rnd() * 1.1;
    frond(fronds, top.clone().add(V(0, 0.05, 0)), az, el0, young ? 1.1 : 1.6 + rnd() * 0.7, L, 0.95, 10, 0.35, 0.35);
  }
  return { trunk: trunk.build(), fronds: fronds.build(), height: H };
}

function makeTree(seed) {
  const rnd = mulberry32(seed);
  const H = 3.6 + rnd() * 1.6;
  const la = rnd() * 6.28, lean = 0.4 + rnd() * 0.6;
  const curve = (t) => V(Math.cos(la) * lean * t * t, H * t, Math.sin(la) * lean * t * t);
  const trunk = new Builder();
  ringTrunk(trunk, curve, 4, 0.28, 0.16, 7, rnd, 0.1, 2);
  const top = curve(1);
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

function foliageMaterial(map, { alphaTest = 0.5, wind = 1, wrap = 0.5, translucent = 0, rock = false, tint = 0.12, gain = 1 } = {}) {
  return makeMaterial({
    side: alphaTest > 0 ? THREE.DoubleSide : THREE.FrontSide,
    defines: rock ? { ROCK: 1 } : {},
    uniforms: {
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
      void main() {
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
        float shadow = 1.0 - d.b * 0.55 * low;
        vec3 col = tex.rgb * (1.0 - uTint * 0.5 + vRand * uTint);
        vec3 lit = lightDiffuse(n, uWrap, shadow);
        // light passing through leaves when the sun is behind them
        vec3 V = normalize(uCamPos - vWorld);
        float back = pow(max(dot(-V, uSunDir), 0.0), 3.0) * uTrans;
        col = col * lit * uGain + col * back * vec3(0.9, 1.0, 0.5);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

export class Vegetation {
  constructor(scene, world, tex) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cells = [];
    const seed = world.cfg.seed;

    const mats = {
      trunk: foliageMaterial(tex.trunk, { alphaTest: 0, wrap: 0.3, tint: 0.2 }),
      frond: foliageMaterial(tex.frond, { alphaTest: 0.5, wrap: 0.7, translucent: 0.55, tint: 0.25, gain: 1.05 }),
      leaf: foliageMaterial(tex.leaf, { alphaTest: 0.5, wrap: 0.6, translucent: 0.4, tint: 0.3 }),
      bush: foliageMaterial(tex.leaf2, { alphaTest: 0.5, wrap: 0.6, translucent: 0.3, tint: 0.3 }),
      fern: foliageMaterial(tex.fern, { alphaTest: 0.5, wrap: 0.7, translucent: 0.3, tint: 0.3, wind: 0.6 }),
      rock: foliageMaterial(tex.rock, { alphaTest: 0, wrap: 0.15, rock: true, tint: 0.25 }),
    };
    this.materials = mats;

    const palms = [0, 1, 2, 3].map((i) => makePalm(seed * 7 + i * 101));
    const trees = [0, 1, 2].map((i) => makeTree(seed * 11 + i * 37));
    const bushes = [0, 1, 2].map((i) => makeBush(seed * 13 + i * 53));
    const ferns = [0, 1].map((i) => makeFern(seed * 17 + i * 19));
    const rocks = [0, 1, 2].map((i) => makeRock(seed * 19 + i * 7));
    this.geometries = [...palms.flatMap((p) => [p.trunk, p.fronds]), ...trees.flatMap((t) => [t.trunk, t.leaves]), ...bushes, ...ferns, ...rocks];

    const parts = {
      palms: (v) => [[palms[v].trunk, mats.trunk], [palms[v].fronds, mats.frond]],
      trees: (v) => [[trees[v].trunk, mats.trunk], [trees[v].leaves, mats.leaf]],
      bushes: (v) => [[bushes[v], mats.bush]],
      ferns: (v) => [[ferns[v], mats.fern]],
      rocks: (v) => [[rocks[v], mats.rock]],
    };
    const range = { palms: 260, trees: 240, bushes: 120, ferns: 70, rocks: 200 };

    const CELL = 64;
    const buckets = new Map();
    for (const type of Object.keys(parts)) {
      for (const p of world.props[type]) {
        const key = `${type}|${p.v}|${Math.floor(p.x / CELL)}|${Math.floor(p.z / CELL)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(p);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
    for (const [key, list] of buckets) {
      const [type, v, cx, cz] = key.split('|');
      for (const [geo, mat] of parts[type](+v)) {
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((p, i) => {
          q.setFromAxisAngle(UP, p.rot);
          if (type === 'rocks') s.set(p.s * 1.2, p.s, p.s * 0.95); else s.setScalar(p.s);
          m4.compose(t.set(p.x, p.y, p.z), q, s);
          im.setMatrixAt(i, m4);
        });
        im.computeBoundingSphere();
        im.matrixAutoUpdate = false;
        this.group.add(im);
        this.cells.push({ mesh: im, x: (+cx + 0.5) * CELL, z: (+cz + 0.5) * CELL, range: range[type] });
      }
    }
  }

  setDistanceScale(k) { this.distScale = k; }

  update(cam) {
    const k = this.distScale ?? 1;
    for (const c of this.cells) {
      const d = Math.hypot(c.x - cam.position.x, c.z - cam.position.z) - 46;
      c.mesh.visible = d < c.range * k;
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
  for (const p of world.props.palms) list.push({ x: p.x, z: p.z, r: 0.32 * p.s });
  for (const p of world.props.trees) list.push({ x: p.x, z: p.z, r: 0.35 * p.s });
  for (const p of world.props.rocks) if (p.y + p.s * 0.6 > world.heightAt(p.x, p.z) + 0.4) list.push({ x: p.x, z: p.z, r: 0.95 * p.s });
  return list;
}
