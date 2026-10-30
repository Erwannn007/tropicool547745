// Rowboats: crafted, set down on the lagoon (blue / red hologram like the
// other placed objects), boarded, rowed from island to island within the
// archipelago. Sitting on the middle thwart, the stick (ZQSD) pulls on the
// oars: forward / back, and to turn one side rows harder than the other, so
// a boat turns on the spot when the oars pull against each other. The oars
// sweep through a real stroke (catch, drive, release, recovery), the blades
// splash and drip, the bow leaves rings. A boat runs aground on the sand and
// knocks against posts; it bobs on the swell even when nobody is in it.
// Jump to get off: onto the nearest dry footing (beach, pier, floor), or
// into the water. Saved per world like placed objects; the axe takes it back.
import * as THREE from 'three';
import { MODELS, BOAT, boatBeam } from './models.js';
import { dress, ghostColor } from './dress.js';
import { worldKey } from './axe.js';
import { getW, setW } from './store.js';

const REACH = 7;
const FLOAT = -0.07; // the keel this far under the surface
const DRAFT = -0.2; // the lagoon bed must lie lower than this under the hull
const EYE = 0.8; // eyes above the thwart, sitting
const MAXV = 4.2, BACKV = 1.6;
const DRIVE = 0.45; // part of the stroke with the blades in the water
// hull outline in the boat frame [along, across] for groundings and bumps
const HULL = [[1.55, 0], [1.15, 0.3], [1.15, -0.3], [0.2, 0.6], [0.2, -0.6], [-0.8, 0.55], [-0.8, -0.55], [-1.5, 0.4], [-1.5, -0.4]];
const ease = (x) => x * x * (3 - 2 * x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Boats {
  constructor(scene, camera, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.list = []; this.riding = null; this.target = null; this.rot = 0;
    this.ghost = null; this.saveT = 0;
    this._v = new THREE.Vector3(); this._q = new THREE.Vector3();
  }

  setWorld(world, player) {
    for (const b of this.list) b.mesh.removeFromParent();
    this.list = []; this.world = world; this.player = player;
    this.riding = null; player.ride = null;
    for (const e of getW('boat', worldKey(world.cfg)) || []) this.spawn(e.x, e.z, e.yaw);
  }
  save() {
    setW('boat', worldKey(this.world.cfg), this.list.map((b) => ({ x: +b.x.toFixed(2), z: +b.z.toFixed(2), yaw: +b.yaw.toFixed(3) })));
  }

  spawn(x, z, yaw) {
    const mesh = dress(MODELS.boat(), 'world');
    // the two oars swing on their own pivots (starboard first)
    const oars = mesh.children.filter((c) => c.userData.hinge).sort((a, b) => b.position.z - a.position.z);
    this.scene.add(mesh);
    const b = { x, z, yaw, v: 0, w: 0, acc: 0, mesh, oars, phase: 0, pow: [0, 0], sw: [0, 0], lift: [0.2, 0.2], seed: Math.random() * 6, wakeD: 0 };
    this.list.push(b);
    this.pose(b);
    return b;
  }
  remove(b) {
    b.mesh.removeFromParent();
    this.list.splice(this.list.indexOf(b), 1);
    this.save();
  }

  // boat frame -> world
  toWorld(b, lx, lz, out = this._v) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    return out.set(b.x + lx * c + lz * s, 0, b.z - lx * s + lz * c);
  }
  // why a hull can't lie there (null: it fits)
  blocked(x, z, yaw, self) {
    const w = this.world, pl = this.player, c = Math.cos(yaw), s = Math.sin(yaw);
    const lim = w.size / 2 - 8;
    for (const [lx, lz] of HULL) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      if (Math.abs(px) > lim || Math.abs(pz) > lim) return 'Trop loin au large';
      const g = w.heightAt(px, pz);
      if (g > 0) return 'Mets-la à l’eau';
      if (g > DRAFT) return 'Pas assez profond';
      if (pl.blocked(px, pz, 0.1)) return 'Pas de place';
      if (pl.solids?.near(px, pz).some((q) => !q.off && q.y0 < 0.75 && Math.abs((px - q.x) * q.ux + (pz - q.z) * q.uz) <= q.hx + 0.1 && Math.abs((px - q.x) * q.vx + (pz - q.z) * q.vz) <= q.hz + 0.1)) return 'Pas de place';
    }
    for (const o of this.list) if (o !== self && Math.hypot(o.x - x, o.z - z) < 2.6) return 'Pas de place';
    return null;
  }

  // ---- setting one down from the bag
  aim(id) {
    if (this.ghost) this.ghost.visible = false;
    this.target = null;
    if (id !== 'boat' || !this.player || this.riding) return;
    const cam = this.camera.position, dir = this.camera.getWorldDirection(this._q);
    if (dir.y > 0.2) return;
    let hit = null;
    for (let d = 0.8; d <= REACH + 3; d += 0.08) {
      const x = cam.x + dir.x * d, y = cam.y + dir.y * d, z = cam.z + dir.z * d;
      if (y <= Math.max(0, this.player.groundAt(x, z, y))) { hit = { x, z }; break; }
    }
    if (!hit) return;
    let yaw = Math.atan2(-dir.z, dir.x) + this.rot; // bow along the view
    yaw = Math.round(yaw / (Math.PI / 12)) * (Math.PI / 12);
    const far = Math.hypot(hit.x - this.player.pos.x, hit.z - this.player.pos.z) > REACH;
    const why = far ? 'Trop loin' : this.blocked(hit.x, hit.z, yaw);
    if (!this.ghost) { this.ghost = dress(MODELS.boat(), 'ghost'); this.ghost.renderOrder = 8; this.scene.add(this.ghost); }
    this.ghost.visible = true;
    this.ghost.position.set(hit.x, FLOAT + 0.02, hit.z); this.ghost.rotation.set(0, yaw, 0);
    ghostColor.value.set(why ? 0xff4a3a : 0x4fa8ff);
    this.target = { x: hit.x, z: hit.z, yaw, ok: !why, why };
  }
  place() {
    const t = this.target;
    if (!t) return false;
    if (!t.ok) { this.hooks.message?.(t.why); this.hooks.sound?.('deny'); return false; }
    const b = this.spawn(t.x, t.z, t.yaw);
    this.save();
    this.hooks.sound?.('board');
    this.hooks.splash?.(new THREE.Vector3(b.x, 0, b.z), 0.9);
    return true;
  }

  // the boat in front of the crosshair, within reach (not the one we sit in)
  aimed(maxD = 3.8) {
    const cam = this.camera.position, dir = this.camera.getWorldDirection(this._q);
    let best = null, bt = Infinity;
    for (const b of this.list) {
      if (b === this.riding) continue;
      for (const lx of [-0.9, 0, 0.9]) {
        const c = this.toWorld(b, lx, 0).setY(0.35);
        const t = c.clone().sub(cam).dot(dir);
        if (t < 0 || t > maxD + 0.7) continue;
        if (cam.clone().addScaledVector(dir, t).distanceTo(c) < 0.75 && t < bt) { bt = t; best = b; }
      }
    }
    return best;
  }

  // ---- getting in and out
  board(b) {
    const pl = this.player;
    this.riding = b;
    b.enter = { t: 0, p: this.camera.position.clone(), yaw: pl.yaw };
    pl.vel.set(0, 0, 0); pl.swimming = false; pl.wading = 0;
    pl.ride = (dt, input, look, frozen) => this.ride(dt, input, look, frozen);
    this.hooks.sound?.('board');
  }
  // jump off: onto the nearest dry footing the player looks towards, else into the water
  leave() {
    const b = this.riding, pl = this.player;
    if (!b) return;
    const dir = this.camera.getWorldDirection(this._q);
    let best = null, bs = -Infinity;
    for (const [lx, lz] of [[0, 1.2], [0, -1.2], [0.9, 1.25], [0.9, -1.25], [-0.9, 1.25], [-0.9, -1.25], [2.1, 0], [2.7, 0], [-2.1, 0], [0, 1.9], [0, -1.9], [1.2, 1.9], [1.2, -1.9]]) {
      const p = this.toWorld(b, lx, lz).clone();
      const g = pl.groundAt(p.x, p.z, 1.6);
      if (g < -0.05 || g > 2.2 || pl.blocked(p.x, p.z, 0.36)) continue;
      const d = Math.hypot(lx, lz), score = ((p.x - b.x) * dir.x + (p.z - b.z) * dir.z) / d - d * 0.15;
      if (score > bs) { bs = score; best = p.setY(g); }
    }
    if (!best) { // over the side, on the looked-at side
      const lz = (dir.x * Math.sin(b.yaw) + dir.z * Math.cos(b.yaw)) >= 0 ? 1.3 : -1.3;
      best = this.toWorld(b, 0, lz).clone().setY(0.3);
    }
    pl.ride = null; this.riding = null; b.enter = null;
    pl.pos.copy(best); pl.vel.set(0, best.y > 0 ? 2.6 : 1, 0); pl.onGround = false;
    b.v *= 0.3;
    this.hooks.sound?.('board');
    this.save();
  }

  // a walker never stands inside a hull (wading, swimming next to it)
  pushOut(pl) {
    if (this.riding || pl.pos.y > 0.55) return;
    for (const b of this.list) {
      const dx = pl.pos.x - b.x, dz = pl.pos.z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > 1.85) continue;
      const half = boatBeam(clamp(lx / BOAT.L + 0.5, 0, 1)) + 0.33;
      if (Math.abs(lz) >= half) continue;
      const nz = (lz >= 0 ? 1 : -1) * half;
      pl.pos.x = b.x + lx * c + nz * s; pl.pos.z = b.z - lx * s + nz * c;
    }
  }

  // ---- rowing (called by the player each frame while seated)
  ride(dt, input, look, frozen) {
    const b = this.riding, pl = this.player;
    if (!frozen) { pl.yaw -= look.x; pl.pitch = clamp(pl.pitch - look.y, -1.35, 1.35); }
    const yaw0 = b.yaw;
    this.step(b, dt, frozen ? 0 : -input.move.y, frozen ? 0 : input.move.x, !frozen && input.sprint);
    pl.yaw += b.yaw - yaw0; // the view turns with the boat
    this.pose(b);
    const seat = b.mesh.localToWorld(this._q.set(BOAT.SEAT_X, BOAT.SEAT_Y + 0.03, 0));
    pl.pos.copy(seat); pl.vel.set(Math.cos(b.yaw) * b.v, 0, -Math.sin(b.yaw) * b.v);
    pl.onGround = true; pl.swimming = false; pl.wading = 0; pl.bob = 0;
    const cam = this.camera;
    cam.position.set(seat.x, seat.y + EYE, seat.z);
    if (b.enter) { // climbing in: slide to the seat and turn towards the bow
      const e = b.enter, k = ease(Math.min(1, (e.t += dt) / 0.55));
      pl.yaw = e.yaw + wrap(b.yaw - Math.PI / 2 - e.yaw) * k;
      cam.position.lerpVectors(e.p, cam.position.clone(), k);
      if (k >= 1) b.enter = null;
    }
    cam.rotation.set(pl.pitch, pl.yaw, 0, 'YXZ');
    if ((this.saveT += dt) > 4) { this.saveT = 0; this.save(); }
  }

  step(b, dt, thrust, steer, hard = false) {
    // each side pulls with its own power: turning rows one side harder
    const want = [clamp(thrust - steer, -1, 1), clamp(thrust + steer, -1, 1)]; // starboard, port
    const rowing = Math.abs(want[0]) > 0.12 || Math.abs(want[1]) > 0.12;
    const f0 = b.phase % 1;
    if (rowing || f0 > 0.02) b.phase += dt * (1.0 + Math.max(Math.abs(want[0]), Math.abs(want[1])) * 0.25) * (hard ? 1.35 : 1); // sprint: rowing harder
    else b.phase = Math.floor(b.phase);
    const f = b.phase % 1, wrapped = f < f0, released = f0 < DRIVE && f >= DRIVE;
    if (wrapped || (rowing && b.pow[0] === 0 && b.pow[1] === 0)) b.pow = want.map((p) => (Math.abs(p) > 0.12 ? p : 0)); // power set at each catch
    if (!rowing && wrapped) b.pow = [0, 0];
    const drive = f < DRIVE ? Math.sin((f / DRIVE) * Math.PI) : 0;
    const v0 = b.v;
    b.v += (b.pow[0] + b.pow[1]) * 0.5 * drive * (hard ? 4.6 : 3.8) * dt;
    b.w += (b.pow[0] - b.pow[1]) * 0.5 * drive * 2.2 * dt; // starboard pulling harder turns to port
    b.v *= Math.exp(-0.42 * dt); b.w *= Math.exp(-1.7 * dt);
    b.v = clamp(b.v, -BACKV, MAXV);
    b.acc = (b.v - v0) / Math.max(dt, 1e-3);

    // move, unless the hull would ground or hit something
    const yaw = b.yaw + b.w * dt, x = b.x + Math.cos(yaw) * b.v * dt, z = b.z - Math.sin(yaw) * b.v * dt;
    if (!this.blocked(x, z, yaw, b)) { b.x = x; b.z = z; b.yaw = yaw; } else {
      if (Math.abs(b.v) > 0.7) { this.hooks.sound?.('boatBump'); if (b === this.riding) this.hooks.rumble?.(0.4, 120); }
      b.v *= -0.25; b.w *= -0.3;
    }

    // oars: sweep from the bow to the stern in the water, lifted on the way back
    for (let k = 0; k < 2; k++) {
      const p = b.pow[k], side = k ? -1 : 1, a = Math.min(1, Math.abs(p) * 1.3);
      let sw = 0.05, lift = 0.22; // resting just above the water
      if (p) {
        const q = f < DRIVE ? ease(f / DRIVE) : 1 - ease((f - DRIVE) / (1 - DRIVE));
        sw = (p > 0 ? 0.55 - q * 1.05 : -0.5 + q * 1.05) * a;
        lift = f < DRIVE ? -0.03 : Math.sin(((f - DRIVE) / (1 - DRIVE)) * Math.PI) * 0.26 + 0.04;
      }
      const r = Math.min(1, dt * (p ? 30 : 5));
      b.sw[k] += (sw - b.sw[k]) * r; b.lift[k] += (lift - b.lift[k]) * r;
      b.oars[k].rotation.set(-b.lift[k] * side, b.sw[k] * side, 0);
      if (p && (wrapped || released) && Math.hypot(b.x - this.camera.position.x, b.z - this.camera.position.z) < 40) {
        const tip = this.bladeTip(b, k);
        if (wrapped) { this.hooks.ripple?.(tip.x, tip.z, 0.45); this.hooks.sound?.('oar'); } else this.drip(tip, 7);
      }
    }
    // the bow cuts rings into the water
    b.wakeD += Math.abs(b.v) * dt;
    if (b.wakeD > 0.8 && Math.abs(b.v) > 0.4) {
      b.wakeD = 0;
      const bow = this.toWorld(b, b.v > 0 ? 1.45 : -1.5, 0);
      this.hooks.ripple?.(bow.x, bow.z, 0.18 + Math.abs(b.v) * 0.08);
      if (Math.abs(b.v) > 1.5) this.drip(bow.setY(0.05), 3);
    }
  }
  bladeTip(b, k) {
    const o = b.oars[k], side = k ? -1 : 1;
    b.mesh.updateMatrixWorld(true);
    const d = this._q.set(0, -0.4, side).normalize().multiplyScalar(BOAT.OAR_OUT - 0.1);
    return o.localToWorld(d.clone());
  }
  drip(p, n) {
    for (let j = 0; j < n; j++) this.hooks.drop?.(p.x + (Math.random() - 0.5) * 0.15, Math.max(0.03, p.y), p.z + (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6);
  }

  // riding the swell: a little heave, pitch and roll, leaning into turns
  pose(b) {
    const t = performance.now() / 1000, m = b.mesh;
    m.position.set(b.x, FLOAT + Math.sin(t * 1.3 + b.x * 0.35 + b.z * 0.2) * 0.03, b.z);
    const pitch = Math.sin(t * 0.9 + b.seed) * 0.014 - clamp(b.acc, -2, 2) * 0.01;
    const roll = Math.sin(t * 1.1 + b.seed * 2) * 0.022 + clamp(b.w * b.v, -2, 2) * 0.03;
    m.rotation.set(roll, b.yaw, pitch, 'YZX');
  }

  update(dt) {
    for (const b of this.list) if (b !== this.riding) { this.step(b, dt, 0, 0); this.pose(b); }
  }
}
