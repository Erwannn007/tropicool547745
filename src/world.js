// Procedural archipelago: heightfield, surface masks, props placement.
import * as THREE from 'three';
import { makeSimplex, mulberry32, clamp, lerp, smoothstep } from './noise.js';
import { sunDir } from './shaders.js';
import { islandGeology } from './geology.js';
import { planSites } from './sites.js';

export const WORLD_SIZE = 512;
export const MAP_N = 512; // 1 texel per metre

export const DEFAULT_CONFIG = {
  seed: 4242,
  islands: 5,
  size: 1.0,
  relief: 0.4,
  vegetation: 0.75,
  stones: 0.5,
};

// A seed can be any text: digits keep their numeric value (old worlds stay the
// same), anything else is hashed (FNV-1a) to a stable number.
export function seedNumber(seed) {
  const t = String(seed ?? '').trim();
  if (/^\d{1,9}$/.test(t)) return Math.max(1, +t);
  let h = 0x811c9dc5;
  for (const ch of t.toLowerCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 1 + (h % 2000000000);
}

export function generateWorld(cfg, felled = new Set()) {
  cfg = { ...cfg, label: String(cfg.seed), seed: seedNumber(cfg.seed) };
  let api = null; // what is returned (restingY reads its heightAt, swapped for the drawn ground later)
  const N = MAP_N, S = WORLD_SIZE, half = S / 2, cell = S / N;
  const rnd = mulberry32(cfg.seed);
  const sx = makeSimplex(cfg.seed);
  const sx2 = makeSimplex(cfg.seed + 77);

  // ---- island layout -------------------------------------------------
  const islands = [];
  const mainR = 62 * cfg.size;
  islands.push({ x: (rnd() - 0.5) * 30, z: (rnd() - 0.5) * 30, r: mainR, h: 1 });
  let tries = 0;
  while (islands.length < cfg.islands && tries < 4000) {
    tries++;
    const shrink = 1 - Math.min(0.6, tries / 5000);
    const r = (18 + rnd() * 34) * cfg.size * shrink;
    const a = rnd() * Math.PI * 2, d = 40 + rnd() * (half - 60 - r);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) + r * 1.2 > half - 10 || Math.abs(z) + r * 1.2 > half - 10) continue;
    let ok = true;
    for (const o of islands) {
      if (Math.hypot(o.x - x, o.z - z) < (o.r + r) * 1.08) { ok = false; break; }
    }
    if (ok) islands.push({ x, z, r, h: 0.55 + rnd() * 0.6 });
  }

  // ---- heightfield ----------------------------------------------------
  const heights = new Float32Array(N * N);
  // wild islands (Discover) have soft relief: mountains, never blades. Rounded
  // crests, then one blur pass, so the terrain mesh (a vertex every 1.6 m on
  // phones) stays close to the ground things stand on
  const relief = cfg.wild ? Math.min(cfg.relief, 0.6) : cfg.relief;
  const soft = cfg.wild ? 0.22 : 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell;
      const wx = x + sx.fbm(x * 0.008, z * 0.008, 3) * 26;
      const wz = z + sx.fbm(x * 0.008 + 31, z * 0.008 - 17, 3) * 26;
      let e = -1, hs = 0;
      for (const isl of islands) {
        const d = Math.hypot(wx - isl.x, wz - isl.z) / isl.r;
        const ei = 1 - d;
        if (ei > e) { e = ei; hs = isl.h; }
      }
      e += sx.fbm(x * 0.03, z * 0.03, 3) * 0.06;
      let h;
      if (e < 0) {
        const t = -e;
        h = -0.35 - 2.1 * smoothstep(0, 0.16, t) - 13 * smoothstep(0.12, 0.65, t);
        h += sx2.fbm(x * 0.05, z * 0.05, 2) * 0.35 * (1 - smoothstep(0.2, 0.5, t));
      } else {
        const beach = 0.13;
        if (e < beach) {
          h = -0.35 + smoothstep(0, beach, e) * 1.5;
        } else {
          const t = e - beach;
          const hills = (sx.ridged(x * 0.011, z * 0.011, 4, soft) * 0.75 + (sx2.fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5) * 0.35);
          const k = smoothstep(0, 0.45, t);
          h = 1.15 + t * 5 + hills * k * (4 + relief * 38) * hs;
          h += sx2.fbm(x * 0.07, z * 0.07, 2) * 0.35 * k;
        }
      }
      heights[j * N + i] = h;
    }
  }

  if (soft) {
    const src = heights.slice();
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      let s = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += src[(j + b) * N + i + a] * (a || b ? (a && b ? 1 : 2) : 4);
      heights[j * N + i] = s / 16;
    }
  }
  const H = (i, j) => heights[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
  function heightAt(x, z) {
    const fx = (x + half) / cell - 0.5, fz = (z + half) / cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    if (i < -1 || j < -1 || i > N || j > N) return -14;
    return lerp(lerp(H(i, j), H(i + 1, j), u), lerp(H(i, j + 1), H(i + 1, j + 1), u), v);
  }
  function normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  }

  // ---- masks ---------------------------------------------------------
  const grass = new Float32Array(N * N);
  const rock = new Float32Array(N * N);
  const shadeMap = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = H(i, j);
    const gx = (H(i + 1, j) - H(i - 1, j)) / (2 * cell), gz = (H(i, j + 1) - H(i, j - 1)) / (2 * cell);
    const slope = Math.sqrt(gx * gx + gz * gz);
    const x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell;
    const sandLine = 1.05 + sx2.fbm(x * 0.06, z * 0.06, 2) * 0.45;
    let g = smoothstep(sandLine - 0.15, sandLine + 0.25, h);
    const r = smoothstep(0.95, 1.4, slope + sx.fbm(x * 0.09, z * 0.09, 2) * 0.25);
    g *= 1 - r;
    grass[j * N + i] = g;
    rock[j * N + i] = h > 0.3 ? r : 0;
  }

  // ---- structures: pier + hut on the main island ----------------------
  const main = islands[0];
  let best = null;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2 + rnd() * 0.1;
    const dx = Math.cos(a), dz = Math.sin(a);
    let coast = null;
    for (let d = 5; d < main.r * 2; d += 0.5) {
      if (heightAt(main.x + dx * d, main.z + dz * d) < 0.15) { coast = d; break; }
    }
    if (coast == null) continue;
    const cx = main.x + dx * coast, cz = main.z + dz * coast;
    // prefer long gentle shelves with open sea
    let shelf = 0;
    for (let d = 0; d < 40; d += 2) {
      const hh = heightAt(cx + dx * d, cz + dz * d);
      if (hh < -0.4 && hh > -3.5) shelf++;
      if (hh > 0.2) shelf -= 3;
    }
    const inland = heightAt(cx - dx * 14, cz - dz * 14);
    const flat = Math.abs(inland - heightAt(cx - dx * 10, cz - dz * 10));
    const score = shelf - flat * 3 - Math.max(0, inland - 4);
    if (!best || score > best.score) best = { score, a, dx, dz, cx, cz };
  }
  // a wild island (Discover mode) has neither: nobody has been there yet
  const wild = !!cfg.wild;
  const pier = wild ? null : {
    x0: best.cx - best.dx * 3, z0: best.cz - best.dz * 3,
    dx: best.dx, dz: best.dz, length: 26, width: 2.6, deck: 1.35,
  };
  const hutX = best.cx - best.dx * 13, hutZ = best.cz - best.dz * 13;
  let hutFloor = -1e9;
  for (let a = 0; a < 8; a++) hutFloor = Math.max(hutFloor, heightAt(hutX + Math.cos(a) * 3.5, hutZ + Math.sin(a) * 3.5));
  const hut = wild ? null : { x: hutX, z: hutZ, floor: hutFloor + 0.45, rot: Math.atan2(best.dx, best.dz) };

  const exclusion = (x, z, pad) => {
    if (wild) return false;
    // pier capsule
    const px = x - pier.x0, pz = z - pier.z0;
    const along = clamp(px * pier.dx + pz * pier.dz, 0, pier.length);
    const ex = pier.x0 + pier.dx * along, ez = pier.z0 + pier.dz * along;
    if (Math.hypot(x - ex, z - ez) < 2.5 + pad) return true;
    if (Math.hypot(x - hut.x, z - hut.z) < 5.5 + pad) return true;
    // path between hut and pier
    const qx = x - hut.x, qz = z - hut.z;
    const t = clamp(qx * pier.dx + qz * pier.dz, 0, 13);
    if (Math.hypot(x - (hut.x + pier.dx * t), z - (hut.z + pier.dz * t)) < 1.5 + pad) return true;
    return false;
  };

  // ---- vegetation & rocks ---------------------------------------------
  const veg = cfg.vegetation;
  const props = { palms: [], trees: [], bushes: [], ferns: [], rocks: [], stones: [] };
  const occ = new Map();
  const occKey = (x, z) => `${Math.floor(x / 3)},${Math.floor(z / 3)}`;
  const step = 2;
  for (let z = -half + 4; z < half - 4; z += step) {
    for (let x = -half + 4; x < half - 4; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
      const h = heightAt(px, pz);
      if (h < -1.6) continue;
      const i = clamp(Math.floor((px + half) / cell), 0, N - 1), j = clamp(Math.floor((pz + half) / cell), 0, N - 1);
      const g = grass[j * N + i], rk = rock[j * N + i];
      const forest = smoothstep(-0.25, 0.45, sx.fbm(px * 0.018 + 100, pz * 0.018, 3));
      const r = rnd();
      const ex = exclusion(px, pz, 0);
      const key = occKey(px, pz);
      if (ex) continue;

      if (h > -1.5 && h < 0.4 && r < 0.012) { // coastal boulders
        props.rocks.push({ x: px, y: h - 0.3, z: pz, s: 0.5 + rnd() * 1.4, rot: rnd() * 6.28, v: Math.floor(rnd() * 3) });
        continue;
      }
      if (h < 0.35) continue;
      if (rk > 0.4 && r < 0.05) {
        props.rocks.push({ x: px, y: h - 0.4, z: pz, s: 0.8 + rnd() * 2.2, rot: rnd() * 6.28, v: Math.floor(rnd() * 3) });
        continue;
      }
      if (occ.has(key)) continue;
      const coastal = h < 3.2 ? 1 : 0.25;
      const pPalm = veg * (0.028 * coastal + 0.018 * forest) * (rk > 0.5 ? 0.1 : 1);
      if (r < pPalm) {
        occ.set(key, 1);
        props.palms.push({ x: px, y: h - 0.15, z: pz, s: 0.8 + rnd() * 0.45, rot: rnd() * 6.28, v: Math.floor(rnd() * 4) });
        continue;
      }
      if (g < 0.5) continue;
      const r2 = rnd();
      if (h > 2.0 && r2 < veg * 0.022 * forest) {
        occ.set(key, 1);
        props.trees.push({ x: px, y: h - 0.2, z: pz, s: 0.8 + rnd() * 0.6, rot: rnd() * 6.28, v: Math.floor(rnd() * 3) });
      } else if (r2 < veg * (0.03 + 0.07 * forest)) {
        props.bushes.push({ x: px, y: h - 0.25, z: pz, s: 0.6 + rnd() * 0.8, rot: rnd() * 6.28, v: Math.floor(rnd() * 3) });
      } else if (r2 < veg * (0.09 + 0.1 * forest)) {
        props.ferns.push({ x: px, y: h - 0.05, z: pz, s: 0.7 + rnd() * 0.6, rot: rnd() * 6.28, v: Math.floor(rnd() * 2) });
      }
    }
  }
  // a few palms framing the pier & hut, like the reference shot
  for (let k = 0; k < (wild ? 0 : 6); k++) {
    const side = k % 2 ? 1 : -1;
    const t = 2 + k * 2.2 + rnd();
    const px = hut.x + best.dx * t * 0.8 + -best.dz * side * (6 + rnd() * 3);
    const pz = hut.z + best.dz * t * 0.8 + best.dx * side * (6 + rnd() * 3);
    const h = heightAt(px, pz);
    if (h > 0.4) props.palms.push({ x: px, y: h - 0.15, z: pz, s: 0.95 + rnd() * 0.3, rot: rnd() * 6.28, v: k % 4 });
  }

  // ---- loose stones to mine with the pickaxe ---------------------------
  // own random stream, so adding them leaves the other props (and the keys of
  // felled trees in older saves) exactly where they were
  const srnd = mulberry32(cfg.seed + 5150);
  const stoneK = cfg.stones ?? DEFAULT_CONFIG.stones;
  for (let z = -half + 4; z < half - 4; z += 3) {
    for (let x = -half + 4; x < half - 4; x += 3) {
      const px = x + (srnd() - 0.5) * 2.7, pz = z + (srnd() - 0.5) * 2.7, r = srnd(), s = srnd(), v = srnd(), rot = srnd();
      const h = heightAt(px, pz);
      if (h < 0.55 || exclusion(px, pz, 0.8) || occ.has(occKey(px, pz))) continue;
      const i = clamp(Math.floor((px + half) / cell), 0, N - 1), j = clamp(Math.floor((pz + half) / cell), 0, N - 1);
      const patch = smoothstep(0.0, 0.6, sx2.fbm(px * 0.025 + 40, pz * 0.025 - 60, 2)); // stony patches
      if (r >= stoneK * (0.02 + 0.2 * patch + 0.1 * rock[j * N + i])) continue;
      occ.set(occKey(px, pz), 1);
      props.stones.push({ x: px, y: h - 0.06, z: pz, s: 0.3 + s * s * 0.95, rot: rot * 6.28, v: Math.floor(v * 3) }); // pebbles to big stones
    }
  }

  // ---- boulders are heaps of stones -----------------------------------
  // each big rock becomes a cluster of mineable stones of every size: a core,
  // a ring leaning on it, one or two sitting on top. Mining a stone lets the
  // ones resting on it settle (settleCluster). Own random stream too.
  const crnd = mulberry32(cfg.seed + 7331);
  const clusters = [];
  for (const r of props.rocks) {
    const list = [], g = (x, z) => heightAt(x, z) - 0.06;
    const coreS = Math.min(1.7, 0.6 + r.s * 0.4);
    const core = { x: r.x, y: g(r.x, r.z), z: r.z, s: coreS, rot: crnd() * 6.28, v: Math.floor(crnd() * 3) };
    list.push(core);
    const ring = 2 + Math.round(r.s * 1.6 + crnd());
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2 + crnd() * 0.8, ss = coreS * (0.35 + crnd() * 0.45);
      const d = (coreS + ss) * 0.42 * (0.85 + crnd() * 0.3);
      const x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d;
      list.push({ x, y: g(x, z), z, s: ss, rot: crnd() * 6.28, v: Math.floor(crnd() * 3) });
    }
    const tops = r.s > 1.2 ? 2 : 1;
    for (let k = 0; k < tops; k++) {
      const a = crnd() * 6.28, d = coreS * 0.2 * crnd(), ss = coreS * (0.35 + crnd() * 0.25);
      const x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d;
      list.push({ x, y: core.y + coreS * 0.42, z, s: ss, rot: crnd() * 6.28, v: Math.floor(crnd() * 3), up: true });
    }
    for (const p of list) { p.cluster = clusters.length; props.stones.push(p); }
    clusters.push(list);
  }
  props.rocks.length = 0;

  // ---- veins of ore (wild islands) ------------------------------------
  // which ores and how many veins: geology.js. A vein is a big ore stone with
  // smaller ones round it, on dry land, rather up on rocky ground. Appended
  // after every other stone and drawn from its own stream: the keys of the
  // stones before them never move.
  const ores = cfg.wild ? islandGeology(cfg, clamp(islands.reduce((a, i) => a + i.r * i.r, 0) / (62 * 62 * 1.4), 0.6, 1.5)) : {};
  const ornd = mulberry32(cfg.seed + 9091);
  for (const [mineral, veins] of Object.entries(ores)) {
    for (let k = 0; k < veins; k++) for (let t = 0; t < 80; t++) {
      const isl = islands[Math.floor(ornd() * islands.length)];
      const a = ornd() * Math.PI * 2, d = Math.sqrt(ornd()) * isl.r * 0.9;
      const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d, h = heightAt(x, z);
      if (h < 1.4 || occ.has(occKey(x, z))) continue;
      const i = clamp(Math.floor((x + half) / cell), 0, N - 1), j = clamp(Math.floor((z + half) / cell), 0, N - 1);
      const high = rock[j * N + i] * 0.7 + smoothstep(2, mineral === 'obsidian' ? 12 : 8, h); // ore likes high rocky ground
      if (ornd() > 0.25 + high) continue;
      const geode = mineral === 'amethyst', coreS = geode ? 0.95 + ornd() * 0.35 : 0.95 + ornd() * 0.45;
      const core = { x, y: heightAt(x, z) - 0.06, z, s: coreS, rot: ornd() * 6.28, v: geode ? 3 : Math.floor(ornd() * 3), mineral };
      const list = [core];
      const ring = 2 + Math.floor(ornd() * 3);
      for (let q = 0; q < ring; q++) {
        const b = (q / ring) * Math.PI * 2 + ornd() * 0.9, ss = coreS * (0.35 + ornd() * 0.3), dd = (coreS + ss) * 0.5 * (0.9 + ornd() * 0.4);
        const sx = x + Math.cos(b) * dd, sz = z + Math.sin(b) * dd;
        list.push({ x: sx, y: heightAt(sx, sz) - 0.06, z: sz, s: ss, rot: ornd() * 6.28, v: geode && ornd() < 0.5 ? 3 : Math.floor(ornd() * 3), mineral });
      }
      for (const p of list) { occ.set(occKey(p.x, p.z), 1); props.stones.push(p); }
      break;
    }
  }

  // ---- baked canopy shadows -------------------------------------------
  // shadows are painted along the light direction; the day cycle re-paints
  // them as the sun moves (elevation clamped so evening shadows stay sane)
  let sdx = 0, sdz = 0;
  const aimShadows = (dir) => { const y = Math.max(0.42, dir.y); sdx = -dir.x / y; sdz = -dir.z / y; };
  aimShadows(sunDir);
  const paint = (x, z, h, radius, strength) => {
    const cx = x + sdx * h, cz = z + sdz * h;
    const ri = Math.ceil(radius / cell) + 1;
    const ci = Math.floor((cx + half) / cell), cj = Math.floor((cz + half) / cell);
    for (let j = cj - ri; j <= cj + ri; j++) for (let i = ci - ri; i <= ci + ri; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const wx = -half + (i + 0.5) * cell, wz = -half + (j + 0.5) * cell;
      const d = Math.hypot(wx - cx, wz - cz) / radius;
      if (d > 1) continue;
      const gap = 0.75 + 0.25 * sx2.noise(wx * 0.6, wz * 0.6);
      const v = strength * gap * (1 - smoothstep(0.55, 1, d));
      shadeMap[j * N + i] = Math.max(shadeMap[j * N + i], v);
    }
  };
  // every prop gets a stable key so felled trees can be remembered per world
  for (const type of Object.keys(props)) props[type].forEach((p, i) => { p.type = type; p.key = `${type}:${i}`; p.gone = felled.has(p.key); });
  // places left by others on a wild island (sites.js): what grew or lay where
  // they stand is cleared away (not felled: nothing is recorded)
  const sites = cfg.wild ? planSites(cfg, islands, heightAt, normalAt, (x, z) => exclusion(x, z, 0) || Math.hypot(x - best.cx, z - best.cz) < 18) : []; // (never on the landing beach)
  for (const site of sites) for (const type of Object.keys(props)) for (const p of props[type]) {
    if (!p.gone && Math.hypot(p.x - site.x, p.z - site.z) < site.r + (type === 'palms' || type === 'trees' ? 1.2 : 0.4)) p.gone = p.cleared = true;
  }
  // stones whose support was mined in an earlier session lie lower
  for (let k = 0; k < clusters.length; k++) for (let pass = 0; pass < 3; pass++) for (const p of clusters[k]) { const y = restingY(p); if (y < p.y) p.y = y; }

  // where a stone of a heap would rest now: on the ground, or on the
  // remaining stones under it
  function restingY(p) {
    let y = (api ? api.heightAt : heightAt)(p.x, p.z) - 0.06; // (the drawn ground once the terrain is built)
    if (p.cluster == null) return y;
    for (const q of clusters[p.cluster]) {
      if (q === p || q.gone || q.y >= p.y - 0.05) continue;
      const reach = 0.55 * (q.s + p.s), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < reach) y = Math.max(y, q.y + 0.42 * q.s * (1 - (d / reach) ** 2));
    }
    return y;
  }
  const SHADOW = { palms: [7.5, 3.6, 0.75], trees: [4.5, 3.4, 0.85], bushes: [0.6, 1.3, 0.7], rocks: [0.7, 1.2, 0.7], stones: [0.3, 0.55, 0.6] };
  const shadowOf = (p) => { const [h, r, k] = SHADOW[p.type]; return [p.x, p.z, h * p.s, r * p.s, k]; };
  const hutShadow = wild ? null : [hut.x, hut.z, hut.floor - heightAt(hut.x, hut.z) + 3.2, 4.4, 0.85];
  const paintAll = (filter) => {
    for (const type of Object.keys(SHADOW)) for (const p of props[type]) if (!p.gone && (!filter || filter(shadowOf(p)))) paint(...shadowOf(p));
    if (hutShadow && (!filter || filter(hutShadow))) paint(...hutShadow);
  };
  paintAll();

  // ---- data texture (half float, linear-filterable in WebGL2) ---------
  const data = new Uint16Array(N * N * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < N * N; k++) {
    data[k * 4] = toHalf(heights[k]);
    data[k * 4 + 1] = toHalf(grass[k]);
    data[k * 4 + 2] = toHalf(shadeMap[k]);
    data[k * 4 + 3] = toHalf(rock[k]);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;

  let spawn;
  if (pier) {
    const deckEnd = { x: pier.x0 + pier.dx * (pier.length - 1.5), z: pier.z0 + pier.dz * (pier.length - 1.5) };
    spawn = { x: deckEnd.x, y: pier.deck, z: deckEnd.z, yaw: Math.atan2(pier.dx, pier.dz) };
  } else { // landed at the water's edge of the shelf, facing inland
    let d = -6;
    while (d < 20 && heightAt(best.cx - best.dx * d, best.cz - best.dz * d) < 0.06) d += 0.25;
    const x = best.cx - best.dx * (d + 0.6), z = best.cz - best.dz * (d + 0.6);
    spawn = { x, y: heightAt(x, z), z, yaw: Math.atan2(best.dx, best.dz) };
  }

  // remove a prop (tree felled): clear its shadow, repaint neighbours, re-upload
  function removeProp(p) {
    if (p.gone) return;
    p.gone = true;
    const [x, z, h, r] = shadowOf(p);
    const cx = x + sdx * h, cz = z + sdz * h;
    const ri = Math.ceil(r / cell) + 2;
    const ci = Math.floor((cx + half) / cell), cj = Math.floor((cz + half) / cell);
    const clip = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
    for (let j = cj - ri; j <= cj + ri; j++) for (let i = ci - ri; i <= ci + ri; i++) if (clip(i, j)) shadeMap[j * N + i] = 0;
    paintAll(([px, pz, ph, pr]) => Math.hypot(px + sdx * ph - cx, pz + sdz * ph - cz) < pr + r + 2);
    for (let j = cj - ri; j <= cj + ri; j++) for (let i = ci - ri; i <= ci + ri; i++) {
      if (clip(i, j)) data[(j * N + i) * 4 + 2] = toHalf(shadeMap[j * N + i]);
    }
    tex.needsUpdate = true;
  }

  // re-paint every canopy shadow for a new light direction
  function setShadowDir(dir) {
    aimShadows(dir);
    shadeMap.fill(0);
    paintAll();
    for (let k = 0; k < N * N; k++) data[k * 4 + 2] = toHalf(shadeMap[k]);
    tex.needsUpdate = true;
  }

  api = { cfg, sites, ores, islands, heights, grass, rock, N, size: S, heightAt, normalAt, props, pier, hut, spawn, texture: tex, removeProp, setShadowDir, clusters, restingY };
  return api;
}
