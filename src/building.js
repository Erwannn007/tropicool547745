// Building: blocks that stack, floors, log walls, doorways, thatch roofs and
// stairs. The held piece shows as a hologram that snaps onto the sockets of
// the pieces already built (a floor next to a floor, a wall on its edge, a
// roof on a wall top, a block on any face of a block...), or stands on the
// ground on its own; raised floors get legs down to the ground or the lagoon
// bed. Pieces are solid (player.js reads their boxes for walking and
// collisions), the tools knock off them (pickaxe.js), a blow of the axe or an
// empty hand takes one back. Drawn with one instanced mesh per part, saved
// per world.
import * as THREE from 'three';
import { MODELS, floorPosts, STOREY as H } from './models.js';
import { dress, ghostColor, worldMat } from './dress.js';
import { worldKey } from './axe.js';
import { Puffs } from './cooking.js';

const BKEY = 'tropicool.build.v1';
const REACH = 6;
const Q = Math.PI / 2;

// Each piece in its own frame: origin in the middle of the footprint, at the
// level it stands on (a floor: its top); local x along walls, the low end of
// roofs and stairs towards +z. boxes [cx, cz, hx, hz, y0, y1] are solid;
// check (default: boxes) is what may not overlap another piece; ray adds
// shapes only the aim and the tools meet. mid: height of its middle; grab:
// the height near where it meets what it rests on (what the aim snaps by).
const STEPS = Array.from({ length: 10 }, (_, k) => [0, 1 - 0.2 * k - 0.1, 1, 0.1, 0, 0.25 * (k + 1)]); // 10 steps up one storey over 2 m
const ROOF_RAY = Array.from({ length: 4 }, (_, k) => [0, 0.75 - 0.5 * k, 1.15, 0.25, 0.25 * k, 0.25 * (k + 1) + 0.16]);
export const PIECES = {
  'block:wood': { mat: 'wood', boxes: [[0, 0, 0.5, 0.5, 0, 1]], mid: 0.5, grab: 0.5, r: 0.8, sound: 'wood' },
  'block:stone': { mat: 'stone', boxes: [[0, 0, 0.5, 0.5, 0, 1]], mid: 0.5, grab: 0.5, r: 0.8, sound: 'stone' },
  floor: { mat: 'wood', boxes: [[0, 0, 1, 1, -0.22, 0]], mid: -0.1, grab: 0, r: 1.5, sound: 'big' },
  wall: { mat: 'wood', boxes: [[0, 0, 1, 0.24, 0, H]], mid: H / 2, grab: 0.3, r: 1.2, sound: 'big' },
  door: { mat: 'wood', boxes: [[-0.72, 0, 0.28, 0.24, 0, H], [0.72, 0, 0.28, 0.24, 0, H], [0, 0, 0.44, 0.24, 2.0, H]], check: [[0, 0, 1, 0.24, 0, H]], mid: H / 2, grab: 0.3, r: 1.2, sound: 'big' },
  window: { mat: 'wood', boxes: [[0, 0, 1, 0.24, 0, 1], [-0.72, 0, 0.28, 0.24, 1, 2], [0.72, 0, 0.28, 0.24, 1, 2], [0, 0, 1, 0.24, 2, H]], check: [[0, 0, 1, 0.24, 0, H]], mid: H / 2, grab: 0.3, r: 1.2, sound: 'big' },
  roof: { mat: 'thatch', boxes: [], ray: ROOF_RAY, check: [[0, 0, 1, 1, 0.05, 1]], mid: 0.5, grab: 0.3, r: 1.6, snapOnly: true, sound: 'wood', facing: true },
  // two roof panels on the same square at right angles become a hip corner
  // (low along both outer edges, up to the inner corner); worth two roofs
  roofcorner: { mat: 'thatch', boxes: [], ray: ROOF_RAY, check: [[0, 0, 1, 1, 0.05, 1]], mid: 0.5, grab: 0.3, r: 1.6, snapOnly: true, sound: 'wood', refund: ['roof', 2] },
  // half gable: the triangle between a wall top and the roof sloping over it
  gable: { mat: 'wood', boxes: [], ray: [[0, 0, 1, 0.15, 0, 1]], check: [[0, 0, 1, 0.15, 0.05, 0.95]], mid: 0.5, grab: 0.2, r: 1.2, snapOnly: true, sound: 'wood' },
  // the same piece under the high edge of a roof: a full board panel 1 m tall
  gablewall: { mat: 'wood', boxes: [], ray: [[0, 0, 1, 0.15, 0, 1]], check: [[0, 0, 1, 0.15, 0.05, 0.95]], mid: 0.5, grab: 0.2, r: 1.2, snapOnly: true, sound: 'wood', refund: ['gable', 1] },
  flatroof: { mat: 'thatch', boxes: [[0, 0, 1, 1, -0.22, 0]], mid: -0.1, grab: 0, r: 1.5, sound: 'wood' },
  stairs: { mat: 'wood', boxes: STEPS, check: [[0, 0, 1, 1, 0, H]], mid: H / 2, grab: 0.4, r: 1.5, sound: 'big', facing: true },
};
export const isPiece = (id) => !!PIECES[id];

// sockets: where a new piece of one of `types` goes relative to a piece
const WALLS = ['wall', 'door', 'window'], BLOCKS = ['block:wood', 'block:stone'], FLOORS = ['floor', 'flatroof'];
const S = (types, x, y, z, yaw = 0) => ({ types, x, y, z, yaw });
const SOCKETS = {
  floor: [
    S(FLOORS, 2, 0, 0), S(FLOORS, -2, 0, 0), S(FLOORS, 0, 0, 2), S(FLOORS, 0, 0, -2),
    S(WALLS, 0, 0, 1), S(WALLS, 0, 0, -1), S(WALLS, 1, 0, 0, Q), S(WALLS, -1, 0, 0, Q),
    ...[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, z]) => S(BLOCKS, x, 0, z)),
    ...[0, 1, 2, 3].map((k) => S(['stairs'], 0, 0, 0, k * Q)),                                      // up from this floor
    S(['stairs'], 0, -H, 2, 0), S(['stairs'], 2, -H, 0, Q), S(['stairs'], 0, -H, -2, 2 * Q), S(['stairs'], -2, -H, 0, -Q), // up to its edge
  ],
  wall: [
    S(WALLS, 0, H, 0), S(WALLS, 2, 0, 0), S(WALLS, -2, 0, 0),
    S(WALLS, 1, 0, 1, Q), S(WALLS, 1, 0, -1, Q), S(WALLS, -1, 0, 1, Q), S(WALLS, -1, 0, -1, Q),          // corners
    S(FLOORS, 0, H, 1), S(FLOORS, 0, H, -1), S(['floor'], 0, 0, 1), S(['floor'], 0, 0, -1),
    S(['roof'], 0, H, -1, 0), S(['roof'], 0, H, 1, 2 * Q),
    S(['gable'], 0, H, 0, 0), S(['gable'], 0, H, 0, 2 * Q), // which way it rises: to fit the roof above (gableFit)
  ],
  block: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]].map(([x, y, z]) => S(BLOCKS, x, y, z)),
  roof: [S(['roof'], 2, 0, 0), S(['roof'], -2, 0, 0), S(['roof'], 0, 1, -2, 0), S(['roof'], 0, 0, -2, 2 * Q)], // along, up the slope, ridge
  roofcorner: [S(['roof'], -2, 0, 0, 0), S(['roof'], 0, 0, -2, Q)], // on along either eave
  gable: [],
  gablewall: [],
  stairs: [S(FLOORS, 0, H, -2), S(['stairs'], 0, H, -2), S(['floor'], 0, 0, 2), S(WALLS, 1, 0, 0, Q), S(WALLS, -1, 0, 0, Q)],
};
SOCKETS.door = SOCKETS.window = SOCKETS.wall;
SOCKETS.flatroof = SOCKETS.floor;
SOCKETS['block:wood'] = SOCKETS['block:stone'] = SOCKETS.block;

const angDiff = (a, b) => { const d = ((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; return Math.abs(d); };

// a box of a piece placed in the world: centre, local axes u (x) and v (z)
function worldBox([cx, cz, hx, hz, y0, y1], x, y, z, yaw, shrink = 0) {
  const ux = Math.cos(yaw), uz = -Math.sin(yaw), vx = Math.sin(yaw), vz = Math.cos(yaw);
  const sy = Math.min(shrink, (y1 - y0) / 2 - 0.01);
  return {
    x: x + cx * ux + cz * vx, z: z + cx * uz + cz * vz, ux, uz, vx, vz,
    hx: Math.max(0.01, hx - shrink), hz: Math.max(0.01, hz - shrink), y0: y + y0 + sy, y1: y + y1 - sy,
  };
}
// do two boxes overlap (separating axes in the ground plane, then height)?
// Pieces that only touch (a corner of two walls) must pass whatever the
// rounding of their turned axes: 2 cm of play.
const PLAY = 0.02;
function overlap(a, b) {
  if (a.y0 >= b.y1 - PLAY || b.y0 >= a.y1 - PLAY) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of [[a.ux, a.uz], [a.vx, a.vz], [b.ux, b.uz], [b.vx, b.vz]]) {
    const ra = a.hx * Math.abs(a.ux * ax + a.uz * az) + a.hz * Math.abs(a.vx * ax + a.vz * az);
    const rb = b.hx * Math.abs(b.ux * ax + b.uz * az) + b.hz * Math.abs(b.vx * ax + b.vz * az);
    if (Math.abs(dx * ax + dz * az) >= ra + rb - PLAY) return false;
  }
  return true;
}
// a circle (x, z, r) against a box in the ground plane
function circleHits(b, x, z, r) {
  const dx = x - b.x, dz = z - b.z;
  const a = dx * b.ux + dz * b.uz, c = dx * b.vx + dz * b.vz;
  return Math.hypot(a - Math.max(-b.hx, Math.min(b.hx, a)), c - Math.max(-b.hz, Math.min(b.hz, c))) < r;
}
// ray (o, unit d) against a box -> { t, n } or null (slabs in the box frame)
function rayBox(b, o, d, max) {
  const ox = o.x - b.x, oz = o.z - b.z, cy = (b.y0 + b.y1) / 2, hy = (b.y1 - b.y0) / 2;
  const lo = [ox * b.ux + oz * b.uz, o.y - cy, ox * b.vx + oz * b.vz], ld = [d.x * b.ux + d.z * b.uz, d.y, d.x * b.vx + d.z * b.vz], h = [b.hx, hy, b.hz];
  let t0 = 0, t1 = max, axis = -1, sign = 1;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ld[k]) < 1e-9) { if (Math.abs(lo[k]) > h[k]) return null; continue; }
    let ta = (-h[k] - lo[k]) / ld[k], tb = (h[k] - lo[k]) / ld[k], s = -1;
    if (ta > tb) { const t = ta; ta = tb; tb = t; s = 1; }
    if (ta > t0) { t0 = ta; axis = k; sign = s; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (axis < 0) return null; // starts inside
  const n = axis === 1 ? new THREE.Vector3(0, sign, 0) : axis === 0 ? new THREE.Vector3(b.ux * sign, 0, b.uz * sign) : new THREE.Vector3(b.vx * sign, 0, b.vz * sign);
  return { t: t0, n };
}

// one instanced mesh per part of a piece type, grown as needed
class Batch {
  constructor(scene, type) {
    this.scene = scene; this.model = MODELS[type](); this.list = []; this.meshes = []; this.cap = 0;
    this.grow(32);
  }
  grow(cap) {
    const old = this.meshes;
    this.meshes = this.model.parts.map((part, k) => {
      const m = new THREE.InstancedMesh(part.geo, worldMat(part), cap);
      m.frustumCulled = false; m.count = this.list.length;
      if (old[k]) { m.instanceMatrix.array.set(old[k].instanceMatrix.array.subarray(0, this.list.length * 16)); old[k].removeFromParent(); old[k].dispose(); }
      this.scene.add(m);
      return m;
    });
    this.cap = cap;
  }
  add(piece, m) {
    if (this.list.length >= this.cap) this.grow(this.cap * 2);
    piece.idx = this.list.length; this.list.push(piece);
    for (const mesh of this.meshes) mesh.count = this.list.length;
    this.set(piece, m);
  }
  set(piece, m) { for (const mesh of this.meshes) { mesh.setMatrixAt(piece.idx, m); mesh.instanceMatrix.needsUpdate = true; } }
  remove(piece) {
    const last = this.list.pop(), m = new THREE.Matrix4();
    if (last !== piece) { // the last one takes its slot
      this.meshes[0].getMatrixAt(last.idx, m);
      last.idx = piece.idx; this.list[piece.idx] = last;
      this.set(last, m);
    }
    for (const mesh of this.meshes) { mesh.count = this.list.length; mesh.instanceMatrix.needsUpdate = true; }
  }
  clear() { this.list = []; for (const mesh of this.meshes) mesh.count = 0; }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);

export class Building {
  constructor(scene, camera, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.pieces = []; this.grid = new Map();
    this.batches = {};
    for (const t in PIECES) this.batches[t] = new Batch(scene, t);
    this.ghosts = {}; this.ghost = null; this.ghostPosts = null; this.postKey = '';
    this.target = null; this.rot = 0; this.snapKey = '';
    this.popping = [];
    this.dust = new Puffs(scene, 120);
    this.chips = new Puffs(scene, 80);
  }
  setScale(px) { this.dust.pts.material.uniforms.uScale.value = px; this.chips.pts.material.uniforms.uScale.value = px; }

  setWorld(world, player) {
    for (const p of [...this.pieces]) this.drop(p);
    for (const t in this.batches) this.batches[t].clear();
    this.pieces = []; this.grid.clear(); this.popping = [];
    this.world = world; this.player = player;
    player.solids = this;
    let list = [];
    try { list = (JSON.parse(localStorage.getItem(BKEY)) || {})[worldKey(world.cfg)] || []; } catch (_) { /* none */ }
    for (const e of list) if (PIECES[e.t]) this.spawn(e.t, e.x, e.y, e.z, e.yaw, e.posts);
  }
  save() {
    try {
      const all = JSON.parse(localStorage.getItem(BKEY)) || {};
      const r = (v) => +v.toFixed(3);
      all[worldKey(this.world.cfg)] = this.pieces.map((p) => ({ t: p.type, x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(p.yaw), ...(p.posts ? { posts: p.posts.map(r) } : {}) }));
      localStorage.setItem(BKEY, JSON.stringify(all));
    } catch (_) { /* private mode */ }
  }

  // ---------------------------------------------------------------- pieces
  cells(x, z, r, fn) {
    for (let i = Math.floor((x - r) / 4); i <= Math.floor((x + r) / 4); i++) for (let j = Math.floor((z - r) / 4); j <= Math.floor((z + r) / 4); j++) fn(`${i},${j}`);
  }
  // solid boxes around (x, z) (player.js: walking on them, bumping into them)
  near(x, z) { return this.grid.get(`${Math.floor(x / 4)},${Math.floor(z / 4)}`)?.boxes ?? EMPTY; }
  piecesNear(x, z, r) {
    const out = new Set();
    this.cells(x, z, r, (k) => { const c = this.grid.get(k); if (c) for (const p of c.pieces) out.add(p); });
    return out;
  }

  spawn(type, x, y, z, yaw, posts) {
    const def = PIECES[type];
    const p = { type, x, y, z, yaw, posts: posts?.some((l) => l > 0.05) ? posts : null };
    p.boxes = def.boxes.map((b) => ({ ...worldBox(b, x, y, z, yaw), piece: p }));
    p.check = (def.check || def.boxes).map((b) => worldBox(b, x, y, z, yaw, 0.12));
    p.ray = [...p.boxes, ...(def.ray || []).map((b) => ({ ...worldBox(b, x, y, z, yaw), piece: p }))];
    this.batches[type].add(p, this.matrix(p));
    if (p.posts) { // legs of a raised floor
      p.legs = dress(floorPosts(p.posts), 'world');
      p.legs.position.set(x, y, z); p.legs.rotation.y = yaw;
      this.scene.add(p.legs);
    }
    this.cells(x, z, def.r + 0.6, (k) => {
      if (!this.grid.has(k)) this.grid.set(k, { pieces: [], boxes: [] });
      const c = this.grid.get(k); c.pieces.push(p); c.boxes.push(...p.boxes);
    });
    this.pieces.push(p);
    // keep the grass down under what stands on the ground
    if (y - this.world.heightAt(x, z) < 0.6) this.hooks.flatten?.(p, x, z, def.r);
    return p;
  }
  drop(p) {
    p.legs?.removeFromParent();
    this.cells(p.x, p.z, PIECES[p.type].r + 0.6, (k) => {
      const c = this.grid.get(k); if (!c) return;
      c.pieces = c.pieces.filter((q) => q !== p); c.boxes = c.boxes.filter((b) => b.piece !== p);
    });
    this.hooks.release?.(p);
  }
  matrix(p, s = 1, lift = 0) {
    return _m.compose(_p.set(p.x, p.y + lift, p.z), _q.setFromAxisAngle(_Y, p.yaw), _s.set(s, s, s)).clone();
  }

  // ---------------------------------------------------------------- aiming
  // first piece met along a ray -> { piece, dist, point, normal, mat } or null
  ray(o, d, max) {
    let best = null;
    const seen = this.piecesNear(o.x + d.x * max / 2, o.z + d.z * max / 2, max / 2 + 1);
    for (const p of seen) for (const b of p.ray) {
      const h = rayBox(b, o, d, max);
      if (h && (!best || h.t < best.dist)) best = { piece: p, dist: h.t, normal: h.n, point: o.clone().addScaledVector(d, h.t), mat: PIECES[p.type].mat };
    }
    return best;
  }
  // the piece under the crosshair, within reach (to take it back)
  aimed(maxD = 3.6) {
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    return this.ray(this.camera.position, dir, maxD)?.piece ?? null;
  }
  // what the view ray meets first: a piece or the ground (terrain, decks)
  surfaceHit(o, d) {
    const hit = this.ray(o, d, REACH + 1);
    const end = hit ? hit.dist : REACH + 1;
    for (let t = 0.4; t <= end; t += 0.06) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const g = this.player.groundAt(x, z, y);
      if (y <= g) return { dist: t, point: new THREE.Vector3(x, g, z), piece: null };
    }
    return hit;
  }

  // can a piece go there? -> null if it can, else why not
  why(type, x, y, z, yaw, ignore = null) {
    const def = PIECES[type], pl = this.player;
    const check = (def.check || def.boxes).map((b) => worldBox(b, x, y, z, yaw, 0.12));
    const mid = new THREE.Vector3(x, y + def.mid, z);
    if (mid.distanceTo(this.camera.position) > REACH + 1.5) return 'Trop loin';
    for (const p of this.piecesNear(x, z, def.r + 2)) if (p !== ignore) for (const a of p.check) for (const b of check) if (overlap(a, b)) return 'Pas de place';
    for (const b of check) if (b.y0 < pl.pos.y + 1.75 && b.y1 > pl.pos.y + 0.05 && circleHits(b, pl.pos.x, pl.pos.z, 0.36)) return 'Trop près de toi';
    // trees, stones, the hut posts, placed objects
    const ground = this.world.heightAt(x, z);
    if (y < ground + 3) {
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        for (const c of pl.grid.get(`${Math.floor(x / 8) + i},${Math.floor(z / 8) + j}`) || []) {
          if (check.some((b) => b.y0 < this.world.heightAt(c.x, c.z) + 2.5 && circleHits(b, c.x, c.z, c.r))) return 'Pas de place';
        }
      }
    }
    return null;
  }

  // a piece standing on its own on what the crosshair shows
  free(type, P, yaw) {
    const def = PIECES[type], pl = this.player;
    if (def.snapOnly) return { why: 'Pose le toit sur le haut d’un mur' };
    const at = (lx, lz, above = P.y + 1) => pl.groundAt(P.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), P.z - lx * Math.sin(yaw) + lz * Math.cos(yaw), above);
    const corners = (hx, hz) => [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].map(([a, b]) => at(a, b));
    if (type === 'floor') {
      const g = [...corners(0.95, 0.95), at(0, 0)], lo = Math.min(...g), hi = Math.max(...g);
      const y = Math.max(hi + 0.04, 0.3); // over the lagoon it stands on stilts above the water
      if (y - lo > 4.2) return { why: 'Trop haut', y };
      return { y };
    }
    if (type.startsWith('block')) {
      const g = corners(0.45, 0.45), y = at(0, 0) - 0.06;
      if (Math.max(...g) - y > 0.7) return { why: 'Sol trop pentu', y };
      return { y };
    }
    const g = type === 'stairs' ? corners(0.95, 0.95) : corners(0.95, 0.2), lo = Math.min(...g);
    if (Math.max(...g) - lo > 1) return { why: 'Sol trop pentu', y: lo };
    return { y: lo - 0.04 };
  }

  // legs from the corners of a floor down to whatever is under them
  postsFor(type, x, y, z, yaw) {
    if (type !== 'floor') return null;
    const L = [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].map(([a, b]) => {
      const px = x + a * Math.cos(yaw) + b * Math.sin(yaw), pz = z - a * Math.sin(yaw) + b * Math.cos(yaw);
      return Math.max(0, y - 0.2 - this.player.groundAt(px, pz, y - 0.65));
    });
    return L.some((l) => l > 0.05) ? L : null;
  }

  // called every frame with the held item id
  aim(id, dt) {
    const def = PIECES[id];
    if (!def || !this.player) { this.target = null; if (this.ghost) this.ghost.visible = false; if (this.ghostPosts) this.ghostPosts.visible = false; this.snapKey = ''; return; }
    const cam = this.camera.position, dir = this.camera.getWorldDirection(new THREE.Vector3());
    const hit = this.surfaceHit(cam, dir);
    const want = this.player.yaw + this.rot; // which way stairs and roofs rise: away from you
    // the sockets of the pieces around that take this type, nearest the spot
    // the crosshair shows (just on this side of the surface), or nearest the
    // view ray when it shows only sky
    const cands = [];
    const spot = hit ? hit.point.clone().addScaledVector(dir, -0.25) : null;
    const around = spot || cam.clone().addScaledVector(dir, 3.5);
    for (const p of this.piecesNear(around.x, around.z, 5)) for (const s of SOCKETS[p.type]) {
      if (!s.types.includes(id)) continue;
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      const x = p.x + s.x * c + s.z * sn, z = p.z - s.x * sn + s.z * c, y = p.y + s.y, yaw = p.yaw + s.yaw;
      const m = _p.set(x, y + def.grab, z);
      let d;
      if (spot) d = m.distanceTo(spot);
      else { m.sub(cam); const along = m.dot(dir); if (along < 0.5 || along > REACH + 1.5) continue; d = m.addScaledVector(dir, -along).length(); }
      if (d > (spot ? 1.9 : 1.3)) continue;
      cands.push({ x, y, z, yaw, score: d + (def.facing ? angDiff(yaw, want) / Math.PI * 0.9 : 0) + (id === 'gable' ? this.gableFit(x, y, z, yaw) : 0) });
    }
    cands.sort((a, b) => a.score - b.score);
    let t = null;
    for (const c of cands.slice(0, 8)) { // the best one that fits, else the best one (in red)
      const why = this.why(id, c.x, c.y, c.z, c.yaw);
      if (!why) { t = { ...c, snap: true }; break; }
      const m = id === 'roof' && this.corner(c);
      if (m) { t = { ...c, ...m, snap: true }; break; } // the roof already there turns the corner with this one
      if (!t) t = { ...c, snap: true, why };
    }
    if (!t && spot) { // nothing to snap onto: on the ground
      const yaw = Math.round(want / (Math.PI / 12)) * (Math.PI / 12);
      const f = this.free(id, spot, yaw), y = f.y ?? spot.y;
      t = { x: spot.x, y, z: spot.z, yaw, snap: false, why: f.why || this.why(id, spot.x, y, spot.z, yaw) };
    }
    if (t && id === 'gable') { t.type = this.gableShape(t.x, t.y, t.z, t.yaw); if (!t.type) { t.type = 'gable'; t.why = 'Rien à fermer ici'; } }
    this.showGhost(t?.type ?? id, t, dt);
    if (!t) { this.target = null; this.snapKey = ''; return; }
    t.posts = this.postsFor(id, t.x, t.y, t.z, t.yaw);
    t.id = id; t.type ??= id; t.ok = !t.why;
    this.target = t;
    const key = t.snap ? `${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)},${t.yaw.toFixed(2)}` : '';
    if (key && key !== this.snapKey) this.hooks.sound?.('snap');
    this.snapKey = key;
  }

  // a roof square already holding a panel at right angles to this one: the
  // two make a hip corner -> { type, yaw, merge } or null
  corner(c) {
    for (const q of this.piecesNear(c.x, c.z, 1)) {
      if (q.type !== 'roof' || Math.hypot(q.x - c.x, q.z - c.z) > 0.05 || Math.abs(q.y - c.y) > 0.05 || Math.abs(angDiff(q.yaw, c.yaw) - Q) > 0.1) continue;
      // the corner's two eaves (+z, +x in its frame) are the two panels' low edges
      const low = (y) => [Math.sin(y), Math.cos(y)], a = low(q.yaw), b = low(c.yaw);
      const yaw = Math.cos(q.yaw) * b[0] - Math.sin(q.yaw) * b[1] > 0.9 ? q.yaw : c.yaw;
      if (this.why('roofcorner', c.x, c.y, c.z, yaw, q)) return null;
      return { type: 'roofcorner', yaw, merge: q };
    }
    return null;
  }
  // underside of the roof over (x, z), or null
  roofOver(x, z) {
    let best = null;
    for (const p of this.piecesNear(x, z, 1)) {
      if (p.type !== 'roof' && p.type !== 'roofcorner') continue;
      const dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > 1.25 || lz < -1.1 || lz > 1.4 || (p.type === 'roofcorner' && lx < -1.1)) continue;
      const y = p.y + 0.512 - 0.5 * (p.type === 'roof' ? lz : Math.max(lx, lz));
      if (best == null || y > best) best = y;
    }
    return best;
  }
  // a gable fits when the roof over it is high at its high end, low at the other
  gableFit(x, y, z, yaw) {
    const c = Math.cos(yaw) * 0.9, s = Math.sin(yaw) * 0.9;
    const hi = this.roofOver(x + c, z - s), lo = this.roofOver(x - c, z + s);
    if (hi == null || lo == null) return 0;
    return hi - lo > 0.4 ? -0.8 : lo - hi > 0.4 ? 0.8 : 0;
  }
  // under the high edge of a roof (high over both ends) the gable is a full panel
  gableShape(x, y, z, yaw) {
    const c = Math.cos(yaw) * 0.9, s = Math.sin(yaw) * 0.9;
    const a = this.roofOver(x + c, z - s), b = this.roofOver(x - c, z + s);
    if (a != null && b != null && a - y < 0.3 && b - y < 0.3) return null; // under the low edge: nothing to close
    return a != null && b != null && a - y > 0.7 && b - y > 0.7 ? 'gablewall' : 'gable';
  }

  showGhost(id, t, dt) {
    if (this.ghost && this.ghost !== this.ghosts[id]) this.ghost.visible = false;
    if (!this.ghosts[id]) { const g = dress(MODELS[id](), 'ghost'); g.traverse((m) => { m.renderOrder = 8; }); this.scene.add(g); this.ghosts[id] = g; }
    const g = this.ghost = this.ghosts[id];
    if (!t) { g.visible = false; if (this.ghostPosts) this.ghostPosts.visible = false; return; }
    // the hologram glides onto its spot (and jumps when it is far)
    const far = !g.visible || g.position.distanceTo(_p.set(t.x, t.y, t.z)) > 2.5;
    const k = far ? 1 : 1 - Math.exp(-dt * 28);
    g.visible = true;
    g.position.lerp(_p.set(t.x, t.y, t.z), k);
    const dy = ((t.yaw - g.rotation.y) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    g.rotation.y = far ? t.yaw : g.rotation.y + dy * k;
    ghostColor.value.set(t.why ? 0xff4a3a : t.snap ? 0x5ee6ff : 0x4fa8ff);
    // legs under a raised floor, in hologram too
    const posts = id === 'floor' ? this.postsFor(id, t.x, t.y, t.z, t.yaw) : null, key = posts ? posts.map((l) => l.toFixed(1)).join() : '';
    if (key !== this.postKey) {
      this.postKey = key;
      if (this.ghostPosts) this.ghostPosts.removeFromParent();
      this.ghostPosts = posts ? dress(floorPosts(posts), 'ghost') : null;
      if (this.ghostPosts) { this.ghostPosts.traverse((m) => { m.renderOrder = 8; }); this.scene.add(this.ghostPosts); }
    }
    if (this.ghostPosts) { this.ghostPosts.visible = true; this.ghostPosts.position.copy(g.position); this.ghostPosts.rotation.y = g.rotation.y; }
  }

  // set the aimed piece down; returns true when placed
  place() {
    const t = this.target;
    if (!t) return false;
    if (t.why) { this.hooks.message?.(t.why); this.hooks.sound?.('deny'); return false; }
    if (t.merge) this.unlink(t.merge);
    const p = this.spawn(t.type, t.x, t.y, t.z, t.yaw, t.posts);
    this.save();
    this.hooks.sound?.(`build:${PIECES[t.type].sound}`);
    this.hooks.rumble?.(0.25, 60);
    this.popping.push({ p, t: 0 });
    this.burst(p, false);
    this.snapKey = 'placed'; // no click for the spot just filled
    return true;
  }

  // take a piece back (a blow of the axe): returns [item id, how many]
  remove(p) {
    this.burst(p, true);
    this.hooks.sound?.(`unbuild:${PIECES[p.type].mat}`);
    this.hooks.rumble?.(0.35, 80);
    this.unlink(p);
    this.save();
    this.hooks.removed?.(p);
    return PIECES[p.type].refund || [p.type, 1];
  }
  unlink(p) {
    this.batches[p.type].remove(p);
    this.drop(p);
    this.pieces.splice(this.pieces.indexOf(p), 1);
    this.popping = this.popping.filter((e) => e.p !== p);
  }

  // dust at the foot of a piece set down, chips and dust when it is knocked apart
  burst(p, apart) {
    const def = PIECES[p.type], stone = def.mat === 'stone', thatch = def.mat === 'thatch';
    const DUST = stone ? [0.72, 0.71, 0.74] : thatch ? [0.86, 0.76, 0.5] : [0.86, 0.74, 0.56];
    const CHIP = stone ? [[0.6, 0.59, 0.64], [0.81, 0.8, 0.83]] : thatch ? [[0.82, 0.69, 0.39], [0.91, 0.82, 0.53]] : [[0.66, 0.46, 0.25], [0.82, 0.64, 0.4]];
    const box = p.check[0], n = apart ? 26 : 16;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random();
      const lx = Math.cos(a) * box.hx * rr, lz = Math.sin(a) * box.hz * rr;
      const at = new THREE.Vector3(box.x + lx * box.ux + lz * box.vx, apart ? box.y0 + Math.random() * (box.y1 - box.y0) : box.y0 + 0.05, box.z + lx * box.uz + lz * box.vz);
      const out = new THREE.Vector3(at.x - box.x, 0, at.z - box.z).normalize().multiplyScalar(0.6 + Math.random() * 0.8);
      this.dust.emit(at, out.clone().setY(0.15 + Math.random() * 0.4), DUST, 0.7 + Math.random() * 0.7, 0.14 + Math.random() * 0.1, { alpha: 0.5, grow: 0.9 });
      if (apart || k % 2) this.chips.emit(at, out.multiplyScalar(1.5).setY(1 + Math.random() * 2), CHIP[k % 2], 0.6 + Math.random() * 0.5, 0.045, { alpha: 1, grow: 0, gravity: 9 });
    }
  }

  update(dt) {
    // a piece set down lands with a little drop and squash
    this.popping = this.popping.filter((e) => {
      e.t += dt;
      const k = Math.min(1, e.t / 0.28);
      const s = 1 + Math.sin(k * Math.PI) * 0.06 * (1 - k), lift = Math.max(0, 1 - e.t / 0.09) * 0.18;
      this.batches[e.p.type].set(e.p, this.matrix(e.p, s, lift));
      return k < 1;
    });
    this.dust.update(dt); this.chips.update(dt);
  }
}
const EMPTY = [];
