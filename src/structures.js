// Wooden pier + thatched hut near the spawn point.
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';
import { mulberry32 } from './noise.js';

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

function simpleMaterial(map, { tint = 1, alphaTest = 0 } = {}) {
  return makeMaterial({
    side: alphaTest ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: { uMap: { value: map }, uK: { value: tint }, uAT: { value: alphaTest } },
    vertex: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragment: /* glsl */`
      uniform sampler2D uMap; uniform float uK, uAT;
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (uAT > 0.0 && t.a < uAT) discard;
        vec4 d = worldData(vWorld.xz);
        vec3 n = normalize(gl_FrontFacing ? vN : -vN);
        float shadow = 1.0 - d.b * 0.5 * step(n.y, 0.5);
        vec3 col = t.rgb * uK * lightDiffuse(n, 0.2, shadow);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

export function buildStructures(world, tex) {
  const group = new THREE.Group();
  const rnd = mulberry32(world.cfg.seed + 3);
  const { pier, hut } = world;
  const yaw = Math.atan2(pier.dx, pier.dz);
  const wood = new BoxBatch();
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
    wood.box(x, hy - 0.08, z, 6.4, 0.16, 0.46, hr, 1.6);
  }
  const hutPosts = [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9], [0, 0]];
  for (const [lx, lz] of hutPosts) {
    const [x, z] = local(lx, lz);
    const g = world.heightAt(x, z) - 0.4;
    const top = hy + 3.0;
    posts.box(x, (g + top) / 2, z, 0.42, top - g, 0.42, hr, 1.2);
    colliders.push({ x, z, r: 0.35 });
  }
  // benches (pale cushions) + low table
  const cushion = new BoxBatch();
  for (const side of [-1, 1]) {
    const [x, z] = local(side * 2.1, -0.4);
    wood.box(x, hy + 0.22, z, 0.9, 0.44, 3.2, hr, 1.2);
    cushion.box(x, hy + 0.52, z, 0.86, 0.16, 3.1, hr, 1);
    const [bx, bz] = local(side * 2.5, -0.4);
    cushion.box(bx, hy + 0.85, bz, 0.22, 0.6, 3.1, hr, 1);
  }
  const [tx, tz] = local(0, -0.8);
  wood.box(tx, hy + 0.35, tz, 1.6, 0.1, 1.6, hr, 1);
  wood.box(tx, hy + 0.15, tz, 0.3, 0.3, 0.3, hr, 1);

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

  const woodMat = simpleMaterial(tex.wood, { tint: 1.0 });
  const postMat = simpleMaterial(tex.wood, { tint: 0.85 });
  const cushionMat = simpleMaterial(tex.cushion, { tint: 1.0 });
  group.add(new THREE.Mesh(wood.geometry(), woodMat));
  group.add(new THREE.Mesh(posts.geometry(), postMat));
  group.add(new THREE.Mesh(cushion.geometry(), cushionMat));
  group.add(roofMesh, under);

  // walkable surfaces
  const surfaces = [
    { cx: pier.x0 + pier.dx * pier.length / 2, cz: pier.z0 + pier.dz * pier.length / 2, ax: pier.dx, az: pier.dz, hl: pier.length / 2, hw: pier.width / 2 + 0.05, y: pier.deck },
    { cx: hut.x, cz: hut.z, ax: Math.sin(hr), az: Math.cos(hr), hl: 3.0, hw: 3.2, y: hy },
  ];
  return { group, colliders, surfaces };
}
