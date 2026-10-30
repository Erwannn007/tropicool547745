// Shared GLSL chunks + global uniforms. All colours are authored directly in
// display space (renderer output is left linear, textures use NoColorSpace).
// Sun, sky, fog and rain values are animated by the day cycle (daycycle.js).
import * as THREE from 'three';

export const sunDir = new THREE.Vector3(-0.45, 0.72, -0.53).normalize();
export const MAX_LIGHTS = 8;

export const globals = {
  uTime: { value: 0 },
  uSunDir: { value: sunDir.clone() },   // direction of the main light (sun by day, moon by night)
  uSunColor: { value: new THREE.Color(1.0, 0.97, 0.88) },
  uSkyAmb: { value: new THREE.Color(0.55, 0.68, 0.86) },
  uGroundAmb: { value: new THREE.Color(0.38, 0.42, 0.30) },
  uFogColor: { value: new THREE.Color('#b9e0ff') },
  uFogDensity: { value: 0.0042 },
  uCamPos: { value: new THREE.Vector3() },
  uWorldSize: { value: 512 },
  uWorldTex: { value: null },
  uWaterLevel: { value: 0 },
  uGust: { value: new THREE.Vector4(0, 0, -100, 0) }, // x, z, start time, strength: felled-tree shockwave
  uShade: { value: 1 },      // strength of the painted canopy shadows (weak at night / under rain)
  uRain: { value: 0 },       // 0..1 rain intensity
  uWet: { value: 0 },        // 0..1 how soaked the ground is
  uNight: { value: 0 },      // 0 day .. 1 deep night
  uGlintDir: { value: sunDir.clone() },          // what the lagoon reflects: the real sun, or the moon at night
  uGlintCol: { value: new THREE.Color(1, 0.97, 0.88) },
  // point lights (torches, camp fires): xyz + radius, rgb + unused
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
  uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
  uLightN: { value: 0 },
};

export const commonGLSL = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uWorldSize;
uniform sampler2D uWorldTex;
uniform float uWaterLevel;
uniform float uShade;
uniform float uRain;
uniform float uWet;
uniform float uNight;
uniform vec3 uGlintDir;
uniform vec3 uGlintCol;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform int uLightN;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
// World data: r = height, g = grass, b = baked shade, a = rock
vec4 worldData(vec2 xz) {
  vec2 uv = (xz + uWorldSize * 0.5) / uWorldSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(-14.0, 0.0, 0.0, 0.0);
  return texture2D(uWorldTex, uv);
}
vec3 applyFog(vec3 col, vec3 wpos) {
  float d = distance(wpos, uCamPos);
  float f = 1.0 - exp(-pow(d * uFogDensity, 1.6));
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
vec3 lightDiffuse(vec3 n, float wrap, float shadow) {
  float ndl = clamp((dot(n, uSunDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
  return amb * 0.62 + uSunColor * ndl * 0.78 * shadow;
}
// warm pools of light around torches and camp fires, in a few flat steps
vec3 pointLights(vec3 wpos, vec3 n) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightN) break;
    vec3 d = uLightPos[i].xyz - wpos;
    float l = length(d);
    float a = clamp(1.0 - l / uLightPos[i].w, 0.0, 1.0);
    float ndl = clamp(dot(n, d / max(l, 0.001)) * 0.55 + 0.45, 0.0, 1.0);
    acc += uLightCol[i].rgb * (a * a * ndl);
  }
  float m = max(acc.r, max(acc.g, acc.b));
  float q = floor(m * 5.0 + 0.35) / 5.0;
  return acc * (q / max(m, 0.0001));
}
vec3 lightAt(vec3 n, float wrap, float shadow, vec3 wpos) {
  return lightDiffuse(n, wrap, shadow) + pointLights(wpos, n);
}
// Varnished wood: what the surface mirrors (sky by bands, the horizon bright,
// a thatched roof overhead when roof > 0), rippled by the grain of the texture
// (tex), stronger at grazing angles, plus a hard banded sun glint.
vec3 varnish(vec3 col, vec3 tex, vec3 n, vec3 V, float shadow, float gloss, float roof) {
  vec3 R = reflect(-V, n);
  R.xz += (dot(tex, vec3(0.33)) - 0.4) * 1.1;
  R.y += (dot(tex, vec3(0.33)) - 0.4) * 0.5;
  float up = R.y;
  vec3 sky = up > 0.4 ? uSkyAmb * 1.3 : up > 0.14 ? mix(uSkyAmb, uFogColor, 0.6) * 1.2 : up > -0.06 ? uFogColor * 1.2 : uGroundAmb * 0.75;
  // under a roof: the bright opening all round, warm straw overhead
  if (up > 0.16) sky = mix(sky, (up > 0.5 ? vec3(0.62, 0.48, 0.3) : vec3(0.9, 0.93, 1.0)) * (uSkyAmb * 0.6 + 0.45), roof);
  float fres = 0.12 + roof * 0.16 + 0.7 * pow(1.0 - max(dot(n, V), 0.0), 2.5);
  fres = floor(fres * 4.0 + 0.5) / 4.0;
  col = mix(col, sky * (0.6 + 0.4 * shadow), fres * gloss);
  float sp = pow(max(dot(reflect(-uSunDir, n), V), 0.0), 36.0);
  return col + gloss * (step(0.55, sp) * 0.7 + step(0.2, sp) * 0.16) * uSunColor * shadow * (1.0 - roof * 0.85);
}
`;

export function makeMaterial({ uniforms = {}, vertex, fragment, ...rest }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals, ...uniforms },
    vertexShader: commonGLSL + vertex,
    fragmentShader: commonGLSL + fragment,
    ...rest,
  });
}

// Light reaching the first-person held items (multiplies their banded shading).
export const heldLight = { value: new THREE.Color(1, 1, 1) };
