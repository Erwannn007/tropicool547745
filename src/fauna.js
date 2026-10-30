// Island wildlife: crabs scuttling sideways on the beaches, sea turtles
// crawling down to the lagoon, terns wheeling over the shore, macaws perched
// on the bushes, dolphins leaping offshore, morpho butterflies over the
// undergrowth. Which species live on an island comes from its seed (wild
// islands have more of them). Each species is a modelled pixel-art animal
// (parts with their own textures, models.js style), drawn as instanced
// meshes; legs, wings and tails are moved in the vertex shader by a part
// code in the colour attribute (0 body, 1 left, 2 right, 3 tail) and a
// per-instance animation (phase, amplitude, rest angle). They react to the
// player (crabs and turtles flee, macaws fly off) and report the first time
// the player gets a good look at them (hooks.seen).
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';
import { mulberry32 } from './noise.js';
import { lathe, tube, merge } from './models.js';
import { pixTex } from './axeModel.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(sx, sy, sz));

export const SPECIES = {
  crab: { name: 'Crabe de sable', icon: '🦀', where: 'Plages', sight: 9 },
  turtle: { name: 'Tortue verte', icon: '🐢', where: 'Plages et lagon', sight: 14 },
  tern: { name: 'Sterne blanche', icon: '🕊️', where: 'Au-dessus du rivage', sight: 35 },
  macaw: { name: 'Ara rouge', icon: '🦜', where: 'Buissons de l’intérieur', sight: 16 },
  dolphin: { name: 'Dauphin à long bec', icon: '🐬', where: 'Au large', sight: 80 },
  butterfly: { name: 'Morpho bleu', icon: '🦋', where: 'Sous-bois', sight: 7 },
};

// which species live here, and how many
export function islandFauna(cfg) {
  const r = mulberry32(cfg.seed + 31337), wild = !!cfg.wild, veg = cfg.vegetation ?? 0.75;
  const out = {};
  const roll = (id, p, a, b) => { if (r() < p) out[id] = a + Math.floor(r() * (b - a + 1)); };
  roll('crab', wild ? 0.85 : 0.7, 8, 18);
  roll('tern', 0.9, 4, 8);
  roll('butterfly', veg > 0.45 ? 0.75 : 0.25, 6, 12);
  roll('macaw', veg > 0.55 ? (wild ? 0.5 : 0.3) : 0.08, 3, 6);
  roll('turtle', wild ? 0.38 : 0.2, 2, 4);
  roll('dolphin', wild ? 0.42 : 0.25, 2, 4);
  return out;
}

// ---------------------------------------------------------------- models
const ramp = (g, pal, x, y, k) => { g.fillStyle = pal[Math.max(0, Math.min(pal.length - 1, Math.round(k)))]; g.fillRect(x, y, 1, 1); };
const tex = (w, h, paint) => pixTex(w, h, paint);
// tag every vertex of a geometry with its part (colour.r = part / 4)
const part = (g, k) => { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c[i * 3] = k / 4; g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
const ell = (rx, ry, rz, segs = 10, rings = 6) => { // an ellipsoid as a lathe
  const pts = []; for (let i = 0; i <= rings; i++) { const a = -Math.PI / 2 + Math.PI * i / rings; pts.push([Math.cos(a) * rx, Math.sin(a) * ry]); }
  const g = lathe(pts, segs); g.scale(1, 1, rz / rx); return g;
};
const CRAB = ['#6a1a10', '#8e2614', '#b4381a', '#d45224', '#ee7a3a', '#f8a868'];
const TURTLE_SHELL = ['#2a2614', '#3e381a', '#56501e', '#6e6826', '#8a8434', '#a8a24a'];
const TURTLE_SKIN = ['#3a4a2a', '#4e6234', '#647a40', '#7e9450', '#9cae6a'];
const TERN = ['#8c96a8', '#b4bccc', '#d6dce6', '#eef2f6', '#ffffff'];
const MACAW = { red: ['#6e1010', '#981818', '#c42420', '#e8402c', '#ff6a48'], yel: ['#c08a10', '#e8b420', '#ffd84a'], blu: ['#103a8a', '#1a58b8', '#2a7ae0', '#58a4f4'] };
const DOLPHIN = ['#2a3a52', '#3a4e6c', '#506886', '#6c86a2', '#9cb0c4', '#d8e0e8'];
const MORPHO = ['#0a1e5a', '#123a9a', '#1a62d8', '#3a94f4', '#7ec8ff', '#1a1210'];

function crabModel() {
  const t = tex(16, 16, (g, w, h) => { const r = mulberry32(1); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, CRAB, x, y, 1.5 + (h - y) / h * 3 + (r() - 0.5) * 1.2 - ((x * 3 + y) % 7 === 0 ? 1 : 0)); });
  const eye = tex(2, 2, (g) => { g.fillStyle = '#120c0a'; g.fillRect(0, 0, 2, 2); g.fillStyle = '#fff4e0'; g.fillRect(0, 0, 1, 1); });
  const body = part(ell(0.12, 0.05, 0.09, 10, 6).translate(0, 0.07, 0), 0);
  const list = [[body]];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { // three bent legs a side (the two sides step in turn)
    const z = -0.04 + i * 0.045, leg = tube((q) => V(s * (0.09 + q * 0.1), 0.07 + Math.sin(q * Math.PI) * 0.05 - q * 0.07, z + (i - 1) * q * 0.04), () => 0.011, { rings: 5, radial: 4 });
    list.push([part(leg, (i % 2 === 0) === (s > 0) ? 1 : 2)]);
  }
  // claws: the right one far bigger (a fiddler's claw, its signature)
  for (const s of [-1, 1]) {
    const big = s > 0 ? 1.7 : 1;
    const arm = tube((q) => V(s * (0.06 + q * 0.05), 0.08 + q * 0.02, 0.07 + q * 0.06), () => 0.014 * big, { rings: 3, radial: 4 });
    const claw = ell(0.035 * big, 0.022 * big, 0.05 * big, 8, 4).translate(s * 0.12, 0.1, 0.15 + 0.02 * big);
    list.push([part(arm, 0)], [part(claw, 0)]);
  }
  const stalks = merge([-1, 1].map((s) => [part(tube((q) => V(s * 0.03, 0.09 + q * 0.06, 0.07), () => 0.006, { rings: 2, radial: 4 }), 0)]));
  const eyes = merge([-1, 1].map((s) => [part(ell(0.012, 0.012, 0.012, 6, 3).translate(s * 0.03, 0.155, 0.07), 0)]));
  return { parts: [{ geo: merge([...list, [stalks]]), tex: t }, { geo: eyes, tex: eye }], mode: 1 };
}
function turtleModel() {
  // domed shell of scutes (hexagons with pale rims), olive skin with spots
  const shell = tex(32, 32, (g, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 8), fx = (x + (row % 2) * 4) % 8, fy = y % 8;
      const e = Math.min(fx, 7 - fx, fy, 7 - fy);
      ramp(g, TURTLE_SHELL, x, y, e === 0 ? 5 : e === 1 ? 1 : 2.6 + Math.sin(x * 0.8 + y) * 0.8);
    }
  });
  const skin = tex(16, 16, (g, w, h) => { const r = mulberry32(3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, TURTLE_SKIN, x, y, r() < 0.15 ? 4 : 1.6 + (r() - 0.5)); });
  const dome = ell(0.36, 0.17, 0.46, 14, 6).translate(0, 0.1, 0);
  const plastron = ell(0.33, 0.04, 0.42, 12, 3).translate(0, 0.09, 0);
  const head = merge([[tube((q) => V(0, 0.12 + q * 0.04, 0.4 + q * 0.14), () => 0.06, { rings: 3, radial: 8 })], [ell(0.07, 0.06, 0.09, 8, 4).translate(0, 0.17, 0.57)]]);
  const flip = (s, front, k) => part(ell(0.17, 0.02, 0.07, 8, 3).translate(s * 0.15, 0, 0).applyMatrix4(M(s * 0.25, 0.07, front ? 0.24 : -0.3, 0, s * (front ? -0.4 : 0.6), 0)), k);
  const flippers = merge([[flip(1, true, 1)], [flip(-1, true, 2)], [flip(1, false, 2)], [flip(-1, false, 1)]]);
  return { parts: [{ geo: part(dome, 0), tex: shell }, { geo: merge([[part(plastron, 0)], [part(head, 0)], [flippers]]), tex: skin }], mode: 1 };
}
function birdModel(pal, wing, span, seed) {
  // spindle body, round head, beak, tapered wings that flap from the shoulder
  const body = lathe([[0, -0.2], [0.04, -0.17], [0.065, -0.05], [0.06, 0.08], [0.045, 0.14], [0, 0.17]], 10);
  body.rotateX(Math.PI / 2);
  const head = ell(0.045, 0.045, 0.05, 8, 5).translate(0, 0.03, 0.18);
  const beak = lathe([[0.016, 0], [0.01, 0.04], [0, 0.07]], 6); beak.rotateX(Math.PI / 2); beak.translate(0, 0.025, 0.22);
  const tail = lathe([[0.03, 0], [0.05, 0.06], [0, 0.1]], 6); tail.rotateX(-Math.PI / 2); tail.scale(1.4, 0.3, 1); tail.translate(0, 0, -0.18);
  const w = (s, k) => {
    const g = lathe([[0, 0], [0.06, 0.02], [0.05, span * 0.6], [0.02, span]], 6);
    g.scale(0.15, 1, 1); g.rotateZ(-s * Math.PI / 2); // thin, its chord along the body g.translate(s * 0.03, 0.01, 0);
    return part(g, k);
  };
  const t = tex(16, 16, wing);
  const beakT = tex(2, 2, (g) => { g.fillStyle = pal; g.fillRect(0, 0, 2, 2); });
  return { parts: [{ geo: merge([[part(body, 0)], [part(head, 0)], [part(tail, 3)], [w(1, 1)], [w(-1, 2)]]), tex: t }, { geo: part(beak, 0), tex: beakT }], mode: 0 };
}
function dolphinModel() {
  const skin = tex(16, 32, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const belly = Math.abs(x - 8) > 5; ramp(g, DOLPHIN, x, y, belly ? 5 : 1.4 + y / h * 1.4 + (x === 2 || x === 13 ? 1 : 0)); } });
  const body = tube((q) => V(0, Math.sin(q * Math.PI) * 0.06, -0.9 + q * 1.9), (q) => 0.03 + Math.sin(Math.pow(q, 0.8) * Math.PI) * 0.22 * (q > 0.85 ? 0.7 : 1), { rings: 14, radial: 10, up: V(0, 1, 0) });
  const beak = lathe([[0.05, 0], [0.035, 0.14], [0, 0.18]], 8); beak.rotateX(Math.PI / 2); beak.translate(0, -0.03, 1.0);
  const fin = lathe([[0.1, 0], [0.04, 0.14], [0, 0.22]], 6); fin.scale(0.25, 1, 1); fin.rotateX(-0.6); fin.translate(0, 0.2, -0.05);
  const pect = (s) => { const g = ell(0.14, 0.015, 0.06, 6, 3); g.translate(s * 0.2, -0.1, 0.35); return part(g, 0); };
  const fluke = ell(0.26, 0.02, 0.09, 8, 3).translate(0, 0.05, -0.98);
  return { parts: [{ geo: merge([[part(body, 0)], [part(beak, 0)], [part(fin, 0)], [pect(1)], [pect(-1)], [part(fluke, 3)]]), tex: skin }], mode: 2 };
}
function butterflyModel() {
  const t = tex(16, 16, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 2, y - 8) / 14; ramp(g, MORPHO, x, y, d > 0.92 || (x > 12 && y % 4 === 0) ? 5 : 1 + (1 - d) * 3.6); } });
  const wing = (s, k) => {
    const g = ell(0.06, 0.004, 0.045, 8, 2);
    const g2 = ell(0.045, 0.004, 0.035, 8, 2).translate(0.01, 0, -0.055);
    const m = merge([[g.translate(0.065, 0, 0.02)], [g2.translate(0.035, 0, 0)]]);
    if (s < 0) m.scale(-1, 1, 1);
    const P = m.attributes.position, U = m.attributes.uv; // flat-mapped so the eye spots sit on the wing
    for (let i = 0; i < P.count; i++) U.setXY(i, Math.abs(P.getX(i)) / 0.13, (P.getZ(i) + 0.09) / 0.16);
    return part(m, k);
  };
  const body = part(ell(0.008, 0.008, 0.05, 6, 3), 0);
  return { parts: [{ geo: merge([[body], [wing(1, 1)], [wing(-1, 2)]]), tex: t }], mode: 0 };
}

// banded world lighting (dress.js) + the animation of the parts
function animalMaterial(map, mode) {
  return makeMaterial({
    side: THREE.DoubleSide,
    defines: { MODE: mode },
    uniforms: { uMap: { value: map } },
    vertex: /* glsl */`
      attribute vec3 color;
      attribute vec3 iAnim; // phase, amplitude, rest angle
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec3 p = position, nn = normal;
        float part = floor(color.r * 4.0 + 0.5);
        #if MODE == 0
          if (part == 1.0 || part == 2.0) { // wings: up and down about the body
            float side = part == 1.0 ? 1.0 : -1.0;
            float a = side * (iAnim.z + sin(iAnim.x) * iAnim.y), c = cos(a), s = sin(a);
            p.xy = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
            nn.xy = vec2(nn.x * c - nn.y * s, nn.x * s + nn.y * c);
          }
        #elif MODE == 1
          if (part == 1.0 || part == 2.0) { // legs stepping in turn
            float ph = iAnim.x + (part == 1.0 ? 0.0 : 3.14159);
            p.y += max(0.0, sin(ph)) * iAnim.y;
            p.z += cos(ph) * iAnim.y * 0.8;
          }
        #endif
        if (part == 3.0) p.y += sin(iAnim.x) * iAnim.y * 0.6 * max(0.0, -p.z - 0.05) * 3.0; // tail beats
        mat4 mm = modelMatrix * instanceMatrix;
        vec4 w = mm * vec4(p, 1.0);
        vUv = uv; vN = normalize(mat3(mm) * nn); vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragment: /* glsl */`
      uniform sampler2D uMap;
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec3 tex = texture2D(uMap, vUv).rgb;
        vec3 n = normalize(gl_FrontFacing ? vN : -vN);
        vec4 d = worldData(vWorld.xz);
        float shadow = 1.0 - d.b * 0.5 * uShade * (1.0 - smoothstep(0.5, 2.5, vWorld.y - d.r));
        float ndl = clamp(dot(n, uSunDir) * 0.85 + 0.15, 0.0, 1.0);
        ndl = ndl > 0.66 ? 1.0 : ndl > 0.33 ? 0.68 : ndl > 0.08 ? 0.4 : 0.15;
        vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
        vec3 col = tex * (amb * 0.62 + uSunColor * ndl * 0.8 * shadow + pointLights(vWorld, n));
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

// one species drawn: an instanced mesh per textured part, sharing matrices
class Herd {
  constructor(scene, model, n) {
    this.n = n; this.meshes = []; this.mats = [];
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    for (const p of model.parts) {
      const geo = p.geo.clone();
      geo.setAttribute('iAnim', this.anim);
      const mat = animalMaterial(p.tex, model.mode);
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      this.meshes.push(m); this.mats.push(mat);
    }
  }
  set(i, m4, phase, amp, rest = 0) {
    for (const m of this.meshes) m.setMatrixAt(i, m4);
    this.anim.setXYZ(i, phase, amp, rest);
  }
  flush() { for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; this.anim.needsUpdate = true; }
  dispose() { for (const m of this.meshes) { m.removeFromParent(); m.geometry.dispose(); m.dispose(); } this.mats.forEach((m) => m.dispose()); }
}

const MODELS = { crab: crabModel, turtle: turtleModel, dolphin: dolphinModel, butterfly: butterflyModel,
  tern: () => birdModel('#f08a24', (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp(g, TERN, x, y, y > 13 && x > 8 ? 0 : 2.6 + (y < 4 ? 1.2 : 0) + ((x + y) % 5 === 0 ? -0.6 : 0)); }, 0.42),
  macaw: () => birdModel('#e8dcbc', (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = y / h; if (v > 0.8) ramp(g, MACAW.blu, x, y, 1 + (x % 3)); else if (v > 0.62) ramp(g, MACAW.yel, x, y, 1 + (x % 2)); else ramp(g, MACAW.red, x, y, 1.6 + (x + y) % 3); } }, 0.3),
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const pose = (x, y, z, yaw, pitch = 0, roll = 0, s = 1) => _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll)), _s.set(s, s, s));

export class Fauna {
  constructor(scene, hooks) {
    this.scene = scene; this.hooks = hooks;
    this.herds = {}; this.animals = []; this.seen = new Set();
  }

  setWorld(world, player) {
    for (const h of Object.values(this.herds)) h.dispose();
    this.herds = {}; this.animals = []; this.seen = new Set();
    this.world = world; this.player = player;
    const r = mulberry32(world.cfg.seed + 777), H = world.heightAt;
    this.census = islandFauna(world.cfg);
    // points of a kind of ground, found by sampling the islands
    const sample = (ok, tries = 900) => {
      for (let t = 0; t < tries; t++) {
        const isl = world.islands[Math.floor(r() * world.islands.length)], a = r() * Math.PI * 2, d = r() * isl.r * 1.35;
        const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
        if (ok(H(x, z), x, z)) return { x, z, isl };
      }
      return null;
    };
    const add = (kind, a) => { a.kind = kind; a.i = this.animals.filter((b) => b.kind === kind).length; a.ph = r() * 6.28; this.animals.push(a); };
    for (const [kind, n] of Object.entries(this.census)) {
      for (let k = 0; k < n; k++) {
        if (kind === 'crab') { const s = sample((h) => h > 0.08 && h < 0.85); if (s) add(kind, { x: s.x, z: s.z, yaw: r() * 6.28, t: r() * 3, mode: 'idle', s: 0.8 + r() * 0.5 }); }
        if (kind === 'turtle') { const s = sample((h) => h > 0.05 && h < 0.7); if (s) add(kind, { x: s.x, z: s.z, hx: s.x, hz: s.z, yaw: r() * 6.28, t: r() * 5, mode: 'idle', s: 0.9 + r() * 0.3 }); }
        if (kind === 'tern') { const s = sample((h) => h > -0.5 && h < 0.6); if (s) add(kind, { cx: s.x, cz: s.z, R: 10 + r() * 22, h: 8 + r() * 10, w: (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.2), a: r() * 6.28, s: 1 }); }
        if (kind === 'butterfly') { const b = world.props.bushes[Math.floor(r() * world.props.bushes.length)]; if (b && !b.gone) add(kind, { hx: b.x, hz: b.z, x: b.x, z: b.z, y: b.y + 1, vx: 0, vz: 0, vy: 0, s: 1 + r() * 0.4 }); }
        if (kind === 'macaw') { const p = this.perch(r); if (p) add(kind, { ...p, mode: 'perch', yaw: r() * 6.28, s: 1.7 }); }
      }
      if (kind === 'dolphin') { // one pod cruising round the archipelago offshore
        const c = world.islands[0], R = Math.max(...world.islands.map((i) => Math.hypot(i.x - c.x, i.z - c.z) + i.r)) + 30;
        const deep = [...Array(24)].some((_, k) => H(c.x + Math.cos(k / 24 * 6.28) * R, c.z + Math.sin(k / 24 * 6.28) * R) < -5);
        if (deep) for (let k = 0; k < n; k++) add(kind, { cx: c.x, cz: c.z, R: R + (r() - 0.5) * 8, a: k * 0.06 + r() * 0.05, w: 0.035, jump: -1, next: 2 + r() * 6, s: 1 + r() * 0.2 });
      }
    }
    for (const kind of Object.keys(this.census)) {
      const n = this.animals.filter((a) => a.kind === kind).length;
      if (n) this.herds[kind] = new Herd(this.scene, MODELS[kind](), n);
    }
  }

  // somewhere on top of a bush to sit
  perch(r) {
    const list = this.world.props.bushes;
    for (let t = 0; t < 20; t++) {
      const b = list[Math.floor(r() * list.length)];
      if (b && !b.gone) return { x: b.x, z: b.z, y: b.y + 1.5 * b.s, bush: b };
    }
    return null;
  }

  update(dt, camera) {
    if (!this.world) return;
    const H = this.world.heightAt, P = this.player.pos, cam = camera.position;
    const fwd = camera.getWorldDirection(_p.clone());
    for (const a of this.animals) {
      const herd = this.herds[a.kind];
      const far = Math.hypot((a.x ?? a.cx) - cam.x, (a.z ?? a.cz) - cam.z);
      if (a.kind !== 'dolphin' && a.kind !== 'tern' && far > 110) { herd.set(a.i, HIDE, 0, 0); continue; }
      const dp = a.x != null ? Math.hypot(a.x - P.x, a.z - P.z) : 99;
      this['step_' + a.kind](a, dt, H, dp, P);
      herd.set(a.i, _m, a.ph, a.amp ?? 0, a.rest ?? 0);
      // a good look: close enough, in front of the camera
      if (!this.seen.has(a.kind) && a.wx != null) {
        const dx = a.wx - cam.x, dy = a.wy - cam.y, dz = a.wz - cam.z, d = Math.hypot(dx, dy, dz);
        if (d < SPECIES[a.kind].sight && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d > 0.8) { this.seen.add(a.kind); this.hooks.seen?.(a.kind); }
      }
    }
    for (const h of Object.values(this.herds)) h.flush();
  }

  // sideways in short dashes; away from the player, fast
  step_crab(a, dt, H, dp, P) {
    a.t -= dt;
    if (dp < 4 && a.mode !== 'flee') { a.mode = 'flee'; a.t = 1.2 + Math.random(); a.dir = Math.sign((a.x - P.x) * Math.cos(a.yaw) - (a.z - P.z) * Math.sin(a.yaw)) || 1; this.hooks.sound?.('crab', a); }
    if (a.t <= 0) {
      if (a.mode === 'idle') { a.mode = 'walk'; a.t = 0.6 + Math.random() * 1.4; a.dir = Math.random() < 0.5 ? -1 : 1; } else { a.mode = 'idle'; a.t = 1 + Math.random() * 3; if (Math.random() < 0.3) a.yaw += (Math.random() - 0.5) * 1.5; }
    }
    const sp = a.mode === 'flee' ? 2.6 : a.mode === 'walk' ? 0.7 : 0;
    if (sp) {
      const nx = a.x + Math.cos(a.yaw) * a.dir * sp * dt, nz = a.z - Math.sin(a.yaw) * a.dir * sp * dt, h = H(nx, nz);
      if (h > 0.02 && h < 1.1) { a.x = nx; a.z = nz; } else { a.dir *= -1; if (a.mode === 'flee') a.yaw += 0.8; }
      a.ph += dt * sp * 34;
    }
    a.amp = sp ? 0.018 * a.s : 0;
    const y = H(a.x, a.z) - 0.01;
    pose(a.x, y, a.z, a.yaw, 0, 0, a.s);
    a.wx = a.x; a.wy = y + 0.1; a.wz = a.z;
  }

  // a slow crawl about its beach; goes to the water when disturbed, swims
  // a while just under the surface and comes back
  step_turtle(a, dt, H, dp, P) {
    a.t -= dt;
    const h = H(a.x, a.z);
    if (dp < 3.5 && a.mode !== 'sea') { a.mode = 'sea'; a.t = 14 + Math.random() * 10; }
    if (a.t <= 0) {
      if (a.mode === 'sea') { a.mode = 'home'; a.t = 40; } else if (a.mode === 'idle') { a.mode = 'walk'; a.t = 3 + Math.random() * 4; a.yaw += (Math.random() - 0.5) * 1.6; } else { a.mode = 'idle'; a.t = 3 + Math.random() * 5; }
    }
    let tx = null, tz = null;
    if (a.mode === 'sea') { // straight downhill to the lagoon
      const e = 2; const gx = H(a.x - e, a.z) - H(a.x + e, a.z), gz = H(a.x, a.z - e) - H(a.x, a.z + e);
      if (h > -1.2) { tx = a.x + gx * 10; tz = a.z + gz * 10; }
    } else if (a.mode === 'home') { tx = a.hx; tz = a.hz; if (Math.hypot(a.x - a.hx, a.z - a.hz) < 1) { a.mode = 'idle'; a.t = 5; } }
    if (tx != null) a.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, (((Math.atan2(tx - a.x, tz - a.z) - a.yaw) % 6.283) + 9.42) % 6.283 - 3.14));
    const swim = h < -0.3, sp = a.mode === 'idle' ? 0 : swim ? 0.9 : 0.28;
    if (sp) { a.x += Math.sin(a.yaw) * sp * dt; a.z += Math.cos(a.yaw) * sp * dt; a.ph += dt * (swim ? 3 : 5); }
    a.amp = sp ? (swim ? 0.05 : 0.03) : 0;
    const y = swim ? -0.42 + Math.sin(a.ph * 0.5) * 0.03 : H(a.x, a.z) - 0.02;
    pose(a.x, y, a.z, a.yaw, 0, 0, a.s);
    a.wx = a.x; a.wy = y + 0.15; a.wz = a.z;
  }

  // wheeling over the shore, flapping then gliding, banked into the turn
  step_tern(a, dt) {
    a.a += a.w * dt;
    a.ph += dt * 11;
    const glide = Math.sin(a.a * 3 + a.cx) > 0.2;
    a.amp = glide ? 0.05 : 0.7; a.rest = glide ? 0.05 : 0.1;
    const x = a.cx + Math.cos(a.a) * a.R, z = a.cz + Math.sin(a.a) * a.R, y = a.h + Math.sin(a.a * 2) * 1.5;
    const yaw = Math.atan2(-Math.sin(a.a) * a.w, Math.cos(a.a) * a.w);
    pose(x, y, z, yaw, 0, -Math.sign(a.w) * 0.35, 1.2);
    a.wx = x; a.wy = y; a.wz = z;
  }

  // sits on a bush; flies off squawking when the player comes near or the
  // bush is cut down, and lands on another one
  step_macaw(a, dt, H, dp) {
    if (a.mode === 'perch') {
      a.ph += dt * 2; a.amp = 0; a.rest = -1.25; // wings folded
      if (dp < 6 || a.bush?.gone) {
        const to = this.perch(Math.random);
        if (to) { a.mode = 'fly'; a.from = { x: a.x, y: a.y, z: a.z }; a.to = to; a.t = 0; a.dur = Math.max(2.5, Math.hypot(to.x - a.x, to.z - a.z) / 7); this.hooks.sound?.('macaw', a); }
      }
      if (Math.random() < dt * 0.15) a.yaw += (Math.random() - 0.5) * 1.2;
      pose(a.x, a.y, a.z, a.yaw, 0, 0, a.s);
    } else {
      a.t += dt / a.dur;
      const k = Math.min(1, a.t), f = a.from, to = a.to;
      a.x = f.x + (to.x - f.x) * k; a.z = f.z + (to.z - f.z) * k;
      a.y = f.y + (to.y - f.y) * k + Math.sin(k * Math.PI) * (6 + a.dur);
      a.yaw = Math.atan2(to.x - f.x, to.z - f.z);
      a.ph += dt * 16; a.amp = 0.75; a.rest = 0.1;
      pose(a.x, a.y, a.z, a.yaw, -Math.cos(k * Math.PI) * 0.4, 0, a.s);
      if (k >= 1) { a.mode = 'perch'; a.bush = to.bush; }
    }
    a.wx = a.x; a.wy = a.y; a.wz = a.z;
  }

  // a pod running round the archipelago: under water, then a leap
  step_dolphin(a, dt) {
    a.a += a.w * dt;
    const x = a.cx + Math.cos(a.a) * a.R, z = a.cz + Math.sin(a.a) * a.R;
    const yaw = Math.atan2(-Math.sin(a.a), Math.cos(a.a));
    let y = -1.6, pitch = 0;
    a.ph += dt * 9; a.amp = 0.25;
    if (a.jump < 0) {
      if ((a.next -= dt) < 0) { a.jump = 0; this.hooks.splash?.(V(x, 0, z), 0.9); }
    } else {
      a.jump += dt / 1.3;
      const k = a.jump;
      y = -1.2 + Math.sin(k * Math.PI) * 3.1;
      pitch = -Math.cos(k * Math.PI) * 0.9;
      if (k >= 1) { a.jump = -1; a.next = 3 + Math.random() * 7; this.hooks.splash?.(V(x, 0, z), 1.2); }
    }
    pose(x, y, z, yaw, pitch, 0, a.s * 1.3);
    a.wx = x; a.wy = y; a.wz = z;
    if (y < -1) a.wx = null; // (only seen above the water)
  }

  // fluttering about its bush, a zig-zag that never strays far
  step_butterfly(a, dt, H) {
    a.vx += (Math.random() - 0.5) * 9 * dt + (a.hx - a.x) * 0.6 * dt;
    a.vz += (Math.random() - 0.5) * 9 * dt + (a.hz - a.z) * 0.6 * dt;
    a.vy += (Math.random() - 0.5) * 6 * dt + (H(a.x, a.z) + 1.1 - a.y) * 0.8 * dt;
    const k = Math.exp(-1.5 * dt); a.vx *= k; a.vz *= k; a.vy *= k;
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    a.y = Math.max(a.y, H(a.x, a.z) + 0.3);
    a.ph += dt * 28; a.amp = 0.9; a.rest = 0.3;
    pose(a.x, a.y + Math.sin(a.ph * 0.2) * 0.05, a.z, Math.atan2(a.vx, a.vz), 0, 0, a.s * 1.4);
    a.wx = a.x; a.wy = a.y; a.wz = a.z;
  }

  dispose() { for (const h of Object.values(this.herds)) h.dispose(); this.herds = {}; this.animals = []; }
}
