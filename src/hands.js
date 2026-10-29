// What the hands show for the new items: the scythe (mowing sweep), the tiki
// torch (lights the way, flickers) and a small version of any placeable.
import * as THREE from 'three';
import { HeldView } from './held.js';
import { MODELS } from './models.js';
import { dress } from './dress.js';
import { PLACEABLE } from './placement.js';

const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const pv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// scythe sweep: the whole tool turns about a pivot by the right hip. The
// model is tilted so the snath runs from the bottom-right corner to the heel
// and the blade shows its face, held a little above the grass.
const PIVOT = [0.15, -0.6, 0.0], HEEL = [-0.43, 0.41, -1.1];
function scytheKey(t, yaw, lift = 0, roll = 0, e) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const o = [HEEL[0] * c + HEEL[2] * s, HEEL[1] + lift, -HEEL[0] * s + HEEL[2] * c];
  return { t, p: pv(PIVOT, o), q: Q(0, yaw, roll), e };
}
const SCYTHE = {
  keys: [
    scytheKey(0, 0),
    scytheKey(0.2, -0.55, 0.06, 0.08, 'out'),   // wind up to the right, blade lifted
    scytheKey(0.26, -0.6, 0.07, 0.08, 'inOut'), // hang
    scytheKey(0.42, 0.42, -0.06, -0.05, 'in'),  // sweep right to left, low
    scytheKey(0.5, 0.62, -0.05, -0.06, 'out'),  // follow-through
    scytheKey(0.86, 0, 0, 0, 'inOut'),          // back
  ],
  impact: 0.35,
};
SCYTHE.idle = { p: SCYTHE.keys[0].p, q: SCYTHE.keys[0].q };
const tilted = (obj) => { const g = new THREE.Group(); obj.rotation.set(0.85, 0.41, 0, 'YXZ'); g.add(obj); return g; };

const TORCH = { idle: { p: [0.36, -0.86, -0.66], q: Q(-0.1, 0.25, -0.16) }, scale: 0.5 };
const MINI = {
  transat: { idle: { p: [0.36, -0.44, -0.78], q: Q(0.45, -0.7, 0.05) }, scale: 0.22 },
  parasol: { idle: { p: [0.4, -0.62, -0.8], q: Q(0.15, 0.4, -0.12) }, scale: 0.24 },
  campfire: { idle: { p: [0.34, -0.42, -0.72], q: Q(0.5, 0.4, 0) }, scale: 0.36 },
};

export class Hands {
  constructor(lights, hooks) {
    this.view = new HeldView();
    this.view.onChain = () => hooks.sound?.('swish');
    this.hooks = hooks;
    this.light = lights.add({ x: 0, y: -999, z: 0, radius: 7, r: 0.75, g: 0.45, b: 0.2, off: true, flicker: 1.4 });
    this.id = null;
  }

  setHeld(id) {
    this.id = id;
    if (id === 'scythe') this.view.set(id, tilted(dress(MODELS.scythe(), 'held')), SCYTHE);
    else if (id === 'torch') this.view.set(id, dress(MODELS.torch(), 'held'), TORCH);
    else if (MINI[id]) this.view.set(id, dress(MODELS[id](), 'held'), MINI[id]);
    else this.view.set(null, null, null);
    this.light.off = id !== 'torch';
  }

  action() {
    if (this.id === 'scythe' && this.view.swing()) this.hooks.sound?.('swish');
  }

  update(dt, player, camera) {
    const moving = player.onGround && Math.hypot(player.vel.x, player.vel.z) > 0.5;
    if (this.view.update(dt, player.bob, moving) && this.id === 'scythe') {
      const f = new THREE.Vector3(); camera.getWorldDirection(f);
      this.hooks.mow?.(player.pos.x, player.pos.z, f.x, f.z, player.pos.y);
    }
    if (!this.light.off) {
      // the flame sits ahead and to the right of the eyes
      const r = new THREE.Vector3(0.45, 0.05, -0.6).applyQuaternion(camera.quaternion);
      this.light.x = camera.position.x + r.x; this.light.y = camera.position.y + r.y; this.light.z = camera.position.z + r.z;
    }
  }

  render(renderer, camera) { this.view.render(renderer, camera); }
  static isPlaceable(id) { return !!PLACEABLE[id]; }
}
