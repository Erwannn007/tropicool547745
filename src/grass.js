// Dense instanced grass blades streamed around the camera. Every block shares
// one geometry; blocks snap to their own size so the pattern never "swims".
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';
import { mulberry32 } from './noise.js';

function bladeGeometry(blockSize, count, seed) {
  const g = new THREE.InstancedBufferGeometry();
  // 7-vertex tapered blade, x in [-0.5,0.5], y in [0,1]
  const v = [-0.5, 0, 0.5, 0, -0.42, 0.35, 0.42, 0.35, -0.28, 0.68, 0.28, 0.68, 0.0, 1.0];
  const pos = new Float32Array(7 * 3);
  for (let i = 0; i < 7; i++) { pos[i * 3] = v[i * 2]; pos[i * 3 + 1] = v[i * 2 + 1]; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  const rnd = mulberry32(seed);
  const off = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    off[i * 3] = rnd() * blockSize;
    off[i * 3 + 1] = rnd() * blockSize;
    off[i * 3 + 2] = rnd();
  }
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(blockSize / 2, 20, blockSize / 2), blockSize * 0.75 + 26);
  return g;
}

function grassMaterial(innerR, outerR, widthMul) {
  return makeMaterial({
    side: THREE.DoubleSide,
    uniforms: { uInner: { value: innerR }, uOuter: { value: outerR }, uWidth: { value: widthMul } },
    vertex: /* glsl */`
      attribute vec3 aOffset;
      uniform float uInner, uOuter, uWidth;
      uniform vec4 uGust;
      varying vec3 vCol;
      varying vec3 vWorld;
      varying float vY;
      void main() {
        vec3 root = (modelMatrix * vec4(aOffset.x, 0.0, aOffset.y, 1.0)).xyz;
        vec2 cell = floor(root.xz * 8.0);
        float r1 = hash12(cell + aOffset.z * 17.0);
        float r2 = hash12(cell.yx + 3.7);
        root.xz += (hash22(cell) - 0.5) * 0.25;
        vec4 d = worldData(root.xz);
        float dist = distance(root.xz, uCamPos.xz);

        // distance thinning (dithered per blade, crossfades the two rings)
        float keep = 1.0;
        if (uInner > 0.0) keep *= step(r1, smoothstep(uInner - 6.0, uInner, dist));
        keep *= step(r1, 1.0 - smoothstep(uOuter - 10.0, uOuter, dist));
        float patchN = vnoise(root.xz * 0.15);
        keep *= step(0.32 + r2 * 0.4, d.g);
        if (keep < 0.5 || d.r < uWaterLevel + 0.15) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

        float height = (0.28 + r1 * 0.32 + patchN * 0.28) * smoothstep(0.3, 0.9, d.g);
        height *= 1.0 + smoothstep(uOuter * 0.5, uOuter, dist) * 0.6; // far blades a bit bigger
        float width = (0.06 + r2 * 0.045) * uWidth * (1.0 + dist * 0.012);
        float ang = r2 * 6.2831;
        vec2 dir = vec2(cos(ang), sin(ang));
        float y = position.y;
        vec3 p = root;
        p.xz += dir * position.x * width;
        p.y = d.r + y * height;
        // natural lean + wind gusts
        vec2 lean = (hash22(cell + 9.1) - 0.5) * 0.35;
        float gust = sin(uTime * 1.6 + root.x * 0.25 + root.z * 0.18) * 0.5 + sin(uTime * 2.7 + root.x * 0.7) * 0.2;
        p.xz += (lean + vec2(0.7, 0.45) * gust * 0.32) * y * y * height;
        // blast of air rolling out from a felled tree hitting the ground
        float ga = uTime - uGust.z;
        if (ga > 0.0 && ga < 1.8) {
          vec2 gd = root.xz - uGust.xy;
          float gr = length(gd);
          float k = (1.0 - smoothstep(0.0, 2.5, abs(gr - ga * 10.0))) * uGust.w * (1.0 - ga / 1.8) * (1.0 - smoothstep(5.0, 18.0, gr));
          p.xz += gd / max(gr, 0.1) * k * y * y * height * 1.4;
          p.y -= k * y * height * 0.35;
        }
        vY = y;
        vWorld = p;

        // colour: dark base -> lime -> bright tips, with patchy hue shift
        vec3 baseC = vec3(0.13, 0.42, 0.08);
        vec3 midC = mix(vec3(0.30, 0.70, 0.13), vec3(0.42, 0.78, 0.16), patchN);
        vec3 tipC = mix(vec3(0.60, 0.92, 0.26), vec3(0.74, 0.97, 0.36), r1);
        vec3 c = y < 0.5 ? mix(baseC, midC, y * 2.0) : mix(midC, tipC, (y - 0.5) * 2.0);
        c *= 0.9 + r2 * 0.2;
        float shadow = 1.0 - d.b * 0.6 * step(0.2, d.b);
        vec3 n = normalize(vec3(dir.y * 0.3, 1.0, -dir.x * 0.3));
        c *= lightDiffuse(n, 0.5, shadow) * 1.05;
        vCol = c;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragment: /* glsl */`
      varying vec3 vCol;
      varying vec3 vWorld;
      varying float vY;
      void main() {
        // pixel-art speckle so close blades read as textured, not flat
        float sp = hash12(floor(vWorld.xz * 20.0) + floor(vWorld.y * 20.0) * 7.0);
        vec3 c = vCol * (0.9 + sp * 0.18);
        gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
      }`,
  });
}

export class Grass {
  constructor(scene, quality) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const q = { low: 0.4, medium: 0.7, high: 1.0 }[quality] ?? 0.7;
    this.layers = [
      this.makeLayer(5, 7, Math.round(1400 * q), 0, 17, 1.0, 11),
      this.makeLayer(10, 9, Math.round(780 * q), 17, 44, 1.6, 23),
    ];
  }

  makeLayer(block, grid, perBlock, inner, outer, width, seed) {
    const geo = bladeGeometry(block, perBlock, seed);
    const mat = grassMaterial(inner, outer, width);
    const meshes = [];
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.userData.ij = [i - Math.floor(grid / 2), j - Math.floor(grid / 2)];
      this.group.add(m);
      meshes.push(m);
    }
    return { block, grid, meshes, inner, outer };
  }

  update(cam) {
    for (const L of this.layers) {
      const ox = Math.floor(cam.position.x / L.block) * L.block;
      const oz = Math.floor(cam.position.z / L.block) * L.block;
      for (const m of L.meshes) {
        const [i, j] = m.userData.ij;
        m.position.set(ox + i * L.block, 0, oz + j * L.block);
        // skip blocks completely inside the inner ring
        const cx = m.position.x + L.block / 2 - cam.position.x, cz = m.position.z + L.block / 2 - cam.position.z;
        const dd = Math.hypot(cx, cz);
        m.visible = dd < L.outer + L.block && (L.inner === 0 || dd > L.inner - 6 - L.block);
        m.updateMatrix();
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const L of this.layers) { L.meshes[0].geometry.dispose(); L.meshes[0].material.dispose(); }
  }
}
