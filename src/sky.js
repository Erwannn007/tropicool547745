// Deep blue gradient sky dome + billboarded pixel-art cumulus clouds.
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';
import { mulberry32 } from './noise.js';

export function buildSky(cloudTex, seed = 1) {
  const group = new THREE.Group();

  const domeGeo = new THREE.SphereGeometry(1800, 32, 16);
  const dome = new THREE.Mesh(domeGeo, makeMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertex: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragment: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 zenith = vec3(0.08, 0.33, 0.86);
        vec3 mid = vec3(0.20, 0.53, 0.97);
        vec3 horizon = vec3(0.70, 0.88, 1.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, y));
        col = mix(col, zenith, smoothstep(0.22, 0.85, y));
        col = mix(col, uFogColor, 1.0 - smoothstep(-0.05, 0.03, y));
        float s = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.95, 0.8) * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // clouds: one merged geometry, billboarded in the vertex shader
  const rnd = mulberry32(seed * 13 + 5);
  const count = 46;
  const pos = [], corner = [], uvs = [], size = [], idx = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const ring = i < 34;
    const dist = ring ? 700 + rnd() * 450 : 250 + rnd() * 350;
    const elev = ring ? 25 + rnd() * 110 : 260 + rnd() * 140;
    const w = ring ? 240 + rnd() * 260 : 150 + rnd() * 160;
    const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
    const cell = Math.floor(rnd() * 4), u0 = (cell % 2) * 0.5, v0 = Math.floor(cell / 2) * 0.5;
    const flip = rnd() < 0.5;
    const base = i * 4;
    const cs = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];
    for (let k = 0; k < 4; k++) {
      pos.push(cx, elev, cz);
      corner.push(cs[k][0], cs[k][1]);
      const uu = flip ? 0.5 - (cs[k][0] + 0.5) * 0.5 : (cs[k][0] + 0.5) * 0.5;
      // texture rows are top-down: v = 1 at top of the canvas
      uvs.push(u0 + uu, 1 - (v0 + 0.5 - cs[k][1] * 0.5 * 0.8 - 0.1));
      size.push(w, w * 0.8);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('csize', new THREE.Float32BufferAttribute(size, 2));
  g.setIndex(idx);
  const clouds = new THREE.Mesh(g, makeMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uMap: { value: cloudTex } },
    vertex: /* glsl */`
      attribute vec2 corner;
      attribute vec2 csize;
      varying vec2 vUv;
      varying float vH;
      void main() {
        vUv = uv;
        vec3 c = position;
        float ang = uTime * 0.004;
        c.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c.xz;
        vec3 center = c + vec3(cameraPosition.x, 0.0, cameraPosition.z);
        vec3 toCam = normalize(vec3(cameraPosition.x - center.x, 0.0, cameraPosition.z - center.z));
        vec3 right = vec3(toCam.z, 0.0, -toCam.x);
        vec3 wp = center + right * corner.x * csize.x + vec3(0.0, 1.0, 0.0) * corner.y * csize.y;
        vH = wp.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragment: /* glsl */`
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying float vH;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        if (c.a < 0.5) discard;
        vec3 col = c.rgb;
        col = mix(col, uFogColor, 0.18 * (1.0 - smoothstep(20.0, 160.0, vH)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  clouds.renderOrder = -9;
  clouds.frustumCulled = false;
  group.add(clouds);

  group.userData.update = (cam) => { dome.position.copy(cam.position); };
  return group;
}
