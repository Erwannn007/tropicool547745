// Shared GLSL chunks + global uniforms. All colours are authored directly in
// display space (renderer output is left linear, textures use NoColorSpace).
import * as THREE from 'three';

export const sunDir = new THREE.Vector3(-0.45, 0.72, -0.53).normalize();

export const globals = {
  uTime: { value: 0 },
  uSunDir: { value: sunDir },
  uSunColor: { value: new THREE.Color(1.0, 0.97, 0.88) },
  uSkyAmb: { value: new THREE.Color(0.55, 0.68, 0.86) },
  uGroundAmb: { value: new THREE.Color(0.38, 0.42, 0.30) },
  uFogColor: { value: new THREE.Color('#b9e0ff') },
  uFogDensity: { value: 0.0042 },
  uCamPos: { value: new THREE.Vector3() },
  uWorldSize: { value: 512 },
  uWorldTex: { value: null },
  uWaterLevel: { value: 0 },
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
`;

export function makeMaterial({ uniforms = {}, vertex, fragment, ...rest }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals, ...uniforms },
    vertexShader: commonGLSL + vertex,
    fragmentShader: commonGLSL + fragment,
    ...rest,
  });
}
