// What the hands show for the new items: the scythe (mowing sweep), the
// pickaxe (overhead stroke, held in the player's fist), the tiki
// torch (lights the way, flickers), a small version of any placeable, and a
// piece of stone carried in the open hand (picked up from the ground).
import * as THREE from 'three';
import { HeldView } from './held.js';
import { MODELS, PICK, handModel } from './models.js';
import { basis, bandedMaterial } from './axeModel.js';
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

// Pickaxe: held upright in the right hand, the head just above the middle of
// the screen, turned a little to the left. Blow: rocked back over the
// shoulder, a held beat, a fast overhead stroke down in front, a small recoil
// off the stone and a soft return. The model's handle is +Y, its point -X.
// pk(t, position, pitch (+ = top towards the player), yaw (+ = left), roll (+ = top leans left))
const pk = (t, p, pitch, yaw, roll, e) => {
  const eu = new THREE.Euler(pitch, yaw, roll, 'YXZ');
  return { t, p, q: basis(new THREE.Vector3(0, 1, 0).applyEuler(eu).toArray(), new THREE.Vector3(0, 0, -1).applyEuler(eu).toArray()), e };
};
// the fist on the handle sits in the bottom-right corner, in view
const up = ([x, y, z]) => [x + 0.06, y + 0.12, z];
const P_IDLE = pk(0, [0.48, -0.44, -0.7], -0.08, 0.85, 0.2); // leaning a little to the side
const PICKAXE = {
  idle: P_IDLE,
  scale: 0.86,
  pivot: new THREE.Vector3(0, 0.29, 0), // the fist on the handle (models.js HAND)
  contact: true,
  keys: [
    P_IDLE,
    pk(0.17, up([0.34, -0.55, -0.72]), 0.42, 0.7, -0.05, 'out'),   // raised back over the shoulder
    pk(0.21, up([0.35, -0.54, -0.72]), 0.48, 0.69, -0.06, 'inOut'), // hang
    pk(0.255, up([0.2, -0.68, -0.66]), -0.68, 0.5, 0.1, 'in'),      // strike down in front (aimed, hands.js)
    pk(0.3, up([0.21, -0.66, -0.66]), -0.52, 0.52, 0.09, 'out'),    // recoil off the stone
    pk(0.36, up([0.22, -0.67, -0.67]), -0.6, 0.54, 0.09, 'inOut'),  // settle
    { ...P_IDLE, t: 0.66, e: 'inOut' },                              // back up
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

// the pickaxe blow: the head is aimed at what the crosshair shows, then the
// swept point of the pick is cast into the world frame by frame and the blow
// lands where it really meets something (no timed hit)
const LOCK = 0.21;      // end of the hang: the aim is fixed, the stroke starts
const SWEEP_END = 0.262; // strike pose passed and nothing met: the stroke went through air
const REACH = 2.3;
const ELBOW = new THREE.Vector3(0.42, -0.8, 0.05); // held space, out of view at the bottom right
const CARRY = {
  idle: { p: [0.16, -0.17, -0.5], q: Q(0.45, 0.75, -0.1) }, // fingers curled round the stone on the left
  scale: 1,
  keys: [
    { t: 0, p: [0.16, -0.17, -0.5], q: Q(0.45, 0.75, -0.1) },
    { t: 0.13, p: [0.24, -0.09, -0.36], q: Q(0.7, -0.35, 0.1), e: 'out' },   // drawn back by the shoulder
    { t: 0.24, p: [0.05, -0.02, -0.72], q: Q(-0.2, -0.05, 0), e: 'in' },     // flung forward: it leaves the hand here
    { t: 0.5, p: [0.14, -0.32, -0.55], q: Q(0.1, -0.2, 0), e: 'out' },       // hand follows through and drops away
  ],
  impact: 0.22,
};
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Hands {
  constructor(lights, hooks) {
    this.view = new HeldView();
    this.view.onChain = () => hooks.sound?.(this.id === 'pickaxe' ? 'pickSwing' : 'swish');
    this.hooks = hooks;
    this.light = lights.add({ x: 0, y: -999, z: 0, radius: 7, r: 0.75, g: 0.45, b: 0.2, off: true, flicker: 1.4 });
    this.id = null; this.heldId = null;
    this.carried = null; // { body, stone, spin, spinTo, thrown }
    // forearm and its woven bracelet, stretched from the wrist to the elbow
    const arm = handModel('arm');
    this.forearm = dress(arm, 'held'); this.band = dress(arm.band, 'held');
    this.view.extra.add(this.forearm, this.band);
    this.view.extra.visible = false;
    this.wrist = null;
    this.lastYaw = null; this.lastPitch = 0;
    this.swing = null;
  }

  // the side of the handle the palm and wrist are on: towards the elbow
  fist() {
    const { p, q } = P_IDLE, s = PICKAXE.scale;
    const grip = new THREE.Vector3(...p).add(PICKAXE.pivot.clone().multiplyScalar(s).applyQuaternion(q));
    const side = ELBOW.clone().sub(grip).applyQuaternion(q.clone().invert());
    side.y = 0;
    return handModel('fist', side.normalize());
  }

  setHeld(id) {
    this.heldId = id;
    if (this.carried) return; // the stone in hand stays until it is dropped or thrown
    this.id = id;
    this.wrist = null;
    if (id === 'scythe') this.view.set(id, dress(MODELS.scythe(), 'held'), SCYTHE);
    else if (id === 'pickaxe') {
      const g = dress(MODELS.pickaxe(), 'held'), hand = this.fist();
      g.add(dress(hand, 'held'));
      this.wrist = hand.wrist;
      this.view.set(id, g, { ...PICKAXE, keys: PICKAXE.keys.map((k) => ({ ...k })) });
    } else if (id === 'torch') this.view.set(id, dress(MODELS.torch(), 'held'), TORCH);
    else if (MINI[id]) this.view.set(id, dress(MODELS[id](), 'held'), MINI[id]);
    else this.view.set(null, null, null);
    this.light.off = id !== 'torch';
  }

  // ---------------------------------------------------------------- carrying
  // a piece of stone lifted from the ground sits in the open palm
  carry(body) {
    const g = new THREE.Group(), cup = handModel('cup');
    g.add(dress(cup, 'held'));
    this.stoneMat ??= bandedMaterial(this.hooks.stoneTex(), { vertexColors: true });
    const stone = new THREE.Mesh(body.shard.geo, this.stoneMat);
    const k = Math.min(body.s, 0.09); // big pieces are shown a little smaller and further
    stone.scale.setScalar(k);
    stone.quaternion.copy(body.mesh.quaternion);
    g.add(stone);
    this.carried = { body, stone, k, spin: 0, spinTo: 0, thrown: false };
    this.id = 'carry';
    this.wrist = cup.wrist;
    this.swing = null;
    const far = Math.max(0, body.s - 0.09) * 0.8; // a big piece is held a little further out
    const idle = { p: [CARRY.idle.p[0] + far * 0.3, CARRY.idle.p[1] - far * 0.2, CARRY.idle.p[2] - far], q: CARRY.idle.q };
    this.view.set('carry:' + body.id, g, { ...CARRY, idle, keys: [{ ...idle, t: 0 }, ...CARRY.keys.slice(1)] });
    this.light.off = true;
  }
  // turn the stone in the hand to look at it from another side
  turnCarried() { if (this.carried) this.carried.spinTo += Math.PI / 3; }
  throwCarried() {
    if (!this.carried || this.carried.thrown) return false;
    if (this.view.swing()) { this.carried.thrown = true; this.hooks.sound?.('toss'); }
    return true;
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
      } else if (this.id === 'carry' && this.carried?.thrown) {
        this.carried.stone.visible = false;
        this.hooks.throwNow?.();
      }
    }
    if (this.id === 'pickaxe') this.sweep(camera);
    if (this.carried) {
      const c = this.carried;
      if (c.thrown && !this.view.swinging) this.hooks.carryDone?.();
      else if (c.stone.visible) { // turn it, then rest its lowest point on the palm
        c.spin += (c.spinTo - c.spin) * (1 - Math.exp(-dt * 8));
        c.stone.quaternion.copy(c.body.mesh.quaternion).premultiply(_q.setFromAxisAngle(_v.set(0.3, 1, 0.2).normalize(), c.spin));
        let low = 0;
        for (const h of c.body.shard.hull) low = Math.min(low, _v.copy(h).applyQuaternion(c.stone.quaternion).y);
        c.stone.position.set(0, -low * c.k + 0.012, -0.01);
      }
    }
    this.poseArm();
    if (!this.light.off) {
      // the flame sits ahead and to the right of the eyes
      const r = new THREE.Vector3(0.45, 0.05, -0.6).applyQuaternion(camera.quaternion);
      this.light.x = camera.position.x + r.x; this.light.y = camera.position.y + r.y; this.light.z = camera.position.z + r.z;
    }
  }

  // forearm from the wrist of the hand in view back to the elbow
  poseArm() {
    const on = !!this.wrist && this.view.visible;
    this.view.extra.visible = on;
    if (!on) return;
    const h = this.view.holder;
    h.updateMatrixWorld(true);
    const w = h.localToWorld(this.wrist.clone()), d = ELBOW.clone().sub(w), len = d.length();
    _q.setFromUnitVectors(_v.set(0, 1, 0), d.divideScalar(len));
    const s = h.scale.x;
    this.forearm.position.copy(w); this.forearm.quaternion.copy(_q); this.forearm.scale.set(s, len, s);
    this.band.position.copy(w).addScaledVector(d, 0.03 * s); this.band.quaternion.copy(_q); this.band.scale.setScalar(s);
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

  // turn the strike key about the fist so the point lands on th (held space)
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
