// What the hands show for the new items: the scythe (mowing sweep), the
// pickaxe (overhead stroke, held like the axe), the tiki
// torch (lights the way, flickers), a small version of any placeable, and
// any other item with a model (coconut, wood, stone, fibres, fish) held up
// in front, a little to the right.
// While a loose piece is carried (debris.js holds it in the world) the tool
// is put away.
import * as THREE from 'three';
import { HeldView } from './held.js';
import { MODELS, PICK, itemModel, bittenFish } from './models.js';
import { itemDef } from './items.js';
import { basis } from './axeModel.js';
import { dress } from './dress.js';
import { PLACEABLE } from './placement.js';
import { Blow } from './blow.js';

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
const ITEM_SIZE = { boat: 0.3, 'wood:palm': 0.3, 'wood:tree': 0.3, fibre: 0.26, coconut: 0.15, stone: 0.17, 'block:wood': 0.15, 'block:stone': 0.15, floor: 0.17, wall: 0.17, door: 0.17, window: 0.17, gate: 0.17, bed: 0.2, gable: 0.17, flatroof: 0.17, roof: 0.17, stairs: 0.17 };
const ITEM_TURN = { boat: [0.35, -0.7, 0], 'wood:palm': [0.35, 0.5, 0.25], 'wood:tree': [0.35, 0.5, 0.25], coconut: [0.3, -0.4, 0], stone: [0.4, 0.3, 0], fibre: [0.2, 0.4, -0.5], wall: [0.3, 0.7, 0], door: [0.3, 0.7, 0], window: [0.3, 0.7, 0], stairs: [0.3, -0.8, 0] };

// the pickaxe blow lands where the point of the pick really meets something
// (blow.js): aim fixed at the end of the hang, a whiff once the strike pose
// is passed with nothing met
const PICK_BLOW = { keys: PICKAXE.keys, scale: PICKAXE.scale, pivot: PICKAXE.pivot, tip: PICK.TIP, lock: 0.21, end: 0.262, reach: 2.3 };

// eating: when each bite lands (s) and how far it bites (model x, the head
// is +x; null: the last mouthful), the food held up under the nose
const BITE_T = [0.45, 0.92, 1.4];
const BITES = [0.09, -0.04, null];
const MOUTH = { p: [0.04, -0.08, -0.36], q: Q(0.3, -0.5, -0.12) };
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const _jq = new THREE.Quaternion(), _je = new THREE.Euler();

// crumbs falling from a bite, in the held view's own scene
class Crumbs {
  constructor(scene) {
    this.N = 40;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3).fill(-99), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.012, vertexColors: true }));
    this.pts.frustumCulled = false;
    this.vel = new Float32Array(this.N * 3); this.life = new Float32Array(this.N); this.next = 0;
    scene.add(this.pts);
  }
  emit(p, v, c) {
    const i = this.next = (this.next + 1) % this.N, G = this.pts.geometry.attributes;
    G.position.setXYZ(i, p.x, p.y, p.z); G.color.setXYZ(i, c[0], c[1], c[2]); G.color.needsUpdate = true;
    this.vel.set([v.x, v.y, v.z], i * 3); this.life[i] = 0.6 + Math.random() * 0.3;
  }
  update(dt) {
    const P = this.pts.geometry.attributes.position;
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      any = true; this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 3 * dt;
      P.setXYZ(i, P.getX(i) + this.vel[i * 3] * dt, P.getY(i) + this.vel[i * 3 + 1] * dt, P.getZ(i) + this.vel[i * 3 + 2] * dt);
      if (this.life[i] <= 0) P.setY(i, -99);
    }
    if (any) P.needsUpdate = true;
  }
}

export class Hands {
  constructor(lights, hooks) {
    this.view = new HeldView();
    this.view.onChain = () => hooks.sound?.(this.id === 'pickaxe' ? 'pickSwing' : 'swish');
    this.hooks = hooks;
    this.light = lights.add({ x: 0, y: -999, z: 0, radius: 7, r: 0.75, g: 0.45, b: 0.2, off: true, flicker: 1.4 });
    this.id = null; this.heldId = null;
    this.carried = null; // { body } while a loose piece is in hand
    this.lastYaw = null; this.lastPitch = 0;
    this.blow = new Blow(this.view, PICK_BLOW, hooks);
    this.crumbs = new Crumbs(this.view.scene);
    this.eating = null;
  }

  setHeld(id) {
    this.heldId = id;
    if (this.eating && this.eating.id !== id) this.stopEating();
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
    const fish = !!itemDef(id).fish;
    const inner = dress(itemModel(id), 'held'), g = new THREE.Group();
    const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3());
    inner.position.copy(box.getCenter(new THREE.Vector3())).negate();
    g.add(inner);
    const k = (fish ? 0.34 : ITEM_SIZE[id] ?? 0.22) / Math.max(size.x, size.y, size.z, 1e-3);
    const [pitch, yaw, roll] = fish ? [0.25, 0.15, -0.12] : ITEM_TURN[id] || [0.3, 0.4, 0];
    return [g, { idle: { p: [0.2, -0.09, -0.56], q: Q(pitch, yaw, roll) }, scale: k, flop: id.startsWith('fish:'), centre: inner.position.clone() }];
  }

  // a loose piece picked up: the tool goes down while it is carried
  carry(body) {
    this.carried = { body };
    this.id = 'carry';
    this.blow.swing = null;
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

  // ---------------------------------------------------------------- eating
  // the food is brought up to the mouth, three bites (the model is bitten
  // down each time: tooth marks, white flesh), crumbs, a gulp, and down again
  eat() {
    if (this.eating || !itemDef(this.id ?? '').eat) return false;
    this.eating = { id: this.id, t: 0, bites: 0 };
    return true;
  }
  // something else taken in hand mid-meal: the bitten fish goes back whole
  stopEating() {
    this.eating = null;
    this.view.item = null;
  }
  bite(n) {
    const g = this.view.holder.children[0], food = this.view.anim;
    if (!g || !food) return;
    const cut = BITES[n];
    g.clear();
    if (cut == null) return; // swallowed whole
    const inner = dress(bittenFish(itemModel(this.eating.id), cut), 'held');
    inner.position.copy(food.centre);
    g.add(inner);
    // crumbs falling from the bite
    this.view.holder.updateMatrixWorld();
    const at = new THREE.Vector3(cut, 0, 0).add(food.centre).multiplyScalar(1).applyMatrix4(this.view.holder.matrixWorld);
    const skin = itemDef(this.eating.id).eat === 'burnt' ? [0.16, 0.12, 0.1] : [0.78, 0.5, 0.22];
    for (let k = 0; k < 9; k++) this.crumbs.emit(at, new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.3, (Math.random() - 0.5) * 0.3 + 0.1), k % 3 ? [0.97, 0.9, 0.76] : skin);
  }
  eatPose(dt) {
    const e = this.eating, v = this.view, H = v.holder;
    e.t += dt;
    const t = e.t;
    if (e.bites < BITE_T.length && t >= BITE_T[e.bites]) {
      this.bite(e.bites);
      this.hooks.sound?.(`munch:${itemDef(e.id).eat}`);
      this.hooks.rumble?.(0.15, 40);
      e.bites++;
    }
    if (t >= 1.62 && !e.gulped) { e.gulped = true; this.hooks.sound?.('gulp'); }
    if (t >= 1.95) {
      const id = e.id;
      this.eating = null;
      this.view.item = null; // the next one comes up from below, whole
      this.hooks.ate?.(id);
      this.setHeld(this.heldId);
      return;
    }
    const up = t < 0.32 ? ease(t / 0.32) : t < 1.6 ? 1 : 1 - ease((t - 1.6) / 0.3);
    let jerk = 0; // each bite: pulled to the teeth, then torn away
    for (const b of BITE_T) { const d = t - b + 0.08; if (d > 0 && d < 0.3) jerk = Math.max(jerk, d < 0.08 ? d / 0.08 : 1 - (d - 0.08) / 0.22); }
    const idle = v.anim.idle, chew = Math.sin(t * 22) * 0.004 * up;
    H.position.set(
      idle.p[0] + (MOUTH.p[0] - idle.p[0]) * up,
      idle.p[1] + (MOUTH.p[1] - idle.p[1]) * up + jerk * 0.035 + chew,
      idle.p[2] + (MOUTH.p[2] - idle.p[2]) * up + jerk * 0.06,
    );
    H.quaternion.copy(idle.q).slerp(MOUTH.q, up).multiply(_jq.setFromEuler(_je.set(-jerk * 0.25, 0, jerk * 0.1)));
  }

  update(dt, player, camera) {
    const moving = player.onGround && Math.hypot(player.vel.x, player.vel.z) > 0.5;
    const look = { x: this.lastYaw == null ? 0 : this.lastYaw - player.yaw, y: this.lastYaw == null ? 0 : this.lastPitch - player.pitch };
    this.lastYaw = player.yaw; this.lastPitch = player.pitch;
    if (this.id === 'pickaxe') this.blow.aim(camera);
    if (this.view.update(dt, player.bob, moving, look)) {
      if (this.id === 'scythe') {
        const f = new THREE.Vector3(); camera.getWorldDirection(f);
        this.hooks.mow?.(player.pos.x, player.pos.z, f.x, f.z, player.pos.y);
      }
    }
    if (this.id === 'pickaxe') this.blow.sweep(camera);
    if (this.eating && this.view.anim) this.eatPose(dt);
    this.crumbs.update(dt);
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

  render(renderer, camera) { this.view.render(renderer, camera); }
  static isPlaceable(id) { return !!PLACEABLE[id]; }
}
