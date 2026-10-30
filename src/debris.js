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
import { MODELS } from './models.js';
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
function itemShape(kind) {
  if (!itemShapes.has(kind)) {
    const model = MODELS[kind]();
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
    return this.add(mesh, sh, 1, pos, vel, spin, kind, value, mats);
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

  // too many pieces around: the oldest (sleeping, far away first) crumble
  trim() {
    const free = this.bodies.filter((b) => b !== this.carried && !b.fade);
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
  }

  step(b, h) {
    const m = b.mesh, p = m.position;
    const water = p.y < 0;
    if (water && !b.wet && b.v.y < -1.5) this.hooks.sound?.('plop');
    b.wet = water;
    b.v.y -= G * (water ? 0.45 : 1) * h; // stone sinks slowly through the lagoon
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
    if (touching && b.v.lengthSq() < 0.02 && b.w.lengthSq() < 0.25) {
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
          if (vn < -2 && this.clackT <= 0) { this.hooks.sound?.('clack'); this.clackT = 0.06; }
        }
      }
    }
  }

  // pieces knock into each other
  collidePairs() {
    const L = this.bodies;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a === this.carried || a.fade) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b === this.carried || b.fade || (a.sleeping && b.sleeping)) continue;
        _v.subVectors(b.mesh.position, a.mesh.position);
        const d = _v.length(), m = (a.r + b.r) * 0.75;
        if (d >= m || d < 1e-5) continue;
        _v.divideScalar(d);
        const push = (m - d) * 0.5;
        a.mesh.position.addScaledVector(_v, -push); b.mesh.position.addScaledVector(_v, push);
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

  grab(b) {
    if (!b || this.carried) return null;
    b.mesh.visible = false;
    this.light(b, false);
    b.sleeping = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0);
    this.unflatten(b);
    this.carried = b; this.aimed = null;
    this.hooks.sound?.('grab');
    return b;
  }

  // let go of the piece in hand: from where it is held, with a velocity
  // (0 = just dropped); it never starts inside a trunk or the ground
  release(camera, vel, spin) {
    const b = this.carried; if (!b) return null;
    const o = camera.position;
    const f = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(-f.z, 0, f.x).normalize();
    const at = o.clone().addScaledVector(f, 0.5).addScaledVector(right, 0.16);
    at.y -= 0.22;
    if (this.lineClear && !this.lineClear(o, at, b)) at.copy(o).addScaledVector(f, 0.12).setY(o.y - 0.15);
    at.y = Math.max(at.y, this.ground(at.x, at.z, o.y) + b.r);
    b.mesh.position.copy(at);
    b.mesh.visible = true;
    b.v.copy(vel); b.w.copy(spin);
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
    b.mesh.removeFromParent();
    this.bodies.splice(this.bodies.indexOf(b), 1);
    this.carried = null;
    return b;
  }
}
