// What the hands show for the new items: the scythe (mowing sweep), the tiki
// torch (lights the way, flickers) and a small version of any placeable.
import * as THREE from 'three';
import { HeldView } from './held.js';
import { MODELS } from './models.js';
import { dress } from './dress.js';
import { PLACEABLE } from './placement.js';

const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));

// Scythe: held upright in the right hand, the blade at the top pointing to
// the middle of the screen. The blow is a curved stroke from high on the
// right down to the bottom left, with a wind trail behind the blade.
// frame(A, B): A = direction heel <- grip (up the snath), B = blade direction
const GRIP_DIR = new THREE.Vector3(0.32, 0.25, 0.86).normalize().negate(); // model: from grip up to the heel
function frame(A, B) {
  const basis = (a, b) => {
    const y = a.clone().normalize(), x = b.clone().addScaledVector(y, -b.dot(y)).normalize(), z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const mModel = basis(GRIP_DIR, new THREE.Vector3(-1, 0, 0));
  const mTarget = basis(new THREE.Vector3(...A), new THREE.Vector3(...B));
  return new THREE.Quaternion().setFromRotationMatrix(mTarget.multiply(mModel.transpose()));
}
const sk = (t, p, A, B, e) => ({ t, p, q: frame(A, B), e });
const S_IDLE = sk(0, [0.3, 0.03, -0.78], [-0.12, 1, -0.08], [-0.8, 0.12, -0.6]);
// the stroke: a wide flat arc around the player, far right to far left,
// the snath always coming from the hands at the bottom right
const GRIP = [0.28, -0.72, -0.22];
function arcKey(t, theta, lift, e, raise = 0) {
  const p = [0.02 + Math.sin(theta) * 0.62, -0.12 + lift, -0.3 - Math.cos(theta) * 0.7];
  const A = [p[0] - GRIP[0], p[1] - GRIP[1], p[2] - GRIP[2]];
  const B = [-Math.cos(theta), -0.12 + raise, -Math.sin(theta) - 0.15]; // blade leads the motion
  return sk(t, p, A, B, e);
}
const SCYTHE = {
  idle: S_IDLE,
  scale: 0.62,
  keys: [
    S_IDLE,
    arcKey(0.2, 1.15, 0.24, 'out', 0.5),   // wind up far to the right, blade lifted
    arcKey(0.27, 1.22, 0.26, 'inOut', 0.5), // hang
    arcKey(0.31, 0.72, 0.1, 'in'),          // the sweep starts...
    arcKey(0.35, 0.0, 0.0, 'lin'),          // ...right across the middle...
    arcKey(0.39, -0.7, 0.02, 'lin'),        // ...and out to the left
    arcKey(0.46, -1.1, 0.1, 'out', 0.15),   // follow-through, far left
    sk(0.86, S_IDLE.p, [-0.12, 1, -0.08], [-0.8, 0.12, -0.6], 'inOut'), // back upright
  ],
  impact: 0.35,
  trail: { tip: [-0.6, 0, 0.25], inner: [-0.18, 0, 0.0], from: 0.29, to: 0.47, life: 0.2 },
};

const TORCH = { idle: { p: [0.36, -0.86, -0.66], q: Q(-0.1, 0.25, -0.16) }, scale: 0.5 };
const MINI = {
  transat: { idle: { p: [0.36, -0.44, -0.78], q: Q(0.45, -0.7, 0.05) }, scale: 0.22 },
  parasol: { idle: { p: [0.4, -0.62, -0.8], q: Q(0.15, 0.4, -0.12) }, scale: 0.24 },
  campfire: { idle: { p: [0.34, -0.42, -0.72], q: Q(0.5, 0.4, 0) }, scale: 0.36 },
  chest: { idle: { p: [0.36, -0.36, -0.76], q: Q(0.42, -0.5, 0) }, scale: 0.17 },
  book: { idle: { p: [0.27, -0.2, -0.56], q: Q(-0.25, -0.45, 0.1) }, scale: 1.1 },
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
    if (id === 'scythe') this.view.set(id, dress(MODELS.scythe(), 'held'), SCYTHE);
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
