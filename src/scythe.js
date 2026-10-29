// Scythe: mows the tall grass in a sweep in front of the player (a cut map
// read by the grass shader: short stubble that grows back), cuts ferns, and
// gives plant fibres. Mowed patches are remembered per world.
import * as THREE from 'three';
import { cutMap } from './grass.js';
import { worldKey, saveFelled } from './axe.js';

const RES = 1024, REGROW_S = 10 * 60;
const MKEY = 'tropicool.mowed.v1';
const GREENS = [[0.30, 0.70, 0.13], [0.42, 0.78, 0.16], [0.60, 0.92, 0.26], [0.80, 0.86, 0.38]];

export class Mower {
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.cut = new Float32Array(RES * RES);
    this.data = new Uint8Array(RES * RES);
    this.tex = new THREE.DataTexture(this.data, RES, RES, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    cutMap.value = this.tex;
    this.active = new Set();
    this.pinned = new Map(); // grass kept flat under placed objects: owner -> cells
    this.tick = 0; this.saveT = -1;

    // flying blade bits
    this.N = 90;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.bits = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, vertexColors: true }));
    this.bits.frustumCulled = false;
    this.vel = new Float32Array(this.N * 3); this.life = new Float32Array(this.N); this.next = 0;
    scene.add(this.bits);
  }

  setWorld(world, veg) {
    this.world = world; this.veg = veg;
    this.cut.fill(0); this.data.fill(0); this.active.clear(); this.pinned.clear();
    try {
      const e = (JSON.parse(localStorage.getItem(MKEY)) || {})[worldKey(world.cfg)];
      if (e) {
        const age = (Date.now() - e.t) / 1000 / REGROW_S;
        for (const [i, a] of e.cells) { const v = a - age; if (v > 0) { this.cut[i] = v; this.active.add(i); } }
      }
    } catch (_) { /* fresh */ }
    this.upload();
  }

  // keep the grass flat under a placed object (a deck chair, a fire...)
  flatten(owner, x, z, r) {
    const S = this.world.size, k = RES / S, cells = [];
    for (let j = Math.floor((z - r + S / 2) * k); j <= Math.ceil((z + r + S / 2) * k); j++) {
      for (let i = Math.floor((x - r + S / 2) * k); i <= Math.ceil((x + r + S / 2) * k); i++) {
        if (i < 0 || j < 0 || i >= RES || j >= RES) continue;
        if (Math.hypot((i + 0.5) / k - S / 2 - x, (j + 0.5) / k - S / 2 - z) > r) continue;
        const idx = j * RES + i;
        cells.push(idx); this.cut[idx] = 1; this.active.add(idx);
      }
    }
    this.pinned.set(owner, cells);
    this.upload();
  }
  release(owner) { this.pinned.delete(owner); }

  upload() {
    for (const i of this.active) this.data[i] = Math.round(Math.min(1, this.cut[i]) * 255);
    this.tex.needsUpdate = true;
  }
  save() {
    try {
      const all = JSON.parse(localStorage.getItem(MKEY)) || {};
      const pinned = new Set([...this.pinned.values()].flat());
      all[worldKey(this.world.cfg)] = { t: Date.now(), cells: [...this.active].filter((i) => !pinned.has(i)).map((i) => [i, +this.cut[i].toFixed(3)]) };
      localStorage.setItem(MKEY, JSON.stringify(all));
    } catch (_) { /* private mode */ }
  }

  // sweep in front of (x, z) towards (fx, fz); returns fibres gained
  mow(x, z, fx, fz, y) {
    const w = this.world, S = w.size, R = 1.9, k = RES / S;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    let mowed = 0;
    const i0 = Math.floor((x - R + S / 2) * k), i1 = Math.ceil((x + R + S / 2) * k);
    const j0 = Math.floor((z - R + S / 2) * k), j1 = Math.ceil((z + R + S / 2) * k);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (i < 0 || j < 0 || i >= RES || j >= RES) continue;
      const wx = (i + 0.5) / k - S / 2, wz = (j + 0.5) / k - S / 2;
      const dx = wx - x, dz = wz - z, d = Math.hypot(dx, dz);
      if (d > R + (Math.random() - 0.5) * 0.3 || d < 0.25 || (dx * fx + dz * fz) / d < 0.2) continue;
      const gi = Math.floor((wz + S / 2) / S * w.N) * w.N + Math.floor((wx + S / 2) / S * w.N);
      if (!(w.grass[gi] > 0.35) || Math.abs(w.heightAt(wx, wz) - y) > 1.2) continue;
      const idx = j * RES + i;
      if (this.cut[idx] < 0.5) mowed++;
      this.cut[idx] = 1; this.active.add(idx);
    }
    let fibres = 0;
    if (mowed > 0) {
      this.upload();
      this.saveT = 1.5;
      fibres += mowed >= 4 ? 1 + (Math.random() < Math.min(0.6, mowed / 40) ? 1 : 0) : (Math.random() < 0.3 ? 1 : 0);
      for (let n = 0; n < Math.min(40, 8 + mowed); n++) {
        const a = Math.atan2(fz, fx) + (Math.random() - 0.5) * 2.2, r = 0.5 + Math.random() * (R - 0.5);
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        this.burst(px, w.heightAt(px, pz) + 0.25, pz, fz, -fx);
      }
    }
    // ferns in the swing are cut whole
    for (const p of w.props.ferns) {
      if (p.gone) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (d > R + 0.3 || d < 0.05 || (dx * fx + dz * fz) / d < 0.1 || Math.abs(p.y - y) > 1.3) continue;
      p.gone = true;
      for (const { mesh, i } of p.inst || []) { mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); mesh.instanceMatrix.needsUpdate = true; }
      saveFelled(w.cfg, p.key);
      fibres += 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let n = 0; n < 14; n++) this.burst(p.x, p.y + 0.3, p.z, fz, -fx);
    }
    return { mowed, fibres };
  }

  burst(x, y, z, sx, sz) {
    const pos = this.bits.geometry.attributes.position, col = this.bits.geometry.attributes.color;
    const i = this.next = (this.next + 1) % this.N;
    pos.setXYZ(i, x, y, z);
    const c = GREENS[Math.floor(Math.random() * GREENS.length)];
    col.setXYZ(i, c[0], c[1], c[2]);
    const s = 1 + Math.random() * 2;
    this.vel.set([sx * s + (Math.random() - 0.5), 1 + Math.random() * 2, sz * s + (Math.random() - 0.5)], i * 3);
    this.life[i] = 0.6 + Math.random() * 0.6;
    col.needsUpdate = true;
  }

  update(dt) {
    // grass grows back
    this.tick += dt;
    if (this.tick > 3 && this.active.size) {
      for (const cells of this.pinned.values()) for (const i of cells) this.cut[i] = 1 + this.tick / REGROW_S;
      for (const i of this.active) {
        this.cut[i] -= this.tick / REGROW_S;
        if (this.cut[i] <= 0) { this.cut[i] = 0; this.data[i] = 0; this.active.delete(i); }
      }
      this.upload();
      this.tick = 0;
    }
    if (this.saveT > 0 && (this.saveT -= dt) <= 0) this.save();
    const pos = this.bits.geometry.attributes.position;
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 6 * dt;
      const drag = Math.exp(-2.5 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      pos.setXYZ(i, pos.getX(i) + this.vel[i * 3] * dt, pos.getY(i) + this.vel[i * 3 + 1] * dt, pos.getZ(i) + this.vel[i * 3 + 2] * dt);
      if (this.life[i] <= 0) pos.setY(i, -999);
    }
    if (any) pos.needsUpdate = true;
  }
}
