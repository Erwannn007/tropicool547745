// What the hands show for the new items: the scythe (mowing sweep), the
// pickaxe (overhead stroke, held like the axe), the tiki
// torch (lights the way, flickers), a small version of any placeable, and
// any other item with a model (coconut, wood, stone, fibres, fish) held up
// in front, a little to the right.
// While a loose piece is carried (debris.js holds it in the world) the tool
// is put away.
import * as THREE from 'three';
import { HeldView } from './held.js';
import { MODELS, PICK, fishModelFor } from './models.js';
import { itemDef } from './items.js';
import { basis } from './axeModel.js';
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

// Pickaxe: held like the axe (axeModel.js), the long handle reaching from the
// bottom-right corner, the point turned forward a little to the left. Blow:
// raised over the right shoulder, a held beat, a fast stroke down in front
// (aimed at what the crosshair shows, see aimSwing), a recoil off the stone
// and a soft return. The model's handle is +Y, its point -X.
const P_IDLE = { t: 0, p: [0.27, -0.66, -0.36], q: basis([-0.1, 0.9, -0.42], [-0.33, 0.05, -0.94]) }; // head up near the crosshair
const PICKAXE = {
  idle: P_IDLE,
  scale: 1,
  pivot: new THREE.Vector3(0, 0.12, 0), // where the (unseen) hands hold it
  contact: true,
  keys: [
    P_IDLE,
    { t: 0.17, p: [0.3, -0.5, -0.3], q: basis([0.26, 0.86, -0.22], [-0.22, 0.4, -0.89]), e: 'out' },     // raised over the right shoulder
    { t: 0.21, p: [0.31, -0.48, -0.28], q: basis([0.28, 0.87, -0.16], [-0.22, 0.45, -0.86]), e: 'inOut' }, // hang
    { t: 0.255, p: [0.16, -0.36, -0.4], q: basis([-0.38, 0.3, -0.87], [-0.42, -0.9, 0.0]), e: 'in' },     // strike down in front
    { t: 0.3, p: [0.15, -0.37, -0.4], q: basis([-0.36, 0.38, -0.85], [-0.4, -0.88, 0.1]), e: 'out' },     // recoil off the stone
    { t: 0.36, p: [0.14, -0.38, -0.4], q: basis([-0.38, 0.32, -0.86], [-0.4, -0.9, 0.05]), e: 'inOut' },  // settle
    { ...P_IDLE, t: 0.66, e: 'inOut' },                                                                   // back up
  ],
  impact: 0.255,
  trail: { tip: PICK.TIP.toArray(), inner: [-0.08, PICK.HY, 0], from: 0.2, to: 0.26, life: 0.12 },
};

const TORCH = { idle: { p: [0.36, -0.86, -0.66], q: Q(-0.1, 0.25, -0.16) }, scale: 0.5 };
const MINI = {
  transat: { idle: { p: [0.36, -0.44, -0.78], q: Q(0.45, -0.7, 0.05) }, scale: 0.22 },
  parasol: { idle: { p: [0.4, -0.62, -0.8], q: Q(0.15, 0.4, -0.12) }, scale: 0.24 },
  campfire: { idle: { p: [0.34, -0.42, -0.72], q: Q(0.5, 0.4, 0) }, scale: 0.36 },
  chest: { idle: { p: [0.36, -0.36, -0.76], q: Q(0.42, -0.5, 0) }, scale: 0.17 },
  book: { idle: { p: [0.27, -0.2, -0.56], q: Q(-0.25, -0.45, 0.1) }, scale: 1.1 },
};

// Plain items: shown at about the same size whatever the model, turned to
// read well (pitch, yaw, roll); fish lie across the hand, head to the left.
const ITEM_SIZE = { 'wood:palm': 0.3, 'wood:tree': 0.3, fibre: 0.26, coconut: 0.15, stone: 0.17 };
const ITEM_TURN = { 'wood:palm': [0.35, 0.5, 0.25], 'wood:tree': [0.35, 0.5, 0.25], coconut: [0.3, -0.4, 0], stone: [0.4, 0.3, 0], fibre: [0.2, 0.4, -0.5] };
function itemModel(id) {
  if (MODELS[id]) return MODELS[id]();
  if (id?.startsWith('fish:')) return fishModelFor(id, itemDef(id).fish.c);
  return null;
}

// the pickaxe blow: the head is aimed at what the crosshair shows, then the
// swept point of the pick is cast into the world frame by frame and the blow
// lands where it really meets something (no timed hit)
const LOCK = 0.21;      // end of the hang: the aim is fixed, the stroke starts
const SWEEP_END = 0.262; // strike pose passed and nothing met: the stroke went through air
const REACH = 2.3;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Hands {
  constructor(lights, hooks) {
    this.view = new HeldView();
    this.view.onChain = () => hooks.sound?.(this.id === 'pickaxe' ? 'pickSwing' : 'swish');
    this.hooks = hooks;
    this.light = lights.add({ x: 0, y: -999, z: 0, radius: 7, r: 0.75, g: 0.45, b: 0.2, off: true, flicker: 1.4 });
    this.id = null; this.heldId = null;
    this.carried = null; // { body } while a loose piece is in hand
    this.lastYaw = null; this.lastPitch = 0;
    this.swing = null;
  }

  setHeld(id) {
    this.heldId = id;
    if (this.carried) return; // the stone in hand stays until it is dropped or thrown
    this.id = id;
    if (id === 'scythe') this.view.set(id, dress(MODELS.scythe(), 'held'), SCYTHE);
    else if (id === 'pickaxe') this.view.set(id, dress(MODELS.pickaxe(), 'held'), { ...PICKAXE, keys: PICKAXE.keys.map((k) => ({ ...k })) });
    else if (id === 'torch') this.view.set(id, dress(MODELS.torch(), 'held'), TORCH);
    else if (MINI[id]) this.view.set(id, dress(MODELS[id](), 'held'), MINI[id]);
    else if (id && !['rod', 'axe', 'book'].includes(id) && itemModel(id)) this.view.set(id, ...this.itemView(id));
    else this.view.set(null, null, null);
    this.light.off = id !== 'torch';
  }

  // ---------------------------------------------------------------- carrying
  // any item with a model, centred and scaled to a hand-held size
  itemView(id) {
    const fish = id.startsWith('fish:');
    const inner = dress(itemModel(id), 'held'), g = new THREE.Group();
    const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3());
    inner.position.copy(box.getCenter(new THREE.Vector3())).negate();
    g.add(inner);
    const k = (fish ? 0.34 : ITEM_SIZE[id] ?? 0.22) / Math.max(size.x, size.y, size.z, 1e-3);
    const [pitch, yaw, roll] = fish ? [0.25, 0.15, -0.12] : ITEM_TURN[id] || [0.3, 0.4, 0];
    return [g, { idle: { p: [0.2, -0.09, -0.56], q: Q(pitch, yaw, roll) }, scale: k, flop: fish }];
  }

  // a loose piece picked up: the tool goes down while it is carried
  carry(body) {
    this.carried = { body };
    this.id = 'carry';
    this.swing = null;
    this.view.set(null, null, null);
    this.light.off = true;
  }
  // stone gone from the hand (dropped, thrown, put in the bag): tool back up
  endCarry() {
    if (!this.carried) return;
    this.carried = null;
    this.id = null;
    this.setHeld(this.heldId);
  }

  action() {
    if (this.id === 'scythe' && this.view.swing()) this.hooks.sound?.('swish');
    if (this.id === 'pickaxe' && this.view.swing()) this.hooks.sound?.('pickSwing');
  }

  update(dt, player, camera) {
    const moving = player.onGround && Math.hypot(player.vel.x, player.vel.z) > 0.5;
    const look = { x: this.lastYaw == null ? 0 : this.lastYaw - player.yaw, y: this.lastYaw == null ? 0 : this.lastPitch - player.pitch };
    this.lastYaw = player.yaw; this.lastPitch = player.pitch;
    if (this.id === 'pickaxe') this.aimSwing(camera);
    if (this.view.update(dt, player.bob, moving, look)) {
      if (this.id === 'scythe') {
        const f = new THREE.Vector3(); camera.getWorldDirection(f);
        this.hooks.mow?.(player.pos.x, player.pos.z, f.x, f.z, player.pos.y);
      }
    }
    if (this.id === 'pickaxe') this.sweep(camera);
    if (this.view.anim?.flop) { // a fish held up flips its tail now and then
      const t = performance.now() / 1000, f = Math.max(0, Math.sin(t * 1.3)) ** 6;
      this.view.holder.children[0].rotation.set(0, Math.sin(t * 22) * 0.35 * f, Math.sin(t * 22 + 1) * 0.08 * f);
    }
    if (!this.light.off) {
      // the flame sits ahead and to the right of the eyes
      const r = new THREE.Vector3(0.45, 0.05, -0.6).applyQuaternion(camera.quaternion);
      this.light.x = camera.position.x + r.x; this.light.y = camera.position.y + r.y; this.light.z = camera.position.z + r.z;
    }
  }

  // ---------------------------------------------------------------- the blow
  // held space <-> world: a held point maps onto the world ray through the
  // same pixel, at its held distance times k (k fixed for each stroke)
  toWorld(ph, camera, k) {
    const ndc = _v.copy(ph).project(this.view.camera);
    const dir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    return dir.multiplyScalar(ph.length() * k).add(camera.position);
  }
  // the point of the pick at time t of the stroke (held space)
  tipAt(t) {
    const { p, q } = this.view.pose(t);
    return PICK.TIP.clone().multiplyScalar(PICKAXE.scale).applyQuaternion(q).add(_v.set(...p)).clone();
  }

  // before the stroke: aim the strike pose at the spot under the crosshair
  aimSwing(camera) {
    const v = this.view;
    if (v.t < 0) { this.swing = null; return; }
    if (!this.swing || v.t < this.swing.t) this.swing = { t: 0, locked: false, struck: false, lastT: LOCK, k: 2 }; // new stroke (or chained)
    const sw = this.swing;
    sw.t = v.t;
    if (sw.locked || !v.anim?.contact) return;
    camera.updateMatrixWorld();
    v.camera.aspect = camera.aspect; v.camera.updateProjectionMatrix();
    const target = this.hooks.aim?.(REACH);
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const point = target ? target.point : camera.position.clone().addScaledVector(dir, 1.9);
    const D = point.distanceTo(camera.position);
    const Hd = Math.max(0.56, Math.min(0.8, 0.44 + 0.15 * D));
    const ndc = point.clone().project(camera);
    const th = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(v.camera).normalize().multiplyScalar(Hd + 0.05); // a little past the surface
    sw.k = D / Hd; sw.target = target;
    this.solveStrike(th);
    if (v.t >= LOCK) sw.locked = true;
  }

  // turn the strike key about the grip so the point lands on th (held space)
  solveStrike(th) {
    const base = PICKAXE.keys, keys = this.view.anim.keys, s = PICKAXE.scale, pv = PICKAXE.pivot;
    const G0 = new THREE.Vector3(...base[3].p).add(pv.clone().multiplyScalar(s).applyQuaternion(base[3].q));
    const T0 = new THREE.Vector3(...base[3].p).add(PICK.TIP.clone().multiplyScalar(s).applyQuaternion(base[3].q));
    const v0 = T0.clone().sub(G0), R = v0.length();
    const Gp = G0.clone().addScaledVector(th.clone().sub(T0), 0.35); // the arm reaches a bit towards it
    const u = th.clone().sub(Gp).normalize();
    const G = th.clone().addScaledVector(u, -R);
    const r = new THREE.Quaternion().setFromUnitVectors(v0.divideScalar(R), u);
    const shift = G.clone().sub(G0);
    const place = (i, kr, ks) => {
      const rq = new THREE.Quaternion().slerp(r, kr);
      const q = rq.multiply(base[i].q);
      const g = new THREE.Vector3(...base[i].p).add(pv.clone().multiplyScalar(s).applyQuaternion(base[i].q)).addScaledVector(shift, ks);
      keys[i] = { ...base[i], q, p: g.sub(pv.clone().multiplyScalar(s).applyQuaternion(q)).toArray() };
    };
    place(1, 0.4, 0.3); place(2, 0.45, 0.35); place(3, 1, 1); place(4, 1, 1); place(5, 1, 0.9);
  }

  // during the stroke: sweep the point of the pick through the world, in
  // small time steps whatever the frame rate, up to the end of the stroke
  sweep(camera) {
    const sw = this.swing, v = this.view;
    if (!sw?.locked || sw.struck) return;
    camera.updateMatrixWorld();
    const end = Math.min(v.t, SWEEP_END);
    let prev = this.toWorld(this.tipAt(sw.lastT), camera, sw.k), dir = new THREE.Vector3(0, -1, 0);
    for (let t = sw.lastT; t < end - 1e-6;) {
      const t1 = Math.min(end, t + 0.008);
      const tip = this.toWorld(this.tipAt(t1), camera, sw.k), seg = tip.clone().sub(prev), len = seg.length();
      if (len > 1e-5) {
        dir = seg.divideScalar(len);
        const c = this.hooks.cast?.(prev, dir, len);
        if (c) return this.strike(c, dir, t1);
      }
      prev = tip; t = t1;
    }
    sw.lastT = end;
    if (v.t < SWEEP_END) return;
    // nothing met: a whiff, the pick follows through further down
    sw.struck = true;
    this.hooks.hit?.(null, dir);
    const keys = v.anim.keys, k2 = keys[2], k3 = keys[3];
    const d = k3.q.clone().multiply(k2.q.clone().invert());
    const q = new THREE.Quaternion().slerp(d, 0.3).multiply(k3.q);
    keys[4] = { ...keys[4], q, p: k3.p.map((x, j) => x + (x - k2.p[j]) * 0.15) };
    keys[5] = { ...keys[5], q: q.clone(), p: keys[4].p.slice() };
  }

  // the point met c at time t: the pick stops right there and bounces back
  strike(c, dir, t) {
    const v = this.view, keys = v.anim.keys;
    this.swing.struck = true;
    const here = v.pose(t);
    const at = { ...keys[3], p: here.p, q: here.q };
    const bounce = this.hooks.hit?.(c, dir) ?? 0;
    const back = (k, f) => ({ ...k, p: at.p.map((x, j) => x + (keys[2].p[j] - x) * f), q: at.q.clone().slerp(keys[2].q, f) });
    keys[3] = at;
    keys[4] = back(keys[4], 0.06 + bounce * 0.2);
    keys[5] = back(keys[5], 0.02 + bounce * 0.08);
    v.t = this.swing.t = keys[3].t; // (not a new stroke)
  }

  render(renderer, camera) { this.view.render(renderer, camera); }
  static isPlaceable(id) { return !!PLACEABLE[id]; }
}
