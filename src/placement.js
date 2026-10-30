// Placeable objects (tiki torches, deck chairs, parasols, camp fires): aim
// preview as a blue hologram (red where it cannot go), placing, colliders,
// lights, embers, picking back up, and persistence per world.
import * as THREE from 'three';
import { MODELS } from './models.js';
import { dress, ghostColor } from './dress.js';
import { worldKey } from './axe.js';
import { getW, setW } from './store.js';

const REACH = 6;
// circles: local [x, z, r] colliders; foot: local points that must sit on
// fairly flat dry ground; ring: preview footprint radius
export const PLACEABLE = {
  torch: { circles: [[0, 0, 0.13]], foot: [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]], slope: 0.5, ring: 0.28, pick: 0.35, light: { y: 1.74, radius: 7.5, col: [1.0, 0.58, 0.26] }, embers: 1.74 },
  transat: { circles: [[0.45, 0, 0.36], [-0.45, 0, 0.36]], foot: [[0.95, 0.33], [0.95, -0.33], [-0.88, 0.33], [-0.88, -0.33], [0, 0]], slope: 0.32, ring: 1.0, pick: 0.8, h: 0.5 },
  parasol: { circles: [[0, 0, 0.14]], foot: [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]], slope: 0.5, ring: 0.45, clear: 1.1, pick: 0.45, h: 1.2 },
  chest: { circles: [[0.22, 0, 0.3], [-0.22, 0, 0.3]], foot: [[0.43, 0.27], [0.43, -0.27], [-0.43, 0.27], [-0.43, -0.27], [0, 0]], slope: 0.3, ring: 0.58, pick: 0.55, h: 0.35, slots: 18 },
  bed: { circles: [[0.55, 0, 0.6], [-0.55, 0, 0.6]], foot: [[1.0, 0.55], [1.0, -0.55], [-1.0, 0.55], [-1.0, -0.55], [0, 0]], slope: 0.3, ring: 1.15, pick: 0.85, h: 0.55, bed: true },
  campfire: { circles: [[0, 0, 0.6]], foot: [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0, 0]], slope: 0.35, ring: 0.68, pick: 0.7, light: { y: 0.7, radius: 10, col: [1.0, 0.52, 0.2] }, embers: 0.6, h: 0.4 },
};

const local = (x, z, yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];

export class Placement {
  constructor(scene, camera, lights, hooks) {
    this.scene = scene; this.camera = camera; this.lights = lights; this.hooks = hooks;
    this.group = new THREE.Group(); scene.add(this.group);
    this.objects = [];
    this.ghosts = {};
    this.ghost = null; this.target = null; this.rotOffset = 0;

    // footprint ring that follows the ground
    const SEG = 40;
    this.ringGeo = new THREE.BufferGeometry();
    this.ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    this.ringGeo.setIndex(idx);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ring.frustumCulled = false; this.ring.visible = false; this.ring.renderOrder = 7;
    this.SEG = SEG;
    scene.add(this.ring);

    // embers rising from fires and torches
    this.EN = 80;
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.EN * 3).fill(-999), 3));
    eg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.EN * 3), 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ size: 0.045, vertexColors: true }));
    this.embers.frustumCulled = false;
    this.eVel = new Float32Array(this.EN * 3); this.eLife = new Float32Array(this.EN); this.eNext = 0; this.eAcc = 0;
    scene.add(this.embers);
  }

  setWorld(world, player) {
    for (const o of this.objects) this.dispose(o, false);
    this.objects = [];
    this.world = world; this.player = player;
    for (const e of getW('placed', worldKey(world.cfg)) || []) if (PLACEABLE[e.id]) this.spawn(e.id, e.x, e.y, e.z, e.yaw, e.items, e.cook);
  }
  save() {
    setW('placed', worldKey(this.world.cfg), this.objects.map((o) => ({ id: o.id, x: +o.x.toFixed(2), y: +o.y.toFixed(2), z: +o.z.toFixed(2), yaw: +o.yaw.toFixed(3), ...(o.items ? { items: o.items } : {}), ...(o.cook ? { cook: { id: o.cook.id, t: +o.cook.t.toFixed(1) } } : {}) })));
  }

  spawn(id, x, y, z, yaw, items, cook) {
    const def = PLACEABLE[id];
    const mesh = dress(MODELS[id](), 'world');
    mesh.position.set(x, y, z); mesh.rotation.y = yaw;
    mesh.updateMatrixWorld(true);
    mesh.traverse((m) => { m.matrixAutoUpdate = false; });
    this.group.add(mesh);
    const o = { id, x, y, z, yaw, mesh, colliders: [] };
    if (def.slots) { // a chest: its own storage and a lid on a hinge
      o.items = Array.from({ length: def.slots }, (_, k) => items?.[k] ?? null);
      o.lid = mesh.children.find((c) => c.userData.hinge);
      o.lidA = 0; o.lidOpen = false;
    }
    for (const [cx, cz, r] of def.circles) {
      const [lx, lz] = local(cx, cz, yaw);
      const c = { x: x + lx, z: z + lz, r, placed: o };
      this.player.addCollider(c); o.colliders.push(c);
    }
    this.hooks.flatten?.(o, x, z, def.ring + 0.15);
    if (cook) { o.cook = { ...cook }; this.hooks.spawned?.(o); } // a fish on the spit (cooking.js)
    if (def.light) o.light = this.lights.add({ x, y: y + def.light.y, z, radius: def.light.radius, r: def.light.col[0] * 0.8, g: def.light.col[1] * 0.8, b: def.light.col[2] * 0.8 });
    this.objects.push(o);
    return o;
  }
  dispose(o, save = true) {
    o.mesh.removeFromParent();
    for (const c of o.colliders) this.player?.removeColliderObj(c);
    if (o.light) this.lights.remove(o.light);
    this.hooks.disposed?.(o);
    this.hooks.release?.(o);
    this.objects.splice(this.objects.indexOf(o), 1);
    if (save) this.save();
  }

  // ---- aiming ---------------------------------------------------------
  // first ground / deck point along the view ray
  groundHit() {
    const cam = this.camera.position, dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (dir.y > 0.25) return null;
    for (let d = 0.6; d <= REACH + 1; d += 0.06) {
      const x = cam.x + dir.x * d, y = cam.y + dir.y * d, z = cam.z + dir.z * d;
      const g = this.player.groundAt(x, z, y);
      if (y <= g) return { x, z, y: g, d };
    }
    return null;
  }

  check(id, x, z, yaw) {
    const def = PLACEABLE[id], w = this.world, pl = this.player;
    let lo = Infinity, hi = -Infinity, wet = false;
    for (const [fx, fz] of def.foot) {
      const [lx, lz] = local(fx, fz, yaw);
      const g = pl.groundAt(x + lx, z + lz, pl.pos.y + 1.5);
      lo = Math.min(lo, g); hi = Math.max(hi, g);
      if (g < 0.08 && w.heightAt(x + lx, z + lz) >= g - 0.01) wet = true;
    }
    if (wet) return { ok: false, why: 'Pas dans l’eau' };
    if (hi - lo > def.slope) return { ok: false, why: 'Sol trop pentu' };
    const y = id === 'transat' || id === 'campfire' || id === 'bed' ? (lo + hi) / 2 : this.player.groundAt(x, z, pl.pos.y + 1.5);
    for (const [cx, cz, r] of def.circles) {
      const [lx, lz] = local(cx, cz, yaw), px = x + lx, pz = z + lz;
      if (Math.hypot(px - pl.pos.x, pz - pl.pos.z) < r + 0.32 && Math.abs(pl.pos.y - y) < 1.5) return { ok: false, why: 'Trop près de toi' };
      if (pl.blocked(px, pz, r - 0.04)) return { ok: false, why: 'Pas de place' };
    }
    if (def.clear) for (const o of this.objects) if (o.id === 'parasol' && Math.hypot(o.x - x, o.z - z) < def.clear * 1.6) return { ok: false, why: 'Pas de place' };
    // keep the hut posts, pier and trees clear of big canopies
    return { ok: true, y };
  }

  // called every frame with the held item id (or null)
  aim(id) {
    for (const k in this.ghosts) this.ghosts[k].visible = false;
    this.ring.visible = false;
    this.target = null;
    if (!id || !PLACEABLE[id] || !this.player) return;
    const hit = this.groundHit();
    if (!hit) return;
    const pl = this.player;
    const dx = pl.pos.x - hit.x, dz = pl.pos.z - hit.z;
    let yaw = Math.atan2(-dz, dx) + this.rotOffset;
    yaw = Math.round(yaw / (Math.PI / 12)) * (Math.PI / 12);
    const far = Math.hypot(dx, dz) > REACH;
    const res = far ? { ok: false, why: 'Trop loin' } : this.check(id, hit.x, hit.z, yaw);
    const y = res.y ?? hit.y;
    if (!this.ghosts[id]) { this.ghosts[id] = dress(MODELS[id](), 'ghost'); this.ghosts[id].renderOrder = 8; this.scene.add(this.ghosts[id]); }
    const g = this.ghosts[id];
    g.visible = true; g.position.set(hit.x, y, hit.z); g.rotation.y = yaw;
    ghostColor.value.set(res.ok ? 0x4fa8ff : 0xff4a3a);
    this.ringMat.color.set(res.ok ? 0x7cc4ff : 0xff6a52);
    this.updateRing(hit.x, hit.z, PLACEABLE[id].ring, y);
    this.ring.visible = true;
    this.target = { id, x: hit.x, y, z: hit.z, yaw, ok: res.ok, why: res.why };
  }

  updateRing(x, z, r, y0) {
    const P = this.ringGeo.attributes.position;
    for (let i = 0; i <= this.SEG; i++) {
      const a = (i / this.SEG) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const [k, rr] of [[0, r], [1, r + 0.06]]) {
        const px = x + c * rr, pz = z + s * rr;
        const g = this.player.groundAt(px, pz, y0 + 1);
        P.setXYZ(i * 2 + k, px, Math.max(g, y0 - 0.5) + 0.04, pz);
      }
    }
    P.needsUpdate = true;
  }

  // try to place the held item; returns true when placed
  place() {
    const t = this.target;
    if (!t) return false;
    if (!t.ok) { this.hooks.message?.(t.why); this.hooks.sound?.('deny'); return false; }
    const o = this.spawn(t.id, t.x, t.y, t.z, t.yaw);
    this.save();
    this.hooks.sound?.('place');
    this.puff(o.x, o.y + 0.1, o.z);
    return true;
  }

  // the placed object the player is looking at, within reach
  aimed(maxD = 3.4) {
    const cam = this.camera.position, dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let best = null, bt = Infinity;
    for (const o of this.objects) {
      const def = PLACEABLE[o.id];
      const c = new THREE.Vector3(o.x, o.y + (def.h ?? 0.9), o.z);
      const t = c.clone().sub(cam).dot(dir);
      if (t < 0 || t > maxD + def.pick) continue;
      const dist = cam.clone().addScaledVector(dir, t).distanceTo(c);
      if (dist < def.pick + 0.25 && t < bt) { bt = t; best = o; }
    }
    return best;
  }
  pickUp(o) {
    this.puff(o.x, o.y + 0.2, o.z);
    this.dispose(o);
    return o.id;
  }

  puff(x, y, z) {
    const pos = this.embers.geometry.attributes.position, col = this.embers.geometry.attributes.color;
    for (let k = 0; k < 14; k++) {
      const i = this.eNext = (this.eNext + 1) % this.EN;
      pos.setXYZ(i, x, y, z);
      const v = 0.85 + Math.random() * 0.15;
      col.setXYZ(i, 0.93 * v, 0.86 * v, 0.68 * v);
      const a = Math.random() * 6.28;
      this.eVel.set([Math.cos(a) * 1.4, 0.6 + Math.random(), Math.sin(a) * 1.4], i * 3);
      this.eLife[i] = 0.5 + Math.random() * 0.3;
    }
    col.needsUpdate = true;
  }

  update(dt) {
    const cam = this.camera.position;
    // spawn embers from nearby fires
    this.eAcc += dt;
    const pos = this.embers.geometry.attributes.position, col = this.embers.geometry.attributes.color;
    if (this.eAcc > 0.07) {
      this.eAcc = 0;
      for (const o of this.objects) {
        const def = PLACEABLE[o.id];
        if (def.embers == null || Math.hypot(o.x - cam.x, o.z - cam.z) > 30) continue;
        if (Math.random() > (o.id === 'campfire' ? 0.8 : 0.25)) continue;
        const i = this.eNext = (this.eNext + 1) % this.EN;
        pos.setXYZ(i, o.x + (Math.random() - 0.5) * 0.15, o.y + def.embers, o.z + (Math.random() - 0.5) * 0.15);
        const hot = Math.random();
        col.setXYZ(i, 1, 0.45 + hot * 0.45, 0.1 + hot * 0.2);
        this.eVel.set([(Math.random() - 0.5) * 0.4, 0.7 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4], i * 3);
        this.eLife[i] = 0.8 + Math.random() * 0.9;
      }
      col.needsUpdate = true;
    }
    // chest lids swing with a little overshoot when opening
    for (const o of this.objects) {
      if (!o.lid) continue;
      const target = o.lidOpen ? 1.25 : 0;
      if (Math.abs(o.lidA - target) < 0.002 && !o.lidV) continue;
      o.lidV = (o.lidV || 0) + ((target - o.lidA) * 90 - (o.lidV || 0) * 14) * dt;
      o.lidA += o.lidV * dt;
      if (!o.lidOpen && o.lidA < 0) { o.lidA = 0; o.lidV = 0; this.hooks.sound?.('chestShut'); } // falls shut
      if (Math.abs(o.lidV) < 0.01 && Math.abs(o.lidA - target) < 0.002) { o.lidA = target; o.lidV = 0; }
      o.lid.rotation.x = -o.lidA;
      o.lid.updateMatrix();
    }
    let any = false;
    const t = performance.now() / 1000;
    for (let i = 0; i < this.EN; i++) {
      if (this.eLife[i] <= 0) continue;
      any = true;
      this.eLife[i] -= dt;
      pos.setXYZ(i, pos.getX(i) + (this.eVel[i * 3] + Math.sin(t * 3 + i) * 0.2) * dt, pos.getY(i) + this.eVel[i * 3 + 1] * dt, pos.getZ(i) + this.eVel[i * 3 + 2] * dt);
      if (this.eLife[i] <= 0) pos.setY(i, -999);
    }
    if (any) pos.needsUpdate = true;
  }

  setLid(o, open) { o.lidOpen = open; }

  // loudest fire close to the player (for the crackle ambience)
  nearestFire() {
    let best = Infinity;
    for (const o of this.objects) if (PLACEABLE[o.id].light) best = Math.min(best, Math.hypot(o.x - this.camera.position.x, o.z - this.camera.position.z) * (o.id === 'campfire' ? 1 : 1.8));
    return best;
  }
}
