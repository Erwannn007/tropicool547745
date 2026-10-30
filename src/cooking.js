// Cooking on a camp fire: a raw fish is pushed onto a spit over the flames
// and turns slowly while it cooks (raw, half done, grilled, burnt: the skin
// colours change, see fishModel() in models.js). Steam then smoke rise off it,
// drops of fat fall into the embers and flare; the sizzle is heard near it.
// The state lives on the placed camp fire (o.cook = { id, t }) and is saved
// with it (placement.js).
import * as THREE from 'three';
import { MODELS, SPIT_Y, fishModelFor } from './models.js';
import { SPECIES } from './fishing.js';
import { dress } from './dress.js';

export const COOK = { half: 6, done: 14, burnt: 36 }; // seconds on the fire
export const cookStage = (t) => (t < COOK.half ? 0 : t < COOK.done ? 1 : t < COOK.burnt ? 2 : 3);
const STAGE_ID = ['fish', 'fish', 'grill', 'burnt'];
// what comes off the spit: raw until it is done
export const cookedId = (c) => `${STAGE_ID[cookStage(c.t)]}:${c.id.split(':')[1]}`;

// soft square particles, each with its own colour, size growth and fade
export class Puffs {
  constructor(scene, n, blending = THREE.NormalBlending) {
    this.N = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 color; attribute float aAlpha, aSize; uniform float uScale; varying vec4 vC;
        void main() { vC = vec4(color, aAlpha); vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'varying vec4 vC; void main() { if (vC.a < 0.01) discard; gl_FragColor = vC; }',
    }));
    this.pts.frustumCulled = false;
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.grow = new Float32Array(n); this.a0 = new Float32Array(n); this.g = new Float32Array(n); this.next = 0;
    scene.add(this.pts);
  }
  emit(p, v, c, life, size, { alpha = 0.6, grow = 1, gravity = 0 } = {}) {
    const i = this.next = (this.next + 1) % this.N, G = this.pts.geometry.attributes;
    G.position.setXYZ(i, p.x, p.y, p.z); G.color.setXYZ(i, c[0], c[1], c[2]); G.aSize.setX(i, size);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.max[i] = life; this.grow[i] = grow; this.a0[i] = alpha; this.g[i] = gravity;
    G.color.needsUpdate = true;
  }
  update(dt) {
    const G = this.pts.geometry.attributes, t = performance.now() / 1000;
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { if (G.aAlpha.getX(i) > 0) { G.aAlpha.setX(i, 0); any = true; } continue; }
      any = true;
      this.life[i] -= dt;
      const v = this.vel, k = i * 3;
      v[k + 1] -= this.g[i] * dt;
      G.position.setXYZ(i, G.position.getX(i) + (v[k] + Math.sin(t * 2 + i) * 0.08) * dt, G.position.getY(i) + v[k + 1] * dt, G.position.getZ(i) + v[k + 2] * dt);
      const f = Math.max(0, this.life[i] / this.max[i]);
      G.aAlpha.setX(i, this.a0[i] * Math.min(1, f * 2.5) * Math.min(1, (1 - f) * 8 + 0.2));
      G.aSize.setX(i, G.aSize.getX(i) * (1 + dt * this.grow[i]));
    }
    if (any) { G.position.needsUpdate = true; G.aAlpha.needsUpdate = true; G.aSize.needsUpdate = true; }
  }
}

export class Cooking {
  constructor(scene, camera, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.fires = new Set(); // placed camp fires with something on the spit
    this.smoke = new Puffs(scene, 90);
    this.fat = new Puffs(scene, 40, THREE.AdditiveBlending);
    this.acc = 0;
  }
  setScale(px) { this.smoke.pts.material.uniforms.uScale.value = px; this.fat.pts.material.uniforms.uScale.value = px; }

  // a camp fire spawned with a fish already on it (loaded save) or a new one
  attach(o) {
    if (!o.cook) return;
    const g = new THREE.Group();
    g.add(dress(MODELS.spit(), 'world'));
    const fish = new THREE.Group(); fish.position.y = SPIT_Y; g.add(fish);
    g.position.set(o.x, o.y, o.z); g.rotation.y = o.yaw;
    this.scene.add(g);
    o.spit = { g, fish, stage: -1 };
    this.dress(o);
    this.fires.add(o);
  }
  detach(o) {
    if (!o.spit) return;
    o.spit.g.removeFromParent();
    o.spit = null;
    this.fires.delete(o);
  }
  // the fish on the spit, in the colours of how cooked it is
  dress(o) {
    const st = cookStage(o.cook.t), s = o.spit;
    if (st === s.stage) return false;
    s.stage = st;
    s.fish.clear();
    const n = +o.cook.id.split(':')[1];
    s.fish.add(dress(fishModelFor('fish:' + n, SPECIES[n].c, st), 'world'));
    return true;
  }

  start(o, id) {
    o.cook = { id, t: 0 };
    this.attach(o);
    this.hooks.sound?.('skewer');
    const at = this.fishPos(o);
    for (let k = 0; k < 10; k++) this.smoke.emit(at, new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4), [0.95, 0.95, 0.92], 0.8 + Math.random() * 0.5, 0.1, { alpha: 0.45, grow: 0.8 });
  }
  take(o) {
    const id = cookedId(o.cook);
    o.cook = null;
    this.detach(o);
    this.hooks.sound?.('unskewer');
    return id;
  }

  fishPos(o) { return new THREE.Vector3(o.x, o.y + SPIT_Y, o.z); }

  update(dt) {
    let loud = 0, burning = 0;
    const cam = this.camera.position;
    this.acc += dt;
    const puff = this.acc > 0.06;
    if (puff) this.acc = 0;
    for (const o of this.fires) {
      const c = o.cook, before = cookStage(c.t);
      c.t += dt;
      const st = cookStage(c.t);
      o.spit.fish.rotation.x += dt * 1.6; // the spit turns
      if (this.dress(o)) {
        if (st === 2) this.hooks.ready?.(o);
        if (st === 3) { this.hooks.sound?.('charred'); this.hooks.burnt?.(o); }
      }
      if (st !== before) this.hooks.save?.();
      const d = Math.hypot(o.x - cam.x, o.z - cam.z), near = Math.max(0, 1 - d / 8);
      if (near > loud) { loud = near; burning = st === 3 ? 1 : 0; }
      if (!puff || d > 40) continue;
      const at = this.fishPos(o);
      // steam while it cooks, then thick dark smoke once it chars
      const smokeCol = st === 3 ? [0.22, 0.2, 0.2] : st === 2 ? [0.78, 0.76, 0.72] : [0.96, 0.96, 0.94];
      if (Math.random() < (st === 3 ? 0.9 : 0.45)) {
        this.smoke.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.06, (Math.random() - 0.5) * 0.12)),
          new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.45 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15), smokeCol,
          1.4 + Math.random() * 1.2, st === 3 ? 0.16 : 0.1, { alpha: st === 3 ? 0.6 : 0.35, grow: 0.55 });
      }
      // drops of fat falling from the skin into the fire, a spark where they land
      if (st >= 1 && st < 3 && Math.random() < 0.25) {
        const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.06, (Math.random() - 0.5) * 0.06));
        this.fat.emit(p, new THREE.Vector3(0, -0.4, 0), [1, 0.85, 0.4], 0.32, 0.035, { alpha: 1, grow: 0, gravity: 9 });
        for (let k = 0; k < 3; k++) this.fat.emit(new THREE.Vector3(p.x, o.y + 0.12, p.z), new THREE.Vector3((Math.random() - 0.5) * 1.2, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2), [1, 0.6 + Math.random() * 0.3, 0.15], 0.3 + Math.random() * 0.3, 0.03, { alpha: 1, grow: -1, gravity: 5 });
      }
    }
    this.hooks.sizzle?.(loud, burning);
    this.smoke.update(dt); this.fat.update(dt);
  }
}
