// First-person 3D pixel-art axe: the 64x64 pixel art is extruded into voxels
// (one voxel column per pixel) with per-part thickness, so it keeps every
// painted pixel but has real volume and lighting. Rendered in its own
// viewmodel pass (never clips into trees) with a keyframed wide swing,
// motion ghosts and a swoosh ribbon.
import * as THREE from 'three';
import { paintAxe, ART, PIVOT, PART } from './axeArt.js';

const PX = 0.0098; // metres per pixel

function thicknessMap({ parts, extra }) {
  const S = ART, t = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, p = parts[i];
    const dx = Math.abs(x + 0.5 - 32);
    if (p === PART.HANDLE) t[i] = Math.max(2, 2 * Math.sqrt(Math.max(0, 3.5 * 3.5 - dx * dx)));
    else if (p === PART.WRAP) t[i] = Math.max(3, 2 * Math.sqrt(Math.max(0, 4.1 * 4.1 - dx * dx)));
    else if (p === PART.POMMEL) t[i] = Math.max(3, 2 * Math.sqrt(Math.max(0, 4.6 * 4.6 - dx * dx)));
    else if (p === PART.BLADE) t[i] = 1 + 4.5 * Math.pow(extra[i], 0.85);
    else if (p === PART.EYE) t[i] = 9;
    else if (p === PART.POLL) t[i] = 8;
    else if (p === PART.RIVET) t[i] = 10;
    else if (p === PART.WEDGE) t[i] = 9.5;
  }
  // outline pixels hug their thickest neighbour
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (parts[i] !== PART.OUTLINE) continue;
    let m = 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const j = ny * S + nx;
      if (parts[j] && parts[j] !== PART.OUTLINE) m = Math.max(m, t[j]);
    }
    t[i] = Math.max(1, m - 0.5);
  }
  return t;
}

function buildVoxelGeometry(art) {
  const S = ART, th = thicknessMap(art), { rgba, parts } = art;
  const pos = [], nor = [], col = [], met = [];
  const metal = (p) => (p === PART.BLADE || p === PART.EYE || p === PART.POLL || p === PART.RIVET ? 1 : 0);
  const X = (x) => (x - PIVOT[0]) * PX, Y = (y) => (PIVOT[1] - y) * PX, Z = (z) => z * PX;
  const quad = (a, b, c, d, n, rgb, m) => {
    for (const v of [a, b, c, a, c, d]) { pos.push(...v); nor.push(...n); col.push(...rgb); met.push(m); }
  };
  const tAt = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : th[y * S + x]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, t = th[i];
    if (!t) continue;
    const h = t / 2;
    const rgb = [rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255];
    const m = metal(parts[i]);
    const x0 = X(x), x1 = X(x + 1), y0 = Y(y + 1), y1 = Y(y);
    // front & back
    quad([x0, y0, Z(h)], [x1, y0, Z(h)], [x1, y1, Z(h)], [x0, y1, Z(h)], [0, 0, 1], rgb, m);
    quad([x1, y0, Z(-h)], [x0, y0, Z(-h)], [x0, y1, Z(-h)], [x1, y1, Z(-h)], [0, 0, -1], rgb.map((c) => c * 0.82), m);
    // sides wherever the neighbour column is thinner
    const sides = [
      [x - 1, y, (za, zb) => [[x0, y0, za], [x0, y0, zb], [x0, y1, zb], [x0, y1, za]], [-1, 0, 0]],
      [x + 1, y, (za, zb) => [[x1, y0, zb], [x1, y0, za], [x1, y1, za], [x1, y1, zb]], [1, 0, 0]],
      [x, y - 1, (za, zb) => [[x0, y1, za], [x0, y1, zb], [x1, y1, zb], [x1, y1, za]], [0, 1, 0]],
      [x, y + 1, (za, zb) => [[x0, y0, zb], [x0, y0, za], [x1, y0, za], [x1, y0, zb]], [0, -1, 0]],
    ];
    for (const [nx, ny, mk, n] of sides) {
      const hn = tAt(nx, ny) / 2;
      if (hn >= h) continue;
      const side = rgb.map((c) => c * 0.9);
      if (hn === 0) { const [a, b, c, d] = mk(Z(-h), Z(h)); quad(a, b, c, d, n, side, m); continue; }
      let [a, b, c, d] = mk(Z(hn), Z(h)); quad(a, b, c, d, n, side, m);
      [a, b, c, d] = mk(Z(-h), Z(-hn)); quad(a, b, c, d, n, side, m);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aMetal', new THREE.Float32BufferAttribute(met, 1));
  g.computeBoundingSphere();
  return g;
}

function voxelMaterial(alpha = 1) {
  return new THREE.ShaderMaterial({
    transparent: alpha < 1,
    depthWrite: alpha >= 1,
    uniforms: { uAlpha: { value: alpha } },
    vertexShader: /* glsl */`
      attribute vec3 color;
      attribute float aMetal;
      varying vec3 vColor; varying vec3 vN; varying float vMetal; varying vec3 vView;
      void main() {
        vColor = color; vMetal = aMetal;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAlpha;
      varying vec3 vColor; varying vec3 vN; varying float vMetal; varying vec3 vView;
      void main() {
        vec3 n = normalize(vN);
        vec3 L = normalize(vec3(-0.35, 0.8, 0.5));     // sun from upper left, in view space
        float diff = max(dot(n, L), 0.0);
        float sky = 0.5 + 0.5 * n.y;
        vec3 c = vColor * (0.6 + 0.16 * sky + 0.5 * diff);
        vec3 V = normalize(vView);
        float spec = pow(max(dot(reflect(-L, n), V), 0.0), 18.0);
        c += vMetal * spec * 0.55 * vec3(1.0, 0.98, 0.92);
        gl_FragColor = vec4(c, uAlpha);
      }`,
  });
}

const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};
const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const IDLE = { p: [0.42, -0.42, -0.86], q: E(-0.1, 0.32, 0.28) };
const KEYS = [
  { t: 0.0, ...IDLE },
  { t: 0.15, p: [0.4, -0.2, -0.74], q: E(0.32, 0.38, -0.5), e: 'out' },   // wind up, head back to the right
  { t: 0.2, p: [0.41, -0.18, -0.74], q: E(0.36, 0.38, -0.56), e: 'inOut' }, // hang
  { t: 0.31, p: [0.02, -0.3, -0.85], q: E(-0.7, 0.3, 1.15), e: 'in' },    // wide chop across
  { t: 0.38, p: [-0.12, -0.38, -0.82], q: E(-0.85, 0.25, 1.35), e: 'out' }, // follow-through
  { t: 0.64, ...IDLE, e: 'inOut' },                                        // recover
];
const SWING_TIME = KEYS[KEYS.length - 1].t;
const IMPACT_T = 0.27;

export class AxeModel {
  constructor() {
    const art = paintAxe();
    this.art = art;
    this.geometry = buildVoxelGeometry(art);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.02, 10);
    this.holder = new THREE.Group();
    this.holder.add(new THREE.Mesh(this.geometry, voxelMaterial()));
    this.scene.add(this.holder);
    // motion ghosts
    this.ghosts = [0.32, 0.2, 0.11].map((a) => {
      const g = new THREE.Mesh(this.geometry, voxelMaterial(a));
      g.matrixAutoUpdate = false; g.visible = false; g.renderOrder = -1;
      this.scene.add(g);
      return g;
    });
    this.history = [];
    // swoosh ribbon behind the blade
    this.RIB = 28;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.RIB * 2 * 3), 3));
    rg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.RIB * 2 * 4), 4));
    const idx = [];
    for (let i = 0; i < this.RIB - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    rg.setIndex(idx);
    this.ribbon = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.ribbon.frustumCulled = false;
    this.scene.add(this.ribbon);
    this.samples = [];
    this.tipLocal = new THREE.Vector3((7 - PIVOT[0]) * PX, (PIVOT[1] - 17) * PX, 0);
    this.innerLocal = new THREE.Vector3((19 - PIVOT[0]) * PX, (PIVOT[1] - 17) * PX, 0);
    this.t = -1;
    this.visible = false;
    this.hitStop = 0;
  }

  setVisible(v) { this.visible = v; if (!v) { this.t = -1; this.queued = false; } }
  get swinging() { return this.t >= 0; }

  // returns true when a new swing starts; a press late in a swing is buffered
  swing() {
    if (this.t < 0) { this.t = 0; return true; }
    if (this.t > 0.22) this.queued = true;
    return false;
  }
  freeze(s) { this.hitStop = s; }

  pose(t) {
    if (t < 0) return IDLE;
    for (let i = 1; i < KEYS.length; i++) {
      const k0 = KEYS[i - 1], k1 = KEYS[i];
      if (t <= k1.t) {
        const u = ease[k1.e]((t - k0.t) / (k1.t - k0.t));
        return {
          p: k0.p.map((v, j) => v + (k1.p[j] - v) * u),
          q: k0.q.clone().slerp(k1.q, u),
        };
      }
    }
    return IDLE;
  }

  // advances the animation; returns true on the frame the blade bites
  update(dt, bob, moving) {
    let impact = false;
    if (this.t >= 0) {
      const before = this.t;
      if (this.hitStop > 0) this.hitStop -= dt; else this.t += dt;
      if (before < IMPACT_T && this.t >= IMPACT_T) impact = true;
      if (this.t >= SWING_TIME) {
        this.t = -1;
        if (this.queued) { this.queued = false; this.t = 0; this.onChain?.(); }
      }
    }
    const p = this.pose(this.t);
    const sway = moving ? 1 : 0.3;
    const tm = performance.now() / 1000;
    this.holder.position.set(
      p.p[0] + Math.sin(bob) * 0.014 * sway,
      p.p[1] + Math.abs(Math.sin(bob * 2)) * 0.014 * sway + Math.sin(tm * 1.4) * 0.004,
      p.p[2],
    );
    this.holder.quaternion.copy(p.q);
    this.holder.updateMatrixWorld();

    // ghosts + ribbon during the fast part of the swing
    const fast = this.t > 0.19 && this.t < 0.37;
    this.history.unshift(this.holder.matrixWorld.clone());
    this.history.length = Math.min(this.history.length, 8);
    this.ghosts.forEach((g, k) => {
      const m = this.history[2 + k * 2];
      g.visible = fast && !!m;
      if (m) g.matrix.copy(m);
    });
    if (fast) {
      this.samples.unshift({
        tip: this.tipLocal.clone().applyMatrix4(this.holder.matrixWorld),
        inner: this.innerLocal.clone().applyMatrix4(this.holder.matrixWorld),
        age: 0,
      });
    }
    for (const s of this.samples) s.age += dt;
    this.samples = this.samples.filter((s) => s.age < 0.14).slice(0, this.RIB);
    const P = this.ribbon.geometry.attributes.position, C = this.ribbon.geometry.attributes.color;
    for (let i = 0; i < this.RIB; i++) {
      const s = this.samples[Math.min(i, this.samples.length - 1)];
      if (!s) { P.setXYZ(i * 2, 0, 0, 0); P.setXYZ(i * 2 + 1, 0, 0, 0); C.setXYZW(i * 2, 0, 0, 0, 0); C.setXYZW(i * 2 + 1, 0, 0, 0, 0); continue; }
      const a = Math.max(0, 1 - s.age / 0.14) * (i < this.samples.length ? 1 : 0);
      P.setXYZ(i * 2, s.tip.x, s.tip.y, s.tip.z);
      P.setXYZ(i * 2 + 1, s.inner.x, s.inner.y, s.inner.z);
      C.setXYZW(i * 2, 1, 1, 1, 0.55 * a);
      C.setXYZW(i * 2 + 1, 0.75, 0.9, 1, 0);
    }
    P.needsUpdate = true; C.needsUpdate = true;
    return impact;
  }

  render(renderer, mainCamera) {
    if (!this.visible) return;
    this.camera.aspect = mainCamera.aspect;
    this.camera.updateProjectionMatrix();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}
