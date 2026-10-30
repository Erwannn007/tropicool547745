// Axe: modelled pixel-art viewmodel (see axeModel.js), chop palms / jungle
// trees: each blow carves a real wedge into the trunk geometry (fresh pale
// wood inside), chips, shake, fall, and logs left on the ground to pick up.
// Felled trees are remembered per world and grow back after a while.
// The blow lands where the edge really meets something (blow.js): a trunk is
// chopped, anything else (stone, rock, ground, hut, pier) jars the axe back
// with the same feedback as the pickaxe (Quarry.hit via hooks.hit).
import * as THREE from 'three';
import { AxeModel, AXE_BLOW } from './axeModel.js';
import { Blow } from './blow.js';
import { globals } from './shaders.js';
import { seedNumber } from './world.js';

const HITS = { palms: 4, trees: 5 };
const REGROW_MS = 20 * 60 * 1000;
const FKEY = 'tropicool.felled.v1';

// where a world's changes are stored: its instance id (older saves used the config)
export const legacyKey = (cfg) => `${seedNumber(cfg.seed)}|${cfg.islands}|${cfg.size}|${cfg.relief}|${cfg.vegetation}`;
export const worldKey = (cfg) => cfg.instance || legacyKey(cfg);
function loadAll() { try { return JSON.parse(localStorage.getItem(FKEY)) || {}; } catch (_) { return {}; } }

// keys of trees still felled (not yet regrown) for this world config
export function loadFelled(cfg) {
  const all = loadAll(), now = Date.now();
  const list = (all[worldKey(cfg)] || []).filter((e) => now - e.t < REGROW_MS);
  return new Set(list.map((e) => e.k));
}
export function saveFelled(cfg, key) {
  const all = loadAll(), wk = worldKey(cfg), now = Date.now();
  all[wk] = (all[wk] || []).filter((e) => now - e.t < REGROW_MS);
  all[wk].push({ k: key, t: now });
  try { localStorage.setItem(FKEY, JSON.stringify(all)); } catch (_) { /* private mode */ }
}

const DEPTH = [0.3, 0.46, 0.6, 0.7, 0.78]; // notch depth per blow, fraction of the trunk radius
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Axe {
  constructor(scene, camera, tex, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.sprite = new AxeModel();
    this.sprite.onChain = () => this.hooks.sound?.('swing');
    this.blow = new Blow(this.sprite, AXE_BLOW, {
      aim: (reach) => this.aim(reach),
      cast: (o, dir, len) => this.hooks.cast?.(o, dir, len),
      hit: (c, dir) => this.hit(c, dir),
    });
    this.hits = new Map();
    this.shakes = [];
    this.falling = [];
    this.chopped = []; // trees whose trunk was swapped for a carvable copy
    this.camShake = 0;
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

    // dust and leaf bits blown along the ground when a tree lands (per-particle fade)
    this.DN = 140;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.DN * 3).fill(-999), 3));
    dg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.DN * 3), 3));
    dg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.DN), 1));
    dg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.DN), 1));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 color; attribute float aAlpha, aSize; uniform float uScale; varying vec4 vC;
        void main() { vC = vec4(color, aAlpha); vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'varying vec4 vC; void main() { if (vC.a < 0.01) discard; gl_FragColor = vC; }',
    }));
    this.dust.frustumCulled = false;
    this.dVel = new Float32Array(this.DN * 3);
    this.dLife = new Float32Array(this.DN);
    this.dMax = new Float32Array(this.DN);
    this.dNext = 0;
    scene.add(this.dust);
  }

  setWorld(world, veg, player) {
    this.world = world; this.veg = veg; this.player = player;
    this.hits.clear();
    for (const f of this.falling) f.meshes.forEach((m) => m.removeFromParent());
    for (const p of this.chopped) if (p.chop) { p.chop.mesh.removeFromParent(); p.chop.geo.dispose(); p.chop = null; }
    this.falling = []; this.shakes = []; this.chopped = [];
  }

  setEquipped(on) { this.equipped = on; this.sprite.setVisible(on); }

  render(renderer, camera) {
    this.dust.material.uniforms.uScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y * 0.5;
    this.sprite.render(renderer, camera);
  }

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

  // swap the instanced trunk for a finely subdivided copy we can carve
  detach(p) {
    if (p.chop || !p.inst?.[0]) return;
    const { mesh: im, i } = p.inst[0];
    const m = new THREE.Matrix4(); im.getMatrixAt(i, m);
    const d = this.veg.detailTrunk(p);
    const mesh = new THREE.Mesh(d.geo, d.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(m); mesh.matrixWorld.copy(m);
    this.scene.add(mesh);
    im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    im.instanceMatrix.needsUpdate = true;
    p.chop = { ...d, mesh, base: m.clone(), inv: m.clone().invert(), notches: [] };
    this.chopped.push(p);
  }

  // where on the trunk the blade bites: towards where the edge met it, the
  // aim ray, else a ray at chest height
  trunkHit(p, at) {
    const mesh = p.chop?.mesh;
    if (!mesh) return null;
    const cam = this.camera.position;
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const y = Math.min(Math.max(cam.y - 0.35, p.y + 0.6), p.y + 1.7);
    const tries = [...(at ? [at.clone().sub(cam).normalize()] : []), dir, new THREE.Vector3(p.x - cam.x, y - cam.y, p.z - cam.z).normalize()];
    for (const d of tries) {
      this.ray.set(cam, d); this.ray.far = 3.5;
      const hit = this.ray.intersectObject(mesh, false)[0];
      if (hit && hit.point.y > p.y + 0.3) return hit;
    }
    return null;
  }

  // Each blow deepens the nearest notch (or starts one): a wedge with a
  // slanted upper face and a nearly flat lower face, cut into the vertices.
  carve(p, hit) {
    const c = p.chop;
    const L = hit.point.clone().applyMatrix4(c.inv);
    const ctr = c.curve(Math.max(0, Math.min(1, L.y / c.H)));
    const dx = L.x - ctr.x, dz = L.z - ctr.z, dl = Math.hypot(dx, dz) || 1;
    const dir = [dx / dl, dz / dl];
    let n = c.notches.find((k) => Math.abs(k.y - L.y) < 0.24 && k.d[0] * dir[0] + k.d[1] * dir[1] > 0.4);
    if (n) n.stage = Math.min(DEPTH.length - 1, n.stage + 1);
    else c.notches.push(n = { y: L.y, d: dir, stage: 0 });

    const P = c.geo.attributes.position, N = c.geo.attributes.normal, A = c.geo.attributes.aCut;
    const bp = c.basePos, bn = c.baseNor;
    for (let v = 0; v < c.wood; v++) {
      const x = bp[v * 3], y = bp[v * 3 + 1], z = bp[v * 3 + 2];
      const cc = c.curve(Math.max(0, Math.min(1, y / c.H)));
      let rx = x - cc.x, rz = z - cc.z;
      const rl = Math.hypot(rx, rz) || 1e-4; rx /= rl; rz /= rl;
      let best = 0, nx = bn[v * 3], ny = bn[v * 3 + 1], nz = bn[v * 3 + 2], cut = 0;
      for (const k of c.notches) {
        const ang = smooth(0.2, 0.72, rx * k.d[0] + rz * k.d[1]);
        if (ang <= 0) continue;
        const r = c.r0 + (c.r1 - c.r0) * (y / c.H);
        const D = r * DEPTH[k.stage], hu = D * 1.15, hl = D * 0.32;
        const dy = y - k.y;
        const kk = dy >= 0 ? 1 - dy / hu : 1 + dy / hl;
        if (kk <= 0) continue;
        const disp = Math.min(rl * 0.92, D * kk * ang);
        if (disp <= best) continue;
        best = disp; cut = kk * ang;
        // face normals: upper face looks out and down, lower face out and up
        const fy = dy >= 0 ? -D / hu : D / hl, fl = Math.hypot(1, fy);
        const fx = rx / fl, fyy = fy / fl, fz = rz / fl;
        nx = bn[v * 3] + (fx - bn[v * 3]) * ang; ny = bn[v * 3 + 1] + (fyy - bn[v * 3 + 1]) * ang; nz = bn[v * 3 + 2] + (fz - bn[v * 3 + 2]) * ang;
      }
      P.setXYZ(v, x - rx * best, y, z - rz * best);
      const nl = Math.hypot(nx, ny, nz) || 1;
      N.setXYZ(v, nx / nl, ny / nl, nz / nl);
      A.setX(v, cut);
    }
    P.needsUpdate = N.needsUpdate = A.needsUpdate = true;
  }

  // what the blow goes for: what the crosshair shows, or a trunk close in
  // front (at chest height) when the crosshair is on the ground or the sky
  aim(reach) {
    const c = this.hooks.aim?.(reach);
    if (c && c.kind !== 'ground') return c;
    const p = this.target();
    if (!p) return c;
    const cam = this.camera.position, d = Math.hypot(cam.x - p.x, cam.z - p.z) || 1, r = (p.type === 'palms' ? 0.32 : 0.35) * p.s;
    const y = Math.min(Math.max(cam.y - 0.35, p.y + 0.6), p.y + 1.7);
    const normal = new THREE.Vector3((cam.x - p.x) / d, 0, (cam.z - p.z) / d);
    return { kind: 'wood', prop: p, point: new THREE.Vector3(p.x + normal.x * r, y, p.z + normal.z * r), normal };
  }

  // the edge met c (null: through air). Returns how hard the axe bounces back.
  hit(c, dir) {
    if (this.hooks.hitPlaced?.()) { this.sprite.freeze(0.05); this.camShake = 0.6; return 0.5; } // knock a placed object loose
    if (c?.kind === 'wood' && HITS[c.prop.type]) { this.chop(c.prop, c.point); return 0.1; } // the blade bites in
    return this.hooks.hit?.(c, dir) ?? 0;
  }

  chop(p, at) {
    const n = (this.hits.get(p) || 0) + 1;
    this.hits.set(p, n);
    const cam = this.camera.position;
    const d = Math.hypot(cam.x - p.x, cam.z - p.z) || 1;
    // a shaking tree must be back at rest before we ray-cast against it
    const sh = this.shakes.find((s) => s.p === p);
    if (sh?.base) this.parts(p).forEach((part, k) => part.set(sh.base[k]));
    this.detach(p);
    const hit = this.trunkHit(p, at);
    if (hit) this.carve(p, hit);
    if (sh) sh.base = null; // re-capture
    const hp = hit ? hit.point : new THREE.Vector3(p.x + (cam.x - p.x) / d * 0.3 * p.s, p.y + 1.1, p.z + (cam.z - p.z) / d * 0.3 * p.s);
    this.burst(hp.x, hp.y, hp.z, 12, [0.55, 0.36, 0.18], 1.8);
    this.burst(hp.x, hp.y, hp.z, 6, [0.95, 0.82, 0.58], 1.4);
    this.hooks.sound?.(`chop:${p.type}:${n / HITS[p.type]}`);
    this.hooks.rumble?.(0.5, 90);
    this.sprite.freeze(0.07);
    this.camShake = 1;
    if (n >= HITS[p.type]) this.fell(p);
    else if (sh) sh.t = 0;
    else this.shakes.push({ p, t: 0, dir: [(p.x - cam.x) / d, (p.z - cam.z) / d] });
  }

  // everything that moves with a tree (crown instances + the carved trunk)
  parts(p) {
    const list = (p.inst || []).filter((_, k) => !(p.chop && k === 0)).map(({ mesh, i }) => ({
      get: (m) => mesh.getMatrixAt(i, m),
      set: (m) => { mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; },
    }));
    const c = p.chop;
    if (c) list.push({ get: (m) => m.copy(c.base), set: (m) => { c.mesh.matrix.copy(m); c.mesh.matrixWorld.copy(m); } });
    return list;
  }

  fell(p) {
    this.hits.delete(p);
    this.shakes = this.shakes.filter((s) => s.p !== p);
    const meshes = [], base = [];
    const m = new THREE.Matrix4();
    for (const [k, { mesh, i }] of (p.inst || []).entries()) {
      if (p.chop && k === 0) continue; // trunk already replaced by the carved copy
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
    if (p.chop) { meshes.push(p.chop.mesh); base.push(p.chop.base.clone()); }
    const cam = this.camera.position;
    const away = new THREE.Vector3(p.x - cam.x, 0, p.z - cam.z).normalize();
    const axis = new THREE.Vector3(0, 1, 0).cross(away).normalize();
    this.falling.push({ p, meshes, base, axis, away, t: 0 });
    this.world.removeProp(p);
    this.player.removeCollider(p);
    saveFelled(this.world.cfg, p.key);
    this.hooks.sound?.('fall:' + p.type);
  }

  finishFall(f) {
    const { p } = f;
    f.meshes.forEach((m) => m.removeFromParent());
    if (p.chop) { p.chop.geo.dispose(); p.chop = null; this.chopped.splice(this.chopped.indexOf(p), 1); }
    const tip = f.away.clone().multiplyScalar(5 * p.s);
    for (let k = 0; k < 4; k++) {
      const t = k / 3;
      this.burst(p.x + tip.x * t, p.y + 0.4, p.z + tip.z * t, 6, k % 2 ? [0.3, 0.7, 0.2] : [0.55, 0.36, 0.18], 2);
    }
    this.gust(p.x + tip.x * 0.55, p.z + tip.z * 0.55, f.away, 5 * p.s);
    this.hooks.sound?.('thud:' + p.type);
    this.hooks.rumble?.(0.8, 220);
    this.camShake = 1.6;
    this.hooks.fallen?.(p, f.away); // the trunk breaks into logs lying on the ground (debris.js)
  }

  // the crown slams down: dust, sand and leaf bits rush out along the ground,
  // and the grass is flattened by a ring of air (uGust in the grass shader)
  gust(cx, cz, away, len) {
    globals.uGust.value.set(cx, cz, globals.uTime.value, 1);
    const pos = this.dust.geometry.attributes.position, col = this.dust.geometry.attributes.color;
    const side = new THREE.Vector3(-away.z, 0, away.x);
    const cols = [[0.97, 0.93, 0.8], [0.93, 0.85, 0.66], [0.89, 0.8, 0.6], [0.58, 0.9, 0.29], [1, 1, 1]];
    for (let k = 0; k < 110; k++) {
      const i = this.dNext = (this.dNext + 1) % this.DN;
      const along = (Math.random() - 0.3) * len, s = Math.random() < 0.5 ? -1 : 1;
      const x = cx + away.x * along, z = cz + away.z * along;
      pos.setXYZ(i, x, this.world.heightAt(x, z) + 0.1 + Math.random() * 0.3, z);
      const sp = 3 + Math.random() * 5;
      const dir = side.clone().multiplyScalar(s).addScaledVector(away, (Math.random() - 0.3) * 0.9).normalize();
      this.dVel.set([dir.x * sp, 0.4 + Math.random() * 1.4, dir.z * sp], i * 3);
      const c = cols[Math.floor(Math.random() * cols.length)];
      col.setXYZ(i, c[0], c[1], c[2]);
      this.dLife[i] = this.dMax[i] = 0.9 + Math.random() * 0.9;
      this.dust.geometry.attributes.aSize.setX(i, 0.16 + Math.random() * 0.22);
    }
    col.needsUpdate = true;
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
    if (this.equipped) this.blow.aim(this.camera);
    this.sprite.update(dt, pl ? pl.bob : 0, moving);
    if (this.equipped) this.blow.sweep(this.camera);

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

    // ground dust: fast then dragged to a stop, growing and fading
    const dp = this.dust.geometry.attributes.position, da = this.dust.geometry.attributes.aAlpha, ds = this.dust.geometry.attributes.aSize;
    let dAny = false;
    const drag = Math.exp(-3.2 * dt);
    for (let i = 0; i < this.DN; i++) {
      if (this.dLife[i] <= 0) { if (da.getX(i) > 0) { da.setX(i, 0); dAny = true; } continue; }
      dAny = true;
      this.dLife[i] -= dt;
      const v = this.dVel;
      v[i * 3] *= drag; v[i * 3 + 2] *= drag; v[i * 3 + 1] = v[i * 3 + 1] * drag - 1.5 * dt;
      dp.setXYZ(i, dp.getX(i) + v[i * 3] * dt, dp.getY(i) + v[i * 3 + 1] * dt, dp.getZ(i) + v[i * 3 + 2] * dt);
      const life = Math.max(0, this.dLife[i] / this.dMax[i]);
      da.setX(i, Math.min(1, life * 1.8) * 0.85);
      ds.setX(i, ds.getX(i) * (1 + dt * 1.4));
    }
    if (dAny) { dp.needsUpdate = true; da.needsUpdate = true; ds.needsUpdate = true; }
  }
}
