// Loose physical objects lying in the world: the pieces of a broken stone,
// the logs and coconuts of a felled tree.
// Each piece is a small rigid body (irregular shard, gravity, contacts with
// the ground on its own hull points so it tumbles and comes to rest on a
// flat face, a bounce or two, rolling friction, trunks and stones in the
// way, the other pieces, the lagoon). Bodies fall asleep once still and cost
// nothing until something wakes them. The player can aim at one, pick it up
// (it then sits in the hand, see hands.js), drop it, throw it, or put it in
// the bag: picking up and storing are separate actions.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { itemModel } from './models.js';
import { ITEMS } from './items.js';
import { dress } from './dress.js';
import { cutBlock, platePlanes } from './vegetation.js';

const G = 11;
const MAX_BODIES = 36;       // older pieces crumble away past this
const REACH = 2.6;           // how far the hand reaches to pick a piece up
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Irregular shard (radius ~1): a block of the boulder's old plates with two
// or three fresh fracture planes through it (aFresh = 1 on those, pale new
// stone). Returns the geometry plus a few hull points used for the contacts.
export function makeShard(seed, stretch) {
  const rnd = mulberry32(seed * 7 + 3);
  const nc = 2 + (rnd() < 0.6 ? 1 : 0);
  const breaks = [];
  for (let i = 0; i < nc; i++) breaks.push({ n: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), c: 0.35 + rnd() * 0.3 });
  const { geo: g, ids } = cutBlock([...platePlanes(rnd, 9, 0.7, 0.95), ...breaks], { subdiv: 1, scale: stretch.toArray() });
  const P = g.attributes.position, N = g.attributes.normal;
  const fresh = new Float32Array(P.count), uv = new Float32Array(P.count * 2), col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const on = ids[Math.floor(i / 3)] >= 9;
    fresh[i] = on ? 1 : 0;
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    const [u, w] = ay > ax && ay > az ? [P.getX(i), P.getZ(i)] : ax > az ? [P.getZ(i), P.getY(i)] : [P.getX(i), P.getY(i)];
    uv[i * 2] = u * 0.11; uv[i * 2 + 1] = w * 0.11;
    col.set(on ? [1.25, 1.2, 1.12] : [1, 1, 1], i * 3);
  }
  g.setAttribute('aFresh', new THREE.BufferAttribute(fresh, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { geo: g, ...hullOf(P), mean: (stretch.x + stretch.y + stretch.z) / 3 };
}

// a few points of the outline (the furthest vertex in each of 26
// directions) for the ground contacts, and the radius
function hullOf(P) {
  const hull = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const d = _n.set(x, y, z).normalize();
    let best = -1e9, bi = 0;
    for (let i = 0; i < P.count; i++) { const k = _v.fromBufferAttribute(P, i).dot(d); if (k > best) { best = k; bi = i; } }
    const p = new THREE.Vector3().fromBufferAttribute(P, bi);
    if (!hull.some((h) => h.distanceToSquared(p) < 1e-4)) hull.push(p);
  }
  let r = 0;
  for (const h of hull) r = Math.max(r, h.length());
  return { hull, r };
}

// shape of a modelled item lying in the world (log, coconut): its parts
// merged for the hull, centred on its middle
const itemShapes = new Map();
export const hasModel = (kind) => !!kind && !ITEMS[kind]?.build && !!itemModel(kind); // (building pieces are placed, not dropped)
function itemShape(kind) {
  if (!itemShapes.has(kind)) {
    const model = itemModel(kind);
    const box = new THREE.Box3();
    for (const p of model.parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
    const centre = box.getCenter(new THREE.Vector3());
    const pts = [];
    for (const p of model.parts) { const P = p.geo.attributes.position; for (let i = 0; i < P.count; i++) pts.push(P.getX(i) - centre.x, P.getY(i) - centre.y, P.getZ(i) - centre.z); }
    itemShapes.set(kind, { model, centre, ...hullOf(new THREE.Float32BufferAttribute(pts, 3)) });
  }
  return itemShapes.get(kind);
}

// a few shapes: chunky lumps, flat slabs, long wedges
const SHAPES = [[1, 0.8, 0.9], [1.25, 0.45, 0.95], [1.35, 0.7, 0.55], [0.95, 0.95, 0.85], [1.1, 0.55, 0.7], [0.8, 0.65, 1.2]];

export class Debris {
  constructor(scene, hooks) {
    this.scene = scene; this.hooks = hooks;
    this.bodies = [];
    this.shards = SHAPES.map((s, i) => makeShard(410 + i * 37, new THREE.Vector3(...s)));
    this.carried = null;   // the piece in the player's hand
    this.aimed = null;     // the piece the player could pick up
    this.clackT = 0; this.id = 0;
  }

  setWorld(world, veg, player) {
    for (const b of this.bodies) b.mesh.removeFromParent();
    this.bodies = []; this.carried = null; this.aimed = null;
    this.world = world; this.player = player;
    this.mats = veg.fragmentMaterials();
  }

  // a new piece of `kind` at pos (world), of size s (metres, about its radius)
  spawn(pos, s, vel, spin, { shape, kind = 'stone', value = 1 } = {}) {
    const sh = this.shards[shape ?? Math.floor(Math.random() * this.shards.length)];
    const mesh = new THREE.Mesh(sh.geo, this.mats.base);
    mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    return this.add(mesh, sh, s, pos, vel, spin, kind, value, { base: [this.mats.base], hi: [this.mats.hi] });
  }

  // a modelled item (a log, a coconut) dropped into the world
  spawnItem(kind, pos, quat, vel, spin, value = 1) {
    const sh = itemShape(kind);
    const mesh = new THREE.Group(), inner = dress(sh.model, 'world'), hiG = dress(sh.model, 'worldHi');
    inner.position.copy(sh.centre).negate();
    mesh.add(inner);
    mesh.quaternion.copy(quat);
    const mats = { base: inner.children.map((m) => m.material), hi: hiG.children.map((m) => m.material) };
    const b = this.add(mesh, sh, 1, pos, vel, spin, kind, value, mats);
    b.kept = true;
    return b;
  }

  add(mesh, sh, s, pos, vel, spin, kind, value, mats) {
    mesh.position.copy(pos);
    mesh.scale.setScalar(s);
    this.scene.add(mesh);
    const b = {
      id: ++this.id, mesh, shard: sh, s, r: sh.r * s, kind, value, mats,
      v: vel.clone(), w: spin.clone(), sleeping: false, still: 0, wet: pos.y < 0, age: 0, fade: 0, bounces: 0,
    };
    this.bodies.push(b);
    this.trim();
    return b;
  }

  // too many shards around: the oldest (sleeping, far away first) crumble.
  // Things the player dropped and the logs of felled trees are kept.
  trim() {
    const free = this.bodies.filter((b) => b !== this.carried && !b.fade && !b.kept);
    if (free.length <= MAX_BODIES) return;
    const cam = this.player?.pos;
    free.sort((a, b) => (a.sleeping === b.sleeping ? 0 : a.sleeping ? -1 : 1) || (cam ? b.mesh.position.distanceToSquared(cam) - a.mesh.position.distanceToSquared(cam) : 0) || a.id - b.id);
    for (let i = 0; i < free.length - MAX_BODIES; i++) free[i].fade = 0.5;
  }

  ground(x, z, y) {
    return this.player ? this.player.groundAt(x, z, y) : this.world.heightAt(x, z);
  }

  // ---------------------------------------------------------------- physics
  update(dt, camera) {
    this.clackT -= dt;
    const n = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / n;
    for (const b of this.bodies) {
      b.age += dt;
      if (b === this.carried) continue;
      if (b.fade) { // crumbling away into the ground
        b.fade -= dt;
        b.mesh.scale.setScalar(b.s * Math.max(0, b.fade / 0.5));
        continue;
      }
      this.kick(b);
      if (b.sleeping) continue;
      for (let k = 0; k < n; k++) this.step(b, h);
    }
    this.collidePairs();
    this.bodies = this.bodies.filter((b) => {
      if (b.fade === 0 || b.fade > 0 || b === this.carried) return true;
      b.mesh.removeFromParent();
      this.unflatten(b);
      if (this.aimed === b) this.aimed = null;
      return false;
    });
    if (camera) this.aim(camera);
    if (this.carried && camera) this.hold(this.carried, camera, dt);
  }

  step(b, h) {
    const m = b.mesh, p = m.position;
    const water = p.y < 0;
    if (water && !b.wet) this.hooks.splash?.(p, Math.min(1.5, -b.v.y * 0.16 + b.r * 2.2)); // into the lagoon
    b.wet = water;
    const floats = b.kind !== 'stone'; // wood and coconuts float, stones sink slowly
    b.v.y -= G * (water ? 0.45 : 1) * h;
    if (water && floats) b.v.y += G * 1.6 * Math.min(1, -p.y / (b.r * 0.8)) * h;
    if (water) { const k = Math.exp(-2.4 * h); b.v.multiplyScalar(k); b.w.multiplyScalar(k); }
    p.addScaledVector(b.v, h);
    const wl = b.w.length();
    if (wl > 1e-5) { _q.setFromAxisAngle(_t.copy(b.w).divideScalar(wl), wl * h); m.quaternion.premultiply(_q).normalize(); }

    // contacts on the hull points (sequential impulses, one pass)
    const invI = 1 / (0.4 * b.r * b.r);
    let deepest = 0, touching = false, hardest = 0;
    for (const hp of b.shard.hull) {
      _r.copy(hp).multiplyScalar(b.s).applyQuaternion(m.quaternion);
      const wx = p.x + _r.x, wy = p.y + _r.y, wz = p.z + _r.z;
      const g = this.ground(wx, wz, p.y);
      const pen = g - wy;
      if (pen <= 0) continue;
      touching = true;
      deepest = Math.max(deepest, pen);
      if (g > this.world.heightAt(wx, wz) + 0.01) _n.set(0, 1, 0); else this.world.normalAt(wx, wz, _n);
      _v.crossVectors(b.w, _r).add(b.v); // velocity of that point
      const vn = _v.dot(_n);
      if (vn >= 0) continue;
      hardest = Math.min(hardest, vn);
      const rn = _w.crossVectors(_r, _n), kN = 1 + rn.lengthSq() * invI;
      const e = vn < -1.6 && b.bounces < 3 ? 0.3 : 0; // a couple of real bounces, then it just settles
      const j = -(1 + e) * vn / kN;
      b.v.addScaledVector(_n, j); b.w.addScaledVector(rn, j * invI);
      // friction against the sliding direction
      _v.crossVectors(b.w, _r).add(b.v);
      _t.copy(_v).addScaledVector(_n, -_v.dot(_n));
      const vt = _t.length();
      if (vt > 1e-4) {
        _t.divideScalar(vt);
        const rt = _w.crossVectors(_r, _t), kT = 1 + rt.lengthSq() * invI;
        const jt = Math.min(vt / kT, 0.6 * j);
        b.v.addScaledVector(_t, -jt); b.w.addScaledVector(rt, -jt * invI);
      }
    }
    if (deepest > 0) p.y += deepest;
    if (hardest < -1.6) {
      b.bounces++;
      if (this.clackT <= 0 && this.near(p, 30)) { this.hooks.sound?.(b.wet ? 'plop' : 'clack'); this.clackT = 0.06; }
    }
    if (touching) { // rolling resistance and grip
      const k = Math.exp(-3 * h); b.w.multiplyScalar(k);
      b.v.x *= Math.exp(-0.9 * h); b.v.z *= Math.exp(-0.9 * h);
    }
    this.solids(b);
    // rest: still, on the ground, for a moment
    const floating = water && floats && !touching;
    if ((touching || floating) && b.v.lengthSq() < 0.02 && b.w.lengthSq() < 0.25) {
      b.still += h;
      if (b.still > 0.35) { b.sleeping = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0); this.flatten(b); }
    } else b.still = 0;
    if (p.y < -60) { b.fade = 0.01; }
  }

  // trunks, rocks, posts and the stones still standing
  solids(b) {
    const pl = this.player; if (!pl?.grid) return;
    const p = b.mesh.position;
    const cx = Math.floor(p.x / 8), cz = Math.floor(p.z / 8);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      for (const c of pl.grid.get(`${cx + i},${cz + j}`) || []) {
        const st = c.prop?.type === 'stones' ? c.prop : null; // a loose stone: a low dome
        if (st) {
          const top = st.y + 0.5 * st.s;
          if (p.y > top + b.r) continue;
        }
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + b.r * 0.8;
        if (d >= m || d < 1e-5) continue;
        const nx = dx / d, nz = dz / d;
        if (st && p.y > st.y + 0.25 * st.s) { // lands on the stone's back and slides off its side
          p.y = Math.max(p.y, st.y + 0.5 * st.s + b.r * 0.6 - d * 0.3);
          if (b.v.y < 0) b.v.y *= -0.2;
        }
        p.x = c.x + nx * m; p.z = c.z + nz * m;
        const vn = b.v.x * nx + b.v.z * nz;
        if (vn < 0) {
          b.v.x -= 1.3 * vn * nx; b.v.z -= 1.3 * vn * nz;
          if (vn < -1.2 && this.clackT <= 0) { this.hooks.sound?.(st ? 'clack' : 'knock'); this.clackT = 0.1; } // stone on stone, or on a trunk / post
        }
      }
    }
  }

  // pieces knock into each other
  // (the piece in hand shoves the others but is not moved by them)
  collidePairs() {
    const L = this.bodies, held = this.carried;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.fade) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.fade || (a.sleeping && b.sleeping && a !== held && b !== held)) continue;
        _v.subVectors(b.mesh.position, a.mesh.position);
        const d = _v.length(), m = (a.r + b.r) * 0.75;
        if (d >= m || d < 1e-5) continue;
        _v.divideScalar(d);
        const push = (m - d) * (a === held || b === held ? 1 : 0.5);
        if (a !== held) a.mesh.position.addScaledVector(_v, -push);
        if (b !== held) b.mesh.position.addScaledVector(_v, push);
        if (a === held || b === held) { this.wake(a === held ? b : a); if (this.clackT <= 0 && held.v.length() > 1) { this.hooks.sound?.('clack'); this.clackT = 0.12; } }
        const rel = _w.subVectors(b.v, a.v).dot(_v);
        if (rel < 0) {
          const j2 = -1.2 * rel * 0.5;
          a.v.addScaledVector(_v, -j2); b.v.addScaledVector(_v, j2);
          if (rel < -0.6) { this.wake(a); this.wake(b); }
        }
      }
    }
  }

  // the player's feet nudge the pieces they walk into
  kick(b) {
    const pl = this.player; if (!pl) return;
    const p = b.mesh.position;
    const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.35 + b.r || p.y > pl.pos.y + 0.5 || d < 1e-4) return;
    const sp = Math.hypot(pl.vel.x, pl.vel.z);
    if (sp < 0.5) return;
    this.wake(b);
    b.v.x = dx / d * sp * 0.7; b.v.z = dz / d * sp * 0.7; b.v.y = Math.max(b.v.y, 0.6);
    b.w.set(-dz / d * sp * 3, 0, dx / d * sp * 3);
  }

  wake(b) { if (b.sleeping) { b.sleeping = false; b.still = 0; b.bounces = 2; this.unflatten(b); } }
  // the grass stays short under a piece at rest, so it can be found again
  flatten(b) { if (!b.flat) { b.flat = true; this.hooks.flatten?.(b, b.mesh.position.x, b.mesh.position.z, b.r + 0.12); } }
  unflatten(b) { if (b.flat) { b.flat = false; this.hooks.release?.(b); } }
  near(p, d) { const c = this.player?.pos; return !c || p.distanceToSquared(c) < d * d; }

  // pieces hit by the pick: a shove along the blow
  push(b, dir, k = 3) {
    this.wake(b);
    b.v.addScaledVector(dir, k); b.v.y += k * 0.5;
    b.w.add(new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14));
  }

  // ---------------------------------------------------------------- hands
  // the nearest piece under the crosshair, within reach and in plain sight
  // (lineClear comes from the quarry: terrain, trunks, rocks, stones)
  aim(camera) {
    let best = null, bestT = REACH;
    if (!this.carried) {
      const o = camera.position, d = camera.getWorldDirection(_n);
      for (const b of this.bodies) {
        if (b.fade) continue;
        _v.subVectors(b.mesh.position, o);
        const t = _v.dot(d);
        if (t < 0.1 || t - b.r > bestT) continue;
        const miss = Math.sqrt(Math.max(0, _v.lengthSq() - t * t));
        if (miss > b.r * 1.15 + 0.08 + t * 0.03) continue; // a little tolerance, wider further away
        const hitT = Math.max(0.1, t - b.r);
        if (hitT >= bestT) continue;
        if (this.lineClear && !this.lineClear(o, b.mesh.position, b)) continue;
        best = b; bestT = hitT;
      }
    }
    if (best !== this.aimed) {
      if (this.aimed) this.light(this.aimed, false);
      if (best) this.light(best, true);
      this.aimed = best;
    }
    return best;
  }

  // the piece being aimed at lights up a little
  light(b, on) {
    const list = on ? b.mats.hi : b.mats.base;
    if (b.mesh.isMesh) b.mesh.material = list[0];
    else b.mesh.children[0].children.forEach((m, i) => { m.material = list[i]; });
  }

  grab(b, camera) {
    if (!b || this.carried) return null;
    this.light(b, false);
    b.sleeping = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0);
    this.unflatten(b);
    // it keeps the way it lay, turned with the view from now on
    const f = camera.getWorldDirection(new THREE.Vector3());
    b.holdQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(-f.x, -f.z)).multiply(b.mesh.quaternion);
    b.spin = 0; b.spinTo = 0; b.touching = false;
    this.carried = b; this.aimed = null;
    this.hooks.sound?.('grab');
    return b;
  }
  turn() { if (this.carried) this.carried.spinTo += Math.PI / 3; }

  // The piece in hand is a real object of the world: it floats a little to
  // the right of the crosshair, an arm's length away, follows the view a
  // little late, and bumps into whatever is in the way (it never goes through
  // the ground, a trunk, a stone or the hut), with a knock if it hits hard.
  hold(b, camera, dt) {
    const o = camera.position, f = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(-f.z, 0, f.x).normalize(), up = right.clone().cross(f);
    const D = 1.35 + b.r * 1.4;
    const target = o.clone().addScaledVector(f, D).addScaledVector(right, 0.18 + b.r * 0.4).addScaledVector(up, -0.04 - b.r * 0.25);
    const p = b.mesh.position, before = p.clone();
    p.lerp(target, 1 - Math.exp(-dt * 11));
    // what is between the eyes and the piece stops it
    let hit = null;
    const d = p.clone().sub(o), len = d.length();
    if (this.castWorld && len > 1e-3) {
      d.divideScalar(len);
      const c = this.castWorld(o, d, len + b.r * 0.8);
      if (c) { hit = c; p.copy(o).addScaledVector(d, Math.max(0.3, c.dist - b.r * 0.8)); }
    }
    // dipped into the lagoon
    if ((p.y < 0) !== !!b.dipped) { if (p.y < 0 && b.v.length() > 0.8) this.hooks.splash?.(p, 0.5); b.dipped = p.y < 0; }
    // the ground under it
    const g = this.ground(p.x, p.z, o.y);
    let low = 0;
    for (const hp of b.shard.hull) low = Math.min(low, _r.copy(hp).multiplyScalar(b.s).applyQuaternion(b.mesh.quaternion).y);
    if (p.y + low < g) { p.y = g - low; hit ||= { kind: 'ground' }; }
    // trunks, posts and stones around it
    b.v.copy(p).sub(before).divideScalar(Math.max(dt, 1e-3));
    const px = p.x, pz = p.z;
    this.solids(b);
    if (Math.abs(p.x - px) + Math.abs(p.z - pz) > 1e-4) hit ||= { kind: 'wood' };
    // a knock when it comes up against something
    if (hit && !b.touching && b.v.length() > 1.2 && this.clackT <= 0) {
      this.hooks.sound?.(hit.kind === 'wood' ? 'knock' : hit.kind === 'ground' ? 'dig:grass' : 'clack');
      this.hooks.rumble?.(0.25, 40);
      this.clackT = 0.12;
    }
    b.touching = !!hit;
    // turned with the view (a little late too), and by the player's R / ◀ ▶
    b.spin += (b.spinTo - b.spin) * (1 - Math.exp(-dt * 8));
    _q.setFromAxisAngle(_n.set(0, 1, 0), Math.atan2(-f.x, -f.z)).multiply(b.holdQ).multiply(new THREE.Quaternion().setFromAxisAngle(_t.set(0.3, 1, 0.2).normalize(), b.spin));
    b.mesh.quaternion.slerp(_q, 1 - Math.exp(-dt * 10));
  }

  // let go of the piece in hand, from where it is held, with a velocity
  // (on top of half the hand's own movement)
  release(camera, vel, spin) {
    const b = this.carried; if (!b) return null;
    b.v.multiplyScalar(0.5).add(vel); b.w.copy(spin);
    b.sleeping = false; b.still = 0; b.bounces = 0;
    this.carried = null;
    return b;
  }

  drop(camera, playerVel) { return this.release(camera, new THREE.Vector3(playerVel.x * 0.8, 0.3, playerVel.z * 0.8), new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)); }
  throw(camera, playerVel, power = 1) {
    const f = camera.getWorldDirection(new THREE.Vector3());
    const v = f.multiplyScalar(8 * power).add(new THREE.Vector3(playerVel.x, Math.max(0, playerVel.y) + 1.6 * power, playerVel.z));
    const right = new THREE.Vector3(-f.z, 0, f.x).normalize();
    return this.release(camera, v, right.multiplyScalar(-9).add(new THREE.Vector3(0, (Math.random() - 0.5) * 4, 0)));
  }
  // the piece in hand goes into the bag (the caller adds it to the inventory)
  stash() {
    const b = this.carried; if (!b) return null;
    this.carried = null;
    return this.take(b);
  }
  // a piece lying in the world goes straight into the bag (caller adds it)
  take(b) {
    b.mesh.removeFromParent();
    this.unflatten(b);
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    if (this.aimed === b) this.aimed = null;
    return b;
  }

  // one item from the bag set down in front of the player, a little to the
  // right, tossed gently forward: a stone becomes a shard, anything else its
  // own model. It then lies there like any other piece.
  dropItem(kind, camera, playerVel) {
    const o = camera.position, f = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(-f.z, 0, f.x).normalize();
    const at = o.clone().addScaledVector(f, 0.8).addScaledVector(right, 0.2);
    at.y -= 0.3;
    if (this.lineClear && !this.lineClear(o, at)) at.copy(o).addScaledVector(f, 0.25).setY(o.y - 0.3);
    const vel = new THREE.Vector3(f.x * 1.6 + playerVel.x, 0.8, f.z * 1.6 + playerVel.z);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    const b = kind === 'stone'
      ? this.spawn(at, 0.09, vel, spin, { kind })
      : this.spawnItem(kind, at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-f.x, -f.z) + 1.2, 0)), vel, spin);
    b.mesh.position.y = Math.max(b.mesh.position.y, this.ground(at.x, at.z, o.y) + b.r);
    b.kept = true;
    return b;
  }
}
