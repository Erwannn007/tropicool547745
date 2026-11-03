// The reef: life on the lagoon floor, seen from the pier through clear water
// and all around you when you dive (diving.js). Brain corals, staghorn
// thickets with pale growing tips, table corals, sea fans of lace, tube
// sponges, anemones with their clownfish, seagrass meadows, starfish and
// urchins on the sand; schools of reef fish that wheel around and scatter
// when you swim at them; giant clams that open and close, some with a pearl.
//
// Everything static is modelled once in a few seeded variants, then copied,
// turned, scaled and recoloured into one merged mesh per 32 m cell (one draw
// call per cell, culled by distance and frustum). The vertex shader makes the
// soft parts sway in the swell (aSway); the fragment shader reads a small
// grey pixel atlas (one 16 px tile per surface: brain maze, polyps, plates,
// lace, pores, veins…) and maps it onto the colour of each coral, cooler in
// the shade, warmer in the light, with the dancing caustics of the surface.
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';
import { lathe, tube, MODELS, fishModelFor } from './models.js';
import { worldMat, dress } from './dress.js';
import { pixTex } from './axeModel.js';
import { mulberry32, makeSimplex } from './noise.js';
import { SPECIES } from './fishing.js';
import { getW, setW } from './store.js';
import { worldKey } from './axe.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CELL = 32;
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ---------------------------------------------------------------- atlas
// 4 x 4 tiles of 16 px, grey levels in flat bands (the colour comes from the
// coral), alpha 0 = a hole (sea fan lace)
const TILE = { brain: 0, polyp: 1, plate: 2, lace: 3, pores: 4, smooth: 5, blade: 6, bumps: 7, mantle: 8, sand: 9 };
function atlas() {
  return pixTex(64, 64, (g) => {
    const put = (t, x, y, v, a = 1) => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); g.fillStyle = `rgba(${c},${c},${c},${a})`; g.fillRect((t % 4) * 16 + x, Math.floor(t / 4) * 16 + y, 1, 1); };
    const band = (v) => (v > 0.8 ? 1 : v > 0.6 ? 0.8 : v > 0.38 ? 0.62 : 0.45);
    const r = mulberry32(5150);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      // brain coral: winding ridges and grooves
      const m = Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2.2) + Math.sin(y * 0.8 + Math.cos(x * 0.5) * 1.8);
      put(TILE.brain, x, y, Math.abs(m) < 0.45 ? 0.38 : band(0.65 + m * 0.18));
      // polyps: a lit dot on each little cup
      const px = x % 4, py = (y + (Math.floor(x / 4) % 2) * 2) % 4;
      put(TILE.polyp, x, y, px === 1 && py === 1 ? 1 : px === 2 && py === 2 ? 0.45 : band(0.7 + (r() - 0.5) * 0.25));
      // table coral: rings of growth and radial ribs
      put(TILE.plate, x, y, y % 4 === 0 ? 0.45 : x % 3 === 0 ? 0.62 : 0.85);
      // sea fan: a net of branches, holes between
      const lx = (x + Math.floor(y / 3)) % 4, ly = y % 3;
      const hole = lx !== 0 && ly !== 0 && !(x % 8 === 3);
      put(TILE.lace, x, y, hole ? 0 : band(0.75 + (r() - 0.5) * 0.3), hole ? 0 : 1);
      // sponge pores
      put(TILE.pores, x, y, (x * 7 + y * 5) % 9 === 0 ? 0.38 : (x * 7 + y * 5) % 9 === 1 ? 0.95 : band(0.68 + (r() - 0.5) * 0.25));
      // smooth flesh, a soft band of light
      put(TILE.smooth, x, y, band(0.6 + y / 40 + (r() - 0.5) * 0.12));
      // blade: a midrib and fine veins
      put(TILE.blade, x, y, x === 7 || x === 8 ? 0.95 : x % 5 === 0 ? 0.6 : 0.78);
      // starfish: bumps in rows
      put(TILE.bumps, x, y, (x % 3 === 1 && y % 3 === 1) ? 1 : band(0.62 + (r() - 0.5) * 0.2));
      // clam mantle: wavy iridescent stripes and eye spots
      const w = Math.sin(x * 0.8 + Math.sin(y * 0.6) * 1.5);
      put(TILE.mantle, x, y, (x * 3 + y * 7) % 13 === 0 ? 1 : band(0.7 + w * 0.25));
      // shell: ridges
      put(TILE.sand, x, y, x % 4 === 0 ? 0.45 : x % 4 === 1 ? 1 : 0.78);
    }
  });
}

// ---------------------------------------------------------------- parts
// a part: arrays in its own space, plus per vertex the brightness (f), how
// much of the tip colour (t) and how much it sways (s)
function part(g, tile, { f = () => 1, t = () => 0, s = () => 0 } = {}) {
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  const n = P.count, out = { pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), uv: new Float32Array(n * 2), f: new Float32Array(n), t: new Float32Array(n), s: new Float32Array(n), tile, idx: null };
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.set(P.getX(i), P.getY(i), P.getZ(i));
    out.pos.set([p.x, p.y, p.z], i * 3);
    out.nor.set([N.getX(i), N.getY(i), N.getZ(i)], i * 3);
    out.uv.set([U ? U.getX(i) : 0, U ? U.getY(i) : 0], i * 2);
    out.f[i] = f(p); out.t[i] = t(p); out.s[i] = s(p);
  }
  out.idx = g.index ? Array.from(g.index.array) : Array.from({ length: n }, (_, i) => i);
  return out;
}
const join = (...parts) => parts.flat();

// brain coral: a lumpy dome
function brainCoral(r, seed) {
  const sx = makeSimplex(seed), pts = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI / 2; pts.push([Math.cos(a) * 1.05, Math.sin(a) * 0.72]); }
  pts.unshift([0.9, -0.08]);
  const g = lathe(pts, 16, 5);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 1 + sx.noise(x * 1.6, z * 1.6 + y) * 0.16;
    P.setXYZ(i, x * r * k, y * r * k, z * r * k);
  }
  { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setY(i, U.getY(i) * 3); }
  g.computeVertexNormals();
  return [part(g, TILE.brain, { f: (p) => 0.85 + p.y / r * 0.25 })];
}
// staghorn: forking branches, pale at the growing tips (signature)
function staghorn(h, seed) {
  const rnd = mulberry32(seed), parts = [];
  const branch = (a, dir, len, rad, depth) => {
    const bend = V((rnd() - 0.5) * 0.3, 0.15, (rnd() - 0.5) * 0.3);
    const b = a.clone().addScaledVector(dir, len);
    const c = (t) => a.clone().lerp(b, t).addScaledVector(bend, Math.sin(t * Math.PI) * len * 0.3);
    const g = tube(c, (t) => rad * (1 - t * 0.35), { rings: 3, radial: 5, vRep: len * 6, up: Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0) });
    const tip = depth === 0;
    parts.push(part(g, TILE.polyp, { f: (p) => 0.75 + p.y / h * 0.35, t: (p) => (tip ? Math.max(0, (p.distanceTo(a) / len - 0.55) / 0.45) : 0), s: (p) => p.y / h * 0.25 }));
    if (depth > 0) {
      const n = 2 + (rnd() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const ang = rnd() * Math.PI * 2, d = dir.clone().add(V(Math.cos(ang) * 0.7, 0.2, Math.sin(ang) * 0.7)).normalize();
        branch(b, d, len * (0.6 + rnd() * 0.25), rad * 0.72, depth - 1);
      }
    }
  };
  const n = 3 + Math.floor(rnd() * 2);
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + rnd(), d = V(Math.cos(ang) * 0.45, 1, Math.sin(ang) * 0.45).normalize();
    branch(V(0, -0.04, 0), d, h * 0.55, 0.045, 1);
  }
  return parts;
}
// table coral: a stout stem and a wide plate with a lifted rim
function tableCoral(r, seed) {
  const rnd = mulberry32(seed);
  const stem = lathe([[0, 0], [0.12, 0], [0.08, 0.15], [0.07, 0.3], [0.12, 0.36], [0, 0.36]], 8, 2);
  const tiers = [];
  const plate = (y, rr) => lathe([[0, y], [rr * 0.5, y + 0.02], [rr * 0.95, y + 0.05], [rr, y + 0.09], [rr * 0.97, y + 0.11], [rr * 0.5, y + 0.07], [0, y + 0.06]], 18, 6);
  tiers.push(part(plate(0.34, r), TILE.plate, { f: (p) => (p.y > 0.4 ? 1.05 : 0.7) }));
  if (rnd() < 0.6) tiers.push(part(plate(0.48, r * 0.55).translate(r * 0.2, 0, 0), TILE.plate, { f: (p) => (p.y > 0.55 ? 1.05 : 0.7) }));
  return [part(stem, TILE.polyp, { f: () => 0.7 }), ...tiers];
}
// sea fan: a lacy fan on a short stalk, gently curved, it bends in the swell
function seaFan(h, seed) {
  const rnd = mulberry32(seed), w = h * (0.7 + rnd() * 0.3);
  const sh = new THREE.Shape();
  sh.moveTo(-0.03, 0);
  sh.bezierCurveTo(-w * 0.6, h * 0.25, -w * 0.62, h * 0.9, 0, h);
  sh.bezierCurveTo(w * 0.62, h * 0.9, w * 0.6, h * 0.25, 0.03, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false, curveSegments: 10 });
  const P = g.attributes.position, U = g.attributes.uv;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i); P.setZ(i, P.getZ(i) - 0.006 + x * x * 0.4); U.setXY(i, P.getX(i) * 6, P.getY(i) * 6); }
  g.computeVertexNormals();
  return [part(g, TILE.lace, { f: (p) => 0.8 + p.y / h * 0.3, t: (p) => Math.max(0, p.y / h - 0.75) * 2, s: (p) => p.y / h * 0.9 })];
}
// tube sponges: hollow chimneys in a bunch, dark inside
function tubeSponges(h, seed) {
  const rnd = mulberry32(seed), parts = [], n = 3 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) {
    const r = 0.05 + rnd() * 0.05, hh = h * (0.5 + rnd() * 0.5), a = rnd() * Math.PI * 2, d = k ? 0.08 + rnd() * 0.1 : 0;
    const g = lathe([[0, 0], [r * 1.1, 0], [r, hh * 0.3], [r * 1.05, hh * 0.85], [r * 1.18, hh], [r * 0.85, hh * 1.01], [r * 0.8, hh * 0.6], [0, hh * 0.6]], 9, 2);
    g.translate(Math.cos(a) * d, -0.03, Math.sin(a) * d);
    { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setY(i, U.getY(i) * hh * 5); }
    parts.push(part(g, TILE.pores, { f: (p) => (Math.hypot(p.x - Math.cos(a) * d, p.z - Math.sin(a) * d) < r * 0.9 && p.y > hh * 0.55 ? 0.3 : 0.8 + p.y / hh * 0.25), s: (p) => p.y / h * 0.08 }));
  }
  return parts;
}
// anemone: a squat column and a crown of swaying tentacles with bright tips
export const ANEMONE_H = 0.16;
function anemone(seed) {
  const rnd = mulberry32(seed), parts = [];
  const body = lathe([[0, 0], [0.16, 0], [0.13, 0.08], [0.15, ANEMONE_H], [0, ANEMONE_H]], 12, 3);
  parts.push(part(body, TILE.smooth, { f: () => 0.75 }));
  for (let k = 0; k < 22; k++) {
    const a = rnd() * Math.PI * 2, rr = 0.03 + Math.sqrt(rnd()) * 0.11, len = 0.12 + rnd() * 0.1;
    const o = V(Math.cos(a) * rr, ANEMONE_H, Math.sin(a) * rr), out = V(Math.cos(a), 0, Math.sin(a));
    const c = (t) => o.clone().addScaledVector(out, t * len * 0.7 * (rr / 0.14)).add(V(0, Math.sin(t * 1.6) * len, 0));
    parts.push(part(tube(c, (t) => 0.016 * (1 - t * 0.5), { rings: 3, radial: 3, up: V(0, 0, 1) }), TILE.smooth, { f: () => 1, t: (p) => Math.max(0, (p.y - ANEMONE_H) / len - 0.55) * 2.2, s: (p) => Math.max(0, p.y - ANEMONE_H) * 5 }));
  }
  return parts;
}
// seagrass: ribbons in a clump
function seagrass(h, seed) {
  const rnd = mulberry32(seed), parts = [], n = 5 + Math.floor(rnd() * 3);
  const flat = (a) => { const c = Math.cos(a), s = Math.sin(a); return [Math.sign(c) * Math.pow(Math.abs(c), 0.4) * 2.4, Math.sign(s) * Math.pow(Math.abs(s), 0.4) * 0.35]; };
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, len = h * (0.5 + rnd() * 0.5), lean = 0.15 + rnd() * 0.3, o = V(Math.cos(a) * 0.06 * rnd(), -0.02, Math.sin(a) * 0.06 * rnd());
    const c = (t) => o.clone().add(V(Math.cos(a) * lean * t * t * len, t * len, Math.sin(a) * lean * t * t * len));
    parts.push(part(tube(c, (t) => 0.014 * (1 - t * 0.6), { rings: 4, radial: 4, section: flat, up: V(Math.cos(a), 0, Math.sin(a)), vRep: 2 }), TILE.blade, { f: (p) => 0.7 + p.y / h * 0.4, s: (p) => Math.pow(Math.max(0, p.y) / h, 1.3) * 1.6 }));
  }
  return parts;
}
// starfish: five plump arms lying on the sand
function starfish(r) {
  const sh = new THREE.Shape();
  for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2, rr = k % 2 ? r * 0.38 : r; const fn = k ? 'lineTo' : 'moveTo'; sh[fn](Math.cos(a) * rr, Math.sin(a) * rr); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  const U = g.attributes.uv, P = g.attributes.position; for (let i = 0; i < U.count; i++) U.setXY(i, P.getX(i) * 10, P.getZ(i) * 10);
  g.computeVertexNormals();
  return [part(g, TILE.bumps, { f: (p) => (p.y > 0.02 ? 1.05 : 0.7) })];
}
// urchin: a dark ball bristling with spines
function urchin(seed) {
  const rnd = mulberry32(seed), parts = [];
  const ball = lathe([[0, 0], [0.05, 0.01], [0.065, 0.045], [0.05, 0.08], [0, 0.09]], 8);
  parts.push(part(ball, TILE.smooth, { f: () => 0.8 }));
  for (let k = 0; k < 14; k++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, d = V(Math.sqrt(1 - u * u) * Math.cos(a), Math.abs(u) * 0.9 + 0.1, Math.sqrt(1 - u * u) * Math.sin(a)).normalize();
    const o = V(0, 0.045, 0).addScaledVector(d, 0.05);
    const len = 0.1 + rnd() * 0.06;
    parts.push(part(tube((t) => o.clone().addScaledVector(d, t * len), (t) => 0.006 * (1 - t), { rings: 1, radial: 3, up: Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0) }), TILE.smooth, { f: () => 1, t: (p) => Math.max(0, p.distanceTo(o) / len - 0.6) * 2, s: (p) => 0.04 }));
  }
  return parts;
}

// colours: [base, tip] per kind, a few picked per coral
const PAL = {
  brain: [['#b89a3c', '#e8d070'], ['#7c9a3a', '#c8e070'], ['#a8688a', '#f0a8c8'], ['#c8844a', '#f8c088'], ['#5a8a78', '#a8e0c8']],
  staghorn: [['#d85a92', '#fff0f6'], ['#8a52c8', '#f0e0ff'], ['#e8803a', '#fff2d8'], ['#4a90d8', '#e0f4ff'], ['#c8b048', '#fffbd8']],
  table: [['#3e8a7c', '#a0e8d0'], ['#8e7444', '#e8d090'], ['#6a5aa0', '#c8b8f0']],
  fan: [['#9a38b8', '#f088ff'], ['#d0402a', '#ffa070'], ['#e8b030', '#fff090'], ['#e85a8a', '#ffc0d8']],
  sponge: [['#f0762a', '#ffc070'], ['#8a48b8', '#d8a0ff'], ['#e8c03a', '#fff090'], ['#3a8ad0', '#a0e0ff']],
  anemone: [['#c85a5a', '#c8f070'], ['#b86a3a', '#f8a0e0'], ['#7a5a9a', '#80f0e0']],
  grass: [['#3a8a2a', '#9ae070'], ['#4a9a3a', '#c8e888'], ['#2e7a40', '#8ad890']],
  star: [['#e0502a', '#ffd070'], ['#3a68e0', '#a0c8ff'], ['#e8862a', '#fff0a0'], ['#c8304a', '#ff9aa0']],
  urchin: [['#2a1838', '#8a5ac0'], ['#1e1428', '#e05a5a']],
};
const KINDS = {
  brain: { make: (s) => brainCoral(0.3 + (s % 5) * 0.08, s), variants: 4, pal: PAL.brain },
  staghorn: { make: (s) => staghorn(0.55 + (s % 4) * 0.12, s), variants: 4, pal: PAL.staghorn },
  table: { make: (s) => tableCoral(0.45 + (s % 4) * 0.12, s), variants: 3, pal: PAL.table },
  fan: { make: (s) => seaFan(0.5 + (s % 3) * 0.18, s), variants: 3, pal: PAL.fan },
  sponge: { make: (s) => tubeSponges(0.45 + (s % 3) * 0.15, s), variants: 3, pal: PAL.sponge },
  anemone: { make: (s) => anemone(s), variants: 2, pal: PAL.anemone },
  grass: { make: (s) => seagrass(0.45 + (s % 4) * 0.15, s), variants: 4, pal: PAL.grass },
  star: { make: (s) => starfish(0.09 + (s % 3) * 0.03), variants: 3, pal: PAL.star },
  urchin: { make: (s) => urchin(s), variants: 2, pal: PAL.urchin },
};

// ---------------------------------------------------------------- material
function reefMaterial(map) {
  return makeMaterial({
    side: THREE.DoubleSide,
    uniforms: { uAtlas: { value: map } },
    vertex: /* glsl */`
      attribute vec3 color; attribute vec2 aTile; attribute float aSway;
      varying vec2 vUv; varying vec2 vTile; varying vec3 vN; varying vec3 vWorld; varying vec3 vCol;
      void main() {
        vec3 p = position;
        // the swell: a slow surge back and forth, a quicker shiver on top
        float ph = p.x * 0.35 + p.z * 0.25;
        p.x += (sin(uTime * 1.1 + ph) * 0.07 + sin(uTime * 2.7 + ph * 3.0) * 0.015) * aSway;
        p.z += (cos(uTime * 0.9 + ph * 1.3) * 0.05) * aSway;
        vUv = uv; vTile = aTile; vN = normal; vWorld = p; vCol = color;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragment: /* glsl */`
      uniform sampler2D uAtlas;
      varying vec2 vUv; varying vec2 vTile; varying vec3 vN; varying vec3 vWorld; varying vec3 vCol;
      void main() {
        vec4 t = texture2D(uAtlas, (vTile + fract(vUv)) * 0.25);
        if (t.a < 0.5) discard; // the holes of a sea fan
        vec3 n = normalize(gl_FrontFacing ? vN : -vN);
        // the coral's own ramp: cool and deep in the shade, warm in the light
        vec3 col = mix(vCol * vec3(0.5, 0.6, 0.85), vCol * 1.1 + vec3(0.05, 0.04, 0.0), smoothstep(0.4, 1.0, t.r));
        float depth = max(0.0, uWaterLevel - vWorld.y);
        float ndl = clamp(dot(n, uSunDir) * 0.8 + 0.2, 0.0, 1.0);
        ndl = ndl > 0.6 ? 1.0 : ndl > 0.3 ? 0.7 : 0.45;
        vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
        col *= amb * 0.7 + uSunColor * ndl * 0.75 + pointLights(vWorld, n);
        // caustics: the surface focusing the sun in moving pixel nets
        vec2 cp = floor(vWorld.xz * 16.0) / 16.0 * 1.6;
        float c1 = vnoise(cp + vec2(uTime * 0.35, uTime * 0.2)), c2 = vnoise(cp * 1.3 - vec2(uTime * 0.25, -uTime * 0.3) + 7.0);
        float caust = smoothstep(0.55, 0.95, 1.0 - abs(c1 - c2) * 4.0) * (1.0 - smoothstep(0.0, 9.0, depth)) * step(0.0, n.y);
        col += caust * 0.3 * uSunColor * (1.0 - uNight);
        // the water swallows red first: bluer and dimmer with depth
        col = mix(col, col * vec3(0.55, 0.85, 1.0), smoothstep(0.0, 10.0, depth));
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- the reef
export class Reef {
  constructor(scene, hooks = {}) {
    this.scene = scene; this.hooks = hooks;
    this.group = new THREE.Group(); scene.add(this.group);
    this.material = reefMaterial(atlas());
    this.lib = {}; // kind -> [variant parts]
    for (const [k, def] of Object.entries(KINDS)) this.lib[k] = Array.from({ length: def.variants }, (_, v) => def.make(1000 + v * 37 + k.length * 7));
    this.cells = [];
    this.schools = [];
    this.clams = [];
  }

  dispose() {
    for (const c of this.cells) { c.mesh.removeFromParent(); c.mesh.geometry.dispose(); }
    for (const s of this.fishMeshes || []) { s.removeFromParent(); s.dispose?.(); }
    for (const c of this.clams) c.mesh.removeFromParent();
    this.cells = []; this.schools = []; this.clams = []; this.fishMeshes = [];
  }

  // where the reef grows: shallow water around the islands, in patches
  build(world, heightAt, quality = 'high') {
    this.dispose();
    this.world = world;
    const cfg = world.cfg, r = mulberry32((cfg.seed | 0) + 515151), sx = makeSimplex((cfg.seed | 0) + 9191);
    const half = world.size / 2 - 8, step = 1.25;
    const acc = new Map(); // cell key -> accumulator
    const spots = []; // coral spots for fish and clams
    const anemones = [];
    let count = 0;
    const taken = new Map(); // where corals stand (2 m grid): clams go between them
    this.free = (x, z, r) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const [cx, cz, s] of taken.get(`${Math.floor(x / 2) + i},${Math.floor(z / 2) + j}`) || []) if (Math.hypot(cx - x, cz - z) < r + 0.5 * s) return false; return true; };
    const MAX = quality === 'low' ? 1500 : quality === 'medium' ? 2600 : 3600, cand = [];
    for (let z = -half; z < half; z += step) for (let x = -half; x < half; x += step) {
      const jx = x + (r() - 0.5) * step, jz = z + (r() - 0.5) * step;
      const h = heightAt(jx, jz), d = -h;
      if (d < 0.45 || d > 12) continue;
      const patch = sx.noise(jx * 0.045, jz * 0.045) * 0.6 + sx.noise(jx * 0.13, jz * 0.13) * 0.4; // -1..1
      const roll = r();
      let kind = null;
      if (d < 3.6 && patch < -0.05 && roll < 0.55) kind = 'grass';                        // seagrass meadows
      else if (d > 1.3 && patch > 0.12 && roll < 0.42 + patch * 0.4) {                    // the reef itself
        const k = r();
        kind = k < 0.2 ? 'brain' : k < 0.42 ? 'staghorn' : k < 0.54 ? 'table' : k < 0.68 ? 'fan' : k < 0.82 ? 'sponge' : k < 0.88 ? 'anemone' : k < 0.94 ? 'urchin' : 'star';
        if (kind === 'table' && d < 2.2) kind = 'brain';
        if (kind === 'fan' && d < 2) kind = 'sponge';
      } else if (d > 0.7 && roll < 0.025) kind = r() < 0.6 ? 'star' : 'urchin';         // strays on the sand
      if (kind) cand.push([jx, jz, h, d, kind]);
    }
    const keep = Math.min(1, MAX / Math.max(1, cand.length)); // the same density everywhere, whatever the size of the world
    for (const [jx, jz, h, d, kind] of cand) {
      if (r() > keep) continue;
      const ns = new THREE.Vector3(), e = 0.4;
      ns.set(heightAt(jx - e, jz) - heightAt(jx + e, jz), 2 * e, heightAt(jx, jz - e) - heightAt(jx, jz + e)).normalize();
      if (ns.y < 0.6 && kind !== 'grass') continue; // too steep for it to hold on
      const def = KINDS[kind], variant = this.lib[kind][Math.floor(r() * def.variants)];
      const pal = def.pal[Math.floor(r() * def.pal.length)];
      const scale = (kind === 'grass' ? 0.8 + r() * 0.6 : 0.75 + r() * 0.55) * (kind === 'brain' || kind === 'table' ? 0.8 + d * 0.04 : 1);
      const lie = kind === 'star' || kind === 'brain' || kind === 'urchin'; // follow the slope
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), r() * Math.PI * 2);
      if (lie) q.premultiply(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), ns));
      const m = new THREE.Matrix4().compose(V(jx, h - 0.03, jz), q, V(scale, scale, scale));
      const key = `${Math.floor(jx / CELL)},${Math.floor(jz / CELL)}`;
      if (!acc.has(key)) acc.set(key, { list: [], cx: (Math.floor(jx / CELL) + 0.5) * CELL, cz: (Math.floor(jz / CELL) + 0.5) * CELL });
      const tint = 0.9 + r() * 0.2;
      acc.get(key).list.push({ parts: variant, m, base: hex(pal[0]).map((c) => c * tint), tip: hex(pal[1]) });
      count++;
      if (kind !== 'grass') { const gk = `${Math.floor(jx / 2)},${Math.floor(jz / 2)}`; taken.set(gk, (taken.get(gk) || []).concat([[jx, jz, scale]])); }
      if (kind !== 'grass' && kind !== 'star' && kind !== 'urchin' && d > 1.6) spots.push({ x: jx, z: jz, y: h, d });
      if (kind === 'anemone') anemones.push({ x: jx, z: jz, y: h + ANEMONE_H * scale });
    }
    for (const [, c] of acc) this.cells.push(this.bake(c));
    this.count = count;
    this.makeFish(spots, anemones, r);
    this.makeClams(spots, r, heightAt);
  }

  // merge a cell's corals into one mesh
  bake(c) {
    let nv = 0, ni = 0;
    for (const it of c.list) for (const p of it.parts) { nv += p.f.length; ni += p.idx.length; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), tile = new Float32Array(nv * 2), sway = new Float32Array(nv);
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let v = 0, i = 0;
    const p3 = new THREE.Vector3(), n3 = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const it of c.list) {
      nm.getNormalMatrix(it.m);
      const sc = it.m.elements[0] ** 2 + it.m.elements[1] ** 2 + it.m.elements[2] ** 2;
      for (const p of it.parts) {
        const n = p.f.length;
        for (let k = 0; k < p.idx.length; k++) idx[i++] = v + p.idx[k];
        for (let k = 0; k < n; k++) {
          p3.set(p.pos[k * 3], p.pos[k * 3 + 1], p.pos[k * 3 + 2]).applyMatrix4(it.m);
          n3.set(p.nor[k * 3], p.nor[k * 3 + 1], p.nor[k * 3 + 2]).applyMatrix3(nm).normalize();
          pos.set([p3.x, p3.y, p3.z], (v + k) * 3); nor.set([n3.x, n3.y, n3.z], (v + k) * 3);
          uv.set([p.uv[k * 2], p.uv[k * 2 + 1]], (v + k) * 2);
          const f = p.f[k], t = Math.min(1, p.t[k]);
          for (let j = 0; j < 3; j++) col[(v + k) * 3 + j] = it.base[j] * f * (1 - t) + it.tip[j] * t;
          tile[(v + k) * 2] = p.tile % 4; tile[(v + k) * 2 + 1] = 3 - Math.floor(p.tile / 4);
          sway[v + k] = p.s[k] * Math.sqrt(sc);
        }
        v += n;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aTile', new THREE.BufferAttribute(tile, 2));
    g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.5;
    const mesh = new THREE.Mesh(g, this.material);
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    return { mesh, x: c.cx, z: c.cz };
  }

  // ---------------------------------------------------------------- fish
  // schools of reef fish: one instanced mesh per species and part
  makeFish(spots, anemones, r) {
    this.fishMeshes = [];
    const SP = [
      { sp: 0, size: 0.24, n: [4, 6], home: 'anemone' }, // clownfish keep to their anemone
      { sp: 2, size: 0.22, n: [10, 16] },                 // blue damsels
      { sp: 3, size: 0.42, n: [6, 10] },                  // yellow tangs
      { sp: 4, size: 0.8, n: [1, 2] },                    // parrotfish, grazing alone
      { sp: 6, size: 0.55, n: [5, 8], deep: true },       // golden trevally, roaming further out
    ];
    for (const S of SP) {
      const homes = S.home === 'anemone' ? anemones.slice(0, 18) : spots.filter((s) => (S.deep ? s.d > 4 : true));
      if (!homes.length) continue;
      const nSchools = S.home === 'anemone' ? homes.length : Math.min(homes.length, S.sp === 4 ? 10 : 14);
      const schools = [];
      for (let k = 0; k < nSchools; k++) {
        const h = homes[Math.floor(r() * homes.length)];
        const n = S.n[0] + Math.floor(r() * (S.n[1] - S.n[0] + 1));
        const y0 = Math.min(-0.6, h.y + 0.6 + r() * 1.2);
        const fish = Array.from({ length: n }, () => { const o = V((r() - 0.5) * 2, (r() - 0.5) * 0.8, (r() - 0.5) * 2).multiplyScalar(S.home ? 0.25 : 1); return { o, ph: r() * 6.3, flee: V(), pos: V(h.x + o.x, y0 + o.y, h.z + o.z), yaw: r() * 6.3 }; });
        schools.push({ S, home: h, x: h.x, z: h.z, y: y0, a: r() * 6.3, turn: (r() - 0.5) * 0.6, speed: S.home ? 0.15 : S.sp === 4 ? 0.35 : 0.7, fish, roam: S.home ? 0.5 : S.deep ? 10 : 6 });
      }
      const total = schools.reduce((a, s) => a + s.fish.length, 0);
      const model = fishModelFor('fish:' + S.sp, SPECIES[S.sp].c, 0);
      const meshes = model.parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geo, worldMat(p), total);
        im.frustumCulled = false;
        this.scene.add(im);
        this.fishMeshes.push(im);
        return im;
      });
      this.schools.push({ S, schools, meshes, total });
    }
  }

  // ---------------------------------------------------------------- clams
  makeClams(spots, r, heightAt) {
    const taken = getW('reef', worldKey(this.world.cfg)) || {};
    const n = Math.min(14, Math.floor(spots.length / 40));
    for (let k = 0; k < n; k++) {
      const s = spots[Math.floor(r() * spots.length)];
      let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 12 && !ok; tries++) { const a = r() * 6.3, d = 1.5 + r() * 2.5; x = s.x + Math.cos(a) * d; z = s.z + Math.sin(a) * d; ok = this.free(x, z, 0.6); }
      const y = heightAt(x, z);
      if (!ok || -y < 1.6 || this.clams.some((c) => Math.hypot(c.x - x, c.z - z) < 3)) continue;
      const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
      const mesh = dress(MODELS.clam(), 'world');
      mesh.position.set(x, y - 0.04, z); mesh.rotation.y = r() * 6.3;
      this.scene.add(mesh);
      const lid = mesh.children.find((c) => c.userData.hinge);
      const pearl = mesh.children.find((c) => c.userData.pearl) || lid?.children.find((c) => c.userData.pearl);
      const c = { x, y, z, key, mesh, lid, pearl, has: r() < 0.65 && !(taken[key] && Date.now() - taken[key] < 6 * 3600e3), open: 0, t: r() * 10 };
      if (c.pearl) c.pearl.visible = c.has;
      this.clams.push(c);
    }
  }
  // the giant clam under the crosshair (open enough to reach in)
  aimedClam(camera, maxD = 2.6) {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    let best = null, bt = Infinity;
    for (const c of this.clams) {
      const p = V(c.x, c.y + 0.15, c.z).sub(camera.position), t = p.dot(dir);
      if (t < 0 || t > maxD) continue;
      if (p.clone().addScaledVector(dir, -t).length() < 0.45 && t < bt) { bt = t; best = c; }
    }
    return best;
  }
  takePearl(c) {
    if (!c.has) return false;
    c.has = false; if (c.pearl) c.pearl.visible = false;
    c.snap = 1; // it shuts on your hand (gently)
    const wk = worldKey(this.world.cfg), taken = getW('reef', wk) || {};
    taken[c.key] = Date.now(); setW('reef', wk, { ...taken });
    return true;
  }

  // ---------------------------------------------------------------- update
  update(dt, camera, player) {
    const cam = camera.position, t = performance.now() / 1000;
    // corals: only the cells close enough to matter
    for (const c of this.cells) c.mesh.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < (cam.y < 0 ? 72 : 85);
    // giant clams breathe: open, rest, close a little; shut when you come close fast
    for (const c of this.clams) {
      const near = Math.hypot(c.x - cam.x, c.z - cam.z);
      if (near > 60) continue;
      c.t += dt;
      const want = c.snap > 0 ? 0 : 0.85 + Math.sin(c.t * 0.5) * 0.15; // wide open to the light, breathing
      if (c.snap > 0) c.snap -= dt * 0.25;
      c.open += (want - c.open) * Math.min(1, dt * (c.snap > 0 ? 6 : 1.2));
      if (c.lid) { c.lid.rotation.x = -c.open; c.lid.updateMatrix(); }
    }
    // fish
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = V(0, 1, 0);
    const pp = player.pos, py = pp.y + 1.2;
    for (const sp of this.schools) {
      let i = 0;
      for (const s of sp.schools) {
        const far = Math.hypot(s.x - cam.x, s.z - cam.z) > 55;
        if (!far) {
          // wander around home, steering back when it strays
          s.a += s.turn * dt + Math.sin(t * 0.3 + s.home.x) * 0.3 * dt;
          const hx = s.home.x - s.x, hz = s.home.z - s.z, hd = Math.hypot(hx, hz);
          if (hd > s.roam) s.a += Math.sign(Math.sin(Math.atan2(hz, hx) - s.a)) * dt * 1.2;
          s.x += Math.cos(s.a) * s.speed * dt; s.z += Math.sin(s.a) * s.speed * dt;
          const floor = (this.world.heightAt?.(s.x, s.z) ?? -3) + 0.35;
          const top = -0.45;
          s.y += ((Math.max(floor + 0.3, Math.min(top, s.home.y + 1 + Math.sin(t * 0.2 + s.home.z) * 0.6))) - s.y) * Math.min(1, dt * 0.8);
        }
        for (const f of s.fish) {
          if (!far) {
            const wob = Math.sin(t * 1.3 + f.ph);
            const tx = s.x + f.o.x * Math.cos(s.a) - f.o.z * Math.sin(s.a) + wob * 0.15;
            const tz = s.z + f.o.x * Math.sin(s.a) + f.o.z * Math.cos(s.a) + Math.cos(t * 1.1 + f.ph) * 0.15;
            const ty = s.y + f.o.y + Math.sin(t * 0.9 + f.ph) * 0.08;
            // scatter from a swimmer, then drift back into place
            const dx = tx + f.flee.x - pp.x, dy = ty + f.flee.y - py, dz = tz + f.flee.z - pp.z, dd = Math.hypot(dx, dy, dz);
            if (dd < 2.6 && player.diving) f.flee.addScaledVector(V(dx, dy * 0.5, dz).normalize(), (2.6 - dd) * dt * 7);
            f.flee.multiplyScalar(Math.exp(-dt * 0.7));
            const nx = tx + f.flee.x, nz = tz + f.flee.z, ny = Math.min(-0.25, ty + f.flee.y);
            const vx = nx - f.pos.x, vz = nz - f.pos.z;
            if (vx * vx + vz * vz > 1e-6) { const want = Math.atan2(-vz, vx); let d = want - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); f.yaw += d * Math.min(1, dt * 6); }
            f.pos.set(nx, ny, nz);
          }
          const wig = Math.sin(t * (sp.S.sp === 4 ? 4 : 9) + f.ph) * 0.18; // the tail beat turns the body a little
          q.setFromAxisAngle(up, f.yaw + wig);
          m.compose(f.pos, q, sc.setScalar(sp.S.size / 0.39));
          for (const im of sp.meshes) im.setMatrixAt(i, m);
          i++;
        }
      }
      for (const im of sp.meshes) im.instanceMatrix.needsUpdate = true;
    }
  }
}
