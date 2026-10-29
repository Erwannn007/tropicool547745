// Generic first-person held object, same recipe as the axe (axeModel.js):
// dedicated scene, banded materials, rendered into a ~220-row target and
// upscaled with nearest filtering. Pose keyframes: { t, p, q, e }.
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
      fragmentShader: 'uniform sampler2D uTex; varying vec2 vUv; void main() { vec4 c = texture2D(uTex, vUv); if (c.a < 0.02) discard; gl_FragColor = c; }',
    }));
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.item = null; this.anim = null; this.t = -1; this.hitStop = 0; this.raise = 1;
  }

  // object: Group already dressed; anim: { idle, keys, impact, cooldown }
  set(id, object, anim) {
    if (this.item === id) return;
    this.holder.clear();
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
  freeze(s) { this.hitStop = s; }

  pose(t) {
    const { idle, keys } = this.anim;
    if (t < 0 || !keys) return idle;
    for (let i = 1; i < keys.length; i++) {
      const k0 = keys[i - 1], k1 = keys[i];
      if (t <= k1.t) {
        const u = ease[k1.e || 'inOut']((t - k0.t) / (k1.t - k0.t));
        return { p: k0.p.map((v, j) => v + (k1.p[j] - v) * u), q: k0.q.clone().slerp(k1.q, u) };
      }
    }
    return idle;
  }

  // returns true on the impact frame
  update(dt, bob, moving) {
    if (!this.item) return false;
    let impact = false;
    const keys = this.anim.keys;
    if (this.t >= 0 && keys) {
      const before = this.t;
      if (this.hitStop > 0) this.hitStop -= dt; else this.t += dt;
      if (before < this.anim.impact && this.t >= this.anim.impact) impact = true;
      if (this.t >= keys[keys.length - 1].t) {
        this.t = -1;
        if (this.queued) { this.queued = false; this.t = 0; this.onChain?.(); }
      }
    }
    this.raise = Math.min(1, this.raise + dt * 4);
    const r = 1 - Math.pow(1 - this.raise, 3);
    const p = this.pose(this.t);
    const sway = moving ? 1 : 0.3, tm = performance.now() / 1000;
    this.holder.position.set(
      p.p[0] + Math.sin(bob) * 0.014 * sway,
      p.p[1] + Math.abs(Math.sin(bob * 2)) * 0.012 * sway + Math.sin(tm * 1.4) * 0.004 - (1 - r) * 0.5,
      p.p[2],
    );
    this.holder.quaternion.copy(p.q);
    if (this.anim.scale) this.holder.scale.setScalar(this.anim.scale);
    return impact;
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
