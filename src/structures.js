// Wooden pier + thatched hut near the spawn point.
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';
import { mulberry32 } from './noise.js';
import { merge } from './models.js';

// A soft cushion: a box with rounded edges and corners, its top a little
// puffed up in the middle.
function cushionGeo(w, h, d, r) {
  const g = new THREE.BoxGeometry(w, h, d, 5, 3, 5).toNonIndexed();
  const P = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
  const half = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    inner.copy(v).clamp(half.clone().negate(), half);
    const off = v.clone().sub(inner);
    if (off.lengthSq() > 1e-8) v.copy(inner).addScaledVector(off.normalize(), r);
    if (v.y > 0) v.y += (1 - Math.abs(v.x) / (w / 2)) * (1 - Math.abs(v.z) / (d / 2)) * h * 0.18;
    P.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

class BoxBatch {
  constructor() { this.p = []; this.n = []; this.uv = []; this.idx = []; }
  // centre (x,y,z), size (sx,sy,sz), yaw; UVs in metres / tile
  box(cx, cy, cz, sx, sy, sz, yaw, tile = 2, extraRot = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rx = new THREE.Matrix4().makeRotationX(extraRot);
    const faces = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0], sz, sy, sx],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0], sz, sy, sx],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1], sx, sz, sy],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1], sx, sz, sy],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0], sx, sy, sz],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0], sx, sy, sz],
    ];
    for (const [n, u, v, w, h, d] of faces) {
      const base = this.p.length / 3;
      for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const l = new THREE.Vector3(
          n[0] * d / 2 + u[0] * a * w / 2 + v[0] * bb * h / 2,
          n[1] * d / 2 + u[1] * a * w / 2 + v[1] * bb * h / 2,
          n[2] * d / 2 + u[2] * a * w / 2 + v[2] * bb * h / 2,
        ).applyMatrix4(rx);
        const nn = new THREE.Vector3(...n).applyMatrix4(rx);
        this.p.push(cx + l.x * c + l.z * s, cy + l.y, cz - l.x * s + l.z * c);
        this.n.push(nn.x * c + nn.z * s, nn.y, -nn.x * s + nn.z * c);
        this.uv.push((a * 0.5 + 0.5) * w / tile, (bb * 0.5 + 0.5) * h / tile);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// gloss: varnished, mirrors the sky (or the roof overhead when roof = 1);
// banded: light in flat steps (cushions)
function simpleMaterial(map, { tint = 1, alphaTest = 0, gloss = 0, roof = 0, banded = false } = {}) {
  return makeMaterial({
    side: alphaTest ? THREE.DoubleSide : THREE.FrontSide,
    defines: banded ? { BANDED: 1 } : {},
    uniforms: { uMap: { value: map }, uK: { value: tint }, uAT: { value: alphaTest }, uGloss: { value: gloss }, uRoof: { value: roof } },
    vertex: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragment: /* glsl */`
      uniform sampler2D uMap; uniform float uK, uAT, uGloss, uRoof;
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (uAT > 0.0 && t.a < uAT) discard;
        vec4 d = worldData(vWorld.xz);
        vec3 n = normalize(gl_FrontFacing ? vN : -vN);
        float shadow = 1.0 - d.b * 0.5 * uShade * step(n.y, 0.5);
        vec3 lit = lightAt(n, 0.2, shadow, vWorld);
        #ifdef BANDED
          float l = dot(lit, vec3(0.33));
          lit *= (l > 0.95 ? 1.12 : l > 0.7 ? 0.92 : l > 0.45 ? 0.74 : 0.6) / max(l, 0.05);
          lit = mix(lit, lit * vec3(0.86, 0.88, 1.08), step(l, 0.7)); // lavender in the shade
        #endif
        vec3 col = t.rgb * uK * lit;
        if (uGloss > 0.0) col = varnish(col, t.rgb, n, normalize(uCamPos - vWorld), shadow, uGloss, uRoof);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

export function buildStructures(world, tex) {
  const group = new THREE.Group();
  const rnd = mulberry32(world.cfg.seed + 3);
  const { pier, hut } = world;
  if (!pier) return { group, colliders: [], surfaces: [] }; // a wild island
  const yaw = Math.atan2(pier.dx, pier.dz);
  const wood = new BoxBatch();  // pier deck
  const floor = new BoxBatch(); // hut floor, sofa frames, table (varnished, under the roof)
  const posts = new BoxBatch();

  // pier deck: planks across the walkway
  const pw = 0.42;
  for (let d = 0; d < pier.length; d += pw + 0.04) {
    const x = pier.x0 + pier.dx * (d + pw / 2), z = pier.z0 + pier.dz * (d + pw / 2);
    wood.box(x, pier.deck - 0.06 + (rnd() - 0.5) * 0.03, z, pier.width + (rnd() - 0.5) * 0.2, 0.12, pw, yaw + (rnd() - 0.5) * 0.02, 1.6);
  }
  // stringers
  for (const side of [-1, 1]) {
    const ox = -pier.dz * side * (pier.width / 2 - 0.25), oz = pier.dx * side * (pier.width / 2 - 0.25);
    wood.box(pier.x0 + pier.dx * pier.length / 2 + ox, pier.deck - 0.24, pier.z0 + pier.dz * pier.length / 2 + oz, 0.18, 0.22, pier.length, yaw, 2);
  }
  const colliders = [];
  for (let d = 0.3; d <= pier.length; d += 3.2) {
    for (const side of [-1, 1]) {
      const x = pier.x0 + pier.dx * d - pier.dz * side * (pier.width / 2 + 0.1);
      const z = pier.z0 + pier.dz * d + pier.dx * side * (pier.width / 2 + 0.1);
      const g = Math.min(world.heightAt(x, z), -0.2) - 0.6;
      const top = pier.deck + 0.45 + rnd() * 0.15;
      posts.box(x, (g + top) / 2, z, 0.34, top - g, 0.34, yaw + rnd() * 0.3, 1.2);
      colliders.push({ x, z, r: 0.25 });
    }
  }

  // hut platform, posts, benches, table
  const hy = hut.floor, hr = hut.rot;
  const local = (lx, lz) => [hut.x + lx * Math.cos(hr) + lz * Math.sin(hr), hut.z - lx * Math.sin(hr) + lz * Math.cos(hr)];
  for (let k = -3; k < 3; k += 0.5) {
    const [x, z] = local(0, k + 0.25);
    floor.box(x, hy - 0.08, z, 6.4, 0.16, 0.46, hr, 1.6);
  }
  const hutPosts = [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9], [0, 0]];
  for (const [lx, lz] of hutPosts) {
    const [x, z] = local(lx, lz);
    const g = world.heightAt(x, z) - 0.4;
    const top = hy + 3.0;
    posts.box(x, (g + top) / 2, z, 0.42, top - g, 0.42, hr, 1.2);
    colliders.push({ x, z, r: 0.35 });
  }
  // two long sofas (pale soft cushions on a varnished frame) + low table
  const cushions = [];
  const at = (lx, ly, lz) => { const [x, z] = local(lx, lz); return new THREE.Matrix4().compose(new THREE.Vector3(x, hy + ly, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hr), new THREE.Vector3(1, 1, 1)); };
  for (const side of [-1, 1]) {
    const [x, z] = local(side * 2.15, -0.4);
    floor.box(x, hy + 0.17, z, 0.95, 0.34, 3.3, hr, 1.2);
    for (let k = -1; k <= 1; k++) {
      cushions.push([cushionGeo(0.8, 0.2, 1.0, 0.07), at(side * 2.1, 0.44, -0.4 + k * 1.03)]);               // seat
      const back = cushionGeo(0.2, 0.62, 1.0, 0.08);
      back.rotateZ(side * 0.12);
      cushions.push([back, at(side * 2.5, 0.82, -0.4 + k * 1.03)]);                                         // back
    }
    for (const end of [-1, 1]) cushions.push([cushionGeo(0.95, 0.5, 0.2, 0.08), at(side * 2.15, 0.6, -0.4 + end * 1.68)]); // arms
  }
  const [tx, tz] = local(0, -0.8);
  floor.box(tx, hy + 0.35, tz, 1.6, 0.1, 1.6, hr, 1);
  floor.box(tx, hy + 0.15, tz, 0.3, 0.3, 0.3, hr, 1);

  // roof: thatched pyramid with an overhang
  const roof = new THREE.ConeGeometry(4.9, 2.4, 4, 3, true);
  roof.rotateY(Math.PI / 4);
  const ruv = roof.attributes.uv;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 8, ruv.getY(i) * 2.5);
  const roofMesh = new THREE.Mesh(roof, simpleMaterial(tex.thatch, { tint: 1.05 }));
  roofMesh.position.set(hut.x, hy + 3.0 + 1.2, hut.z);
  roofMesh.rotation.y = hr;
  const under = new THREE.Mesh(roof.clone().scale(0.98, 0.98, 0.98), simpleMaterial(tex.thatch, { tint: 0.55 }));
  under.material.side = THREE.BackSide;
  under.position.copy(roofMesh.position).y -= 0.05;
  under.rotation.y = hr;

  const woodMat = simpleMaterial(tex.wood, { tint: 1.1, gloss: 0.3 });
  const floorMat = simpleMaterial(tex.wood, { tint: 1.15, gloss: 0.85, roof: 1 });
  const postMat = simpleMaterial(tex.wood, { tint: 0.95, gloss: 0.35 });
  const cushionMat = simpleMaterial(tex.cushion, { tint: 1.05, banded: true });
  group.add(new THREE.Mesh(wood.geometry(), woodMat));
  group.add(new THREE.Mesh(floor.geometry(), floorMat));
  group.add(new THREE.Mesh(posts.geometry(), postMat));
  group.add(new THREE.Mesh(merge(cushions), cushionMat));
  group.add(roofMesh, under);

  // walkable surfaces
  const surfaces = [
    { cx: pier.x0 + pier.dx * pier.length / 2, cz: pier.z0 + pier.dz * pier.length / 2, ax: pier.dx, az: pier.dz, hl: pier.length / 2, hw: pier.width / 2 + 0.05, y: pier.deck },
    { cx: hut.x, cz: hut.z, ax: Math.sin(hr), az: Math.cos(hr), hl: 3.0, hw: 3.2, y: hy },
  ];
  return { group, colliders, surfaces };
}
