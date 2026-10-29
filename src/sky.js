// Gradient sky dome (animated by the day cycle: sunrise glow, pixel sun and
// moon, stars at night, grey rain sky) + billboarded pixel-art cumulus clouds.
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';
import { mulberry32 } from './noise.js';

export const skyU = {
  uZenith: { value: new THREE.Color(0.08, 0.33, 0.86) },
  uMid: { value: new THREE.Color(0.20, 0.53, 0.97) },
  uHorizon: { value: new THREE.Color(0.70, 0.88, 1.0) },
  uSunPos: { value: new THREE.Vector3(-0.45, 0.72, -0.53).normalize() },
  uMoonPos: { value: new THREE.Vector3(0.45, -0.72, 0.53).normalize() },
  uSunTint: { value: new THREE.Color(1.0, 0.95, 0.8) },
  uGlow: { value: new THREE.Color(1.0, 0.6, 0.35) },  // sunrise / sunset band around the sun
  uGlowK: { value: 0 },
  uCloudCol: { value: new THREE.Color(1, 1, 1) },
  uCloudShade: { value: new THREE.Color(1, 1, 1) },
  uOvercast: { value: 0 },
};

export function buildSky(cloudTex, seed = 1) {
  const group = new THREE.Group();

  const domeGeo = new THREE.SphereGeometry(1800, 32, 16);
  const dome = new THREE.Mesh(domeGeo, makeMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyU,
    vertex: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragment: /* glsl */`
      uniform vec3 uZenith, uMid, uHorizon, uSunPos, uMoonPos, uSunTint, uGlow;
      uniform float uGlowK, uOvercast;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        // sunrise / sunset: warm band hugging the horizon on the sun's side
        float sunSide = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunPos.x, 0.0, uSunPos.z) + 1e-4)), 0.0);
        vec3 hor = mix(uHorizon, uGlow, uGlowK * pow(sunSide, 2.0) * 0.85);
        vec3 col = mix(hor, uMid, smoothstep(0.0, 0.22 + uGlowK * pow(sunSide, 3.0) * 0.18, y));
        col = mix(col, uZenith, smoothstep(0.22, 0.85, y));
        // stepped bands (pixel-art gradient), 24 levels
        col = floor(col * 24.0 + hash12(floor(d.xz * 260.0)) * 0.6) / 24.0;
        col = mix(col, uFogColor, 1.0 - smoothstep(-0.05, 0.03, y));

        float clear = 1.0 - uOvercast;
        // stars: a fixed grid on the dome, twinkling, only on clear nights
        if (uNight > 0.02 && y > 0.0) {
          vec2 sp = vec2(atan(d.z, d.x) * 120.0, y * 190.0);
          vec2 cell = floor(sp);
          float h = hash12(cell);
          float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
          float star = step(0.985, h) * step(length(fract(sp) - 0.5), 0.32);
          col += vec3(0.9, 0.95, 1.0) * star * tw * smoothstep(0.45, 0.9, uNight) * clear * smoothstep(0.0, 0.25, y) * (0.5 + 0.5 * step(0.996, h));
        }
        // sun: hard pixel disc with two stepped halo rings
        float s = dot(d, uSunPos);
        float sunUp = smoothstep(-0.08, 0.02, uSunPos.y) * clear;
        col = mix(col, uSunTint * 1.6, step(0.9994, s) * sunUp);
        col += uSunTint * (step(0.9965, s) * 0.18 + step(0.988, s) * 0.08) * sunUp;
        col += uSunTint * pow(max(s, 0.0), 10.0) * 0.16 * sunUp;
        // moon: pale disc with darker seas
        float m = dot(d, uMoonPos);
        float moonUp = smoothstep(-0.05, 0.05, uMoonPos.y) * clear;
        if (m > 0.9991) {
          vec3 mt = normalize(cross(uMoonPos, vec3(0.0, 1.0, 0.0)));
          vec3 mb = cross(mt, uMoonPos);
          vec2 q = floor(vec2(dot(d, mt), dot(d, mb)) * 900.0);
          float sea = step(0.62, vnoise(q * 0.35));
          col = mix(col, mix(vec3(0.93, 0.95, 1.0), vec3(0.72, 0.76, 0.88), sea), moonUp);
        }
        col += vec3(0.6, 0.7, 1.0) * step(0.997, m) * 0.06 * moonUp * uNight;
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
    uniforms: { uMap: { value: cloudTex }, ...skyU },
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
      uniform vec3 uCloudCol, uCloudShade;
      uniform float uOvercast;
      varying vec2 vUv;
      varying float vH;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        if (c.a < 0.5) discard;
        // lit tops take the light colour, shaded undersides the sky / sunset colour
        float l = clamp((c.r - 0.6) / 0.4, 0.0, 1.0);
        vec3 col = c.rgb * mix(uCloudShade, uCloudCol, l);
        col = mix(col, vec3(dot(col, vec3(0.33))) * 0.8, uOvercast * 0.6);
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
