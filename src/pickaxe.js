// Pickaxe: breaks the loose stones lying on the islands. Each blow opens more
// cracks in the stone (its own crack material), knocks chips and sparks off
// and makes it jolt; the last one splits it into tumbling chunks and a puff of
// grit, and drops stones. Mined stones are remembered per world (same store
// as felled trees) and come back after a while. Big cliff rocks only spark.
import * as THREE from 'three';
import { saveFelled } from './axe.js';
import { makeStone } from './vegetation.js';

const GREYS = [[0.29, 0.27, 0.31], [0.44, 0.42, 0.43], [0.53, 0.5, 0.49], [0.62, 0.58, 0.55], [0.71, 0.67, 0.62], [0.91, 0.88, 0.82]];
const SPARKS = [[1, 0.96, 0.7], [1, 0.78, 0.25], [1, 0.5, 0.12]];
const SAND = [[0.85, 0.75, 0.54], [0.93, 0.84, 0.65], [0.79, 0.68, 0.47]];
const SOIL = [[0.42, 0.3, 0.18], [0.3, 0.62, 0.15], [0.36, 0.7, 0.18], [0.53, 0.38, 0.23]];
const hitsFor = (p) => 2 + Math.round(p.s * 2.4); // 3 blows for a pebble, 5 for a big one
const pick = (a) => a[Math.floor(Math.random() * a.length)];

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
    this.mining = new Map(); // stone -> { mesh, base, hits, t }
    this.camShake = 0;
    this.chips = new Bits(scene, 90, 0.06, 9);
    this.sparks = new Bits(scene, 40, 0.035, 6, 3);
    this.grit = new Bits(scene, 70, 0.11, 0.4, 2.6); // slow dust cloud
    // chunks of the broken stone, tumbling and bouncing before they crumble away
    this.chunkGeo = [0, 1, 2].map((k) => makeStone(900 + k * 17, 1, 0.5));
    this.chunks = [];
  }

  setWorld(world, veg, player) {
    for (const m of this.mining.values()) this.drop(m);
    this.mining.clear();
    for (const c of this.chunks) c.mesh.removeFromParent();
    this.chunks = [];
    this.chips.clear(); this.sparks.clear(); this.grit.clear();
    this.world = world; this.veg = veg; this.player = player;
    // the grass stays short around each stone so it shows (grows back once mined)
    for (const p of world.props.stones) if (!p.gone) this.hooks.flatten?.(p, p.x, p.z, 0.75 * p.s + 0.25);
  }

  // compile the crack and loose-chunk shaders up front: no hitch on the first blow
  prewarm(renderer, camera) {
    const sc = new THREE.Scene(), d = this.veg.detailStone({ v: 0 });
    sc.add(new THREE.Mesh(d.geo, d.material), new THREE.Mesh(this.chunkGeo[0], this.veg.materials.stone));
    renderer.compile(sc, camera);
    this.warm?.dispose(); // kept alive so its program stays cached
    this.warm = d.material;
  }

  // nearest stone in front of the player, within reach of the pick
  target(list, reach, pad) {
    const cam = this.camera.position;
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const fl = Math.hypot(dir.x, dir.z) || 1;
    let best = null, bestD = 1e9;
    for (const p of list) {
      if (p.gone) continue;
      const dx = p.x - cam.x, dz = p.z - cam.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      const d = Math.hypot(dx, dz), edge = d - pad * p.s;
      if (edge > reach || d < 0.05) continue;
      if ((dx * dir.x + dz * dir.z) / (d * fl) < (edge < 0.4 ? 0.3 : 0.7)) continue;
      if (Math.abs(this.player.pos.y - p.y) > 2) continue;
      if (edge < bestD) { bestD = edge; best = p; }
    }
    return best;
  }

  // the spot on the stone facing the player, a bit above its middle
  face(p, r) {
    const cam = this.camera.position;
    const dx = cam.x - p.x, dz = cam.z - p.z, d = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(p.x + dx / d * r, p.y + r * 0.6, p.z + dz / d * r);
  }

  // swap the instanced stone for a mesh of its own (cracks, jolts)
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
    const m = { p, mesh, base, hits: 0, t: 1, dir: new THREE.Vector3() };
    this.mining.set(p, m);
    return m;
  }
  drop(m) { m.mesh.removeFromParent(); m.mesh.material.dispose(); }

  strike() {
    const cam = this.camera.position;
    const p = this.target(this.world.props.stones, 1.7, 0.6);
    if (p) return this.hitStone(p);
    const rock = this.target(this.world.props.rocks, 1.5, 0.95);
    if (rock) { // too big for a pick: a shower of sparks and a jarring clank
      const hp = this.face(rock, 0.9 * rock.s);
      hp.y = Math.min(hp.y, cam.y - 0.5);
      this.spray(hp, 14, 2.4);
      for (let k = 0; k < 5; k++) this.chip(hp, 1.2, pick(GREYS));
      this.hooks.sound?.('clank');
      this.hooks.freeze?.(0.06); this.hooks.rumble?.(0.6, 80);
      this.camShake = 0.9;
      return;
    }
    // the point bites into the ground in front
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const fl = Math.hypot(dir.x, dir.z) || 1;
    const gx = cam.x + dir.x / fl * 1.1, gz = cam.z + dir.z / fl * 1.1, gy = this.world.heightAt(gx, gz);
    if (cam.y - gy < 2.4 && gy > -0.2) {
      const w = this.world, gi = Math.floor((gz + w.size / 2) / w.size * w.N) * w.N + Math.floor((gx + w.size / 2) / w.size * w.N);
      const cols = w.grass[gi] > 0.4 ? SOIL : SAND;
      const at = new THREE.Vector3(gx, gy + 0.05, gz);
      for (let k = 0; k < 12; k++) this.chip(at, 1.1, pick(cols));
      this.hooks.sound?.(w.grass[gi] > 0.4 ? 'dig:grass' : 'dig:sand');
      this.hooks.freeze?.(0.05); this.hooks.rumble?.(0.3, 60);
      this.camShake = 0.5;
    } else this.hooks.sound?.('whiff');
  }

  hitStone(p) {
    const m = this.detach(p);
    m.hits++;
    const need = hitsFor(p), prog = m.hits / need;
    const cam = this.camera.position;
    m.dir.set(p.x - cam.x, 0, p.z - cam.z).normalize();
    m.t = 0;
    m.mesh.material.uniforms.uCrack.value = Math.min(0.95, 0.18 + prog * 0.7);
    const hp = this.face(p, 0.6 * p.s);
    for (let k = 0; k < 9; k++) this.chip(hp, 1.6, pick(GREYS));
    this.spray(hp, 7, 1.8);
    for (let k = 0; k < 3; k++) this.grit.emit(hp, new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8), pick(GREYS.slice(3)), 0.5 + Math.random() * 0.4);
    this.hooks.freeze?.(0.07);
    this.hooks.rumble?.(0.55, 90);
    this.camShake = 1;
    if (m.hits >= need) this.shatter(m);
    else this.hooks.sound?.(`mine:${prog.toFixed(2)}`);
  }

  shatter(m) {
    const { p } = m;
    this.mining.delete(p);
    this.drop(m);
    this.world.removeProp(p);
    this.player.removeCollider(p);
    this.hooks.release?.(p);
    saveFelled(this.world.cfg, p.key);
    const c = new THREE.Vector3(p.x, p.y + 0.28 * p.s, p.z);
    const n = 5 + Math.round(p.s * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6, sp = 1 + Math.random() * 1.6;
      const s = p.s * (0.22 + Math.random() * 0.2);
      const mesh = new THREE.Mesh(pick(this.chunkGeo), this.veg.materials.stone);
      mesh.position.set(c.x + Math.cos(a) * 0.15 * p.s, c.y + Math.random() * 0.15, c.z + Math.sin(a) * 0.15 * p.s);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.chunks.push({
        mesh, s, r: s * 0.32, life: 1.5 + Math.random() * 0.7, bounced: 0,
        v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 2.2, Math.sin(a) * sp),
        w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
      });
    }
    for (let k = 0; k < 24; k++) this.chip(c, 2.4, pick(GREYS));
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.6;
      this.grit.emit(c, new THREE.Vector3(Math.cos(a) * sp, 0.2 + Math.random() * 0.9, Math.sin(a) * sp), pick(GREYS.slice(2)), 0.7 + Math.random() * 0.8);
    }
    this.spray(c, 10, 2.2);
    this.hooks.sound?.('crumble');
    this.hooks.rumble?.(0.85, 200);
    this.camShake = 1.5;
    const got = 1 + Math.round(p.s * 2.6) + (Math.random() < 0.35 ? 1 : 0);
    this.hooks.drops?.([['stone', got]]);
  }

  chip(at, speed, col) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8), v = 0.85 + Math.random() * 0.3;
    this.chips.emit(at, new THREE.Vector3(Math.cos(a) * s, 1.4 + Math.random() * 2.2, Math.sin(a) * s), col.map((x) => Math.min(1, x * v)), 0.7 + Math.random() * 0.5);
  }
  spray(at, count, speed) { // steel on stone: short bright sparks
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.6 + Math.random() * 0.9);
      this.sparks.emit(at, new THREE.Vector3(Math.cos(a) * s, 0.8 + Math.random() * 2.4, Math.sin(a) * s), pick(SPARKS), 0.12 + Math.random() * 0.2);
    }
  }

  update(dt) {
    // impact camera shake (the player re-poses the camera every frame)
    if (this.camShake > 0) {
      const k = this.camShake * 0.011;
      this.camera.rotation.z += (Math.random() - 0.5) * k;
      this.camera.rotation.x += (Math.random() - 0.5) * k;
      this.camShake = Math.max(0, this.camShake - dt * 7);
    }
    // a struck stone jolts away from the blow and settles, a little squashed
    const tr = new THREE.Matrix4(), sc = new THREE.Matrix4();
    for (const m of this.mining.values()) {
      if (m.t >= 0.3) continue;
      m.t += dt;
      const k = Math.max(0, 1 - m.t / 0.3), wob = Math.sin(m.t * 55) * k;
      tr.makeTranslation(m.dir.x * wob * 0.025, -Math.abs(wob) * 0.01, m.dir.z * wob * 0.025);
      sc.makeScale(1 + wob * 0.03, 1 - wob * 0.04, 1 + wob * 0.03);
      m.mesh.matrix.copy(tr).multiply(m.base).multiply(sc);
      m.mesh.matrixWorldNeedsUpdate = true;
    }
    // chunks tumble, bounce with a clack, then crumble into the ground
    for (const c of this.chunks) {
      c.life -= dt;
      c.v.y -= 11 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      c.mesh.rotation.x += c.w.x * dt; c.mesh.rotation.y += c.w.y * dt; c.mesh.rotation.z += c.w.z * dt;
      const g = this.world.heightAt(c.mesh.position.x, c.mesh.position.z) + c.r;
      if (c.mesh.position.y < g) {
        c.mesh.position.y = g;
        if (c.v.y < -1.2 && c.bounced < 2) { if (Math.random() < 0.5) this.hooks.sound?.('clack'); c.bounced++; }
        c.v.y = Math.abs(c.v.y) * 0.32; c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.5);
      }
      if (c.life < 0.4) c.mesh.scale.setScalar(c.s * Math.max(0, c.life / 0.4));
    }
    this.chunks = this.chunks.filter((c) => {
      if (c.life > 0) return true;
      c.mesh.removeFromParent();
      return false;
    });
    this.chips.update(dt); this.sparks.update(dt); this.grit.update(dt);
  }
}
