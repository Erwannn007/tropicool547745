// Chunked terrain mesh with per-pixel grass / sand / rock pixel-art shading.
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';

export function buildTerrain(world, tex, quality) {
  const group = new THREE.Group();
  const seg = quality === 'high' ? 1 : quality === 'medium' ? 1.6 : 2;
  const chunkMeters = 32;
  const n = Math.round(chunkMeters / seg);
  const half = world.size / 2;

  const material = makeMaterial({
    uniforms: { uGrass: { value: tex.grass }, uSand: { value: tex.sand }, uRock: { value: tex.rock } },
    vertex: /* glsl */`
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormal = normal;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragment: /* glsl */`
      uniform sampler2D uGrass, uSand, uRock;
      varying vec3 vWorld;
      varying vec3 vNormal;
      const float TEXELS = 16.0; // pixel-art texel density per metre
      void main() {
        vec2 xz = vWorld.xz;
        vec2 px = floor(xz * TEXELS);
        vec2 pc = (px + 0.5) / TEXELS; // snap lookups to the pixel grid
        vec4 d = worldData(pc);
        float dith = hash12(px) - 0.5;
        float macro = vnoise(pc * 0.12) * 0.6 + vnoise(pc * 0.5) * 0.4;

        vec3 grass = texture2D(uGrass, xz / 8.0).rgb;
        grass *= mix(vec3(0.86, 0.9, 0.8), vec3(1.08, 1.06, 0.95), macro);
        vec3 sand = texture2D(uSand, xz / 8.0).rgb;
        vec3 rockc = texture2D(uRock, vec2(xz.x + vWorld.y * 0.6, xz.y - vWorld.y * 0.6) / 4.0).rgb;

        float h = vWorld.y;
        // wet sand band near the waterline
        float wet = 1.0 - smoothstep(0.05, 0.55, h - uWaterLevel + dith * 0.12);
        sand = mix(sand, sand * vec3(0.78, 0.74, 0.66), wet);
        // underwater sand: lighter, bluish, with caustics
        if (h < uWaterLevel) {
          float depth = uWaterLevel - h;
          vec2 cp = pc * 1.6;
          float c1 = vnoise(cp + vec2(uTime * 0.35, uTime * 0.2));
          float c2 = vnoise(cp * 1.3 - vec2(uTime * 0.25, -uTime * 0.3) + 7.0);
          float caust = 1.0 - abs(c1 - c2) * 4.0;
          caust = smoothstep(0.55, 0.95, caust) * (1.0 - smoothstep(0.0, 5.0, depth));
          sand = mix(sand, vec3(0.62, 0.86, 0.82), smoothstep(0.0, 3.0, depth) * 0.45);
          sand += caust * 0.28;
        }

        vec3 col = sand;
        float gsel = step(0.5 + dith * 0.45, d.g);
        col = mix(col, grass, gsel);
        float rsel = step(0.5 + dith * 0.4, d.a);
        col = mix(col, rockc, rsel);

        vec3 n = normalize(vNormal);
        float shadow = 1.0 - d.b * 0.62 * step(0.18 + dith * 0.3, d.b);
        col *= lightDiffuse(n, 0.25, shadow) * 1.04;
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });

  for (let cz = -half; cz < half; cz += chunkMeters) {
    for (let cx = -half; cx < half; cx += chunkMeters) {
      let maxH = -1e9;
      for (let z = 0; z <= chunkMeters; z += 4) for (let x = 0; x <= chunkMeters; x += 4)
        maxH = Math.max(maxH, world.heightAt(cx + x, cz + z));
      if (maxH < -7.5) continue; // deep ocean: water is opaque there
      const geo = new THREE.BufferGeometry();
      const verts = (n + 1) * (n + 1);
      const pos = new Float32Array(verts * 3);
      const nor = new Float32Array(verts * 3);
      const nv = new THREE.Vector3();
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const x = cx + (i / n) * chunkMeters, z = cz + (j / n) * chunkMeters;
        const k = (j * (n + 1) + i) * 3;
        pos[k] = x; pos[k + 1] = world.heightAt(x, z); pos[k + 2] = z;
        world.normalAt(x, z, nv);
        nor[k] = nv.x; nor[k + 1] = nv.y; nor[k + 2] = nv.z;
      }
      const idx = new (verts > 65535 ? Uint32Array : Uint16Array)(n * n * 6);
      let q = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b;
        idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  group.userData.material = material;
  return group;
}
