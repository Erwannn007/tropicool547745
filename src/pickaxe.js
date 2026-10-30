// Pickaxe: breaks the loose stones lying on the islands. The blow lands where
// the point of the pick really meets something (see hands.js: the swept tip
// is cast against the world with cast()); each hit on a stone knocks a chip
// out right there (a dent and pale bare stone), opens cracks around it that
// spread blow after blow, throws chips, dust and sparks from that spot and
// makes the stone jolt. Once its strength is gone it splits into a handful of
// real pieces (debris.js) that tumble, bounce and stay on the ground to be
// picked up, thrown or put in the bag: nothing goes to the inventory on its
// own. Mined stones are remembered per world (same store as felled trees).
// Big cliff rocks only spark; the ground takes a bite; the hut and the pier
// knock the tool back; air is a whiff. The axe gets the same feedback on
// anything that is not a trunk (axe.js), stones included.
import * as THREE from 'three';
import { saveFelled } from './axe.js';
import { MAX_HITS } from './vegetation.js';
import { MINERALS, mineralOf } from './geology.js';
export { MINERALS };

const GREYS = [[0.29, 0.27, 0.31], [0.44, 0.42, 0.43], [0.53, 0.5, 0.49], [0.62, 0.58, 0.55], [0.71, 0.67, 0.62], [0.91, 0.88, 0.82]];
const SPARKS = [[1, 0.96, 0.7], [1, 0.78, 0.25], [1, 0.5, 0.12]];
const SAND = [[0.85, 0.75, 0.54], [0.93, 0.84, 0.65], [0.79, 0.68, 0.47]];
const SOIL = [[0.42, 0.3, 0.18], [0.3, 0.62, 0.15], [0.36, 0.7, 0.18], [0.53, 0.38, 0.23]];
const WOOD = [[0.66, 0.48, 0.27], [0.85, 0.71, 0.48], [0.53, 0.38, 0.23]];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// What the stones are made of (geology.js) and what the tools can do to
// them. A stone's strength is its size times the hardness of its mineral; a
// good square blow takes off the tool's power, a glancing one much less.
export const TOOLS = {
  pickaxe: { power: 1, glancing: 0.35 },
};
const strengthOf = (p) => Math.round((2 + Math.round(p.s * 2.4)) * mineralOf(p).hardness); // 3 blows for a pebble, 5 for a big one

// square particles flying under gravity; drag > 0 slows them in the air
class Bits {
  constructor(scene, n, size, gravity, drag = 0) {
    this.N = n; this.g = gravity; this.drag = drag;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, vertexColors: true }));
    this.pts.frustumCulled = false;
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.next = 0;
    scene.add(this.pts);
  }
  emit(p, v, c, life) {
    const i = this.next = (this.next + 1) % this.N;
    this.pts.geometry.attributes.position.setXYZ(i, p.x, p.y, p.z);
    this.pts.geometry.attributes.color.setXYZ(i, c[0], c[1], c[2]);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
  update(dt) {
    const pos = this.pts.geometry.attributes.position, k = Math.exp(-this.drag * dt);
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const v = this.vel;
      v[i * 3] *= k; v[i * 3 + 2] *= k; v[i * 3 + 1] = v[i * 3 + 1] * k - this.g * dt;
      pos.setXYZ(i, pos.getX(i) + v[i * 3] * dt, pos.getY(i) + v[i * 3 + 1] * dt, pos.getZ(i) + v[i * 3 + 2] * dt);
      if (this.life[i] <= 0) pos.setY(i, -999);
    }
    if (any) pos.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.pts.geometry.attributes.position.array.fill(-999); this.pts.geometry.attributes.position.needsUpdate = true; }
}

export class Quarry {
  constructor(scene, camera, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.mining = new Map(); // stone -> { mesh, base, hp, hits, t }
    this.collapsing = [];
    this.dropping = []; // stones of a heap settling after the one under them broke
    this.camShake = 0; this.kick = 0;
    this.chips = new Bits(scene, 90, 0.06, 9);
    this.sparks = new Bits(scene, 40, 0.035, 6, 3);
    this.grit = new Bits(scene, 70, 0.11, 0.4, 2.6); // slow dust cloud
    this.ray = new THREE.Raycaster();
    this.probe = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial());
    this.probe.matrixAutoUpdate = false;
  }

  setWorld(world, veg, player, debris, structures) {
    for (const m of this.mining.values()) this.drop(m);
    for (const m of this.collapsing) this.drop(m);
    this.mining.clear(); this.collapsing = []; this.dropping = [];
    this.chips.clear(); this.sparks.clear(); this.grit.clear();
    this.world = world; this.veg = veg; this.player = player; this.debris = debris;
    // hut and pier pieces the tools can meet (posts, floors, sofas, table, roof)
    this.builds = [];
    structures?.group.traverse((o) => { if (o.isMesh) { o.updateMatrixWorld(); this.builds.push({ mesh: o, box: new THREE.Box3().setFromObject(o) }); } });
    debris.lineClear = (a, b, body) => this.lineClear(a, b, body);
    debris.castWorld = (o, dir, max) => this.cast(o, dir, max, { frags: false, builds: false });
    // the grass stays short around each stone so it shows (grows back once mined)
    for (const p of world.props.stones) if (!p.gone) this.hooks.flatten?.(p, p.x, p.z, 0.75 * p.s + 0.25);
  }

  // compile the crack and loose-piece shaders up front: no hitch on the first blow
  prewarm(renderer, camera) {
    const sc = new THREE.Scene(), d = this.veg.detailStone({ v: 0 }), fm = this.veg.fragmentMaterials();
    sc.add(new THREE.Mesh(d.geo, d.material), new THREE.Mesh(this.debris.shards[0].geo, fm.base), new THREE.Mesh(this.debris.shards[0].geo, fm.hi));
    renderer.compile(sc, camera);
    this.warm?.dispose(); // kept alive so its program stays cached
    this.warm = d.material;
  }

  // ---------------------------------------------------------------- casting
  // First thing met along a ray from o (unit dir) within max metres: a loose
  // stone or a cliff rock (their real meshes), a trunk, the hut or the pier
  // (kind 'build'), the ground, a loose piece.
  // -> { kind, point, normal, dist, prop | body } or null
  cast(o, dir, max, { frags = true, builds = true, skip = null } = {}) {
    let best = null;
    const take = (kind, dist, point, normal, extra) => { if (dist <= max && (!best || dist < best.dist)) best = { kind, dist, point, normal, ...extra }; };
    const near = (p, r) => {
      const vx = p.x - o.x, vy = p.y - o.y, vz = p.z - o.z;
      if (Math.abs(vx) > max + r + 1 || Math.abs(vz) > max + r + 1) return false;
      const t = Math.max(0, Math.min(max, vx * dir.x + vy * dir.y + vz * dir.z));
      return (vx - dir.x * t) ** 2 + (vy - dir.y * t) ** 2 + (vz - dir.z * t) ** 2 < r * r;
    };
    this.ray.set(o, dir); this.ray.near = 0; this.ray.far = max;
    const mesh = (geo, matrix, kind, prop) => {
      this.probe.geometry = geo; this.probe.matrixWorld.copy(matrix);
      const hit = this.ray.intersectObject(this.probe, false)[0];
      if (!hit) return;
      const n = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
      take(kind, hit.distance, hit.point, n, { prop });
    };
    const m4 = new THREE.Matrix4();
    for (const p of this.world.props.stones) {
      if (p.gone || p === skip || !near({ x: p.x, y: p.y + 0.2 * p.s, z: p.z }, 0.8 * p.s)) continue;
      const m = this.mining.get(p);
      if (m) mesh(m.mesh.geometry, m.base, 'stone', p);
      else { p.inst[0].mesh.getMatrixAt(p.inst[0].i, m4); mesh(this.veg.stones[p.v], m4, 'stone', p); }
    }
    for (const p of this.world.props.rocks) {
      if (!p.inst || !near({ x: p.x, y: p.y + 0.3 * p.s, z: p.z }, 1.5 * p.s)) continue;
      p.inst[0].mesh.getMatrixAt(p.inst[0].i, m4); mesh(this.veg.rocks[p.v], m4, 'rock', p);
    }
    // trunks: upright cylinders
    for (const type of ['palms', 'trees']) for (const p of this.world.props[type]) {
      if (p.gone) continue;
      const r = (type === 'palms' ? 0.32 : 0.35) * p.s;
      const ox = o.x - p.x, oz = o.z - p.z;
      if (Math.abs(ox) > max + 1 || Math.abs(oz) > max + 1) continue;
      const a = dir.x * dir.x + dir.z * dir.z, b = ox * dir.x + oz * dir.z, c = ox * ox + oz * oz - r * r;
      const disc = b * b - a * c;
      if (a < 1e-6 || disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t < 0) continue;
      const pt = o.clone().addScaledVector(dir, t);
      if (pt.y < p.y - 0.2 || pt.y > p.y + 5 * p.s) continue;
      take('wood', t, pt, new THREE.Vector3(pt.x - p.x, 0, pt.z - p.z).normalize(), { prop: p });
    }
    if (builds) for (const b of this.builds) {
      if (!this.ray.ray.intersectsBox(b.box)) continue;
      const hit = this.ray.intersectObject(b.mesh, false)[0];
      if (hit) take('build', hit.distance, hit.point, hit.face.normal.clone().transformDirection(b.mesh.matrixWorld), { mat: b.mesh.userData.mat });
    }
    const an = frags && this.fauna?.ray(o, dir, max); // a crab (fauna.js), for the tools and the aim only
    if (an) take('animal', an.dist, an.point, an.normal, { animal: an.a });
    const built = builds && this.building?.ray(o, dir, max); // what the player built (building.js)
    if (built) take('build', built.dist, built.point, built.normal, { mat: built.mat, piece: built.piece });
    // the ground (terrain or pier/hut floors): march, then refine
    const step = 0.06, P = new THREE.Vector3();
    const under = (t) => { P.copy(o).addScaledVector(dir, t); return P.y < this.player.groundAt(P.x, P.z, P.y + 0.05); };
    if (!under(0)) for (let t = step; t <= (best ? best.dist : max) + step; t += step) {
      if (!under(Math.min(t, max))) continue;
      let lo = t - step, hi = Math.min(t, max);
      for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (under(mid)) hi = mid; else lo = mid; }
      const pt = o.clone().addScaledVector(dir, hi), g = this.world.heightAt(pt.x, pt.z);
      take('ground', hi, pt, pt.y > g + 0.05 ? new THREE.Vector3(0, 1, 0) : this.world.normalAt(pt.x, pt.z));
      break;
    }
    if (frags) for (const b of this.debris.bodies) {
      if (b === this.debris.carried || b.fade) continue;
      const c = b.mesh.position, r = b.r * 0.85;
      if (!near(c, r)) continue;
      const v = c.clone().sub(o), t = v.dot(dir), d2 = v.lengthSq() - t * t, th = Math.sqrt(Math.max(0, r * r - d2)), tt = t - th;
      if (tt < 0) continue;
      const pt = o.clone().addScaledVector(dir, tt);
      take('frag', tt, pt, pt.clone().sub(c).normalize(), { body: b });
    }
    return best;
  }

  // nothing solid between a and b (b itself may sit on the ground: stop short)
  lineClear(a, b, body) {
    const d = b.clone().sub(a), len = d.length();
    if (len < 1e-3) return true;
    const stop = len - (body ? body.r * 0.9 : 0.02);
    return stop <= 0 || !this.cast(a, d.divideScalar(len), stop, { frags: false, builds: false });
  }

  // what the crosshair points at, within reach of the pick
  aim(reach = 2.3) {
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    return this.cast(this.camera.position, dir, reach);
  }

  // swap the instanced stone for a mesh of its own (cracks, dents, jolts)
  detach(p) {
    if (this.mining.has(p)) return this.mining.get(p);
    const { mesh: im, i } = p.inst[0];
    const base = new THREE.Matrix4(); im.getMatrixAt(i, base);
    const d = this.veg.detailStone(p);
    const mesh = new THREE.Mesh(d.geo, d.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(base); mesh.matrixWorldNeedsUpdate = true;
    this.scene.add(mesh);
    im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    im.instanceMatrix.needsUpdate = true;
    const m = { p, mesh, base, inv: base.clone().invert(), hp: strengthOf(p), max: strengthOf(p), hits: [], t: 1, amp: 1, dir: new THREE.Vector3() };
    this.mining.set(p, m);
    return m;
  }
  drop(m) { m.mesh.removeFromParent(); m.mesh.material.dispose(); }

  // ---------------------------------------------------------------- blows
  // the point of the pick met something: c = cast() result, dir = the way
  // the point was travelling (unit). Returns how hard the pick should bounce
  // back (0 = it sinks in / goes through).
  hit(c, dir, tool = 'pickaxe') {
    this.tool = tool;
    if (!c) { this.hooks.sound?.('whiff'); return 0; }
    const at = c.point, n = c.normal;
    const square = Math.max(0, -dir.dot(n)); // 1 = straight into the surface
    const good = square > 0.35;
    if (c.kind === 'animal') { // struck down: a puff of sand, a crunch
      for (let k = 0; k < 14; k++) this.chip(at, n, 1.4, pick(k % 3 ? SAND : [[0.9, 0.35, 0.15], [0.95, 0.55, 0.25]]));
      this.hooks.killed?.(c.animal, dir);
      this.impact(0.06, 0.4, 70, 0.6, 0.006);
      return 0.15;
    }
    if (c.kind === 'stone' && TOOLS[tool]) return this.hitStone(c.prop, at, n, dir, good, tool);
    if (c.kind === 'rock' || c.kind === 'stone') { // too big for a pick: a shower of sparks and a jarring clank
      this.spray(at, n, dir, 14, 2.4);
      for (let k = 0; k < 5; k++) this.chip(at, n, 1.2, pick(GREYS));
      this.hooks.sound?.('clank');
      this.impact(0.06, 0.6, 80, 0.9, 0.012);
      return 1;
    }
    if (c.kind === 'frag') {
      this.debris.push(c.body, dir, 3.2);
      this.spray(at, n, dir, 4, 1.5);
      this.hooks.sound?.('clack');
      this.impact(0.04, 0.3, 50, 0.4, 0.004);
      return 0.5;
    }
    if (c.kind === 'wood') {
      for (let k = 0; k < 8; k++) this.chip(at, n, 1, pick(WOOD));
      this.hooks.sound?.('dig:grass');
      this.impact(0.05, 0.35, 60, 0.5, 0.006);
      return 0.6;
    }
    if (c.kind === 'build') { // hut, pier, what was built: it does not break, the tool knocks back off it
      const up = at.clone().addScaledVector(n, 0.04), stone = c.mat === 'stone';
      for (let k = 0; k < 10; k++) this.chip(up, n, 1.1, pick(stone ? GREYS : c.mat === 'thatch' ? SAND : WOOD));
      if (stone) this.spray(at, n, dir, 8, 2);
      this.hooks.sound?.(stone ? 'clank' : 'clack');
      this.impact(0.05, stone ? 0.5 : 0.35, 60, stone ? 0.8 : 0.6, 0.006);
      return stone ? 0.9 : 0.6;
    }
    // the point bites into the ground
    const w = this.world, gi = Math.floor((at.z + w.size / 2) / w.size * w.N) * w.N + Math.floor((at.x + w.size / 2) / w.size * w.N);
    const grassy = w.grass[gi] > 0.4, cols = grassy ? SOIL : SAND;
    const up = at.clone().addScaledVector(n, 0.04);
    for (let k = 0; k < 12; k++) this.chip(up, n, 1.1, pick(cols));
    this.hooks.sound?.(at.y > w.heightAt(at.x, at.z) + 0.05 ? 'clack' : grassy ? 'dig:grass' : 'dig:sand');
    this.impact(0.05, 0.3, 60, 0.5, 0.006);
    return 0.15;
  }

  // freeze frame, rumble, camera shake and a small upward kick of the view
  impact(freeze, rumble, ms, shake, kick) {
    this.hooks.freeze?.(freeze, this.tool);
    this.hooks.rumble?.(rumble, ms);
    this.camShake = Math.max(this.camShake, shake);
    this.kick = Math.max(this.kick, kick);
  }

  hitStone(p, at, n, dir, good, tool) {
    const m = this.detach(p);
    const dmg = TOOLS[tool].power * (good ? 1 : TOOLS[tool].glancing);
    m.hp -= dmg;
    const prog = 1 - Math.max(0, m.hp) / m.max;
    // mark the stone where it was hit (in its own space)
    const local = at.clone().applyMatrix4(m.inv);
    const strength = good ? 0.75 : 0.35;
    const same = m.hits.find((h) => Math.hypot(h.x - local.x, h.y - local.y, h.z - local.z) < 0.09);
    if (same) same.w = Math.min(1.3, same.w + strength * 0.6);
    else { m.hits.push(new THREE.Vector4(local.x, local.y, local.z, strength)); if (m.hits.length > MAX_HITS) m.hits.shift(); }
    const U = m.mesh.material.uniforms;
    m.hits.forEach((h, i) => U.uHits.value[i].copy(h));
    U.uCrack.value = Math.pow(prog, 1.4) * 0.75;
    m.dir.set(dir.x, 0, dir.z); if (m.dir.lengthSq() < 1e-4) m.dir.set(p.x - this.camera.position.x, 0, p.z - this.camera.position.z); m.dir.normalize();
    m.t = 0; m.amp = good ? 0.6 + prog * 0.8 : 0.35;
    // chips and dust leave the very spot, sparks skid off along the blow
    const out = at.clone().addScaledVector(n, 0.03);
    for (let k = 0; k < (good ? 9 : 4); k++) this.chip(out, n, 1.6, pick(mineralOf(p).chips));
    if (p.mineral && good) this.spray(out, n, dir, 4, 1.2); // ore sparkles as it chips
    this.spray(out, n, dir, good ? 6 : 10, 1.8);
    for (let k = 0; k < (good ? 4 : 1); k++) this.grit.emit(out, new THREE.Vector3(n.x * 0.5 + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, n.z * 0.5 + (Math.random() - 0.5) * 0.6), pick(GREYS.slice(3)), 0.5 + Math.random() * 0.4);
    if (m.hp <= 0) { this.impact(0.07, 0.85, 200, 1.5, 0.016); this.shatter(m, dir); return 0.2; }
    this.impact(good ? 0.07 : 0.05, good ? 0.55 : 0.4, 90, good ? 1 : 0.7, good ? 0.012 : 0.007);
    this.hooks.sound?.(good ? `mine:${prog.toFixed(2)}` : 'clank');
    return good ? 0.7 : 1;
  }

  shatter(m, dir) {
    const { p } = m;
    this.mining.delete(p);
    m.t = 0; this.collapsing.push(m); // shrinks away while the pieces burst out of it
    this.world.removeProp(p);
    this.player.removeCollider(p);
    this.hooks.release?.(p);
    saveFelled(this.world.cfg, p.key);
    if (p.cluster != null) this.settleCluster(p.cluster);
    const c = new THREE.Vector3(p.x, p.y + 0.26 * p.s, p.z);
    const push = new THREE.Vector3(dir.x, 0, dir.z); if (push.lengthSq() < 1e-4) push.set(p.x - this.camera.position.x, 0, p.z - this.camera.position.z); push.normalize();
    const sizes = [0.34, 0.3, 0.25, 0.23, 0.2, 0.15, 0.13, 0.12].slice(0, 6 + Math.round(p.s * 2));
    const M = mineralOf(p);
    sizes.forEach((k, i) => {
      const a = (i / sizes.length) * Math.PI * 2 + Math.random() * 0.7;
      const off = new THREE.Vector3(Math.cos(a) * 0.3 * p.s, (Math.random() - 0.3) * 0.18 * p.s, Math.sin(a) * 0.3 * p.s);
      const out = off.clone().normalize(), sp = (1.1 + Math.random() * 1.4) * (1.25 - k * 1.5);
      const v = out.multiplyScalar(sp).addScaledVector(push, 1.1).add(new THREE.Vector3(0, 1.6 + Math.random() * 1.8, 0));
      const spin = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      this.debris.spawn(c.clone().add(off), k * p.s * 0.85, v, spin, { shape: i % this.debris.shards.length, kind: i === 0 || Math.random() < M.yield ? M.item : 'stone' }); // an ore stone is partly plain rock
    });
    for (let k = 0; k < 18; k++) this.chip(c, new THREE.Vector3(0, 1, 0), 2.4, pick(M.chips));
    for (let k = 0; k < 18; k++) { // a short puff of grit, low so the pieces stay visible
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.4;
      this.grit.emit(c, new THREE.Vector3(Math.cos(a) * sp, 0.15 + Math.random() * 0.6, Math.sin(a) * sp), pick(GREYS.slice(2)), 0.6 + Math.random() * 0.6);
    }
    this.spray(c, new THREE.Vector3(0, 1, 0), push, 8, 2.2);
    this.hooks.sound?.('crumble');
    this.hooks.shattered?.(p);
  }

  // boulders are heaps of stones (world.js): the ones that lay on a broken
  // stone drop onto what is left under them
  settleCluster(k) {
    for (const q of this.world.clusters[k]) {
      if (q.gone || this.dropping.some((d) => d.p === q)) continue;
      const y = this.world.restingY(q);
      if (y < q.y - 0.03) this.dropping.push({ p: q, to: y, v: 0 });
    }
  }
  // put a stone's instance (or its cracked mesh) where the stone now is
  place(q) {
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(q.x, q.y, q.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), q.rot), new THREE.Vector3(q.s * 1.1, q.s * 0.9, q.s));
    const m = this.mining.get(q);
    if (m) { m.base.copy(m4); m.inv.copy(m4).invert(); m.mesh.matrix.copy(m4); m.mesh.matrixWorldNeedsUpdate = true; return; }
    const { mesh, i } = q.inst[0];
    mesh.setMatrixAt(i, m4); mesh.instanceMatrix.needsUpdate = true;
  }

  // a chip of colour col thrown off a surface of normal n
  chip(at, n, speed, col) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8), v = 0.85 + Math.random() * 0.3;
    const vel = new THREE.Vector3(Math.cos(a) * s * 0.7, 1.2 + Math.random() * 2, Math.sin(a) * s * 0.7).addScaledVector(n, s * 0.8);
    this.chips.emit(at, vel, col.map((x) => Math.min(1, x * v)), 0.7 + Math.random() * 0.5);
  }
  // steel on stone: short bright sparks skidding off along the blow
  spray(at, n, dir, count, speed) {
    const r = dir.clone().addScaledVector(n, -2 * dir.dot(n)); // the blow reflected off the surface
    for (let k = 0; k < count; k++) {
      const s = speed * (0.6 + Math.random() * 0.9);
      const v = r.clone().multiplyScalar(s * 0.7).add(new THREE.Vector3((Math.random() - 0.5) * s, Math.random() * s, (Math.random() - 0.5) * s));
      this.sparks.emit(at, v, pick(SPARKS), 0.12 + Math.random() * 0.2);
    }
  }

  update(dt) {
    // impact camera shake and kick (the player re-poses the camera every frame)
    if (this.camShake > 0) {
      const k = this.camShake * 0.008;
      this.camera.rotation.z += (Math.random() - 0.5) * k;
      this.camera.rotation.x += (Math.random() - 0.5) * k;
      this.camShake = Math.max(0, this.camShake - dt * 7);
    }
    if (this.kick > 0) {
      this.camera.rotation.x += this.kick;
      this.kick = Math.max(0, this.kick - dt * 0.09);
    }
    // a struck stone jolts away from the blow and settles, a little squashed
    const tr = new THREE.Matrix4(), sc = new THREE.Matrix4();
    for (const m of this.mining.values()) {
      if (m.t >= 0.3) continue;
      m.t += dt;
      const k = Math.max(0, 1 - m.t / 0.3), wob = Math.sin(m.t * 55) * k * m.amp;
      tr.makeTranslation(m.dir.x * wob * 0.025, -Math.abs(wob) * 0.01, m.dir.z * wob * 0.025);
      sc.makeScale(1 + wob * 0.03, 1 - wob * 0.04, 1 + wob * 0.03);
      m.mesh.matrix.copy(tr).multiply(m.base).multiply(sc);
      m.mesh.matrixWorldNeedsUpdate = true;
    }
    // stones of a heap falling onto what is left
    this.dropping = this.dropping.filter((d) => {
      const q = d.p;
      if (q.gone) return false;
      d.v += 11 * dt;
      q.y = Math.max(d.to, q.y - d.v * dt);
      this.place(q);
      if (q.y > d.to) return true;
      const at = new THREE.Vector3(q.x, q.y + 0.1 * q.s, q.z);
      for (let k = 0; k < 10; k++) this.chip(at, new THREE.Vector3(0, 1, 0), 1.4, pick(GREYS));
      for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28; this.grit.emit(at, new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)), pick(GREYS.slice(2)), 0.8); }
      if (at.distanceTo(this.camera.position) < 25) { this.hooks.sound?.('stoneDrop'); this.hooks.rumble?.(0.4, 90); this.camShake = Math.max(this.camShake, 0.4); }
      this.settleCluster(q.cluster); // and whatever lay on this one
      return false;
    });
    // a broken stone gives way to its pieces in a tenth of a second
    this.collapsing = this.collapsing.filter((m) => {
      m.t += dt;
      const k = Math.max(0, 1 - m.t / 0.1);
      m.mesh.matrix.copy(m.base).multiply(sc.makeScale(k, k * k, k));
      m.mesh.matrixWorldNeedsUpdate = true;
      if (k > 0) return true;
      this.drop(m);
      return false;
    });
    this.chips.update(dt); this.sparks.update(dt); this.grit.update(dt);
  }
}
