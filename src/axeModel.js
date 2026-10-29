// First-person axe, styled like a chunky pixel-art 3D game: a real modelled
// axe (curved tapered handle, bevelled bearded head thinning to its edge)
// with pixel textures and banded lighting, rendered into a low-resolution
// target and upscaled with nearest filtering so it reads as big crisp pixels.
import * as THREE from 'three';

// ---------------------------------------------------------------- textures
function pixTex(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

// golden hickory: warm base, streaky grain, a couple of knots
const handleTex = () => pixTex(16, 96, (g, w, h) => {
  const r = rng(5);
  const pal = ['#a8701e', '#c48a28', '#d9a234', '#e8b444', '#f4c95e'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let k = 2 + Math.round((r() - 0.5) * 1.2);
    if ((x * 7 + Math.floor(y / 6) * 3) % 11 === 0) k -= 1;
    g.fillStyle = pal[Math.max(0, Math.min(4, k))]; g.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 14; i++) { // grain streaks along the length
    const x = Math.floor(r() * w), y0 = Math.floor(r() * h), len = 6 + Math.floor(r() * 16);
    g.fillStyle = r() < 0.5 ? pal[0] : pal[1];
    for (let y = y0; y < y0 + len; y++) g.fillRect((x + (y > y0 + len / 2 ? 1 : 0)) % w, y % h, 1, 1);
  }
  for (const [x, y] of [[5, 30], [11, 70]]) {
    g.fillStyle = '#7a4e16'; g.fillRect(x, y, 2, 2);
    g.fillStyle = pal[0]; g.fillRect(x - 1, y - 1, 4, 1); g.fillRect(x - 1, y + 2, 4, 1);
  }
});

// steel: soft brushed noise; colour/bevel comes from vertex colours
const steelTex = () => pixTex(32, 32, (g, w, h) => {
  const r = rng(9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = 0.9 + r() * 0.12 + ((x + y * 3) % 9 === 0 ? -0.06 : 0);
    const c = Math.round(255 * Math.min(1, v));
    g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(x, y, 1, 1);
  }
});

// ---------------------------------------------------------------- geometry
const HANDLE_LEN = 0.86;
const HEAD_Y = HANDLE_LEN - 0.038; // eye centre: the handle top stays hidden inside the eye
const handleCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.012, 0.28, 0.004),
  new THREE.Vector3(-0.006, 0.58, 0), new THREE.Vector3(0.004, HANDLE_LEN, 0),
]);

function handleGeometry() {
  const rings = 28, radial = 10;
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = handleCurve.getPointAt(t), T = handleCurve.getTangentAt(t);
    const S = new THREE.Vector3(0, 0, 1).cross(T).normalize(), B = T.clone().cross(S).normalize();
    // swell at the butt knob, slim towards the head, slightly oval
    let r = 0.033 - 0.006 * t;
    if (t < 0.06) r += 0.007 * Math.sin((t / 0.06) * Math.PI);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const n = S.clone().multiplyScalar(Math.cos(a) * 1.15).addScaledVector(B, Math.sin(a)).normalize();
      const p = c.clone().addScaledVector(S, Math.cos(a) * r * 1.15).addScaledVector(B, Math.sin(a) * r);
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(k / radial, t * 3);
    }
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < radial; k++) {
    const a = i * (radial + 1) + k, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // butt cap + top cap (closed ends, no hollow tube)
  const capC = pos.length / 3; pos.push(0, -0.004, 0); nor.push(0, -1, 0); uv.push(0.5, 0);
  for (let k = 0; k < radial; k++) idx.push(capC, k + 1, k);
  const top = handleCurve.getPointAt(1), last = rings * (radial + 1);
  const capT = pos.length / 3; pos.push(top.x, top.y, top.z); nor.push(0, 1, 0); uv.push(0.5, 3);
  for (let k = 0; k < radial; k++) idx.push(capT, last + k, last + k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// bearded head profile, blade towards -X, thinned to a sharp edge
function headGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0.062, 0.038);                           // poll, top
  s.lineTo(0.062, -0.038);                          // poll, bottom
  s.lineTo(-0.038, -0.044);                         // neck under the eye
  s.quadraticCurveTo(-0.095, -0.052, -0.16, -0.105); // beard sweeping down
  s.quadraticCurveTo(-0.2, -0.03, -0.182, 0.075);   // curved cutting edge
  s.quadraticCurveTo(-0.11, 0.05, -0.038, 0.044);   // top line back to the eye
  s.lineTo(0.062, 0.038);
  const depth = 0.064; // eye wraps the 0.054 m handle completely
  const g = new THREE.ExtrudeGeometry(s, {
    depth, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2,
  });
  g.translate(0, 0, -depth / 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // taper the cheeks from the eye towards the edge
    const t = Math.min(1, Math.max(0, (-x - 0.04) / 0.14));
    p.setZ(i, p.getZ(i) * (1 - 0.85 * Math.pow(t, 0.8)));
    // colour: dark blued poll/eye, light cheeks, bright honed edge
    let c = [0.5, 0.56, 0.65];
    if (x > -0.038) c = [0.4, 0.45, 0.55];  // eye
    if (x > 0.036) c = [0.32, 0.37, 0.47];  // poll
    if (t > 0.82) c = [0.96, 0.98, 1.0];
    else if (t > 0.62) c = [0.72, 0.77, 0.85];
    if (y > 0.03 && x > -0.038) c = c.map((v) => v * 1.12);
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = g.attributes.uv; // planar UVs for the pixel noise
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 6, p.getY(i) * 6);
  g.computeVertexNormals();
  const top = handleCurve.getPointAt(1);
  g.translate(top.x, HEAD_Y, top.z);
  return g;
}

function bandedMaterial(map, { metal = 0, vertexColors = false, alpha = 1 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: alpha < 1, depthWrite: alpha >= 1,
    defines: vertexColors ? { VCOL: 1 } : {},
    uniforms: { uMap: { value: map }, uMetal: { value: metal }, uAlpha: { value: alpha } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying vec3 vCol;
      #ifdef VCOL
        attribute vec3 color;
      #endif
      void main() {
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        #ifdef VCOL
          vCol = color;
        #else
          vCol = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uMetal; uniform float uAlpha;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying vec3 vCol;
      void main() {
        vec3 n = normalize(vN);
        vec3 L = normalize(vec3(-0.45, 0.75, 0.5));      // warm sun, upper left (view space)
        float d = max(dot(n, L), 0.0);
        float band = d > 0.66 ? 1.0 : d > 0.33 ? 0.72 : d > 0.08 ? 0.5 : 0.36; // flat pixel-art bands
        vec3 base = texture2D(uMap, vUv).rgb * vCol;
        vec3 c = base * (0.42 + 0.7 * band) * vec3(1.03, 1.0, 0.94);
        c += base * 0.18 * max(n.y, 0.0) * vec3(0.8, 0.9, 1.1);  // sky fill
        vec3 V = normalize(vView);
        float spec = pow(max(dot(reflect(-L, n), V), 0.0), 22.0);
        c += uMetal * step(0.7, spec) * 0.45;             // hard pixel glint
        gl_FragColor = vec4(c, uAlpha);
      }`,
  });
}

// pose from handle direction + blade direction (both in camera space)
function basis(D, Bl) {
  const Y = new THREE.Vector3(...D).normalize();
  const X = new THREE.Vector3(...Bl).normalize().negate(); // blade lies along local -X
  X.addScaledVector(Y, -X.dot(Y)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};
// overhead chop driven forward into the trunk, only slightly diagonal (a bit
// right-to-left), long handle reaching from the bottom-right corner
const IDLE = { p: [0.25, -0.76, -0.32], q: basis([-0.1, 0.9, -0.42], [-0.33, 0.05, -0.94]) }; // blade facing forward, turned slightly left
const KEYS = [
  { t: 0.0, ...IDLE },
  { t: 0.16, p: [0.3, -0.5, -0.3], q: basis([0.26, 0.86, -0.22], [-0.22, 0.4, -0.89]), e: 'out' },    // raise over the right shoulder
  { t: 0.2, p: [0.31, -0.48, -0.28], q: basis([0.28, 0.87, -0.16], [-0.22, 0.45, -0.86]), e: 'inOut' }, // hang
  { t: 0.29, p: [0.16, -0.36, -0.4], q: basis([-0.38, 0.3, -0.87], [-0.42, -0.9, 0.0]), e: 'in' },    // chop forward, a bit diagonal
  { t: 0.36, p: [0.13, -0.38, -0.4], q: basis([-0.4, 0.14, -0.9], [-0.36, -0.93, 0.05]), e: 'out' },  // follow-through, down
  { t: 0.62, ...IDLE, e: 'inOut' },                                                                   // recover
];
const SWING_TIME = KEYS[KEYS.length - 1].t;
const IMPACT_T = 0.255;

export class AxeModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 10);
    const wood = handleTex(), steel = steelTex();
    this.handleGeo = handleGeometry();
    this.headGeo = headGeometry();
    const build = (alpha) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.handleGeo, bandedMaterial(wood, { alpha })));
      g.add(new THREE.Mesh(this.headGeo, bandedMaterial(steel, { metal: 1, vertexColors: true, alpha })));
      return g;
    };
    this.holder = build(1);
    this.scene.add(this.holder);
    this.ghosts = [0.3, 0.15].map((a) => { const g = build(a); g.visible = false; g.matrixAutoUpdate = false; this.scene.add(g); return g; });
    this.history = [];

    // swoosh ribbon behind the cutting edge
    this.RIB = 24;
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
    this.tipLocal = new THREE.Vector3(-0.19, HEAD_Y, 0);
    this.innerLocal = new THREE.Vector3(-0.08, HEAD_Y, 0);

    // low-res target + nearest upscale = chunky pixels
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: this.rt.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D uTex; varying vec2 vUv; void main() { vec4 c = texture2D(uTex, vUv); if (c.a < 0.02) discard; gl_FragColor = c; }',
    }));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.t = -1; this.visible = false; this.hitStop = 0;
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
        return { p: k0.p.map((v, j) => v + (k1.p[j] - v) * u), q: k0.q.clone().slerp(k1.q, u) };
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
    const sway = moving ? 1 : 0.3, tm = performance.now() / 1000;
    this.holder.position.set(
      p.p[0] + Math.sin(bob) * 0.014 * sway,
      p.p[1] + Math.abs(Math.sin(bob * 2)) * 0.012 * sway + Math.sin(tm * 1.4) * 0.004,
      p.p[2],
    );
    this.holder.quaternion.copy(p.q);
    this.holder.updateMatrixWorld();

    const fast = this.t > 0.19 && this.t < 0.35;
    this.history.unshift(this.holder.matrixWorld.clone());
    this.history.length = Math.min(this.history.length, 6);
    this.ghosts.forEach((g, k) => {
      const m = this.history[2 + k * 2];
      g.visible = fast && !!m;
      if (m) { g.matrix.copy(m); g.matrixWorldNeedsUpdate = true; }
    });
    if (fast) {
      this.samples.unshift({
        tip: this.tipLocal.clone().applyMatrix4(this.holder.matrixWorld),
        inner: this.innerLocal.clone().applyMatrix4(this.holder.matrixWorld),
        age: 0,
      });
    }
    for (const s of this.samples) s.age += dt;
    this.samples = this.samples.filter((s) => s.age < 0.13).slice(0, this.RIB);
    const P = this.ribbon.geometry.attributes.position, C = this.ribbon.geometry.attributes.color;
    for (let i = 0; i < this.RIB; i++) {
      const s = this.samples[Math.min(i, this.samples.length - 1)];
      const a = s && i < this.samples.length ? Math.max(0, 1 - s.age / 0.13) : 0;
      if (s) { P.setXYZ(i * 2, s.tip.x, s.tip.y, s.tip.z); P.setXYZ(i * 2 + 1, s.inner.x, s.inner.y, s.inner.z); }
      C.setXYZW(i * 2, 1, 1, 1, 0.6 * a);
      C.setXYZW(i * 2 + 1, 0.8, 0.92, 1, 0);
    }
    P.needsUpdate = true; C.needsUpdate = true;
    return impact;
  }

  render(renderer, mainCamera) {
    if (!this.visible) return;
    const size = renderer.getSize(new THREE.Vector2());
    // ~220 rows of pixels whatever the screen, like the reference footage
    const px = Math.max(2, Math.round(size.y / 220));
    const w = Math.max(1, Math.round(size.x / px)), h = Math.max(1, Math.round(size.y / px));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.camera.aspect = mainCamera.aspect;
    this.camera.updateProjectionMatrix();
    const prevTarget = renderer.getRenderTarget(), auto = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.autoClear = false;
    renderer.render(this.quadScene, this.quadCam);
    renderer.autoClear = auto;
  }
}
