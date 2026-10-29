// Time of day (dawn, morning, noon, afternoon, evening, night) and weather
// (clear / rain). Drives every lighting uniform: sun and moon, sky gradient,
// fog, cloud colours, painted shadows, plus the rain streaks and splashes.
import * as THREE from 'three';
import { globals, heldLight } from './shaders.js';
import { skyU } from './sky.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
// colour keys over the 24 h clock: light colour, sky / ground ambient, sky
// gradient, fog, clouds (lit side, shaded side), sunset glow strength
const KEYS = [
  { h: 0, sun: C(0.30, 0.38, 0.62), sky: C(0.17, 0.22, 0.40), gnd: C(0.08, 0.10, 0.16), zen: C(0.02, 0.04, 0.13), mid: C(0.04, 0.08, 0.22), hor: C(0.10, 0.16, 0.32), fog: C(0.07, 0.12, 0.25), cl: C(0.36, 0.42, 0.6), cs: C(0.2, 0.24, 0.4), glow: 0 },
  { h: 4.6, sun: C(0.30, 0.38, 0.62), sky: C(0.17, 0.22, 0.40), gnd: C(0.08, 0.10, 0.16), zen: C(0.02, 0.04, 0.13), mid: C(0.04, 0.08, 0.22), hor: C(0.10, 0.16, 0.32), fog: C(0.07, 0.12, 0.25), cl: C(0.36, 0.42, 0.6), cs: C(0.2, 0.24, 0.4), glow: 0 },
  { h: 5.6, sun: C(0.45, 0.32, 0.45), sky: C(0.30, 0.28, 0.48), gnd: C(0.16, 0.14, 0.2), zen: C(0.06, 0.10, 0.30), mid: C(0.22, 0.22, 0.48), hor: C(0.62, 0.42, 0.5), fog: C(0.45, 0.36, 0.48), cl: C(0.8, 0.55, 0.6), cs: C(0.42, 0.36, 0.55), glow: 0.8 },
  { h: 6.5, sun: C(1.0, 0.62, 0.40), sky: C(0.50, 0.46, 0.62), gnd: C(0.30, 0.25, 0.24), zen: C(0.14, 0.26, 0.6), mid: C(0.46, 0.52, 0.8), hor: C(1.0, 0.70, 0.52), fog: C(0.86, 0.72, 0.68), cl: C(1.0, 0.78, 0.66), cs: C(0.72, 0.6, 0.72), glow: 1 },
  { h: 8.5, sun: C(1.0, 0.92, 0.78), sky: C(0.55, 0.66, 0.86), gnd: C(0.36, 0.40, 0.30), zen: C(0.09, 0.35, 0.86), mid: C(0.23, 0.55, 0.97), hor: C(0.74, 0.89, 1.0), fog: C(0.74, 0.88, 1.0), cl: C(1, 1, 1), cs: C(1, 1, 1), glow: 0.1 },
  { h: 12, sun: C(1.0, 0.97, 0.88), sky: C(0.55, 0.68, 0.86), gnd: C(0.38, 0.42, 0.30), zen: C(0.08, 0.33, 0.86), mid: C(0.20, 0.53, 0.97), hor: C(0.70, 0.88, 1.0), fog: C(0.725, 0.878, 1.0), cl: C(1, 1, 1), cs: C(1, 1, 1), glow: 0 },
  { h: 15.5, sun: C(1.0, 0.94, 0.80), sky: C(0.56, 0.66, 0.84), gnd: C(0.38, 0.40, 0.28), zen: C(0.09, 0.32, 0.84), mid: C(0.22, 0.52, 0.95), hor: C(0.76, 0.88, 1.0), fog: C(0.75, 0.87, 1.0), cl: C(1, 0.98, 0.94), cs: C(0.97, 0.96, 0.98), glow: 0.1 },
  { h: 17.6, sun: C(1.0, 0.56, 0.30), sky: C(0.56, 0.44, 0.56), gnd: C(0.32, 0.24, 0.22), zen: C(0.12, 0.20, 0.52), mid: C(0.50, 0.44, 0.72), hor: C(1.0, 0.56, 0.34), fog: C(0.92, 0.62, 0.52), cl: C(1.0, 0.70, 0.52), cs: C(0.72, 0.5, 0.62), glow: 1 },
  { h: 18.7, sun: C(0.62, 0.32, 0.36), sky: C(0.34, 0.28, 0.46), gnd: C(0.18, 0.14, 0.18), zen: C(0.06, 0.09, 0.28), mid: C(0.24, 0.20, 0.44), hor: C(0.7, 0.36, 0.38), fog: C(0.42, 0.3, 0.42), cl: C(0.78, 0.48, 0.52), cs: C(0.4, 0.3, 0.48), glow: 0.9 },
  { h: 20, sun: C(0.30, 0.38, 0.62), sky: C(0.17, 0.22, 0.40), gnd: C(0.08, 0.10, 0.16), zen: C(0.02, 0.04, 0.13), mid: C(0.04, 0.08, 0.22), hor: C(0.10, 0.16, 0.32), fog: C(0.07, 0.12, 0.25), cl: C(0.36, 0.42, 0.6), cs: C(0.2, 0.24, 0.4), glow: 0 },
  { h: 24, sun: C(0.30, 0.38, 0.62), sky: C(0.17, 0.22, 0.40), gnd: C(0.08, 0.10, 0.16), zen: C(0.02, 0.04, 0.13), mid: C(0.04, 0.08, 0.22), hor: C(0.10, 0.16, 0.32), fog: C(0.07, 0.12, 0.25), cl: C(0.36, 0.42, 0.6), cs: C(0.2, 0.24, 0.4), glow: 0 },
];
const RAIN_GREY = { sun: C(0.55, 0.58, 0.64), zen: C(0.38, 0.44, 0.52), mid: C(0.50, 0.56, 0.63), hor: C(0.66, 0.70, 0.75), fog: C(0.62, 0.67, 0.72), cl: C(0.72, 0.75, 0.8), cs: C(0.46, 0.5, 0.58) };

export const PERIODS = [
  [5, 'Aube', '🌅'], [7.5, 'Matin', '🌤'], [11, 'Midi', '☀️'], [14, 'Après-midi', '🌞'], [17, 'Soir', '🌇'], [19.5, 'Nuit', '🌙'],
];
export function periodOf(h) {
  let p = PERIODS[PERIODS.length - 1];
  for (const q of PERIODS) if (h >= q[0]) p = q;
  return h < PERIODS[0][0] ? PERIODS[PERIODS.length - 1] : p;
}
export const fmtHour = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- rain
function buildRain() {
  const N = 2600, BOX = 26, H = 16;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 4);
  for (let i = 0; i < N; i++) {
    const s = [Math.random() * BOX, Math.random() * BOX, Math.random(), Math.random()];
    for (let e = 0; e < 2; e++) { seed.set(s, (i * 2 + e) * 4); pos[(i * 2 + e) * 3 + 1] = e; }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: globals.uTime, uCamPos: globals.uCamPos, uRain: globals.uRain, uCol: { value: new THREE.Color() } },
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uRain; uniform vec3 uCamPos; varying float vA;
      void main() {
        const float BOX = ${BOX}.0, H = ${H}.0;
        vec2 xz = mod(aSeed.xy - uCamPos.xz + BOX * 0.5, BOX) - BOX * 0.5 + uCamPos.xz;
        xz += vec2(0.18, 0.09) * position.y * 0.45;  // a little wind slant
        float y = uCamPos.y + H * 0.5 - mod(uTime * (13.0 + aSeed.w * 5.0) + aSeed.z * H, H);
        y += position.y * 0.55;
        vA = step(aSeed.z, uRain) * (0.35 + position.y * 0.45);
        gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, y, xz.y, 1.0);
      }`,
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uCol, vA * 0.55); }',
  }));
  rain.frustumCulled = false;
  rain.renderOrder = 6;

  // splashes: tiny square bursts on the ground (or water) around the player
  const SN = 700;
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(SN * 3), ss = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) ss.set([Math.random() * 18, Math.random() * 18, Math.random()], i * 3);
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 3));
  const splash = new THREE.Points(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ...globals, uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute vec3 aSeed; uniform float uTime, uRain, uScale, uWorldSize, uWaterLevel; uniform vec3 uCamPos; uniform sampler2D uWorldTex;
      varying float vA;
      void main() {
        float t = fract(uTime * 1.7 + aSeed.z * 7.0);
        float cyc = floor(uTime * 1.7 + aSeed.z * 7.0);
        vec2 j = fract(vec2(cyc * 0.618, cyc * 0.414) + aSeed.xy * 0.37) * 18.0;
        vec2 xz = mod(j - uCamPos.xz + 9.0, 18.0) - 9.0 + uCamPos.xz;
        vec2 uv = (xz + uWorldSize * 0.5) / uWorldSize;
        float h = max(texture2D(uWorldTex, uv).r, uWaterLevel);
        vA = (1.0 - t) * step(aSeed.z, uRain) * step(t, 0.35);
        vec4 mv = viewMatrix * vec4(xz.x, h + 0.04 + t * 0.12, xz.y, 1.0);
        gl_PointSize = (0.05 + t * 0.07) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'varying float vA; void main() { if (vA < 0.02) discard; gl_FragColor = vec4(0.88, 0.94, 1.0, vA * 0.8); }',
  }));
  splash.frustumCulled = false;
  splash.renderOrder = 6;
  const group = new THREE.Group();
  group.add(rain, splash);
  group.userData = { rain, splash };
  return group;
}

// ---------------------------------------------------------------- cycle
export class DayCycle {
  constructor(scene, { hour = 9.5, speed = 'normal', weather = 'auto' } = {}) {
    this.hour = hour;
    this.speed = speed;     // normal (24 min / day) | slow (48 min) | frozen
    this.weather = weather; // auto | clear | rain
    this.rain = 0;          // current intensity
    this.wet = 0;
    this.raining = false;
    this.nextWeather = 1.5 + Math.random() * 3; // game hours until the weather may change
    this.rainFx = buildRain();
    scene.add(this.rainFx);
    this.shadowDir = new THREE.Vector3();
    this.onShadowDir = null;
    this.tmp = { sun: new THREE.Vector3(), moon: new THREE.Vector3(), light: new THREE.Vector3() };
    this.apply();
  }

  get period() { return periodOf(this.hour); }
  get isNight() { return this.hour >= 19.5 || this.hour < 5.3; }

  // game hours per real second
  rate() {
    if (this.speed === 'frozen') return 0;
    const base = 24 / (this.speed === 'slow' ? 48 * 60 : 24 * 60);
    return base * (this.isNight ? 1.7 : 1); // short, cosy nights
  }

  update(dt, camera, renderer) {
    const prevH = this.hour;
    this.hour = (this.hour + dt * this.rate()) % 24;
    // weather: every few game hours, maybe start or stop a shower
    if (this.weather === 'auto') {
      this.nextWeather -= ((this.hour - prevH + 24) % 24);
      if (this.nextWeather <= 0) {
        this.raining = !this.raining && Math.random() < 0.38;
        this.nextWeather = this.raining ? 0.8 + Math.random() * 1.8 : 2.5 + Math.random() * 4;
      }
    } else this.raining = this.weather === 'rain';
    const target = this.raining ? 1 : 0;
    this.rain += Math.sign(target - this.rain) * Math.min(Math.abs(target - this.rain), dt / 12);
    this.wet = Math.max(0, Math.min(1, this.wet + (this.rain > 0.3 ? dt / 25 : -dt / 90)));
    this.apply();
    if (renderer) this.rainFx.userData.splash.material.uniforms.uScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y * 0.5;
  }

  apply() {
    const h = this.hour;
    let i = 0;
    while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = (h - a.h) / (b.h - a.h || 1);
    const k = t * t * (3 - 2 * t);
    const lerp = (key) => a[key].clone().lerp(b[key], k);
    const rain = this.rain;

    // sun and moon paths: rise in the east (+x), set in the west, a bit to the south (-z)
    const { sun, moon, light } = this.tmp;
    const az = Math.PI * (h - 6) / 12;
    sun.set(Math.cos(az), Math.sin(az) * 0.86, -Math.sin(az) * 0.42 - 0.18).normalize();
    const maz = Math.PI * (h - 18) / 12;
    moon.set(Math.cos(maz) * 0.9, Math.sin(maz) * 0.8, -Math.sin(maz) * 0.35 + 0.2).normalize();
    skyU.uSunPos.value.copy(sun);
    skyU.uMoonPos.value.copy(moon);
    // the main light follows the sun by day and the moon by night, passing
    // overhead during the switch so it never comes from under the ground
    const wSun = THREE.MathUtils.smoothstep(sun.y, -0.1, 0.1);
    light.copy(moon).multiplyScalar(1 - wSun).addScaledVector(sun, wSun);
    light.y += 0.6 * (1 - Math.abs(2 * wSun - 1));
    light.y = Math.max(light.y, 0.2);
    light.normalize();
    globals.uSunDir.value.copy(light);

    const night = 1 - THREE.MathUtils.smoothstep(Math.max(sun.y, -0.3), -0.18, 0.08);
    globals.uNight.value = night;

    const sunCol = lerp('sun');
    const dim = 1 - rain * 0.62;
    sunCol.lerp(RAIN_GREY.sun.clone().multiplyScalar(0.5 + 0.5 * (1 - night)), rain * 0.6).multiplyScalar(dim);
    globals.uSunColor.value.copy(sunCol);
    // the lagoon mirrors the actual disc: sun while it is up, then the moon
    if (sun.y > -0.03) {
      globals.uGlintDir.value.copy(sun);
      globals.uGlintCol.value.copy(lerp('sun')).lerp(new THREE.Color(1, 0.9, 0.7), 0.3).multiplyScalar(THREE.MathUtils.smoothstep(sun.y, -0.03, 0.04) * 1.15 * (1 - rain * 0.85));
    } else {
      globals.uGlintDir.value.copy(moon);
      globals.uGlintCol.value.setRGB(0.55, 0.65, 0.85).multiplyScalar(THREE.MathUtils.smoothstep(moon.y, 0.0, 0.1) * 0.8 * (1 - rain * 0.85));
    }
    const sky = lerp('sky'), gnd = lerp('gnd');
    sky.lerp(new THREE.Color(0.5, 0.56, 0.64).multiplyScalar(1 - night * 0.7), rain * 0.5);
    globals.uSkyAmb.value.copy(sky);
    globals.uGroundAmb.value.copy(gnd.multiplyScalar(1 - rain * 0.15));

    const dayK = 1 - night * 0.75;
    for (const [u, key] of [[skyU.uZenith, 'zen'], [skyU.uMid, 'mid'], [skyU.uHorizon, 'hor'], [globals.uFogColor, 'fog'], [skyU.uCloudCol, 'cl'], [skyU.uCloudShade, 'cs']]) {
      const c = lerp(key);
      u.value.copy(c.lerp(RAIN_GREY[key].clone().multiplyScalar(dayK), rain * 0.75));
    }
    skyU.uSunTint.value.copy(lerp('sun')).lerp(new THREE.Color(1, 0.95, 0.8), 0.4);
    skyU.uGlow.value.setRGB(1.0, 0.5, 0.3);
    skyU.uGlowK.value = (a.glow + (b.glow - a.glow) * k) * (1 - rain * 0.8);
    skyU.uOvercast.value = rain * 0.85;
    globals.uFogDensity.value = 0.0042 + rain * 0.0075 + night * 0.0012;
    globals.uShade.value = Math.max(0, 1 - night * 0.85 - rain * 0.65) * THREE.MathUtils.smoothstep(sun.y, 0.0, 0.25) + 0.15 * (1 - night);
    globals.uRain.value = rain;
    globals.uWet.value = this.wet;
    this.rainFx.userData.rain.material.uniforms.uCol.value.copy(sky).lerp(new THREE.Color(0.85, 0.9, 1), 0.5);
    this.rainFx.visible = rain > 0.01;

    // held items: ambient + direct light reaching the hands (normalised to noon)
    heldLight.value.copy(sky).multiplyScalar(0.62).add(sunCol.clone().multiplyScalar(0.78))
      .multiply(new THREE.Color(1 / (0.55 * 0.62 + 0.78), 1 / (0.68 * 0.62 + 0.97 * 0.78), 1 / (0.86 * 0.62 + 0.88 * 0.78)));

    // re-paint canopy shadows when the light has moved enough
    if (this.onShadowDir && (this.shadowDir.lengthSq() === 0 || this.shadowDir.angleTo(light) > 0.09)) {
      this.shadowDir.copy(light);
      this.onShadowDir(light);
    }
  }
}
