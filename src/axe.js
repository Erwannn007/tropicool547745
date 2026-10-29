// Axe: held model with swing, chop palms / jungle trees (chips, shake, fall)
// and turn them into wood + coconuts. Felled trees are remembered per world
// and grow back after a while.
import * as THREE from 'three';

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

export class Axe {
  constructor(scene, camera, tex, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.swingT = -1;
    this.hits = new Map();
    this.shakes = [];
    this.falling = [];

    // held model: wooden handle + steel head with a bright cutting edge
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), new THREE.MeshBasicMaterial({ map: tex.wood, color: 0xffe2b0 }));
    handle.position.y = 0.31;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.16, 0.22), new THREE.MeshBasicMaterial({ color: 0x9aa4b2 }));
    head.position.set(0, 0.54, -0.09);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.24, 0.04), new THREE.MeshBasicMaterial({ color: 0xf2f6fb }));
    edge.position.set(0, 0.54, -0.215);
    const poll = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.09, 0.06), new THREE.MeshBasicMaterial({ color: 0x6a7280 }));
    poll.position.set(0, 0.55, 0.02);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.14, 0.052), new THREE.MeshBasicMaterial({ color: 0x8a5232 }));
    grip.position.y = 0.08;
    g.add(handle, head, edge, poll, grip);
    this.model = g;
    this.holder = new THREE.Group();
    this.holder.add(g);
    this.holder.position.set(0.36, -0.4, -0.62);
    this.holder.scale.setScalar(0.8);
    this.holder.visible = false;
    camera.add(this.holder);

    // wood chips / leaf bits
    this.N = 48;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3).fill(-999), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.chips = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.08, vertexColors: true }));
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
    this.falling = []; this.shakes = [];
  }

  setEquipped(on) { this.equipped = on; this.holder.visible = on; }

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
    if (this.swingT >= 0) return;
    this.swingT = 0;
    this.struck = false;
    this.hooks.sound?.('swing');
  }

  strike() {
    const p = this.target();
    if (!p) { this.hooks.sound?.('whiff'); return; }
    const n = (this.hits.get(p) || 0) + 1;
    this.hits.set(p, n);
    const cam = this.camera.position;
    const d = Math.hypot(cam.x - p.x, cam.z - p.z) || 1;
    const hx = p.x + (cam.x - p.x) / d * 0.3 * p.s, hz = p.z + (cam.z - p.z) / d * 0.3 * p.s;
    this.burst(hx, p.y + 1.1, hz, 10, [0.55, 0.36, 0.18], 1.6);
    this.burst(hx, p.y + 1.1, hz, 4, [0.85, 0.66, 0.4], 1.2);
    this.hooks.sound?.('chop');
    this.hooks.rumble?.(0.45, 90);
    if (n >= HITS[p.type]) this.fell(p);
    else {
      const s = this.shakes.find((e) => e.p === p);
      if (s) s.t = 0; else this.shakes.push({ p, t: 0, dir: [(p.x - cam.x) / d, (p.z - cam.z) / d] });
    }
  }

  fell(p) {
    this.hits.delete(p);
    this.shakes = this.shakes.filter((s) => s.p !== p);
    const meshes = [], base = [];
    const m = new THREE.Matrix4();
    for (const { mesh, i } of p.inst || []) {
      mesh.getMatrixAt(i, m);
      const tmp = new THREE.Mesh(mesh.geometry, mesh.material);
      tmp.matrixAutoUpdate = false;
      tmp.matrix.copy(m);
      tmp.frustumCulled = false;
      this.scene.add(tmp);
      meshes.push(tmp); base.push(m.clone());
      mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      mesh.instanceMatrix.needsUpdate = true;
    }
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
    // poof of chips + leaves where the crown landed
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
    // swing animation: wind up, chop down (hit lands mid-swing), recover
    const r = this.model.rotation;
    const time = performance.now() / 1000;
    if (this.swingT >= 0) {
      this.swingT += dt;
      const k = this.swingT / 0.38;
      const a = k < 0.35 ? -(k / 0.35) * 0.6 : k < 0.6 ? -0.6 + ((k - 0.35) / 0.25) * 2.0 : 1.4 * (1 - (k - 0.6) / 0.4);
      r.set(-0.35 - a, 0.15, 0.35 + a * 0.25);
      if (!this.struck && k >= 0.55) { this.struck = true; this.strike(); }
      if (k >= 1) this.swingT = -1;
    } else {
      r.set(-0.35 + Math.sin(time * 1.4) * 0.02, 0.15, 0.35);
    }

    // hit shake on standing trees
    const m = new THREE.Matrix4(), rot = new THREE.Matrix4(), tr = new THREE.Matrix4(), inv = new THREE.Matrix4();
    for (const s of this.shakes) {
      s.t += dt;
      const ang = Math.sin(s.t * 40) * 0.035 * Math.max(0, 1 - s.t / 0.35);
      if (!s.base) s.base = s.p.inst.map(({ mesh, i }) => { const b = new THREE.Matrix4(); mesh.getMatrixAt(i, b); return b; });
      const axis = new THREE.Vector3(-s.dir[1], 0, s.dir[0]);
      tr.makeTranslation(s.p.x, s.p.y, s.p.z); inv.makeTranslation(-s.p.x, -s.p.y, -s.p.z);
      rot.makeRotationAxis(axis, ang);
      s.p.inst.forEach(({ mesh, i }, k) => {
        m.copy(tr).multiply(rot).multiply(inv).multiply(s.base[k]);
        mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true;
      });
    }
    this.shakes = this.shakes.filter((s) => {
      if (s.t < 0.35) return true;
      s.p.inst.forEach(({ mesh, i }, k) => { mesh.setMatrixAt(i, s.base[k]); mesh.instanceMatrix.needsUpdate = true; });
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
