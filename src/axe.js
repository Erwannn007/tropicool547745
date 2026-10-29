// Axe: 3D voxel pixel-art viewmodel (see axeModel.js), chop palms / jungle
// trees with notches carved into the trunk, chips, shake, fall, and drops.
// Felled trees are remembered per world and grow back after a while.
import * as THREE from 'three';
import { AxeModel } from './axeModel.js';

const HITS = { palms: 4, trees: 5 };
const REGROW_MS = 20 * 60 * 1000;
const FKEY = 'tropicool.felled.v1';

const worldKey = (cfg) => `${cfg.seed}|${cfg.islands}|${cfg.size}|${cfg.relief}|${cfg.vegetation}`;
function loadAll() { try { return JSON.parse(localStorage.getItem(FKEY)) || {}; } catch (_) { return {}; } }

// keys of trees still felled (not yet regrown) for this world config
export function loadFelled(cfg) {
  const all = loadAll(), now = Date.now();
  const list = (all[worldKey(cfg)] || []).filter((e) => now - e.t < REGROW_MS);
  return new Set(list.map((e) => e.k));
}
function saveFelled(cfg, key) {
  const all = loadAll(), wk = worldKey(cfg), now = Date.now();
  all[wk] = (all[wk] || []).filter((e) => now - e.t < REGROW_MS);
  all[wk].push({ k: key, t: now });
  try { localStorage.setItem(FKEY, JSON.stringify(all)); } catch (_) { /* private mode */ }
}

// Pixel-art notch: fresh pale wood rim, V-shaped cut (lit top face, shaded
// bottom face, dark crease), jagged bark edge and splinters. 3 depth stages.
function notchTexture(stage) {
  const W = 32, H = 24;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 11 + stage * 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const depth = [0.55, 0.78, 1][stage];
  const cx = W / 2 - 0.5, cy = H / 2 - 0.5;
  const rx = 7 + 7 * depth, ry = 3 + 6 * depth;
  const jag = Array.from({ length: 24 }, () => 0.82 + rnd() * 0.3);
  const rim = ['#5a3a1c', '#f6e2b4', '#ecd29a', '#dcb97e'];
  const top = ['#e0b676', '#cf9f5f', '#bb884a'];
  const bot = ['#9a6638', '#845530', '#6e4426'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    const ang = Math.atan2(dy, dx);
    const j = jag[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 24) % 24];
    const r = Math.hypot(dx, dy) / j;
    if (r > 1.12) continue;
    if (r > 1.0) { px(x, y, rim[0]); continue; }                          // bark edge
    if (r > 0.78) { px(x, y, rim[1 + Math.floor(rnd() * 3)]); continue; } // chipped fresh wood
    const v = (y - cy) / (ry * 0.78);                                     // -1 top .. 1 bottom
    if (Math.abs(v) < 0.14 + 0.06 * depth) { px(x, y, '#3e2210'); continue; } // crease
    const k = Math.min(2, Math.floor(Math.abs(v) * 3 + rnd() * 0.6));
    px(x, y, v < 0 ? top[k] : bot[2 - k]);
    if (rnd() < 0.08) px(x, y, v < 0 ? '#f0cc8c' : '#5e381e'); // fibres
  }
  for (let i = 0; i < 3 + stage * 2; i++) { // splinters sticking out of the rim
    const a = rnd() * Math.PI * 2, len = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < len; k++) {
      const x = Math.round(cx + Math.cos(a) * (rx + 0.5 + k)), y = Math.round(cy + Math.sin(a) * (ry + 0.5 + k * 0.6));
      if (x >= 0 && y >= 0 && x < W && y < H) px(x, y, k === len - 1 ? '#c99a5e' : '#f2d9a4');
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

// small plane bent to hug a trunk of radius r (edges pushed back)
function notchGeometry(w, h, r) {
  const g = new THREE.PlaneGeometry(w, h, 6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, -(r - Math.sqrt(Math.max(0, r * r - x * x))));
  }
  return g;
}

export class Axe {
  constructor(scene, camera, tex, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.sprite = new AxeModel();
    this.sprite.onChain = () => this.hooks.sound?.('swing');
    this.hits = new Map();
    this.shakes = [];
    this.falling = [];
    this.marks = [];
    this.camShake = 0;
    this.notchMats = [0, 1, 2].map((s) => new THREE.MeshBasicMaterial({
      map: notchTexture(s), alphaTest: 0.5, color: 0xece4d6,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.ray = new THREE.Raycaster();

    // wood chips / leaf bits
    this.N = 64;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3).fill(-999), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.chips = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
    this.chips.frustumCulled = false;
    this.vel = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    this.next = 0;
    scene.add(this.chips);
  }

  setWorld(world, veg, player) {
    this.world = world; this.veg = veg; this.player = player;
    this.hits.clear();
    for (const f of this.falling) f.meshes.forEach((m) => m.removeFromParent());
    for (const m of this.marks) { m.removeFromParent(); m.geometry.dispose(); }
    this.falling = []; this.shakes = []; this.marks = [];
  }

  setEquipped(on) { this.equipped = on; this.sprite.setVisible(on); }

  render(renderer, camera) { this.sprite.render(renderer, camera); }

  // nearest standing trunk in front of the player, within reach
  target() {
    const cam = this.camera.position;
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const fx = dir.x, fz = dir.z, fl = Math.hypot(fx, fz) || 1;
    let best = null, bestD = 1e9;
    for (const type of ['palms', 'trees']) for (const p of this.world.props[type]) {
      if (p.gone) continue;
      const dx = p.x - cam.x, dz = p.z - cam.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const d = Math.hypot(dx, dz);
      if (d > 2.8 || d < 0.05) continue;
      const cos = (dx * fx + dz * fz) / (d * fl);
      if (cos < 0.72 && d > 0.9) continue;
      if (Math.abs(this.player.pos.y - p.y) > 2.2) continue;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  action() {
    if (this.sprite.swing()) this.hooks.sound?.('swing');
  }

  // where on the trunk the blade bites: aim ray first, else a ray at chest height
  trunkHit(p) {
    const trunk = p.inst?.[0];
    if (!trunk) return null;
    const cam = this.camera.position;
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const y = Math.min(Math.max(cam.y - 0.35, p.y + 0.6), p.y + 1.7);
    const tries = [dir, new THREE.Vector3(p.x - cam.x, y - cam.y, p.z - cam.z).normalize()];
    for (const d of tries) {
      this.ray.set(cam, d); this.ray.far = 3.5;
      const hit = this.ray.intersectObject(trunk.mesh, false).find((h) => h.instanceId === trunk.i);
      if (hit && hit.point.y > p.y + 0.3) return hit;
    }
    return null;
  }

  // Trunk axis + widest radius of the ring that was hit. Two vertices of the
  // hit face on the same ring row satisfy v = centre + normal * radius.
  ringInfo(p, hit) {
    const { mesh, i } = p.inst[0];
    const g = mesh.geometry;
    const P = g.attributes.position, Nn = g.attributes.normal, UV = g.attributes.uv;
    const ids = [hit.face.a, hit.face.b, hit.face.c];
    const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m);
    for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) {
      const a = ids[x], b = ids[y];
      if (Math.abs(UV.getY(a) - UV.getY(b)) > 1e-3) continue;
      const dn = Math.hypot(Nn.getX(a) - Nn.getX(b), Nn.getY(a) - Nn.getY(b), Nn.getZ(a) - Nn.getZ(b));
      if (dn < 1e-3) continue;
      const ra = Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b)) / dn;
      const centre = new THREE.Vector3(P.getX(a) - Nn.getX(a) * ra, P.getY(a) - Nn.getY(a) * ra, P.getZ(a) - Nn.getZ(a) * ra).applyMatrix4(m);
      // rings are wider at their base (v = 0) than at their top (v = 1)
      const rMax = (UV.getY(a) < 0.5 ? ra : ra * 1.12 / 0.9) * p.s;
      return { centre, r: rMax };
    }
    return null;
  }

  carve(p, hit) {
    const info = this.ringInfo(p, hit);
    if (!info) return;
    const r = info.r + 0.015;
    // radial direction from the trunk axis to the impact, kept nearly horizontal
    const n = new THREE.Vector3(hit.point.x - info.centre.x, 0, hit.point.z - info.centre.z).normalize();
    // deepen an existing notch close to this spot, otherwise start a new one
    let mark = (p.marks || []).find((k) => k.userData.pos.distanceTo(hit.point) < 0.4);
    if (mark) {
      const st = Math.min(2, mark.userData.stage + 1);
      mark.userData.stage = st;
      mark.material = this.notchMats[st];
      mark.geometry.dispose();
      mark.geometry = notchGeometry(0.3 + 0.08 * st, 0.2 + 0.05 * st, mark.userData.r);
      return;
    }
    mark = new THREE.Mesh(notchGeometry(0.3, 0.2, r), this.notchMats[0]);
    mark.matrixAutoUpdate = false;
    // concentric with the trunk: plane centre sits at radius r from the axis
    const pos = new THREE.Vector3(info.centre.x, hit.point.y, info.centre.z).addScaledVector(n, r);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mark.matrix.compose(pos, q, new THREE.Vector3(1, 1, 1));
    mark.userData = { pos: hit.point.clone(), stage: 0, r, base: mark.matrix.clone() };
    this.scene.add(mark);
    (p.marks ||= []).push(mark);
    this.marks.push(mark);
  }

  strike() {
    const p = this.target();
    if (!p) { this.hooks.sound?.('whiff'); return; }
    const n = (this.hits.get(p) || 0) + 1;
    this.hits.set(p, n);
    const cam = this.camera.position;
    const d = Math.hypot(cam.x - p.x, cam.z - p.z) || 1;
    // a shaking tree must be back at rest before we ray-cast against it
    const sh = this.shakes.find((s) => s.p === p);
    if (sh?.base) this.parts(p).forEach((part, k) => part.set(sh.base[k]));
    const hit = this.trunkHit(p);
    if (hit) this.carve(p, hit);
    if (sh) sh.base = null; // re-capture including the new notch
    const hp = hit ? hit.point : new THREE.Vector3(p.x + (cam.x - p.x) / d * 0.3 * p.s, p.y + 1.1, p.z + (cam.z - p.z) / d * 0.3 * p.s);
    this.burst(hp.x, hp.y, hp.z, 12, [0.55, 0.36, 0.18], 1.8);
    this.burst(hp.x, hp.y, hp.z, 6, [0.95, 0.82, 0.58], 1.4);
    this.hooks.sound?.('chop');
    this.hooks.rumble?.(0.5, 90);
    this.sprite.freeze(0.07);
    this.camShake = 1;
    if (n >= HITS[p.type]) this.fell(p);
    else if (sh) sh.t = 0;
    else this.shakes.push({ p, t: 0, dir: [(p.x - cam.x) / d, (p.z - cam.z) / d] });
  }

  // everything that moves with a tree (trunk, crown, notches)
  parts(p) {
    const list = (p.inst || []).map(({ mesh, i }) => ({
      get: (m) => mesh.getMatrixAt(i, m),
      set: (m) => { mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; },
    }));
    for (const mk of p.marks || []) list.push({ get: (m) => m.copy(mk.userData.base), set: (m) => mk.matrix.copy(m) });
    return list;
  }

  fell(p) {
    this.hits.delete(p);
    this.shakes = this.shakes.filter((s) => s.p !== p);
    const meshes = [], base = [];
    const m = new THREE.Matrix4();
    for (const { mesh, i } of p.inst || []) {
      mesh.getMatrixAt(i, m);
      if (!mesh.visible) { mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); mesh.instanceMatrix.needsUpdate = true; continue; } // inactive LOD
      const tmp = new THREE.Mesh(mesh.geometry, mesh.material);
      tmp.matrixAutoUpdate = false;
      tmp.matrix.copy(m);
      tmp.frustumCulled = false;
      this.scene.add(tmp);
      meshes.push(tmp); base.push(m.clone());
      mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mk of p.marks || []) { meshes.push(mk); base.push(mk.userData.base.clone()); }
    const cam = this.camera.position;
    const away = new THREE.Vector3(p.x - cam.x, 0, p.z - cam.z).normalize();
    const axis = new THREE.Vector3(0, 1, 0).cross(away).normalize();
    this.falling.push({ p, meshes, base, axis, away, t: 0 });
    this.world.removeProp(p);
    this.player.removeCollider(p);
    saveFelled(this.world.cfg, p.key);
    this.hooks.sound?.('creak');
  }

  finishFall(f) {
    const { p } = f;
    f.meshes.forEach((m) => m.removeFromParent());
    for (const mk of p.marks || []) { mk.geometry.dispose(); this.marks.splice(this.marks.indexOf(mk), 1); }
    p.marks = [];
    const tip = f.away.clone().multiplyScalar(5 * p.s);
    for (let k = 0; k < 4; k++) {
      const t = k / 3;
      this.burst(p.x + tip.x * t, p.y + 0.4, p.z + tip.z * t, 6, k % 2 ? [0.3, 0.7, 0.2] : [0.55, 0.36, 0.18], 2);
    }
    const rnd = Math.random;
    const drops = p.type === 'palms'
      ? [['wood:palm', 3 + Math.floor(rnd() * 3)], ['coconut', Math.floor(rnd() * 3)]]
      : [['wood:tree', 3 + Math.floor(rnd() * 3)]];
    this.hooks.sound?.('thud');
    this.hooks.rumble?.(0.8, 220);
    this.camShake = 1.6;
    this.hooks.drops(drops.filter(([, n]) => n > 0));
  }

  burst(x, y, z, count, color, speed) {
    const pos = this.chips.geometry.attributes.position, col = this.chips.geometry.attributes.color;
    for (let k = 0; k < count; k++) {
      const i = this.next = (this.next + 1) % this.N;
      pos.setXYZ(i, x, y, z);
      const v = 0.85 + Math.random() * 0.3;
      col.setXYZ(i, color[0] * v, color[1] * v, color[2] * v);
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.vel.set([Math.cos(a) * s, 1.2 + Math.random() * 2.2, Math.sin(a) * s], i * 3);
      this.life[i] = 0.9 + Math.random() * 0.5;
    }
    col.needsUpdate = true;
  }

  update(dt) {
    const pl = this.player;
    const moving = !!pl && pl.onGround && Math.hypot(pl.vel.x, pl.vel.z) > 0.5;
    if (this.sprite.update(dt, pl ? pl.bob : 0, moving)) this.strike();

    // impact camera shake (the player re-poses the camera every frame)
    if (this.camShake > 0) {
      const k = this.camShake * 0.012;
      this.camera.rotation.z += (Math.random() - 0.5) * k;
      this.camera.rotation.x += (Math.random() - 0.5) * k;
      this.camShake = Math.max(0, this.camShake - dt * 7);
    }

    // hit shake on standing trees
    const m = new THREE.Matrix4(), rot = new THREE.Matrix4(), tr = new THREE.Matrix4(), inv = new THREE.Matrix4();
    for (const s of this.shakes) {
      s.t += dt;
      const parts = this.parts(s.p);
      if (!s.base) s.base = parts.map((part) => { const b = new THREE.Matrix4(); part.get(b); return b; });
      const ang = Math.sin(s.t * 40) * 0.035 * Math.max(0, 1 - s.t / 0.35);
      const axis = new THREE.Vector3(-s.dir[1], 0, s.dir[0]);
      tr.makeTranslation(s.p.x, s.p.y, s.p.z); inv.makeTranslation(-s.p.x, -s.p.y, -s.p.z);
      rot.makeRotationAxis(axis, ang);
      parts.forEach((part, k) => part.set(m.copy(tr).multiply(rot).multiply(inv).multiply(s.base[k])));
    }
    this.shakes = this.shakes.filter((s) => {
      if (s.t < 0.35) return true;
      this.parts(s.p).forEach((part, k) => part.set(s.base[k]));
      return false;
    });

    // falling trees: rotate about the stump, accelerating
    for (const f of this.falling) {
      f.t += dt;
      const k = Math.min(1, f.t / 1.25);
      const ang = k * k * (Math.PI / 2 - 0.12);
      tr.makeTranslation(f.p.x, f.p.y, f.p.z); inv.makeTranslation(-f.p.x, -f.p.y, -f.p.z);
      rot.makeRotationAxis(f.axis, ang);
      f.meshes.forEach((mesh, j) => mesh.matrix.copy(tr).multiply(rot).multiply(inv).multiply(f.base[j]));
      if (k >= 1 && !f.done) { f.done = true; this.finishFall(f); }
    }
    this.falling = this.falling.filter((f) => !f.done);

    // particles
    const pos = this.chips.geometry.attributes.position;
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9 * dt;
      pos.setXYZ(i, pos.getX(i) + this.vel[i * 3] * dt, pos.getY(i) + this.vel[i * 3 + 1] * dt, pos.getZ(i) + this.vel[i * 3 + 2] * dt);
      if (this.life[i] <= 0) pos.setY(i, -999);
    }
    if (any) pos.needsUpdate = true;
  }
}
