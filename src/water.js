// Transparent turquoise lagoon water with pixel caustics, glints and shore foam,
// and the rings of ripples (splashes, wading: splash.js writes uRip).
import * as THREE from 'three';
import { makeMaterial } from './shaders.js';

export function buildWater() {
  const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const RIPPLES = 16;
  const material = makeMaterial({
    transparent: true,
    depthWrite: false,
    defines: { RIPPLES },
    uniforms: { uRip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) } },
    vertex: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragment: /* glsl */`
      varying vec3 vWorld;
      uniform vec4 uRip[RIPPLES];
      const float TEXELS = 12.0;
      float waveH(vec2 p) {
        return sin(p.x * 0.9 + uTime * 1.1) * 0.5 + sin(p.y * 1.3 - uTime * 0.9) * 0.4
             + sin((p.x + p.y) * 2.1 + uTime * 1.7) * 0.25 + (vnoise(p * 1.5 + uTime * 0.4) - 0.5) * 0.8;
      }
      void main() {
        float dist = distance(vWorld, uCamPos);
        // pixel grid snapping; fades out far away to avoid shimmering
        float texels = dist < 90.0 ? TEXELS : TEXELS * 0.5;
        vec2 px = floor(vWorld.xz * texels);
        vec2 p = (px + 0.5) / texels;
        float h = worldData(p).r;
        float depth = uWaterLevel - h;
        if (depth < -0.02) discard;

        vec3 shallow = vec3(0.56, 0.93, 0.86);
        vec3 lagoon  = vec3(0.16, 0.80, 0.82);
        vec3 deep    = vec3(0.08, 0.50, 0.78);
        vec3 abyss   = vec3(0.05, 0.30, 0.64);
        vec3 col = mix(shallow, lagoon, smoothstep(0.0, 1.6, depth));
        col = mix(col, deep, smoothstep(1.4, 5.0, depth));
        col = mix(col, abyss, smoothstep(6.0, 14.0, depth));
        float alpha = mix(0.32, 0.97, smoothstep(0.0, 4.5, depth));

        // wave normal for lighting
        float e = 0.15;
        float w0 = waveH(p);
        vec3 n = normalize(vec3(w0 - waveH(p + vec2(e, 0.0)), e * 6.0, w0 - waveH(p + vec2(0.0, e))));
        vec3 V = normalize(uCamPos - vWorld);
        float fres = pow(1.0 - clamp(dot(V, n), 0.0, 1.0), 4.0);
        vec3 sky = mix(vec3(0.70, 0.86, 1.0), vec3(0.25, 0.52, 0.95), clamp(reflect(-V, n).y * 2.0, 0.0, 1.0));
        col = mix(col, sky, fres * 0.7);
        alpha = max(alpha, fres * 0.85);

        // ripple highlight lines (pixel caustics on the surface)
        float c1 = vnoise(p * 1.2 + vec2(uTime * 0.3, uTime * 0.17));
        float c2 = vnoise(p * 1.5 - vec2(uTime * 0.21, -uTime * 0.27) + 11.0);
        float lines = smoothstep(0.86, 0.97, 1.0 - abs(c1 - c2) * 3.0);
        col += lines * 0.22 * (1.0 - smoothstep(25.0, 120.0, dist));

        // sky colour follows the time of day (sunset, night)
        col *= (uSkyAmb * 0.9 + uSunColor * 0.35) / vec3(0.845, 0.95, 1.08); // = 1 at noon

        // sun (or moon) glints: a glittering path that stretches when the light is low
        vec3 R = reflect(-V, n);
        float low = 1.0 - smoothstep(0.04, 0.5, uGlintDir.y);
        float spec = pow(max(dot(R, uGlintDir), 0.0), mix(160.0, 30.0, low));
        float sparkle = step(0.72 - low * 0.14, hash12(px + floor(uTime * 6.0))) * spec;
        col += (spec * (0.6 + low * 0.6) + sparkle * (2.0 + low * 1.5)) * uGlintCol;
        alpha = min(1.0, alpha + spec * 0.6);

        // rain: expanding pixel rings, one drop per cell at random times
        if (uRain > 0.01 && dist < 45.0) {
          vec2 rc = floor(p * 1.4);
          for (int k = 0; k < 2; k++) {
            vec2 cell = rc + vec2(float(k) * 17.0, 0.0);
            vec2 h = hash22(cell);
            float t = fract(uTime * (0.7 + h.y * 0.6) + h.x);
            vec2 c = (rc + 0.2 + h * 0.6) / 1.4;
            float r = length(p - c);
            float ring = step(abs(r - t * 0.42), 0.035) * (1.0 - t) * step(h.x, uRain);
            col += vec3(0.85, 0.95, 1.0) * ring * 0.45;
          }
          col = mix(col, col * vec3(0.8, 0.86, 0.9), uRain * 0.3);
        }

        // ripples: pixel rings spreading and fading, white churn where it went in
        if (dist < 70.0) for (int i = 0; i < RIPPLES; i++) {
          vec4 r = uRip[i];
          float age = uTime - r.z;
          if (age < 0.0 || age > 2.4 || r.w <= 0.0) continue;
          float d = length(p - r.xy);
          float R1 = age * (0.75 + r.w * 0.45);
          float fade = (1.0 - age / 2.4) * min(1.0, r.w * 1.3);
          float ring = step(abs(d - R1), 0.08 + r.w * 0.04) + 0.7 * step(abs(d - R1 * 0.62), 0.07) * step(0.3, age);
          float trough = step(abs(d - R1 + 0.2 + r.w * 0.04), 0.08) * fade; // darker water just inside the crest
          float churn = step(d, 0.14 + 0.24 * r.w) * (1.0 - smoothstep(0.0, 0.5, age)) * step(0.35, hash12(px + floor(uTime * 10.0)));
          float k = clamp(ring * min(1.0, fade * 1.4) + churn, 0.0, 1.0);
          col = mix(col, col * vec3(0.45, 0.68, 0.78), trough * (1.0 - k));
          col = mix(col, vec3(0.95, 1.0, 1.0), k);
          alpha = max(alpha, max(k, trough * 0.6) * 0.92);
        }

        // shore foam
        float foamLine = 0.12 + 0.1 * sin(uTime * 1.3 + p.x * 0.35 + p.y * 0.25) + (hash12(px) - 0.5) * 0.08;
        float foam = step(depth, foamLine) + step(abs(depth - foamLine - 0.28), 0.035) * step(0.5, vnoise(p * 3.0 + uTime));
        col = mix(col, vec3(0.97, 1.0, 1.0), clamp(foam, 0.0, 1.0) * 0.9);
        alpha = max(alpha, clamp(foam, 0.0, 1.0) * 0.9);

        // shading from palms & hut onto the water
        float sh = worldData(p).b;
        col *= 1.0 - sh * 0.35 * uShade;
        col += pointLights(vWorld, vec3(0.0, 1.0, 0.0)) * 0.6 * uNight;

        gl_FragColor = vec4(applyFog(col, vWorld), alpha);
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}
