// Materials for the modelled objects (models.js): lit world version with
// banded sun light + torch light, banded held / icon version, translucent
// placement ghost, and the animated pixel flame shared by all of them.
import * as THREE from 'three';
import { makeMaterial, globals } from './shaders.js';
import { bandedMaterial } from './axeModel.js';

const flameMat = new THREE.ShaderMaterial({
  uniforms: { uTime: globals.uTime },
  vertexShader: /* glsl */`
    uniform float uTime; varying float vH; varying vec3 vL;
    void main() {
      vec3 p = position;
      vec4 o = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float ph = o.x * 3.1 + o.z * 1.7;
      float h = uv.y; // 0 at the base of each tongue of flame, 1 at its tip
      p.x += sin(uTime * 11.0 + p.y * 24.0 + ph) * 0.035 * h;
      p.z += cos(uTime * 9.0 + p.y * 20.0 + ph) * 0.03 * h;
      p.y += sin(uTime * 13.0 + ph + p.x * 30.0) * 0.03 * h;
      vH = h; vL = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform float uTime; varying float vH; varying vec3 vL;
    void main() {
      // flat bands: white-yellow heart, orange body, red tips, pixel flicker
      float n = fract(sin(dot(floor(vL.xz * 60.0) + floor(uTime * 12.0), vec2(12.9898, 78.233))) * 43758.5);
      float h = vH + (n - 0.5) * 0.22;
      vec3 c = h < 0.25 ? vec3(1.0, 0.96, 0.7) : h < 0.5 ? vec3(1.0, 0.78, 0.25) : h < 0.75 ? vec3(1.0, 0.5, 0.12) : vec3(0.9, 0.26, 0.08);
      gl_FragColor = vec4(c * 1.15, 1.0);
    }`,
});

const worldCache = new Map();
function worldMat(part) {
  const key = (part.tex?.uuid || '') + (part.vcol ? 'c' : '') + (part.double ? 'd' : '') + (part.glow || '') + (part.metal ? 'm' : '');
  if (worldCache.has(key)) return worldCache.get(key);
  const m = makeMaterial({
    side: part.double ? THREE.DoubleSide : THREE.FrontSide,
    defines: part.vcol ? { VCOL: 1 } : {},
    uniforms: { uMap: { value: part.tex }, uGlow: { value: part.glow || 0 }, uMetal: { value: part.metal || 0 } },
    vertex: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld; varying vec3 vCol;
      #ifdef VCOL
        attribute vec3 color;
      #endif
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vWorld = w.xyz;
        #ifdef VCOL
          vCol = color;
        #else
          vCol = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragment: /* glsl */`
      uniform sampler2D uMap; uniform float uGlow, uMetal;
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld; varying vec3 vCol;
      void main() {
        vec3 tex = texture2D(uMap, vUv).rgb * vCol;
        vec3 n = normalize(gl_FrontFacing ? vN : -vN);
        vec4 d = worldData(vWorld.xz);
        float shadow = 1.0 - d.b * 0.5 * uShade * (1.0 - smoothstep(0.5, 2.5, vWorld.y - d.r));
        // banded sun: 4 flat steps like the held items
        float ndl = clamp(dot(n, uSunDir) * 0.85 + 0.15, 0.0, 1.0);
        ndl = ndl > 0.66 ? 1.0 : ndl > 0.33 ? 0.68 : ndl > 0.08 ? 0.4 : 0.15;
        vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
        vec3 col = tex * (amb * 0.62 + uSunColor * ndl * 0.8 * shadow + pointLights(vWorld, n));
        vec3 V = normalize(uCamPos - vWorld);
        col += uMetal * step(0.75, pow(max(dot(reflect(-uSunDir, n), V), 0.0), 22.0)) * 0.4 * uSunColor;
        col += tex * uGlow * (0.8 + 0.2 * sin(uTime * 7.0 + vWorld.x * 9.0));
        col *= 1.0 - uWet * 0.12 * step(0.0, n.y);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
  worldCache.set(key, m);
  return m;
}

const heldCache = new Map();
function heldMat(part, light) {
  const key = (part.tex?.uuid || '') + (part.vcol ? 'c' : '') + (part.double ? 'd' : '') + (light ? 'i' : '');
  if (!heldCache.has(key)) heldCache.set(key, bandedMaterial(part.tex, { metal: part.metal || 0, vertexColors: !!part.vcol, side: part.double ? THREE.DoubleSide : THREE.FrontSide, ...(light ? { light } : {}) }));
  return heldCache.get(key);
}
// glowing coals keep their colour whatever the light
const glowHeld = new Map();
function glowMat(part) {
  if (!glowHeld.has(part.tex)) glowHeld.set(part.tex, new THREE.MeshBasicMaterial({ map: part.tex }));
  return glowHeld.get(part.tex);
}

export const ghostColor = { value: new THREE.Color(0.35, 0.7, 1.0) };
const ghostMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uCol: ghostColor, uTime: globals.uTime },
  vertexShader: 'varying vec3 vN; varying vec3 vW; void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */`
    uniform vec3 uCol; uniform float uTime; varying vec3 vN; varying vec3 vW;
    void main() {
      vec3 n = normalize(gl_FrontFacing ? vN : -vN);
      float l = dot(n, normalize(vec3(-0.45, 0.75, -0.5)));
      float band = l > 0.4 ? 1.0 : l > 0.0 ? 0.8 : 0.62;
      // scrolling pixel scanlines so the preview reads as a hologram, not a real object
      float scan = step(0.5, fract(vW.y * 16.0 - uTime * 1.5)) * 0.12;
      gl_FragColor = vec4(uCol * band + scan, 0.5 + scan);
    }`,
});

// kind: 'world' | 'held' | 'icon' | 'ghost'
export function dress(model, kind, light) {
  const g = new THREE.Group();
  for (const part of model.parts) {
    let mat;
    if (part.flame) mat = kind === 'ghost' ? ghostMat : flameMat;
    else if (kind === 'world') mat = worldMat(part);
    else if (kind === 'ghost') mat = ghostMat;
    else if (part.glow && kind !== 'icon') mat = glowMat(part);
    else mat = heldMat(part, kind === 'icon' ? light : null);
    const m = new THREE.Mesh(part.geo, mat);
    if (part.flame) m.userData.flame = true;
    if (part.hinge) { // parts sharing a hinge swing together (chest lid)
      let pivot = g.children.find((c) => c.userData.hinge === String(part.hinge));
      if (!pivot) { pivot = new THREE.Group(); pivot.userData.hinge = String(part.hinge); pivot.position.set(...part.hinge); g.add(pivot); }
      m.position.set(-part.hinge[0], -part.hinge[1], -part.hinge[2]);
      pivot.add(m);
    } else g.add(m);
  }
  return g;
}
