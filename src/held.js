// Generic first-person held object, same recipe as the axe (axeModel.js):
// dedicated scene, banded materials, rendered into a ~220-row target and
// upscaled with nearest filtering. Pose keyframes: { t, p, q, e }.
// anim.pivot (model space): the keys turn about that point (the hand on the
// handle) instead of the model origin. anim.contact: the impact is not timed,
// the caller decides when the tool really meets something (hands.js).
import * as THREE from 'three';
import { ease } from './axeModel.js';

export class HeldView {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 10);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: this.rt.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D uTex; varying vec2 vUv; void main() { vec4 c = texture2D(uTex, vUv); if (c.a < 0.02) discard; gl_FragColor = vec4(c.rgb / c.a, c.a); }', // target colour is premultiplied by alpha
    }));
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.item = null; this.anim = null; this.t = -1; this.hitStop = 0; this.raise = 1;
    this.lag = new THREE.Vector2(); this.shake = 0;
    this.camera.updateMatrixWorld();

    // wind trail behind a fast blade (anim.trail = { tip, inner, from, to })
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
  }

  // object: Group already dressed; anim: { idle, keys, impact, cooldown }
  set(id, object, anim) {
    if (this.item === id) return;
    this.holder.clear();
    this.samples = [];
    this.item = id; this.anim = anim; this.t = -1; this.queued = false;
    if (object) this.holder.add(object);
    this.raise = 0; // bring it up from below the screen
  }
  get visible() { return !!this.item; }
  get swinging() { return this.t >= 0; }

  swing() {
    if (!this.anim?.keys) return false;
    if (this.t < 0) { this.t = 0; return true; }
    if (this.t > this.anim.impact) this.queued = true;
    return false;
  }
  freeze(s) { this.hitStop = s; this.shake = 1; }

  pose(t) {
    const { idle, keys } = this.anim;
    if (t < 0 || !keys) return idle;
    for (let i = 1; i < keys.length; i++) {
      const k0 = keys[i - 1], k1 = keys[i];
      if (t <= k1.t) {
        const r = (t - k0.t) / (k1.t - k0.t), u = k1.e === 'lin' ? r : ease[k1.e || 'inOut'](r);
        const q = k0.q.clone().slerp(k1.q, u);
        const pv = this.anim.pivot;
        if (!pv) return { p: k0.p.map((v, j) => v + (k1.p[j] - v) * u), q };
        // the hand travels on a straight line, the tool turns about it
        const s = this.anim.scale || 1, at = (k) => new THREE.Vector3(...k.p).add(pv.clone().multiplyScalar(s).applyQuaternion(k.q));
        const g = at(k0).lerp(at(k1), u).sub(pv.clone().multiplyScalar(s).applyQuaternion(q));
        return { p: g.toArray(), q };
      }
    }
    return idle;
  }

  // returns true on the impact frame
  // look: how far the view turned this frame (radians, x = yaw, y = pitch)
  update(dt, bob, moving, look) {
    if (!this.item) return false;
    let impact = false;
    const keys = this.anim.keys;
    if (this.t >= 0 && keys) {
      const before = this.t;
      if (this.hitStop > 0) this.hitStop -= dt; else this.t += dt;
      if (!this.anim.contact && before < this.anim.impact && this.t >= this.anim.impact) impact = true;
      if (this.t >= keys[keys.length - 1].t) {
        this.t = -1;
        if (this.queued) { this.queued = false; this.t = 0; this.onChain?.(); }
      }
    }
    this.raise = Math.min(1, this.raise + dt * 4);
    const r = 1 - Math.pow(1 - this.raise, 3);
    const p = this.pose(this.t);
    const sway = moving ? 1 : 0.3, tm = performance.now() / 1000;
    // the hands trail a little behind quick turns of the head, then catch up
    const rate = 1 / Math.max(dt, 1 / 120), k = 1 - Math.exp(-dt * 12);
    const tx = Math.max(-0.05, Math.min(0.05, -(look?.x || 0) * rate * 0.01));
    const ty = Math.max(-0.04, Math.min(0.04, (look?.y || 0) * rate * 0.01));
    this.lag.x += (tx - this.lag.x) * k; this.lag.y += (ty - this.lag.y) * k;
    // the tool rings in the hand on an impact
    this.shake = Math.max(0, this.shake - dt * 6);
    const jit = Math.sin(tm * 95) * this.shake * this.shake * 0.007;
    this.holder.position.set(
      p.p[0] + Math.sin(bob) * 0.014 * sway + this.lag.x * 0.4 + jit,
      p.p[1] + Math.abs(Math.sin(bob * 2)) * 0.012 * sway + Math.sin(tm * 1.4) * 0.004 - (1 - r) * 0.5 + this.lag.y * 0.4 - jit * 0.6,
      p.p[2],
    );
    this.holder.quaternion.copy(p.q).premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lag.y * 0.8, this.lag.x * 0.8, jit * 2, 'YXZ')));
    this.holder.scale.setScalar(this.anim.scale || 1); // reset: the previous item may have been scaled
    this.trail(dt);
    return impact;
  }

  trail(dt) {
    const tr = this.anim.trail;
    if (tr && this.t > tr.from && this.t < tr.to) {
      this.holder.updateMatrixWorld();
      this.samples.unshift({
        tip: new THREE.Vector3(...tr.tip).applyMatrix4(this.holder.matrixWorld),
        inner: new THREE.Vector3(...tr.inner).applyMatrix4(this.holder.matrixWorld),
        age: 0,
      });
    }
    const life = tr?.life ?? 0.16;
    for (const s of this.samples) s.age += dt;
    this.samples = this.samples.filter((s) => s.age < life).slice(0, this.RIB);
    const P = this.ribbon.geometry.attributes.position, C = this.ribbon.geometry.attributes.color;
    for (let i = 0; i < this.RIB; i++) {
      const s = this.samples[Math.min(i, this.samples.length - 1)];
      const a = s && i < this.samples.length ? Math.max(0, 1 - s.age / life) * (1 - i / this.RIB) : 0;
      if (s) { P.setXYZ(i * 2, s.tip.x, s.tip.y, s.tip.z); P.setXYZ(i * 2 + 1, s.inner.x, s.inner.y, s.inner.z); }
      C.setXYZW(i * 2, 0.92, 0.97, 1, 0.5 * a);       // airy white at the blade tip
      C.setXYZW(i * 2 + 1, 0.75, 0.9, 1, 0.08 * a);   // fading towards the heel
    }
    P.needsUpdate = true; C.needsUpdate = true;
  }

  render(renderer, mainCamera) {
    if (!this.item) return;
    const size = renderer.getSize(new THREE.Vector2());
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
